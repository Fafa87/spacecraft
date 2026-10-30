import { describe, expect, it } from 'vitest';
import {
  isRudeName,
  leaderboardName,
  maxPlausibleKills,
  maxPlausibleWave,
  nameProblem,
  sanitizeName,
  validateLeaderboardRun,
  validateRunResult,
} from '../src/index.js';

const run = (patch: Record<string, unknown> = {}) => ({
  runId: 'run_abcdef',
  teamSize: 1,
  players: ['Filip'],
  survivalMs: 120_000,
  kills: 10,
  wave: 1,
  version: '0.1.0',
  mode: 'local',
  ...patch,
});

describe('leaderboard names', () => {
  it('accepts normal names incl. Polish letters and allowed punctuation', () => {
    for (const n of [
      'Filip',
      'Mróz',
      'Łukasz',
      "O'Neil",
      'Sgt. Ripley!',
      'Zoë_2',
      'Ab Cd',
      'x'.repeat(16),
    ])
      expect(nameProblem(n), n).toBeNull();
  });
  it('rejects bad characters, length and edges', () => {
    expect(nameProblem('')).toBe('EMPTY');
    expect(nameProblem('x'.repeat(17))).toBe('TOO_LONG');
    expect(nameProblem('<b>')).toBe('CHARACTERS');
    expect(nameProblem(' a')).toBe('CHARACTERS');
    expect(nameProblem('😀')).toBe('CHARACTERS');
  });
  it('rude filter: substrings, whole words, leet and accents; no Scunthorpe for words', () => {
    for (const n of ['fuckface', 'Kurwa', 'big ass', 'a$$', 'sh1t', 'ŠHIT', 'dicks'])
      expect(isRudeName(n), n).toBe(true);
    for (const n of ['Cassandra', 'Titan', 'Classic', 'Dickens', 'Hancock', 'Mróz'])
      expect(isRudeName(n), n).toBe(false);
  });
  it('leaderboardName cleans or replaces', () => {
    expect(leaderboardName('<Ripley>')).toBe('Ripley');
    expect(leaderboardName('  Filip   Mróz ')).toBe('Filip Mróz');
    expect(leaderboardName('shithead', 3)).toBe('Marine 3');
    expect(leaderboardName('😀😀', 2)).toBe('Marine 2');
    expect(leaderboardName('a'.repeat(40))).toBe('a'.repeat(16));
  });
  it('sanitizeName counts code points and normalizes to NFC', () => {
    expect(sanitizeName('Mro\u0301z')).toBe('Mróz');
    expect(Array.from(sanitizeName('😀'.repeat(20)))).toHaveLength(16);
  });
});

describe('run validation for leaderboards', () => {
  it('requires a semver-like version', () => {
    expect(validateRunResult(run()).ok).toBe(true);
    expect(validateRunResult(run({ version: '0.1.0-test' })).ok).toBe(true);
    expect(validateRunResult(run({ version: 'hacked' })).ok).toBe(false);
  });
  it('caps kills and waves', () => {
    expect(maxPlausibleKills(10_000, 2)).toBe(550);
    // finite waves: wave n needs firstDelay (4 s) + (n - 1) * breather (8 s) of survival
    expect(maxPlausibleWave(3_000)).toBe(1);
    expect(maxPlausibleWave(60_000)).toBe(8);
    expect(maxPlausibleWave(170_000)).toBe(21);
    expect(validateRunResult(run({ kills: 3051 })).ok).toBe(false);
    expect(validateRunResult(run({ kills: 3050 })).ok).toBe(true);
    expect(validateRunResult(run({ wave: 15 })).ok).toBe(true);
    expect(validateRunResult(run({ wave: 16 })).ok).toBe(false);
  });
  it('validateLeaderboardRun makes names board-safe', () => {
    const v = validateLeaderboardRun(run({ teamSize: 2, players: ['fuck', 'Ok'] }));
    expect(v.ok && v.value.players).toEqual(['Marine 1', 'Ok']);
  });
});
