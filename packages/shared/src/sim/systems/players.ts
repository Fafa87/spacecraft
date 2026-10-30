import { PLAYER } from '../../constants.js';
import { dist2 } from '../../math/vec.js';
import type { Player, World } from '../types.js';
import { marineMoveSpeed, stepFireSlow, stepPlayerMovement } from './movement.js';

export function updatePlayerMovement(world: World, dt: number): void {
  for (const p of world.players) {
    if (p.state !== 'alive') {
      p.fireSlow = 0;
      continue;
    }
    p.invuln = Math.max(0, p.invuln - dt);
    const def = world.content.weapon(p.current);
    trackStillness(p, p.input.mx, p.input.my, dt);
    p.fireSlow = stepFireSlow(p.fireSlow, p.input.fire, dt);
    stepPlayerMovement(p, p.input.mx, p.input.my, marineMoveSpeed(def, p.fireSlow), dt);
  }
}

/** Movement input below this magnitude counts as standing still (sticks drift a little). */
export const STILL_INPUT = 0.15;

/** Accumulates time spent not moving (bracing); any real movement input resets it. */
export function trackStillness(p: Player, mx: number, my: number, dt: number): void {
  if (Math.hypot(mx, my) > STILL_INPUT) p.stillTime = 0;
  else p.stillTime += dt;
}

/** Downed / revive / bleed-out / disconnect handling and the game-over check. */
export function updatePlayerStatus(world: World, dt: number): void {
  const rr = PLAYER.reviveRadius * PLAYER.reviveRadius;
  for (const p of world.players) {
    if (!p.connected && p.state !== 'dead') kill(world, p.id);
    if (p.state !== 'downed') continue;
    p.downedTime += dt;
    const reviver = world.players.find(
      (o) => o !== p && o.state === 'alive' && dist2(o.x, o.y, p.x, p.y) <= rr,
    );
    if (reviver) {
      p.reviveProgress += dt / PLAYER.reviveTime;
      if (p.reviveProgress >= 1) {
        p.state = 'alive';
        p.hp = p.maxHp * PLAYER.reviveHpFraction;
        p.invuln = PLAYER.reviveInvuln;
        p.reviveProgress = 0;
        p.downedTime = 0;
        world.events.push({ e: 'revive', p: p.id, by: reviver.id });
        continue;
      }
    } else {
      p.reviveProgress = Math.max(0, p.reviveProgress - dt / PLAYER.reviveTime);
    }
    if (p.downedTime >= PLAYER.bleedOutTime) kill(world, p.id);
  }

  if (!world.players.some((p) => p.state === 'alive')) {
    for (const p of world.players) if (p.state !== 'dead') kill(world, p.id);
    world.over = true;
  }
}

function kill(world: World, id: number): void {
  const p = world.players.find((x) => x.id === id);
  if (!p || p.state === 'dead') return;
  p.state = 'dead';
  p.hp = 0;
  p.diedAt = world.time;
  world.events.push({ e: 'dead', p: p.id });
}
