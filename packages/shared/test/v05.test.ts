import { describe, expect, it } from 'vitest';
import { MAX_PLAYERS, PLAYER, TICK_DT } from '../src/constants.js';
import {
  ContentRegistry,
  defaultContent,
  DIRECTOR,
  expectedHitMul,
  saveChance,
  sustainedDps,
  weaponProfileLabel,
  woundMul,
  type DirectorConfig,
} from '../src/data/index.js';
import {
  applyInput,
  createWorld,
  emptyInput,
  enemyHpScale,
  marineMoveSpeed,
  maxAlive,
  spawnEnemy,
  stepFireSlow,
  stepWorld,
  waveBudget,
  wavePace,
  waveWeightsFor,
  type World,
} from '../src/sim/index.js';
import { damageEnemy, explode } from '../src/sim/systems/combat.js';

const content = defaultContent;
const W = (id: string) => content.weapon(id);
const E = (id: string) => content.enemy(id);

function quietWorld(seed = 11): World {
  const w = createWorld([{ id: 1, name: 'A' }], seed);
  w.director.idle = true;
  return w;
}

describe('v0.5 WH40k profiles', () => {
  it('wound multipliers follow S vs T', () => {
    expect(woundMul(8, 4)).toBe(1.25);
    expect(woundMul(5, 4)).toBe(1);
    expect(woundMul(4, 4)).toBe(0.75);
    expect(woundMul(4, 5)).toBe(0.5);
    expect(woundMul(4, 9)).toBe(0.25);
  });

  it('armour saves worsen with AP, 7+ never saves, 2+ is the best', () => {
    expect(saveChance(4, 0)).toBeCloseTo(3 / 6);
    expect(saveChance(4, 1)).toBeCloseTo(2 / 6);
    expect(saveChance(2, 0)).toBeCloseTo(5 / 6);
    expect(saveChance(2, 4)).toBeCloseTo(1 / 6);
    expect(saveChance(5, 2)).toBe(0);
    expect(saveChance(7, 0)).toBe(0);
  });

  it('every weapon has a Strength profile, roles and a firing slow-down', () => {
    for (const w of content.weaponOrder) {
      expect(weaponProfileLabel(w)).toMatch(/^S\d+ AP(-\d|0)$/);
      expect(w.roles.length).toBeGreaterThan(0);
      expect(w.fireMoveMul).toBeGreaterThan(0);
      expect(w.fireMoveMul).toBeLessThanOrEqual(1);
    }
    expect(W('bolt_rifle').fireMoveMul).toBeCloseTo(0.8);
    expect(W('heavy_bolter').fireMoveMul).toBeCloseTo(0.65);
    expect(W('flamer').fireMoveMul).toBeCloseTo(0.85);
    expect(W('meltagun').roles[0]).toBe('ANTI-TANK');
    expect(W('plasma_gun').roles[0]).toBe('ANTI-ELITE');
    expect(W('flamer').roles[0]).toBe('ANTI-HORDE');
    expect(W('heavy_bolter').roles[0]).toBe('ANTI-HORDE');
    expect(W('frag_grenade').roles[0]).toBe('ANTI-HORDE');
    expect(W('bolt_rifle').roles[0]).toBe('GENERALIST');
  });

  it('weapons are specialised: melta for tanks, plasma for elites, hordes are soft', () => {
    const dps = (w: string, e: string) => sustainedDps(W(w), E(e));
    const others = (best: string) => content.weaponOrder.map((w) => w.id).filter((w) => w !== best);
    for (const w of others('meltagun'))
      expect(dps('meltagun', 'carnifex')).toBeGreaterThan(dps(w, 'carnifex'));
    for (const w of ['bolt_rifle', 'heavy_bolter', 'flamer', 'frag_grenade'])
      expect(dps('plasma_gun', 'warrior')).toBeGreaterThan(dps(w, 'warrior'));
    // Small arms barely scratch a Carnifex; the melta goes straight through.
    const through = (w: string, e: string) => expectedHitMul(W(w).projectile, E(e));
    expect(through('bolt_rifle', 'carnifex')).toBeLessThan(0.1);
    expect(through('flamer', 'carnifex')).toBeLessThan(0.05);
    expect(through('meltagun', 'carnifex')).toBeGreaterThan(0.5);
    // ...while everything hurts gaunts.
    for (const w of content.weaponOrder)
      expect(
        expectedHitMul(
          w.projectile.strength !== undefined ? w.projectile : w.projectile.explosion!,
          E('hormagaunt'),
        ),
      ).toBeGreaterThan(0.6);
    // Anti-horde weapons hit many bugs at once (flame pierces, frag / heavy bolts burst).
    expect(W('flamer').projectile.pierce).toBeGreaterThan(10);
    expect(W('frag_grenade').projectile.explosion!.radius).toBeGreaterThan(100);
    // High damage is wasted on gaunts: the melta's per-shot damage is 10x a gaunt's wounds.
    expect(W('meltagun').projectile.damage).toBeGreaterThan(E('hormagaunt').hp * 5);
  });

  it('rolls armour saves: bounced hits do nothing, the rate matches the profile', () => {
    const w = quietWorld();
    let saved = 0;
    const n = 3000;
    for (let i = 0; i < n; i++) {
      const e = spawnEnemy(w, 'carnifex', 1500, 1000);
      const r = damageEnemy(w, e, 15, { strength: 4, ap: 1 });
      if (r.saved) {
        saved++;
        expect(r.dmg).toBe(0);
        expect(e.hp).toBe(e.maxHp);
      } else expect(r.dmg).toBeCloseTo(15 * 0.25);
      e.dead = true;
    }
    expect(saved / n).toBeGreaterThan(2 / 3 - 0.04);
    expect(saved / n).toBeLessThan(2 / 3 + 0.04);
  });

  it('hits without a Strength (Tyranid spore blasts) ignore toughness and saves', () => {
    const w = quietWorld();
    const e = spawnEnemy(w, 'carnifex', 1500, 1000);
    const r = damageEnemy(w, e, 40, {});
    expect(r).toEqual({ dmg: 40, saved: false });
    const e2 = spawnEnemy(w, 'warrior', 900, 900);
    explode(
      w,
      900,
      900,
      { radius: 50, damage: 30, edgeFactor: 1 },
      { hurtsEnemies: true, hurtsPlayers: false },
    );
    expect(e2.hp).toBeCloseTo(e2.maxHp - 30);
  });

  it('a projectile stopped by armour emits a bounce event (and no hit marker)', () => {
    const w = quietWorld(3);
    const p = w.players[0];
    p.weapons = ['bolt_rifle'];
    const e = spawnEnemy(w, 'carnifex', p.x + 200, p.y);
    let bounces = 0;
    for (let i = 0; i < 120; i++) {
      applyInput(w, p.id, { ...emptyInput(), seq: i + 1, aim: 0, fire: true });
      e.x = p.x + 200;
      e.y = p.y;
      e.vx = e.vy = 0;
      stepWorld(w, TICK_DT);
      bounces += w.events.filter((ev) => ev.e === 'bnc').length;
    }
    expect(bounces).toBeGreaterThan(5);
  });
});

