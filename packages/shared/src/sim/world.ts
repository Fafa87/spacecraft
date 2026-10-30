import { ARENA, PLAYER } from '../constants.js';
import { defaultContent, type ContentRegistry } from '../data/index.js';
import { Rng } from '../math/rng.js';
import { emptyInput, type Player, type World } from './types.js';

export interface PlayerSetup {
  id: number;
  name: string;
}

export function createWorld(
  players: PlayerSetup[],
  seed: number,
  content: ContentRegistry = defaultContent,
): World {
  const d = content.director;
  const world: World = {
    content,
    seed,
    rng: new Rng(seed),
    tick: 0,
    time: 0,
    nextId: 1,
    players: [],
    enemies: [],
    projectiles: [],
    pickups: [],
    director: {
      budget: 0,
      wave: 0,
      surgeUntil: -1,
      nextSurgeAt: d.surge.firstAtSec,
      nextCrateAt: d.crates.firstAtSec,
    },
    events: [],
    teamSize: players.length,
    over: false,
    stats: { kills: 0, shots: 0 },
  };
  const cx = ARENA.width / 2;
  const cy = ARENA.height / 2;
  players.forEach((setup, i) => {
    const a = (i / Math.max(1, players.length)) * Math.PI * 2;
    const offset = players.length > 1 ? 50 : 0;
    world.players.push(
      createPlayer(content, setup, i, cx + Math.cos(a) * offset, cy + Math.sin(a) * offset),
    );
  });
  return world;
}

export function createPlayer(
  content: ContentRegistry,
  setup: PlayerSetup,
  colorIndex: number,
  x: number,
  y: number,
): Player {
  const weapons = content.startingWeapons();
  const ammo: Record<string, number> = {};
  for (const w of content.weaponOrder) ammo[w.id] = w.magazine;
  return {
    id: setup.id,
    name: setup.name,
    colorIndex,
    x,
    y,
    aim: 0,
    hp: PLAYER.maxHp,
    maxHp: PLAYER.maxHp,
    state: 'alive',
    downedTime: 0,
    reviveProgress: 0,
    invuln: 0,
    weapons,
    current: weapons[0],
    ammo,
    fireCooldown: 0,
    reloadTimer: 0,
    triggerWasDown: false,
    input: emptyInput(),
    lastInputSeq: 0,
    connected: true,
    kills: 0,
    damageDealt: 0,
    diedAt: null,
  };
}

export const allocId = (world: World): number => world.nextId++;

export const alivePlayers = (world: World): Player[] =>
  world.players.filter((p) => p.state === 'alive');
