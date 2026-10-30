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
  /** Group size the director spawns (default: director spawn.groupMin..groupMax). */
  group?: [number, number];
  /** Boss: big HP bar + banner on the client. */
  boss?: boolean;
  /** Spawn director cost. */
  threat: number;
  /** Score awarded to the marine who lands the killing blow. */
  points: number;
  /** Chance to drop a medkit on death. */
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
  surge: {
    firstAtSec: number;
    interval: number;
    duration: number;
    budgetMultiplier: number;
    bonusThreat: number;
    bonusThreatPerWave: number;
  };
  /**
   * Fixed hive breaches the swarm emerges from (arena coordinates). The director picks among
   * them (never one too close to a marine); surges flank from several at once.
   */
  spawnPoints: SpawnPointDef[];
  spawn: {
    /** Seconds a breach pulses before the group emerges (boss: bossTelegraph). */
    telegraph: number;
    bossTelegraph: number;
    /** A breach this close to a living marine is not used. */
    pointMinDistance: number;
    /** Breaches used at once by a surge wave (flanking), [min, max]. */
    surgePoints: [number, number];
    minDistance: number;
    maxDistance: number;
    groupMin: number;
    groupMax: number;
    groupSpread: number;
  };
  crates: {
    firstAtSec: number;
    intervalMin: number;
    intervalMax: number;
    minDistance: number;
    maxDistance: number;
  };
  /** Boss waves: on surge `firstSurge` and every `everySurge` surges after it. */
  bosses: {
    enemy: string;
    firstSurge: number;
    everySurge: number;
    /** Bosses per appearance by team size (index = teamSize - 1). */
    count: [number, number, number, number];
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
