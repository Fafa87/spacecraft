import { HIGHSCORE_LIMITS, type HighscoreEntry, type RunResult } from '@sms/shared';
import { storage } from '../util/storage.js';
import type { HighscoreStore, SubmitOutcome, TopResult } from './HighscoreStore.js';

const KEY = 'sms.highscores.v1';
const KEEP_PER_TABLE = 50;

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

  async submit(result: RunResult): Promise<SubmitOutcome> {
    const tables = this.read();
    const list = (tables[result.teamSize] ??= []);
    let entry = list.find((e) => e.runId === result.runId);
    if (!entry) {
      entry = { ...result, id: `local_${result.runId}`, submittedAt: new Date().toISOString() };
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

  markSynced(runId: string): void {
    const tables = this.read();
    for (const k of Object.keys(tables))
      tables[k] = tables[k].filter((e) => !(e.runId === runId && e.id.startsWith('local_')));
    this.write(tables);
  }
}
