/**
 * Firestore REST payload builders/parsers for the global leaderboard. This is the approach
 * Pulp Wars uses: the Firestore REST API straight from the browser, with the public web API key,
 * no auth and no Firebase SDK (it keeps the bundle small). firestore.rules is what makes this
 * safe: create-only, exact field set, types and ranges.
 */
import {
  FIRESTORE_BOARDS,
  FIRESTORE_COLLECTION,
  HIGHSCORE_LIMITS,
  validateRunResult,
  type HighscoreEntry,
  type RunResult,
} from '@sms/shared';

export interface FirestoreConfig {
  apiKey: string;
  projectId: string;
  /** REST root; override for the emulator, e.g. http://127.0.0.1:8080/v1 */
  baseUrl?: string;
  collection?: string;
  /**
   * Per-version board ("0.2" = major.minor): runs go to boards/{board}/highscores, so each
   * release starts with an empty table. Unset = the legacy top-level collection (v0.1.x).
   */
  board?: string;
}

export const FIRESTORE_DEFAULTS = {
  baseUrl: 'https://firestore.googleapis.com/v1',
  collection: FIRESTORE_COLLECTION,
} as const;

type Value =
  | { stringValue: string }
  | { integerValue: string }
  | { arrayValue: { values?: Value[] } }
  | { timestampValue: string };
type Fields = Record<string, Value>;

const collectionOf = (cfg: FirestoreConfig) => cfg.collection ?? FIRESTORE_DEFAULTS.collection;
export const documentsPath = (projectId: string) =>
  `projects/${projectId}/databases/(default)/documents`;

/** Parent document path of the leaderboard collection ("" = database root). */
const parentOf = (cfg: FirestoreConfig) => (cfg.board ? `/${FIRESTORE_BOARDS}/${cfg.board}` : '');

export type FirestoreMethod = 'commit' | 'runQuery' | 'runAggregationQuery';

export function endpoint(cfg: FirestoreConfig, method: FirestoreMethod) {
  const base = (cfg.baseUrl ?? FIRESTORE_DEFAULTS.baseUrl).replace(/\/$/, '');
  // runQuery/runAggregationQuery run under the board's parent doc; commit is database-wide.
  const parent = method === 'commit' ? '' : parentOf(cfg);
  return `${base}/${documentsPath(cfg.projectId)}${parent}:${method}?key=${encodeURIComponent(cfg.apiKey)}`;
}

const int = (n: number): Value => ({ integerValue: String(n) });
const str = (s: string): Value => ({ stringValue: s });

/** The stored document: exactly the field set firestore.rules allows (+ server timestamp). */
export function runFields(run: RunResult, board?: string): Fields {
  const fields: Fields = {
    teamSize: int(run.teamSize),
    names: { arrayValue: { values: run.players.map(str) } },
    survivalMs: int(run.survivalMs),
    kills: int(run.kills),
    wave: int(run.wave),
    mode: str(run.mode),
    version: str(run.version),
  };
  if (board) fields.board = str(board);
  return fields;
}

/** Full document name of a run. */
export const runDocName = (cfg: FirestoreConfig, runId: string) =>
  `${documentsPath(cfg.projectId)}${parentOf(cfg)}/${collectionOf(cfg)}/${runId}`;

/**
 * Create-only write (`currentDocument.exists = false`), so resubmitting the same runId can't
 * overwrite anything (Firestore answers 409 ALREADY_EXISTS), and `timestamp` = REQUEST_TIME.
 */
export function commitBody(cfg: FirestoreConfig, run: RunResult) {
  return {
    writes: [
      {
        update: {
          name: runDocName(cfg, run.runId),
          fields: runFields(run, cfg.board),
        },
        updateTransforms: [{ fieldPath: 'timestamp', setToServerValue: 'REQUEST_TIME' }],
        currentDocument: { exists: false },
      },
    ],
  };
}

const teamFilter = (teamSize: number) => ({
  fieldFilter: { field: { fieldPath: 'teamSize' }, op: 'EQUAL', value: int(teamSize) },
});
const BY_SURVIVAL = [{ field: { fieldPath: 'survivalMs' }, direction: 'DESCENDING' }];

