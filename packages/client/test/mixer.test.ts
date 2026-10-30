import { describe, expect, it } from 'vitest';
import {
  DEFAULT_VOLUMES,
  MIX_CHANNELS,
  MIX_LABELS,
  busOf,
  chooseSteal,
  loadVolumes,
  pickVariant,
  spatialize,
  type VoiceInfo,
} from '../src/audio/mixer.js';
import { swarmLevel } from '../src/game/enemyAudio.js';

const v = (key: string, priority: number, started: number, ends = started + 1): VoiceInfo => ({
  key,
  priority,
  started,
  ends,
});

describe('mixer: volumes', () => {
  it('has a default and a label for every channel', () => {
    for (const ch of MIX_CHANNELS) {
      expect(DEFAULT_VOLUMES[ch]).toBeGreaterThan(0);
      expect(MIX_LABELS[ch]).toBeTruthy();
    }
    expect(MIX_CHANNELS).toEqual(
      expect.arrayContaining(['master', 'weapons', 'enemies', 'ambience', 'ui', 'music']),
    );
  });

  it('sanitises persisted values: clamps, ignores junk, keeps defaults', () => {
    const vol = loadVolumes({ weapons: 2, enemies: -1, music: 'loud', bogus: 0.3, ui: 0.25 });
    expect(vol.weapons).toBe(1);
    expect(vol.enemies).toBe(0);
    expect(vol.music).toBe(DEFAULT_VOLUMES.music);
    expect(vol.ui).toBe(0.25);
    expect('bogus' in vol).toBe(false);
    expect(loadVolumes(null)).toEqual(DEFAULT_VOLUMES);
    expect(loadVolumes('x')).toEqual(DEFAULT_VOLUMES);
  });

  it('maps unknown buses to ui', () => {
    expect(busOf('weapons')).toBe('weapons');
    expect(busOf(undefined)).toBe('ui');
    expect(busOf('nope')).toBe('ui');
  });
});

describe('mixer: spatialisation', () => {
  it('is full volume up close, fades with distance and is silent past far', () => {
    expect(spatialize(0, 0).gain).toBe(1);
    expect(spatialize(300, 0).gain).toBe(1);
    const mid = spatialize(900, 0).gain;
    expect(mid).toBeGreaterThan(0);
    expect(mid).toBeLessThan(1);
    expect(spatialize(1200, 0).gain).toBeLessThan(mid);
    expect(spatialize(5000, 0).gain).toBe(0);
  });

  it('pans by horizontal offset, clamped', () => {
    expect(spatialize(0, 500).pan).toBe(0);
    expect(spatialize(-320, 0).pan).toBeLessThan(0);
    expect(spatialize(320, 0).pan).toBeGreaterThan(0);
    expect(spatialize(99999, 0).pan).toBeCloseTo(0.9);
    expect(spatialize(-99999, 0).pan).toBeCloseTo(-0.9);
  });
});

describe('mixer: voice limit', () => {
  it('steals the oldest instance when a sound hits its per-key cap', () => {
    const a = [v('bolt', 5, 0), v('bolt', 5, 1), v('hiss', 1, 2)];
    expect(chooseSteal(a, { key: 'bolt', priority: 5, maxVoices: 2 }, 32)).toEqual([a[0]]);
    expect(chooseSteal(a, { key: 'bolt', priority: 5, maxVoices: 3 }, 32)).toEqual([]);
  });

  it('at the global limit steals the lowest priority, or drops a less important sound', () => {
    const a = [v('roar', 9, 0), v('hiss', 1, 1, 5), v('step', 1, 2, 3), v('bolt', 5, 3)];
    expect(chooseSteal(a, { key: 'boom', priority: 6, maxVoices: 4 }, 4)).toEqual([a[2]]);
    const loud = [v('roar', 9, 0), v('boom', 8, 1)];
    expect(chooseSteal(loud, { key: 'hiss', priority: 1, maxVoices: 4 }, 2)).toBeNull();
  });
});

describe('mixer: variants', () => {
  it('never repeats the last variant when there is a choice, and covers all', () => {
    const seen = new Set<number>();
    let last = -1;
    for (let i = 0; i < 200; i++) {
      const n = pickVariant(4, last, (i * 0.618) % 1);
      expect(n).not.toBe(last);
      expect(n).toBeGreaterThanOrEqual(0);
      expect(n).toBeLessThan(4);
      seen.add(n);
      last = n;
    }
    expect(seen.size).toBe(4);
    expect(pickVariant(1, 0, 0.9)).toBe(0);
    expect(pickVariant(3, -1, 0)).toBe(0);
    expect(pickVariant(3, -1, 0.999)).toBe(2);
  });
});

describe('swarm ambience level', () => {
  it('is silent with no enemies and grows monotonically to 1', () => {
    expect(swarmLevel(0)).toBe(0);
    let prev = 0;
    for (const n of [1, 5, 10, 20, 40]) {
      expect(swarmLevel(n)).toBeGreaterThan(prev);
      prev = swarmLevel(n);
    }
    expect(swarmLevel(40)).toBe(1);
    expect(swarmLevel(400)).toBe(1);
  });
});
