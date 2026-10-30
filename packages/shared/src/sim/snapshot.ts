import { round } from '../math/vec.js';
import type { PlayerState, World } from './types.js';
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
}

/** [id, enemyTypeIndex, x, y, angle, hp% (0-100), fuseLit(0|1)] */
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
      c: p.colorIndex,
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
    })),
    enemies: world.enemies.map((e) => [
      e.id,
      c.enemyIds.indexOf(e.type),
      round(e.x),
      round(e.y),
      round(e.angle, 2),
      Math.max(0, Math.round((e.hp / e.maxHp) * 100)),
      e.fuse >= 0 ? 1 : 0,
    ]),
    projectiles: world.projectiles.map((p) => [
      p.id,
      c.projectileKinds.indexOf(p.kind),
      round(p.x),
      round(p.y),
      round(Math.atan2(p.vy, p.vx), 2),
    ]),
    pickups: world.pickups.map((p) => ({ id: p.id, k: p.kind, w: p.weapon, x: round(p.x), y: round(p.y), life: round(p.life, 1) })),
    events: world.events,
  };
}
