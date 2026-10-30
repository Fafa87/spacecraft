import { round } from '../math/vec.js';
import type { Enemy, Player, PlayerState, World } from './types.js';
import type { GameEvent, PickupKind } from './types.js';

/** Per-player data sent every tick. */
export interface PlayerSnap {
  id: number;
  name: string;
  c: number;
  x: number;
  y: number;
  a: number;
  hp: number;
  mhp: number;
  st: PlayerState;
  w: string;
  ws: string[];
  ammo: number;
  /** Reload seconds remaining (0 = not reloading). */
  rl: number;
  /** Bleed-out seconds remaining while downed. */
  bo: number;
  rv: number;
  seq: number;
  k: number;
  /** Heat of the current weapon as a fraction 0..1 (heat weapons only). */
  ht?: number;
  /** Venting after an overheat (rl counts down the vent). */
  vt?: 1;
}

/** Bit flags in EnemySnap[6]. */
export const ENEMY_FLAG = {
  fuse: 1,
  synapse: 2,
  burrowed: 4,
  windup: 8,
  dashing: 16,
  attacking: 32,
} as const;

/** [id, enemyTypeIndex, x, y, angle, hp% (0-100), flags (ENEMY_FLAG bits)] */
export type EnemySnap = [number, number, number, number, number, number, number];
/** [id, projectileKindIndex, x, y, angle] */
export type ProjectileSnap = [number, number, number, number, number];

export interface PickupSnap {
  id: number;
  k: PickupKind;
  w?: string;
  x: number;
  y: number;
  life: number;
}

export interface Snapshot {
  tick: number;
  time: number;
  wave: number;
  over: boolean;
  players: PlayerSnap[];
  enemies: EnemySnap[];
  projectiles: ProjectileSnap[];
  pickups: PickupSnap[];
  events: GameEvent[];
}

function heatFields(world: World, p: Player): { ht?: number; vt?: 1 } {
  const heat = world.content.weapon(p.current).heat;
  if (!heat) return {};
  const out: { ht?: number; vt?: 1 } = { ht: round((p.heat[p.current] ?? 0) / heat.max, 2) };
  if (p.venting) out.vt = 1;
  return out;
}

export function enemyFlags(e: Enemy): number {
  let f = 0;
  if (e.fuse >= 0) f |= ENEMY_FLAG.fuse;
  if (e.synSpeed > 1) f |= ENEMY_FLAG.synapse;
  if (e.burrowed) f |= ENEMY_FLAG.burrowed;
  if (e.chargePhase === 1) f |= ENEMY_FLAG.windup;
  if (e.chargePhase === 2) f |= ENEMY_FLAG.dashing;
  if (e.attackAnim > 0) f |= ENEMY_FLAG.attacking;
  return f;
}

export function buildSnapshot(world: World, bleedOutTime: number): Snapshot {
  const c = world.content;
  return {
    tick: world.tick,
    time: round(world.time, 3),
    wave: world.director.wave,
    over: world.over,
    players: world.players.map((p) => ({
      id: p.id,
      name: p.name,
      c: p.chapter,
      x: round(p.x, 2),
      y: round(p.y, 2),
      a: round(p.aim, 2),
      hp: Math.ceil(p.hp),
      mhp: p.maxHp,
      st: p.state,
      w: p.current,
      ws: p.weapons,
      ammo: p.ammo[p.current],
      rl: round(p.reloadTimer, 2),
      bo: p.state === 'downed' ? round(bleedOutTime - p.downedTime, 1) : 0,
      rv: round(p.reviveProgress, 2),
      seq: p.lastInputSeq,
      k: p.kills,
      ...heatFields(world, p),
    })),
    enemies: world.enemies.map((e) => [
      e.id,
      c.enemyIds.indexOf(e.type),
      round(e.x),
      round(e.y),
      round(e.angle, 2),
      Math.max(0, Math.round((e.hp / e.maxHp) * 100)),
      enemyFlags(e),
    ]),
    projectiles: world.projectiles.map((p) => [
      p.id,
      c.projectileKinds.indexOf(p.kind),
      round(p.x),
      round(p.y),
      round(Math.atan2(p.vy, p.vx), 2),
    ]),
    pickups: world.pickups.map((p) => ({
      id: p.id,
      k: p.kind,
      w: p.weapon,
      x: round(p.x),
      y: round(p.y),
      life: round(p.life, 1),
    })),
    events: world.events,
  };
}
