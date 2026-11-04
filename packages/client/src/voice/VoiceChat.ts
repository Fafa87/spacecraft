import Peer, { type MediaConnection, type PeerOptions } from 'peerjs';
import {
  clampVolume,
  DEFAULT_MAX_SLOTS,
  callTargets,
  rms,
  slotOf,
  transmitting,
  tuneOpus,
  unavailablePeerOf,
  updateSpeaking,
  voicePeerId,
  type MicMode,
  type SpeakingState,
} from './core.js';

export interface VoiceChatOptions {
  roomCode: string;
  /** Callsign shown to the others (sent as call metadata). */
  name: string;
  peerOptions: PeerOptions;
  maxSlots?: number;
  mode?: MicMode;
  /** Opus average bitrate (bit/s). */
  bitrate?: number;
  /**
   * 'webaudio' (default): remote audio → GainNode (per-peer volume works on iOS too, where
   * HTMLMediaElement.volume is read-only). 'element': plain <audio> playback (fallback).
   */
  playback?: 'webaudio' | 'element';
  /** How often absent slots are re-called (ms); 0 disables. */
  rescanMs?: number;
}

export interface VoicePeerInfo {
  id: string;
  slot: number;
  name: string;
  speaking: boolean;
  level: number;
  volume: number;
  state: 'connecting' | 'connected';
}

export type VoiceState = 'idle' | 'starting' | 'live' | 'stopped';

interface Remote {
  id: string;
  slot: number;
  name: string;
  call: MediaConnection;
  outgoing: boolean;
  stream?: MediaStream;
  audio?: HTMLAudioElement;
  source?: MediaStreamAudioSourceNode;
  gain?: GainNode;
  analyser?: AnalyserNode;
  volume: number;
  speak: SpeakingState;
  level: number;
  /** ICE/DTLS is up (the 'stream' event fires before that). */
  linked: boolean;
}

type Listener = () => void;

/**
 * Prototype WebRTC voice chat for a P2P room, fully separate from the game connection: its
 * own PeerJS Peer (same signalling server and TURN config), a full mesh of
 * MediaConnections, push-to-talk / open mic, per-peer volume and speaking indicators.
 *
 * `start()` must run inside a user gesture (tap/click): iOS Safari only grants the mic and
 * unlocks audio playback from one.
 */
export class VoiceChat {
  state: VoiceState = 'idle';
  slot = 0;
  mode: MicMode;
  muted = false;
  pttDown = false;
  /** Set when the mic was denied/unavailable: we still listen. */
  listenOnly = false;
  error = '';
  localSpeaking = false;
  localLevel = 0;

  private peer: Peer | null = null;
  private ctx: AudioContext | null = null;
  private local: MediaStream | null = null;
  private localAnalyser: AnalyserNode | null = null;
  private localSpeak: SpeakingState = { speaking: false, lastLoud: 0 };
  private readonly remotes = new Map<string, Remote>();
  private readonly volumes = new Map<string, number>();
  private timers: ReturnType<typeof setInterval>[] = [];
  private listeners = new Set<Listener>();
  private buf = new Float32Array(1024);

  constructor(private readonly o: VoiceChatOptions) {
    this.mode = o.mode ?? 'ptt';
  }

  on(cb: Listener): () => void {
    this.listeners.add(cb);
    return () => this.listeners.delete(cb);
  }

  private changed(): void {
    for (const cb of this.listeners) cb();
  }

