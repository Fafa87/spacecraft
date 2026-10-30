import { ARENA, PLAYER } from '../../constants.js';
import { dist2 } from '../../math/vec.js';
import type { SpatialHash } from '../spatialHash.js';
import type { Enemy, Projectile, World } from '../types.js';
import { damageEnemy, damagePlayer, explode } from './combat.js';

/** Largest enemy radius; used to pad broad-phase queries. */
const QUERY_PAD = 40;

export function updateProjectiles(world: World, enemyHash: SpatialHash<Enemy>, dt: number): void {
  for (const pr of world.projectiles) {
    if (pr.dead) continue;
    const x0 = pr.sx ?? pr.x;
    const y0 = pr.sy ?? pr.y;
    pr.sx = pr.sy = undefined;
    if (pr.drag > 0) {
      const f = Math.max(0, 1 - pr.drag * dt);
      pr.vx *= f;
      pr.vy *= f;
    }
    pr.x += pr.vx * dt;
    pr.y += pr.vy * dt;
    pr.life -= dt;
    if (pr.life <= 0 || pr.x < 0 || pr.y < 0 || pr.x > ARENA.width || pr.y > ARENA.height) {
      detonate(world, pr);
      continue;
    }
    if (pr.owner === 'player') hitEnemies(world, pr, x0, y0, enemyHash);
    else hitPlayers(world, pr, x0, y0);
  }
  world.projectiles = world.projectiles.filter((p) => !p.dead);
}

/**
 * Swept test: squared distance from (px,py) to the segment (x0,y0)-(x1,y1).
 * Fast projectiles move ~35 px per tick, more than a small enemy's diameter,
 * so a point test would tunnel straight through targets.
 */
export function segmentDist2(
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  px: number,
  py: number,
): number {
  const dx = x1 - x0;
  const dy = y1 - y0;
  const len2 = dx * dx + dy * dy;
  const t = len2 > 0 ? Math.max(0, Math.min(1, ((px - x0) * dx + (py - y0) * dy) / len2)) : 0;
  return dist2(x0 + dx * t, y0 + dy * t, px, py);
}

function hitEnemies(
  world: World,
  pr: Projectile,
  x0: number,
  y0: number,
  hash: SpatialHash<Enemy>,
): void {
  const halfLen = Math.hypot(pr.x - x0, pr.y - y0) / 2;
  const hits: { enemy: Enemy; t: number }[] = [];
  hash.query((pr.x + x0) / 2, (pr.y + y0) / 2, halfLen + pr.radius + QUERY_PAD, (enemy) => {
    if (enemy.dead || enemy.burrowed || pr.hit.includes(enemy.id)) return;
    const r = world.content.enemy(enemy.type).radius + pr.radius;
    if (segmentDist2(x0, y0, pr.x, pr.y, enemy.x, enemy.y) > r * r) return;
    hits.push({ enemy, t: dist2(x0, y0, enemy.x, enemy.y) });
  });
  // Resolve nearest-first so a non-piercing shot hits the first enemy in its path.
  hits.sort((a, b) => a.t - b.t);
  for (const { enemy } of hits) {
    if (pr.dead) return;
    pr.hit.push(enemy.id);
    if (pr.explosion) {
      // Mass-reactive: direct hit (if any) and then the blast on the target.
      if (pr.damage > 0) {
        damageEnemy(world, enemy, pr.damage, {
          armorPierce: pr.armorPierce,
          sourcePlayerId: pr.ownerId,
          kx: pr.vx,
          ky: pr.vy,
          knockback: pr.knockback,
        });
      }
      pr.x = enemy.x;
      pr.y = enemy.y;
      detonate(world, pr);
      return;
    }
    damageEnemy(world, enemy, pr.damage, {
      armorPierce: pr.armorPierce,
      sourcePlayerId: pr.ownerId,
      kx: pr.vx,
      ky: pr.vy,
      knockback: pr.knockback,
    });
    if (pr.kind !== 'flame' && pr.kind !== 'slash')
      world.events.push({ e: 'hit', x: Math.round(enemy.x), y: Math.round(enemy.y), k: pr.kind });
    if (pr.pierceLeft-- <= 0) pr.dead = true;
  }
}

function hitPlayers(world: World, pr: Projectile, x0: number, y0: number): void {
  for (const p of world.players) {
    if (p.state !== 'alive') continue;
    const r = PLAYER.radius + pr.radius;
    if (segmentDist2(x0, y0, pr.x, pr.y, p.x, p.y) <= r * r) {
      if (pr.damage > 0) damagePlayer(world, p, pr.damage);
      if (pr.explosion) {
        detonate(world, pr);
        return;
      }
      world.events.push({ e: 'hit', x: Math.round(pr.x), y: Math.round(pr.y), k: pr.kind });
      pr.dead = true;
      return;
    }
  }
}

function detonate(world: World, pr: Projectile): void {
  if (pr.dead) return;
  pr.dead = true;
  if (pr.explosion) {
    explode(world, pr.x, pr.y, pr.explosion, {
      hurtsEnemies: pr.owner === 'player',
      hurtsPlayers: pr.owner === 'enemy' || !!pr.explosion.friendlyFire,
      sourcePlayerId: pr.owner === 'player' ? pr.ownerId : undefined,
    });
  }
}
