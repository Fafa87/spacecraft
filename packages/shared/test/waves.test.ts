import { describe, expect, it } from 'vitest';
import { TICK_DT } from '../src/constants.js';
import { defaultContent } from '../src/data/index.js';
import {
  createWorld,
  dropCaps,
  remainingEnemies,
  spawnEnemy,
  startWave,
  stepWorld,
  type World,
} from '../src/sim/index.js';
import { killEnemy } from '../src/sim/systems/combat.js';
import type { GameEvent } from '../src/sim/types.js';

const cfg = defaultContent.director;
const ticks = (sec: number) => Math.ceil(sec / TICK_DT);

/** Marines that cannot die, so a test can stand in a wave for minutes. */
function world(teamSize = 1, seed = 11): World {
  const w = createWorld(
    Array.from({ length: teamSize }, (_, i) => ({ id: i + 1, name: `M${i + 1}` })),
    seed,
  );
  return w;
}
function immortal(w: World): void {
  for (const p of w.players) {
    p.maxHp = 1e9;
    p.hp = 1e9;
  }
}

/** Steps `n` ticks; `each` runs before every step (e.g. to kill enemies). */
function run(w: World, n: number, each?: (w: World) => void): GameEvent[] {
  const evs: GameEvent[] = [];
  for (let i = 0; i < n; i++) {
    immortal(w);
    each?.(w);
    stepWorld(w, TICK_DT);
    evs.push(...w.events);
  }
  return evs;
}

const killAll = (w: World) => {
  for (const e of w.enemies) if (!e.dead) killEnemy(w, e, w.players[0]);
};
/** Kills everything except one straggler (a non-exploding enemy that is kept alive). */
function killAllBut(keep: { id: number }) {
  return (w: World) => {
    if (keep.id < 0) {
      const e = w.enemies.find((x) => !x.dead && !defaultContent.enemy(x.type).explode);
      if (e) keep.id = e.id;
    }
    for (const e of w.enemies) if (!e.dead && e.id !== keep.id) killEnemy(w, e, w.players[0]);
  };
}

describe('finite waves', () => {
  it('opens with a breather, then wave 1 has a fixed roster', () => {
    const w = world();
    expect(w.director.phase).toBe('breather');
    const evs = run(w, ticks(cfg.waves.firstDelay + 0.5));
    const surge = evs.find((e) => e.e === 'surge');
    expect(surge).toMatchObject({ e: 'surge', n: 1 });
    expect(w.director.phase).toBe('active');
    expect(w.director.waveTotal).toBeGreaterThan(0);
    expect(remainingEnemies(w)).toBe(w.director.waveTotal);
  });

  it('a wave completes only on a full clear, then counts down the next', () => {
    const w = world();
    const keep = { id: -1 };
    const evs = run(w, ticks(cfg.waves.firstDelay + 90), killAllBut(keep));
    expect(evs.some((e) => e.e === 'cleared')).toBe(false);
    expect(w.director.wave).toBe(1);
    expect(w.director.phase).toBe('active');
    expect(w.director.roster).toHaveLength(0);
    expect(remainingEnemies(w)).toBe(1);
    // the last one is revealed and hunts
    expect(w.director.hunting).toBe(true);
    expect(w.enemies.find((e) => e.id === keep.id)?.hunt).toBe(true);
    // kill it: cleared, breather, then wave 2
    const after = run(w, 2, killAll);
    expect(after).toContainEqual({ e: 'cleared', n: 1, next: cfg.waves.breather });
    expect(w.director.phase).toBe('breather');
    const next = run(w, ticks(cfg.waves.breather - 1), killAll);
    expect(next.some((e) => e.e === 'surge')).toBe(false);
    const go = run(w, ticks(1.5));
    expect(go.find((e) => e.e === 'surge')).toMatchObject({ n: 2 });
  });

  it('a stalled wave is forced on after the timeout', () => {
    const w = world();
    const keep = { id: -1 };
    const evs = run(w, ticks(cfg.waves.firstDelay + cfg.waves.forceNextAfter + 1), killAllBut(keep));
    expect(evs.filter((e) => e.e === 'surge')).toEqual([
      expect.objectContaining({ n: 1 }),
      expect.objectContaining({ n: 2, f: 1 }),
    ]);
    expect(evs.some((e) => e.e === 'cleared')).toBe(false);
  });

  it('medkit drops respect the per-wave cap and children never drop', () => {
    const w = world(4);
    w.director.idle = true;
    startWave(w);
    const cap = dropCaps(cfg, 4).medkits;
    const p = w.players[0];
    for (let i = 0; i < 400; i++) {
      const e = spawnEnemy(w, 'genestealer', p.x + 300, p.y);
      killEnemy(w, e, p);
    }
    expect(w.pickups.filter((x) => x.kind === 'medkit')).toHaveLength(cap);
    // a fresh wave refills the budget, but children still never drop
    startWave(w);
    w.pickups.length = 0;
    for (let i = 0; i < 400; i++) {
      const e = spawnEnemy(w, 'genestealer', p.x + 300, p.y);
      e.child = true;
      killEnemy(w, e, p);
    }
    expect(w.pickups).toHaveLength(0);
  });

  it('supply crates per wave are capped even in a long wave', () => {
    const w = world(2);
    const keep = { id: -1 };
    const evs = run(w, ticks(cfg.waves.firstDelay + cfg.waves.forceNextAfter - 5), killAllBut(keep));
    expect(w.director.wave).toBe(1);
    expect(evs.filter((e) => e.e === 'crate').length).toBe(dropCaps(cfg, 2).crates);
  });

  it('spawner children are finite and count toward the clear', () => {
    const w = world();
    w.director.idle = true;
    startWave(w);
    w.director.roster = [];
    w.director.waveTotal = 0;
    const p = w.players[0];
    const bio = defaultContent.enemy('biovore').spawner!;
    for (let i = 0; i < 6; i++) spawnEnemy(w, 'biovore', p.x + 500, p.y + i * 40);
    w.director.waveTotal = 6;
    w.director.idle = false;
    // Keep the biovores alive; remove children quietly (no spore blast) for two minutes.
    run(w, ticks(120), (w) => {
      for (const e of w.enemies) if (!e.dead && e.child) e.dead = true;
    });
    const parents = w.enemies.filter((e) => e.type === 'biovore' && !e.dead);
    expect(parents).toHaveLength(6);
    for (const e of parents) expect(e.children).toBeLessThanOrEqual(bio.max);
    expect(w.director.waveChildren).toBeLessThanOrEqual(cfg.waves.maxChildren);
    expect(w.director.waveChildren).toBeGreaterThan(0);
    expect(w.director.waveTotal).toBe(6 + w.director.waveChildren);
    expect(w.pickups.filter((x) => x.kind === 'medkit')).toHaveLength(0);
    // once the parents die and no children are left, the wave is cleared
    const evs = run(w, 2, killAll);
    expect(evs.some((e) => e.e === 'cleared')).toBe(true);
  });

  it('wave budgets and caps grow with team size 1..8', () => {
    for (let ts = 2; ts <= 8; ts++) {
      const a = world(ts - 1);
      const b = world(ts);
      a.director.idle = b.director.idle = true;
      startWave(a);
      startWave(b);
      expect(b.director.waveTotal).toBeGreaterThanOrEqual(a.director.waveTotal);
      expect(dropCaps(cfg, ts).medkits).toBeGreaterThanOrEqual(dropCaps(cfg, ts - 1).medkits);
    }
  });
});
