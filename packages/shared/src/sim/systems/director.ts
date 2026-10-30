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
    const [pMin, pMax] = cfg.spawn.surgePoints;
    st.surgePoints = pickFlankingBreaches(world, world.rng.int(pMin, pMax));
    world.events.push({ e: 'surge', n: st.wave });
    const b = cfg.bosses;
    if (st.wave >= b.firstSurge && (st.wave - b.firstSurge) % b.everySurge === 0) {
      const n = b.count[clamp(world.teamSize, 1, 4) - 1] + b.extraPerAppearance * st.bossWaves;
      st.bossWaves++;
      queueGroup(world, b.enemy, n, enemyHpScale(cfg, t), true);
      world.events.push({ e: 'boss', t: b.enemy, n });
    }
  }
  const surging = t < st.surgeUntil;
  st.budget += budgetRate(cfg, t, world.teamSize) * (surging ? cfg.surge.budgetMultiplier : 1) * dt;
  st.budget = Math.min(st.budget, 120 * scale + st.wave * 10);

  const cap = Math.floor(maxAlive(cfg, t, world.teamSize) * (surging ? 1.3 : 1));
  const entry = waveEntryAt(cfg, t);
  const count = () => world.enemies.length + st.queue.reduce((s, q) => s + q.n, 0);
  let guard = 0;
  while (st.budget >= 1 && count() < cap && guard++ < 10) {
    const type = world.rng.weighted(entry.weights);
    if (!type) break;
    const def = world.content.enemy(type);
    const affordable = Math.floor(st.budget / def.threat);
    if (affordable < 1) break;
    const [gMin, gMax] = def.group ?? [
      cfg.spawn.groupMin,
      def.threat >= 5 ? Math.max(1, Math.floor(cfg.spawn.groupMax / 3)) : cfg.spawn.groupMax,
    ];
    const n = Math.min(affordable, cap - count(), world.rng.int(gMin, gMax));
    if (n < 1) break;
    // Burrowers tunnel in from anywhere; everything else comes out of a hive breach.
    if (def.burrow) spawnGroup(world, type, n, enemyHpScale(cfg, t));
    else queueGroup(world, type, n, enemyHpScale(cfg, t), false);
    st.budget -= n * def.threat;
  }

  emergeQueued(world);

  if (t >= st.nextCrateAt) {
    st.nextCrateAt = t + world.rng.range(cfg.crates.intervalMin, cfg.crates.intervalMax);
    spawnCrate(world);
  }
}

/** How long a breach shows as active after a group bursts out of it. */
export const BREACH_ACTIVE_SECONDS = 3;

/**
 * Queues a group at a breach: the breach telegraphs (pulses) and the group emerges when it ends.
 * Groups picked for a breach that is already telegraphing join that wave.
 */
export function queueGroup(
  world: World,
  type: string,
  n: number,
  hpMul: number,
  boss = false,
): void {
  const cfg = world.content.director;
  const st = world.director;
  const surging = world.time < st.surgeUntil && st.surgePoints.length > 0;
  const point = surging && !boss ? world.rng.pick(st.surgePoints) : pickBreach(world);
  const pending = st.queue.find((q) => q.point === point && q.at > world.time);
  const delay = boss ? cfg.spawn.bossTelegraph : cfg.spawn.telegraph;
  const at = pending && !boss ? pending.at : world.time + delay;
  if (!pending || boss)
    world.events.push({ e: 'breach', i: point, t: type, ...(boss ? { b: 1 as const } : {}) });
  st.queue.push({ point, type, n, at, hpMul });
}

/** Spawns every queued group whose telegraph is over. */
function emergeQueued(world: World): void {
  const cfg = world.content.director;
  const st = world.director;
  if (!st.queue.some((q) => q.at <= world.time)) return;
  const burst = new Map<number, number>();
  st.queue = st.queue.filter((q) => {
    if (q.at > world.time) return true;
    const sp = cfg.spawnPoints[q.point];
    for (let i = 0; i < q.n; i++) {
      const a = world.rng.range(0, Math.PI * 2);
      const r = Math.sqrt(world.rng.next()) * cfg.spawn.groupSpread;
      spawnEnemy(world, q.type, sp.x + Math.cos(a) * r, sp.y + Math.sin(a) * r, q.hpMul);
    }
    burst.set(q.point, (burst.get(q.point) ?? 0) + q.n);
    st.activeUntil[q.point] = world.time + BREACH_ACTIVE_SECONDS;
    return false;
  });
  for (const [i, n] of burst) world.events.push({ e: 'swarm', i, n });
}

/** Distance from a spawn point to the nearest living marine. */
const nearestMarine = (world: World, x: number, y: number): number => {
  let best = Infinity;
  for (const p of alivePlayers(world)) best = Math.min(best, Math.hypot(p.x - x, p.y - y));
  return best;
};

/**
 * Picks a breach for a group: never one within `pointMinDistance` of a living marine; among the
 * rest, closer breaches are likelier (so the swarm reaches the squad) but every one gets used.
 */
export function pickBreach(world: World): number {
  const cfg = world.content.director;
  const weights: Record<string, number> = {};
  let farthest = 0;
  let farthestD = -1;
  cfg.spawnPoints.forEach((sp, i) => {
    const d = nearestMarine(world, sp.x, sp.y);
    if (d > farthestD) {
      farthestD = d;
      farthest = i;
    }
    if (d >= cfg.spawn.pointMinDistance) weights[String(i)] = 1 / (0.6 + d / 900) ** 2;
  });
  const pick = world.rng.weighted(weights);
  return pick === undefined ? farthest : Number(pick);
}

/**
 * `k` usable breaches spread around the squad (largest angular separation as seen from the
 * squad's centre), so a surge comes from several sides at once.
 */
export function pickFlankingBreaches(world: World, k: number): number[] {
  const cfg = world.content.director;
  const alive = alivePlayers(world);
  const cx = alive.reduce((s, p) => s + p.x, 0) / alive.length;
  const cy = alive.reduce((s, p) => s + p.y, 0) / alive.length;
  const usable = cfg.spawnPoints
    .map((sp, i) => ({ i, a: Math.atan2(sp.y - cy, sp.x - cx), d: nearestMarine(world, sp.x, sp.y) }))
    .filter((c) => c.d >= cfg.spawn.pointMinDistance);
  if (usable.length === 0) return [pickBreach(world)];
  const chosen = [usable.splice(world.rng.int(0, usable.length - 1), 1)[0]];
  while (chosen.length < k && usable.length) {
    let bestIdx = 0;
    let bestSep = -1;
    usable.forEach((c, idx) => {
      let sep = Infinity;
      for (const o of chosen) {
        const diff = Math.abs(((c.a - o.a + Math.PI * 3) % (Math.PI * 2)) - Math.PI);
        sep = Math.min(sep, diff);
      }
      if (sep > bestSep) {
        bestSep = sep;
        bestIdx = idx;
      }
    });
    chosen.push(usable.splice(bestIdx, 1)[0]);
  }
  return chosen.map((c) => c.i);
}

/** Spawns `n` enemies of a type around one random point out of the marines' sight (burrowers). */
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
