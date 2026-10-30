/**
 * Interprets data-driven sound recipes (recipes.ts) with the DSP toolkit (dsp.ts).
 * A recipe is a stack of layers (transient, sub thump, filtered noise, mechanical rattle,
 * formant voice, granular chitter, electric crackle, ...) plus a mastering chain
 * (EQ, saturation, compression, reverb). Each recipe renders several random variants.
 */
import type { SoundBus } from '@sms/shared';
import {
  Biquad,
  compress,
  dcBlock,
  envAt,
  envLength,
  fadeEdges,
  filterBuffer,
  grit,
  makeLoop,
  mixInto,
  Noise,
  peak,
  reverb,
  Rng,
  saturate,
  secToSamples,
  SR,
  sweep,
  trimTail,
  vowel,
  waveAt,
  asymDrive,
  convReverb,
  type ConvReverbOpts,
  hashString,
  type CompressorOpts,
  type Env,
  type FilterType,
  type NoiseColor,
  type ReverbOpts,
  type Wave,
} from './dsp.js';

/** A constant, a [from, to] sweep, or a multi-point contour over the layer (or `sweepTime`). */
export type Range = number | [number, number, ...number[]];

interface LayerBase {
  /** Start offset, seconds. */
  at?: number;
  /** Linear gain (default 1). */
  gain?: number;
  env: Env;
  /** Seconds for Range sweeps (default: envelope length). */
  sweepTime?: number;
  /** Bend of sweeps (<1 fast start, >1 slow start). */
  curve?: number;
}

export interface FilterSpec {
  type: FilterType;
  freq: Range;
  q?: number;
  gain?: number;
}

export interface ToneLayer extends LayerBase {
  kind: 'tone';
  wave: Wave;
  freq: Range;
  /** FM: modulator = carrier * ratio, index swept over the layer. */
  fm?: { ratio: number; index: Range };
  /** Vibrato / tremble: rate Hz, depth in semitones. */
  vib?: { rate: number; depth: number };
  /** Second detuned oscillator, cents. */
  detune?: number;
  filter?: FilterSpec;
  drive?: number;
}

export interface NoiseLayer extends LayerBase {
  kind: 'noise';
  color: NoiseColor;
  filter?: FilterSpec;
  filter2?: FilterSpec;
  /** Random amplitude flutter (0..1), e.g. flame roar turbulence. */
  flutter?: { rate: number; depth: number };
  drive?: number;
}

/** Sharp transient: high-passed noise crack + optional sine pop. */
export interface ClickLayer {
  kind: 'click';
  at?: number;
  gain?: number;
  /** Duration of the crack, seconds. */
  dur: number;
  hp?: number;
  /** Optional sine pop frequency. */
  tone?: number;
}

/** Inharmonic struck metal: clanks, rattles, armour hits. */
export interface MetalLayer {
  kind: 'metal';
  at?: number;
  gain?: number;
  freq: number;
  /** Partial ratios (default bar-like 1, 2.76, 5.4, 8.93). */
  partials?: number[];
  /** -60 dB decay seconds. */
  decay: number;
  /** Repeats (rattle) spaced by `spacing` [min, max] seconds. */
  count?: number;
  spacing?: [number, number];
  /** Noise share of each hit 0..1. */
  noise?: number;
}

/** Granular cloud of tiny bursts: chitter, skitter, debris, sizzle. */
export interface GrainLayer extends LayerBase {
  kind: 'grains';
  /** Grains per second. */
  rate: Range;
  dur: [number, number];
  freq: [number, number];
  q?: number;
  src: 'noise' | 'chirp' | 'click';
  /** Chirp end/start frequency ratio. */
  chirp?: number;
  /**
   * Periodic grains (stridulation / mandible ratchet) instead of a Poisson cloud;
   * the value is the timing jitter fraction (0 = machine-exact, 0.15 = organic).
   */
  regular?: number;
}

