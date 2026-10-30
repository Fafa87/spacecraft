import { MAX_PLAYERS } from '../constants.js';
import type { ContentRegistry } from '../data/index.js';
import type { ReferencedAssetKeys } from './manifest.js';

/** Sounds the client plays for game events / UI (not tied to content data). */
export const CORE_SOUNDS = [
  'player_hurt',
  'player_down',
  'revive',
  'pickup',
  'unlock',
  'surge',
  'crate_drop',
  'ui_click',
  'explosion',
] as const;

/** Music tracks the client expects. */
export const CORE_MUSIC = ['menu', 'battle', 'gameover'] as const;

export const DECAL_VARIANTS = 3;

/** Collects every sprite / sound key the given content (plus the core client) references. */
export function referencedAssetKeys(content: ContentRegistry): ReferencedAssetKeys {
  const sprites = new Set<string>([
    'medkit',
    'shadow',
    'fx_explosion',
    'fx_muzzle',
    'fx_particle',
    'fx_ring',
    'decal_scorch_0',
  ]);
  const sounds = new Set<string>(CORE_SOUNDS);
  for (let i = 0; i < MAX_PLAYERS; i++) {
    sprites.add(`marine_${i}`);
    sprites.add(`marine_${i}_down`);
  }
  for (let i = 0; i < 4; i++) sprites.add(`tile_floor_${i}`);
  for (const w of content.weapons.values()) {
    sprites.add(w.sprites.icon);
    sprites.add(w.sprites.pickup);
    sounds.add(w.sfx.fire);
    sounds.add(w.sfx.reload);
  }
  for (const k of content.projectileKinds) sprites.add(`proj_${k}`);
  for (const e of content.enemies.values()) {
    sprites.add(e.sprite);
    sounds.add(e.sfx.death);
    if (e.sfx.attack) sounds.add(e.sfx.attack);
    if (e.decal) for (let i = 0; i < DECAL_VARIANTS; i++) sprites.add(`decal_${e.decal}_${i}`);
  }
  return { sprites: [...sprites].sort(), sounds: [...sounds].sort() };
}
