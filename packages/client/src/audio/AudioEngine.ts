import type { AssetManifest } from '@sms/shared';
import { storage } from '../util/storage.js';

interface Voice {
  src: AudioBufferSourceNode;
  started: number;
}

/**
 * WebAudio playback for generated SFX + music. Buffers are decoded once.
 * The context is created on the first user gesture (browser autoplay rules).
 */
export class AudioEngine {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private sfxBus: GainNode | null = null;
  private musicBus: GainNode | null = null;
  private buffers = new Map<string, AudioBuffer>();
  private loading = new Map<string, Promise<AudioBuffer | null>>();
  private voices = new Map<string, Voice[]>();
  private music: { key: string; src: AudioBufferSourceNode; gain: GainNode } | null = null;
  private wantedMusic: string | null = null;
  muted = storage.get('sms.muted', false);
  /** Listener position for distance attenuation / panning. */
  listener = { x: 0, y: 0 };

  constructor(
    private manifest: AssetManifest | null,
    private baseUrl: string,
  ) {
    const unlock = () => {
      this.ensureContext();
      void this.ctx?.resume();
    };
    for (const ev of ['pointerdown', 'keydown']) window.addEventListener(ev, unlock, { capture: true });
  }

  private ensureContext(): void {
    if (this.ctx || !this.manifest) return;
    const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return;
    this.ctx = new Ctor();
    this.master = this.ctx.createGain();
    this.master.gain.value = this.muted ? 0 : 1;
    this.master.connect(this.ctx.destination);
    this.sfxBus = this.ctx.createGain();
    this.sfxBus.gain.value = 0.8;
    this.sfxBus.connect(this.master);
    this.musicBus = this.ctx.createGain();
    this.musicBus.gain.value = 0.6;
    this.musicBus.connect(this.master);
    // Preload all SFX in the background.
    for (const key of Object.keys(this.manifest.sounds)) void this.buffer(`sfx:${key}`, this.manifest.sounds[key].file);
    if (this.wantedMusic) this.playMusic(this.wantedMusic);
  }

  private buffer(id: string, file: string): Promise<AudioBuffer | null> {
    const cached = this.buffers.get(id);
    if (cached) return Promise.resolve(cached);
    let p = this.loading.get(id);
    if (!p) {
      p = fetch(this.baseUrl + file)
        .then((r) => r.arrayBuffer())
        .then((ab) => this.ctx!.decodeAudioData(ab))
        .then((buf) => (this.buffers.set(id, buf), buf))
        .catch(() => null);
      this.loading.set(id, p);
    }
    return p;
  }

  toggleMute(): boolean {
    this.muted = !this.muted;
    storage.set('sms.muted', this.muted);
    if (this.master && this.ctx) this.master.gain.setTargetAtTime(this.muted ? 0 : 1, this.ctx.currentTime, 0.05);
    return this.muted;
  }

  /** Plays a one-shot. Pass a world position for distance attenuation + stereo pan. */
  play(key: string, opts: { x?: number; y?: number; volume?: number; rate?: number } = {}): void {
    const def = this.manifest?.sounds[key];
    if (!def || !this.ctx || !this.sfxBus || this.ctx.state !== 'running') return;
    const buf = this.buffers.get(`sfx:${key}`);
    if (!buf) return;
    let vol = def.volume * (opts.volume ?? 1);
    let pan = 0;
    if (opts.x !== undefined && opts.y !== undefined) {
      const dx = opts.x - this.listener.x;
      const dy = opts.y - this.listener.y;
      const d = Math.hypot(dx, dy);
      vol *= Math.max(0, 1 - d / 1400);
      pan = Math.max(-0.8, Math.min(0.8, dx / 700));
      if (vol < 0.01) return;
    }
    const now = this.ctx.currentTime;
    const list = (this.voices.get(key) ?? []).filter((v) => now - v.started < buf.duration);
    if (list.length >= def.maxVoices) {
      const oldest = list.shift()!;
      try {
        oldest.src.stop();
      } catch {
        /* already stopped */
      }
    }
    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    src.playbackRate.value = (opts.rate ?? 1) * (0.94 + Math.random() * 0.12);
    const gain = this.ctx.createGain();
    gain.gain.value = vol;
    const panner = this.ctx.createStereoPanner();
    panner.pan.value = pan;
    src.connect(gain).connect(panner).connect(this.sfxBus);
    src.start();
    list.push({ src, started: now });
    this.voices.set(key, list);
  }

  /** Crossfades to a looping music track (no-op if already playing). */
  playMusic(key: string | null): void {
    this.wantedMusic = key;
    if (!this.ctx || !this.musicBus || !this.manifest) return;
    if (this.music?.key === key) return;
    const fadeOut = this.music;
    this.music = null;
    if (fadeOut) {
      const t = this.ctx.currentTime;
      fadeOut.gain.gain.setTargetAtTime(0, t, 0.4);
      fadeOut.src.stop(t + 2);
    }
    const def = key ? this.manifest.music[key] : undefined;
    if (!key || !def) return;
    void this.buffer(`music:${key}`, def.file).then((buf) => {
      if (!buf || !this.ctx || this.wantedMusic !== key || this.music) return;
      const src = this.ctx.createBufferSource();
      src.buffer = buf;
      src.loop = def.loop;
      const gain = this.ctx.createGain();
      gain.gain.value = 0;
      gain.gain.setTargetAtTime(def.volume, this.ctx.currentTime, 0.6);
      src.connect(gain).connect(this.musicBus!);
      src.start();
      this.music = { key, src, gain };
    });
  }
}
