import { describe, expect, it } from 'vitest';
import { ContentRegistry, defaultContent, DIRECTOR, ENEMIES, WEAPONS } from '../src/data/index.js';
import { MAX_PLAYERS } from '../src/constants.js';
import { enemyHpScale, maxAlive, waveBudget, waveEntryFor } from '../src/sim/index.js';

describe('content registry', () => {
  it('default content is valid', () => {
    expect(defaultContent.validate()).toEqual([]);
    expect(defaultContent.startingWeapons().length).toBeGreaterThan(0);
    expect(defaultContent.weaponOrder.length).toBeGreaterThanOrEqual(3);
  });

  it('reports broken content', () => {
    const bad = new ContentRegistry([...WEAPONS, { ...WEAPONS[0], id: 'dup-slot' }], ENEMIES, {
      ...DIRECTOR,
      waveTable: [{ fromWave: 1, weights: { nope: 1 } }] as typeof DIRECTOR.waveTable,
    });
    const errors = bad.validate();
    expect(errors.some((e) => e.includes('duplicate weapon slot'))).toBe(true);
    expect(errors.some((e) => e.includes("unknown enemy 'nope'"))).toBe(true);
  });

  it('throws on unknown ids', () => {
    expect(() => defaultContent.weapon('banana')).toThrow();
    expect(() => defaultContent.enemy('banana')).toThrow();
  });
});

describe('director escalation', () => {
  it('wave budget, cap and hp scale grow wave by wave', () => {
    for (let ts = 1; ts <= MAX_PLAYERS; ts++) {
      expect(waveBudget(DIRECTOR, 8, ts)).toBeGreaterThan(waveBudget(DIRECTOR, 2, ts));
      expect(maxAlive(DIRECTOR, 8, ts)).toBeGreaterThanOrEqual(maxAlive(DIRECTOR, 1, ts));
    }
    expect(enemyHpScale(DIRECTOR, 10)).toBeGreaterThan(enemyHpScale(DIRECTOR, 1));
  });

  it('bigger squads (1..8) face bigger waves', () => {
    for (let ts = 2; ts <= MAX_PLAYERS; ts++)
      expect(waveBudget(DIRECTOR, 3, ts)).toBeGreaterThan(waveBudget(DIRECTOR, 3, ts - 1));
    for (const arr of Object.values(DIRECTOR.teamScaling))
      if (Array.isArray(arr)) expect(arr.length).toBeGreaterThanOrEqual(MAX_PLAYERS);
    expect(DIRECTOR.bosses.count.length).toBeGreaterThanOrEqual(MAX_PLAYERS);
  });

  it('wave table unlocks new enemy types later', () => {
    const early = Object.keys(waveEntryFor(DIRECTOR, 1).weights);
    const late = Object.keys(waveEntryFor(DIRECTOR, 1000).weights);
    expect(late.length).toBeGreaterThan(early.length);
  });
});
