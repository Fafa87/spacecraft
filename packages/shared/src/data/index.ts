import { DIRECTOR } from './director.js';
import { ENEMIES } from './enemies.js';
import type { DirectorConfig, EnemyDef, WeaponDef } from './types.js';
import { WEAPONS } from './weapons.js';

export * from './types.js';
export { WEAPONS, ENEMIES, DIRECTOR };

/**
 * Content registry: indexed lookups + validation. Gameplay code should go
 * through the registry instead of importing the raw tables.
 */
export class ContentRegistry {
  readonly weapons: ReadonlyMap<string, WeaponDef>;
  readonly enemies: ReadonlyMap<string, EnemyDef>;
  /** Weapons sorted by slot. */
  readonly weaponOrder: readonly WeaponDef[];
  /** Enemy ids in wire order. */
  readonly enemyIds: readonly string[];
  readonly projectileKinds: readonly string[];

  constructor(
    weapons: WeaponDef[],
    enemies: EnemyDef[],
    readonly director: DirectorConfig,
  ) {
    this.weapons = new Map(weapons.map((w) => [w.id, w]));
    this.enemies = new Map(enemies.map((e) => [e.id, e]));
    this.weaponOrder = [...weapons].sort((a, b) => a.slot - b.slot);
    this.enemyIds = enemies.map((e) => e.id);
    const kinds = new Set<string>();
    for (const w of weapons) kinds.add(w.projectile.kind);
    for (const e of enemies) if (e.ranged) kinds.add(e.ranged.projectile.kind);
    this.projectileKinds = [...kinds];
  }

  weapon(id: string): WeaponDef {
    const w = this.weapons.get(id);
    if (!w) throw new Error(`Unknown weapon '${id}'`);
    return w;
  }

  enemy(id: string): EnemyDef {
    const e = this.enemies.get(id);
    if (!e) throw new Error(`Unknown enemy '${id}'`);
    return e;
  }

  startingWeapons(): string[] {
    return this.weaponOrder.filter((w) => w.unlockAtSec === 0).map((w) => w.id);
  }

  /** Returns a list of human-readable problems; empty = valid. */
  validate(): string[] {
    const errors: string[] = [];
    const ids = new Set<string>();
    const slots = new Set<number>();
    for (const w of this.weaponOrder) {
      if (ids.has(w.id)) errors.push(`duplicate weapon id ${w.id}`);
      ids.add(w.id);
      if (slots.has(w.slot)) errors.push(`duplicate weapon slot ${w.slot} (${w.id})`);
      slots.add(w.slot);
      if (w.slot < 1 || w.slot > 9) errors.push(`weapon ${w.id} slot must be 1..9`);
      if (w.fireInterval <= 0) errors.push(`weapon ${w.id} fireInterval must be > 0`);
      if (w.magazine <= 0) errors.push(`weapon ${w.id} magazine must be > 0`);
      if (w.pellets < 1) errors.push(`weapon ${w.id} pellets must be >= 1`);
    }
    if (this.startingWeapons().length === 0) errors.push('no starting weapon (unlockAtSec: 0)');
    const eids = new Set<string>();
    for (const e of this.enemies.values()) {
      if (eids.has(e.id)) errors.push(`duplicate enemy id ${e.id}`);
      eids.add(e.id);
      if (e.hp <= 0) errors.push(`enemy ${e.id} hp must be > 0`);
      if (e.threat <= 0) errors.push(`enemy ${e.id} threat must be > 0`);
      if (e.behavior === 'ranged' && !e.ranged) errors.push(`enemy ${e.id} is ranged but has no ranged spec`);
      if (e.behavior === 'kamikaze' && !e.explode) errors.push(`enemy ${e.id} is kamikaze but has no explode spec`);
    }
    let prev = -1;
    for (const entry of this.director.waveTable) {
      if (entry.fromSec <= prev) errors.push('waveTable must be sorted by fromSec ascending');
      prev = entry.fromSec;
      for (const id of Object.keys(entry.weights)) {
        if (!this.enemies.has(id)) errors.push(`waveTable references unknown enemy '${id}'`);
      }
    }
    if (this.director.waveTable[0]?.fromSec !== 0) errors.push('waveTable must start at fromSec 0');
    return errors;
  }
}

export const defaultContent = new ContentRegistry(WEAPONS, ENEMIES, DIRECTOR);
