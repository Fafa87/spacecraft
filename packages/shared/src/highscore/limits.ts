/** Highscore limits shared by the client, the HTTP server and the generated firestore.rules. */
export const HIGHSCORE_LIMITS = {
  minTeamSize: 1,
  maxTeamSize: 4,
  nameMinLength: 1,
  nameMaxLength: 16,
  minSurvivalMs: 1000,
  /** 4 hours — anything longer is rejected as implausible. */
  maxSurvivalMs: 4 * 60 * 60 * 1000,
  /** Upper bound on kills per second of survival per marine. */
  maxKillsPerSecondPerPlayer: 25,
  /** Kills allowed on top of the per-second cap. */
  killsSlack: 50,
  maxKills: 1_000_000,
  /** Upper bound on personal score points per second of survival (per marine). */
  maxPointsPerSecondPerPlayer: 40,
  /** Points allowed on top of the per-second cap. */
  pointsSlack: 500,
  maxScore: 10_000_000,
  maxWave: 1000,
  defaultLimit: 10,
  maxLimit: 100,
  runIdPattern: /^[A-Za-z0-9_-]{6,64}$/,
  /** semver-ish: 1.2.3 or 1.2.3-tag (tags like "-test" mark check/dev runs). */
  versionPattern: /^\d{1,3}\.\d{1,3}\.\d{1,3}(?:-[0-9A-Za-z.]{1,12})?$/,
} as const;

/** NFC, strips control chars and <>, collapses whitespace, trims, max 16 code points. */
export function sanitizeName(raw: string): string {
  const s = raw
    .normalize('NFC')
    .replace(/\s+/g, ' ')
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u001f\u007f<>]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  return Array.from(s).slice(0, HIGHSCORE_LIMITS.nameMaxLength).join('').trim();
}
