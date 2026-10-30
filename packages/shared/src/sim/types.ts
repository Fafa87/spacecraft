import type { Rng } from '../math/rng.js';
import type { ContentRegistry, ExplosionSpec } from '../data/index.js';

export type PlayerState = 'alive' | 'downed' | 'dead';

/** One input frame. Each input represents exactly one simulation tick of movement. */
export interface PlayerInput {
  /** Monotonic sequence number (per client) used for prediction reconciliation. */
  seq: number;
  /** Movement direction, each in -1..1 (normalized by the sim). */
  mx: number;
  my: number;
  /** Aim angle in radians. */
  aim: number;
  fire: boolean;
  /** Weapon slot to switch to (1..9) or 0 for none. */
  slot: number;
  reload: boolean;
}

export const emptyInput = (): PlayerInput => ({
  seq: 0,
  mx: 0,
  my: 0,
  aim: 0,
  fire: false,
  slot: 0,
  reload: false,
});

export interface Player {
  id: number;
  name: string;
  /** Chapter (colour scheme) index into content.chapters. */
  chapter: number;
  x: number;
  y: number;
  aim: number;
  hp: number;
  maxHp: number;
  state: PlayerState;
  /** Seconds spent downed. */
  downedTime: number;
  /** 0..1 revive progress while a teammate is nearby. */
  reviveProgress: number;
  invuln: number;
  weapons: string[];
  current: string;
  ammo: Record<string, number>;
  fireCooldown: number;
  /** > 0 while reloading (seconds remaining). */
  reloadTimer: number;
  /** For semi-automatic weapons. */
  triggerWasDown: boolean;
  /** Heat per weapon id (heat weapons only), 0..heat.max. */
  heat: Record<string, number>;
  /** True while the current reload is an overheat vent. */
  venting: boolean;
  input: PlayerInput;
  lastInputSeq: number;
  connected: boolean;
  kills: number;
  damageDealt: number;
  /** Survival second this marine died (or null). */
  diedAt: number | null;
}

export interface Enemy {
  id: number;
  type: string;
  x: number;
  y: number;
  vx: number;
  vy: number;
  angle: number;
  hp: number;
  maxHp: number;
  attackCooldown: number;
  /** -1 = not lit. */
  fuse: number;
  /** Lateral strafing direction for ranged enemies. */
  strafe: number;
  /** Charge state: 0 idle, 1 winding up, 2 dashing. */
  chargePhase: 0 | 1 | 2;
  /** Seconds left in the current charge phase. */
  chargeTimer: number;
  chargeCooldown: number;
  /** Locked dash direction. */
  chargeDx: number;
  chargeDy: number;
  /** Underground (untargetable) until it emerges. */
  burrowed: boolean;
  /** Synapse buff this tick (1 = none). */
  synSpeed: number;
  synDamage: number;
  /** > 0 for a moment after attacking (animation). */
  attackAnim: number;
  dead: boolean;
}

export type ProjectileOwner = 'player' | 'enemy';

export interface Projectile {
  id: number;
  owner: ProjectileOwner;
  ownerId: number;
  kind: string;
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  radius: number;
  damage: number;
  pierceLeft: number;
  armorPierce: boolean;
  drag: number;
  knockback: number;
  explosion?: ExplosionSpec;
  /**
   * Start of the swept-collision segment for the next tick. Set on spawn to the
   * shooter's position so point-blank targets inside the muzzle offset are hit.
   */
  sx?: number;
  sy?: number;
  /** Enemy ids already hit (so piercing shots hit each target once). */
  hit: number[];
  dead: boolean;
}

export type PickupKind = 'weapon' | 'medkit';

export interface Pickup {
  id: number;
  kind: PickupKind;
  /** Weapon id for weapon crates. */
  weapon?: string;
  x: number;
  y: number;
  life: number;
}

/** Things that happened this tick; drive client FX/audio and HUD notifications. */
export type GameEvent =
  /** `s` = supercharged (heat weapons). */
  | { e: 'shot'; p: number; w: string; x: number; y: number; a: number; s?: 1 }
  | { e: 'hit'; x: number; y: number; k: string }
  | { e: 'die'; t: string; x: number; y: number }
  | { e: 'boom'; x: number; y: number; r: number }
  | { e: 'spit'; x: number; y: number; t?: string }
  | { e: 'bite'; p: number; t?: string }
  | { e: 'overheat'; p: number }
  | { e: 'emerge'; x: number; y: number; t: string }
  /** Charge / leap wind-up started (telegraph). */
  | { e: 'charge'; x: number; y: number; t: string }
  /** Wind-up finished: the dash / leap begins. */
  | { e: 'leap'; x: number; y: number; t: string }
  | { e: 'boss'; t: string; n: number }
  | { e: 'hurt'; p: number; d: number }
  | { e: 'down'; p: number }
  | { e: 'revive'; p: number; by: number }
  | { e: 'dead'; p: number }
  | { e: 'unlock'; p: number; w: string }
  | { e: 'pickup'; p: number; k: PickupKind; w?: string }
  | { e: 'crate'; x: number; y: number }
  | { e: 'surge'; n: number }
  | { e: 'reload'; p: number; w: string }
  | { e: 'switch'; p: number; w: string };

export interface DirectorState {
  budget: number;
  wave: number;
  surgeUntil: number;
  nextSurgeAt: number;
  nextCrateAt: number;
  /** How many boss waves have arrived. */
  bossWaves: number;
}

export interface World {
  content: ContentRegistry;
  seed: number;
  rng: Rng;
  tick: number;
  /** Survival time in seconds. */
  time: number;
  nextId: number;
  players: Player[];
  enemies: Enemy[];
  projectiles: Projectile[];
  pickups: Pickup[];
  director: DirectorState;
  events: GameEvent[];
  teamSize: number;
  over: boolean;
  /** Totals for the run summary. */
  stats: { kills: number; shots: number };
}
