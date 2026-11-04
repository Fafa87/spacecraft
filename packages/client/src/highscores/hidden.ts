import { leaderboardBoard } from '@sms/shared';

/**
 * Leaderboard rows that never show on any board (test / pre-release runs). Clients can't delete
 * Firestore documents (create-only rules), so the boards filter them out instead.
 */

/** Runs written by `npm run check:firestore` (version "x.y.z-test"). */
export const isTestVersion = (version: string): boolean => /-test$/.test(version);

/** Name used by `npm run check:firestore`. */
export const TEST_PLAYER_NAME = 'ZZ-test';

/** Runs hidden by id: written straight to the public API, not by a real game of that version. */
export const HIDDEN_RUN_IDS: ReadonlySet<string> = new Set([
  // boards/0.6.0: "Marine" 06:44 / wave 7, created 2026-11-01 16:31 UTC - three days before
  // v0.6.0 existed (version bump 2026-11-04 19:49 UTC), so a test write, not a 0.6.0 game.
  'run_mvy1rz0t_4gcw6yu9jw',
]);

/**
 * When each board opened (UTC; the version-bump commit). A row created earlier can't come from
 * that version's game. Add the new board here on every release.
 */
export const BOARD_OPENED_AT: Readonly<Record<string, string>> = {
  '0.6.0': '2026-11-04T19:49:00Z',
};

export interface RunVisibility {
  runId: string;
  version: string;
  names?: readonly string[];
  /** Document create time (or the run timestamp), ISO. */
  at?: string;
  /** `hidden: true` set by hand in the Firebase console. */
  hidden?: boolean;
}

/** True if a leaderboard row must not be shown. */
export function isHiddenRun(r: RunVisibility): boolean {
  if (r.hidden) return true;
  if (isTestVersion(r.version)) return true;
  if (HIDDEN_RUN_IDS.has(r.runId) || /^zz_test_/.test(r.runId)) return true;
  if (r.names?.includes(TEST_PLAYER_NAME)) return true;
  let board = '';
  try {
    board = leaderboardBoard(r.version);
  } catch {
    return true; // not a version any real client writes
  }
  const opened = BOARD_OPENED_AT[board];
  if (opened && r.at && Date.parse(r.at) < Date.parse(opened)) return true;
  return false;
}
