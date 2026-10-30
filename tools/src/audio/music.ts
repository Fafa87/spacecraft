import { Rng } from '@sms/shared';
import { normalize } from './wav.js';

/**
 * Procedural chiptune-style music generator. A SongSpec + seed fully defines a
 * track; the result is a seamless loop (note tails wrap to the start).
 * Channels: pulse lead, pulse arpeggio, triangle bass, saw pad, noise drums.
 */

export type SongStyle = 'battle' | 'menu' | 'tension';

export interface SongSpec {
  key: string;
  description: string;
  style: SongStyle;
  seed: number;
  bpm: number;
  bars: number;
  /** MIDI note of the tonic (e.g. 45 = A2). */
  root: number;
  /** Scale intervals in semitones. */
  scale: number[];
  /** Chord per bar as scale degree (0-based), repeated to fill `bars`. */
  progression: number[];
  volume: number;
}

export const SCALES = {
  minor: [0, 2, 3, 5, 7, 8, 10],
  phrygian: [0, 1, 3, 5, 7, 8, 10],
  harmonicMinor: [0, 2, 3, 5, 7, 8, 11],
  dorian: [0, 2, 3, 5, 7, 9, 10],
};

export const SONGS: SongSpec[] = [
  {
    key: 'battle',
    description: 'Driving combat loop',
    style: 'battle',
    seed: 1337,
    bpm: 148,
    bars: 16,
    root: 40, // E2
    scale: SCALES.phrygian,
    progression: [0, 0, 5, 6, 0, 0, 3, 4],
    volume: 0.35,
  },
  {
    key: 'menu',
    description: 'Brooding ambient lobby loop',
    style: 'menu',
    seed: 42,
    bpm: 84,
    bars: 8,
    root: 45, // A2
    scale: SCALES.harmonicMinor,
    progression: [0, 5, 3, 4],
    volume: 0.3,
  },
  {
    key: 'gameover',
    description: 'Short somber sting loop for the game-over screen',
    style: 'tension',
    seed: 7,
    bpm: 70,
    bars: 4,
    root: 38, // D2
    scale: SCALES.minor,
    progression: [0, 5, 3, 4],
    volume: 0.3,
  },
];

const midiToFreq = (m: number): number => 440 * Math.pow(2, (m - 69) / 12);

type Osc = 'pulse' | 'triangle' | 'saw' | 'sine';

interface Env {
  a: number;
  d: number;
  s: number;
  r: number;
}

class Track {
  readonly buf: Float32Array;

  constructor(
    readonly sampleRate: number,
    length: number,
  ) {
    this.buf = new Float32Array(length);
  }

  tone(
    start: number,
    dur: number,
    freq: number,
    osc: Osc,
    gain: number,
    env: Env,
    duty = 0.5,
    vibrato = 0,
  ): void {
    const sr = this.sampleRate;
    const n = Math.floor((dur + env.r) * sr);
    const s0 = Math.floor(start * sr);
    const len = this.buf.length;
    let phase = 0;
    for (let i = 0; i < n; i++) {
      const t = i / sr;
      let e: number;
      if (t < env.a) e = t / env.a;
      else if (t < env.a + env.d) e = 1 - (1 - env.s) * ((t - env.a) / env.d);
      else if (t < dur) e = env.s;
      else e = env.s * Math.max(0, 1 - (t - dur) / env.r);
      const f =
        vibrato > 0 && t > 0.15 ? freq * (1 + Math.sin(t * 2 * Math.PI * 5.5) * vibrato) : freq;
      phase = (phase + f / sr) % 1;
      let v: number;
      switch (osc) {
        case 'pulse':
          v = phase < duty ? 1 : -1;
          break;
        case 'triangle':
          v = 4 * Math.abs(phase - 0.5) - 1;
          break;
        case 'saw':
          v = 2 * phase - 1;
          break;
        default:
          v = Math.sin(phase * 2 * Math.PI);
      }
      this.buf[(s0 + i) % len] += v * e * gain;
    }
  }

