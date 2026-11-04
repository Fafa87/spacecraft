import {
  comparePlayerScores,
  playerScoreEntries,
  GAME_VERSION,
  HIGHSCORE_LIMITS,
  leaderboardBoard,
  type HighscoreEntry,
  type PlayerScoreEntry,
  type RunResult,
} from '@sms/shared';
import { boardFor } from '../devPreview.js';
import { storage } from '../util/storage.js';
import type {
  HighscoreStore,
  SubmitOutcome,
  TopPlayersResult,
  TopResult,
} from './HighscoreStore.js';

/**
 * Keys are namespaced by leaderboard board (major.minor) — every deployed version shares the
 * github.io origin, so the frozen /v0.1.0/ build keeps its own `sms.highscores.v1` table and its
 * pending runs are never flushed into the 0.2 board. Name / mute / chapter prefs stay shared.
 */
export const LOCAL_BOARD = boardFor(leaderboardBoard(GAME_VERSION));
export const LOCAL_KEY = `sms.highscores.board-${LOCAL_BOARD}`;
export const LOCAL_SUBMITTED_KEY = `sms.highscores.submitted.board-${LOCAL_BOARD}`;
const KEY = LOCAL_KEY;
const KEEP_PER_TABLE = 50;
const SUBMITTED_KEY = LOCAL_SUBMITTED_KEY;
const KEEP_SUBMITTED = 50;

/** A run this browser got onto the global board (like Pulp Wars' "submitted" list). */
export interface SubmittedRun {
  runId: string;
  teamSize: number;
  players: string[];
  survivalMs: number;
  rank?: number;
  at: string;
}

type Tables = Record<string, HighscoreEntry[]>;

const sortEntries = (a: HighscoreEntry, b: HighscoreEntry) =>
  b.survivalMs - a.survivalMs || a.submittedAt.localeCompare(b.submittedAt);

/** Browser-local highscores. Used offline and as a cache of server tables. */
export class LocalHighscoreStore implements HighscoreStore {
  private read(): Tables {
    return storage.get<Tables>(KEY, {});
  }

  private write(t: Tables): void {
    storage.set(KEY, t);
  }

  /**
   * Stores a run locally. Ids: `local_` = pending (retried against the global board later),
   * `kept_` = rejected by the board but kept in this browser's table.
   */
  async submit(result: RunResult, prefix: 'local_' | 'kept_' = 'local_'): Promise<SubmitOutcome> {
    const tables = this.read();
    const list = (tables[result.teamSize] ??= []);
    let entry = list.find((e) => e.runId === result.runId);
    if (!entry) {
      entry = { ...result, id: `${prefix}${result.runId}`, submittedAt: new Date().toISOString() };
      list.push(entry);
      list.sort(sortEntries);
      tables[result.teamSize] = list.slice(0, KEEP_PER_TABLE);
      this.write(tables);
    }
    const rank = list.indexOf(entry) + 1;
    return { status: 'local', rank: rank > 0 ? rank : undefined };
  }

  async top(teamSize: number, limit: number = HIGHSCORE_LIMITS.defaultLimit): Promise<TopResult> {
    return { entries: (this.read()[teamSize] ?? []).slice(0, limit), source: 'local' };
  }

  /** Individual points from every run in this browser's tables (local + cached server runs). */
  async topPlayers(
    teamSize: number,
    limit: number = HIGHSCORE_LIMITS.defaultLimit,
  ): Promise<TopPlayersResult> {
    const tables = this.read();
    const runs = teamSize > 0 ? (tables[teamSize] ?? []) : Object.values(tables).flat();
    return { entries: mergePlayerScores(runs, [], limit), source: 'local' };
  }

  /** Replaces the cached table with fresh server data (keeps unsynced local-only runs). */
  cacheTable(teamSize: number, entries: HighscoreEntry[]): void {
    const tables = this.read();
    const serverIds = new Set(entries.map((e) => e.runId));
    const pending = (tables[teamSize] ?? []).filter(
      (e) => e.id.startsWith('local_') && !serverIds.has(e.runId),
    );
    tables[teamSize] = [...entries, ...pending].sort(sortEntries).slice(0, KEEP_PER_TABLE);
    this.write(tables);
  }

  /** Local-only runs that never reached the server (retry later). */
  pending(): HighscoreEntry[] {
    return Object.values(this.read())
      .flat()
      .filter((e) => e.id.startsWith('local_'));
  }

  /** Local-only, never retried (the global board rejected it). */
  keep(result: RunResult): Promise<SubmitOutcome> {
    return this.submit(result, 'kept_');
  }

  /** Turns a pending run into a kept one (after a permanent rejection). */
  markKept(runId: string): void {
    const tables = this.read();
    for (const list of Object.values(tables))
      for (const e of list)
        if (e.runId === runId && e.id.startsWith('local_')) e.id = `kept_${runId}`;
    this.write(tables);
  }

  rememberSubmitted(run: RunResult, rank: number | undefined): void {
    const list = this.submitted().filter((r) => r.runId !== run.runId);
    list.unshift({
      runId: run.runId,
      teamSize: run.teamSize,
      players: run.players,
      survivalMs: run.survivalMs,
      rank,
      at: new Date().toISOString(),
    });
    storage.set(SUBMITTED_KEY, list.slice(0, KEEP_SUBMITTED));
  }

  submitted(): SubmittedRun[] {
    const raw = storage.get<unknown>(SUBMITTED_KEY, []);
    return Array.isArray(raw)
      ? raw.filter(
          (r): r is SubmittedRun =>
            typeof r === 'object' && r !== null && typeof (r as SubmittedRun).runId === 'string',
        )
      : [];
  }

  markSynced(runId: string): void {
    const tables = this.read();
    for (const k of Object.keys(tables))
      tables[k] = tables[k].filter((e) => !(e.runId === runId && e.id.startsWith('local_')));
    this.write(tables);
  }
}

/** Run rows → individual rows, plus extra rows (e.g. from the server), deduped and sorted. */
export function mergePlayerScores(
  runs: HighscoreEntry[],
  extra: PlayerScoreEntry[],
  limit: number,
): PlayerScoreEntry[] {
  const byId = new Map<string, PlayerScoreEntry>();
  for (const e of extra) byId.set(e.id, e);
  for (const r of runs)
    for (const p of playerScoreEntries(r, r.submittedAt)) if (!byId.has(p.id)) byId.set(p.id, p);
  return [...byId.values()].sort(comparePlayerScores).slice(0, limit);
}
