import { ARENA, PLAYER } from '../../constants.js';
import type { EnemyDef } from '../../data/index.js';
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

/** Synapse creatures buff every other (non-synapse) Tyranid within their radius. */
function applySynapse(world: World, hash: SpatialHash<Enemy>): void {
  for (const e of world.enemies) {
    e.synSpeed = 1;
    e.synDamage = 1;
  }
  for (const s of world.enemies) {
    if (s.dead || s.burrowed) continue;
    const syn = world.content.enemy(s.type).synapse;
    if (!syn) continue;
    const r2 = syn.radius * syn.radius;
    hash.query(s.x, s.y, syn.radius, (o) => {
      if (o === s || o.dead || world.content.enemy(o.type).synapse) return;
      if (dist2(s.x, s.y, o.x, o.y) > r2) return;
      o.synSpeed = Math.max(o.synSpeed, syn.speedMul);
      o.synDamage = Math.max(o.synDamage, syn.damageMul);
    });
  }
}

/** Charge state machine. Returns true while the charge controls movement. */
function updateCharge(
  world: World,
  e: Enemy,
  def: EnemyDef,
  target: Player,
  d: number,
  nx: number,
  ny: number,
  dt: number,
): boolean {
  const c = def.charge!;
  e.chargeCooldown = Math.max(0, e.chargeCooldown - dt);
  if (e.chargePhase === 0) {
    if (e.chargeCooldown > 0 || d > c.triggerDistance || d < c.minDistance) return false;
    e.chargePhase = 1;
    e.chargeTimer = c.windup;
    world.events.push({ e: 'charge', x: Math.round(e.x), y: Math.round(e.y), t: e.type });
  }
  e.chargeTimer -= dt;
  if (e.chargePhase === 1) {
    // Rear up and keep tracking the target until the dash starts.
    e.chargeDx = nx;
    e.chargeDy = ny;
    e.vx *= 0.8;
    e.vy *= 0.8;
    if (e.chargeTimer <= 0) {
      e.chargePhase = 2;
      e.chargeTimer = c.duration;
      world.events.push({ e: 'leap', x: Math.round(e.x), y: Math.round(e.y), t: e.type });
    }
    return true;
  }
  const v = def.speed * e.synSpeed * c.speedMul;
  e.vx = e.chargeDx * v;
  e.vy = e.chargeDy * v;
  e.angle = Math.atan2(e.chargeDy, e.chargeDx);
  if (e.chargeTimer <= 0) {
    e.chargePhase = 0;
    e.chargeCooldown = c.cooldown * world.rng.range(0.85, 1.15);
  }
  return true;
}

/** Enemy AI: steering + behaviour-specific attacks, separation, collisions. */
export function updateEnemies(world: World, hash: SpatialHash<Enemy>, dt: number): void {
  applySynapse(world, hash);
  for (const e of world.enemies) {
    if (e.dead) continue;
    const def = world.content.enemy(e.type);
    e.attackCooldown = Math.max(0, e.attackCooldown - dt);
    e.attackAnim = Math.max(0, e.attackAnim - dt);
    const target = nearestAlivePlayer(world, e.x, e.y);
    const speed = def.speed * e.synSpeed;

    let desiredX = 0;
    let desiredY = 0;
    let charging = false;
    if (target) {
      const dx = target.x - e.x;
      const dy = target.y - e.y;
      const d = Math.hypot(dx, dy) || 1;
      const nx = dx / d;
      const ny = dy / d;
      e.angle = Math.atan2(dy, dx);

      if (e.burrowed) {
        // Tunnelling: straight at the target, fast, no attacks, no collisions.
        const v = speed * def.burrow!.speedMul;
        e.vx = nx * v;
        e.vy = ny * v;
        e.x = clamp(e.x + e.vx * dt, def.radius, ARENA.width - def.radius);
        e.y = clamp(e.y + e.vy * dt, def.radius, ARENA.height - def.radius);
        if (d <= def.burrow!.emergeDistance) {
          e.burrowed = false;
          e.attackCooldown = 0.35;
          e.vx = nx * speed * 1.5;
          e.vy = ny * speed * 1.5;
          world.events.push({ e: 'emerge', x: Math.round(e.x), y: Math.round(e.y), t: e.type });
        }
        continue;
      }

      if (def.charge) charging = updateCharge(world, e, def, target, d, nx, ny, dt);

      if (!charging) {
        switch (def.behavior) {
          case 'melee':
          case 'kamikaze': {
            desiredX = nx * speed;
            desiredY = ny * speed;
            break;
          }
          case 'ranged': {
            const r = def.ranged!;
            // Synapse makes shooters bolder: they close in further.
            const pref = r.preferredDistance * (e.synSpeed > 1 ? 0.7 : 1);
            let radial = 0;
            if (d > pref + 60) radial = 1;
            else if (d < pref - 60) radial = -0.8;
            desiredX = (nx * radial - ny * e.strafe * 0.6) * speed;
            desiredY = (ny * radial + nx * e.strafe * 0.6) * speed;
            if (world.rng.chance(dt * 0.3)) e.strafe = -e.strafe;
            if (d <= r.range && e.attackCooldown <= 0) {
              e.attackCooldown = r.cooldown * world.rng.range(0.85, 1.15);
              spit(world, e, target, def.radius);
            }
            break;
          }
        }
      }

      // Melee contact damage (dashing uses the charge damage).
      const reach = def.radius + PLAYER.radius + 4;
      const contact = e.chargePhase === 2 ? def.charge!.damage : def.contactDamage;
      if (contact > 0 && d <= reach && e.attackCooldown <= 0) {
        e.attackCooldown = def.contactCooldown;
        e.attackAnim = 0.3;
        damagePlayer(world, target, contact * e.synDamage);
        world.events.push({ e: 'bite', p: target.id, t: e.type });
        // A Hormagaunt leap ends on impact; a Carnifex ploughs on.
        if (e.chargePhase === 2 && def.charge!.duration < 0.5) e.chargeTimer = 0;
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

    if (!charging) {
      // Separation from neighbours.
      let sx = 0;
      let sy = 0;
      hash.query(e.x, e.y, def.radius * 2 + 10, (o) => {
        if (o === e || o.dead || o.burrowed) return;
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
      desiredX += sx * speed * 1.5;
      desiredY += sy * speed * 1.5;

      // Steering towards desired velocity (knockback decays naturally).
      const k = Math.min(1, def.accel * dt);
      e.vx += (desiredX - e.vx) * k;
      e.vy += (desiredY - e.vy) * k;
    }
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
  e.attackAnim = 0.3;
  // Aim straight with a little spread; marines can dodge by moving. Lobbed spores lead a bit.
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
    damage: spec.damage * e.synDamage,
    pierceLeft: 0,
    armorPierce: false,
    drag: spec.drag ?? 0,
    knockback: 0,
    explosion: spec.explosion,
    hit: [],
    dead: false,
  });
  world.events.push({ e: 'spit', x: Math.round(e.x), y: Math.round(e.y), t: e.type });
}
