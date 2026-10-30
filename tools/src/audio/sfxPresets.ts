import { defaultParams, renderSfxr, Wave, type SfxrParams } from './sfxr.js';
import { normalize } from './wav.js';
import { TYRANID_SFX, WEAPON_SFX } from './sfx40k.js';

/**
 * Sound effect definitions. Each key is referenced from game data
 * (weapons.sfx / enemies.sfx) or the client (UI, events). Layers are rendered
 * with sfxr and mixed. Tweak params here, then `npm run assets`.
 * Tip: paste values into https://sfxr.me to audition (same parameter model).
 */
export interface SfxLayer {
  params: Partial<SfxrParams>;
  gain?: number;
  /** Delay in seconds before this layer starts. */
  delay?: number;
}

export interface SfxDef {
  key: string;
  description: string;
  layers: SfxLayer[];
  /** Playback volume hint for the client (0..1). */
  volume: number;
  /** Max simultaneous voices of this sound in the client. */
  maxVoices: number;
}

const L = (params: Partial<SfxrParams>, gain = 1, delay = 0): SfxLayer => ({ params, gain, delay });

export const SFX: SfxDef[] = [
  {
    key: 'explosion',
    description: 'Big explosion',
    volume: 0.6,
    maxVoices: 5,
    layers: [
      L(
        {
          wave: Wave.Noise,
          baseFreq: 0.12,
          freqRamp: -0.08,
          sustain: 0.3,
          decay: 0.55,
          punch: 0.65,
          lpfFreq: 0.5,
          phaserOffset: -0.3,
          phaserRamp: -0.1,
        },
        1,
      ),
      L(
        { wave: Wave.Sine, baseFreq: 0.12, freqRamp: -0.2, sustain: 0.2, decay: 0.4, punch: 0.5 },
        0.8,
      ),
    ],
  },
  {
    key: 'player_hurt',
    description: 'Marine takes damage',
    volume: 0.45,
    maxVoices: 2,
    layers: [
      L(
        {
          wave: Wave.Square,
          baseFreq: 0.35,
          freqRamp: -0.3,
          duty: 0.4,
          sustain: 0.05,
          decay: 0.16,
          punch: 0.4,
          lpfFreq: 0.6,
        },
        1,
      ),
    ],
  },
  {
    key: 'player_down',
    description: 'Marine is downed',
    volume: 0.55,
    maxVoices: 2,
    layers: [
      L(
        {
          wave: Wave.Saw,
          baseFreq: 0.4,
          freqRamp: -0.15,
          sustain: 0.3,
          decay: 0.5,
          vibStrength: 0.3,
          vibSpeed: 0.3,
          lpfFreq: 0.6,
        },
        1,
      ),
    ],
  },
  {
    key: 'revive',
    description: 'Marine revived',
    volume: 0.5,
    maxVoices: 2,
    layers: [
      L(
        {
          wave: Wave.Square,
          baseFreq: 0.3,
          freqRamp: 0.25,
          sustain: 0.2,
          decay: 0.3,
          duty: 0.4,
          arpMod: 0.5,
          arpSpeed: 0.6,
        },
        1,
      ),
    ],
  },
  {
    key: 'pickup',
    description: 'Pickup collected',
    volume: 0.45,
    maxVoices: 3,
    layers: [
      L(
        {
          wave: Wave.Square,
          baseFreq: 0.45,
          sustain: 0.06,
          decay: 0.2,
          punch: 0.4,
          arpMod: 0.45,
          arpSpeed: 0.55,
          duty: 0.5,
        },
        1,
      ),
    ],
  },
  {
    key: 'unlock',
    description: 'New weapon unlocked (power-up)',
    volume: 0.5,
    maxVoices: 2,
    layers: [
      L(
        {
          wave: Wave.Square,
          baseFreq: 0.3,
          freqRamp: 0.22,
          sustain: 0.3,
          decay: 0.35,
          duty: 0.3,
          repeatSpeed: 0.55,
          vibStrength: 0.1,
          vibSpeed: 0.5,
        },
        1,
      ),
    ],
  },
  {
    key: 'surge',
    description: 'Incoming swarm alarm',
    volume: 0.5,
    maxVoices: 1,
    layers: [
      L(
        {
          wave: Wave.Saw,
          baseFreq: 0.35,
          sustain: 0.6,
          decay: 0.3,
          vibStrength: 0.35,
          vibSpeed: 0.25,
          lpfFreq: 0.6,
          repeatSpeed: 0.35,
        },
        1,
      ),
    ],
  },
  {
    key: 'crate_drop',
    description: 'Supply crate lands',
    volume: 0.45,
    maxVoices: 2,
    layers: [
      L(
        { wave: Wave.Noise, baseFreq: 0.25, sustain: 0.05, decay: 0.25, punch: 0.6, lpfFreq: 0.4 },
        1,
      ),
      L(
        {
          wave: Wave.Square,
          baseFreq: 0.5,
          sustain: 0.05,
          decay: 0.15,
          duty: 0.5,
          arpMod: 0.3,
          arpSpeed: 0.5,
        },
        0.4,
        0.12,
      ),
    ],
  },
  {
    key: 'ui_click',
    description: 'UI button blip',
    volume: 0.3,
    maxVoices: 2,
    layers: [
      L(
        { wave: Wave.Square, baseFreq: 0.6, sustain: 0.02, decay: 0.06, duty: 0.5, hpfFreq: 0.1 },
        1,
      ),
    ],
  },
  ...WEAPON_SFX,
  ...TYRANID_SFX,
];

/** Renders an SfxDef to mono float samples. */
export function renderSfx(def: SfxDef, sampleRate = 44100): Float32Array {
  const parts = def.layers.map((layer, i) => ({
    offset: Math.round((layer.delay ?? 0) * sampleRate),
    gain: layer.gain ?? 1,
    data: renderSfxr(
      { ...defaultParams(), ...layer.params },
      1000 + i * 77 + hash(def.key),
      sampleRate,
    ),
  }));
  const length = Math.max(1, ...parts.map((p) => p.offset + p.data.length));
  const out = new Float32Array(length);
  for (const p of parts)
    for (let i = 0; i < p.data.length; i++) out[p.offset + i] += p.data[i] * p.gain;
  // Short fade-out to avoid clicks.
  const fade = Math.min(out.length, Math.round(sampleRate * 0.01));
  for (let i = 0; i < fade; i++) out[out.length - 1 - i] *= i / fade;
  return normalize(out, 0.85);
}

function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}
