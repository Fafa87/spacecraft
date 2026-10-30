import type { DirectorConfig } from './types.js';

/** Spawn director tuning. All times in seconds of survival. */
export const DIRECTOR: DirectorConfig = {
  budget: { base: 1.4, perMinute: 1.5, exponent: 1.25 },
  teamScale: [1, 1.65, 2.25, 2.8],
  maxAlive: { base: 35, perMinute: 14, cap: 260 },
  hpScalePerMinute: 0.07,
  surge: {
    firstAtSec: 40,
    interval: 50,
    duration: 7,
    budgetMultiplier: 3.5,
    bonusThreat: 14,
    bonusThreatPerWave: 6,
  },
  spawn: { minDistance: 620, maxDistance: 900, groupMin: 2, groupMax: 6, groupSpread: 70 },
  crates: { firstAtSec: 25, intervalMin: 22, intervalMax: 38, minDistance: 220, maxDistance: 520 },
  waveTable: [
    { fromSec: 0, weights: { swarmer: 10 } },
    { fromSec: 35, weights: { swarmer: 10, spitter: 2 } },
    { fromSec: 75, weights: { swarmer: 10, spitter: 3, burster: 2 } },
    { fromSec: 120, weights: { swarmer: 10, spitter: 3, burster: 3, brute: 1 } },
    { fromSec: 240, weights: { swarmer: 9, spitter: 4, burster: 4, brute: 2 } },
    { fromSec: 420, weights: { swarmer: 8, spitter: 5, burster: 5, brute: 3 } },
  ],
};
