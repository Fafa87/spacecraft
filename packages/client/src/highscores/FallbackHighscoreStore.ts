import type { HighscoreEntry, RunResult } from '@sms/shared';
import type { HighscoreStore, SubmitOutcome, TopResult } from './HighscoreStore.js';
import { HttpError, type HttpHighscoreStore } from './HttpHighscoreStore.js';
import type { LocalHighscoreStore } from './LocalHighscoreStore.js';

/**
 * Server first, localStorage as fallback + cache:
 *  - submit: POST to the server; if unreachable, store locally (status 'local') and retry
 *    pending local runs next time the server answers.
 *  - top: server table (cached locally); cached/local table when offline.
 * With `remote = null` (no server configured, e.g. a static GitHub Pages deploy) it is a
 * quiet local-only store: no network requests, no warnings.
 */
export class FallbackHighscoreStore implements HighscoreStore {
  online: boolean | null = null;

  constructor(
    private readonly remote: HttpHighscoreStore | null,
    private readonly local: LocalHighscoreStore,
  ) {}

  get localOnly(): boolean {
    return this.remote === null;
  }

  async submit(result: RunResult): Promise<SubmitOutcome> {
    if (!this.remote) return this.local.submit(result);
    try {
      const out = await this.remote.submit(result);
      this.online = true;
      void this.flushPending();
      return out;
    } catch (err) {
      // A 4xx means the server rejected the run — don't pretend it counted.
      if (err instanceof HttpError && err.status >= 400 && err.status < 500 && err.status !== 429) {
        this.online = true;
        console.warn('[highscores] server rejected run', err.message);
        return { status: 'failed' };
      }
      this.online = false;
      console.warn('[highscores] server unreachable, saving locally', err);
      return this.local.submit(result);
    }
  }

  async top(teamSize: number, limit = 10): Promise<TopResult> {
    if (!this.remote) return this.local.top(teamSize, limit);
    try {
      const res = await this.remote.top(teamSize, limit);
      this.online = true;
      this.local.cacheTable(teamSize, res.entries);
      // Show still-pending local runs alongside server data.
      const merged = await this.local.top(teamSize, limit);
      return { entries: merged.entries, source: 'server' };
    } catch {
      this.online = false;
      return this.local.top(teamSize, limit);
    }
  }

  private flushing = false;

  /** Re-submits runs that were stored locally while offline. */
  async flushPending(): Promise<void> {
    if (this.flushing || !this.remote) return;
    this.flushing = true;
    try {
      for (const e of this.local.pending()) {
        const { id: _id, submittedAt: _s, ...run } = e as HighscoreEntry;
        try {
          await this.remote.submit(run);
          this.local.markSynced(run.runId);
        } catch (err) {
          if (err instanceof HttpError && err.status === 400) this.local.markSynced(run.runId);
          else break;
        }
      }
    } finally {
      this.flushing = false;
    }
  }
}
