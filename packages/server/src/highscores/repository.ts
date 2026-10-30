import type { HighscoreEntry, RunResult, SubmitResponse } from '@sms/shared';

/**
 * Storage abstraction for highscores. Implementations: memory (tests),
 * JSON file, SQLite (sql.js / WASM — no native build needed).
 * Ordering everywhere: survivalMs DESC, submittedAt ASC (earlier wins ties).
 */
export interface HighscoreRepository {
  readonly kind: string;
  init(): Promise<void>;
  /** Idempotent by runId: re-submitting returns the existing entry with duplicate=true. */
  add(result: RunResult): Promise<SubmitResponse>;
  top(teamSize: number, limit: number): Promise<HighscoreEntry[]>;
  count(teamSize?: number): Promise<number>;
  close(): Promise<void>;
}

export const compareEntries = (a: HighscoreEntry, b: HighscoreEntry): number =>
  b.survivalMs - a.survivalMs ||
  a.submittedAt.localeCompare(b.submittedAt) ||
  a.id.localeCompare(b.id);

let counter = 0;
export const newEntryId = (): string => `hs_${Date.now().toString(36)}_${(counter++).toString(36)}`;

export function toEntry(result: RunResult): HighscoreEntry {
  return { ...result, id: newEntryId(), submittedAt: new Date().toISOString() };
}
