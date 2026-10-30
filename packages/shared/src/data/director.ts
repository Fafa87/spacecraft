import type { DirectorConfig } from './types.js';

/**
 * Spawn director tuning: finite Tyranid waves. Each wave has a fixed enemy budget; the next one
 * starts only after the whole wave (children included) is dead. Index-by-team-size arrays cover
 * squads of 1..8 marines (MAX_PLAYERS).
 */
export const DIRECTOR: DirectorConfig = {
  // Squad size 1..8. v0.5: bigger squads face more, tougher and more elite Tyranids.
  teamScaling: {
    budget: [1, 1.5, 2.1, 2.7, 3.25, 3.8, 4.3, 4.8],
    pace: [1, 1.5, 2.1, 2.7, 3.25, 3.8, 4.3, 4.8],
    maxAlive: [1, 1.5, 2.1, 2.7, 3.25, 3.8, 4.3, 4.8],
    children: [1, 1.5, 2.1, 2.7, 3.25, 3.8, 4.3, 4.8],
    hp: [1, 1, 1, 1, 1, 1, 1, 1],
    elite: [1, 1, 1, 1, 1, 1, 1, 1],
    eliteThreat: 3,
  },
  waves: {
    firstDelay: 4,
    breather: 8,
    budget: { base: 14, perWave: 9, exponent: 1.2 },
    pace: { base: 2.2, perWave: 0.5 },
    flankPoints: [2, 3],
    hpScalePerWave: 0.06,
    maxChildren: 10,
    reveal: { remaining: 6, fraction: 0.08, afterSec: 30, speedMul: 1.35 },
    forceNextAfter: 240,
  },
  maxAlive: { base: 40, perWave: 10, cap: 280 },
  // Six hive breaches: four in the bulkheads at the arena edges, two floor vents inside.
  spawnPoints: [
    { id: 'north', x: 1600, y: 130, kind: 'breach' },
    { id: 'east', x: 3070, y: 980, kind: 'tunnel' },
    { id: 'south', x: 1720, y: 2070, kind: 'breach' },
    { id: 'west', x: 130, y: 1220, kind: 'tunnel' },
    { id: 'vent_nw', x: 860, y: 600, kind: 'vent' },
    { id: 'vent_se', x: 2380, y: 1600, kind: 'vent' },
  ],
  spawn: {
    telegraph: 1.1,
    bossTelegraph: 2.2,
    pointMinDistance: 430,
    // minDistance / maxDistance: burrowing Raveners (and crates) still use a ring around a marine.
    minDistance: 620,
    maxDistance: 900,
    groupMin: 2,
    groupMax: 6,
    groupSpread: 60,
  },
  drops: {
    medkits: { base: 2, perMarine: 0.5 },
    crates: { base: 1, perMarine: 0.25 },
  },
  crates: { firstAfter: 10, intervalMin: 20, intervalMax: 32, minDistance: 220, maxDistance: 520 },
  // A Carnifex leads wave 3 and every 3rd wave after it.
  bosses: {
    enemy: 'carnifex',
    firstWave: 3,
    everyWave: 3,
    count: [1, 1, 2, 2, 2, 3, 3, 3],
    extraPerAppearance: 1,
  },
  waveTable: [
    { fromWave: 1, weights: { hormagaunt: 10, ripper: 3 } },
    { fromWave: 2, weights: { hormagaunt: 10, termagant: 5, ripper: 3 } },
    { fromWave: 3, weights: { hormagaunt: 9, termagant: 5, ripper: 3, genestealer: 2 } },
    {
      fromWave: 4,
      weights: { hormagaunt: 9, termagant: 5, ripper: 2, genestealer: 2, warrior: 1 },
    },
    {
      fromWave: 5,
      weights: { hormagaunt: 9, termagant: 5, ripper: 2, genestealer: 3, warrior: 1, ravener: 1.2 },
    },
    {
      fromWave: 6,
      weights: {
        hormagaunt: 8,
        termagant: 5,
        ripper: 2,
        genestealer: 3,
        warrior: 1.5,
        ravener: 1.5,
        biovore: 1,
        spore_mine: 1.5,
      },
    },
    {
      fromWave: 8,
      weights: {
        hormagaunt: 8,
        termagant: 6,
        ripper: 2,
        genestealer: 4,
        warrior: 2,
        ravener: 2,
        biovore: 1.5,
        spore_mine: 2,
        carnifex: 0.25,
      },
    },
    {
      fromWave: 11,
      weights: {
        hormagaunt: 7,
        termagant: 6,
        ripper: 2,
        genestealer: 5,
        warrior: 3,
        ravener: 2.5,
        biovore: 2,
        spore_mine: 2,
        carnifex: 0.5,
      },
    },
  ],
};
