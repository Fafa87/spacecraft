import type { AssetManifest, SoundBus, SoundEntry } from '@sms/shared';
import { SOUND_BUSES } from '@sms/shared';
import { storage } from '../util/storage.js';
import {
  busOf,
  chooseSteal,
  DEFAULT_SPATIAL,
  loadVolumes,
  pickVariant,
  spatialize,
  type MixChannel,
  type MixVolumes,
  type SpatialOpts,
  type VoiceInfo,
} from './mixer.js';

interface Voice extends VoiceInfo {
  src: AudioBufferSourceNode;
}

interface LoopVoice {
  key: string;
  src: AudioBufferSourceNode;
  gain: GainNode;
  pan: StereoPannerNode;
  lastSeen: number;
  /** One-shot played when a sustained loop is released. */
  end?: string;
  x?: number;
  y?: number;
}

export interface PlayOpts {
  x?: number;
  y?: number;
  volume?: number;
  rate?: number;
  /** Floor for distance attenuation (offscreen warnings such as breach telegraphs stay audible). */
  minVolume?: number;
  /** Overrides the manifest priority for voice stealing. */
  priority?: number;
}

const MAX_VOICES = 32;
const VOL_KEY = 'sms.vol';
/** A sustained loop is released when no `sustain()` call refreshed it for this long. */
const SUSTAIN_HOLD = 0.22;

/**
 * WebAudio mixer for the generated SFX + music.
 *
 * Graph: voice → gain → panner → bus (weapons | enemies | ambience | ui) → SFX compressor →
 * master; music → music bus → master. Bus levels are user sliders persisted in localStorage.
 * A global voice cap with priority stealing keeps hordes from drowning out the guns, random
 * variants avoid machine-gun repetition, and sounds flagged `duck` dip the music.
 * The context is created on the first user gesture (browser autoplay rules).
 */
export class AudioEngine {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private buses = new Map<SoundBus | 'music', GainNode>();
  private duckGain: GainNode | null = null;
  private buffers = new Map<string, AudioBuffer>();
  private loading = new Map<string, Promise<AudioBuffer | null>>();
  private voices: Voice[] = [];
  private loops = new Map<string, LoopVoice>();
  private lastVariant = new Map<string, number>();
  private duckUntil = 0;
  private music: {
    key: string;
    src: AudioBufferSourceNode;
    gain: GainNode;
    /** Adaptive stems (manifest `layerOf` this track), sample-locked to `src`. */
    layers: Array<{ src: AudioBufferSourceNode; gain: GainNode; volume: number }>;
  } | null = null;
  /** 0..1 combat intensity: level of the adaptive stems. */
  private musicIntensity = 0;
  private wantedMusic: string | null = null;
  muted = storage.get('sms.muted', false);
  volumes: MixVolumes = loadVolumes(storage.get<unknown>(VOL_KEY, null));
  /** Listener position (camera centre) for attenuation and panning. */
  listener = { x: 0, y: 0 };
  spatial: SpatialOpts = { ...DEFAULT_SPATIAL };

  constructor(
    private manifest: AssetManifest | null,
    private baseUrl: string,
  ) {
    const unlock = () => {
      this.ensureContext();
      void this.ctx?.resume();
    };
    for (const ev of ['pointerdown', 'keydown'])
      window.addEventListener(ev, unlock, { capture: true });
  }

  private ensureContext(): void {
    if (this.ctx || !this.manifest) return;
    const Ctor =
      window.AudioContext ??
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return;
    const ctx = new Ctor();
    this.ctx = ctx;
    this.master = ctx.createGain();
    this.master.connect(ctx.destination);
    // Glue compressor on the SFX sum: dense fights stay loud without clipping.
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -14;
    comp.knee.value = 8;
    comp.ratio.value = 4;
    comp.attack.value = 0.004;
    comp.release.value = 0.18;
    comp.connect(this.master);
    for (const bus of SOUND_BUSES) {
      const g = ctx.createGain();
      g.connect(comp);
      this.buses.set(bus, g);
    }
    this.duckGain = ctx.createGain();
    this.duckGain.connect(this.master);
    const music = ctx.createGain();
    music.connect(this.duckGain);
    this.buses.set('music', music);
    this.applyVolumes(true);
    this.preload();
    if (this.wantedMusic) this.playMusic(this.wantedMusic);
  }