/** Voice through formant filters: growls, grunts, screeches, roars. */
export interface FormantLayer extends LayerBase {
  kind: 'formant';
  f0: Range;
  /** Vowels glided across the layer. */
  vowels: Array<string | [number, number, number]>;
  /** Formant shift multiplier (bigger beast = lower). */
  shift?: number;
  q?: number;
  /** Random pitch jitter 0..1 (rough throat). */
  jitter?: number;
  /** Breath noise share 0..1. */
  breath?: number;
  /** Subharmonic (period-doubling growl) share 0..1. */
  sub?: number;
  vib?: { rate: number; depth: number };
  wave?: 'saw' | 'pulse';
}

/**
 * Creature voice (v0.4): a physically-flavoured throat. Source = Rosenberg glottal pulses
 * (derivative) with per-period jitter / shimmer, `voices` detuned unison throats, optional
 * period-doubling rasp; aspiration noise is gated by the glottal open phase (breath that
 * rides the pulses, not a separate hiss). Filtered by 5 parallel formants: F1-F3 glide
 * through `vowels`, F4/F5 are fixed throat/mandible resonances (2.5-6 kHz) that give
 * Tyranids their wet, rasping edge. Finished with asymmetric drive.
 */
export interface CreatureLayer extends LayerBase {
  kind: 'creature';
  f0: Range;
  vowels: Array<string | [number, number, number]>;
  /** Formant shift multiplier (bigger beast = lower). */
  shift?: number;
  /** Fixed throat resonances F4/F5 in Hz (not shifted). Default [3100, 4700]. */
  throat?: [number, number];
  /** Formant bandwidth factor (default 1; lower = wider, rougher). */
  q?: number;
  /** Unison throats (default 3) spread over ±`detune` cents. */
  voices?: number;
  detune?: number;
  /** Per-period pitch jitter 0..1. */
  jitter?: number;
  /** Per-period amplitude shimmer 0..1. */
  shimmer?: number;
  /** Period-doubling rasp 0..1 (alternate pulses weaker + later = growl). */
  rasp?: number;
  /** Gated aspiration share 0..1. */
  breath?: number;
  /** Glottal open quotient (0.3 pressed / shrieky .. 0.8 breathy). */
  oq?: number;
  vib?: { rate: number; depth: number };
  /** Asymmetric drive amount (default 2). */
  drive?: number;
}

/** Sparse electric discharges. */
export interface CrackleLayer extends LayerBase {
  kind: 'crackle';
  density: Range;
  hp?: number;
}

export type Layer =
  | ToneLayer
  | NoiseLayer
  | ClickLayer
  | MetalLayer
  | GrainLayer
  | FormantLayer
  | CreatureLayer
  | CrackleLayer;

export interface PostChain {
  eq?: FilterSpec[];
  grit?: number;
  drive?: number;
  comp?: CompressorOpts;
  reverb?: ReverbOpts;
  /** Convolution reverb with a synthetic IR (applied after `reverb`). */
  conv?: ConvReverbOpts;
  /** Asymmetric drive after normalisation (wet throaty distortion). */
  asym?: number;
  /** Final peak level (default 0.89). */
  peak?: number;
}

export interface Recipe {
  key: string;
  description: string;
  bus: SoundBus;
  volume: number;
  maxVoices: number;
  /** Voice priority 0..10. */
  priority: number;
  /** Rendered variants (default 3). */
  variants?: number;
  /** Per-variant random pitch (fraction) and time stretch (fraction). */
  vary?: { pitch?: number; time?: number };
  /** Duck music by this fraction. */
  duck?: number;
  /** Seamless loop: render `length` s and cross-fade `xf` s. */
  loop?: { length: number; xf: number };
  layers: Layer[];
  post?: PostChain;
}

function rangeAt(r: Range, t: number, dur: number, curve = 1, lin = false): number {
  if (typeof r === 'number') return r;
  if (r.length === 2) return sweep(r[0], r[1], t, dur, lin, curve);
  const seg = dur / (r.length - 1);
  const k = Math.min(r.length - 2, Math.max(0, Math.floor(t / seg)));
  return sweep(r[k], r[k + 1], t - k * seg, seg, lin, curve);
}