  async start(): Promise<void> {
    if (this.state !== 'idle') return;
    this.state = 'starting';
    this.changed();
    // Create/resume the AudioContext synchronously inside the gesture (iOS autoplay rules).
    const Ctx: typeof AudioContext =
      window.AudioContext ??
      (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    this.ctx = new Ctx();
    void this.ctx.resume();
    try {
      this.local = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
          channelCount: 1,
        },
        video: false,
      });
    } catch (e) {
      // Denied / no mic / insecure origin: join listen-only with a silent track.
      console.warn('[voice] no microphone, listen-only', e);
      this.listenOnly = true;
      this.error =
        (e as Error)?.name === 'NotAllowedError' ? 'Brak zgody na mikrofon' : 'Brak mikrofonu';
      this.local = this.ctx.createMediaStreamDestination().stream;
    }
    if ((this.state as VoiceState) !== 'starting') return this.release(); // stopped meanwhile
    if (!this.listenOnly) {
      const src = this.ctx.createMediaStreamSource(this.local);
      this.localAnalyser = this.ctx.createAnalyser();
      this.localAnalyser.fftSize = 1024;
      src.connect(this.localAnalyser);
    }
    this.applyTransmit();
    try {
      this.peer = await this.claimSlot();
    } catch (e) {
      this.error = 'Brak połączenia z serwerem parowania';
      console.warn('[voice] could not register', e);
      this.stop();
      return;
    }
    if ((this.state as VoiceState) !== 'starting') return void this.peer.destroy();
    this.state = 'live';
    this.peer.on('call', (c) => this.onIncoming(c));
    this.peer.on('connection', (dc) => {
      const meta = (dc.metadata ?? {}) as { name?: string; voiceName?: number };
      const r = this.remotes.get(dc.peer);
      if (meta.voiceName && r && meta.name) {
        r.name = String(meta.name).slice(0, 24);
        this.changed();
      }
      dc.on('open', () => setTimeout(() => dc.close(), 2000));
    });
    this.peer.on('error', (err) => {
      const type = (err as { type?: string }).type;
      if (type === 'peer-unavailable') {
        const id = unavailablePeerOf(String((err as Error).message ?? ''));
        // Only drop a still-pending call (the signalling server reports it ~5 s later).
        if (id && !this.remotes.get(id)?.stream) this.drop(id, true, 'unavailable');
        return;
      }
      console.warn('[voice] peer error', type, err);
    });
    this.peer.on('disconnected', () => {
      // Lost the signalling server (e.g. phone locked): media keeps flowing, but newcomers
      // can't find us until we re-register.
      setTimeout(
        () => this.peer && !this.peer.destroyed && this.peer.disconnected && this.peer.reconnect(),
        1000,
      );
    });
    this.scan();
    const rescan = this.o.rescanMs ?? 5000;
    if (rescan > 0) this.timers.push(setInterval(() => this.scan(), rescan));
    this.timers.push(setInterval(() => this.meter(), 100));
    this.changed();
  }

  /** Registers the first free `sms-voice-v1-<room>-<n>` id. */
  private async claimSlot(): Promise<Peer> {
    const max = this.o.maxSlots ?? DEFAULT_MAX_SLOTS;
    for (let n = 1; n <= max; n++) {
      const got = await new Promise<Peer | 'taken'>((resolve, reject) => {
        const p = new Peer(voicePeerId(this.o.roomCode, n), this.o.peerOptions);
        const t = setTimeout(() => (p.destroy(), reject(new Error('signalling timeout'))), 10000);
        p.once('open', () => (clearTimeout(t), resolve(p)));
        p.once('error', (err) => {
          clearTimeout(t);
          p.destroy();
          if ((err as { type?: string }).type === 'unavailable-id') resolve('taken');
          else reject(err);
        });
      });
      if (got !== 'taken') {
        this.slot = n;
        return got;
      }
    }
    throw new Error('voice room full');
  }

  /**
   * Calls every LOWER slot we have no connection with (absent ones fail quietly). Only the
   * higher slot ever calls, so two players never call each other at once (no glare); a
   * newcomer that reuses a freed low slot is found by the higher slots' periodic rescan.
   */
  private scan(): void {
    if (!this.peer || this.peer.disconnected || !this.local) return;
    for (const id of callTargets(this.o.roomCode, this.slot)) {
      if (this.remotes.has(id)) continue;
      const call = this.peer.call(id, this.local, {
        metadata: { name: this.o.name, slot: this.slot },
        sdpTransform: (sdp: string) => tuneOpus(sdp, this.o.bitrate),
      });
      if (call) this.track(id, call, true);
    }
  }

  private onIncoming(call: MediaConnection): void {
    const slot = slotOf(this.o.roomCode, call.peer);
    if (!slot || !this.local) return call.close();
    // A re-call from the same player (it reloaded, or its old connection died): replace.
    if (this.remotes.has(call.peer)) this.drop(call.peer, false, 'replaced');
    call.answer(this.local, { sdpTransform: (sdp: string) => tuneOpus(sdp, this.o.bitrate) });
    this.track(call.peer, call, false);
    // MediaConnection is one-way metadata only: tell the caller our callsign with a tiny
    // short-lived DataConnection on the VOICE Peer (never on the game's Peer).
    const dc = this.peer?.connect(call.peer, { metadata: { name: this.o.name, voiceName: 1 } });
    dc?.on('open', () => setTimeout(() => dc.close(), 2000));
  }

  private track(id: string, call: MediaConnection, outgoing: boolean): void {
    const meta = (call.metadata ?? {}) as { name?: string };
    const r: Remote = {
      id,
      slot: slotOf(this.o.roomCode, id) ?? 0,
      name: meta.name || (outgoing ? '' : '?'),
      call,
      outgoing,
      volume: this.volumes.get(id) ?? 1,
      speak: { speaking: false, lastLoud: 0 },
      level: 0,
      linked: false,
    };
    this.remotes.set(id, r);
    call.on('stream', (s) => this.attachStream(r, s));
    call.on('close', () => this.remotes.get(id) === r && this.drop(id, false, 'close'));
    call.on('error', (e) => this.remotes.get(id) === r && this.drop(id, false, `error ${e}`));
    const pc = call.peerConnection as RTCPeerConnection | undefined;
    pc?.addEventListener('connectionstatechange', () => {
      const up = pc.connectionState === 'connected';
      if (up !== r.linked) {
        r.linked = up;
        this.changed();
      }
      if (pc.connectionState === 'failed' && this.remotes.get(id) === r)
        this.drop(id, false, 'failed');
    });
    this.changed();
  }

  private attachStream(r: Remote, s: MediaStream): void {
    if (r.stream || !this.ctx) return; // PeerJS may fire 'stream' once per track
    r.stream = s;
    // Chrome only pulls remote WebRTC audio into WebAudio while a media element plays it.
    const a = document.createElement('audio');
    a.autoplay = true;
    a.setAttribute('playsinline', '');
    a.srcObject = s;
    a.muted = this.o.playback !== 'element';
    a.style.display = 'none';
    document.body.appendChild(a);
    void a.play().catch(() => {});
    r.audio = a;
    r.source = this.ctx.createMediaStreamSource(s);
    r.analyser = this.ctx.createAnalyser();
    r.analyser.fftSize = 1024;
    r.source.connect(r.analyser);
    if (this.o.playback !== 'element') {
      r.gain = this.ctx.createGain();
      r.gain.gain.value = r.volume;
      r.source.connect(r.gain).connect(this.ctx.destination);
    } else a.volume = Math.min(1, r.volume);
    // The caller learns the callee's name only from its own metadata; ask isn't possible,
    // so an outgoing call without a name shows the slot number.
    if (!r.name) r.name = `#${r.slot}`;
    this.changed();
  }

  private drop(id: string, silent: boolean, why = ''): void {
    const r = this.remotes.get(id);
    if (!r) return;
    if (this.o.peerOptions.debug) console.info('[voice] drop', id, why);
    this.remotes.delete(id);
    try {
      r.call.close();
    } catch {
      /* already closed */
    }
    r.source?.disconnect();
    r.gain?.disconnect();
    if (r.audio) {
      r.audio.srcObject = null;
      r.audio.remove();
    }
    if (!silent || r.stream) this.changed();
  }

  private meter(): void {
    const now = performance.now();
    let dirty = false;
    const read = (an: AnalyserNode) => {
      an.getFloatTimeDomainData(this.buf);
      return rms(this.buf);
    };
    if (this.localAnalyser) {
      this.localLevel = transmitting(this.mode, this.muted, this.pttDown)
        ? read(this.localAnalyser)
        : 0;
      this.localSpeak = updateSpeaking(this.localSpeak, this.localLevel, now);
      if (this.localSpeak.speaking !== this.localSpeaking) {
        this.localSpeaking = this.localSpeak.speaking;
        dirty = true;
      }
    }
    for (const r of this.remotes.values()) {
      if (!r.analyser) continue;
      r.level = read(r.analyser);
      const was = r.speak.speaking;
      r.speak = updateSpeaking(r.speak, r.level, now);
      if (was !== r.speak.speaking) dirty = true;
    }
    if (dirty) this.changed();
  }

  private applyTransmit(): void {
    const on = !this.listenOnly && transmitting(this.mode, this.muted, this.pttDown);
    for (const t of this.local?.getAudioTracks() ?? []) t.enabled = on;
  }

  get transmitting(): boolean {
    return !this.listenOnly && transmitting(this.mode, this.muted, this.pttDown);
  }

  setMode(m: MicMode): void {
    this.mode = m;
    this.pttDown = false;
    this.applyTransmit();
    this.changed();
  }

  setMuted(m: boolean): void {
    this.muted = m;
    this.applyTransmit();
    this.changed();
  }

  pushToTalk(down: boolean): void {
    if (this.pttDown === down) return;
    this.pttDown = down;
    this.applyTransmit();
    this.changed();
  }

  setPeerVolume(id: string, v: number): void {
    const vol = clampVolume(v);
    this.volumes.set(id, vol);
    const r = this.remotes.get(id);
    if (!r) return;
    r.volume = vol;
    if (r.gain) r.gain.gain.value = vol;
    else if (r.audio) r.audio.volume = Math.min(1, vol);
    this.changed();
  }

  peers(): VoicePeerInfo[] {
    return [...this.remotes.values()]
      .filter((r) => r.stream || !r.outgoing)
      .map((r) => ({
        id: r.id,
        slot: r.slot,
        name: r.name || `#${r.slot}`,
        speaking: r.speak.speaking,
        level: r.level,
        volume: r.volume,
        state: r.stream && r.linked ? 'connected' : 'connecting',
      }));
  }

  /** Diagnostics: inbound audio per peer from WebRTC stats. */
  async stats(): Promise<
    Array<{ id: string; bytesReceived: number; totalAudioEnergy: number; candidateType?: string }>
  > {
    const out = [];
    for (const r of this.remotes.values()) {
      const pc = r.call.peerConnection as RTCPeerConnection | undefined;
      if (!pc || !r.stream) continue;
      const rep = await pc.getStats();
      let bytesReceived = 0;
      let totalAudioEnergy = 0;
      let pairLocal: string | undefined;
      const byId = new Map<string, Record<string, unknown>>();
      rep.forEach((s: Record<string, unknown>) => byId.set(s.id as string, s));
      rep.forEach((s: Record<string, unknown>) => {
        if (s.type === 'inbound-rtp' && s.kind === 'audio') {
          bytesReceived += Number(s.bytesReceived ?? 0);
          totalAudioEnergy += Number(s.totalAudioEnergy ?? 0);
        }
        if (s.type === 'candidate-pair' && s.state === 'succeeded' && s.nominated)
          pairLocal = s.localCandidateId as string;
      });
      const cand = pairLocal ? byId.get(pairLocal) : undefined;
      out.push({
        id: r.id,
        bytesReceived,
        totalAudioEnergy,
        candidateType: cand?.candidateType as string | undefined,
      });
    }
    return out;
  }

  stop(): void {
    if (this.state === 'stopped') return;
    this.state = 'stopped';
    this.release();
    this.changed();
  }

  private release(): void {
    for (const t of this.timers) clearInterval(t);
    this.timers = [];
    for (const id of [...this.remotes.keys()]) this.drop(id, true);
    this.peer?.destroy();
    this.peer = null;
    for (const t of this.local?.getTracks() ?? []) t.stop();
    this.local = null;
    void this.ctx?.close().catch(() => {});
    this.ctx = null;
  }
}
