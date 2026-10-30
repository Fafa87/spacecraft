import { Wave, type SfxrParams } from './sfxr.js';
import type { SfxDef, SfxLayer } from './sfxPresets.js';

const L = (params: Partial<SfxrParams>, gain = 1, delay = 0): SfxLayer => ({ params, gain, delay });

/**
 * Hive Siege sound set: heavy bolter thuds, flamer roar, plasma whine, melta hiss,
 * and Tyranid shrieks / chittering. All synthesized with sfxr layers (no samples).
 */
export const WEAPON_SFX: SfxDef[] = [
  {
    key: 'shoot_bolt_rifle',
    description: 'Bolt rifle: low muzzle thud + rocket-propelled crack',
    volume: 0.36,
    maxVoices: 6,
    layers: [
      L(
        { wave: Wave.Sine, baseFreq: 0.2, freqRamp: -0.45, sustain: 0.04, decay: 0.16, punch: 0.7 },
        1,
      ),
      L(
        {
          wave: Wave.Noise,
          baseFreq: 0.3,
          freqRamp: -0.25,
          sustain: 0.03,
          decay: 0.13,
          punch: 0.6,
          lpfFreq: 0.6,
        },
        0.8,
      ),
      L(
        {
          wave: Wave.Square,
          baseFreq: 0.62,
          freqRamp: -0.5,
          duty: 0.6,
          sustain: 0.01,
          decay: 0.06,
          hpfFreq: 0.2,
        },
        0.35,
        0.03,
      ),
    ],
  },
  {
    key: 'shoot_heavy_bolter',
    description: 'Heavy bolter: deep chest-thumping report',
    volume: 0.42,
    maxVoices: 5,
    layers: [
      L(
        { wave: Wave.Sine, baseFreq: 0.14, freqRamp: -0.4, sustain: 0.06, decay: 0.22, punch: 0.8 },
        1,
      ),
      L(
        {
          wave: Wave.Noise,
          baseFreq: 0.2,
          freqRamp: -0.2,
          sustain: 0.05,
          decay: 0.2,
          punch: 0.7,
          lpfFreq: 0.45,
        },
        0.9,
      ),
      L(
        {
          wave: Wave.Square,
          baseFreq: 0.4,
          freqRamp: -0.45,
          duty: 0.5,
          sustain: 0.02,
          decay: 0.08,
          lpfFreq: 0.6,
        },
        0.35,
        0.04,
      ),
    ],
  },
  {
    key: 'bolt_impact',
    description: 'Mass-reactive bolt detonating inside a target',
    volume: 0.3,
    maxVoices: 6,
    layers: [
      L(
        {
          wave: Wave.Noise,
          baseFreq: 0.28,
          freqRamp: -0.2,
          sustain: 0.02,
          decay: 0.12,
          punch: 0.6,
          lpfFreq: 0.55,
        },
        1,
      ),
      L(
        { wave: Wave.Sine, baseFreq: 0.22, freqRamp: -0.35, sustain: 0.02, decay: 0.1, punch: 0.5 },
        0.6,
      ),
    ],
  },
  {
    key: 'swing_power_sword',
    description: 'Power sword swing: whoosh + crackling energy field',
    volume: 0.4,
    maxVoices: 3,
    layers: [
      L(
        {
          wave: Wave.Noise,
          baseFreq: 0.45,
          freqRamp: -0.15,
          attack: 0.03,
          sustain: 0.04,
          decay: 0.12,
          hpfFreq: 0.2,
          lpfFreq: 0.7,
        },
        0.8,
      ),
      L(
        {
          wave: Wave.Saw,
          baseFreq: 0.55,
          freqRamp: -0.2,
          sustain: 0.06,
          decay: 0.12,
          vibStrength: 0.5,
          vibSpeed: 0.9,
          lpfFreq: 0.75,
        },
        0.5,
      ),
    ],
  },
  {
    key: 'power_field',
    description: 'Power field re-ignites (sword "reload")',
    volume: 0.35,
    maxVoices: 2,
    layers: [
      L(
        {
          wave: Wave.Saw,
          baseFreq: 0.25,
          freqRamp: 0.18,
          sustain: 0.15,
          decay: 0.2,
          vibStrength: 0.4,
          vibSpeed: 0.8,
          lpfFreq: 0.6,
        },
        1,
      ),
      L({ wave: Wave.Noise, baseFreq: 0.6, sustain: 0.1, decay: 0.15, hpfFreq: 0.4 }, 0.3),
    ],
  },
  {
    key: 'shoot_flamer',
    description: 'Promethium flamer roar (short overlapping bursts)',
    volume: 0.26,
    maxVoices: 3,
    layers: [
      L(
        {
          wave: Wave.Noise,
          baseFreq: 0.1,
          attack: 0.04,
          sustain: 0.2,
          decay: 0.14,
          lpfFreq: 0.3,
          lpfResonance: 0.5,
          phaserOffset: 0.25,
          phaserRamp: -0.1,
        },
        1,
      ),
      L(
        { wave: Wave.Noise, baseFreq: 0.35, attack: 0.02, sustain: 0.12, decay: 0.1, hpfFreq: 0.3 },
        0.25,
      ),
    ],
  },
  {
    key: 'shoot_plasma',
    description: 'Plasma gun: rising capacitor whine, then a searing discharge',
    volume: 0.4,
    maxVoices: 4,
    layers: [
      L(
        {
          wave: Wave.Sine,
          baseFreq: 0.45,
          freqRamp: 0.35,
          sustain: 0.05,
          decay: 0.04,
          lpfFreq: 0.9,
        },
        0.4,
      ),
      L(
        {
          wave: Wave.Saw,
          baseFreq: 0.75,
          freqRamp: -0.3,
          sustain: 0.08,
          decay: 0.28,
          punch: 0.4,
          vibStrength: 0.25,
          vibSpeed: 0.7,
          phaserOffset: 0.2,
          lpfFreq: 0.8,
        },
        0.8,
        0.05,
      ),
      L(
        { wave: Wave.Noise, baseFreq: 0.5, sustain: 0.03, decay: 0.12, punch: 0.4, hpfFreq: 0.2 },
        0.4,
        0.05,
      ),
    ],
  },
  {
    key: 'reload_plasma',
    description: 'Plasma coils venting (cooling hiss + falling whine)',
    volume: 0.35,
    maxVoices: 2,
    layers: [
      L({ wave: Wave.Noise, baseFreq: 0.55, sustain: 0.25, decay: 0.3, hpfFreq: 0.35 }, 0.6),
      L({ wave: Wave.Sine, baseFreq: 0.6, freqRamp: -0.15, sustain: 0.2, decay: 0.3 }, 0.4),
    ],
  },
  {
    key: 'overheat',
    description: 'Plasma overheat: alarm warble + vent blast (self damage)',
    volume: 0.5,
    maxVoices: 2,
    layers: [
      L(
        {
          wave: Wave.Square,
          baseFreq: 0.55,
          duty: 0.4,
          sustain: 0.25,
          decay: 0.1,
          vibStrength: 0.6,
          vibSpeed: 0.75,
          lpfFreq: 0.7,
        },
        0.5,
      ),
      L(
        { wave: Wave.Noise, baseFreq: 0.3, sustain: 0.2, decay: 0.35, punch: 0.6, lpfFreq: 0.5 },
        0.9,
        0.08,
      ),
    ],
  },
  {
    key: 'shoot_melta',
    description: 'Meltagun: deep sub-atomic hiss-whoomph',
    volume: 0.5,
    maxVoices: 3,
    layers: [
      L(
        { wave: Wave.Sine, baseFreq: 0.12, freqRamp: -0.3, sustain: 0.1, decay: 0.3, punch: 0.6 },
        1,
      ),
      L(
        {
          wave: Wave.Noise,
          baseFreq: 0.45,
          freqRamp: -0.25,
          attack: 0.01,
          sustain: 0.1,
          decay: 0.3,
          lpfFreq: 0.6,
          lpfResonance: 0.6,
          phaserOffset: 0.3,
        },
        0.8,
      ),
    ],
  },
  {
    key: 'throw_grenade',
    description: 'Grenade lobbed: short swish + pin click',
    volume: 0.35,
    maxVoices: 3,
    layers: [
      L(
        { wave: Wave.Square, baseFreq: 0.7, sustain: 0.005, decay: 0.03, duty: 0.5, hpfFreq: 0.4 },
        0.5,
      ),
      L(
        {
          wave: Wave.Noise,
          baseFreq: 0.5,
          freqRamp: -0.1,
          attack: 0.02,
          sustain: 0.03,
          decay: 0.1,
          hpfFreq: 0.3,
        },
        0.7,
        0.03,
      ),
    ],
  },
  {
    key: 'reload_bolter',
    description: 'Sickle magazine out / in, heavy bolt-action rack',
    volume: 0.42,
    maxVoices: 2,
    layers: [
      L(
        { wave: Wave.Square, baseFreq: 0.38, sustain: 0.015, decay: 0.07, duty: 0.4, lpfFreq: 0.6 },
        0.9,
      ),
      L({ wave: Wave.Noise, baseFreq: 0.5, sustain: 0.01, decay: 0.07, hpfFreq: 0.3 }, 0.6, 0.2),
      L(
        {
          wave: Wave.Square,
          baseFreq: 0.3,
          sustain: 0.03,
          decay: 0.1,
          duty: 0.3,
          punch: 0.5,
          lpfFreq: 0.5,
        },
        1,
        0.34,
      ),
      L({ wave: Wave.Noise, baseFreq: 0.35, sustain: 0.02, decay: 0.08, punch: 0.4 }, 0.6, 0.42),
    ],
  },
  {
    key: 'reload_heavy',
    description: 'Heavy weapon: belt / canister swap with a servo whirr',
    volume: 0.42,
    maxVoices: 2,
    layers: [
      L(
        { wave: Wave.Saw, baseFreq: 0.3, freqRamp: 0.1, sustain: 0.15, decay: 0.08, lpfFreq: 0.35 },
        0.4,
      ),
      L(
        {
          wave: Wave.Square,
          baseFreq: 0.32,
          sustain: 0.02,
          decay: 0.1,
          duty: 0.4,
          punch: 0.5,
          lpfFreq: 0.5,
        },
        1,
        0.25,
      ),
      L(
        { wave: Wave.Noise, baseFreq: 0.3, sustain: 0.02, decay: 0.1, punch: 0.5, lpfFreq: 0.5 },
        0.7,
        0.45,
      ),
    ],
  },
  {
    key: 'reload_grenade',
    description: 'Grenade pouch clasp',
    volume: 0.35,
    maxVoices: 2,
    layers: [
      L(
        { wave: Wave.Square, baseFreq: 0.5, sustain: 0.01, decay: 0.05, duty: 0.5, hpfFreq: 0.2 },
        0.9,
      ),
      L({ wave: Wave.Square, baseFreq: 0.42, sustain: 0.01, decay: 0.06, duty: 0.4 }, 0.7, 0.15),
    ],
  },
  {
    key: 'boss_horn',
    description: 'Bio-titan-ish bellow announcing a boss wave',
    volume: 0.6,
    maxVoices: 1,
    layers: [
      L(
        {
          wave: Wave.Saw,
          baseFreq: 0.1,
          freqRamp: 0.02,
          attack: 0.15,
          sustain: 0.6,
          decay: 0.5,
          vibStrength: 0.25,
          vibSpeed: 0.2,
          lpfFreq: 0.3,
          lpfResonance: 0.5,
        },
        1,
      ),
      L(
        {
          wave: Wave.Saw,
          baseFreq: 0.15,
          attack: 0.2,
          sustain: 0.55,
          decay: 0.5,
          vibStrength: 0.3,
          vibSpeed: 0.25,
          lpfFreq: 0.35,
        },
        0.6,
      ),
      L(
        { wave: Wave.Noise, baseFreq: 0.1, attack: 0.2, sustain: 0.5, decay: 0.5, lpfFreq: 0.2 },
        0.4,
      ),
    ],
  },
];