function scaleRange(r: Range, k: number): Range {
  return typeof r === 'number' ? r * k : (r.map((v) => v * k) as Range);
}

function stretchEnv(e: Env, k: number): Env {
  return { ...e, d: e.d * k, h: e.h !== undefined ? e.h * k : undefined };
}

function layerLength(l: Layer): number {
  switch (l.kind) {
    case 'click':
      return l.dur + 0.01;
    case 'metal':
      return (l.count ?? 1) * (l.spacing?.[1] ?? 0) + l.decay;
    default:
      return envLength(l.env);
  }
}

function renderTone(l: ToneLayer, rng: Rng, n: number): Float32Array {
  const out = new Float32Array(n);
  const st = l.sweepTime ?? envLength(l.env);
  let ph = rng.next();
  let ph2 = rng.next();
  let mph = 0;
  const bq = l.filter ? new Biquad() : null;
  const det = Math.pow(2, (l.detune ?? 0) / 1200);
  for (let i = 0; i < n; i++) {
    const t = i / SR;
    let f = rangeAt(l.freq, t, st, l.curve);
    if (l.vib) f *= Math.pow(2, (Math.sin(Math.PI * 2 * l.vib.rate * t) * l.vib.depth) / 12);
    let pm = 0;
    if (l.fm) {
      const idx = rangeAt(l.fm.index, t, st, l.curve, true);
      mph = (mph + (f * l.fm.ratio) / SR) % 1;
      pm = (idx * Math.sin(Math.PI * 2 * mph)) / (Math.PI * 2);
    }
    ph = (ph + f / SR) % 1;
    let v = waveAt(l.wave, (ph + pm + 1) % 1);
    if (l.detune) {
      ph2 = (ph2 + (f * det) / SR) % 1;
      v = (v + waveAt(l.wave, (ph2 + pm + 1) % 1)) * 0.6;
    }
    if (bq) {
      if ((i & 31) === 0)
        bq.set(
          l.filter!.type,
          rangeAt(l.filter!.freq, t, st, l.curve),
          l.filter!.q,
          l.filter!.gain,
        );
      v = bq.process(v);
    }
    out[i] = v * envAt(l.env, t);
  }
  if (l.drive) saturate(out, l.drive);
  return out;
}

function renderNoise(l: NoiseLayer, rng: Rng, n: number): Float32Array {
  const out = new Float32Array(n);
  const st = l.sweepTime ?? envLength(l.env);
  const src = new Noise(rng, l.color);
  const f1 = l.filter ? new Biquad() : null;
  const f2 = l.filter2 ? new Biquad() : null;
  let flut = 1;
  let flutTarget = 1;
  for (let i = 0; i < n; i++) {
    const t = i / SR;
    let v = src.next();
    if ((i & 31) === 0) {
      if (f1)
        f1.set(
          l.filter!.type,
          rangeAt(l.filter!.freq, t, st, l.curve),
          l.filter!.q,
          l.filter!.gain,
        );
      if (f2)
        f2.set(
          l.filter2!.type,
          rangeAt(l.filter2!.freq, t, st, l.curve),
          l.filter2!.q,
          l.filter2!.gain,
        );
    }
    if (l.flutter && i % Math.max(1, Math.round(SR / l.flutter.rate)) === 0)
      flutTarget = 1 - l.flutter.depth * rng.next();
    flut += (flutTarget - flut) * 0.002;
    if (f1) v = f1.process(v);
    if (f2) v = f2.process(v);
    out[i] = v * envAt(l.env, t) * flut;
  }
  if (l.drive) saturate(out, l.drive);
  return out;
}

