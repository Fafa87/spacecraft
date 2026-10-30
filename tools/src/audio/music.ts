import { Biquad, Rng, SR, convReverb, vowel } from './dsp.js';
import { normalize } from './wav.js';

/**
 * Procedural gothic music (Chaos Gate / Warhammer 40k): a formant-synthesised monastic
 * choir (unison ensembles of glottal sources through vowel formants), an additive pipe
 * organ with mixture ranks, tuned cathedral bells, timpani with membrane modes, and low
 * bowed drones, all in one convolution "cathedral". A SongSpec + seed fully defines a
 * track; every track is a seamless loop (note tails and reverb wrap to the start).
 *
 * Adaptive combat: `combat` is the base bed and `combat_drive` (layerOf: 'combat') the
 * intensity stem with the same bpm/bars, so the client plays both sample-locked and
 * fades the drive stem with the fight's intensity (see AudioEngine.setMusicIntensity).
 */

export type SongStyle = 'menu' | 'combat' | 'combatDrive' | 'boss' | 'tension';

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
  /** Adaptive stem: played in sync with the named track, level follows intensity. */
  layerOf?: string;
}

export const SCALES = {
  minor: [0, 2, 3, 5, 7, 8, 10],
  phrygian: [0, 1, 3, 5, 7, 8, 10],
  harmonicMinor: [0, 2, 3, 5, 7, 8, 11],
  dorian: [0, 2, 3, 5, 7, 9, 10],
};

const COMBAT_BASE = {
  seed: 1337,
  bpm: 128,
  bars: 32, // 60 s
  root: 40, // E2
  scale: SCALES.phrygian,
  progression: [0, 0, 5, 6, 0, 0, 3, 4, 0, 1, 5, 6, 3, 3, 4, 4],
};

export const SONGS: SongSpec[] = [
  {
    key: 'menu',
    description: 'Cathedral lobby: organ pedal, monastic choir, funeral bells, distant timpani',
    style: 'menu',
    seed: 42,
    bpm: 64,
    bars: 16, // 60 s
    root: 45, // A2
    scale: SCALES.harmonicMinor,
    progression: [0, 5, 3, 4, 0, 5, 1, 4],
    volume: 0.32,
  },
  {
    key: 'combat',
    description: 'Combat bed (adaptive base): drones, organ chords, sustained choir',
    style: 'combat',
    ...COMBAT_BASE,
    volume: 0.3,
  },
  {
    key: 'combat_drive',
    description: 'Combat intensity stem: war timpani, organ ostinato, marcato chant, bells',
    style: 'combatDrive',
    ...COMBAT_BASE,
    volume: 0.34,
    layerOf: 'combat',
  },
  {
    key: 'boss',
    description: 'Carnifex / boss: full choir fortissimo, timpani rolls, organ tutti, bells',
    style: 'boss',
    seed: 666,
    bpm: 120,
    bars: 24, // 48 s
    root: 38, // D2
    scale: SCALES.harmonicMinor,
    progression: [0, 0, 5, 4, 0, 0, 1, 4],
    volume: 0.36,
  },
  {
    key: 'gameover',
    description: 'Requiem for the fallen (game-over loop)',
    style: 'tension',
    seed: 7,
    bpm: 60,
    bars: 8,
    root: 38, // D2
    scale: SCALES.minor,
    progression: [0, 5, 3, 4],
    volume: 0.3,
  },
];

const midiToFreq = (m: number): number => 440 * Math.pow(2, (m - 69) / 12);

/** Pipe organ: 16' 8' 4' 2 2/3' 2' + mixture (harmonic, level). */
const ORGAN: Array<[number, number]> = [
  [0.5, 0.5],
  [1, 1],
  [2, 0.6],
  [3, 0.38],
  [4, 0.32],
  [6, 0.2],
  [8, 0.16],
  [12, 0.08],
  [16, 0.06],
];
/** Church bell partials: hum, prime, minor third, fifth, nominal, ... (ratio, level, decay x). */
const BELL: Array<[number, number, number]> = [
  [0.5, 0.7, 0.35],
  [1, 1, 0.6],
  [1.2, 0.6, 0.8],
  [1.5, 0.35, 0.9],
  [2, 0.55, 1],
  [2.5, 0.25, 1.4],
  [3, 0.2, 1.6],
  [4.2, 0.12, 2.2],
];

/** A stem buffer at SR with wrap-around writes (for seamless loops). */
class Stem {
  readonly buf: Float32Array;
  constructor(len: number) {
    this.buf = new Float32Array(len);
  }
  add(i: number, v: number): void {
    const n = this.buf.length;
    this.buf[((i % n) + n) % n] += v;
  }
}

