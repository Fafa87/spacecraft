import { describe, expect, it } from 'vitest';
import { ContentRegistry, defaultContent, DIRECTOR, ENEMIES, WEAPONS } from '../src/data/index.js';
import { budgetRate, enemyHpScale, maxAlive, waveEntryAt } from '../src/sim/index.js';

describe('content registry', () => {
  it('default content is valid', () => {
    expect(defaultContent.validate()).toEqual([]);
    expect(defaultContent.startingWeapons().length).toBeGreaterThan(0);
    expect(defaultContent.weaponOrder.length).toBeGreaterThanOrEqual(3);
  });

  it('reports broken content', () => {
    const bad = new ContentRegistry([...WEAPONS, { ...WEAPONS[0], id: 'dup-slot' }], ENEMIES, {
      ...DIRECTOR,
      waveTable: [{ fromSec: 0, weights: { nope: 1 } }] as typeof DIRECTOR.waveTable,
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
  it('budget, cap and hp scale grow over time', () => {
    for (const ts of [1, 2, 3, 4]) {
      expect(budgetRate(DIRECTOR, 300, ts)).toBeGreaterThan(budgetRate(DIRECTOR, 60, ts));
      expect(maxAlive(DIRECTOR, 300, ts)).toBeGreaterThanOrEqual(maxAlive(DIRECTOR, 0, ts));
    }
    expect(enemyHpScale(DIRECTOR, 600)).toBeGreaterThan(enemyHpScale(DIRECTOR, 0));
  });

  it('bigger teams face more pressure', () => {
    expect(budgetRate(DIRECTOR, 120, 4)).toBeGreaterThan(budgetRate(DIRECTOR, 120, 1));
  });

  it('wave table unlocks new enemy types later', () => {
    const early = Object.keys(waveEntryAt(DIRECTOR, 0).weights);
    const late = Object.keys(waveEntryAt(DIRECTOR, 100_000).weights);
    expect(late.length).toBeGreaterThan(early.length);
  });
});
