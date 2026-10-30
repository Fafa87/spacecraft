import { ARENA, PLAYER } from '../../constants.js';
import { clamp, dist2 } from '../../math/vec.js';
import type { SpatialHash } from '../spatialHash.js';
import { allocId } from '../world.js';
import type { Enemy, Player, World } from '../types.js';
import { damagePlayer, explode } from './combat.js';

function nearestAlivePlayer(world: World, x: number, y: number): Player | undefined {
  let best: Player | undefined;
  let bestD = Infinity;
  for (const p of world.players) {
    if (p.state !== 'alive') continue;
    const d = dist2(x, y, p.x, p.y);
    if (d < bestD) {
      bestD = d;
      best = p;
    }
  }
  return best;
}

/** Enemy AI: steering + behaviour-specific attacks, separation, collisions. */
export function updateEnemies(world: World, hash: SpatialHash<Enemy>, dt: number): void {
  for (const e of world.enemies) {
    if (e.dead) continue;
    const def = world.content.enemy(e.type);
    e.attackCooldown = Math.max(0, e.attackCooldown - dt);
    const target = nearestAlivePlayer(world, e.x, e.y);

    let desiredX = 0;
    let desiredY = 0;
    if (target) {
      const dx = target.x - e.x;
      const dy = target.y - e.y;
      const d = Math.hypot(dx, dy) || 1;
      const nx = dx / d;
      const ny = dy / d;
      e.angle = Math.atan2(dy, dx);

      switch (def.behavior) {
        case 'melee':
        case 'kamikaze': {
          desiredX = nx * def.speed;
          desiredY = ny * def.speed;
          break;
        }
        case 'ranged': {
          const r = def.ranged!;
          let radial = 0;
          if (d > r.preferredDistance + 60) radial = 1;
          else if (d < r.preferredDistance - 60) radial = -0.8;
          desiredX = (nx * radial - ny * e.strafe * 0.6) * def.speed;
          desiredY = (ny * radial + nx * e.strafe * 0.6) * def.speed;
          if (world.rng.chance(dt * 0.3)) e.strafe = -e.strafe;
          if (d <= r.range && e.attackCooldown <= 0) {
            e.attackCooldown = r.cooldown * world.rng.range(0.85, 1.15);
            spit(world, e, target, def.radius);
          }
          break;
        }
      }

      // Melee contact damage.
      const reach = def.radius + PLAYER.radius + 4;
      if (def.contactDamage > 0 && d <= reach && e.attackCooldown <= 0) {
        e.attackCooldown = def.contactCooldown;
        damagePlayer(world, target, def.contactDamage);
        world.events.push({ e: 'bite', p: target.id });
      }

      // Kamikaze fuse.
      if (def.explode && def.behavior === 'kamikaze') {
        if (e.fuse < 0 && d <= def.explode.triggerDistance + def.radius) e.fuse = def.explode.fuse;
        if (e.fuse >= 0) {
          desiredX *= 0.3;
          desiredY *= 0.3;
        }
      }
    }

    if (e.fuse >= 0) {
      e.fuse -= dt;
      if (e.fuse <= 0 && def.explode) {
        e.dead = true;
        world.events.push({ e: 'die', t: e.type, x: Math.round(e.x), y: Math.round(e.y) });
        explode(world, e.x, e.y, def.explode, { hurtsPlayers: true, hurtsEnemies: true });
        continue;
      }
    }

    // Separation from neighbours.
    let sx = 0;
    let sy = 0;
    hash.query(e.x, e.y, def.radius * 2 + 10, (o) => {
      if (o === e || o.dead) return;
      const or = world.content.enemy(o.type).radius;
      const minD = def.radius + or;
      const dx = e.x - o.x;
      const dy = e.y - o.y;
      const d2 = dx * dx + dy * dy;
      if (d2 < minD * minD && d2 > 1e-6) {
        const d = Math.sqrt(d2);
        const push = (minD - d) / minD;
        sx += (dx / d) * push;
        sy += (dy / d) * push;
      }
    });
    desiredX += sx * def.speed * 1.5;
    desiredY += sy * def.speed * 1.5;

    // Steering towards desired velocity (knockback decays naturally).
    const k = Math.min(1, def.accel * dt);
    e.vx += (desiredX - e.vx) * k;
    e.vy += (desiredY - e.vy) * k;
    e.x = clamp(e.x + e.vx * dt, def.radius, ARENA.width - def.radius);
    e.y = clamp(e.y + e.vy * dt, def.radius, ARENA.height - def.radius);

    // Enemies never push marines (keeps client prediction exact); push the enemy out instead.
    for (const p of world.players) {
      if (p.state === 'dead') continue;
      const minD = def.radius + PLAYER.radius;
      const dx = e.x - p.x;
      const dy = e.y - p.y;
      const d2 = dx * dx + dy * dy;
      if (d2 < minD * minD) {
        const d = Math.sqrt(d2) || 1;
        e.x = p.x + (dx / d) * minD;
        e.y = p.y + (dy / d) * minD;
      }
    }
  }
  world.enemies = world.enemies.filter((e) => !e.dead);
}

function spit(world: World, e: Enemy, target: Player, radius: number): void {
  const spec = world.content.enemy(e.type).ranged!.projectile;
  // Aim straight with a little spread; marines can dodge by moving.
  const a = Math.atan2(target.y - e.y, target.x - e.x) + world.rng.range(-0.08, 0.08);
  world.projectiles.push({
    id: allocId(world),
    owner: 'enemy',
    ownerId: e.id,
    kind: spec.kind,
    x: e.x + Math.cos(a) * radius,
    y: e.y + Math.sin(a) * radius,
    vx: Math.cos(a) * spec.speed,
    vy: Math.sin(a) * spec.speed,
    life: spec.lifetime,
    radius: spec.radius,
    damage: spec.damage,
    pierceLeft: 0,
    armorPierce: false,
    drag: 0,
    knockback: 0,
    explosion: spec.explosion,
    hit: [],
    dead: false,
  });
  world.events.push({ e: 'spit', x: Math.round(e.x), y: Math.round(e.y) });
}
