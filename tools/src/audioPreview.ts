/**
 * `npm run audio-preview -w @sms/tools` — renders a ~30 s demo mix of the procedural
 * SFX (stereo, 44.1 kHz) to docs/audio-preview.wav, plus docs/audio-preview.mp3 when
 * ffmpeg is on PATH. A quick way to audition recipe changes without running the game.
 */
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { RECIPES } from './audio/recipes.js';
import { renderRecipe, variantCount, type Recipe } from './audio/synth.js';
import { Rng, SR } from './audio/dsp.js';
import { encodeWavStereo } from './audio/wav.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const byKey = new Map<string, Recipe>(RECIPES.map((r) => [r.key, r]));
const cache = new Map<string, Float32Array>();
const rng = new Rng(40000);

function take(key: string, v: number): Float32Array {
  const id = `${key}#${v}`;
  let b = cache.get(id);
  if (!b) {
    const r = byKey.get(key);
    if (!r) throw new Error(`unknown sound ${key}`);
    b = renderRecipe(r, v);
    cache.set(id, b);
  }
  return b;
}

const LEN = 32;
const L = new Float32Array(SR * LEN);
const R = new Float32Array(SR * LEN);

/** Places a random variant of `key` at time t (s), pan -1..1, gain. */
function hit(key: string, t: number, pan = 0, gain = 1, maxLen?: number): void {
  const r = byKey.get(key)!;
  const b = take(key, Math.floor(rng.next() * variantCount(r)));
  const g = gain * r.volume;
  const a = ((pan + 1) * Math.PI) / 4;
  const gl = Math.cos(a) * g * 1.2;
  const gr = Math.sin(a) * g * 1.2;
  const off = Math.round(t * SR);
  const n = maxLen ? Math.min(b.length, Math.round(maxLen * SR)) : b.length;
  for (let i = 0; i < n && off + i < L.length; i++) {
    const fade = maxLen && i > n - 2000 ? (n - i) / 2000 : 1;
    L[off + i] += b[i] * gl * fade;
    R[off + i] += b[i] * gr * fade;
  }
}

/** Loops `key` from t0 to t1 with fades. */
function loop(
  key: string,
  t0: number,
  t1: number,
  pan = 0,
  gain = 1,
  fadeIn = 0.3,
  fadeOut = 0.5,
): void {
  const r = byKey.get(key)!;
  const b = take(key, 0);
  const g = gain * r.volume;
  const a = ((pan + 1) * Math.PI) / 4;
  const s0 = Math.round(t0 * SR);
  const s1 = Math.min(L.length, Math.round(t1 * SR));
  for (let i = s0; i < s1; i++) {
    const t = (i - s0) / SR;
    const env = Math.min(1, t / fadeIn, (s1 - i) / SR / fadeOut);
    const v = b[(i - s0) % b.length] * g * env;
    L[i] += v * Math.cos(a) * 1.2;
    R[i] += v * Math.sin(a) * 1.2;
  }
}

// ---- the scene: a squad holding a hive corridor
loop('amb_hive', 0, LEN, 0, 0.9, 1, 1.5);
loop('amb_swarm', 0.5, 31, 0.1, 0.8, 3, 2);

