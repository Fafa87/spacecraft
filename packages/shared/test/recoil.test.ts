import { describe, expect, it } from 'vitest';
import { TICK_DT } from '../src/constants.js';
import {
  applyRecoilKick,
  MARINE_AIM_RECOIL as R,
  RECOIL_WIRE,
  recoilMoveMul,
  recoilPushPx,
  recoilRecoveryTime,
  stepRecoil,
  WEAPON_RECOIL,
  weaponRecoil,
} from '../src/data/index.js';
import { createWireCodec } from '../src/net/index.js';
import {
  applyInput,
  buildSnapshot,
  createWorld,
  emptyInput,
  grantWeapon,
  stepWorld,
  type Player,
  type PlayerInput,
  type World,
} from '../src/sim/index.js';

const RAD = Math.PI / 180;

function world(seed = 5, weapon = 'heavy_bolter'): World {
  const w = createWorld([{ id: 1, name: 'M1' }], seed);
  w.director.idle = true;
  const p = w.players[0];
  p.x = 600;
  p.y = 600;
  grantWeapon(w, p, weapon);
  p.current = weapon;
  return w;
}

let seq = 0;
function tick(w: World, i: Partial<PlayerInput>, p: Player = w.players[0]): void {
  applyInput(w, p.id, { ...emptyInput(), seq: ++seq, ...i });
  stepWorld(w, TICK_DT);
}

/** Recoil right after the first shot (recoil starts at 0, so it is exactly one kick). */
function firstKick(walking: boolean, weapon = 'heavy_bolter', seed = 5): number {
  const w = world(seed, weapon);
  const p = w.players[0];
  const move = walking ? { mx: 0, my: 1 } : {};
  for (let t = 0; t < 30; t++) tick(w, move); // settle: brace when standing, full stride when walking
  if (walking) expect(p.moveFrac).toBeGreaterThan(0.95);
  else expect(p.moveFrac).toBe(0);
  const before = w.projectiles.length;
  for (let t = 0; t < 60 && w.projectiles.length === before; t++) {
    expect(p.recoil).toBe(0);
    tick(w, { ...move, aim: 0, fire: true });
  }
  expect(w.projectiles.length).toBeGreaterThan(before);
  return Math.abs(p.recoil);
}

describe('aim recoil data', () => {
  it('standing ×0.1, walking ×1 scaled by speed, braced counts as standing', () => {
    expect(R.standingMul).toBe(0.1);
    expect(R.walkingMul).toBe(1);
    expect(recoilMoveMul(0, false)).toBeCloseTo(0.1, 12);
    expect(recoilMoveMul(1, false)).toBeCloseTo(1, 12);
    expect(recoilMoveMul(0.5, false)).toBeCloseTo(0.55, 12);
    expect(recoilMoveMul(1, true)).toBeCloseTo(0.1, 12);
  });

  it('per-weapon kick order: flamer ≈ 0 < bolt rifle < plasma = frag < heavy bolter max; melta biggest single kick', () => {
    const k = (id: string) => weaponRecoil(id).kickDeg;
    expect(k('flamer')).toBeLessThan(0.1);
    expect(k('flamer')).toBeLessThan(k('bolt_rifle'));
    expect(k('bolt_rifle')).toBeLessThan(k('heavy_bolter'));
    expect(k('heavy_bolter')).toBeLessThan(k('plasma_gun'));
    expect(k('plasma_gun')).toBe(k('frag_grenade'));
    for (const id of Object.keys(WEAPON_RECOIL))
      if (id !== 'meltagun') expect(k('meltagun')).toBeGreaterThan(k(id));
    expect(weaponRecoil('heavy_bolter').maxDeg).toBeGreaterThan(weaponRecoil('bolt_rifle').maxDeg);
    expect(weaponRecoil('unknown_gun')).toEqual(weaponRecoil('__default__'));
    expect(weaponRecoil('toString').kickDeg).toBe(weaponRecoil('unknown').kickDeg);
  });

  it('recovers ~70% in ~0.4 s (exponential)', () => {
    for (const def of Object.values(WEAPON_RECOIL)) {
      const t = recoilRecoveryTime(def);
      expect(t).toBeGreaterThan(0.28);
      expect(t).toBeLessThan(0.45);
    }
    const def = weaponRecoil('bolt_rifle');
    const s = { recoil: 2 * RAD };
    for (let i = 0; i < Math.round(0.4 / TICK_DT); i++) stepRecoil(s, def, TICK_DT);
    expect(s.recoil / (2 * RAD)).toBeCloseTo(0.3, 1);
    for (let i = 0; i < 200; i++) stepRecoil(s, def, TICK_DT);
    expect(s.recoil).toBe(0);
  });

  it('kick sign bias (65% one way), clamp at maxDeg, push-out capped', () => {
    const def = weaponRecoil('meltagun');
    const a = { recoil: 0 };
    expect(applyRecoilKick(a, def, 1, 0.1)).toBeCloseTo(def.kickDeg * RAD, 12);
    const b = { recoil: 0 };
    expect(applyRecoilKick(b, def, 1, 0.9)).toBeCloseTo(-def.kickDeg * RAD, 12);
    expect(0.5 + R.signBias).toBeCloseTo(0.65, 12);
    const c = { recoil: 0 };
    for (let i = 0; i < 5; i++) applyRecoilKick(c, def, 1, 0.1);
    expect(c.recoil).toBeCloseTo(def.maxDeg * RAD, 12);
    expect(recoilPushPx(def, c.recoil)).toBeLessThanOrEqual(def.kickDistPx! * R.distCapMul);
    expect(recoilPushPx(weaponRecoil('flamer'), 0.01)).toBe(0);
    // Wire range covers every cap.
    for (const d of Object.values(WEAPON_RECOIL))
      expect(d.maxDeg * RAD * RECOIL_WIRE.scale).toBeLessThan(RECOIL_WIRE.bias - 1);
  });
});