interface ChoirOpts {
  voices?: number;
  vowel?: string;
  vowelTo?: string;
  a?: number;
  r?: number;
  breath?: number;
  marcato?: boolean;
}

/**
 * One choir note: `voices` singers (detuned, own vibrato + drift) with a glottal-ish
 * source summed into a shared 3-formant vowel bank, plus breath noise.
 */
function choir(
  st: Stem,
  rng: Rng,
  t0: number,
  dur: number,
  midi: number,
  gain: number,
  o: ChoirOpts = {},
): void {
  const f0 = midiToFreq(midi);
  const voices = o.voices ?? 5;
  const a = o.a ?? Math.min(0.35, dur * 0.3);
  const r = o.r ?? 0.6;
  const n = Math.floor((dur + r) * SR);
  const s0 = Math.floor(t0 * SR);
  const vs = Array.from({ length: voices }, () => ({
    ph: rng.next(),
    det: Math.pow(2, rng.range(-12, 12) / 1200),
    vr: rng.range(4.6, 5.8),
    vp: rng.next() * 6.28,
    vd: rng.range(0.003, 0.007),
    drift: rng.range(0.1, 0.4),
  }));
  const v1 = vowel(o.vowel ?? 'a');
  const v2 = vowel(o.vowelTo ?? o.vowel ?? 'a');
  // male voices: slightly lowered formants
  const bank = [new Biquad(), new Biquad(), new Biquad()];
  const gains = [1, 0.7, 0.35];
  const lp = new Biquad('lp', 4200, 0.7);
  let x1 = 0;
  const dnorm = (SR / (2 * Math.PI * f0)) * 0.8;
  for (let i = 0; i < n; i++) {
    const t = i / SR;
    let env: number;
    if (o.marcato) env = Math.min(1, t / 0.03) * (0.55 + 0.45 * Math.exp(-t * 6));
    else env = t < a ? Math.pow(t / a, 1.5) : 1;
    if (t > dur) env *= Math.max(0, 1 - (t - dur) / r);
    if (env <= 0 && t > dur) break;
    if ((i & 63) === 0) {
      const k = Math.min(1, t / Math.max(0.01, dur));
      for (let j = 0; j < 3; j++)
        bank[j]!.set('bp', (v1[j]! + (v2[j]! - v1[j]!) * k) * 0.9, 5 + j * 2);
    }
    let src = 0;
    for (const v of vs) {
      const vib = 1 + Math.sin(t * 6.28 * v.vr + v.vp) * v.vd * Math.min(1, t / 0.4);
      const dr = 1 + Math.sin(t * v.drift + v.vp) * 0.002;
      v.ph += (f0 * v.det * vib * dr) / SR;
      v.ph -= Math.floor(v.ph);
      // smoothed glottal pulse: saw with rounded top (less buzzy than a raw saw)
      const p = v.ph;
      src +=
        p < 0.6
          ? Math.sin((p / 0.6) * Math.PI) * 0.8
          : -0.5 * Math.sin(((p - 0.6) / 0.4) * Math.PI);
    }
    src /= Math.sqrt(voices);
    const dsrc = src - x1; // spectral tilt like a real glottis
    x1 = src;
    const br = rng.bi() * (o.breath ?? 0.04);
    // differentiation scales the source by ~2πf0/SR; undo that so the level is pitch-independent
    const exc = dsrc * dnorm + br;
    let y = 0;
    for (let j = 0; j < 3; j++) y += bank[j]!.process(exc) * gains[j]!;
    // formant bank is narrow (≈ -20 dB vs the source): make up the level, plus a little
    // unfiltered chest tone so low notes keep body
    st.add(s0 + i, lp.process(y * 5 + src * 0.12) * env * gain);
  }
}

