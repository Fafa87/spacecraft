/**
 * Small offline DSP toolkit for the procedural SFX pipeline (see recipes.ts).
 * Everything is deterministic for a given seed and renders mono Float32 at SR.
 */
export const SR = 44100;
const TAU = Math.PI * 2;

/** Seeded PRNG (mulberry32). */
export class Rng {
  private s: number;
  constructor(seed: number) {
    this.s = seed >>> 0 || 1;
  }
  next(): number {
    let t = (this.s = (this.s + 0x6d2b79f5) >>> 0);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }
  range(a: number, b: number): number {
    return a + (b - a) * this.next();
  }
  /** Uniform in [-1, 1). */
  bi(): number {
    return this.next() * 2 - 1;
  }
}

/** Stable string hash (seeds per sound key / variant). */
export function hashString(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}

export const secToSamples = (s: number): number => Math.max(0, Math.round(s * SR));

// ---------------------------------------------------------------- envelopes

/**
 * Amplitude envelope. `a` attack, `h` hold at full level, `d` time for the decay to fall
 * to -60 dB (towards `s`), `s` sustain level held until `len`, then `r` release.
 * `shape` > 1 makes the attack ease in.
 */
export interface Env {
  a?: number;
  h?: number;
  d: number;
  s?: number;
  len?: number;
  r?: number;
  shape?: number;
}

export function envAt(e: Env, t: number): number {
  const a = e.a ?? 0.002;
  const h = e.h ?? 0;
  const s = e.s ?? 0;
  if (t < 0) return 0;
  let v: number;
  if (t < a) v = Math.pow(t / a, e.shape ?? 1);
  else if (t < a + h) v = 1;
  else v = s + (1 - s) * Math.exp((-6.9 * (t - a - h)) / Math.max(1e-4, e.d));
  if (e.len !== undefined && t > e.len) {
    const r = e.r ?? 0.05;
    v *= Math.max(0, 1 - (t - e.len) / r);
  }
  return v;
}

/** Envelope length until it is effectively silent. */
export function envLength(e: Env): number {
  const a = e.a ?? 0.002;
  const h = e.h ?? 0;
  if (e.len !== undefined) return e.len + (e.r ?? 0.05);
  return a + h + e.d;
}

/** Value swept from `from` to `to` over `dur` s; exponential unless `lin`. `k` bends the curve. */
export function sweep(
  from: number,
  to: number,
  t: number,
  dur: number,
  lin = false,
  k = 1,
): number {
  const x = Math.pow(Math.min(1, Math.max(0, t / Math.max(1e-4, dur))), k);
  if (lin || from <= 0 || to <= 0) return from + (to - from) * x;
  return from * Math.pow(to / from, x);
}

// ---------------------------------------------------------------- oscillators / noise

export type Wave = 'sine' | 'saw' | 'square' | 'tri' | 'pulse';

/** Naive-but-softened waveform at phase p in [0,1). */
export function waveAt(w: Wave, p: number, width = 0.5): number {
  switch (w) {
    case 'sine':
      return Math.sin(TAU * p);
    case 'saw':
      return 2 * p - 1;
    case 'square':
      return p < 0.5 ? 1 : -1;
    case 'pulse':
      return p < width ? 1 : -1;
    case 'tri':
      return p < 0.5 ? 4 * p - 1 : 3 - 4 * p;
  }
}

export type NoiseColor = 'white' | 'pink' | 'brown';

/** Stateful coloured noise source. */
export class Noise {
  private b0 = 0;
  private b1 = 0;
  private b2 = 0;
  private br = 0;
  constructor(
    private rng: Rng,
    private color: NoiseColor = 'white',
  ) {}
  next(): number {
    const w = this.rng.bi();
    if (this.color === 'white') return w;
    if (this.color === 'pink') {
      // Paul Kellet's economy pink filter
      this.b0 = 0.99765 * this.b0 + w * 0.099046;
      this.b1 = 0.963 * this.b1 + w * 0.2965164;
      this.b2 = 0.57 * this.b2 + w * 1.0526913;
      return (this.b0 + this.b1 + this.b2 + w * 0.1848) * 0.22;
    }
    this.br = (this.br + 0.02 * w) / 1.02;
    return this.br * 3.5;
  }
}

// ---------------------------------------------------------------- filters

export type FilterType = 'lp' | 'hp' | 'bp' | 'peak' | 'lowshelf' | 'highshelf' | 'notch';

