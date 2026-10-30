import { validateLeaderboardRun, type RunResult } from '@sms/shared';
import {
  commitBody,
  endpoint,
  parseCount,
  hasScores,
  parseTop,
  parseTopPlayers,
  rankQuery,
  topPlayersQuery,
  topQuery,
  type FirestoreConfig,
  type FirestoreMethod,
} from './firestore.js';
import type {
  HighscoreStore,
  SubmitOutcome,
  TopPlayersResult,
  TopResult,
} from './HighscoreStore.js';
import { HttpError } from './HttpHighscoreStore.js';

type Fetch = typeof fetch;

/**
 * Global leaderboard in Cloud Firestore via its REST API (no SDK, no auth; see firestore.ts and
 * firestore.rules). Throws HttpError / network errors like HttpHighscoreStore, so
 * FallbackHighscoreStore can fall back to localStorage the same way.
 */
export class FirestoreHighscoreStore implements HighscoreStore {
  constructor(
    private readonly cfg: FirestoreConfig,
    private readonly opts: { timeoutMs?: number; fetch?: Fetch } = {},
  ) {}

  private async post(method: FirestoreMethod, body: unknown): Promise<unknown> {
    const f = this.opts.fetch ?? fetch;
    const res = await f(endpoint(this.cfg, method), {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
      cache: 'no-store',
      credentials: 'omit',
      signal: AbortSignal.timeout(this.opts.timeoutMs ?? 6000),
    });
    if (!res.ok) {
      let detail = '';
      try {
        const e = ((await res.json()) as { error?: { status?: string; message?: string } }).error;
        detail = [e?.status, e?.message].filter(Boolean).join(': ');
      } catch {
        /* not JSON */
      }
      throw new HttpError(res.status, `firestore ${method}: ${res.status} ${detail}`.trim());
    }
    return res.json();
  }

  async submit(result: RunResult): Promise<SubmitOutcome> {
    const v = validateLeaderboardRun(result);
    if (!v.ok) throw new HttpError(400, `invalid run: ${v.errors.join('; ')}`);
    const run = v.value;
    try {
      await this.post('commit', commitBody(this.cfg, run));
    } catch (err) {
      // 409 ALREADY_EXISTS: this runId is already on the board (a retry) — that's a success.
      if (!(err instanceof HttpError && err.status === 409)) throw err;
    }
    return { status: 'server', rank: await this.rank(run.teamSize, run.survivalMs) };
  }

  /** 1-based rank for a time in a table; undefined if the count query fails. */
  async rank(teamSize: number, survivalMs: number): Promise<number | undefined> {
    try {
      const above = parseCount(
        await this.post('runAggregationQuery', rankQuery(this.cfg, teamSize, survivalMs)),
      );
      return above === null ? undefined : above + 1;
    } catch {
      return undefined;
    }
  }

  async top(teamSize: number, limit = 10): Promise<TopResult> {
    const json = await this.post('runQuery', topQuery(this.cfg, teamSize, limit));
    return { entries: parseTop(json), source: 'server' };
  }

  async topPlayers(teamSize: number, limit = 10): Promise<TopPlayersResult> {
    if (!hasScores(this.cfg.board)) return { entries: [], source: 'server' };
    const json = await this.post('runQuery', topPlayersQuery(this.cfg, teamSize, limit));
    return { entries: parseTopPlayers(json), source: 'server' };
  }
}
