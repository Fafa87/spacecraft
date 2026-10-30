import { describe, expect, it } from 'vitest';
import { Rng } from '../src/math/rng.js';

describe('Rng', () => {
  it('is deterministic for a seed', () => {
    const a = new Rng(42);
    const b = new Rng(42);
    for (let i = 0; i < 100; i++) expect(a.next()).toBe(b.next());
  });

  it('stays within ranges', () => {
    const r = new Rng(7);
    for (let i = 0; i < 1000; i++) {
      const v = r.int(2, 5);
      expect(v).toBeGreaterThanOrEqual(2);
      expect(v).toBeLessThanOrEqual(5);
      const f = r.next();
      expect(f).toBeGreaterThanOrEqual(0);
      expect(f).toBeLessThan(1);
    }
  });

  it('weighted() respects zero weights and state can be restored', () => {
    const r = new Rng(1);
    for (let i = 0; i < 200; i++) expect(r.weighted({ a: 0, b: 1 })).toBe('b');
    expect(r.weighted({ a: 0 })).toBeUndefined();
    const s = r.getState();
    const x = r.next();
    r.setState(s);
    expect(r.next()).toBe(x);
  });
});