describe('aim recoil in the sim', () => {
  it('standing kicks 0.1× the walking kick (heavy bolter, bolt rifle, melta)', () => {
    for (const id of ['heavy_bolter', 'bolt_rifle', 'meltagun']) {
      const kick = weaponRecoil(id).kickDeg * RAD;
      expect(firstKick(false, id)).toBeCloseTo(kick * 0.1, 9);
      expect(firstKick(true, id)).toBeCloseTo(kick, 9);
    }
  });

  it('every projectile flies along input aim + recoil (the aim the reticle shows)', () => {
    const w = world(9);
    const p = w.players[0];
    const def = w.content.weapon('heavy_bolter');
    const rdef = weaponRecoil('heavy_bolter');
    let shots = 0;
    let maxRecoil = 0;
    for (let t = 0; t < 120; t++) {
      // the shot fired this tick uses the recoil left after this tick's recovery
      const expected = 0.3 + p.recoil * Math.exp(-rdef.recoveryPerS * TICK_DT);
      const before = new Set(w.projectiles.map((q) => q.id));
      tick(w, { mx: 0, my: 1, aim: 0.3, fire: true });
      for (const q of w.projectiles) {
        if (before.has(q.id) || q.ownerId !== p.id) continue;
        shots++;
        expect(Math.abs(Math.atan2(q.vy, q.vx) - expected)).toBeLessThanOrEqual(
          def.spread / 2 + 1e-4,
        );
      }
      maxRecoil = Math.max(maxRecoil, Math.abs(p.recoil));
      expect(p.aim).toBeCloseTo(0.3 + p.recoil, 12);
    }
    expect(shots).toBeGreaterThan(10);
    expect(maxRecoil).toBeGreaterThan(2 * rdef.kickDeg * RAD);
    expect(maxRecoil).toBeLessThanOrEqual(rdef.maxDeg * RAD + 1e-12);
  });

  it('is deterministic for a seed and resets when the marine goes down', () => {
    const trace = (seed: number) => {
      const w = world(seed);
      const out: number[] = [];
      for (let t = 0; t < 90; t++) {
        tick(w, { mx: Math.sin(t / 9), my: 1, aim: t / 30, fire: true });
        out.push(w.players[0].recoil);
      }
      return out;
    };
    expect(trace(21)).toEqual(trace(21));
    expect(trace(21)).not.toEqual(trace(22));
    const w = world(3);
    for (let t = 0; t < 20; t++) tick(w, { my: 1, aim: 0, fire: true });
    expect(w.players[0].recoil).not.toBe(0);
    w.players[0].state = 'downed';
    tick(w, {});
    expect(w.players[0].recoil).toBe(0);
  });

  it('snapshot rc (1/2000 rad) survives the binary wire codec without a JSON fallback', () => {
    const w = world(4);
    const host = createWireCodec();
    const client = createWireCodec();
    let seen = 0;
    for (let t = 0; t < 120; t++) {
      tick(w, { mx: 1, my: 0.3, aim: 1, fire: t % 40 < 30 });
      const s = buildSnapshot(w, 60);
      const me = s.players[0];
      if (w.players[0].recoil === 0) expect(me.rc).toBeUndefined();
      else {
        expect(Math.abs(me.rc! - w.players[0].recoil)).toBeLessThanOrEqual(0.5 / 2000 + 1e-12);
        seen++;
      }
      const frame = host.encode({ t: 'snap', s });
      expect(frame).toBeInstanceOf(Uint8Array);
      const got = client.decode(frame) as { s: typeof s };
      expect(got.s.players[0].rc).toBe(me.rc);
    }
    expect(seen).toBeGreaterThan(30);
  });
});
