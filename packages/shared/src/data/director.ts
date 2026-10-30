import type { DirectorConfig } from './types.js';

/** Spawn director tuning (escalating Tyranid swarm). All times in seconds of survival. */
export const DIRECTOR: DirectorConfig = {
  budget: { base: 0.85, perMinute: 1.35, exponent: 1.25 },
  teamScale: [1, 1.5, 2.1, 2.7],
  maxAlive: { base: 40, perMinute: 15, cap: 280 },
  hpScalePerMinute: 0.07,
  surge: {
    firstAtSec: 60,
    interval: 55,
    duration: 7,
    budgetMultiplier: 2.4,
    bonusThreat: 7,
    bonusThreatPerWave: 5,
  },
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
    surgePoints: [2, 3],
    // minDistance / maxDistance: burrowing Raveners (and crates) still use a ring around a marine.
    minDistance: 620,
    maxDistance: 900,
    groupMin: 2,
    groupMax: 6,
    groupSpread: 60,
  },
  crates: { firstAtSec: 25, intervalMin: 22, intervalMax: 38, minDistance: 220, maxDistance: 520 },
  // Surges at 60, 115, 170, 225 ... -> a Carnifex arrives on the 3rd surge (170 s) and every 3rd after.
  bosses: {
    enemy: 'carnifex',
    firstSurge: 3,
    everySurge: 3,
    count: [1, 1, 2, 2],
    extraPerAppearance: 1,
  },
  waveTable: [
    { fromSec: 0, weights: { hormagaunt: 10, ripper: 3 } },
    { fromSec: 30, weights: { hormagaunt: 10, termagant: 5, ripper: 3 } },
    { fromSec: 70, weights: { hormagaunt: 9, termagant: 5, ripper: 3, genestealer: 2 } },
    {
      fromSec: 110,
      weights: { hormagaunt: 9, termagant: 5, ripper: 2, genestealer: 2, warrior: 1 },
    },
    {
      fromSec: 160,
      weights: { hormagaunt: 9, termagant: 5, ripper: 2, genestealer: 3, warrior: 1, ravener: 1.2 },
    },
    {
      fromSec: 230,
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
      fromSec: 330,
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
      fromSec: 480,
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
