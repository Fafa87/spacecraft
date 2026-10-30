import { ARENA, PLAYER } from '../../constants.js';
import { clamp } from '../../math/vec.js';

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
): void {
  let dx = clamp(mx, -1, 1);
  let dy = clamp(my, -1, 1);
  const l = Math.sqrt(dx * dx + dy * dy);
  if (l > 1) {
    dx /= l;
    dy /= l;
  }
  pos.x = clamp(pos.x + dx * speed * dt, PLAYER.radius, ARENA.width - PLAYER.radius);
  pos.y = clamp(pos.y + dy * speed * dt, PLAYER.radius, ARENA.height - PLAYER.radius);
}

export const playerMoveSpeed = (moveSpeedMul: number): number => PLAYER.speed * moveSpeedMul;
