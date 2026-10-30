import type { HighscoreEntry, PlayerScoreEntry, RunResult, SubmitStatus } from '@sms/shared';

export interface SubmitOutcome {
  status: SubmitStatus;
  /** 1-based rank in the team-size table, when known. */
  rank?: number;
}

export interface TopResult {
  entries: HighscoreEntry[];
  /** Where the data came from: the server, or the local cache/fallback. */
  source: 'server' | 'local';
}

export interface TopPlayersResult {
  entries: PlayerScoreEntry[];
  source: 'server' | 'local';
}

/**
 * Highscore persistence used by the game. Default: HTTP to the highscore
 * server, falling back to (and caching in) localStorage. Swap implementations
 * in createHighscoreStore().
 */
export interface HighscoreStore {
  submit(result: RunResult): Promise<SubmitOutcome>;
  top(teamSize: number, limit?: number): Promise<TopResult>;
  /** Individual leaderboard: marines by personal points; teamSize 0 = all team sizes. */
  topPlayers(teamSize: number, limit?: number): Promise<TopPlayersResult>;
  /** True when no highscore server is configured (static deploy): scores live only in this browser. */
  readonly localOnly?: boolean;
}
