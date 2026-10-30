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
    if (pr.owner === 'player') hitEnemies(world, pr, enemyHash);
    else hitPlayers(world, pr);
  }
  world.projectiles = world.projectiles.filter((p) => !p.dead);
}

function hitEnemies(world: World, pr: Projectile, hash: SpatialHash<Enemy>): void {
  hash.query(pr.x, pr.y, pr.radius + QUERY_PAD, (enemy) => {
    if (pr.dead || enemy.dead || pr.hit.includes(enemy.id)) return;
    const r = world.content.enemy(enemy.type).radius + pr.radius;
    if (dist2(pr.x, pr.y, enemy.x, enemy.y) > r * r) return;
    pr.hit.push(enemy.id);
    if (pr.explosion) {
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
    if (pr.kind !== 'flame') world.events.push({ e: 'hit', x: Math.round(pr.x), y: Math.round(pr.y), k: pr.kind });
    if (pr.pierceLeft-- <= 0) pr.dead = true;
  });
}

function hitPlayers(world: World, pr: Projectile): void {
  for (const p of world.players) {
    if (p.state !== 'alive') continue;
    const r = PLAYER.radius + pr.radius;
    if (dist2(pr.x, pr.y, p.x, p.y) <= r * r) {
      damagePlayer(world, p, pr.damage);
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