  kick(start: number, gain: number): void {
    const sr = this.sampleRate;
    const n = Math.floor(0.25 * sr);
    const s0 = Math.floor(start * sr);
    let phase = 0;
    for (let i = 0; i < n; i++) {
      const t = i / sr;
      const f = 45 + 110 * Math.exp(-t * 28);
      phase += f / sr;
      this.buf[(s0 + i) % this.buf.length] +=
        Math.sin(phase * 2 * Math.PI) * Math.exp(-t * 12) * gain;
    }
  }

  noise(start: number, dur: number, gain: number, decay: number, rng: Rng, hp = 0): void {
    const sr = this.sampleRate;
    const n = Math.floor(dur * sr);
    const s0 = Math.floor(start * sr);
    let prev = 0;
    for (let i = 0; i < n; i++) {
      const t = i / sr;
      const w = rng.next() * 2 - 1;
      const v = hp > 0 ? w - prev * hp : w;
      prev = w;
      this.buf[(s0 + i) % this.buf.length] += v * Math.exp(-t * decay) * gain;
    }
  }

  /** One-pole low-pass in place. */
  lowpass(cutoffHz: number): void {
    const a = 1 - Math.exp((-2 * Math.PI * cutoffHz) / this.sampleRate);
    let y = 0;
    // two passes so the loop seam is smooth
    for (let pass = 0; pass < 2; pass++)
      for (let i = 0; i < this.buf.length; i++) this.buf[i] = y += a * (this.buf[i] - y);
  }

  /** Circular feedback delay (echo). */
  echo(delaySec: number, feedback: number, mix: number): void {
    const d = Math.floor(delaySec * this.sampleRate);
    const len = this.buf.length;
    const wet = new Float32Array(len);
    for (let pass = 0; pass < 2; pass++)
      for (let i = 0; i < len; i++)
        wet[i] = this.buf[(i - d + len) % len] + wet[(i - d + len) % len] * feedback;
    for (let i = 0; i < len; i++) this.buf[i] += wet[i] * mix;
  }
}

function chordNotes(spec: SongSpec, degree: number, octave = 0): number[] {
  const s = spec.scale;
  const note = (deg: number) =>
    spec.root +
    12 * (octave + Math.floor(deg / s.length)) +
    s[((deg % s.length) + s.length) % s.length];
  return [note(degree), note(degree + 2), note(degree + 4)];
}

function scaleNote(spec: SongSpec, deg: number, octave: number): number {
  const s = spec.scale;
  return (
    spec.root +
    12 * (octave + Math.floor(deg / s.length)) +
    s[((deg % s.length) + s.length) % s.length]
  );
}

