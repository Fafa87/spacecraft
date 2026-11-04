import type { RunResult } from '@sms/shared';

/**
 * Unversioned dev preview (`npm run deploy:dev` → https://<owner>.github.io/<repo>/dev/).
 * VITE_DEV_PREVIEW = the short commit sha, set only by that build. The preview is never listed
 * in versions.json and shows a "DEV PREVIEW <sha>" badge in the menu.
 *
 * Leaderboard: the preview uses the hidden board `boards/0.0.0`, which the existing Firestore
 * rules already accept (a numeric x.y.z board whose runs carry version "0.0.0" or "0.0.0-tag").
 * No release is ever 0.0.0, so real builds never read or write it, and the rules keep preview
 * runs (version 0.0.0-dev) out of every real board.
 */
export const DEV_PREVIEW: string | null = import.meta.env?.VITE_DEV_PREVIEW?.trim() || null;
export const DEV_BOARD = '0.0.0';
/** Version stamped on preview runs; must be `${DEV_BOARD}` or `${DEV_BOARD}-<tag>` for the rules. */
export const DEV_RUN_VERSION = `${DEV_BOARD}-dev`;

/** Leaderboard board for this build: `0.0.0` for the preview, else the version's board. */
export const boardFor = (versionBoard: string, preview: string | null = DEV_PREVIEW): string =>
  preview ? DEV_BOARD : versionBoard;

/** A finished run as this build submits it: preview runs are re-tagged for the dev board. */
export const runForBoard = (r: RunResult, preview: string | null = DEV_PREVIEW): RunResult =>
  preview ? { ...r, version: DEV_RUN_VERSION } : r;

/** The dev board is not a game version: never list it among real versions. */
export const isDevBoardVersion = (version: string): boolean =>
  version === DEV_BOARD || version.startsWith(`${DEV_BOARD}-`);