function organ(st: Stem, t0: number, dur: number, midi: number, gain: number, chiff = 0.15): void {
  const f0 = midiToFreq(midi);
  const n = Math.floor((dur + 0.35) * SR);
  const s0 = Math.floor(t0 * SR);
  const ph = ORGAN.map(() => 0);
  const norm = 1 / ORGAN.reduce((s, [, a]) => s + a, 0);
  let seed = (midi * 7919 + Math.floor(t0 * 100)) | 1;
  const nb = new Biquad('bp', Math.min(8000, f0 * 4), 2);
  for (let i = 0; i < n; i++) {
    const t = i / SR;
    let env = Math.min(1, t / 0.04);
    if (t > dur) env *= Math.max(0, 1 - (t - dur) / 0.35);
    let v = 0;
    for (let k = 0; k < ORGAN.length; k++) {
      const [ratio, amp] = ORGAN[k]!;
      const fk = f0 * ratio;
      if (fk > 9000) continue;
      ph[k] = (ph[k]! + fk / SR) % 1;
      v += Math.sin(ph[k]! * 6.2832) * amp;
    }
    seed = (seed * 1103515245 + 12345) & 0x7fffffff;
    const noise = (seed / 0x3fffffff - 1) * chiff * Math.exp(-t * 30);
    st.add(s0 + i, (v * norm + nb.process(noise)) * env * gain);
  }
}

function bell(st: Stem, t0: number, midi: number, gain: number, len = 5): void {
  const f0 = midiToFreq(midi);
  const n = Math.floor(len * SR);
  const s0 = Math.floor(t0 * SR);
  const ph = BELL.map(() => 0);
  for (let i = 0; i < n; i++) {
    const t = i / SR;
    let v = 0;
    for (let k = 0; k < BELL.length; k++) {
      const [ratio, amp, dk] = BELL[k]!;
      ph[k] = (ph[k]! + (f0 * ratio) / SR) % 1;
      v += Math.sin(ph[k]! * 6.2832) * amp * Math.exp(-t * dk * 1.1);
    }
    st.add(s0 + i, v * 0.4 * gain * Math.min(1, t / 0.002));
  }
}

/** Timpani: pitched membrane modes (1, 1.5, 1.99, 2.44) + mallet noise. */
function timpani(st: Stem, rng: Rng, t0: number, hz: number, gain: number, len = 1.6): void {
  const modes: Array<[number, number, number]> = [
    [1, 1, 2.6],
    [1.5, 0.5, 4],
    [1.99, 0.3, 5],
    [2.44, 0.18, 6],
  ];
  const n = Math.floor(len * SR);
  const s0 = Math.floor(t0 * SR);
  const ph = modes.map(() => 0);
  const nb = new Biquad('lp', 1500, 0.8);
  for (let i = 0; i < n; i++) {
    const t = i / SR;
    const bend = 1 + 0.04 * Math.exp(-t * 20);
    let v = 0;
    for (let k = 0; k < modes.length; k++) {
      const [r, a, d] = modes[k]!;
      ph[k] = (ph[k]! + (hz * r * bend) / SR) % 1;
      v += Math.sin(ph[k]! * 6.2832) * a * Math.exp(-t * d);
    }
    v += nb.process(rng.bi()) * Math.exp(-t * 45) * 0.8;
    st.add(s0 + i, v * gain * Math.min(1, t / 0.0015));
  }
}

/** Low bowed drone: detuned saws, lowpassed; level breathes slowly, pitch stays put. */
function drone(st: Stem, rng: Rng, t0: number, dur: number, midi: number, gain: number): void {
  const f0 = midiToFreq(midi);
  const n = Math.floor((dur + 0.5) * SR);
  const s0 = Math.floor(t0 * SR);
  const dets = [-7, -2, 3, 8].map((c) => Math.pow(2, c / 1200));
  const ph = dets.map(() => rng.next());
  const lp = new Biquad('lp', 380, 0.7);
  for (let i = 0; i < n; i++) {
    const t = i / SR;
    let env = Math.min(1, t / 0.5);
    if (t > dur) env *= Math.max(0, 1 - (t - dur) / 0.5);
    let v = 0;
    for (let k = 0; k < dets.length; k++) {
      ph[k] = (ph[k]! + (f0 * dets[k]!) / SR) % 1;
      v += 2 * ph[k]! - 1;
    }
    st.add(s0 + i, lp.process(v * 0.3) * env * gain);
  }
}

function scaleNote(spec: SongSpec, deg: number, octave: number): number {
  const s = spec.scale;
  return (
    spec.root +
    12 * (octave + Math.floor(deg / s.length)) +
    s[((deg % s.length) + s.length) % s.length]!
  );
}
const chordOf = (spec: SongSpec, deg: number, oct = 0): number[] => [
  scaleNote(spec, deg, oct),
  scaleNote(spec, deg + 2, oct),
  scaleNote(spec, deg + 4, oct),
];

/** Reverb that wraps its tail onto the start so the loop stays seamless. */
function cathedral(buf: Float32Array, mix: number, decay: number): Float32Array {
  const wet = convReverb(buf, { mix, decay, damp: 0.55, predelay: 0.035, early: 9, seed: 1234 });
  const out = wet.slice(0, buf.length);
  for (let i = buf.length; i < wet.length; i++) out[i % buf.length] += wet[i]!;
  return out;
}

