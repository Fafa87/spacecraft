import type { SKRSContext2D } from '@napi-rs/canvas';
import type { Rng } from '@sms/shared';

export type Ctx = SKRSContext2D;

/**
 * A sprite = one or more same-sized frames. Convention: sprites that rotate in
 * game face +X (right) at angle 0, anchored at their center unless `anchor` is set.
 *
 * `w`/`h` are in world pixels. With `scale` > 1 the atlas stores frames at w*scale x h*scale
 * and `draw` receives a context already scaled, so generators always draw in world units
 * and get the extra detail for free.
 */
export interface SpriteDef {
  key: string;
  w: number;
  h: number;
  frames: number;
  /** Atlas px per world px (default 1). */
  scale?: number;
  /** Named frame ranges [first, count] (walk / attack / death ...). */
  anims?: Record<string, [number, number]>;
  /** Anchor in 0..1 frame space (default center). */
  anchor?: [number, number];
  /** Text prompt describing the sprite: an art brief for hand-painted / AI replacements. */
  prompt: string;
  /** Category used by the preview sheet and docs. */
  group:
    | 'player'
    | 'weapon'
    | 'enemy'
    | 'projectile'
    | 'pickup'
    | 'icon'
    | 'tile'
    | 'prop'
    | 'decal'
    | 'fx'
    | 'ui';
  /** Draws frame `frame` with origin at the frame's top-left corner (world units). */
  draw(ctx: Ctx, frame: number, rng: Rng): void;
}

/** Builds an anims table + total frame count from ordered [name, count] pairs. */
export function animLayout(parts: Array<[string, number]>): {
  frames: number;
  anims: Record<string, [number, number]>;
} {
  const anims: Record<string, [number, number]> = {};
  let n = 0;
  for (const [name, count] of parts) {
    anims[name] = [n, count];
    n += count;
  }
  return { frames: n, anims };
}

/** Maps an absolute frame index to [animName, localFrame, animLength]. */
export function animAt(
  anims: Record<string, [number, number]>,
  frame: number,
): [string, number, number] {
  for (const [name, [start, count]] of Object.entries(anims)) {
    if (frame >= start && frame < start + count) return [name, frame - start, count];
  }
  return ['walk', 0, 1];
}