describe('v0.5 slower movement while firing', () => {
  it('eases back to full speed over PLAYER.fireMoveRecover after the trigger is released', () => {
    expect(stepFireSlow(0, true, TICK_DT)).toBe(1);
    let s = 1;
    let t = 0;
    while (s > 0) {
      s = stepFireSlow(s, false, TICK_DT);
      t += TICK_DT;
    }
    expect(t).toBeCloseTo(PLAYER.fireMoveRecover, 1);
    const hb = W('heavy_bolter');
    expect(marineMoveSpeed(hb, 0)).toBeCloseTo(PLAYER.speed * hb.moveSpeedMul);
    expect(marineMoveSpeed(hb, 1)).toBeCloseTo(PLAYER.speed * hb.moveSpeedMul * 0.65);
  });

  it('the shared sim moves a firing marine slower, then recovers', () => {
    const dist = (fire: boolean, after = 0) => {
      const w = quietWorld();
      const p = w.players[0];
      let seq = 0;
      const step = (f: boolean) => {
        applyInput(w, p.id, { ...emptyInput(), seq: ++seq, mx: 1, my: 0, aim: Math.PI, fire: f });
        stepWorld(w, TICK_DT);
      };
      for (let i = 0; i < 20; i++) step(fire);
      for (let i = 0; i < after; i++) step(false);
      const x0 = p.x;
      for (let i = 0; i < 15; i++) step(false);
      return { p, x0, dx: p.x - x0, slow: p.fireSlow };
    };
    // While firing (bolt rifle, 0.8): measure 20 firing ticks of travel.
    const w = quietWorld();
    const p = w.players[0];
    const x0 = p.x;
    for (let i = 0; i < 30; i++) {
      applyInput(w, p.id, { ...emptyInput(), seq: i + 1, mx: 1, my: 0, aim: Math.PI, fire: true });
      stepWorld(w, TICK_DT);
    }
    const firingDx = p.x - x0;
    const w2 = quietWorld();
    const p2 = w2.players[0];
    const x2 = p2.x;
    for (let i = 0; i < 30; i++) {
      applyInput(w2, p2.id, { ...emptyInput(), seq: i + 1, mx: 1, my: 0, aim: Math.PI });
      stepWorld(w2, TICK_DT);
    }
    const walkDx = p2.x - x2;
    expect(firingDx / walkDx).toBeGreaterThan(0.75);
    expect(firingDx / walkDx).toBeLessThan(0.88);
    // Long after release the slow-down is gone.
    const r = dist(true, Math.ceil(PLAYER.fireMoveRecover / TICK_DT) + 1);
    expect(r.slow).toBe(0);
  });
});

