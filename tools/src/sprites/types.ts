import type { SKRSContext2D } from '@napi-rs/canvas';
import type { Rng } from '@sms/shared';

export type Ctx = SKRSContext2D;

/**
 * A sprite = one or more same-sized frames. Convention: sprites that rotate in
 * game face +X (right) at angle 0, anchored at their center unless `anchor` is set.
 */
export interface SpriteDef {
  key: string;
  w: number;
  h: number;
  frames: number;
  /** Anchor in 0..1 frame space (default center). */
  anchor?: [number, number];
  /** Text prompt describing the sprite — used for AI generation / art briefs later. */
  prompt: string;
  /** Category used by the preview sheet and docs. */
  group: 'player' | 'enemy' | 'projectile' | 'pickup' | 'icon' | 'tile' | 'decal' | 'fx';
  /** Draws frame `frame` with origin at the frame's top-left corner. */
  draw(ctx: Ctx, frame: number, rng: Rng): void;
}
