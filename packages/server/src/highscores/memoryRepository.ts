import type { HighscoreEntry, RunResult, SubmitResponse } from '@sms/shared';
import { compareEntries, toEntry, type HighscoreRepository } from './repository.js';

/** In-memory store; also the base for the JSON file store. */
export class MemoryHighscoreRepository implements HighscoreRepository {
  readonly kind: string = 'memory';
  protected entries: HighscoreEntry[] = [];
  /** Max entries kept per team size (lowest are dropped). */
  constructor(protected readonly maxPerTeamSize = 5000) {}

  async init(): Promise<void> {}

  async add(result: RunResult): Promise<SubmitResponse> {
    const existing = this.entries.find((e) => e.runId === result.runId);
    if (existing) return { entry: existing, rank: this.rankOf(existing), duplicate: true };
    const entry = toEntry(result);
    this.entries.push(entry);
    this.entries.sort(compareEntries);
    this.trim(result.teamSize);
    await this.persist();
    return { entry, rank: this.rankOf(entry), duplicate: false };
  }

  private rankOf(entry: HighscoreEntry): number {
    return this.entries.filter((e) => e.teamSize === entry.teamSize).indexOf(entry) + 1;
  }

  private trim(teamSize: number): void {
    const same = this.entries.filter((e) => e.teamSize === teamSize);
    if (same.length <= this.maxPerTeamSize) return;
    const drop = new Set(same.slice(this.maxPerTeamSize));
    this.entries = this.entries.filter((e) => !drop.has(e));
  }

  async top(teamSize: number, limit: number): Promise<HighscoreEntry[]> {
    return this.entries.filter((e) => e.teamSize === teamSize).slice(0, limit);
  }

  async count(teamSize?: number): Promise<number> {
    return teamSize ? this.entries.filter((e) => e.teamSize === teamSize).length : this.entries.length;
  }

  protected async persist(): Promise<void> {}

  async close(): Promise<void> {}
}
