import { GAME_VERSION } from '../constants.js';
import { DIRECTOR } from '../data/director.js';
import { HIGHSCORE_LIMITS, sanitizeName } from './limits.js';
import { leaderboardName } from './names.js';
import type { PlayerScoreEntry, RunMode, RunResult } from './types.js';

export const RUN_MODES: readonly RunMode[] = ['local', 'p2p', 'dedicated'];
const MODES = RUN_MODES;

/** Max kills for a survival time and team size (mirrored with integer math in firestore.rules). */
export const maxPlausibleKills = (survivalMs: number, teamSize: number) =>
  (survivalMs / 1000) * HIGHSCORE_LIMITS.maxKillsPerSecondPerPlayer * teamSize +
  HIGHSCORE_LIMITS.killsSlack;

/** Max personal score for a survival time (mirrored with integer math in firestore.rules). */
export const maxPlausibleScore = (survivalMs: number) =>
  (survivalMs / 1000) * HIGHSCORE_LIMITS.maxPointsPerSecondPerPlayer + HIGHSCORE_LIMITS.pointsSlack;

/** Max kills one marine can make in a survival time. */
export const maxPlausiblePlayerKills = (survivalMs: number) => maxPlausibleKills(survivalMs, 1);

/** Highest wave reachable in a survival time (the director's surge schedule + slack). */
/**
 * Finite waves: a wave can only start after the previous one was cleared plus a breather, so
 * wave n needs at least firstDelay + (n - 1) * breather seconds of survival.
 */
export const maxPlausibleWave = (survivalMs: number) =>
  Math.floor(Math.max(0, survivalMs / 1000 - DIRECTOR.waves.firstDelay) / DIRECTOR.waves.breather) +
  1;

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
  if (!isInt(kills) || kills < 0 || kills > L.maxKills)
    errors.push(`kills must be an integer 0-${L.maxKills}`);
  if (!isInt(wave) || wave < 0 || wave > L.maxWave)
    errors.push(`wave must be an integer 0-${L.maxWave}`);

  if (errors.length === 0) {
    if ((kills as number) > maxPlausibleKills(survivalMs as number, teamSize as number))
      errors.push('kills implausible for survival time');
    if ((wave as number) > maxPlausibleWave(survivalMs as number))
      errors.push('wave implausible for survival time');
  }

  const intList = (key: 'playerScores' | 'playerKills', max: number): number[] | undefined => {
    const v = o[key];
    if (v === undefined) return undefined;
    if (!Array.isArray(v) || !v.every((n) => isInt(n) && n >= 0 && n <= max)) {
      errors.push(`${key} must be a list of integers 0-${max}`);
      return undefined;
    }
    if (isInt(teamSize) && v.length !== teamSize) errors.push(`${key}.length must equal teamSize`);
    return v as number[];
  };
  const playerScores = intList('playerScores', L.maxScore);
  const playerKills = intList('playerKills', L.maxKills);
  if (errors.length === 0) {
    const ms = survivalMs as number;
    if (playerScores?.some((n) => n > maxPlausibleScore(ms)))
      errors.push('playerScores implausible for survival time');
    if (playerKills?.some((n) => n > (kills as number) || n > maxPlausiblePlayerKills(ms)))
      errors.push('playerKills implausible');
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
  const version = o.version === undefined ? GAME_VERSION : o.version;
  if (typeof version !== 'string' || !L.versionPattern.test(version))
    errors.push('version must look like 1.2.3 or 1.2.3-tag');

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
      ...(playerScores ? { playerScores } : {}),
      ...(playerKills ? { playerKills } : {}),
      endedAt,
      version: version as string,
      mode,
    },
  };
}

/** validateRunResult + names made board-safe (leaderboardName), as used for global boards. */
export function validateLeaderboardRun(input: unknown): ValidationResult<RunResult> {
  const v = validateRunResult(input);
  if (!v.ok) return v;
  return {
    ok: true,
    value: { ...v.value, players: v.value.players.map((n, i) => leaderboardName(n, i + 1)) },
  };
}

/** A run's per-marine score rows (empty for runs from before v0.4). */
export function playerScoreEntries(run: RunResult, at: string): PlayerScoreEntry[] {
  if (!run.playerScores) return [];
  return run.players.map((name, slot) => ({
    id: `${run.runId}-${slot}`,
    runId: run.runId,
    slot,
    name,
    score: run.playerScores![slot] ?? 0,
    kills: run.playerKills?.[slot] ?? 0,
    teamSize: run.teamSize,
    survivalMs: run.survivalMs,
    version: run.version,
    at,
  }));
}

/** Individual leaderboard order: points, then longer survival, then earlier. */
export const comparePlayerScores = (a: PlayerScoreEntry, b: PlayerScoreEntry) =>
  b.score - a.score || b.survivalMs - a.survivalMs || a.at.localeCompare(b.at);

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
