import fs from 'node:fs/promises';
import path from 'node:path';
import initSqlJs, { type Database } from 'sql.js';
import {
  playerScoreEntries,
  type HighscoreEntry,
  type PlayerScoreEntry,
  type RunResult,
  type SubmitResponse,
} from '@sms/shared';
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
CREATE TABLE IF NOT EXISTS player_scores (
  id TEXT PRIMARY KEY,
  run_id TEXT NOT NULL,
  slot INTEGER NOT NULL,
  name TEXT NOT NULL,
  score INTEGER NOT NULL,
  kills INTEGER NOT NULL,
  team_size INTEGER NOT NULL,
  survival_ms INTEGER NOT NULL,
  version TEXT NOT NULL,
  at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_ps_team_score ON player_scores (team_size, score DESC, at ASC);
CREATE INDEX IF NOT EXISTS idx_ps_score ON player_scores (score DESC, at ASC);
`;
/** v0.4 columns, added to databases created by older servers. */
const RUN_SCORE_COLUMNS = ['player_scores', 'player_kills'];

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
    const cols = new Set(this.all('PRAGMA table_info(highscores)').map((r) => String(r.name)));
    for (const c of RUN_SCORE_COLUMNS)
      if (!cols.has(c)) this.db.exec(`ALTER TABLE highscores ADD COLUMN ${c} TEXT`);
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
      ...(r.player_scores ? { playerScores: JSON.parse(String(r.player_scores)) as number[] } : {}),
      ...(r.player_kills ? { playerKills: JSON.parse(String(r.player_kills)) as number[] } : {}),
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
      `INSERT INTO highscores (id, run_id, team_size, players, survival_ms, wave, kills, ended_at, submitted_at, version, mode, player_scores, player_kills)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        e.id,
        e.runId,
        e.teamSize,
        JSON.stringify(e.players),
        e.survivalMs,
        e.wave,
        e.kills,
        e.endedAt,
        e.submittedAt,
        e.version,
        e.mode,
        e.playerScores ? JSON.stringify(e.playerScores) : null,
        e.playerKills ? JSON.stringify(e.playerKills) : null,
      ] as (string | number | null)[],
    );
    for (const p of playerScoreEntries(e, e.submittedAt))
      this.db.run(
        `INSERT INTO player_scores (id, run_id, slot, name, score, kills, team_size, survival_ms, version, at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [p.id, p.runId, p.slot, p.name, p.score, p.kills, p.teamSize, p.survivalMs, p.version, p.at],
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

  async topPlayers(teamSize: number, limit: number): Promise<PlayerScoreEntry[]> {
    const rows =
      teamSize > 0
        ? this.all(
            'SELECT * FROM player_scores WHERE team_size = ? ORDER BY score DESC, survival_ms DESC, at ASC LIMIT ?',
            [teamSize, limit],
          )
        : this.all(
            'SELECT * FROM player_scores ORDER BY score DESC, survival_ms DESC, at ASC LIMIT ?',
            [limit],
          );
    return rows.map((r) => ({
      id: String(r.id),
      runId: String(r.run_id),
      slot: Number(r.slot),
      name: String(r.name),
      score: Number(r.score),
      kills: Number(r.kills),
      teamSize: Number(r.team_size),
      survivalMs: Number(r.survival_ms),
      version: String(r.version),
      at: String(r.at),
    }));
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
