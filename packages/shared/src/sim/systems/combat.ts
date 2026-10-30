import { PICKUP, PLAYER } from '../../constants.js';
import type { ExplosionSpec } from '../../data/index.js';
import { dist } from '../../math/vec.js';
import { allocId } from '../world.js';
import type { Enemy, Player, World } from '../types.js';

export interface DamageOpts {
  armorPierce?: boolean;
  sourcePlayerId?: number;
  /** Knockback impulse direction & magnitude. */
  kx?: number;
  ky?: number;
  knockback?: number;
}

/** Applies damage to an enemy (armor, knockback, death handling). Returns damage dealt. */
export function damageEnemy(
  world: World,
  enemy: Enemy,
  amount: number,
  opts: DamageOpts = {},
): number {
  if (enemy.dead) return 0;
  const def = world.content.enemy(enemy.type);
  const dmg = opts.armorPierce ? amount : Math.max(amount * 0.2, amount - def.armor);
  enemy.hp -= dmg;
  if (opts.knockback && (opts.kx || opts.ky)) {
    const l = Math.hypot(opts.kx ?? 0, opts.ky ?? 0) || 1;
    enemy.vx += ((opts.kx ?? 0) / l) * (opts.knockback / def.mass);
    enemy.vy += ((opts.ky ?? 0) / l) * (opts.knockback / def.mass);
  }
  const shooter =
    opts.sourcePlayerId !== undefined
      ? world.players.find((p) => p.id === opts.sourcePlayerId)
      : undefined;
  if (shooter) shooter.damageDealt += dmg;
  if (enemy.hp <= 0) killEnemy(world, enemy, shooter);
  return dmg;
}

export function killEnemy(world: World, enemy: Enemy, killer?: Player): void {
  if (enemy.dead) return;
  enemy.dead = true;
  const def = world.content.enemy(enemy.type);
  world.stats.kills++;
  if (killer) killer.kills++;
  world.events.push({ e: 'die', t: enemy.type, x: Math.round(enemy.x), y: Math.round(enemy.y) });
  if (def.explode?.onDeath)
    explode(world, enemy.x, enemy.y, def.explode, { hurtsPlayers: true, hurtsEnemies: true });
  if (world.rng.chance(def.medkitDropChance)) {
    world.pickups.push({
      id: allocId(world),
      kind: 'medkit',
      x: enemy.x,
      y: enemy.y,
      life: PICKUP.lifetime,
    });
  }
}

export function damagePlayer(world: World, player: Player, amount: number): void {
  if (player.state !== 'alive' || player.invuln > 0 || amount <= 0) return;
  player.hp -= amount;
  player.invuln = PLAYER.hurtInvuln;
  world.events.push({ e: 'hurt', p: player.id, d: Math.round(amount) });
  if (player.hp <= 0) {
    player.hp = 0;
    player.state = 'downed';
    player.downedTime = 0;
    player.reviveProgress = 0;
    player.reloadTimer = 0;
    world.events.push({ e: 'down', p: player.id });
  }
}

export interface ExplodeOpts {
  hurtsPlayers: boolean;
  hurtsEnemies: boolean;
  sourcePlayerId?: number;
}

/** Radial damage with linear falloff to `edgeFactor` at the rim. Ignores armor. */
export function explode(
  world: World,
  x: number,
  y: number,
  spec: ExplosionSpec,
  opts: ExplodeOpts,
): void {
  world.events.push({ e: 'boom', x: Math.round(x), y: Math.round(y), r: spec.radius });
  const falloff = (d: number) =>
    spec.damage * (1 - (1 - spec.edgeFactor) * Math.min(1, d / spec.radius));
  if (opts.hurtsEnemies) {
    for (const enemy of world.enemies) {
      if (enemy.dead) continue;
      const def = world.content.enemy(enemy.type);
      const d = dist(x, y, enemy.x, enemy.y) - def.radius;
      if (d > spec.radius) continue;
      damageEnemy(world, enemy, falloff(Math.max(0, d)), {
        armorPierce: true,
        sourcePlayerId: opts.sourcePlayerId,
        kx: enemy.x - x,
        ky: enemy.y - y,
        knockback: 260,
      });
    }
  }
  if (opts.hurtsPlayers) {
    for (const p of world.players) {
      if (p.state !== 'alive') continue;
      const d = dist(x, y, p.x, p.y) - PLAYER.radius;
      if (d > spec.radius) continue;
      // Player-fired explosions deal reduced self/team damage.
      const mul = opts.sourcePlayerId !== undefined ? 0.25 : 1;
      damagePlayer(world, p, falloff(Math.max(0, d)) * mul);
    }
  }
}