function renderClick(l: ClickLayer, rng: Rng, n: number): Float32Array {
  const out = new Float32Array(n);
  const len = Math.min(n, secToSamples(l.dur));
  const hp = new Biquad('hp', l.hp ?? 2500, 0.7);
  for (let i = 0; i < len; i++) {
    const t = i / SR;
    const e = Math.exp((-6.9 * t) / l.dur);
    let v = hp.process(rng.bi()) * e;
    if (l.tone)
      v += Math.sin(Math.PI * 2 * l.tone * t) * Math.exp((-6.9 * t) / (l.dur * 1.5)) * 0.7;
    out[i] = v;
  }
  return out;
}

function renderMetal(l: MetalLayer, rng: Rng, n: number): Float32Array {
  const out = new Float32Array(n);
  const parts = l.partials ?? [1, 2.76, 5.4, 8.93];
  const count = l.count ?? 1;
  let at = 0;
  for (let c = 0; c < count; c++) {
    const amp = c === 0 ? 1 : rng.range(0.45, 0.85);
    const fk = rng.range(0.94, 1.06);
    const off = secToSamples(at);
    const len = secToSamples(l.decay);
    const hp = new Biquad('bp', l.freq * 3 * fk, 0.9);
    for (let i = 0; i < len && off + i < n; i++) {
      const t = i / SR;
      let v = 0;
      for (let p = 0; p < parts.length; p++) {
        const dec = l.decay / (1 + p * 0.7);
        v +=
          (Math.sin(Math.PI * 2 * l.freq * fk * parts[p] * t) * Math.exp((-6.9 * t) / dec)) /
          (1 + p * 0.6);
      }
      const nz =
        hp.process(rng.bi()) *
        Math.exp((-6.9 * t) / Math.min(0.03, l.decay)) *
        (l.noise ?? 0.4) *
        3;
      out[off + i] += (v * (1 - (l.noise ?? 0.4) * 0.5) + nz) * amp;
    }
    if (l.spacing) at += rng.range(l.spacing[0], l.spacing[1]);
  }
  return out;
}

function renderGrains(l: GrainLayer, rng: Rng, n: number): Float32Array {
  const out = new Float32Array(n);
  const total = Math.min(envLength(l.env), n / SR);
  const st = l.sweepTime ?? total;
  let t = 0;
  while (t < total) {
    const rate = Math.max(1, rangeAt(l.rate, t, st, l.curve, true));
    t +=
      l.regular !== undefined
        ? (1 + rng.bi() * l.regular) / rate
        : -Math.log(1 - rng.next() * 0.999) / rate;
    if (t >= total) break;
    const amp = envAt(l.env, t) * rng.range(0.35, 1);
    const d = rng.range(l.dur[0], l.dur[1]);
    const f = rng.range(l.freq[0], l.freq[1]);
    const len = secToSamples(d);
    const off = secToSamples(t);
    const bp = new Biquad('bp', f, l.q ?? 4);
    let ph = 0;
    for (let i = 0; i < len && off + i < n; i++) {
      const x = i / len;
      const w = Math.sin(Math.PI * x);
      let v: number;
      if (l.src === 'noise') v = bp.process(rng.bi()) * 2;
      else if (l.src === 'click') v = bp.process(i < 3 ? rng.bi() * 8 : 0) * 3;
      else {
        const ff = f * Math.pow(l.chirp ?? 1.5, x);
        ph = (ph + ff / SR) % 1;
        v = Math.sin(Math.PI * 2 * ph);
      }
      out[off + i] += v * w * w * amp;
    }
  }
  return out;
}

