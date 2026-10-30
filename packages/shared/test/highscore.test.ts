import { describe, expect, it } from 'vitest';
import {
  clampLimit,
  formatSurvival,
  HIGHSCORE_LIMITS,
  sanitizeName,
  validateRunResult,
} from '../src/highscore/index.js';

const valid = () => ({
  runId: 'run_abcdef',
  teamSize: 2,
  players: ['Alpha', 'Bravo'],
  survivalMs: 125_000,
  kills: 40,
  wave: 1,
  mode: 'p2p',
  version: '0.1.0',
});

describe('highscore validation', () => {
  it('accepts a valid run', () => {
    const r = validateRunResult(valid());
    expect(r.ok).toBe(true);
  });

  it.each([
    ['teamSize 0', { teamSize: 0, players: [] }],
    ['teamSize 5', { teamSize: 5, players: ['a', 'b', 'c', 'd', 'e'] }],
    ['player count mismatch', { players: ['Solo'] }],
    ['empty name', { players: ['Alpha', '   '] }],
    ['short survival', { survivalMs: 10 }],
    ['absurd survival', { survivalMs: HIGHSCORE_LIMITS.maxSurvivalMs + 1 }],
    ['bad runId', { runId: 'x' }],
    ['implausible kills', { kills: 1_000_000 }],
    ['implausible wave', { wave: 500 }],
    ['bad mode', { mode: 'cheat' }],
    ['future date', { endedAt: new Date(Date.now() + 3_600_000).toISOString() }],
  ])('rejects %s', (_label, patch) => {
    expect(validateRunResult({ ...valid(), ...patch }).ok).toBe(false);
  });

  it('rejects non-objects', () => {
    expect(validateRunResult(null).ok).toBe(false);
    expect(validateRunResult('x').ok).toBe(false);
  });

  it('sanitizes names', () => {
    expect(sanitizeName('  <b>Bob</b>\n  the\tGreat  ')).toBe('bBob/b the Great');
    expect(sanitizeName('x'.repeat(50)).length).toBe(HIGHSCORE_LIMITS.nameMaxLength);
  });

  it('clamps limits and formats time', () => {
    expect(clampLimit(undefined)).toBe(HIGHSCORE_LIMITS.defaultLimit);
    expect(clampLimit('9999')).toBe(HIGHSCORE_LIMITS.maxLimit);
    expect(clampLimit('0')).toBe(1);
    expect(formatSurvival(125_400)).toBe('02:05.4');
  });
});
