import { describe, expect, it } from 'vitest';
import {
  DEFAULT_MUZZLE,
  defaultContent,
  muzzleBlend,
  muzzleDef,
  muzzlePoint,
  SIM_MUZZLE_FORWARD,
  WEAPON_MUZZLE,
} from '../src/index.js';
import { createWorld } from '../src/sim/world.js';
import { fireWeapon } from '../src/sim/systems/weapons.js';

describe('muzzle offset math', () => {
  it('aim 0: forward along +x, lateral to +y (marine right, clockwise on screen)', () => {
    const m = WEAPON_MUZZLE.bolt_rifle!;
    const p = muzzlePoint(100, 200, 0, 'bolt_rifle');
    expect(p.x).toBeCloseTo(100 + m.forward, 9);
    expect(p.y).toBeCloseTo(200 + m.lateral, 9);
    expect(p.a).toBe(0);
  });
  it('rotates with the aim (90° and 180°)', () => {
    const m = WEAPON_MUZZLE.heavy_bolter!;
    const d = muzzlePoint(0, 0, Math.PI / 2, 'heavy_bolter');
    expect(d.x).toBeCloseTo(-m.lateral, 9);
    expect(d.y).toBeCloseTo(m.forward, 9);
    const l = muzzlePoint(0, 0, Math.PI, 'heavy_bolter');
    expect(l.x).toBeCloseTo(-m.forward, 9);
    expect(l.y).toBeCloseTo(-m.lateral, 9);
    // distance from the centre never depends on the aim
    for (let a = -3; a <= 3; a += 0.37) {
      const q = muzzlePoint(5, 7, a, 'heavy_bolter');
      expect(Math.hypot(q.x - 5, q.y - 7)).toBeCloseTo(Math.hypot(m.forward, m.lateral), 9);
    }
  });
  it('follows the drawn pose: recoil slide, raise rotation and scale', () => {
    const m = WEAPON_MUZZLE.meltagun!;
    const r = muzzlePoint(0, 0, 0, 'meltagun', { back: 5 });
    expect(r.x).toBeCloseTo(m.forward - 5, 9);
    const s = muzzlePoint(0, 0, 0, 'meltagun', { scale: 0.9 });
    expect(s.x).toBeCloseTo(m.forward * 0.9, 9);
    expect(s.y).toBeCloseTo(m.lateral * 0.9, 9);
    const t = muzzlePoint(0, 0, 0, 'meltagun', { back: 6, rot: 0.7, scale: 0.9 });
    expect(t.a).toBeCloseTo(0.7, 9);
    expect(t.x).toBeCloseTo(-6 + (Math.cos(0.7) * m.forward - Math.sin(0.7) * m.lateral) * 0.9, 9);
    expect(t.y).toBeCloseTo((Math.sin(0.7) * m.forward + Math.cos(0.7) * m.lateral) * 0.9, 9);
  });
  it('every weapon has an entry with the tip ahead of the marine; unknown → default', () => {
    for (const w of defaultContent.weaponOrder) {
      const m = muzzleDef(w.id);
      expect(m).toBe(WEAPON_MUZZLE[w.id]);
      expect(m.forward).toBeGreaterThan(16);
      expect(m.breech).toBeLessThan(m.forward);
    }
    expect(muzzleDef('future_gun')).toBe(DEFAULT_MUZZLE);
    expect(muzzleDef('constructor')).toBe(DEFAULT_MUZZLE);
    // heavier guns have longer barrels
    expect(muzzleDef('heavy_bolter').forward).toBeGreaterThan(muzzleDef('bolt_rifle').forward);
  });
  it('blend: 1 at the muzzle, 0 after the converge distance, monotonic', () => {
    expect(muzzleBlend(0)).toBe(1);
    expect(muzzleBlend(120)).toBe(0);
    expect(muzzleBlend(500)).toBe(0);
    expect(muzzleBlend(-5)).toBe(1);
    let prev = 1;
    for (let d = 0; d <= 130; d += 5) {
      const b = muzzleBlend(d);
      expect(b).toBeLessThanOrEqual(prev);
      prev = b;
    }
    expect(muzzleBlend(10, 0)).toBe(0);
  });
});

describe('sim projectile origin is unchanged (balance + determinism)', () => {
  it('spawns on the aim line at SIM_MUZZLE_FORWARD, collision swept from the marine centre', () => {
    const w = createWorld([{ id: 1, name: 'A' }], 3);
    const p = w.players[0]!;
    p.x = 500;
    p.y = 400;
    p.aim = 0.6;
    expect(SIM_MUZZLE_FORWARD).toBe(26); // = PLAYER.radius + 10, as before
    for (const def of defaultContent.weaponOrder) {
      w.projectiles = [];
      w.events = [];
      fireWeapon(w, p, def);
      const pr = w.projectiles[0]!;
      expect(pr.x).toBeCloseTo(500 + Math.cos(0.6) * 26, 9);
      expect(pr.y).toBeCloseTo(400 + Math.sin(0.6) * 26, 9);
      expect(pr.sx).toBe(500);
      expect(pr.sy).toBe(400);
      const ev = w.events.find((e) => e.e === 'shot') as { x: number; y: number };
      expect(ev.x).toBe(Math.round(500 + Math.cos(0.6) * 26));
    }
  });
});
