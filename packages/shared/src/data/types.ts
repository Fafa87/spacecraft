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

/**
 * Plasma-style heat: every shot adds heat, heat bleeds off over time. Above
 * `superchargeAt` shots are supercharged (more damage, bigger bolt); reaching `max` overheats
 * the weapon: the marine takes `selfDamage` and the weapon vents for `ventTime` seconds.
 */
export interface HeatSpec {
  perShot: number;
  max: number;
  coolPerSec: number;
  /** Fraction of max (0..1) from which shots are supercharged. */
  superchargeAt: number;
  superchargeDamageMul: number;
  ventTime: number;
  selfDamage: number;
}

export interface WeaponDef {
  id: string;
  /** Display name (see data/naming.ts to rename everything at once). */
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
  /**
   * Bracing (heavy weapons): after standing still for `braceDelay` seconds the weapon fires
   * `braceFireRateMult`× faster with `braceSpreadMult`× the spread. Omit braceDelay = no bracing.
   */
  braceDelay?: number;
  braceFireRateMult?: number;
  braceSpreadMult?: number;
  projectile: ProjectileSpec;
  heat?: HeatSpec;
  /** Survival second at which every marine unlocks it; 0 = starting weapon; null = crate-only. */
  unlockAtSec: number | null;
  /** Relative weight when a weapon crate rolls its contents. 0 = never in crates. */
  crateWeight: number;
  /** Sound keys (recipes in tools/src/audio/recipes.ts). */
  sfx: {
    fire: string;
    reload: string;
    /** Supercharged shot (heat weapons). */
    superFire?: string;
    /** Held-trigger loop (flamer): `fire` is the ignition, `loop` roars while held, `end` is the tail. */
    loop?: string;
    end?: string;
    /** Projectile impact on a Tyranid. */
    impact?: string;
    /** Loop whose level follows the local player's heat (plasma whine). */
    heatLoop?: string;
    /** Played when the marine braces (bracing weapons). */
    brace?: string;
  };
  /** Sprite keys (see tools/src/sprites). */
  /** icon = HUD, pickup = crate, held = weapon + gauntlets overlay drawn on the marine. */
  sprites: { icon: string; pickup: string; held: string };
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

/** Wind up, then dash in a straight line (Hormagaunt leap, Carnifex charge). */
export interface EnemyChargeSpec {
  /** Starts a charge when the target is between minDistance and triggerDistance. */
  triggerDistance: number;
  minDistance: number;
  windup: number;
  duration: number;
  speedMul: number;
  cooldown: number;
  /** Contact damage while dashing (replaces contactDamage). */
  damage: number;
}

/** Spawns underground, tunnels fast and untargetable, emerges next to a marine. */
export interface EnemyBurrowSpec {
  emergeDistance: number;
  speedMul: number;
}

/** Synapse creature: nearby swarm moves faster, hits harder and closes in more boldly. */
/** Spawns child enemies during the wave (e.g. a Biovore seeding spore mines). */
export interface EnemySpawnerSpec {
  enemy: string;
  /** Seconds between children. */
  interval: number;
  /** Children per parent, ever (no endless regeneration). */
  max: number;
  /** Only while a marine is within this distance. */
  range: number;
}

export interface EnemySynapseSpec {
  radius: number;
  speedMul: number;
  damageMul: number;
}

export interface EnemyDef {
  id: string;
  /** Display name (see data/naming.ts). */
  name: string;
  /** One-line flavour/role shown in docs and the sprite sheet. */
  role: string;
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
  charge?: EnemyChargeSpec;
  burrow?: EnemyBurrowSpec;
  synapse?: EnemySynapseSpec;
  spawner?: EnemySpawnerSpec;
  /** Group size the director spawns (default: director spawn.groupMin..groupMax). */
  group?: [number, number];
  /** Boss: big HP bar + banner on the client. */
  boss?: boolean;
  /** Spawn director cost. */
  threat: number;
  /** Score awarded to the marine who lands the killing blow. */
  points: number;
  /** Chance to drop a medkit on death (within the wave's drop budget; children never drop). */
  medkitDropChance: number;
  sprite: string;
  /** death/attack + optional roar (charge / emerge / boss arrival). */
  sfx: {
    death: string;
    attack?: string;
    /** Emerge / boss roar. */
    roar?: string;
    /** Charge wind-up cue (played when the leap / charge telegraph starts). */
    windup?: string;
    /** Dash / leap start. */
    leap?: string;
    /** Footstep, played every `stepEvery` px moved (heavy beasts). */
    step?: string;
    stepEvery?: number;
    /** One-shot repeated while moving (skittering) or burrowed (rumble). */
    move?: string;
    moveEvery?: number;
    /** Looping drone while alive (synapse creatures); level follows distance. */
    aura?: string;
  };
  decal: 'blood' | 'acid';
}

export interface SpawnPointDef {
  id: string;
  x: number;
  y: number;
  /** Visual style: wall breach, floor tunnel mouth or vent. */
  kind: 'breach' | 'tunnel' | 'vent';
}

export interface WaveTableEntry {
  /** Entry applies from this wave number until the next entry. */
  fromWave: number;
  /** Relative spawn weights per enemy id. */
  weights: Record<string, number>;
}

/** Per team size 1..MAX_PLAYERS (index = teamSize - 1). */
export type PerTeamSize = readonly number[];

export interface DirectorConfig {
  /** Multiplier on wave budgets, pacing and max alive by team size (index = teamSize - 1). */
  teamScale: PerTeamSize;
  /**
   * Finite waves: wave n has a fixed threat budget of (base + perWave * (n-1)^exponent) * teamScale.
   * The next wave starts only when every enemy of the wave (children included) is dead.
   */
  waves: {
    /** Seconds before wave 1. */
    firstDelay: number;
    /** Breather between "WAVE N CLEARED" and the next wave. */
    breather: number;
    budget: { base: number; perWave: number; exponent: number };
    /** Threat per second sent to the breaches while the roster lasts: (base + perWave*(n-1)) * teamScale. */
    pace: { base: number; perWave: number };
    /** Breaches a wave flanks from, [min, max]. */
    flankPoints: [number, number];
    /** Enemy HP multiplier grows by this fraction per wave. */
    hpScalePerWave: number;
    /** Children (spawner enemies) per wave at most, times teamScale. */
    maxChildren: number;
    /**
     * Anti-stall: once the roster is out and at most max(remaining, fraction * total) enemies are
     * left, or `afterSec` seconds passed since the roster ran out, the rest are revealed and hunt.
     */
    reveal: { remaining: number; fraction: number; afterSec: number; speedMul: number };
    /** Hard stall timeout: seconds after a wave started that force the next one. */
    forceNextAfter: number;
  };
  maxAlive: { base: number; perWave: number; cap: number };
  /**
   * Fixed hive breaches the swarm emerges from (arena coordinates). The director picks among
   * them (never one too close to a marine); a wave flanks from several at once.
   */
  spawnPoints: SpawnPointDef[];
  spawn: {
    /** Seconds a breach pulses before the group emerges (boss: bossTelegraph). */
    telegraph: number;
    bossTelegraph: number;
    /** A breach this close to a living marine is not used. */
    pointMinDistance: number;
    minDistance: number;
    maxDistance: number;
    groupMin: number;
    groupMax: number;
    groupSpread: number;
  };
  /** Per-wave drop budget, so kills and crates can't be farmed. */
  drops: {
    /** Medkits from kills per wave: base + perMarine * (teamSize - 1), rounded. Bosses always drop. */
    medkits: { base: number; perMarine: number };
    /** Weapon crates per wave: base + perMarine * (teamSize - 1), rounded. */
    crates: { base: number; perMarine: number };
  };
  /** Weapon crate timing inside a wave (survival seconds after the wave starts). */
  crates: {
    firstAfter: number;
    intervalMin: number;
    intervalMax: number;
    minDistance: number;
    maxDistance: number;
  };
  /** Boss waves: wave `firstWave` and every `everyWave` waves after it. */
  bosses: {
    enemy: string;
    firstWave: number;
    everyWave: number;
    /** Bosses per appearance by team size (index = teamSize - 1). */
    count: PerTeamSize;
    /** Extra bosses per further appearance. */
    extraPerAppearance: number;
  };
  waveTable: WaveTableEntry[];
}

/** A player colour scheme (Space Marine chapter). Index order is used on the wire. */
export interface ChapterDef {
  id: string;
  /** Display name (see data/naming.ts). */
  name: string;
  /** Main armour colour. */
  primary: string;
  /** Pauldron trim / secondary colour. */
  trim: string;
  /** Small details: eye lenses, purity seals, icon fill. */
  detail: string;
  /** Eye-lens glow colour. */
  lens: string;
  /** Simple geometric shoulder icon (own design, not a chapter logo replica). */
  icon: 'chevron' | 'drop' | 'blade' | 'tower' | 'fang';
  /** Our own flavour line shown in the lobby picker. */
  motto: string;
}
