/**
 * Smoke test against the LIVE Firestore project used by the deployed game:
 *   npm run check:firestore
 *
 * 1. creates one obvious test run on the current board (boards/<major.minor>/highscores; name
 *    "ZZ-test", version "<GAME_VERSION>-test" — hidden from the board)
 * 2. reads it back, runs the top-N query and the rank count (both need the composite index)
 * 3. checks that re-creating the same id is rejected (create-only → 409)
 * 4. checks that an implausible run is rejected by the rules (403)
 *
 * Config: VITE_FIREBASE_API_KEY / VITE_FIREBASE_PROJECT_ID from the environment, else
 * .env.production.local, else .env.production. Test docs cannot be deleted by clients (rules are
 * create-only); remove them in the console if you care — they never show on the leaderboard.
 */
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { GAME_VERSION, leaderboardBoard, type RunResult } from '../packages/shared/src/index.js';
import {
  commitBody,
  endpoint,
  parseCount,
  parseTop,
  rankQuery,
  runDocName,
  topQuery,
  type FirestoreConfig,
} from '../packages/client/src/highscores/firestore.js';

const root = resolve(import.meta.dirname, '..');
function envValue(key: string): string | undefined {
  if (process.env[key]) return process.env[key];
  for (const f of ['.env.production.local', '.env.production']) {
    const p = resolve(root, f);
    if (!existsSync(p)) continue;
    const m = readFileSync(p, 'utf8').match(new RegExp(`^${key}=(.*)$`, 'm'));
    if (m?.[1]?.trim()) return m[1].trim();
  }
  return undefined;
}

const apiKey = envValue('VITE_FIREBASE_API_KEY');
const projectId = envValue('VITE_FIREBASE_PROJECT_ID');
if (!apiKey || !projectId) {
  console.error('Missing VITE_FIREBASE_API_KEY / VITE_FIREBASE_PROJECT_ID');
  process.exit(2);
}
const cfg: FirestoreConfig = {
  apiKey,
  projectId,
  baseUrl: process.env.VITE_FIRESTORE_URL,
  board: leaderboardBoard(GAME_VERSION),
};
console.log(`Firestore check against project "${projectId}"\n`);

type Res = { status: number; json: unknown };
async function call(method: Parameters<typeof endpoint>[1], body: unknown): Promise<Res> {
  const res = await fetch(endpoint(cfg, method), {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  return { status: res.status, json: await res.json().catch(() => null) };
}
const errText = (r: Res) => {
  const e = (r.json as { error?: { status?: string; message?: string } } | null)?.error;
  return `HTTP ${r.status}${e?.status ? ` ${e.status}` : ''}${e?.message ? `: ${e.message}` : ''}`;
};
const indexLink = (r: Res) => /https:\/\/console\.firebase\.google\.com\S*/.exec(errText(r))?.[0];

const results: { step: string; ok: boolean; note: string }[] = [];
const report = (step: string, ok: boolean, note: string) => {
  results.push({ step, ok, note });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${step} — ${note}`);
};

const runId = `zz_test_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
const testRun: RunResult = {
  runId,
  teamSize: 1,
  players: ['ZZ-test'],
  survivalMs: 1000,
  kills: 0,
  wave: 0,
  endedAt: new Date().toISOString(),
  version: `${GAME_VERSION}-test`,
  mode: 'local',
};

// 1. create
const created = await call('commit', commitBody(cfg, testRun));
const createOk = created.status === 200;
report(
  'create valid test run',
  createOk,
  createOk
    ? `boards/${cfg.board}/highscores/${runId}`
    : created.status === 403
      ? `${errText(created)} → the security rules are not deployed (production mode denies all). Publish firestore.rules.`
      : errText(created),
);

// 2. read back + queries (index)
if (createOk) {
  const base = (cfg.baseUrl ?? 'https://firestore.googleapis.com/v1').replace(/\/$/, '');
  const getUrl = `${base}/${runDocName(cfg, runId)}?key=${encodeURIComponent(apiKey)}`;
  const got = await fetch(getUrl);
  report('read test doc back', got.ok, got.ok ? 'fields stored' : `HTTP ${got.status}`);
}
const top = await call('runQuery', topQuery(cfg, 1, 100));
if (top.status === 200) {
  const n = parseTop(top.json).length;
  report('top-N query (teamSize == 1, survivalMs desc)', true, `${n} visible run(s) for solo`);
} else {
  const link = indexLink(top);
  report(
    'top-N query (teamSize == 1, survivalMs desc)',
    false,
    top.status === 403
      ? `${errText(top)} → reads denied: rules not deployed`
      : link
        ? `composite index missing — create it here: ${link}`
        : errText(top),
  );
}
const rank = await call('runAggregationQuery', rankQuery(cfg, 1, 1000));
report(
  'rank count query',
  rank.status === 200 && parseCount(rank.json) !== null,
  rank.status === 200
    ? `${parseCount(rank.json)} solo run(s) longer than 1 s`
    : indexLink(rank)
      ? `index missing: ${indexLink(rank)}`
      : errText(rank),
);

// 3. duplicate create
if (createOk) {
  const dup = await call('commit', commitBody(cfg, testRun));
  report('duplicate create rejected', dup.status === 409, errText(dup));
} else {
  report('duplicate create rejected', false, 'skipped (the first create did not succeed)');
}

// 4. invalid doc (implausible survival, bypassing client validation)
const bad = commitBody(cfg, { ...testRun, runId: `${runId}_bad` });
bad.writes[0].update.fields.survivalMs = { integerValue: String(99_999_999) };
const denied = await call('commit', bad);
report(
  'invalid doc rejected by rules',
  denied.status === 403,
  `${errText(denied)}${createOk ? '' : ' (note: everything is denied right now, so this proves nothing yet)'}`,
);

const failed = results.filter((r) => !r.ok).length;
console.log(`\n${failed ? `${failed} check(s) failed` : 'All Firestore checks passed'}.`);
process.exit(failed ? 1 : 0);
