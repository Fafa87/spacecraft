/**
 * Runs against the Firestore emulator (started by `npm run test:rules`, which wraps
 * `firebase emulators:exec` with the offline demo project `demo-sms`). Covers the rules directly
 * (rules-unit-testing + the web SDK) and end-to-end through our REST FirestoreHighscoreStore,
 * exactly as the browser talks to it.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from '@firebase/rules-unit-testing';
import {
  collection,
  deleteDoc,
  doc,
  getDocs,
  limit,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  Timestamp,
  updateDoc,
  where,
} from 'firebase/firestore';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { leaderboardName, nameProblem, type RunResult } from '../packages/shared/src/index.js';
import { FirestoreHighscoreStore } from '../packages/client/src/highscores/FirestoreHighscoreStore.js';
import { commitBody, endpoint } from '../packages/client/src/highscores/firestore.js';

const PROJECT = 'demo-sms';
const [host, portStr] = (process.env.FIRESTORE_EMULATOR_HOST ?? '127.0.0.1:8080').split(':');
const port = Number(portStr);
let env: RulesTestEnvironment;

beforeAll(async () => {
  env = await initializeTestEnvironment({
    projectId: PROJECT,
    firestore: {
      host,
      port,
      rules: readFileSync(resolve(import.meta.dirname, '..', 'firestore.rules'), 'utf8'),
    },
  });
});
afterAll(async () => env?.cleanup());
beforeEach(async () => env.clearFirestore());

const db = () => env.unauthenticatedContext().firestore();
let seq = 0;
const id = () => `run_${Date.now().toString(36)}_${seq++}`;
const good = (patch: Record<string, unknown> = {}) => ({
  teamSize: 2,
  names: ['Filip', 'Mróz'],
  survivalMs: 125_000,
  kills: 140,
  wave: 2,
  mode: 'p2p',
  version: '0.1.0',
  timestamp: serverTimestamp(),
  ...patch,
});
const put = (data: Record<string, unknown>, docId = id()) =>
  setDoc(doc(db(), 'highscores', docId), data);

describe('firestore.rules: highscores', () => {
  it('anyone can create a well-formed run and read the board', async () => {
    await assertSucceeds(put(good()));
    await assertSucceeds(put(good({ teamSize: 1, names: ['Solo'] })));
    await assertSucceeds(
      put(good({ teamSize: 4, names: ['A', 'B', 'C', 'D'], version: '1.2.3-beta.1' })),
    );
    const q = query(
      collection(db(), 'highscores'),
      where('teamSize', '==', 2),
      orderBy('survivalMs', 'desc'),
      limit(10),
    );
    const snap = await assertSucceeds(getDocs(q));
    expect(snap.size).toBe(1);
  });

  it('runs can never be updated or deleted, and ids are create-only', async () => {
    const docId = id();
    await assertSucceeds(put(good(), docId));
    const ref = doc(db(), 'highscores', docId);
    await assertFails(updateDoc(ref, { survivalMs: 9_000_000 }));
    await assertFails(setDoc(ref, good({ survivalMs: 9_000_000 })));
    await assertFails(deleteDoc(ref));
  });

  const bad: [string, Record<string, unknown>][] = [
    ['extra field', { cheat: true }],
    ['teamSize 0', { teamSize: 0, names: [] }],
    ['teamSize 5', { teamSize: 5, names: ['a', 'b', 'c', 'd', 'e'] }],
    ['teamSize as string', { teamSize: '2' }],
    ['names size != teamSize', { names: ['Only'] }],
    ['name not a string', { names: ['Filip', 7] }],
    ['empty name', { names: ['Filip', ''] }],
    ['17-char name', { names: ['Filip', 'x'.repeat(17)] }],
    ['markup in name', { names: ['<script>', 'B'] }],
    ['leading space', { names: [' Filip', 'B'] }],
    ['rude name (substring)', { names: ['xXfuckXx', 'B'] }],
    ['rude name (word)', { names: ['big ass', 'B'] }],
    ['survival too short', { survivalMs: 500 }],
    ['survival too long', { survivalMs: 4 * 3600_000 + 1 }],
    ['survival as float', { survivalMs: 1234.5 }],
    ['implausible kills', { kills: 7000 }],
    ['negative kills', { kills: -1 }],
    ['implausible wave', { wave: 5 }],
    ['unknown mode', { mode: 'god' }],
    ['bad version', { version: 'hacked' }],
    ['client timestamp', { timestamp: Timestamp.fromMillis(Date.now()) }],
  ];
  it.each(bad)('rejects: %s', async (_label, patch) => {
    await assertFails(put(good(patch)));
  });

  it('rejects a missing field, a bad doc id and other collections', async () => {
    const { kills: _k, ...noKills } = good();
    await assertFails(put(noKills));
    await assertFails(put(good(), 'x'));
    await assertFails(put(good(), 'has spaces here'));
    await assertFails(setDoc(doc(db(), 'other', 'abcdefgh'), { a: 1 }));
  });

  it('every name the client accepts passes the rules (client ⊆ rules)', async () => {
    const samples = [
      'Mróz',
      'Łukasz',
      "O'Neil",
      'Sgt. Ripley!',
      'a',
      'x'.repeat(16),
      'Zoë_2',
      'Ab Cd',
      'Cassandra',
      'Titan',
      'Classic',
      'Ж-11',
      '名前',
      'José?',
      'Marine 4',
      'ZZ-test',
    ];
    for (const n of samples) expect(nameProblem(n), n).toBeNull();
    for (const n of samples) await assertSucceeds(put(good({ teamSize: 1, names: [n] })));
    for (const raw of ['<b>x</b>', '  ', 'f u c k', '😀😀😀', 'a'.repeat(40)])
      await assertSucceeds(put(good({ teamSize: 1, names: [leaderboardName(raw)] })));
  });
});

describe('FirestoreHighscoreStore against the emulator (REST, as in the browser)', () => {
  const cfg = { apiKey: 'fake-api-key', projectId: PROJECT, baseUrl: `http://${host}:${port}/v1` };
  const store = new FirestoreHighscoreStore(cfg);
  const run = (patch: Partial<RunResult> = {}): RunResult => ({
    runId: id(),
    teamSize: 1,
    players: ['Filip'],
    survivalMs: 90_000,
    kills: 50,
    wave: 1,
    endedAt: new Date().toISOString(),
    version: '0.1.0',
    mode: 'local',
    ...patch,
  });

  it('submits, ranks, dedupes and reads the top table', async () => {
    expect(await store.submit(run({ survivalMs: 60_000 }))).toEqual({ status: 'server', rank: 1 });
    const b = run({ survivalMs: 120_000, players: ['Best'] });
    expect(await store.submit(b)).toEqual({ status: 'server', rank: 1 });
    expect((await store.submit(run({ survivalMs: 90_000 }))).rank).toBe(2);
    // resubmitting the same runId is a no-op success (create-only → 409 handled)
    expect(await store.submit(b)).toEqual({ status: 'server', rank: 1 });
    await store.submit(run({ teamSize: 2, players: ['A', 'B'], survivalMs: 300_000 }));
    // check-script docs are stored but hidden from the board
    await store.submit(
      run({ players: ['ZZ-test'], survivalMs: 1000, kills: 0, version: '0.0.0-test' }),
    );

    const top = await store.top(1, 10);
    expect(top.source).toBe('server');
    expect(top.entries.map((e) => e.survivalMs)).toEqual([120_000, 90_000, 60_000]);
    expect(top.entries[0]).toMatchObject({ runId: b.runId, players: ['Best'], teamSize: 1 });
    expect(Date.parse(top.entries[0].submittedAt)).toBeGreaterThan(Date.now() - 60_000);
    expect((await store.top(2)).entries).toHaveLength(1);
  });

  it('rude/odd names are normalized client-side so the run still counts', async () => {
    const r = run({ teamSize: 2, players: ['shithead', '<Ripley>'] });
    expect((await store.submit(r)).status).toBe('server');
    const [e] = (await store.top(2)).entries;
    expect(e.players).toEqual(['Marine 1', 'Ripley']);
  });

  it('a forged REST write that skips client validation is denied (403)', async () => {
    const body = commitBody(cfg, run());
    body.writes[0].update.fields.survivalMs = { integerValue: String(99_999_999) };
    const res = await fetch(endpoint(cfg, 'commit'), {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });
    expect(res.status).toBe(403);
  });
});
