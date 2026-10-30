export type RunMode = 'local' | 'p2p' | 'dedicated';

/** What the host submits at the end of a run. */
export interface RunResult {
  /** Unique id; resubmitting the same runId is idempotent. */
  runId: string;
  /** 1..4 — each team size has its own leaderboard. */
  teamSize: number;
  players: string[];
  survivalMs: number;
  wave: number;
  kills: number;
  /** ISO timestamp. */
  endedAt: string;
  version: string;
  mode: RunMode;
}

export interface HighscoreEntry extends RunResult {
  id: string;
  submittedAt: string;
}

export interface SubmitResponse {
  entry: HighscoreEntry;
  /** 1-based rank within the team-size table. */
  rank: number;
  duplicate: boolean;
}

export interface TopResponse {
  teamSize: number;
  entries: HighscoreEntry[];
}

export type SubmitStatus = 'server' | 'local' | 'failed';
