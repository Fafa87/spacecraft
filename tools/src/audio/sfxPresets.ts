import { defaultParams, renderSfxr, Wave, type SfxrParams } from './sfxr.js';
import { normalize } from './wav.js';

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
    key: 'shoot_rifle',
    description: 'Punchy automatic bolt rifle shot',
    volume: 0.35,
    maxVoices: 6,
    layers: [
      L({ wave: Wave.Square, baseFreq: 0.55, freqRamp: -0.45, duty: 0.6, sustain: 0.05, decay: 0.14, punch: 0.4, lpfFreq: 0.7, hpfFreq: 0.08 }, 0.8),
      L({ wave: Wave.Noise, baseFreq: 0.4, freqRamp: -0.2, sustain: 0.03, decay: 0.1, punch: 0.5 }, 0.6),
    ],
  },
  {
    key: 'shoot_shotgun',
    description: 'Heavy shotgun blast with low thump',
    volume: 0.5,
    maxVoices: 4,
    layers: [
      L({ wave: Wave.Noise, baseFreq: 0.22, freqRamp: -0.15, sustain: 0.12, decay: 0.32, punch: 0.6, lpfFreq: 0.6 }, 1),
      L({ wave: Wave.Sine, baseFreq: 0.18, freqRamp: -0.35, sustain: 0.06, decay: 0.2, punch: 0.4 }, 0.7),
    ],
  },
  {
    key: 'shoot_flamer',
    description: 'Roaring flame burst (played in short overlapping bursts)',
    volume: 0.22,
    maxVoices: 3,
    layers: [L({ wave: Wave.Noise, baseFreq: 0.12, attack: 0.04, sustain: 0.18, decay: 0.12, lpfFreq: 0.35, lpfResonance: 0.4, phaserOffset: 0.2, phaserRamp: -0.1 }, 1)],
  },
  {
    key: 'shoot_plasma',
    description: 'Charged plasma bolt zap',
    volume: 0.4,
    maxVoices: 4,
    layers: [
      L({ wave: Wave.Saw, baseFreq: 0.7, freqRamp: -0.32, sustain: 0.08, decay: 0.25, punch: 0.3, vibStrength: 0.2, vibSpeed: 0.6, lpfFreq: 0.8, phaserOffset: 0.15 }, 0.8),
      L({ wave: Wave.Sine, baseFreq: 0.35, freqRamp: -0.25, sustain: 0.1, decay: 0.2 }, 0.5),
    ],
  },
  {
    key: 'shoot_rocket',
    description: 'Rocket launch whoosh',
    volume: 0.45,
    maxVoices: 3,
    layers: [
      L({ wave: Wave.Noise, baseFreq: 0.3, freqRamp: 0.12, attack: 0.02, sustain: 0.2, decay: 0.3, lpfFreq: 0.45, lpfRamp: -0.1 }, 1),
      L({ wave: Wave.Square, baseFreq: 0.2, freqRamp: -0.2, sustain: 0.05, decay: 0.15, punch: 0.6, duty: 0.3 }, 0.5),
    ],
  },
  {
    key: 'explosion',
    description: 'Big explosion',
    volume: 0.6,
    maxVoices: 5,
    layers: [
      L({ wave: Wave.Noise, baseFreq: 0.12, freqRamp: -0.08, sustain: 0.3, decay: 0.55, punch: 0.65, lpfFreq: 0.5, phaserOffset: -0.3, phaserRamp: -0.1 }, 1),
      L({ wave: Wave.Sine, baseFreq: 0.12, freqRamp: -0.2, sustain: 0.2, decay: 0.4, punch: 0.5 }, 0.8),
    ],
  },
  {
    key: 'reload',
    description: 'Magazine click-clack',
    volume: 0.4,
    maxVoices: 2,
    layers: [
      L({ wave: Wave.Square, baseFreq: 0.6, sustain: 0.01, decay: 0.05, duty: 0.5, hpfFreq: 0.3 }, 0.8),
      L({ wave: Wave.Noise, baseFreq: 0.7, sustain: 0.01, decay: 0.06, hpfFreq: 0.4 }, 0.7, 0.18),
      L({ wave: Wave.Square, baseFreq: 0.45, sustain: 0.02, decay: 0.08, duty: 0.3, hpfFreq: 0.2 }, 0.9, 0.3),
    ],
  },
  {
    key: 'enemy_die_small',
    description: 'Wet chitin crunch / squelch',
    volume: 0.3,
    maxVoices: 6,
    layers: [
      L({ wave: Wave.Noise, baseFreq: 0.35, freqRamp: -0.3, sustain: 0.04, decay: 0.18, punch: 0.3, lpfFreq: 0.55 }, 1),
      L({ wave: Wave.Saw, baseFreq: 0.3, freqRamp: -0.4, sustain: 0.03, decay: 0.12, vibStrength: 0.4, vibSpeed: 0.7 }, 0.4),
    ],
  },
  {
    key: 'enemy_die_big',
    description: 'Heavy brute death roar',
    volume: 0.55,
    maxVoices: 3,
    layers: [
      L({ wave: Wave.Saw, baseFreq: 0.22, freqRamp: -0.18, sustain: 0.25, decay: 0.45, vibStrength: 0.5, vibSpeed: 0.45, lpfFreq: 0.5 }, 0.8),
      L({ wave: Wave.Noise, baseFreq: 0.15, sustain: 0.2, decay: 0.4, punch: 0.5, lpfFreq: 0.4 }, 0.8),
    ],
  },
  {
    key: 'enemy_bite',
    description: 'Claw slash / bite',
    volume: 0.4,
    maxVoices: 3,
    layers: [L({ wave: Wave.Noise, baseFreq: 0.55, freqRamp: -0.5, sustain: 0.02, decay: 0.1, punch: 0.7, hpfFreq: 0.15 }, 1)],
  },
  {
    key: 'enemy_spit',
    description: 'Acid spit',
    volume: 0.35,
    maxVoices: 3,
    layers: [L({ wave: Wave.Saw, baseFreq: 0.45, freqRamp: 0.2, sustain: 0.06, decay: 0.16, vibStrength: 0.6, vibSpeed: 0.8, lpfFreq: 0.6, lpfResonance: 0.6 }, 1)],
  },
  {
    key: 'player_hurt',
    description: 'Marine takes damage',
    volume: 0.45,
    maxVoices: 2,
    layers: [L({ wave: Wave.Square, baseFreq: 0.35, freqRamp: -0.3, duty: 0.4, sustain: 0.05, decay: 0.16, punch: 0.4, lpfFreq: 0.6 }, 1)],
  },
  {
    key: 'player_down',
    description: 'Marine is downed',
    volume: 0.55,
    maxVoices: 2,
    layers: [L({ wave: Wave.Saw, baseFreq: 0.4, freqRamp: -0.15, sustain: 0.3, decay: 0.5, vibStrength: 0.3, vibSpeed: 0.3, lpfFreq: 0.6 }, 1)],
  },
  {
    key: 'revive',
    description: 'Marine revived',
    volume: 0.5,
    maxVoices: 2,
    layers: [L({ wave: Wave.Square, baseFreq: 0.3, freqRamp: 0.25, sustain: 0.2, decay: 0.3, duty: 0.4, arpMod: 0.5, arpSpeed: 0.6 }, 1)],
  },
  {
    key: 'pickup',
    description: 'Pickup collected',
    volume: 0.45,
    maxVoices: 3,
    layers: [L({ wave: Wave.Square, baseFreq: 0.45, sustain: 0.06, decay: 0.2, punch: 0.4, arpMod: 0.45, arpSpeed: 0.55, duty: 0.5 }, 1)],
  },
  {
    key: 'unlock',
    description: 'New weapon unlocked (power-up)',
    volume: 0.5,
    maxVoices: 2,
    layers: [
      L({ wave: Wave.Square, baseFreq: 0.3, freqRamp: 0.22, sustain: 0.3, decay: 0.35, duty: 0.3, repeatSpeed: 0.55, vibStrength: 0.1, vibSpeed: 0.5 }, 1),
    ],
  },
  {
    key: 'surge',
    description: 'Incoming swarm alarm',
    volume: 0.5,
    maxVoices: 1,
    layers: [L({ wave: Wave.Saw, baseFreq: 0.35, sustain: 0.6, decay: 0.3, vibStrength: 0.35, vibSpeed: 0.25, lpfFreq: 0.6, repeatSpeed: 0.35 }, 1)],
  },
  {
    key: 'crate_drop',
    description: 'Supply crate lands',
    volume: 0.45,
    maxVoices: 2,
    layers: [
      L({ wave: Wave.Noise, baseFreq: 0.25, sustain: 0.05, decay: 0.25, punch: 0.6, lpfFreq: 0.4 }, 1),
      L({ wave: Wave.Square, baseFreq: 0.5, sustain: 0.05, decay: 0.15, duty: 0.5, arpMod: 0.3, arpSpeed: 0.5 }, 0.4, 0.12),
    ],
  },
  {
    key: 'ui_click',
    description: 'UI button blip',
    volume: 0.3,
    maxVoices: 2,
    layers: [L({ wave: Wave.Square, baseFreq: 0.6, sustain: 0.02, decay: 0.06, duty: 0.5, hpfFreq: 0.1 }, 1)],
  },
];

/** Renders an SfxDef to mono float samples. */
export function renderSfx(def: SfxDef, sampleRate = 44100): Float32Array {
  const parts = def.layers.map((layer, i) => ({
    offset: Math.round((layer.delay ?? 0) * sampleRate),
    gain: layer.gain ?? 1,
    data: renderSfxr({ ...defaultParams(), ...layer.params }, 1000 + i * 77 + hash(def.key), sampleRate),
  }));
  const length = Math.max(1, ...parts.map((p) => p.offset + p.data.length));
  const out = new Float32Array(length);
  for (const p of parts) for (let i = 0; i < p.data.length; i++) out[p.offset + i] += p.data[i] * p.gain;
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
