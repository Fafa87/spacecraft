import { characterSprites } from './characters.js';
import { itemSprites } from './items.js';
import type { SpriteDef } from './types.js';

export type { SpriteDef, Ctx } from './types.js';

/** Every procedurally generated sprite. Add new generators here. */
export const SPRITES: SpriteDef[] = [...characterSprites, ...itemSprites];