// bolt rifle burst with impacts downrange
for (let i = 0; i < 6; i++) {
  hit('shoot_bolt_rifle', 0.6 + i * 0.16, -0.15);
  hit('bolt_impact', 0.72 + i * 0.16, 0.45, 0.6);
}
hit('reload_bolter', 1.8, -0.15, 0.9);
// heavy bolter stream
for (let i = 0; i < 14; i++) {
  hit('shoot_heavy_bolter', 3 + i * 0.085, 0.35);
  if (i % 2) hit('heavy_bolt_impact', 3.1 + i * 0.085, -0.4, 0.5);
}
hit('nid_die_small', 3.5, -0.4);
hit('nid_die_small', 3.9, -0.5);
hit('nid_squish', 4.1, -0.3);
// hormagaunt crouch, leap, landing, slash on armour
hit('horma_windup', 4.9, 0.6);
hit('horma_shriek', 5.22, 0.5);
hit('dust_land', 5.5, 0.1);
hit('nid_slash', 5.55, 0.05);
hit('armour_hit', 5.62, 0);
hit('player_hurt', 5.66, 0);
// flamer: ignition, held roar, tail
hit('flamer_ignite', 6.4, -0.1);
loop('flamer_loop', 6.55, 8.3, -0.1, 1, 0.12, 0.08);
hit('flamer_tail', 8.25, -0.1);
hit('nid_die_mid', 7.6, 0.3);
hit('nid_hiss', 8.8, 0.7);
// plasma: shots, supercharge, overheat
for (let i = 0; i < 3; i++) {
  hit('shoot_plasma', 9.4 + i * 0.3, 0.2);
  hit('plasma_impact', 9.55 + i * 0.3, -0.5, 0.7);
}
loop('plasma_whine', 9.6, 11.4, 0.2, 0.5, 0.6, 0.2);
hit('shoot_plasma_super', 10.6, 0.2);
hit('overheat', 11.4, 0.2);
// meltagun on a genestealer
hit('stealer_skitter', 12.3, -0.6);
hit('stealer_skitter', 12.62, -0.45);
hit('shoot_melta', 12.9, 0);
hit('melta_impact', 13.0, -0.3);
hit('nid_die_mid', 13.2, -0.3);
hit('reload_melta', 13.9, 0);
hit('nid_die_small', 15.9, 0.3);
// ripper / termagant / biovore / spore mine + frag grenade
hit('nid_chitter', 17.4, -0.5);
hit('nid_spit', 17.8, 0.6);
hit('nid_spit', 18.05, 0.55);
hit('biovore_thoomp', 18.6, 0.8);
hit('nid_spore_burst', 19.5, 0.2);
hit('throw_grenade', 19.9, 0);
hit('explosion', 20.5, -0.2);
// tyranid warrior: synapse drone + shriek, ravener emerges
loop('synapse_drone', 21, 24.5, 0.5, 0.9, 1, 1);
hit('nid_shriek', 21.6, 0.5);
hit('ravener_burrow', 22.4, -0.4);
hit('ravener_burrow', 22.9, -0.3);
hit('nid_emerge', 23.4, -0.3);
hit('nid_die_big', 24.3, 0.5);
// carnifex: footsteps, rear-up roar (wind-up), charge, crush, death
hit('boss_horn', 25, 0);
for (let i = 0; i < 4; i++) hit('carnifex_step', 26.2 + i * 0.42, 0.3 - i * 0.05);
hit('carnifex_roar', 27.9, 0.15);
hit('carnifex_charge', 28.8, 0.1);
hit('nid_crush', 29.8, 0);
hit('player_down', 30.0, 0);
hit('nid_die_huge', 30.5, 0.1, 1, 1.5);

// gentle bus compression + limiter so the preview is listenable
let pk = 0;
for (let i = 0; i < L.length; i++) pk = Math.max(pk, Math.abs(L[i]), Math.abs(R[i]));
const k = 0.95 / Math.max(1, pk);
for (let i = 0; i < L.length; i++) {
  L[i] = Math.tanh(L[i] * k * 1.1);
  R[i] = Math.tanh(R[i] * k * 1.1);
}
const outWav = path.join(ROOT, 'docs', 'audio-preview.wav');
fs.writeFileSync(outWav, encodeWavStereo(L, R, SR));
console.log(`wrote ${path.relative(ROOT, outWav)} (${LEN}s stereo 44.1 kHz)`);
try {
  execFileSync('ffmpeg', [
    '-y',
    '-loglevel',
    'error',
    '-i',
    outWav,
    '-codec:a',
    'libmp3lame',
    '-q:a',
    '3',
    outWav.replace(/\.wav$/, '.mp3'),
  ]);
  console.log('wrote docs/audio-preview.mp3');
} catch {
  console.log('ffmpeg not found: skipped docs/audio-preview.mp3');
}