/** Top-N for one team size (composite index teamSize ASC + survivalMs DESC). */
export function topQuery(cfg: FirestoreConfig, teamSize: number, limit: number) {
  return {
    structuredQuery: {
      from: [{ collectionId: collectionOf(cfg) }],
      where: teamFilter(teamSize),
      orderBy: BY_SURVIVAL,
      limit: Math.max(1, Math.min(HIGHSCORE_LIMITS.maxLimit, Math.floor(limit) || 1)),
    },
  };
}

/** COUNT of runs in the same table that survived longer; rank = count + 1. */
export function rankQuery(cfg: FirestoreConfig, teamSize: number, survivalMs: number) {
  return {
    structuredAggregationQuery: {
      structuredQuery: {
        from: [{ collectionId: collectionOf(cfg) }],
        where: {
          compositeFilter: {
            op: 'AND',
            filters: [
              teamFilter(teamSize),
              {
                fieldFilter: {
                  field: { fieldPath: 'survivalMs' },
                  op: 'GREATER_THAN',
                  value: int(survivalMs),
                },
              },
            ],
          },
        },
        orderBy: BY_SURVIVAL,
      },
      aggregations: [{ alias: 'above', count: {} }],
    },
  };
}

// --- parsing (responses are untrusted: anything malformed is skipped) ---

const obj = (v: unknown): Record<string, unknown> | null =>
  typeof v === 'object' && v !== null && !Array.isArray(v) ? (v as Record<string, unknown>) : null;

function readInt(f: Record<string, unknown>, key: string): number | null {
  const raw = obj(f[key])?.integerValue;
  const n =
    typeof raw === 'string' && /^-?\d{1,15}$/.test(raw)
      ? Number(raw)
      : typeof raw === 'number'
        ? raw
        : null;
  return n !== null && Number.isSafeInteger(n) ? n : null;
}
function readStr(f: Record<string, unknown>, key: string): string | null {
  const v = obj(f[key])?.stringValue;
  return typeof v === 'string' ? v : null;
}
function readStrings(f: Record<string, unknown>, key: string): string[] | null {
  const values = obj(obj(f[key])?.arrayValue)?.values ?? [];
  if (!Array.isArray(values)) return null;
  const out: string[] = [];
  for (const v of values) {
    const s = obj(v)?.stringValue;
    if (typeof s !== 'string') return null;
    out.push(s);
  }
  return out;
}

/** Runs written by `npm run check:firestore` (version "x.y.z-test") never show on the board. */
export const isTestVersion = (version: string) => /-test$/.test(version);

/** runQuery response → leaderboard entries (validated with the shared rules). */
export function parseTop(json: unknown): HighscoreEntry[] {
  if (!Array.isArray(json)) return [];
  const out: HighscoreEntry[] = [];
  for (const row of json) {
    const doc = obj(obj(row)?.document);
    const f = obj(doc?.fields);
    if (!doc || !f) continue;
    const name = typeof doc.name === 'string' ? doc.name : '';
    const id = name.slice(name.lastIndexOf('/') + 1);
    const ts = obj(f.timestamp)?.timestampValue;
    const at = typeof ts === 'string' ? ts : new Date(0).toISOString();
    const v = validateRunResult({
      runId: id,
      teamSize: readInt(f, 'teamSize'),
      players: readStrings(f, 'names'),
      survivalMs: readInt(f, 'survivalMs'),
      kills: readInt(f, 'kills') ?? 0,
      wave: readInt(f, 'wave') ?? 0,
      mode: readStr(f, 'mode') ?? undefined,
      version: readStr(f, 'version'),
      endedAt: new Date(0).toISOString(),
    });
    if (v.ok && !isTestVersion(v.value.version))
      out.push({ ...v.value, endedAt: at, id, submittedAt: at });
  }
  return out;
}

/** runAggregationQuery response → count, or null if absent/malformed. */
export function parseCount(json: unknown, alias = 'above'): number | null {
  if (!Array.isArray(json)) return null;
  for (const row of json) {
    const f = obj(obj(obj(row)?.result)?.aggregateFields);
    if (!f) continue;
    const n = readInt(f, alias);
    if (n !== null && n >= 0) return n;
  }
  return null;
}