function renderFormant(l: FormantLayer, rng: Rng, n: number): Float32Array {
  const out = new Float32Array(n);
  const st = l.sweepTime ?? envLength(l.env);
  const shift = l.shift ?? 1;
  const vs = l.vowels.map(vowel);
  const bands = [new Biquad(), new Biquad(), new Biquad()];
  const bGain = [1, 0.7, 0.35];
  const breathN = new Noise(rng, 'white');
  let ph = 0;
  let jit = 0;
  let subFlip = 1;
  for (let i = 0; i < n; i++) {
    const t = i / SR;
    if ((i & 31) === 0) {
      const x = Math.min(0.9999, t / Math.max(1e-4, st)) * (vs.length - 1);
      const k = Math.floor(x);
      const fr = x - k;
      const a = vs[k];
      const b = vs[Math.min(vs.length - 1, k + 1)];
      for (let j = 0; j < 3; j++)
        bands[j].set('bp', (a[j] + (b[j] - a[j]) * fr) * shift, (l.q ?? 6) * (1 + j * 0.5));
      if (l.jitter) jit += (rng.bi() * l.jitter - jit) * 0.3;
    }
    let f0 = rangeAt(l.f0, t, st, l.curve) * (1 + jit * 0.25);
    if (l.vib) f0 *= Math.pow(2, (Math.sin(Math.PI * 2 * l.vib.rate * t) * l.vib.depth) / 12);
    const prev = ph;
    ph = (ph + f0 / SR) % 1;
    if (ph < prev) subFlip = -subFlip;
    let src = l.wave === 'pulse' ? waveAt('pulse', ph, 0.3) : waveAt('saw', ph);
    if (l.sub) src = src * (1 - l.sub) + src * subFlip * l.sub * (ph < 0.5 ? 1 : 0.4);
    src += breathN.next() * (l.breath ?? 0.15);
    let v = 0;
    for (let j = 0; j < 3; j++) v += bands[j].process(src) * bGain[j];
    out[i] = v * envAt(l.env, t) * 2.5;
  }
  return out;
}

/** Rosenberg glottal flow at phase p (0..1) with open quotient oq. */
function glottal(p: number, oq: number): number {
  const tp = oq * 0.66;
  const tn = oq * 0.34;
  if (p < tp) return 0.5 * (1 - Math.cos((Math.PI * p) / tp));
  if (p < tp + tn) return Math.cos((Math.PI * (p - tp)) / (2 * tn));
  return 0;
}

function renderCreature(l: CreatureLayer, rng: Rng, n: number): Float32Array {
  const out = new Float32Array(n);
  const st = l.sweepTime ?? envLength(l.env);
  const shift = l.shift ?? 1;
  const vs = l.vowels.map(vowel);
  const throat = l.throat ?? [3100, 4700];
  const qk = l.q ?? 1;
  const bands = [0, 1, 2, 3, 4].map(() => new Biquad());
  const bGain = [1, 0.8, 0.55, 0.45, 0.32];
  const bQ = [3.5, 5, 6, 7, 6];
  const oq = l.oq ?? 0.55;
  const nv = Math.max(1, l.voices ?? 3);
  const det = l.detune ?? 18;
  const voices = Array.from({ length: nv }, (_, k) => ({
    ph: rng.next(),
    prevG: 0,
    cents: nv === 1 ? 0 : -det + (2 * det * k) / (nv - 1) + rng.bi() * det * 0.2,
    jit: 1,
    amp: 1,
    odd: false,
    drift: 0,
  }));
  const asp = new Noise(rng, 'white');
  const aspHp = new Biquad('hp', 700, 0.7);
  const jitter = l.jitter ?? 0.4;
  const shimmer = l.shimmer ?? 0.3;
  const rasp = l.rasp ?? 0;
  const breath = l.breath ?? 0.25;
  for (let i = 0; i < n; i++) {
    const t = i / SR;
    if ((i & 31) === 0) {
      const x = Math.min(0.9999, t / Math.max(1e-4, st)) * (vs.length - 1);
      const k = Math.floor(x);
      const fr = x - k;
      const a = vs[k];
      const b = vs[Math.min(vs.length - 1, k + 1)];
      for (let j = 0; j < 3; j++)
        bands[j].set('bp', Math.min(SR * 0.45, (a[j] + (b[j] - a[j]) * fr) * shift), bQ[j] * qk);
      bands[3].set('bp', throat[0], bQ[3] * qk);
      bands[4].set('bp', Math.min(SR * 0.45, throat[1]), bQ[4] * qk);
    }
    let f0 = rangeAt(l.f0, t, st, l.curve);
    if (l.vib) f0 *= Math.pow(2, (Math.sin(Math.PI * 2 * l.vib.rate * t) * l.vib.depth) / 12);
    let src = 0;
    let open = 0;
    for (const v of voices) {
      // slow random drift per throat so the unison never phases statically
      v.drift += (rng.bi() * 0.6 - v.drift) * 0.0008;
      const f =
        f0 * Math.pow(2, (v.cents + v.drift * det) / 1200) * v.jit * (v.odd ? 1 + rasp * 0.12 : 1);
      v.ph += f / SR;
      if (v.ph >= 1) {
        v.ph -= 1;
        v.jit = 1 + rng.bi() * jitter * 0.07;
        v.amp = 1 + rng.bi() * shimmer * 0.45;
        v.odd = !v.odd;
      }
      const g = glottal(v.ph, oq);
      const dg = (g - v.prevG) * (SR / Math.max(20, f)) * 0.12;
      v.prevG = g;
      const a = v.amp * (v.odd ? 1 - rasp * 0.7 : 1);
      src += dg * a;
      open += g * a;
    }
    src /= Math.sqrt(nv);
    open /= nv;
    // aspiration rides the open phase (turbulence through the opening throat)
    src += aspHp.process(asp.next()) * breath * (0.2 + open * 1.6);
    let v = 0;
    for (let j = 0; j < 5; j++) v += bands[j].process(src) * bGain[j];
    out[i] = v * envAt(l.env, t) * 2.2;
  }
  asymDrive(out, l.drive ?? 2, 0.3);
  return out;
}