/** RBJ biquad, transposed direct form II. */
export class Biquad {
  private b0 = 1;
  private b1 = 0;
  private b2 = 0;
  private a1 = 0;
  private a2 = 0;
  private z1 = 0;
  private z2 = 0;
  constructor(type?: FilterType, freq?: number, q = 0.707, gainDb = 0) {
    if (type && freq) this.set(type, freq, q, gainDb);
  }
  set(type: FilterType, freq: number, q = 0.707, gainDb = 0): this {
    const f = Math.min(SR * 0.49, Math.max(10, freq));
    const w = (TAU * f) / SR;
    const cw = Math.cos(w);
    const sw = Math.sin(w);
    const alpha = sw / (2 * Math.max(0.05, q));
    const A = Math.pow(10, gainDb / 40);
    let b0: number, b1: number, b2: number, a0: number, a1: number, a2: number;
    switch (type) {
      case 'lp':
        b0 = (1 - cw) / 2;
        b1 = 1 - cw;
        b2 = b0;
        a0 = 1 + alpha;
        a1 = -2 * cw;
        a2 = 1 - alpha;
        break;
      case 'hp':
        b0 = (1 + cw) / 2;
        b1 = -(1 + cw);
        b2 = b0;
        a0 = 1 + alpha;
        a1 = -2 * cw;
        a2 = 1 - alpha;
        break;
      case 'bp':
        b0 = alpha;
        b1 = 0;
        b2 = -alpha;
        a0 = 1 + alpha;
        a1 = -2 * cw;
        a2 = 1 - alpha;
        break;
      case 'notch':
        b0 = 1;
        b1 = -2 * cw;
        b2 = 1;
        a0 = 1 + alpha;
        a1 = -2 * cw;
        a2 = 1 - alpha;
        break;
      case 'peak':
        b0 = 1 + alpha * A;
        b1 = -2 * cw;
        b2 = 1 - alpha * A;
        a0 = 1 + alpha / A;
        a1 = -2 * cw;
        a2 = 1 - alpha / A;
        break;
      case 'lowshelf': {
        const sa = 2 * Math.sqrt(A) * alpha;
        b0 = A * (A + 1 - (A - 1) * cw + sa);
        b1 = 2 * A * (A - 1 - (A + 1) * cw);
        b2 = A * (A + 1 - (A - 1) * cw - sa);
        a0 = A + 1 + (A - 1) * cw + sa;
        a1 = -2 * (A - 1 + (A + 1) * cw);
        a2 = A + 1 + (A - 1) * cw - sa;
        break;
      }
      case 'highshelf': {
        const sa = 2 * Math.sqrt(A) * alpha;
        b0 = A * (A + 1 + (A - 1) * cw + sa);
        b1 = -2 * A * (A - 1 + (A + 1) * cw);
        b2 = A * (A + 1 + (A - 1) * cw - sa);
        a0 = A + 1 - (A - 1) * cw + sa;
        a1 = 2 * (A - 1 - (A + 1) * cw);
        a2 = A + 1 - (A - 1) * cw - sa;
        break;
      }
    }
    this.b0 = b0 / a0;
    this.b1 = b1 / a0;
    this.b2 = b2 / a0;
    this.a1 = a1 / a0;
    this.a2 = a2 / a0;
    return this;
  }
  process(x: number): number {
    const y = this.b0 * x + this.z1;
    this.z1 = this.b1 * x - this.a1 * y + this.z2;
    this.z2 = this.b2 * x - this.a2 * y;
    return y;
  }
}

/** Filters a whole buffer in place with a (possibly swept) biquad. */
export function filterBuffer(
  buf: Float32Array,
  type: FilterType,
  freq: number | ((t: number) => number),
  q = 0.707,
  gainDb = 0,
): Float32Array {
  const bq = new Biquad();
  const f = typeof freq === 'number' ? () => freq : freq;
  for (let i = 0; i < buf.length; i++) {
    if ((i & 31) === 0) bq.set(type, f(i / SR), q, gainDb);
    buf[i] = bq.process(buf[i]);
  }
  return buf;
}

// ---------------------------------------------------------------- dynamics / colour

/** Soft saturation (normalised tanh). drive ~1 = gentle, 4+ = crunchy. */
export function saturate(buf: Float32Array, drive: number, mix = 1): Float32Array {
  if (drive <= 0) return buf;
  const n = Math.tanh(drive);
  for (let i = 0; i < buf.length; i++) {
    const d = Math.tanh(buf[i] * drive) / n;
    buf[i] = buf[i] * (1 - mix) + d * mix;
  }
  return buf;
}

/** Asymmetric "tube" fold for gritty layers (adds even harmonics). */
export function grit(buf: Float32Array, amount: number): Float32Array {
  for (let i = 0; i < buf.length; i++) {
    const x = buf[i] * (1 + amount * 3);
    buf[i] = x >= 0 ? Math.tanh(x) : Math.tanh(x * 0.6) / 0.6 / (1 + amount);
  }
  return buf;
}

export interface CompressorOpts {
  /** dBFS */
  threshold: number;
  ratio: number;
  attack?: number;
  release?: number;
  /** dB */
  makeup?: number;
}

/** Feed-forward peak compressor. */
export function compress(buf: Float32Array, o: CompressorOpts): Float32Array {
  const at = Math.exp(-1 / (SR * (o.attack ?? 0.003)));
  const rt = Math.exp(-1 / (SR * (o.release ?? 0.08)));
  const mk = Math.pow(10, (o.makeup ?? 0) / 20);
  let envDb = -120;
  for (let i = 0; i < buf.length; i++) {
    const x = Math.abs(buf[i]);
    const db = x > 1e-6 ? 20 * Math.log10(x) : -120;
    envDb = db > envDb ? at * envDb + (1 - at) * db : rt * envDb + (1 - rt) * db;
    const over = envDb - o.threshold;
    const gr = over > 0 ? over * (1 - 1 / o.ratio) : 0;
    buf[i] *= Math.pow(10, -gr / 20) * mk;
  }
  return buf;
}

