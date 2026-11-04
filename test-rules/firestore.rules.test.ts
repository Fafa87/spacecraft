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
  writeBatch,
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
    await assertSucceeds(
      put(good({ teamSize: 8, names: ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'] })),
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
    ['teamSize 9', { teamSize: 9, names: ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i'] }],
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
    ['implausible wave', { wave: 17 }],
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

describe('firestore.rules: per-version boards (boards/{board}/highscores)', () => {
  const v2 = (patch: Record<string, unknown> = {}) =>
    good({ version: '0.2.0', board: '0.2', ...patch });
  const putB = (data: Record<string, unknown>, board = '0.2', docId = id()) =>
    setDoc(doc(db(), 'boards', board, 'highscores', docId), data);

  it('accepts a well-formed run whose board matches path and version', async () => {
    await assertSucceeds(putB(v2()));
    await assertSucceeds(putB(v2({ version: '0.2.7-test' })));
    await assertSucceeds(putB(good({ version: '0.3.0', board: '0.3' }), '0.3'));
    const q = query(
      collection(db(), 'boards', '0.2', 'highscores'),
      where('teamSize', '==', 2),
      orderBy('survivalMs', 'desc'),
      limit(10),
    );
    expect((await assertSucceeds(getDocs(q))).size).toBe(2);
  });

  it('frozen v0.2/v0.3 boards reject the v0.4 score fields', async () => {
    await assertFails(putB(v2({ playerScores: [1, 2], playerKills: [1, 2] })));
  });

  it('boards are isolated: the legacy v0.1 board does not see v0.2 runs and vice versa', async () => {
    await assertSucceeds(put(good()));
    await assertSucceeds(putB(v2()));
    await assertSucceeds(putB(v2()));
    const legacy = await getDocs(query(collection(db(), 'highscores'), where('teamSize', '==', 2)));
    const b02 = await getDocs(
      query(collection(db(), 'boards', '0.2', 'highscores'), where('teamSize', '==', 2)),
    );
    expect([legacy.size, b02.size]).toEqual([1, 2]);
  });

  const badB: [string, Record<string, unknown>, string?][] = [
    ['missing board field', good({ version: '0.2.0' })],
    ['board field != path', v2({ board: '0.3' })],
    ['version from another board', v2({ version: '0.1.0' })],
    ['version major differs', v2({ version: '1.2.0' })],
    ['bad board path', v2({ board: 'abc' }), 'abc'],
    ['full-version board of another version', good({ version: '0.2.0', board: '0.2.1' }), '0.2.1'],
    ['four-part board', good({ version: '0.2.0', board: '0.2.0.1' }), '0.2.0.1'],
    ['implausible run', v2({ survivalMs: 99_999_999 })],
    ['extra field', v2({ cheat: true })],
  ];
  it.each(badB)('rejects: %s', async (_l, data, board) => {
    await assertFails(putB(data, board ?? '0.2'));
  });

  it('legacy collection keeps accepting v0.1.0 writes but not the board field', async () => {
    await assertSucceeds(put(good()));
    await assertFails(put(good({ board: '0.1' })));
  });

  it('board runs are create-only', async () => {
    const docId = id();
    await assertSucceeds(putB(v2(), '0.2', docId));
    const ref = doc(db(), 'boards', '0.2', 'highscores', docId);
    await assertFails(updateDoc(ref, { survivalMs: 9_000_000 }));
    await assertFails(deleteDoc(ref));
    await assertFails(setDoc(doc(db(), 'boards', '0.2'), { a: 1 }));
  });
});

describe('firestore.rules: v0.4+ boards with personal scores', () => {
  const v4 = (patch: Record<string, unknown> = {}) =>
    good({
      version: '0.4.0-dev',
      board: '0.4',
      playerScores: [200, 90],
      playerKills: [90, 50],
      ...patch,
    });
  const runRef = (runId: string, board = '0.4', fs = db()) =>
    doc(fs, 'boards', board, 'highscores', runId);
  const scoreRef = (sid: string, board = '0.4', fs = db()) =>
    doc(fs, 'boards', board, 'scores', sid);
  const row = (runId: string, slot: number, run = v4(), patch: Record<string, unknown> = {}) => ({
    runId,
    slot,
    name: (run.names as string[])[slot],
    score: (run.playerScores as number[])[slot],
    kills: (run.playerKills as number[])[slot],
    teamSize: run.teamSize,
    survivalMs: run.survivalMs,
    version: run.version,
    board: '0.4',
    timestamp: serverTimestamp(),
    ...patch,
  });
  /** Run + its score rows in one atomic batch, like the client's commit. */
  const putRun = (run = v4(), rows?: (runId: string) => [string, Record<string, unknown>][]) => {
    const runId = id();
    const fs = db();
    const b = writeBatch(fs);
    b.set(runRef(runId, '0.4', fs), run);
    for (const [sid, data] of rows
      ? rows(runId)
      : [0, 1].map(
          (s) => [`${runId}-${s}`, row(runId, s, run)] as [string, Record<string, unknown>],
        ))
      b.set(scoreRef(sid, '0.4', fs), data);
    return b.commit();
  };

  it('accepts a run with per-marine points and its individual rows', async () => {
    await assertSucceeds(putRun());
    const q = query(
      collection(db(), 'boards', '0.4', 'scores'),
      orderBy('score', 'desc'),
      limit(5),
    );
    const snap = await assertSucceeds(getDocs(q));
    expect(snap.docs.map((d) => d.data().score)).toEqual([200, 90]);
    const byTeam = query(
      collection(db(), 'boards', '0.4', 'scores'),
      where('teamSize', '==', 2),
      orderBy('score', 'desc'),
    );
    expect((await assertSucceeds(getDocs(byTeam))).size).toBe(2);
  });

  const badRun: [string, Record<string, unknown>][] = [
    ['missing playerScores', { playerScores: undefined }],
    ['missing playerKills', { playerKills: undefined }],
    ['scores size != teamSize', { playerScores: [1] }],
    ['float score', { playerScores: [1.5, 2] }],
    ['negative score', { playerScores: [-1, 2] }],
    ['implausible score', { playerScores: [125 * 40 + 501, 0] }],
    ['marine kills > team kills', { playerKills: [141, 0] }],
    ['implausible marine kills', { kills: 3200, playerKills: [125 * 25 + 51, 0] }],
  ];
  it.each(badRun)('rejects run: %s', async (_l, patch) => {
    const data = v4(patch);
    for (const k of Object.keys(data)) if (data[k] === undefined) delete data[k];
    await assertFails(setDoc(runRef(id()), data));
  });

  it('the plausibility cap is inclusive', async () => {
    await assertSucceeds(setDoc(runRef(id()), v4({ playerScores: [125 * 40 + 500, 0] })));
  });

  it('the same rules serve the v0.5 board (no rules change needed)', async () => {
    const run = v4({ version: '0.5.0-dev', board: '0.5' });
    const runId = id();
    const fs = db();
    const b = writeBatch(fs);
    b.set(runRef(runId, '0.5', fs), run);
    for (const s of [0, 1])
      b.set(scoreRef(`${runId}-${s}`, '0.5', fs), row(runId, s, run, { board: '0.5' }));
    await assertSucceeds(b.commit());
    // A 0.4 client can't write into the 0.5 board, nor a 0.5 client into 0.4.
    await assertFails(setDoc(runRef(id(), '0.5'), v4()));
    await assertFails(setDoc(runRef(id(), '0.4'), v4({ version: '0.5.0', board: '0.5' })));
  });

  it('score rows must mirror a run written in the same commit', async () => {
    // no run at all
    await assertFails(setDoc(scoreRef('run_nothere1-0'), row('run_nothere1', 0)));
    // forged score / name / slot id
    await assertFails(putRun(v4(), (r) => [[`${r}-0`, row(r, 0, v4(), { score: 9999 })]]));
    await assertFails(putRun(v4(), (r) => [[`${r}-0`, row(r, 0, v4(), { name: 'Other' })]]));
    await assertFails(putRun(v4(), (r) => [[`${r}-1`, row(r, 0)]]));
    await assertFails(
      putRun(v4(), (r) => [[`${r}-2`, row(r, 2, v4(), { name: 'X', score: 0, kills: 0 })]]),
    );
    await assertFails(putRun(v4(), (r) => [[`${r}-0`, row(r, 0, v4(), { extra: 1 })]]));
    // added later, after the run
    const runId = id();
    await assertSucceeds(setDoc(runRef(runId), v4()));
    await assertFails(setDoc(scoreRef(`${runId}-0`), row(runId, 0)));
  });

  it('score rows are create-only and not allowed on frozen boards', async () => {
    await assertSucceeds(putRun());
    const snap = await getDocs(collection(db(), 'boards', '0.4', 'scores'));
    const ref = snap.docs[0].ref;
    await assertFails(updateDoc(ref, { score: 1 }));
    await assertFails(deleteDoc(ref));
    await assertFails(setDoc(scoreRef('run_abcdefgh-0', '0.3'), row('run_abcdefgh', 0)));
  });
});

describe('FirestoreHighscoreStore on a per-version board (REST)', () => {
  const base = { apiKey: 'fake-api-key', projectId: PROJECT, baseUrl: `http://${host}:${port}/v1` };
  const v1 = new FirestoreHighscoreStore(base);
  const v2 = new FirestoreHighscoreStore({ ...base, board: '0.2' });
  const run = (version: string, survivalMs: number): RunResult => ({
    runId: id(),
    teamSize: 1,
    players: ['Filip'],
    survivalMs,
    kills: 10,
    wave: 1,
    endedAt: new Date().toISOString(),
    version,
    mode: 'local',
  });

  it('v0.2 starts empty, ranks within its board, and v0.1 keeps its own table', async () => {
    await v1.submit(run('0.1.0', 300_000));
    expect((await v2.top(1)).entries).toEqual([]);
    expect(await v2.submit(run('0.2.0', 100_000))).toEqual({ status: 'server', rank: 1 });
    expect(await v2.submit(run('0.2.0', 50_000))).toEqual({ status: 'server', rank: 2 });
    expect((await v2.top(1)).entries.map((e) => e.survivalMs)).toEqual([100_000, 50_000]);
    expect((await v1.top(1)).entries.map((e) => e.survivalMs)).toEqual([300_000]);
  });

  it('a v0.2 client cannot post a run tagged with another version', async () => {
    await expect(v2.submit(run('0.1.0', 100_000))).rejects.toMatchObject({ status: 403 });
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

describe('FirestoreHighscoreStore on a v0.4 board: individual leaderboard (REST)', () => {
  const cfg = {
    apiKey: 'fake-api-key',
    projectId: PROJECT,
    baseUrl: `http://${host}:${port}/v1`,
    board: '0.4',
  };
  const store = new FirestoreHighscoreStore(cfg);
  const run = (patch: Partial<RunResult> = {}): RunResult => ({
    runId: id(),
    teamSize: 2,
    players: ['Filip', 'Mróz'],
    survivalMs: 200_000,
    kills: 120,
    wave: 3,
    endedAt: new Date().toISOString(),
    version: '0.4.0-dev',
    mode: 'p2p',
    playerScores: [300, 120],
    playerKills: [80, 40],
    ...patch,
  });

  it('submits run + per-marine rows atomically and reads individual tops', async () => {
    expect((await store.submit(run())).status).toBe('server');
    await store.submit(
      run({ teamSize: 1, players: ['Solo'], playerScores: [500], playerKills: [100], kills: 100 }),
    );
    const all = await store.topPlayers(0, 10);
    expect(all.entries.map((e) => [e.name, e.score])).toEqual([
      ['Solo', 500],
      ['Filip', 300],
      ['Mróz', 120],
    ]);
    expect((await store.topPlayers(2, 10)).entries.map((e) => e.score)).toEqual([300, 120]);
    expect((await store.top(2)).entries[0].playerScores).toEqual([300, 120]);
  });

  it('a resubmit is a no-op and a forged score row is denied', async () => {
    const r = run();
    await store.submit(r);
    expect((await store.submit(r)).status).toBe('server');
    expect((await store.topPlayers(2)).entries).toHaveLength(2);
    const body = commitBody(cfg, run());
    body.writes[1].update.fields.score = { integerValue: '4000' };
    const res = await fetch(endpoint(cfg, 'commit'), {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });
    expect(res.status).toBe(403);
  });
});

describe('v0.5.1+: one board per release (boards/<full version>, REST)', () => {
  const cfg = (board: string) => ({
    apiKey: 'fake-api-key',
    projectId: PROJECT,
    baseUrl: `http://${host}:${port}/v1`,
    board,
  });
  const run = (patch: Partial<RunResult> = {}): RunResult => ({
    runId: id(),
    teamSize: 2,
    players: ['Filip', 'Mróz'],
    survivalMs: 200_000,
    kills: 120,
    wave: 3,
    endedAt: new Date().toISOString(),
    version: '0.5.1',
    mode: 'p2p',
    playerScores: [300, 120],
    playerKills: [80, 40],
    ...patch,
  });
  const post = async (board: string, r: RunResult) =>
    (
      await fetch(endpoint(cfg(board), 'commit'), {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(commitBody(cfg(board), r)),
      })
    ).status;

  it('v0.5.1 writes and reads its own board, separate from v0.5.0', async () => {
    const s051 = new FirestoreHighscoreStore(cfg('0.5.1'));
    const s050 = new FirestoreHighscoreStore(cfg('0.5'));
    expect((await s051.submit(run())).status).toBe('server');
    expect((await s050.submit(run({ version: '0.5.0', playerScores: [50, 10] }))).status).toBe(
      'server',
    );
    expect((await s051.topPlayers(2, 10)).entries.map((e) => e.score)).toEqual([300, 120]);
    expect((await s050.topPlayers(2, 10)).entries.map((e) => e.score)).toEqual([50, 10]);
    expect((await s051.top(2)).entries).toHaveLength(1);
  });

  it('accepts a -suffix of the same version (check:firestore uses 0.5.1-test)', async () => {
    expect(await post('0.5.1', run({ version: '0.5.1-test' }))).toBe(200);
  });

  it.each([
    ['another patch', '0.5.2'],
    ['the minor board version', '0.5.0'],
    ['a longer patch', '0.5.10'],
  ])('rejects %s on boards/0.5.1', async (_l, version) => {
    expect(await post('0.5.1', run({ version }))).toBe(403);
  });

  it('v0.6.0 gets a fresh board with the same published rules (no republish needed)', async () => {
    expect(await post('0.6.0', run({ version: '0.6.0' }))).toBe(200);
    expect(await post('0.6.0', run({ version: '0.6.0-test' }))).toBe(200);
    const s060 = new FirestoreHighscoreStore(cfg('0.6.0'));
    expect((await s060.topPlayers(2, 10)).entries.length).toBeGreaterThan(0);
  });

  it.each([
    ['the previous release', '0.5.2'],
    ['a later patch', '0.6.1'],
    ['a longer patch', '0.6.10'],
  ])('rejects %s on boards/0.6.0', async (_l, version) => {
    expect(await post('0.6.0', run({ version }))).toBe(403);
  });
});