function renderCrackle(l: CrackleLayer, rng: Rng, n: number): Float32Array {
  const out = new Float32Array(n);
  const st = l.sweepTime ?? envLength(l.env);
  const hp = new Biquad('hp', l.hp ?? 1800, 0.8);
  let burst = 0;
  for (let i = 0; i < n; i++) {
    const t = i / SR;
    const dens = rangeAt(l.density, t, st, l.curve, true);
    if (rng.next() < dens / SR) burst = rng.range(20, 140);
    let v = 0;
    if (burst > 0) {
      v = rng.bi() * Math.min(1, burst / 30);
      burst--;
    }
    out[i] = hp.process(v) * envAt(l.env, t) * 1.6;
  }
  return out;
}

function renderLayer(l: Layer, rng: Rng, n: number): Float32Array {
  switch (l.kind) {
    case 'tone':
      return renderTone(l, rng, n);
    case 'noise':
      return renderNoise(l, rng, n);
    case 'click':
      return renderClick(l, rng, n);
    case 'metal':
      return renderMetal(l, rng, n);
    case 'grains':
      return renderGrains(l, rng, n);
    case 'formant':
      return renderFormant(l, rng, n);
    case 'creature':
      return renderCreature(l, rng, n);
    case 'crackle':
      return renderCrackle(l, rng, n);
  }
}

/** Applies a variant's pitch / time factors to one layer. */
function varyLayer(l: Layer, p: number, tk: number, rng: Rng): Layer {
  const at = (l.at ?? 0) * tk;
  switch (l.kind) {
    case 'tone':
      return {
        ...l,
        at,
        env: stretchEnv(l.env, tk),
        freq: scaleRange(l.freq, p),
        filter: l.filter && { ...l.filter, freq: scaleRange(l.filter.freq, p) },
        sweepTime: l.sweepTime && l.sweepTime * tk,
      };
    case 'noise':
      return {
        ...l,
        at,
        env: stretchEnv(l.env, tk),
        filter: l.filter && { ...l.filter, freq: scaleRange(l.filter.freq, p) },
        filter2: l.filter2 && { ...l.filter2, freq: scaleRange(l.filter2.freq, p) },
        sweepTime: l.sweepTime && l.sweepTime * tk,
      };
    case 'click':
      return { ...l, at, hp: (l.hp ?? 2500) * p, tone: l.tone && l.tone * p };
    case 'metal':
      return { ...l, at, freq: l.freq * p * rng.range(0.97, 1.03), decay: l.decay * tk };
    case 'grains':
      return {
        ...l,
        at,
        env: stretchEnv(l.env, tk),
        freq: [l.freq[0] * p, l.freq[1] * p],
        sweepTime: l.sweepTime && l.sweepTime * tk,
      };
    case 'formant':
      return {
        ...l,
        at,
        env: stretchEnv(l.env, tk),
        f0: scaleRange(l.f0, p),
        shift: (l.shift ?? 1) * (1 + (p - 1) * 0.5),
        sweepTime: l.sweepTime && l.sweepTime * tk,
      };
    case 'creature':
      return {
        ...l,
        at,
        env: stretchEnv(l.env, tk),
        f0: scaleRange(l.f0, p),
        shift: (l.shift ?? 1) * (1 + (p - 1) * 0.5),
        sweepTime: l.sweepTime && l.sweepTime * tk,
      };
    case 'crackle':
      return { ...l, at, env: stretchEnv(l.env, tk), sweepTime: l.sweepTime && l.sweepTime * tk };
  }
}

