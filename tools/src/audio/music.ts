import { Rng } from '@sms/shared';
import { normalize } from './wav.js';

/**
 * Procedural gothic music generator: additive pipe organ, formant "aah" choir,
 * bells and war drums. A SongSpec + seed fully defines a track; the result is a
 * seamless loop (note tails wrap to the start).
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
    description: 'Siege battle loop: organ ostinato, war drums, choir',
    style: 'battle',
    seed: 1337,
    bpm: 126,
    bars: 16,
    root: 40, // E2
    scale: SCALES.phrygian,
    progression: [0, 0, 5, 6, 0, 0, 3, 4],
    volume: 0.35,
  },
  {
    key: 'menu',
    description: 'Cathedral lobby loop: organ drone, choir, funeral bell',
    style: 'menu',
    seed: 42,
    bpm: 66,
    bars: 8,
    root: 45, // A2
    scale: SCALES.harmonicMinor,
    progression: [0, 5, 3, 4],
    volume: 0.3,
  },
  {
    key: 'gameover',
    description: 'Requiem for the fallen (game-over loop)',
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

type Osc = 'pulse' | 'triangle' | 'saw' | 'sine' | 'organ' | 'choir' | 'bell';

/** Pipe organ drawbars: harmonic number -> level (8', 4', 2 2/3', 2', 1 3/5', 1'). */
const ORGAN: Array<[number, number]> = [
  [0.5, 0.55],
  [1, 1],
  [2, 0.6],
  [3, 0.35],
  [4, 0.3],
  [6, 0.15],
  [8, 0.12],
];
/** Inharmonic bell partials (ratio, level). */
const BELL: Array<[number, number]> = [
  [0.5, 0.6],
  [1, 1],
  [1.19, 0.5],
  [1.56, 0.35],
  [2, 0.4],
  [2.66, 0.25],
  [3.01, 0.15],
];