/** Shriek = vibrato'd saw with resonant filter; chitter = fast repeating clicks. */
export const TYRANID_SFX: SfxDef[] = [
  {
    key: 'nid_die_small',
    description: 'Gaunt death: wet crunch + short squeal',
    volume: 0.3,
    maxVoices: 6,
    layers: [
      L(
        {
          wave: Wave.Noise,
          baseFreq: 0.32,
          freqRamp: -0.3,
          sustain: 0.04,
          decay: 0.16,
          punch: 0.4,
          lpfFreq: 0.5,
        },
        1,
      ),
      L(
        {
          wave: Wave.Saw,
          baseFreq: 0.6,
          freqRamp: -0.35,
          sustain: 0.03,
          decay: 0.1,
          vibStrength: 0.5,
          vibSpeed: 0.8,
          lpfFreq: 0.7,
          lpfResonance: 0.6,
        },
        0.4,
      ),
    ],
  },
  {
    key: 'nid_die_mid',
    description: 'Genestealer / Biovore death: crack of chitin + gurgle',
    volume: 0.38,
    maxVoices: 4,
    layers: [
      L(
        {
          wave: Wave.Noise,
          baseFreq: 0.24,
          freqRamp: -0.25,
          sustain: 0.06,
          decay: 0.22,
          punch: 0.6,
          lpfFreq: 0.45,
        },
        1,
      ),
      L(
        {
          wave: Wave.Saw,
          baseFreq: 0.45,
          freqRamp: -0.3,
          sustain: 0.06,
          decay: 0.18,
          vibStrength: 0.6,
          vibSpeed: 0.6,
          lpfFreq: 0.6,
          lpfResonance: 0.5,
        },
        0.5,
      ),
    ],
  },
  {
    key: 'nid_die_big',
    description: 'Warrior / Ravener death: shriek collapsing into a gurgle',
    volume: 0.5,
    maxVoices: 3,
    layers: [
      L(
        {
          wave: Wave.Saw,
          baseFreq: 0.5,
          freqRamp: -0.22,
          sustain: 0.2,
          decay: 0.35,
          vibStrength: 0.55,
          vibSpeed: 0.55,
          lpfFreq: 0.6,
          lpfResonance: 0.7,
        },
        0.7,
      ),
      L(
        { wave: Wave.Noise, baseFreq: 0.18, sustain: 0.15, decay: 0.35, punch: 0.5, lpfFreq: 0.4 },
        0.8,
      ),
    ],
  },
  {
    key: 'nid_die_huge',
    description: 'Carnifex death: long bellowing roar and ground thud',
    volume: 0.7,
    maxVoices: 2,
    layers: [
      L(
        {
          wave: Wave.Saw,
          baseFreq: 0.2,
          freqRamp: -0.12,
          sustain: 0.45,
          decay: 0.6,
          vibStrength: 0.4,
          vibSpeed: 0.35,
          lpfFreq: 0.45,
          lpfResonance: 0.5,
        },
        0.9,
      ),
      L({ wave: Wave.Noise, baseFreq: 0.1, sustain: 0.3, decay: 0.6, punch: 0.7, lpfFreq: 0.3 }, 1),
      L(
        { wave: Wave.Sine, baseFreq: 0.1, freqRamp: -0.3, sustain: 0.1, decay: 0.4, punch: 0.8 },
        1,
        0.5,
      ),
    ],
  },
  {
    key: 'nid_slash',
    description: 'Scything talon / rending claw strike',
    volume: 0.4,
    maxVoices: 4,
    layers: [
      L(
        {
          wave: Wave.Noise,
          baseFreq: 0.6,
          freqRamp: -0.5,
          sustain: 0.02,
          decay: 0.09,
          punch: 0.7,
          hpfFreq: 0.2,
        },
        1,
      ),
      L(
        {
          wave: Wave.Saw,
          baseFreq: 0.7,
          freqRamp: -0.4,
          sustain: 0.02,
          decay: 0.07,
          vibStrength: 0.4,
          vibSpeed: 0.9,
          lpfResonance: 0.6,
          lpfFreq: 0.8,
        },
        0.35,
      ),
    ],
  },
  {
    key: 'nid_spit',
    description: 'Fleshborer / deathspitter: wet organic pop',
    volume: 0.35,
    maxVoices: 4,
    layers: [
      L(
        {
          wave: Wave.Saw,
          baseFreq: 0.4,
          freqRamp: 0.25,
          sustain: 0.04,
          decay: 0.12,
          vibStrength: 0.7,
          vibSpeed: 0.85,
          lpfFreq: 0.55,
          lpfResonance: 0.7,
        },
        1,
      ),
      L(
        { wave: Wave.Noise, baseFreq: 0.3, sustain: 0.02, decay: 0.08, punch: 0.5, lpfFreq: 0.5 },
        0.6,
      ),
    ],
  },
  {
    key: 'nid_squish',
    description: 'Ripper popping',
    volume: 0.25,
    maxVoices: 6,
    layers: [
      L(
        {
          wave: Wave.Noise,
          baseFreq: 0.4,
          freqRamp: -0.4,
          sustain: 0.02,
          decay: 0.1,
          punch: 0.4,
          lpfFreq: 0.45,
          lpfResonance: 0.5,
        },
        1,
      ),
    ],
  },
  {
    key: 'nid_chitter',
    description: 'Rapid insect chittering',
    volume: 0.28,
    maxVoices: 3,
    layers: [
      L(
        {
          wave: Wave.Square,
          baseFreq: 0.72,
          duty: 0.7,
          sustain: 0.18,
          decay: 0.05,
          repeatSpeed: 0.78,
          hpfFreq: 0.3,
          vibStrength: 0.3,
          vibSpeed: 0.9,
        },
        0.7,
      ),
      L(
        {
          wave: Wave.Noise,
          baseFreq: 0.7,
          sustain: 0.16,
          decay: 0.05,
          repeatSpeed: 0.75,
          hpfFreq: 0.45,
        },
        0.5,
      ),
    ],
  },
  {
    key: 'nid_shriek',
    description: 'Synapse creature shriek (Warrior)',
    volume: 0.45,
    maxVoices: 2,
    layers: [
      L(
        {
          wave: Wave.Saw,
          baseFreq: 0.62,
          freqRamp: 0.08,
          attack: 0.03,
          sustain: 0.25,
          decay: 0.3,
          vibStrength: 0.45,
          vibSpeed: 0.6,
          lpfFreq: 0.75,
          lpfResonance: 0.75,
        },
        0.8,
      ),
      L(
        {
          wave: Wave.Saw,
          baseFreq: 0.47,
          freqRamp: 0.05,
          attack: 0.05,
          sustain: 0.22,
          decay: 0.3,
          vibStrength: 0.5,
          vibSpeed: 0.5,
          lpfFreq: 0.6,
          lpfResonance: 0.6,
        },
        0.5,
      ),
      L(
        { wave: Wave.Noise, baseFreq: 0.6, attack: 0.03, sustain: 0.2, decay: 0.25, hpfFreq: 0.4 },
        0.25,
      ),
    ],
  },
  {
    key: 'nid_emerge',
    description: 'Ravener bursting out of the ground: rubble + screech',
    volume: 0.5,
    maxVoices: 2,
    layers: [
      L(
        { wave: Wave.Noise, baseFreq: 0.12, sustain: 0.15, decay: 0.35, punch: 0.7, lpfFreq: 0.35 },
        1,
      ),
      L(
        {
          wave: Wave.Saw,
          baseFreq: 0.55,
          freqRamp: 0.12,
          sustain: 0.12,
          decay: 0.2,
          vibStrength: 0.5,
          vibSpeed: 0.7,
          lpfFreq: 0.7,
          lpfResonance: 0.7,
        },
        0.6,
        0.1,
      ),
    ],
  },
  {
    key: 'nid_spore',
    description: 'Biovore launching a spore mine: deep organic cough',
    volume: 0.4,
    maxVoices: 2,
    layers: [
      L(
        { wave: Wave.Sine, baseFreq: 0.18, freqRamp: -0.2, sustain: 0.06, decay: 0.2, punch: 0.6 },
        1,
      ),
      L(
        {
          wave: Wave.Noise,
          baseFreq: 0.22,
          sustain: 0.05,
          decay: 0.18,
          lpfFreq: 0.35,
          lpfResonance: 0.6,
        },
        0.7,
      ),
    ],
  },
  {
    key: 'nid_spore_burst',
    description: 'Spore mine bursting: wet acid explosion',
    volume: 0.5,
    maxVoices: 4,
    layers: [
      L(
        {
          wave: Wave.Noise,
          baseFreq: 0.2,
          freqRamp: -0.1,
          sustain: 0.15,
          decay: 0.35,
          punch: 0.65,
          lpfFreq: 0.5,
          phaserOffset: 0.2,
        },
        1,
      ),
      L(
        {
          wave: Wave.Saw,
          baseFreq: 0.35,
          freqRamp: -0.3,
          sustain: 0.05,
          decay: 0.2,
          vibStrength: 0.7,
          vibSpeed: 0.8,
          lpfFreq: 0.5,
          lpfResonance: 0.6,
        },
        0.4,
      ),
    ],
  },
  {
    key: 'nid_crush',
    description: 'Carnifex crushing claw impact',
    volume: 0.6,
    maxVoices: 2,
    layers: [
      L(
        {
          wave: Wave.Sine,
          baseFreq: 0.12,
          freqRamp: -0.35,
          sustain: 0.06,
          decay: 0.25,
          punch: 0.9,
        },
        1,
      ),
      L(
        { wave: Wave.Noise, baseFreq: 0.18, sustain: 0.06, decay: 0.25, punch: 0.7, lpfFreq: 0.45 },
        0.9,
      ),
    ],
  },
  {
    key: 'carnifex_roar',
    description: 'Carnifex rearing up before its charge',
    volume: 0.65,
    maxVoices: 1,
    layers: [
      L(
        {
          wave: Wave.Saw,
          baseFreq: 0.24,
          freqRamp: 0.04,
          attack: 0.08,
          sustain: 0.4,
          decay: 0.4,
          vibStrength: 0.5,
          vibSpeed: 0.4,
          lpfFreq: 0.5,
          lpfResonance: 0.7,
        },
        0.9,
      ),
      L(
        {
          wave: Wave.Saw,
          baseFreq: 0.31,
          attack: 0.08,
          sustain: 0.35,
          decay: 0.4,
          vibStrength: 0.55,
          vibSpeed: 0.45,
          lpfFreq: 0.55,
        },
        0.5,
      ),
      L(
        { wave: Wave.Noise, baseFreq: 0.14, attack: 0.05, sustain: 0.35, decay: 0.4, lpfFreq: 0.3 },
        0.6,
      ),
    ],
  },
];