/** Renders one variant of a recipe (deterministic per key + variant index). */
export function renderRecipe(r: Recipe, variant = 0): Float32Array {
  const rng = new Rng(hashString(`${r.key}#${variant}`));
  const vp = r.vary?.pitch ?? 0.05;
  const vt = r.vary?.time ?? 0.08;
  // variant 0 is the "reference" take; the others drift around it
  const p = variant === 0 ? 1 : 1 + rng.range(-vp, vp);
  const tk = variant === 0 ? 1 : 1 + rng.range(-vt, vt);
  const layers = r.layers.map((l) => varyLayer(l, p, tk, rng));
  const body = Math.max(...layers.map((l) => (l.at ?? 0) + layerLength(l)));
  const tail = r.post?.reverb ? 0.12 + (r.post.reverb.size ?? 0.5) * 0.75 : 0.02;
  const len = r.loop ? r.loop.length + r.loop.xf : body + tail;
  const n = secToSamples(len);
  let buf: Float32Array = new Float32Array(n);
  for (const l of layers) {
    const lr = new Rng(rng.next() * 4294967296);
    const off = secToSamples(l.at ?? 0);
    const part = renderLayer(l, lr, Math.max(1, n - off));
    mixInto(buf, part, l.at ?? 0, l.gain ?? 1);
  }
  const post = r.post ?? {};
  for (const e of post.eq ?? [])
    filterBuffer(buf, e.type, typeof e.freq === 'number' ? e.freq : e.freq[0], e.q, e.gain);
  if (post.grit) grit(buf, post.grit);
  if (post.drive) saturate(buf, post.drive);
  const pk = peak(buf);
  if (pk > 1e-6) for (let i = 0; i < n; i++) buf[i] /= pk;
  if (post.comp) compress(buf, post.comp);
  if (post.asym) {
    asymDrive(buf, post.asym, 0.3);
    const p2 = peak(buf);
    if (p2 > 1e-6) for (let i = 0; i < buf.length; i++) buf[i] /= p2;
  }
  if (post.reverb) reverb(buf, post.reverb);
  if (post.conv) {
    const wet = convReverb(buf, post.conv);
    if (r.loop) {
      // circular: fold the tail back over the start so the loop stays seamless
      buf = wet.slice(0, n);
      for (let i = n; i < wet.length; i++) buf[i % n] += wet[i];
    } else buf = wet;
  }
  dcBlock(buf);
  if (r.loop) buf = makeLoop(buf, r.loop.xf);
  else buf = trimTail(buf, 0.004 * peak(buf));
  const pk2 = peak(buf);
  const target = post.peak ?? 0.89;
  if (pk2 > 1e-6) for (let i = 0; i < buf.length; i++) buf[i] *= target / pk2;
  if (!r.loop) fadeEdges(buf, 0.0005, 0.02);
  return buf;
}

export function variantCount(r: Recipe): number {
  return r.loop ? 1 : (r.variants ?? 3);
}