  /** First variant of every sound right away, the remaining variants in the background. */
  private preload(): void {
    const sounds = Object.values(this.manifest!.sounds);
    const rest: string[] = [];
    for (const s of sounds) {
      const files = variantsOf(s);
      void this.buffer(files[0]);
      rest.push(...files.slice(1));
    }
    let i = 0;
    const next = () => {
      const batch = rest.slice(i, i + 6);
      i += 6;
      if (batch.length) void Promise.all(batch.map((f) => this.buffer(f))).then(next);
    };
    setTimeout(next, 1500);
  }

  private buffer(file: string): Promise<AudioBuffer | null> {
    const cached = this.buffers.get(file);
    if (cached) return Promise.resolve(cached);
    let p = this.loading.get(file);
    if (!p) {
      p = fetch(this.baseUrl + file)
        .then((r) => r.arrayBuffer())
        .then((ab) => this.ctx!.decodeAudioData(ab))
        .then((buf) => (this.buffers.set(file, buf), buf))
        .catch(() => null);
      this.loading.set(file, p);
    }
    return p;
  }

  private applyVolumes(instant = false): void {
    if (!this.ctx || !this.master) return;
    const t = this.ctx.currentTime;
    const set = (g: AudioParam, v: number) =>
      instant ? (g.value = v) : g.setTargetAtTime(v, t, 0.04);
    set(this.master.gain, this.muted ? 0 : this.volumes.master);
    for (const [bus, g] of this.buses) set(g.gain, this.volumes[bus]);
  }

  setVolume(ch: MixChannel, v: number): void {
    this.volumes[ch] = Math.max(0, Math.min(1, v));
    storage.set(VOL_KEY, this.volumes);
    this.applyVolumes();
  }

  /** Slider bindings for the menu's SOUND MIX panel. */
  mixerControls(): {
    volumes: MixVolumes;
    setVolume(ch: MixChannel, v: number): void;
    preview(ch: MixChannel): void;
  } {
    return {
      volumes: this.volumes,
      setVolume: (ch, v) => this.setVolume(ch, v),
      preview: (ch) => {
        const sample: Partial<Record<MixChannel, string>> = {
          master: 'shoot_bolt_rifle',
          weapons: 'shoot_heavy_bolter',
          enemies: 'horma_shriek',
          ui: 'ui_click',
        };
        const key = sample[ch];
        if (key) this.play(key, { volume: 0.8 });
      },
    };
  }

  toggleMute(): boolean {
    this.muted = !this.muted;
    storage.set('sms.muted', this.muted);
    this.applyVolumes();
    return this.muted;
  }

  private get running(): boolean {
    return !!this.ctx && this.ctx.state === 'running';
  }

  /** Picks a loaded variant (random, no immediate repeats). */
  private pickBuffer(key: string, def: SoundEntry): AudioBuffer | null {
    const files = variantsOf(def);
    const loaded = files.map((_, i) => i).filter((i) => this.buffers.has(files[i]));
    if (!loaded.length) return null;
    const last = this.lastVariant.get(key) ?? -1;
    const li = loaded.indexOf(last);
    const idx = loaded[pickVariant(loaded.length, li, Math.random())];
    this.lastVariant.set(key, idx);
    return this.buffers.get(files[idx])!;
  }

  private place(x: number | undefined, y: number | undefined): { gain: number; pan: number } {
    if (x === undefined || y === undefined) return { gain: 1, pan: 0 };
    return spatialize(x - this.listener.x, y - this.listener.y, this.spatial);
  }

