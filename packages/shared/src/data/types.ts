/**
 * Schema for data-driven game content. Adding a weapon / enemy normally means
 * adding one entry to `weapons.ts` / `enemies.ts` (+ sprites & sounds in tools/).
 * See docs/ADDING_CONTENT.md.
 */

export interface ExplosionSpec {
  radius: number;
  damage: number;
  /** Damage applied at the edge relative to the centre (0..1). */
  edgeFactor: number;
  /** Explosions can hurt players too (enemy explosions always do). */
  friendlyFire?: boolean;
}

export interface ProjectileSpec {
  /** Visual + audio key; the client maps it to sprites/particles. */
  kind: string;
  speed: number;
  /** Random +- fraction applied to speed per projectile. */
  speedJitter?: number;
  lifetime: number;
  radius: number;
  damage: number;
  /** How many *additional* enemies the projectile can pass through. */
  pierce: number;
  /** Ignores enemy armor. */
  armorPierce?: boolean;
  /** Velocity multiplier lost per second (0 = none, 0.9 = loses 90%/s). */
  drag?: number;
  knockback: number;
  explosion?: ExplosionSpec;
}

export interface WeaponDef {
  id: string;
  name: string;
  /** Number key used to select the weapon (1..9). Also defines HUD order. */
  slot: number;
  description: string;
  /** Seconds between shots. */
  fireInterval: number;
  /** Hold to fire (true) vs click per shot (false). */
  automatic: boolean;
  magazine: number;
  reloadTime: number;
  /** Projectiles per shot. */
  pellets: number;
  /** Total spread cone in radians. */
  spread: number;
  /** Movement speed multiplier while this weapon is equipped. */
  moveSpeedMul: number;
  projectile: ProjectileSpec;
  /** Survival second at which every marine unlocks it; 0 = starting weapon; null = crate-only. */
  unlockAtSec: number | null;
  /** Relative weight when a weapon crate rolls its contents. 0 = never in crates. */
  crateWeight: number;
  /** Sound keys (see tools/src/audio/sfxPresets.ts). */
  sfx: { fire: string; reload: string };
  /** Sprite keys (see tools/src/sprites). */
  sprites: { icon: string; pickup: string };
}

export type EnemyBehavior = 'melee' | 'ranged' | 'kamikaze';

export interface EnemyRangedSpec {
  range: number;
  preferredDistance: number;
  cooldown: number;
  projectile: ProjectileSpec;
}

export interface EnemyExplodeSpec extends ExplosionSpec {
  /** Distance to a marine at which the fuse is lit. */
  triggerDistance: number;
  fuse: number;
  /** Also explode when killed. */
  onDeath: boolean;
}

export interface EnemyDef {
  id: string;
  name: string;
  hp: number;
  /** Flat damage reduction per hit (min 20% of the hit always goes through). */
  armor: number;
  speed: number;
  /** Steering responsiveness (1/s). */
  accel: number;
  radius: number;
  /** Knockback resistance; higher = harder to push. */
  mass: number;
  behavior: EnemyBehavior;
  contactDamage: number;
  contactCooldown: number;
  ranged?: EnemyRangedSpec;
  explode?: EnemyExplodeSpec;
  /** Spawn director cost. */
  threat: number;
  /** Chance to drop a medkit on death. */
  medkitDropChance: number;
  sprite: string;
  sfx: { death: string; attack?: string };
  decal: 'blood' | 'acid';
}

export interface WaveTableEntry {
  /** Entry applies from this survival second until the next entry. */
  fromSec: number;
  /** Relative spawn weights per enemy id. */
  weights: Record<string, number>;
}

export interface DirectorConfig {
  /** Threat points earned per second = (base + perMinute * minutes^exponent) * teamScale. */
  budget: { base: number; perMinute: number; exponent: number };
  /** Multiplier on budget & max alive by team size (index = teamSize - 1). */
  teamScale: [number, number, number, number];
  maxAlive: { base: number; perMinute: number; cap: number };
  /** Enemy HP multiplier grows by this fraction per minute survived. */
  hpScalePerMinute: number;
  /** Periodic big waves ("surges"). */
  surge: { firstAtSec: number; interval: number; duration: number; budgetMultiplier: number; bonusThreat: number; bonusThreatPerWave: number };
  spawn: { minDistance: number; maxDistance: number; groupMin: number; groupMax: number; groupSpread: number };
  crates: { firstAtSec: number; intervalMin: number; intervalMax: number; minDistance: number; maxDistance: number };
  waveTable: WaveTableEntry[];
}