/**
 * Runs a filter over a loop in place, primed with the loop's tail so the filter state at the
 * start matches the end (no click at the loop point).
 */
function loopFilter(buf: Float32Array, f: Biquad): void {
  const prime = Math.min(buf.length, SR);
  for (let i = buf.length - prime; i < buf.length; i++) f.process(buf[i]!);
  for (let i = 0; i < buf.length; i++) buf[i] = f.process(buf[i]!);
}

/** Renders the song mono at SR, then resamples to `sampleRate`. Length = bars*4 beats. */
export function renderSong(spec: SongSpec, sampleRate = 22050): Float32Array {
  const rng = new Rng(spec.seed);
  const beat = 60 / spec.bpm;
  const bar = beat * 4;
  const total = Math.round(spec.bars * bar * SR);
  const st = new Stem(total);
  const motif: number[] = [];
  let m = 2;
  for (let i = 0; i < 32; i++) {
    m = Math.max(-1, Math.min(6, m + Math.round(rng.range(-2.4, 2.4))));
    motif.push(m);
  }
  const vowels = ['a', 'o', 'a', 'u', 'o'];

  for (let b = 0; b < spec.bars; b++) {
    const deg = spec.progression[b % spec.progression.length]!;
    const ch = chordOf(spec, deg);
    const t0 = b * bar;
    const sec = Math.floor(b / 4);
    const vw = vowels[sec % vowels.length]!;
    switch (spec.style) {
      case 'menu': {
        organ(st, t0, bar * 0.98, ch[0]! - 12, 0.28, 0.05);
        organ(st, t0, bar * 0.98, ch[0]! + 7 - 12, 0.12, 0.05);
        drone(st, rng, t0, bar, spec.root - 12, 0.16);
        if (sec >= 1)
          for (const nn of ch)
            choir(st, rng, t0, bar * 0.95, nn + 12, 0.1, { vowel: vw, vowelTo: 'o' });
        if (sec >= 2) {
          // plainchant line: one note per beat-and-a-half, low male voices
          for (let h = 0; h < 2; h++) {
            const nn = scaleNote(spec, deg + motif[(b * 2 + h) % motif.length]!, 1);
            choir(st, rng, t0 + h * beat * 2, beat * 1.9, nn, 0.16, {
              vowel: 'o',
              vowelTo: 'a',
              voices: 6,
            });
          }
        }
        if (b % 2 === 0) bell(st, t0, ch[0]! + 24, 0.4, 6);
        if (b % 4 === 3) {
          for (let k = 0; k < 8; k++)
            timpani(
              st,
              rng,
              t0 + beat * 2 + k * beat * 0.25,
              midiToFreq(spec.root),
              0.08 + k * 0.02,
            );
        }
        if (b % 4 === 0) timpani(st, rng, t0, midiToFreq(spec.root), 0.35, 2.5);
        break;
      }
      case 'combat': {
        drone(st, rng, t0, bar, spec.root - 12, 0.18);
        organ(st, t0, bar * 0.98, ch[0]! - 12, 0.25, 0.05);
        for (const nn of ch) organ(st, t0 + bar * 0.5 * (b % 2), bar * 0.48, nn, 0.06);
        for (const nn of ch)
          choir(st, rng, t0, bar * 0.95, nn + 12, 0.09, { vowel: vw, voices: 5 });
        timpani(st, rng, t0, midiToFreq(spec.root + (deg === 0 ? 0 : 7)), 0.24);
        break;
      }
      case 'combatDrive': {
        // organ ostinato in 8ths
        const pat = [0, 2, 1, 2, 0, 2, 1, 3];
        for (let i = 0; i < 8; i++) {
          const k = pat[i]!;
          const nn = k === 3 ? ch[0]! + 12 : ch[k]!;
          organ(st, t0 + i * beat * 0.5, beat * 0.42, nn, 0.14, 0.25);
        }
        // war timpani: tonic/fifth pattern with 16th pickups
        const tf = midiToFreq(spec.root);
        const t5 = midiToFreq(spec.root + 7);
        const hits: Array<[number, number, number]> = [
          [0, tf, 0.9],
          [1.5, tf, 0.6],
          [2, t5, 0.75],
          [3, tf, 0.6],
          [3.5, t5, 0.5],
          [3.75, t5, 0.55],
        ];
        for (const [at, hz, g] of hits) timpani(st, rng, t0 + at * beat, hz, g * 0.42, 1.1);
        if (b % 4 === 3)
          for (let k = 0; k < 16; k++)
            timpani(st, rng, t0 + k * beat * 0.25, k < 8 ? tf : t5, 0.14 + k * 0.02, 0.6);
        // marcato chant on the beat in odd sections
        if (sec % 2 === 1)
          for (let h = 0; h < 4; h++) {
            const nn = scaleNote(spec, deg + motif[(b * 4 + h) % motif.length]!, 1);
            choir(st, rng, t0 + h * beat, beat * 0.8, nn + 12, 0.18, {
              vowel: h % 2 ? 'o' : 'a',
              marcato: true,
              voices: 6,
              r: 0.25,
            });
          }
        if (b % 8 === 0) bell(st, t0, ch[0]! + 24, 0.45, 4);
        break;
      }
      case 'boss': {
        drone(st, rng, t0, bar, spec.root - 12, 0.15);
        organ(st, t0, bar * 0.98, ch[0]! - 12, 0.2, 0.05);
        for (const nn of ch) organ(st, t0, bar * 0.98, nn + 12, 0.07, 0.1);
        for (const nn of ch)
          choir(st, rng, t0, bar * 0.96, nn + 12, 0.12, { vowel: 'a', voices: 6 });
        for (let h = 0; h < 2; h++) {
          const nn = scaleNote(spec, deg + motif[(b * 2 + h) % motif.length]!, 2);
          choir(st, rng, t0 + h * beat * 2, beat * 1.8, nn, 0.16, {
            vowel: 'a',
            vowelTo: 'o',
            voices: 7,
            marcato: true,
            r: 0.4,
          });
        }
        const tf = midiToFreq(spec.root);
        for (let i = 0; i < 4; i++)
          timpani(st, rng, t0 + i * beat, i % 2 ? midiToFreq(spec.root + 7) : tf, 0.28);
        if (b % 2 === 1)
          for (let k = 0; k < 12; k++)
            timpani(st, rng, t0 + beat * 2 + k * beat * (2 / 12), tf, 0.1 + k * 0.03, 0.7);
        if (b % 2 === 0) {
          bell(st, t0, ch[0]! + 24, 0.5, 4);
          bell(st, t0 + beat * 2, ch[0]! + 30, 0.3, 3); // tritone toll
        }
        break;
      }
      case 'tension': {
        organ(st, t0, bar * 0.98, ch[0]! - 12, 0.25, 0.04);
        drone(st, rng, t0, bar, spec.root - 12, 0.14);
        for (const nn of ch)
          choir(st, rng, t0, bar * 0.95, nn + 12, 0.1, { vowel: 'u', vowelTo: 'o' });
        bell(st, t0, ch[0]! + 24, 0.35, 6);
        timpani(st, rng, t0, midiToFreq(spec.root), 0.28, 2.5);
        timpani(st, rng, t0 + beat * 2.5, midiToFreq(spec.root), 0.17, 2);
        break;
      }
    }
  }

  const wetMix = spec.style === 'combatDrive' ? 0.25 : spec.style === 'boss' ? 0.32 : 0.42;
  const decay = spec.style === 'menu' || spec.style === 'tension' ? 4.2 : 2.8;
  let out = cathedral(st.buf, wetMix, decay);
  // Clear the sub rumble below the timpani fundamentals; keep the loop seamless.
  loopFilter(out, new Biquad('hp', 34, 0.7));
  // tame the 80-130 Hz build-up of drone + pedal + timpani, open up the top a little
  loopFilter(out, new Biquad('lowshelf', 140, 0.7, -3));
  loopFilter(out, new Biquad('highshelf', 1800, 0.7, 5));
  for (let i = 0; i < out.length; i++) out[i] = Math.tanh(out[i]! * 1.2);
  // resample to the target rate (anti-alias lowpass, then linear interpolation)
  if (sampleRate !== SR) {
    loopFilter(out, new Biquad('lp', sampleRate * 0.45, 0.7));
    loopFilter(out, new Biquad('lp', sampleRate * 0.45, 0.7));
    const len = Math.round((out.length * sampleRate) / SR);
    const rs = new Float32Array(len);
    for (let i = 0; i < len; i++) {
      const x = (i * SR) / sampleRate;
      const j = Math.floor(x);
      const f = x - j;
      rs[i] = out[j % out.length]! * (1 - f) + out[(j + 1) % out.length]! * f;
    }
    out = rs;
  }
  return normalize(out, 0.8);
}
