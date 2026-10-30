import fs from 'node:fs/promises';
import path from 'node:path';
import initSqlJs, { type Database } from 'sql.js';
import type { HighscoreEntry, RunResult, SubmitResponse } from '@sms/shared';
import { toEntry, type HighscoreRepository } from './repository.js';

const SCHEMA = `
CREATE TABLE IF NOT EXISTS highscores (
  id TEXT PRIMARY KEY,
  run_id TEXT NOT NULL UNIQUE,
  team_size INTEGER NOT NULL,
  players TEXT NOT NULL,
  survival_ms INTEGER NOT NULL,
  wave INTEGER NOT NULL,
  kills INTEGER NOT NULL,
  ended_at TEXT NOT NULL,
  submitted_at TEXT NOT NULL,
  version TEXT NOT NULL,
  mode TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_hs_team_time ON highscores (team_size, survival_ms DESC, submitted_at ASC);
`;

type Row = Record<string, string | number>;

/**
 * SQLite store via sql.js (WASM, zero native deps). The DB lives in memory and
 * is flushed to disk after each write. Swap for better-sqlite3 / Postgres by
 * implementing HighscoreRepository.
 */
export class SqliteHighscoreRepository implements HighscoreRepository {
  readonly kind = 'sqlite';
  private db!: Database;
  private writeChain: Promise<void> = Promise.resolve();

  constructor(private readonly file: string | null) {}

  async init(): Promise<void> {
    const SQL = await initSqlJs();
    let buf: Uint8Array | undefined;
    if (this.file) {
      await fs.mkdir(path.dirname(this.file), { recursive: true });
      buf = await fs.readFile(this.file).catch(() => undefined);
    }
    this.db = new SQL.Database(buf);
    this.db.exec(SCHEMA);
  }

  private all(sql: string, params: (string | number)[] = []): Row[] {
    const stmt = this.db.prepare(sql);
    try {
      stmt.bind(params);
      const rows: Row[] = [];
      while (stmt.step()) rows.push(stmt.getAsObject() as Row);
      return rows;
    } finally {
      stmt.free();
    }
  }

  private toEntry(r: Row): HighscoreEntry {
    return {
      id: String(r.id),
      runId: String(r.run_id),
      teamSize: Number(r.team_size),
      players: JSON.parse(String(r.players)) as string[],
      survivalMs: Number(r.survival_ms),
      wave: Number(r.wave),
      kills: Number(r.kills),
      endedAt: String(r.ended_at),
      submittedAt: String(r.submitted_at),
      version: String(r.version),
      mode: String(r.mode) as HighscoreEntry['mode'],
    };
  }

  private rankOf(e: HighscoreEntry): number {
    const [row] = this.all(
      `SELECT COUNT(*) AS n FROM highscores WHERE team_size = ? AND (survival_ms > ? OR (survival_ms = ? AND submitted_at < ?))`,
      [e.teamSize, e.survivalMs, e.survivalMs, e.submittedAt],
    );
    return Number(row.n) + 1;
  }

  async add(result: RunResult): Promise<SubmitResponse> {
    const [existing] = this.all('SELECT * FROM highscores WHERE run_id = ?', [result.runId]);
    if (existing) {
      const entry = this.toEntry(existing);
      return { entry, rank: this.rankOf(entry), duplicate: true };
    }
    const e = toEntry(result);
    this.db.run(
      `INSERT INTO highscores (id, run_id, team_size, players, survival_ms, wave, kills, ended_at, submitted_at, version, mode)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [e.id, e.runId, e.teamSize, JSON.stringify(e.players), e.survivalMs, e.wave, e.kills, e.endedAt, e.submittedAt, e.version, e.mode],
    );
    await this.flush();
    return { entry: e, rank: this.rankOf(e), duplicate: false };
  }

  async top(teamSize: number, limit: number): Promise<HighscoreEntry[]> {
    return this.all(
      'SELECT * FROM highscores WHERE team_size = ? ORDER BY survival_ms DESC, submitted_at ASC LIMIT ?',
      [teamSize, limit],
    ).map((r) => this.toEntry(r));
  }

  async count(teamSize?: number): Promise<number> {
    const rows = teamSize
      ? this.all('SELECT COUNT(*) AS n FROM highscores WHERE team_size = ?', [teamSize])
      : this.all('SELECT COUNT(*) AS n FROM highscores');
    return Number(rows[0].n);
  }

  private flush(): Promise<void> {
    if (!this.file) return Promise.resolve();
    const file = this.file;
    const data = this.db.export();
    this.writeChain = this.writeChain.then(async () => {
      await fs.writeFile(`${file}.tmp`, data);
      await fs.rename(`${file}.tmp`, file);
    });
    return this.writeChain;
  }

  async close(): Promise<void> {
    await this.writeChain;
    this.db?.close();
  }
}