  /** Plays a one-shot. Pass a world position for distance attenuation + stereo pan. */
  play(key: string, opts: PlayOpts = {}): void {
    const def = this.manifest?.sounds[key];
    if (!def || !this.running) return;
    const ctx = this.ctx!;
    const sp = this.place(opts.x, opts.y);
    if (opts.minVolume !== undefined) sp.gain = Math.max(sp.gain, opts.minVolume);
    const vol = def.volume * (opts.volume ?? 1) * sp.gain;
    if (vol < 0.008) return;
    const buf = this.pickBuffer(key, def);
    if (!buf) return;
    const now = ctx.currentTime;
    this.voices = this.voices.filter((v) => v.ends > now);
    // quieter (distant) copies lose priority so nearby action wins
    const priority = (opts.priority ?? def.priority ?? 5) - (1 - sp.gain) * 2;
    const steal = chooseSteal(this.voices, { key, priority, maxVoices: def.maxVoices }, MAX_VOICES);
    if (!steal) return;
    for (const v of steal) {
      try {
        v.src.stop();
      } catch {
        /* already stopped */
      }
      this.voices.splice(this.voices.indexOf(v), 1);
    }
    const src = ctx.createBufferSource();
    src.buffer = buf;
    const rate = (opts.rate ?? 1) * (0.96 + Math.random() * 0.08);
    src.playbackRate.value = rate;
    const gain = ctx.createGain();
    gain.gain.value = vol;
    const panner = ctx.createStereoPanner();
    panner.pan.value = sp.pan;
    src
      .connect(gain)
      .connect(panner)
      .connect(this.buses.get(busOf(def.bus))!);
    src.start();
    this.voices.push({ key, priority, started: now, ends: now + buf.duration / rate, src });
    if (def.duck) this.duck(def.duck * Math.min(1, sp.gain + 0.3), buf.duration);
  }

  /** Dips the music for big moments (explosions, Carnifex roar). */
  private duck(amount: number, dur: number): void {
    if (!this.ctx || !this.duckGain) return;
    const t = this.ctx.currentTime;
    const g = this.duckGain.gain;
    g.cancelScheduledValues(t);
    g.setTargetAtTime(Math.max(0.15, 1 - amount), t, 0.03);
    this.duckUntil = Math.max(this.duckUntil, t + Math.min(1.2, dur * 0.6));
    g.setTargetAtTime(1, this.duckUntil, 0.45);
  }

  private startLoop(
    id: string,
    key: string,
    level: number,
    x?: number,
    y?: number,
  ): LoopVoice | null {
    const def = this.manifest?.sounds[key];
    if (!def || !this.running) return null;
    const buf = this.pickBuffer(key, def);
    if (!buf) return null;
    const ctx = this.ctx!;
    const src = ctx.createBufferSource();
    src.buffer = buf;
    src.loop = true;
    const gain = ctx.createGain();
    gain.gain.value = 0;
    const pan = ctx.createStereoPanner();
    src
      .connect(gain)
      .connect(pan)
      .connect(this.buses.get(busOf(def.bus))!);
    // random start offset so stacked loops don't phase
    src.start(0, Math.random() * buf.duration);
    const lv: LoopVoice = { key, src, gain, pan, lastSeen: ctx.currentTime, x, y };
    this.loops.set(id, lv);
    this.levelLoop(lv, level, 0.06);
    return lv;
  }

  private levelLoop(lv: LoopVoice, level: number, tc = 0.15): void {
    const def = this.manifest!.sounds[lv.key];
    const sp = this.place(lv.x, lv.y);
    const t = this.ctx!.currentTime;
    lv.gain.gain.setTargetAtTime(def.volume * level * sp.gain, t, tc);
    lv.pan.pan.setTargetAtTime(sp.pan, t, 0.1);
  }

  private stopLoop(id: string, fade = 0.12): void {
    const lv = this.loops.get(id);
    if (!lv || !this.ctx) return;
    this.loops.delete(id);
    const t = this.ctx.currentTime;
    lv.gain.gain.cancelScheduledValues(t);
    lv.gain.gain.setTargetAtTime(0, t, fade / 3);
    lv.src.stop(t + fade * 2 + 0.05);
    if (lv.end) this.play(lv.end, { x: lv.x, y: lv.y });
  }

  /**
   * Keeps a held sound going (flamer stream): call every time the weapon fires. The first
   * call plays `start` and fades the loop in; once calls stop for ~0.2 s `update()` fades the
   * loop and plays `end`.
   */
  sustain(
    id: string,
    s: { start?: string; loop: string; end?: string },
    x?: number,
    y?: number,
    level = 1,
  ): void {
    if (!this.running) return;
    let lv = this.loops.get(id);
    if (!lv) {
      if (s.start) this.play(s.start, { x, y });
      lv = this.startLoop(id, s.loop, level, x, y) ?? undefined;
      if (!lv) return;
      lv.end = s.end;
    }
    lv.lastSeen = this.ctx!.currentTime;
    lv.x = x;
    lv.y = y;
    this.levelLoop(lv, level, 0.05);
  }