describe('v0.5 squad-size scaling', () => {
  const ts = DIRECTOR.teamScaling;
  it('has an entry per squad size for every knob', () => {
    for (const arr of [ts.budget, ts.pace, ts.maxAlive, ts.children, ts.hp, ts.elite])
      expect(arr.length).toBe(MAX_PLAYERS);
  });

  it('bigger squads get more, tougher, faster and more elite Tyranids', () => {
    const eliteShare = (n: number) => {
      const w = waveWeightsFor(DIRECTOR, 6, n, (id) => E(id).threat);
      const total = Object.values(w).reduce((a, b) => a + b, 0);
      const elite = Object.entries(w)
        .filter(([id]) => E(id).threat >= ts.eliteThreat)
        .reduce((a, [, v]) => a + v, 0);
      return elite / total;
    };
    for (let n = 2; n <= MAX_PLAYERS; n++) {
      expect(waveBudget(DIRECTOR, 4, n)).toBeGreaterThan(waveBudget(DIRECTOR, 4, n - 1));
      expect(wavePace(DIRECTOR, 4, n)).toBeGreaterThan(wavePace(DIRECTOR, 4, n - 1));
      expect(maxAlive(DIRECTOR, 2, n)).toBeGreaterThanOrEqual(maxAlive(DIRECTOR, 2, n - 1));
      expect(enemyHpScale(DIRECTOR, 4, n)).toBeGreaterThanOrEqual(enemyHpScale(DIRECTOR, 4, n - 1));
      expect(eliteShare(n)).toBeGreaterThan(eliteShare(n - 1));
    }
    expect(enemyHpScale(DIRECTOR, 1, 8)).toBeGreaterThan(1.3);
    expect(enemyHpScale(DIRECTOR, 1, 8)).toBeLessThan(1.4);
  });

  it('spawned Tyranids of a big squad have more HP', () => {
    const solo = createWorld([{ id: 1, name: 'A' }], 5);
    const squad = createWorld(
      Array.from({ length: 6 }, (_, i) => ({ id: i + 1, name: `m${i}` })),
      5,
    );
    for (const w of [solo, squad]) {
      for (let i = 0; i < Math.ceil(12 / TICK_DT) && w.enemies.length === 0; i++)
        stepWorld(w, TICK_DT);
    }
    expect(squad.enemies[0]!.maxHp).toBeGreaterThan(solo.enemies[0]!.maxHp * 1.3);
    expect(squad.enemies[0]!.maxHp).toBeLessThan(solo.enemies[0]!.maxHp * 1.4);
  });

  it('v0.5.3 halves the per-marine HP bonus, solo unchanged', () => {
    expect(ts.hp.slice(0, 4).map((v) => +v.toFixed(3))).toEqual([1, 1.075, 1.15, 1.2]);
  });

  it('v0.5.3 halves the per-marine pace increase, solo unchanged', () => {
    expect(ts.pace.map((v) => +v.toFixed(3))).toEqual([
      0.85, 1.575, 2.535, 3.575, 4.925, 6.025, 6.875, 7.695,
    ]);
  });

  it('rejects a scaling table that misses squad sizes', () => {
    const bad: DirectorConfig = {
      ...DIRECTOR,
      teamScaling: { ...DIRECTOR.teamScaling, hp: [1, 1.2] },
    };
    const errs = new ContentRegistry(
      [...content.weaponOrder],
      [...content.enemies.values()],
      bad,
    ).validate();
    expect(errs.some((e) => e.includes('teamScaling.hp'))).toBe(true);
    expect(content.validate()).toEqual([]);
  });
});
