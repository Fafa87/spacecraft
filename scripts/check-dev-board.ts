/**
 * Live check of the dev-preview leaderboard board (boards/0.0.0) against the real Firestore
 * project, with the existing rules: npx tsx scripts/check-dev-board.ts
 *
 * Writes ONE hidden test run (id zz_test_dev_…, name "ZZ-test", version "0.0.0-dev": hidden by
 * hidden.ts and only on the dev board), reads it back via REST GET and the top query, and checks
 * that a dev-tagged run is rejected on the real 0.6.0 board. Clients can't delete (create-only
 * rules); the test doc never shows on any board — remove it in the console if wanted.
 */
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { RunResult } from '../packages/shared/src/index.js';
import {
  commitBody,
  docCount,
  endpoint,
  parseTop,
  runDocName,
  topQuery,
  type FirestoreConfig,
} from '../packages/client/src/highscores/firestore.js';
import { DEV_BOARD, DEV_RUN_VERSION } from '../packages/client/src/devPreview.js';

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
const apiKey = envValue('VITE_FIREBASE_API_KEY')!;
const projectId = envValue('VITE_FIREBASE_PROJECT_ID')!;
const dev: FirestoreConfig = { apiKey, projectId, board: DEV_BOARD };
const real: FirestoreConfig = { apiKey, projectId, board: '0.6.0' };

async function call(cfg: FirestoreConfig, method: Parameters<typeof endpoint>[1], body: unknown) {
  const res = await fetch(endpoint(cfg, method), {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  return { status: res.status, json: (await res.json().catch(() => null)) as unknown };
}
let failed = 0;
const report = (ok: boolean, step: string, note = '') => {
  if (!ok) failed++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${step}${note ? ` — ${note}` : ''}`);
};

const runId = `zz_test_dev_${Date.now().toString(36)}`;
const run: RunResult = {
  runId,
  teamSize: 1,
  players: ['ZZ-test'],
  survivalMs: 1000,
  kills: 0,
  wave: 0,
  endedAt: new Date().toISOString(),
  version: DEV_RUN_VERSION,
  mode: 'local',
};
const c = await call(dev, 'commit', commitBody(dev, run));
report(c.status === 200, `create boards/${DEV_BOARD}/highscores/${runId}`, `HTTP ${c.status}`);
const got = await fetch(
  `https://firestore.googleapis.com/v1/${runDocName(dev, runId)}?key=${encodeURIComponent(apiKey)}`,
);
const doc = (await got.json().catch(() => null)) as {
  fields?: Record<string, { stringValue?: string }>;
};
report(
  got.ok && doc?.fields?.version?.stringValue === DEV_RUN_VERSION,
  'read it back (REST GET)',
  `HTTP ${got.status}, version ${doc?.fields?.version?.stringValue}, board ${doc?.fields?.board?.stringValue}`,
);
const top = await call(dev, 'runQuery', topQuery(dev, 1, 50));
report(
  top.status === 200,
  'top query on the dev board',
  `HTTP ${top.status}, ${docCount(top.json)} doc(s), ${parseTop(top.json).length} visible (test rows hidden)`,
);
const cross = await call(real, 'commit', commitBody(real, { ...run, runId: `${runId}_x` }));
report(cross.status === 403, 'dev-tagged run rejected on boards/0.6.0', `HTTP ${cross.status}`);
console.log(`\ntest doc: boards/${DEV_BOARD}/highscores/${runId} (+ scores/${runId}-0)`);
process.exit(failed ? 1 : 0);
