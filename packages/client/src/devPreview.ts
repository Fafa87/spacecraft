/**
 * Unversioned dev preview (`npm run deploy:dev` → https://<owner>.github.io/<repo>/dev/).
 * VITE_DEV_PREVIEW = the short commit sha, set only by that build. The preview is never listed
 * in versions.json, shows a "DEV PREVIEW <sha>" badge in the menu and uses its own leaderboard
 * board (boards/dev), so its runs never reach the normal per-version rankings.
 */
export const DEV_PREVIEW: string | null = import.meta.env.VITE_DEV_PREVIEW?.trim() || null;
export const DEV_BOARD = 'dev';

/** Leaderboard board for this build: `dev` for the preview, else the version's board. */
export const boardFor = (versionBoard: string, preview: string | null = DEV_PREVIEW): string =>
  preview ? DEV_BOARD : versionBoard;
