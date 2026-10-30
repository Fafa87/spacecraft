import { GAME_VERSION } from '../constants.js';
import { DIRECTOR } from '../data/director.js';
import type { RunMode, RunResult } from './types.js';

export const HIGHSCORE_LIMITS = {
  minTeamSize: 1,
  maxTeamSize: 4,
  nameMinLength: 1,
  nameMaxLength: 16,
  minSurvivalMs: 1000,
  /** 4 hours — anything longer is rejected as implausible. */
  maxSurvivalMs: 4 * 60 * 60 * 1000,
  /** Upper bound on kills per second of survival per marine. */
  maxKillsPerSecondPerPlayer: 25,
  defaultLimit: 10,
  maxLimit: 100,
  runIdPattern: /^[A-Za-z0-9_-]{6,64}$/,
} as const;

const MODES: RunMode[] = ['local', 'p2p', 'dedicated'];

/** Trims, strips control chars & collapses whitespace, truncates. */
export function sanitizeName(raw: string): string {
  return (
    raw
      .replace(/\s+/g, ' ')
      // eslint-disable-next-line no-control-regex
      .replace(/[\u0000-\u001f\u007f<>]/g, '')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, HIGHSCORE_LIMITS.nameMaxLength)
  );
}

export type ValidationResult<T> = { ok: true; value: T } | { ok: false; errors: string[] };

const isInt = (v: unknown): v is number => typeof v === 'number' && Number.isInteger(v);

/**
 * Validates & normalizes an untrusted run result (server side, but also used by
 * the client before submitting). Includes basic plausibility checks; real
 * anti-cheat needs a trusted simulation (see README roadmap).
 */
export function validateRunResult(input: unknown): ValidationResult<RunResult> {
  const errors: string[] = [];
  if (typeof input !== 'object' || input === null)
    return { ok: false, errors: ['body must be an object'] };
  const o = input as Record<string, unknown>;
  const L = HIGHSCORE_LIMITS;

  const runId = typeof o.runId === 'string' ? o.runId : '';
  if (!L.runIdPattern.test(runId)) errors.push('runId must be 6-64 chars of [A-Za-z0-9_-]');

  const teamSize = o.teamSize;
  if (!isInt(teamSize) || teamSize < L.minTeamSize || teamSize > L.maxTeamSize)
    errors.push(`teamSize must be an integer ${L.minTeamSize}-${L.maxTeamSize}`);

  let players: string[] = [];
  if (!Array.isArray(o.players)) errors.push('players must be an array of names');
  else {
    players = o.players.map((n) => (typeof n === 'string' ? sanitizeName(n) : ''));
    if (players.some((n) => n.length < L.nameMinLength))
      errors.push(`player names must be ${L.nameMinLength}-${L.nameMaxLength} chars`);
    if (isInt(teamSize) && players.length !== teamSize)
      errors.push('players.length must equal teamSize');
  }

  const survivalMs = o.survivalMs;
  if (!isInt(survivalMs) || survivalMs < L.minSurvivalMs || survivalMs > L.maxSurvivalMs)
    errors.push(`survivalMs must be an integer ${L.minSurvivalMs}-${L.maxSurvivalMs}`);

  const kills = o.kills ?? 0;
  const wave = o.wave ?? 0;
  if (!isInt(kills) || kills < 0) errors.push('kills must be a non-negative integer');
  if (!isInt(wave) || wave < 0) errors.push('wave must be a non-negative integer');

  if (errors.length === 0) {
    const secs = (survivalMs as number) / 1000;
    if ((kills as number) > secs * L.maxKillsPerSecondPerPlayer * (teamSize as number) + 50)
      errors.push('kills implausible for survival time');
    const maxWave =
      Math.floor(Math.max(0, secs - DIRECTOR.surge.firstAtSec) / DIRECTOR.surge.interval) + 2;
    if ((wave as number) > maxWave) errors.push('wave implausible for survival time');
  }

  let endedAt = new Date().toISOString();
  if (o.endedAt !== undefined) {
    const d = typeof o.endedAt === 'string' ? new Date(o.endedAt) : new Date(NaN);
    if (Number.isNaN(d.getTime())) errors.push('endedAt must be an ISO date string');
    else if (d.getTime() > Date.now() + 5 * 60 * 1000) errors.push('endedAt is in the future');
    else endedAt = d.toISOString();
  }

  const mode = (o.mode ?? 'p2p') as RunMode;
  if (!MODES.includes(mode)) errors.push(`mode must be one of ${MODES.join(', ')}`);
  const version = typeof o.version === 'string' ? o.version.slice(0, 20) : GAME_VERSION;

  if (errors.length) return { ok: false, errors };
  return {
    ok: true,
    value: {
      runId,
      teamSize: teamSize as number,
      players,
      survivalMs: survivalMs as number,
      kills: kills as number,
      wave: wave as number,
      endedAt,
      version,
      mode,
    },
  };
}

export function clampLimit(raw: unknown): number {
  const n = typeof raw === 'string' ? parseInt(raw, 10) : typeof raw === 'number' ? raw : NaN;
  if (!Number.isFinite(n)) return HIGHSCORE_LIMITS.defaultLimit;
  return Math.max(1, Math.min(HIGHSCORE_LIMITS.maxLimit, Math.floor(n)));
}

/** "mm:ss.t" */
export function formatSurvival(ms: number): string {
  const totalTenths = Math.floor(ms / 100);
  const m = Math.floor(totalTenths / 600);
  const s = Math.floor((totalTenths % 600) / 10);
  const t = totalTenths % 10;
  return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}.${t}`;
}