  /**
   * Sets a continuous loop's level (0 stops it): swarm ambience by horde size, synapse drone
   * near a Warrior, plasma whine with heat. Position-less loops are not attenuated.
   */
  setLoop(id: string, key: string, level: number, x?: number, y?: number, rate = 1): void {
    if (!this.running) return;
    let lv = this.loops.get(id);
    if (level <= 0.001) {
      if (lv) this.stopLoop(id, 0.6);
      return;
    }
    if (!lv) lv = this.startLoop(id, key, level, x, y) ?? undefined;
    if (!lv) return;
    lv.lastSeen = Infinity; // never auto-released
    lv.x = x;
    lv.y = y;
    lv.src.playbackRate.setTargetAtTime(rate, this.ctx!.currentTime, 0.2);
    this.levelLoop(lv, level, 0.25);
  }

  /** Releases sustained loops whose source went quiet. Call once per frame. */
  update(): void {
    if (!this.ctx) return;
    const now = this.ctx.currentTime;
    for (const [id, lv] of this.loops) if (now - lv.lastSeen > SUSTAIN_HOLD) this.stopLoop(id);
  }

  /** Stops every loop (leaving a match). */
  stopLoops(): void {
    for (const id of [...this.loops.keys()]) this.stopLoop(id, 0.3);
  }

  /** Number of one-shot voices currently sounding (debug/tests). */
  get activeVoices(): number {
    const now = this.ctx?.currentTime ?? 0;
    return this.voices.filter((v) => v.ends > now).length + this.loops.size;
  }

  /**
   * Adaptive music: 0 = base track only, 1 = every `layerOf` stem at full level. The stems
   * start on the same audio clock tick as the base, so they stay sample-locked across loops.
   */
  setMusicIntensity(v: number): void {
    this.musicIntensity = Math.max(0, Math.min(1, v));
    if (!this.ctx || !this.music) return;
    for (const l of this.music.layers)
      l.gain.gain.setTargetAtTime(l.volume * this.musicIntensity, this.ctx.currentTime, 0.8);
  }

  /** Crossfades to a looping music track (no-op if already playing). */
  playMusic(key: string | null): void {
    this.wantedMusic = key;
    const musicBus = this.buses.get('music');
    if (!this.ctx || !musicBus || !this.manifest) return;
    if (this.music?.key === key) return;
    const fadeOut = this.music;
    this.music = null;
    if (fadeOut) {
      const t = this.ctx.currentTime;
      for (const n of [fadeOut, ...fadeOut.layers]) {
        n.gain.gain.setTargetAtTime(0, t, 0.4);
        n.src.stop(t + 2);
      }
    }
    const manifest = this.manifest;
    const def = key ? manifest.music[key] : undefined;
    if (!key || !def) return;
    const stems = Object.entries(manifest.music).filter(([, m]) => m.layerOf === key);
    void Promise.all([this.buffer(def.file), ...stems.map(([, m]) => this.buffer(m.file))]).then(
      ([buf, ...stemBufs]) => {
        if (!buf || !this.ctx || this.wantedMusic !== key || this.music) return;
        const ctx = this.ctx;
        const at = ctx.currentTime + 0.05;
        const start = (b: AudioBuffer, level: number) => {
          const src = ctx.createBufferSource();
          src.buffer = b;
          src.loop = def.loop;
          const gain = ctx.createGain();
          gain.gain.value = 0;
          gain.gain.setTargetAtTime(level, at, 0.6);
          src.connect(gain).connect(musicBus);
          src.start(at);
          return { src, gain };
        };
        const base = start(buf, def.volume);
        const layers = stems.flatMap(([, m], i) => {
          const b = stemBufs[i];
          if (!b) return [];
          return [{ ...start(b, m.volume * this.musicIntensity), volume: m.volume }];
        });
        this.music = { key, ...base, layers };
      },
    );
  }
}

function variantsOf(def: SoundEntry): string[] {
  return def.variants?.length ? def.variants : [def.file];
}