/** "Aah" vowel: harmonic amplitudes shaped by three formant peaks (F1 750, F2 1150, F3 2600 Hz). */
function choirPartials(freq: number): Array<[number, number]> {
  const out: Array<[number, number]> = [];
  const formants: Array<[number, number, number]> = [
    [750, 130, 1],
    [1150, 160, 0.6],
    [2600, 260, 0.25],
  ];
  for (let k = 1; k * freq < 4200 && k <= 40; k++) {
    const f = k * freq;
    let a = 0.08 / k; // glottal tilt
    for (const [fc, bw, g] of formants) a += g * Math.exp(-(((f - fc) / bw) ** 2));
    out.push([k, a]);
  }
  const sum = out.reduce((t, [, a]) => t + a, 0) || 1;
  return out.map(([k, a]) => [k, a / sum]);
}

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
    if (osc === 'organ' || osc === 'choir' || osc === 'bell') {
      const partials = osc === 'organ' ? ORGAN : osc === 'bell' ? BELL : choirPartials(freq);
      const norm = osc === 'choir' ? 1 : 1 / partials.reduce((t, [, a]) => t + a, 0);
      const phases = partials.map(() => 0);
      for (let i = 0; i < n; i++) {
        const t = i / sr;
        let e: number;
        if (osc === 'bell') e = Math.exp(-t * 2.2) * Math.min(1, t / 0.003);
        else if (t < env.a) e = t / env.a;
        else if (t < env.a + env.d) e = 1 - (1 - env.s) * ((t - env.a) / env.d);
        else if (t < dur) e = env.s;
        else e = env.s * Math.max(0, 1 - (t - dur) / env.r);
        // Choir: slow ensemble vibrato; organ: steady.
        const f =
          osc === 'choir'
            ? freq * (1 + Math.sin(t * 2 * Math.PI * 4.6 + freq) * (vibrato || 0.004))
            : freq;
        let v = 0;
        for (let k = 0; k < partials.length; k++) {
          const [ratio, amp] = partials[k]!;
          const fk = f * ratio;
          if (fk > sr * 0.45) continue;
          phases[k] = (phases[k]! + fk / sr) % 1;
          // Bell partials decay faster the higher they are.
          const pk = osc === 'bell' ? Math.exp(-t * ratio * 1.2) : 1;
          v += Math.sin(phases[k]! * 2 * Math.PI) * amp * pk;
        }
        this.buf[(s0 + i) % len] += v * norm * e * gain;
      }
      return;
    }
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

  /** Deep war-drum tom: pitch-dropping sine with a short noisy skin attack. */
  tom(start: number, baseHz: number, gain: number): void {
    const sr = this.sampleRate;
    const n = Math.floor(0.5 * sr);
    const s0 = Math.floor(start * sr);
    let phase = 0;
    let seed = Math.floor(start * 1000) + 1;
    for (let i = 0; i < n; i++) {
      const t = i / sr;
      const f = baseHz * (1 + 0.8 * Math.exp(-t * 22));
      phase += f / sr;
      seed = (seed * 1103515245 + 12345) & 0x7fffffff;
      const skin = ((seed / 0x7fffffff) * 2 - 1) * Math.exp(-t * 60) * 0.3;
      this.buf[(s0 + i) % this.buf.length] +=
        (Math.sin(phase * 2 * Math.PI) * Math.exp(-t * 6) + skin) * gain;
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
  const organ = new Track(sampleRate, total);
  const choir = new Track(sampleRate, total);
  const bells = new Track(sampleRate, total);
  const drums = new Track(sampleRate, total);
  const held: Env = { a: 0.06, d: 0.2, s: 0.85, r: 0.25 };
  const swell: Env = { a: barLen * 0.3, d: 0.3, s: 0.8, r: barLen * 0.35 };

  // Chant motif: one note per half bar, mostly stepwise.
  const motif: number[] = [];
  let m = 0;
  for (let i = 0; i < 16; i++) {
    m = Math.max(-2, Math.min(5, m + rng.int(-2, 2)));
    motif.push(m);
  }

  for (let bar = 0; bar < spec.bars; bar++) {
    const degree = spec.progression[bar % spec.progression.length];
    const chord = chordNotes(spec, degree, 0);
    const t0 = bar * barLen;
    const section = Math.floor(bar / 4); // 4-bar sections add/remove layers
    const intense = spec.style === 'battle' && section % 2 === 1;

    // Pedal: low organ root held through the bar (16' + 8').
    organ.tone(t0, barLen * 0.98, midiToFreq(chord[0] - 12), 'organ', 0.3, held);
    // Choir: the chord as sustained "aah"s, two slightly detuned ensemble voices.
    if (spec.style !== 'battle' || section > 0 || bar % 4 >= 2)
      for (const n of chord) {
        const f = midiToFreq(n + 12);
        choir.tone(t0, barLen, f, 'choir', 0.16, swell, 0, 0.004);
        choir.tone(t0, barLen, f * 1.005, 'choir', 0.12, swell, 0, 0.005);
      }

    if (spec.style === 'battle') {
      // Organ ostinato: driving 8ths over the chord.
      const pattern = [0, 2, 1, 2, 0, 2, 1, 3];
      for (let i = 0; i < 8; i++) {
        const k = pattern[i]!;
        const n = k === 3 ? chord[0] + 12 : chord[k]!;
        organ.tone(t0 + i * step * 2, step * 1.6, midiToFreq(n), 'organ', 0.16, {
          a: 0.005,
          d: 0.06,
          s: 0.7,
          r: 0.05,
        });
      }
      // Choir chant line in intense sections.
      if (intense)
        for (let h = 0; h < 2; h++) {
          const n = scaleNote(spec, degree + motif[(bar * 2 + h) % motif.length]!, 2);
          choir.tone(t0 + h * beat * 2, beat * 1.9, midiToFreq(n), 'choir', 0.22, held, 0, 0.006);
        }
      // War drums: deep toms + a gated snare, tom fills at phrase ends.
      for (let i = 0; i < 16; i++) {
        const t = t0 + i * step;
        if (i === 0 || i === 6 || i === 8 || (intense && (i === 10 || i === 14)))
          drums.tom(t, 55, 0.9);
        if (i === 4 || i === 12) drums.noise(t, 0.22, 0.4, 14, rng, 0.25);
        if (intense && i % 2 === 1) drums.noise(t, 0.04, 0.07, 60, rng, 0.9);
      }
      if (bar % 4 === 3)
        for (let i = 8; i < 16; i += 2) drums.tom(t0 + i * step, 70 + (16 - i) * 6, 0.6);
    } else {
      // Slow: organ fifth drone, a funeral bell every other bar, low heartbeat drum.
      organ.tone(t0, barLen * 0.98, midiToFreq(chord[0] + 7 - 12), 'organ', 0.14, held);
      if (bar % 2 === 0 || spec.style === 'tension')
        bells.tone(t0, 2.5, midiToFreq(chord[0] + 12), 'bell', 0.35, held);
      drums.tom(t0, 48, spec.style === 'tension' ? 0.45 : 0.55);
      drums.tom(t0 + beat * 2.5, 48, 0.35);
      // Sparse chant phrase on top.
      if (section % 2 === 1 || spec.style === 'tension') {
        const n = scaleNote(spec, degree + motif[bar % motif.length]!, 2);
        choir.tone(t0 + beat, beat * 2.5, midiToFreq(n), 'choir', 0.18, swell, 0, 0.006);
      }
    }
  }

  organ.lowpass(2400);
  choir.lowpass(3200);
  // Cathedral reverb: a few long echoes.
  const space = spec.style === 'battle' ? 0.22 : 0.4;
  for (const tr of [choir, bells, organ]) {
    tr.echo(beat * 0.75, 0.45, space);
    tr.echo(beat * 1.33, 0.3, space * 0.6);
  }

  const out = new Float32Array(total);
  for (let i = 0; i < total; i++) {
    const v = organ.buf[i] + choir.buf[i] + bells.buf[i] + drums.buf[i];
    out[i] = Math.tanh(v * 1.1); // gentle saturation glues the mix
  }
  return normalize(out, 0.8);
}
