import { ARENA, PICKUP } from '../../constants.js';
import type { DirectorConfig, WaveTableEntry } from '../../data/index.js';
import { clamp, dist2 } from '../../math/vec.js';
import { allocId, alivePlayers } from '../world.js';
import type { Enemy, World } from '../types.js';

const teamScale = (cfg: DirectorConfig, teamSize: number): number =>
  cfg.teamScale[clamp(teamSize, 1, 4) - 1];

export function waveEntryAt(cfg: DirectorConfig, t: number): WaveTableEntry {
  let entry = cfg.waveTable[0];
  for (const e of cfg.waveTable) if (t >= e.fromSec) entry = e;
  return entry;
}

/** Threat points per second at survival time t (seconds). */
export function budgetRate(cfg: DirectorConfig, t: number, teamSize: number): number {
  const minutes = t / 60;
  return (
    (cfg.budget.base + cfg.budget.perMinute * minutes ** cfg.budget.exponent) *
    teamScale(cfg, teamSize)
  );
}

export function maxAlive(cfg: DirectorConfig, t: number, teamSize: number): number {
  const raw = (cfg.maxAlive.base + cfg.maxAlive.perMinute * (t / 60)) * teamScale(cfg, teamSize);
  return Math.min(cfg.maxAlive.cap, Math.floor(raw));
}

export const enemyHpScale = (cfg: DirectorConfig, t: number): number =>
  1 + cfg.hpScalePerMinute * (t / 60);

/** Escalating spawn director: earns a threat budget over time and spends it on enemy groups. */
export function updateDirector(world: World, dt: number): void {
  const cfg = world.content.director;
  const st = world.director;
  const t = world.time;
  const alive = alivePlayers(world);
  if (alive.length === 0) return;
  const scale = teamScale(cfg, world.teamSize);

  if (t >= st.nextSurgeAt) {
    st.wave++;
    st.surgeUntil = t + cfg.surge.duration;
    st.nextSurgeAt += cfg.surge.interval;
    st.budget += (cfg.surge.bonusThreat + cfg.surge.bonusThreatPerWave * (st.wave - 1)) * scale;
    world.events.push({ e: 'surge', n: st.wave });
    const b = cfg.bosses;
    if (st.wave >= b.firstSurge && (st.wave - b.firstSurge) % b.everySurge === 0) {
      const n = b.count[clamp(world.teamSize, 1, 4) - 1] + b.extraPerAppearance * st.bossWaves;
      st.bossWaves++;
      spawnGroup(world, b.enemy, n, enemyHpScale(cfg, t));
      world.events.push({ e: 'boss', t: b.enemy, n });
    }
  }
  const surging = t < st.surgeUntil;
  st.budget += budgetRate(cfg, t, world.teamSize) * (surging ? cfg.surge.budgetMultiplier : 1) * dt;
  st.budget = Math.min(st.budget, 120 * scale + st.wave * 10);

  const cap = Math.floor(maxAlive(cfg, t, world.teamSize) * (surging ? 1.3 : 1));
  const entry = waveEntryAt(cfg, t);
  let guard = 0;
  while (st.budget >= 1 && world.enemies.length < cap && guard++ < 10) {
    const type = world.rng.weighted(entry.weights);
    if (!type) break;
    const def = world.content.enemy(type);
    const affordable = Math.floor(st.budget / def.threat);
    if (affordable < 1) break;
    const [gMin, gMax] = def.group ?? [
      cfg.spawn.groupMin,
      def.threat >= 5 ? Math.max(1, Math.floor(cfg.spawn.groupMax / 3)) : cfg.spawn.groupMax,
    ];
    const n = Math.min(affordable, cap - world.enemies.length, world.rng.int(gMin, gMax));
    if (n < 1) break;
    spawnGroup(world, type, n, enemyHpScale(cfg, t));
    st.budget -= n * def.threat;
  }

  if (t >= st.nextCrateAt) {
    st.nextCrateAt = t + world.rng.range(cfg.crates.intervalMin, cfg.crates.intervalMax);
    spawnCrate(world);
  }
}

/** Spawns `n` enemies of a type around one spawn point out of the marines' sight. */
export function spawnGroup(world: World, type: string, n: number, hpMul: number): void {
  const cfg = world.content.director;
  const [gx, gy] = pickSpawnPoint(world, cfg.spawn.minDistance, cfg.spawn.maxDistance, 80);
  for (let i = 0; i < n; i++) {
    const ox = world.rng.range(-1, 1) * cfg.spawn.groupSpread;
    const oy = world.rng.range(-1, 1) * cfg.spawn.groupSpread;
    spawnEnemy(world, type, gx + ox, gy + oy, hpMul);
  }
}

/** Creates one enemy (clamped into the arena). */
export function spawnEnemy(world: World, type: string, x: number, y: number, hpMul = 1): Enemy {
  const def = world.content.enemy(type);
  const hp = def.hp * hpMul;
  const e: Enemy = {
    id: allocId(world),
    type,
    x: clamp(x, def.radius, ARENA.width - def.radius),
    y: clamp(y, def.radius, ARENA.height - def.radius),
    vx: 0,
    vy: 0,
    angle: 0,
    hp,
    maxHp: hp,
    attackCooldown: world.rng.range(0.2, 1),
    fuse: -1,
    strafe: world.rng.chance(0.5) ? 1 : -1,
    chargePhase: 0,
    chargeTimer: 0,
    chargeCooldown: def.charge ? world.rng.range(0.5, def.charge.cooldown) : 0,
    chargeDx: 0,
    chargeDy: 0,
    burrowed: !!def.burrow,
    synSpeed: 1,
    synDamage: 1,
    attackAnim: 0,
    dead: false,
  };
  world.enemies.push(e);
  return e;
}

/** Random point in a ring around a random alive marine, kept inside the arena and away from all marines. */
export function pickSpawnPoint(
  world: World,
  minD: number,
  maxD: number,
  margin: number,
): [number, number] {
  const alive = alivePlayers(world);
  let best: [number, number] = [margin, margin];
  let bestScore = -Infinity;
  for (let attempt = 0; attempt < 6; attempt++) {
    const anchor = world.rng.pick(alive);
    const a = world.rng.range(0, Math.PI * 2);
    const d = world.rng.range(minD, maxD);
    const x = clamp(anchor.x + Math.cos(a) * d, margin, ARENA.width - margin);
    const y = clamp(anchor.y + Math.sin(a) * d, margin, ARENA.height - margin);
    let nearest = Infinity;
    for (const p of alive) nearest = Math.min(nearest, dist2(x, y, p.x, p.y));
    if (nearest >= minD * minD * 0.5) return [x, y];
    if (nearest > bestScore) {
      bestScore = nearest;
      best = [x, y];
    }
  }
  return best;
}

export function spawnCrate(world: World): void {
  const alive = alivePlayers(world);
  if (alive.length === 0) return;
  const cfg = world.content.director.crates;
  const weights: Record<string, number> = {};
  for (const w of world.content.weaponOrder) {
    if (w.crateWeight > 0 && alive.some((p) => !p.weapons.includes(w.id)))
      weights[w.id] = w.crateWeight;
  }
  const weapon = world.rng.weighted(weights);
  const [x, y] = pickSpawnPoint(world, cfg.minDistance, cfg.maxDistance, 60);
  world.pickups.push({
    id: allocId(world),
    kind: weapon ? 'weapon' : 'medkit',
    weapon,
    x,
    y,
    life: PICKUP.lifetime,
  });
  world.events.push({ e: 'crate', x: Math.round(x), y: Math.round(y) });
}
