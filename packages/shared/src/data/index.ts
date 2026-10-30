import { MAX_PLAYERS } from '../constants.js';
import { CHAPTERS } from './chapters.js';
import { DIRECTOR } from './director.js';
import { ENEMIES } from './enemies.js';
import { applyNamePreset, DEFAULT_SUBTITLE, DEFAULT_TITLE, NAME_PRESETS } from './naming.js';
import type { ChapterDef, DirectorConfig, EnemyDef, WeaponDef } from './types.js';
import { WEAPONS } from './weapons.js';

export * from './types.js';
export * from './naming.js';
export { WEAPONS, ENEMIES, DIRECTOR, CHAPTERS };

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
  /** Player colour schemes in wire order. */
  readonly chapters: readonly ChapterDef[];

  constructor(
    weapons: WeaponDef[],
    enemies: EnemyDef[],
    readonly director: DirectorConfig,
    chapters: ChapterDef[] = CHAPTERS,
    readonly title = DEFAULT_TITLE,
    readonly subtitle = DEFAULT_SUBTITLE,
  ) {
    this.chapters = chapters;
    this.weapons = new Map(weapons.map((w) => [w.id, w]));
    this.enemies = new Map(enemies.map((e) => [e.id, e]));
    this.weaponOrder = [...weapons].sort((a, b) => a.slot - b.slot);
    this.enemyIds = enemies.map((e) => e.id);
    const kinds = new Set<string>();
    for (const w of weapons) {
      kinds.add(w.projectile.kind);
      // Supercharged heat-weapon shots get their own visual.
      if (w.heat) kinds.add(`${w.projectile.kind}_super`);
    }
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

  /** Chapter by wire index (wraps, so it never throws). */
  chapter(index: number): ChapterDef {
    const n = this.chapters.length;
    return this.chapters[((index % n) + n) % n]!;
  }

  chapterIndex(id: string): number {
    return this.chapters.findIndex((c) => c.id === id);
  }

  /** Same content with display names from a preset (see data/naming.ts). Unknown = unchanged. */
  withNames(presetId: string): ContentRegistry {
    const preset = NAME_PRESETS[presetId];
    if (!preset) return this;
    const t = applyNamePreset(
      {
        weapons: [...this.weapons.values()],
        enemies: [...this.enemies.values()],
        chapters: [...this.chapters],
      },
      preset,
    );
    return new ContentRegistry(
      t.weapons,
      t.enemies,
      this.director,
      t.chapters,
      preset.title ?? this.title,
      preset.subtitle ?? this.subtitle,
    );
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
      if (e.behavior === 'ranged' && !e.ranged)
        errors.push(`enemy ${e.id} is ranged but has no ranged spec`);
      if (e.behavior === 'kamikaze' && !e.explode)
        errors.push(`enemy ${e.id} is kamikaze but has no explode spec`);
      if (e.group && (e.group[0] < 1 || e.group[1] < e.group[0]))
        errors.push(`enemy ${e.id} group must be [min>=1, max>=min]`);
      if (e.charge && e.charge.minDistance >= e.charge.triggerDistance)
        errors.push(`enemy ${e.id} charge.minDistance must be < triggerDistance`);
    }
    for (const w of this.weaponOrder) {
      if (w.heat && (w.heat.superchargeAt <= 0 || w.heat.superchargeAt >= 1))
        errors.push(`weapon ${w.id} heat.superchargeAt must be within (0, 1)`);
    }
    if (!this.enemies.has(this.director.bosses.enemy))
      errors.push(`director.bosses.enemy '${this.director.bosses.enemy}' is unknown`);
    const cids = new Set<string>();
    for (const c of this.chapters) {
      if (cids.has(c.id)) errors.push(`duplicate chapter id ${c.id}`);
      cids.add(c.id);
    }
    for (const e of this.enemies.values()) {
      if (e.spawner && !this.enemies.has(e.spawner.enemy))
        errors.push(`enemy ${e.id} spawner.enemy '${e.spawner.enemy}' is unknown`);
      if (e.spawner && this.enemies.get(e.spawner.enemy)?.spawner)
        errors.push(`enemy ${e.id} spawner child must not spawn children itself`);
    }
    if (this.chapters.length < MAX_PLAYERS)
      errors.push(
        `need ${MAX_PLAYERS} chapters so every marine in a full squad has their own colours`,
      );
    const d = this.director;
    for (const [name, arr] of [
      ['teamScale', d.teamScale],
      ['bosses.count', d.bosses.count],
    ] as const) {
      if (arr.length < MAX_PLAYERS)
        errors.push(`director.${name} needs ${MAX_PLAYERS} entries (team sizes 1..${MAX_PLAYERS})`);
    }
    let prev = 0;
    for (const entry of this.director.waveTable) {
      if (entry.fromWave <= prev) errors.push('waveTable must be sorted by fromWave ascending');
      prev = entry.fromWave;
      for (const id of Object.keys(entry.weights)) {
        if (!this.enemies.has(id)) errors.push(`waveTable references unknown enemy '${id}'`);
      }
    }
    if (this.director.waveTable[0]?.fromWave !== 1)
      errors.push('waveTable must start at fromWave 1');
    return errors;
  }
}

export const defaultContent = new ContentRegistry(WEAPONS, ENEMIES, DIRECTOR);