// ---------------------------------------------------------------- reverb

export interface ReverbOpts {
  /** Wet mix 0..1. */
  mix: number;
  /** Room size 0..1 (comb feedback). */
  size?: number;
  /** High damping 0..1. */
  damp?: number;
  /** Pre-delay seconds. */
  predelay?: number;
}

const COMBS = [1116, 1188, 1277, 1356, 1422, 1491, 1557, 1617];
const ALLPASS = [556, 441, 341, 225];

/** Freeverb-style Schroeder reverb (8 damped combs + 4 allpasses), mono. */
export function reverb(buf: Float32Array, o: ReverbOpts): Float32Array {
  const fb = 0.7 + 0.28 * (o.size ?? 0.5);
  const damp = (o.damp ?? 0.4) * 0.6;
  const pre = secToSamples(o.predelay ?? 0.01);
  const sc = SR / 44100;
  const combs = COMBS.map((l) => ({ b: new Float32Array(Math.round(l * sc)), i: 0, f: 0 }));
  const aps = ALLPASS.map((l) => ({ b: new Float32Array(Math.round(l * sc)), i: 0 }));
  const out = new Float32Array(buf.length);
  for (let n = 0; n < buf.length; n++) {
    const x = (n - pre >= 0 ? buf[n - pre] : 0) * 0.015;
    let y = 0;
    for (const c of combs) {
      const o2 = c.b[c.i];
      c.f = o2 * (1 - damp) + c.f * damp;
      c.b[c.i] = x + c.f * fb;
      c.i = (c.i + 1) % c.b.length;
      y += o2;
    }
    for (const a of aps) {
      const bo = a.b[a.i];
      const v = -y + bo;
      a.b[a.i] = y + bo * 0.5;
      a.i = (a.i + 1) % a.b.length;
      y = v;
    }
    out[n] = y;
  }
  for (let n = 0; n < buf.length; n++) buf[n] = buf[n] * (1 - o.mix * 0.5) + out[n] * o.mix;
  return buf;
}

// ---------------------------------------------------------------- utility

export function mixInto(dst: Float32Array, src: Float32Array, at = 0, gain = 1): void {
  const off = secToSamples(at);
  for (let i = 0; i < src.length && off + i < dst.length; i++) dst[off + i] += src[i] * gain;
}

export function peak(buf: Float32Array): number {
  let m = 0;
  for (let i = 0; i < buf.length; i++) m = Math.max(m, Math.abs(buf[i]));
  return m;
}

export function rms(buf: Float32Array): number {
  let s = 0;
  for (let i = 0; i < buf.length; i++) s += buf[i] * buf[i];
  return Math.sqrt(s / Math.max(1, buf.length));
}

/** Removes DC with a gentle 20 Hz high-pass. */
export function dcBlock(buf: Float32Array): Float32Array {
  return filterBuffer(buf, 'hp', 20, 0.6);
}

/** Short linear fades to avoid clicks at the ends. */
export function fadeEdges(buf: Float32Array, inSec = 0.001, outSec = 0.01): Float32Array {
  const a = Math.min(buf.length, secToSamples(inSec));
  const b = Math.min(buf.length, secToSamples(outSec));
  for (let i = 0; i < a; i++) buf[i] *= i / a;
  for (let i = 0; i < b; i++) buf[buf.length - 1 - i] *= i / b;
  return buf;
}

/** Makes a seamless loop by cross-fading the last `xf` seconds into the start. */
export function makeLoop(buf: Float32Array, xf: number): Float32Array {
  const n = secToSamples(xf);
  const len = buf.length - n;
  const out = buf.slice(0, len);
  for (let i = 0; i < n; i++) {
    const k = i / n;
    // equal-power: tail fades out while the head fades in
    out[i] = buf[len + i] * Math.cos((k * Math.PI) / 2) + buf[i] * Math.sin((k * Math.PI) / 2);
  }
  return out;
}

/** Trims trailing near-silence (keeps at least `minSec`). */
export function trimTail(buf: Float32Array, threshold = 0.0015, minSec = 0.05): Float32Array {
  let end = buf.length;
  while (end > secToSamples(minSec) && Math.abs(buf[end - 1]) < threshold) end--;
  return buf.slice(0, Math.min(buf.length, end + secToSamples(0.005)));
}

// ---------------------------------------------------------------- formants

/** Vowel formant table (F1, F2, F3 in Hz) for growls, grunts and shrieks. */
export const VOWELS: Record<string, [number, number, number]> = {
  a: [800, 1150, 2900],
  o: [450, 800, 2830],
  u: [325, 700, 2530],
  e: [400, 1700, 2600],
  i: [300, 2200, 3000],
  ae: [660, 1720, 2410],
  er: [490, 1350, 1690],
};

export function vowel(v: string | [number, number, number]): [number, number, number] {
  return typeof v === 'string' ? (VOWELS[v] ?? VOWELS.a) : v;
}
