/**
 * Pure mixer logic (no WebAudio), shared by AudioEngine and unit tests:
 * bus volumes, spatialisation, and priority-based voice stealing.
 */
import { SOUND_BUSES, type SoundBus } from '@sms/shared';

/** All user-facing mixer channels: the SFX buses plus music and a master fader. */
export const MIX_CHANNELS = ['master', ...SOUND_BUSES, 'music'] as const;
export type MixChannel = (typeof MIX_CHANNELS)[number];
export type MixVolumes = Record<MixChannel, number>;

export const DEFAULT_VOLUMES: MixVolumes = {
  master: 0.9,
  weapons: 0.85,
  enemies: 0.85,
  ambience: 0.6,
  ui: 0.7,
  music: 0.5,
};

export const MIX_LABELS: Record<MixChannel, string> = {
  master: 'Master',
  weapons: 'Weapons',
  enemies: 'Tyranids',
  ambience: 'Ambience',
  ui: 'Interface',
  music: 'Music',
};

/** Sanitises persisted volumes (unknown keys dropped, values clamped to 0..1). */
export function loadVolumes(raw: unknown): MixVolumes {
  const out: MixVolumes = { ...DEFAULT_VOLUMES };
  if (raw && typeof raw === 'object')
    for (const ch of MIX_CHANNELS) {
      const v = (raw as Record<string, unknown>)[ch];
      if (typeof v === 'number' && Number.isFinite(v)) out[ch] = Math.max(0, Math.min(1, v));
    }
  return out;
}

export function busOf(bus: string | undefined): SoundBus {
  return (SOUND_BUSES as readonly string[]).includes(bus ?? '') ? (bus as SoundBus) : 'ui';
}

/** Distances (world px) for attenuation: full volume inside `near`, silent past `far`. */
export interface SpatialOpts {
  near: number;
  far: number;
  /** Half the visible width: a source at the screen edge pans fully to that side. */
  halfWidth: number;
}

export const DEFAULT_SPATIAL: SpatialOpts = { near: 320, far: 1500, halfWidth: 640 };

/** Gain (0..1) and stereo pan (-1..1) of a source at offset (dx, dy) from the listener. */
export function spatialize(
  dx: number,
  dy: number,
  o: SpatialOpts = DEFAULT_SPATIAL,
): { gain: number; pan: number } {
  const d = Math.hypot(dx, dy);
  let gain = 1;
  if (d > o.near) {
    const k = Math.min(1, (d - o.near) / Math.max(1, o.far - o.near));
    gain = (1 - k) ** 1.6;
  }
  const pan = Math.max(-0.9, Math.min(0.9, (dx / Math.max(1, o.halfWidth)) * 0.9));
  return { gain, pan };
}

export interface VoiceInfo {
  key: string;
  priority: number;
  started: number;
  ends: number;
}

/**
 * Decides which voices to stop before a new one starts.
 * Returns `null` when the new sound should be dropped (everything playing matters more),
 * else the list of voices to steal (possibly empty).
 */
export function chooseSteal<V extends VoiceInfo>(
  active: readonly V[],
  incoming: { key: string; priority: number; maxVoices: number },
  maxTotal: number,
): V[] | null {
  const steal: V[] = [];
  const same = active.filter((v) => v.key === incoming.key).sort((a, b) => a.started - b.started);
  if (same.length >= incoming.maxVoices) steal.push(same[0]);
  if (active.length - steal.length >= maxTotal) {
    // lowest priority first, then the one closest to finishing
    const cands = active
      .filter((v) => !steal.includes(v))
      .sort((a, b) => a.priority - b.priority || a.ends - b.ends);
    const victim = cands[0];
    if (!victim || victim.priority > incoming.priority) return null;
    steal.push(victim);
  }
  return steal;
}

/** Picks a variant index, avoiding an immediate repeat when there is a choice. */
export function pickVariant(count: number, last: number, rnd: number): number {
  if (count <= 1) return 0;
  if (last < 0 || last >= count) return Math.min(count - 1, Math.floor(rnd * count));
  const i = Math.floor(rnd * (count - 1));
  return i >= last ? i + 1 : i;
}