/** Renders a song to mono samples. Length = bars * 4 beats exactly (seamless loop). */
export function renderSong(spec: SongSpec, sampleRate = 22050): Float32Array {
  const rng = new Rng(spec.seed);
  const beat = 60 / spec.bpm;
  const step = beat / 4; // 16th note
  const barLen = beat * 4;
  const total = Math.round(spec.bars * barLen * sampleRate);
  const bass = new Track(sampleRate, total);
  const lead = new Track(sampleRate, total);
  const arp = new Track(sampleRate, total);
  const pad = new Track(sampleRate, total);
  const drums = new Track(sampleRate, total);

  // Melody motif: generated per 2-bar phrase, repeated with variation.
  const motif: Array<number | null> = [];
  for (let i = 0; i < 32; i++) {
    const strong = i % 4 === 0;
    if (!strong && rng.chance(spec.style === 'battle' ? 0.45 : 0.75)) motif.push(null);
    else motif.push(rng.int(-2, 6));
  }

  for (let bar = 0; bar < spec.bars; bar++) {
    const degree = spec.progression[bar % spec.progression.length];
    const chord = chordNotes(spec, degree, 0);
    const t0 = bar * barLen;
    const section = Math.floor(bar / 4); // 4-bar sections add/remove layers
    const intense = spec.style === 'battle' && section % 2 === 1;

    if (spec.style === 'battle') {
      // Bass: driving 8ths with octave jumps.
      for (let i = 0; i < 8; i++) {
        const n = chord[0] + (i % 4 === 3 ? 12 : 0);
        bass.tone(t0 + i * step * 2, step * 1.7, midiToFreq(n), 'triangle', 0.55, {
          a: 0.003,
          d: 0.05,
          s: 0.7,
          r: 0.03,
        });
      }
      // Arp: 16ths over chord, 2 octaves up.
      if (section > 0) {
        for (let i = 0; i < 16; i++) {
          const n = chord[i % 3] + 24 + (i % 6 >= 3 ? 12 : 0);
          arp.tone(
            t0 + i * step,
            step * 0.6,
            midiToFreq(n),
            'pulse',
            0.09,
            { a: 0.002, d: 0.04, s: 0.4, r: 0.02 },
            0.125,
          );
        }
      }
      // Lead melody.
      if (section !== 0 || bar % 4 >= 2) {
        for (let i = 0; i < 16; i++) {
          const m = motif[(bar % 2) * 16 + i];
          if (m === null) continue;
          let dur = step;
          while (i + 1 < 16 && motif[(bar % 2) * 16 + i + 1] === null && dur < step * 3)
            dur += step;
          const variation = intense && i % 8 === 4 ? 2 : 0;
          const n = scaleNote(spec, degree + m + variation, 2);
          lead.tone(
            t0 + i * step,
            dur * 0.9,
            midiToFreq(n),
            'pulse',
            0.16,
            { a: 0.005, d: 0.08, s: 0.6, r: 0.05 },
            0.25,
            0.006,
          );
        }
      }
      // Drums.
      for (let i = 0; i < 16; i++) {
        const t = t0 + i * step;
        if (i === 0 || i === 8 || (intense && (i === 10 || i === 14)) || (!intense && i === 11))
          drums.kick(t, 0.9);
        if (i === 4 || i === 12) drums.noise(t, 0.18, 0.45, 18, rng, 0.2);
        if (i % 2 === 0 || intense) drums.noise(t, 0.04, i % 4 === 2 ? 0.16 : 0.09, 60, rng, 0.95);
      }
      if (bar % 4 === 3)
        for (let i = 12; i < 16; i++) drums.noise(t0 + i * step, 0.1, 0.25, 25, rng, 0.3); // fill
    } else {
      // Ambient: pad chords, slow bass, sparse bell melody, heartbeat.
      for (const n of chord) {
        pad.tone(t0, barLen, midiToFreq(n + 12), 'saw', 0.09, {
          a: barLen * 0.35,
          d: 0.2,
          s: 0.8,
          r: barLen * 0.4,
        });
        pad.tone(t0, barLen, midiToFreq(n + 12) * 1.004, 'saw', 0.07, {
          a: barLen * 0.35,
          d: 0.2,
          s: 0.8,
          r: barLen * 0.4,
        });
      }
      bass.tone(t0, barLen * 0.9, midiToFreq(chord[0]), 'triangle', 0.5, {
        a: 0.05,
        d: 0.3,
        s: 0.6,
        r: 0.4,
      });
      const beats = spec.style === 'tension' ? [0] : [0, 1.5];
      for (const b of beats) drums.kick(t0 + b * beat, spec.style === 'tension' ? 0.5 : 0.6);
      for (let i = 0; i < 8; i++) {
        const m = motif[(bar % 4) * 8 + i];
        if (m === null || rng.chance(0.4)) continue;
        const n = scaleNote(spec, degree + m, 3);
        lead.tone(t0 + i * step * 2, step * 2, midiToFreq(n), 'sine', 0.12, {
          a: 0.01,
          d: 0.4,
          s: 0.2,
          r: 0.6,
        });
      }
    }
  }

  pad.lowpass(1400);
  lead.echo(step * 3, 0.35, spec.style === 'battle' ? 0.25 : 0.45);

  const out = new Float32Array(total);
  for (let i = 0; i < total; i++) {
    const v = bass.buf[i] + lead.buf[i] + arp.buf[i] + pad.buf[i] + drums.buf[i];
    out[i] = Math.tanh(v * 1.1); // gentle saturation glues the mix
  }
  return normalize(out, 0.8);
}
