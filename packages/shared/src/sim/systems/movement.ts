import { ARENA, PLAYER } from '../../constants.js';
import { clamp } from '../../math/vec.js';
import type { ArenaSize } from '../../maps/types.js';

/**
 * Player movement for one input frame. Pure & deterministic: the client calls
 * the exact same function for prediction, so keep it free of world state.
 */
export function stepPlayerMovement(
  pos: { x: number; y: number },
  mx: number,
  my: number,
  speed: number,
  dt: number,
  /** Map playfield; defaults to the wave map's arena. */
  arena: ArenaSize = ARENA,
): void {
  let dx = clamp(mx, -1, 1);
  let dy = clamp(my, -1, 1);
  const l = Math.sqrt(dx * dx + dy * dy);
  if (l > 1) {
    dx /= l;
    dy /= l;
  }
  pos.x = clamp(pos.x + dx * speed * dt, PLAYER.radius, arena.width - PLAYER.radius);
  pos.y = clamp(pos.y + dy * speed * dt, PLAYER.radius, arena.height - PLAYER.radius);
}

export const playerMoveSpeed = (moveSpeedMul: number): number => PLAYER.speed * moveSpeedMul;

/**
 * Firing slow-down state for one tick: snaps to 1 while the trigger is held, then eases back to 0
 * over PLAYER.fireMoveRecover seconds. Pure, so the client predicts it from its own inputs.
 */
export function stepFireSlow(fireSlow: number, firing: boolean, dt: number): number {
  return firing ? 1 : Math.max(0, fireSlow - dt / PLAYER.fireMoveRecover);
}

/** Marine speed with the equipped weapon: carry penalty × (eased) firing penalty. */
export function marineMoveSpeed(
  weapon: { moveSpeedMul: number; fireMoveMul: number },
  fireSlow: number,
): number {
  return PLAYER.speed * weapon.moveSpeedMul * (1 - (1 - weapon.fireMoveMul) * fireSlow);
}
