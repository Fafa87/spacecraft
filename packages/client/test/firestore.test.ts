import { beforeEach, describe, expect, it, vi } from 'vitest';
import { GAME_VERSION, leaderboardBoard, leaderboardRunVersion, type RunResult } from '@sms/shared';

// config.ts reads location at import time (index.ts → config.ts).
vi.hoisted(() => {
  (globalThis as { location?: unknown }).location ??= {
    search: '',
    hostname: 'localhost',
    origin: 'http://localhost',
    protocol: 'http:',
    pathname: '/',
  };
});

import {
  commitBody,
  endpoint,
  HIDDEN_SLACK,
  parseCount,
  parseTop,
  rankQuery,
  topQuery,
} from '../src/highscores/firestore.js';
import { FirestoreHighscoreStore } from '../src/highscores/FirestoreHighscoreStore.js';
import { isHiddenRun } from '../src/highscores/hidden.js';
import { FallbackHighscoreStore } from '../src/highscores/FallbackHighscoreStore.js';
import { LocalHighscoreStore } from '../src/highscores/LocalHighscoreStore.js';
import { createHighscoreStore, pickBackend } from '../src/highscores/index.js';
import { config } from '../src/config.js';

class MemStorage {
  private m = new Map<string, string>();
  getItem(k: string) {
    return this.m.get(k) ?? null;
  }
  setItem(k: string, v: string) {
    this.m.set(k, v);
  }
  removeItem(k: string) {
    this.m.delete(k);
  }
  clear() {
    this.m.clear();
  }
}

const cfg = { apiKey: 'AIza-test key', projectId: 'sms-demo' };
const DOCS = 'projects/sms-demo/databases/(default)/documents';
let n = 0;
const run = (patch: Partial<RunResult> = {}): RunResult => ({
  runId: `run_${n++}_abcdef`,
  teamSize: 2,
  players: ['Filip', 'Mróz'],
  survivalMs: 125_000,
  kills: 140,
  wave: 2,
  endedAt: '2026-10-30T15:00:00.000Z',
  version: '0.1.0',
  mode: 'p2p',
  ...patch,
});

const docJson = (id: string, f: Record<string, unknown>) => ({
  document: { name: `${DOCS}/highscores/${id}`, fields: f },
});
const fields = (survivalMs: number, names = ['A', 'B'], version = '0.1.0') => ({
  teamSize: { integerValue: String(names.length) },
  names: { arrayValue: { values: names.map((s) => ({ stringValue: s })) } },
  survivalMs: { integerValue: String(survivalMs) },
  kills: { integerValue: '3' },
  wave: { integerValue: '1' },
  mode: { stringValue: 'local' },
  version: { stringValue: version },
  timestamp: { timestampValue: '2026-10-30T14:59:00.123456Z' },
});
const count = (c: number) => [
  { result: { aggregateFields: { above: { integerValue: String(c) } } } },
];

beforeEach(() => {
  (globalThis as { localStorage?: unknown }).localStorage = new MemStorage();
  vi.spyOn(console, 'warn').mockImplementation(() => {});
});

describe('Firestore REST payloads', () => {
  it('endpoint encodes the key and supports an emulator base URL', () => {
    expect(endpoint(cfg, 'commit')).toBe(
      `https://firestore.googleapis.com/v1/${DOCS}:commit?key=AIza-test%20key`,
    );
    expect(endpoint({ ...cfg, baseUrl: 'http://127.0.0.1:8080/v1/' }, 'runQuery')).toBe(
      `http://127.0.0.1:8080/v1/${DOCS}:runQuery?key=AIza-test%20key`,
    );
  });

  it('commit is create-only with exactly the allowed fields and a server timestamp', () => {
    const r = run();
    const [w] = commitBody(cfg, r).writes;
    expect(w.update.name).toBe(`${DOCS}/highscores/${r.runId}`);
    expect(Object.keys(w.update.fields).sort()).toEqual([
      'kills',
      'mode',
      'names',
      'survivalMs',
      'teamSize',
      'version',
      'wave',
    ]);
    expect(w.update.fields.survivalMs).toEqual({ integerValue: '125000' });
    expect(w.update.fields.names).toEqual({
      arrayValue: { values: [{ stringValue: 'Filip' }, { stringValue: 'Mróz' }] },
    });
    expect(w.currentDocument).toEqual({ exists: false });
    expect(w.updateTransforms).toEqual([
      { fieldPath: 'timestamp', setToServerValue: 'REQUEST_TIME' },
    ]);
  });

  it('top query filters by team size, orders by survival, clamps limit', () => {
    const q = topQuery(cfg, 3, 500).structuredQuery;
    expect(q.from).toEqual([{ collectionId: 'highscores' }]);
    expect(q.where.fieldFilter).toMatchObject({ op: 'EQUAL', value: { integerValue: '3' } });
    expect(q.orderBy).toEqual([{ field: { fieldPath: 'survivalMs' }, direction: 'DESCENDING' }]);
    expect(q.limit).toBe(100);
    expect(topQuery(cfg, 1, 0).structuredQuery.limit).toBe(1);
  });

  it('rank query counts runs with a longer survival in the same table', () => {
    const a = rankQuery(cfg, 2, 9000).structuredAggregationQuery;
    expect(a.aggregations).toEqual([{ alias: 'above', count: {} }]);
    const [team, longer] = a.structuredQuery.where.compositeFilter.filters;
    expect(team.fieldFilter.value).toEqual({ integerValue: '2' });
    expect(longer.fieldFilter).toMatchObject({
      op: 'GREATER_THAN',
      value: { integerValue: '9000' },
    });
  });
});

describe('per-version boards', () => {
  const bcfg = { ...cfg, board: '0.2' };
  it('commits into boards/{board}/highscores with a board field', () => {
    const r = run({ version: '0.2.0' });
    const [w] = commitBody(bcfg, r).writes;
    expect(w.update.name).toBe(`${DOCS}/boards/0.2/highscores/${r.runId}`);
    expect(w.update.fields.board).toEqual({ stringValue: '0.2' });
    expect(endpoint(bcfg, 'commit')).toBe(endpoint(cfg, 'commit'));
  });
  it('queries run under the board parent document (legacy stays at the root)', () => {
    expect(endpoint(bcfg, 'runQuery')).toBe(
      `https://firestore.googleapis.com/v1/${DOCS}/boards/0.2:runQuery?key=AIza-test%20key`,
    );
    expect(endpoint(bcfg, 'runAggregationQuery')).toContain(`${DOCS}/boards/0.2:runAggregation`);
    expect(topQuery(bcfg, 1, 10).structuredQuery.from).toEqual([{ collectionId: 'highscores' }]);
  });
  it('board id is major.minor up to v0.5.0, then the full version (one board per release)', () => {
    expect(leaderboardBoard('0.2.0')).toBe('0.2');
    expect(leaderboardBoard('0.4.2')).toBe('0.4');
    expect(leaderboardBoard('0.5.0')).toBe('0.5');
    expect(leaderboardBoard('0.5.1')).toBe('0.5.1');
    expect(leaderboardBoard('0.5.1-test')).toBe('0.5.1');
    expect(leaderboardBoard('0.6.0')).toBe('0.6.0');
    expect(leaderboardBoard('0.6.1')).toBe('0.6.0'); // BOARD_ALIASES: share 0.6.0 table
    expect(leaderboardBoard('0.6.1-test')).toBe('0.6.0');
    expect(leaderboardBoard('12.30.4-beta.1')).toBe('12.30.4');
    expect(leaderboardBoard(GAME_VERSION)).toBe('0.6.0');
    expect(() => leaderboardBoard('x')).toThrow();
  });
  it('aliased releases stamp a board-prefixed run version for published rules', () => {
    expect(leaderboardRunVersion('0.6.0')).toBe('0.6.0');
    expect(leaderboardRunVersion('0.6.0-test')).toBe('0.6.0-test');
    expect(leaderboardRunVersion('0.6.1')).toBe('0.6.0-0.6.1');
    expect(leaderboardRunVersion('0.6.1-test')).toBe('0.6.0-test');
    expect(leaderboardRunVersion('0.6.0-0.6.1').split(/[-+]/)[0]).toBe('0.6.0');
  });
  it('the game build uses the shared 0.6.0 board (no boards/0.6.1)', () => {
    expect(config.firebase === null || config.firebase.board === '0.6.0').toBe(true);
  });
});

describe('Firestore REST parsing', () => {
  it('hides test, flagged, listed and pre-release runs on every board', () => {
    const rows = [
      {
        document: {
          name: `${DOCS}/highscores/run_ok_1234567`,
          fields: fields(90_000, ['A'], '0.6.0'),
          createTime: '2026-11-04T20:00:39.705670Z',
        },
      },
      docJson('zz_test_mw2j6g64_909rro', fields(1000, ['ZZ-test'], '0.6.0-test')),
      docJson('run_mvy1rz0t_4gcw6yu9jw', fields(404_033, ['Marine'], '0.6.0')),
      docJson('run_flagged_1234', {
        ...fields(80_000, ['B'], '0.6.0'),
        hidden: { booleanValue: true },
      }),
      {
        document: {
          name: `${DOCS}/highscores/run_early_123456`,
          fields: fields(70_000, ['C'], '0.6.0'),
          createTime: '2026-11-01T16:31:38.983903Z',
        },
      },
    ];
    expect(parseTop(rows).map((e) => e.id)).toEqual(['run_ok_1234567']);
    expect(isHiddenRun({ runId: 'run_x', version: '0.5.2', at: '2026-11-01T00:00:00Z' })).toBe(
      false,
    );
    expect(isHiddenRun({ runId: 'run_x', version: 'garbage' })).toBe(true);
  });

  it('parses documents and skips malformed/invalid/test ones', () => {
    const rows = [
      { readTime: 'x' }, // empty result row
      docJson('run_good_123', fields(90_000)),
      docJson('run_bad_team', { ...fields(90_000), teamSize: { integerValue: '9' } }),
      docJson('run_bad_names', {
        ...fields(80_000),
        names: { arrayValue: { values: [{ integerValue: '1' }] } },
      }),
      docJson('run_no_surv', { ...fields(80_000), survivalMs: { stringValue: 'lots' } }),
      docJson('run_check_1', fields(70_000, ['ZZ-test', 'ZZ-test'], '0.0.0-test')),
      'garbage',
      null,
    ];
    const out = parseTop(rows);
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({
      id: 'run_good_123',
      runId: 'run_good_123',
      teamSize: 2,
      players: ['A', 'B'],
      survivalMs: 90_000,
      submittedAt: '2026-10-30T14:59:00.123456Z',
    });
    expect(parseTop({ error: 1 })).toEqual([]);
  });

  it('parses aggregation counts', () => {
    expect(parseCount(count(4))).toBe(4);
    expect(
      parseCount([{ result: { aggregateFields: { above: { integerValue: '-1' } } } }]),
    ).toBeNull();
    expect(parseCount([{}])).toBeNull();
    expect(parseCount('nope')).toBeNull();
  });
});

type Call = { url: string; body: any }; // eslint-disable-line @typescript-eslint/no-explicit-any
type Reply = { status: number; json?: unknown } | Error;
function mockFetch(handler: (method: string, body: unknown) => Reply) {
  const calls: Call[] = [];
  const f = vi.fn(async (url: string, init: RequestInit) => {
    const body = JSON.parse(String(init.body));
    calls.push({ url, body });
    const method = url.slice(url.lastIndexOf(':') + 1, url.indexOf('?'));
    const r = handler(method, body);
    if (r instanceof Error) throw r;
    return new Response(JSON.stringify(r.json ?? {}), { status: r.status });
  });
  return { f: f as unknown as typeof fetch, calls };
}
const methodOf = (c: Call) => c.url.slice(c.url.lastIndexOf(':') + 1, c.url.indexOf('?'));

describe('FirestoreHighscoreStore (mocked fetch)', () => {
  it('commits then ranks via count', async () => {
    const { f, calls } = mockFetch((m) =>
      m === 'commit'
        ? { status: 200, json: { writeResults: [{}] } }
        : { status: 200, json: count(2) },
    );
    const store = new FirestoreHighscoreStore(cfg, { fetch: f });
    expect(await store.submit(run())).toEqual({ status: 'server', rank: 3 });
    // + the runs above, to discount hidden (test / pre-release) rows from the rank
    expect(calls.map(methodOf)).toEqual(['commit', 'runAggregationQuery', 'runQuery']);
  });

  it('rank skips hidden rows above (test / pre-release runs)', async () => {
    const { f } = mockFetch((m) =>
      m === 'commit'
        ? { status: 200, json: { writeResults: [{}] } }
        : m === 'runAggregationQuery'
          ? { status: 200, json: count(3) }
          : {
              status: 200,
              json: [
                docJson('run_a_123456', fields(500_000, ['A'])),
                docJson('zz_test_x', fields(400_000, ['ZZ-test'], '0.1.0-test')),
                docJson('run_mvy1rz0t_4gcw6yu9jw', fields(300_000, ['Marine'])),
              ],
            },
    );
    expect(await new FirestoreHighscoreStore(cfg, { fetch: f }).submit(run())).toEqual({
      status: 'server',
      rank: 2,
    });
  });

  it('normalizes rude/odd names before sending', async () => {
    const { f, calls } = mockFetch(() => ({ status: 200, json: count(0) }));
    await new FirestoreHighscoreStore(cfg, { fetch: f }).submit(
      run({ players: ['shithead', '<Ripley>'] }),
    );
    const names = calls[0].body.writes[0].update.fields.names.arrayValue.values.map(
      (v: { stringValue: string }) => v.stringValue,
    );
    expect(names).toEqual(['Marine 1', 'Ripley']);
  });

  it('treats 409 ALREADY_EXISTS as success; rank undefined if the count fails', async () => {
    const { f } = mockFetch((m) =>
      m === 'commit'
        ? { status: 409, json: { error: { status: 'ALREADY_EXISTS' } } }
        : { status: 500 },
    );
    expect(await new FirestoreHighscoreStore(cfg, { fetch: f }).submit(run())).toEqual({
      status: 'server',
      rank: undefined,
    });
  });

  it('rejects an invalid run locally without a request', async () => {
    const { f, calls } = mockFetch(() => ({ status: 200 }));
    await expect(
      new FirestoreHighscoreStore(cfg, { fetch: f }).submit(run({ survivalMs: 10 })),
    ).rejects.toMatchObject({ status: 400 });
    expect(calls).toHaveLength(0);
  });

  it('top returns parsed entries', async () => {
    const { f, calls } = mockFetch(() => ({
      status: 200,
      json: [docJson('run_a_123456', fields(50_000)), docJson('run_b_123456', fields(40_000))],
    }));
    const res = await new FirestoreHighscoreStore(cfg, { fetch: f }).top(2, 5);
    expect(res.source).toBe('server');
    expect(res.entries.map((e) => e.id)).toEqual(['run_a_123456', 'run_b_123456']);
    // over-fetched so hidden rows don't shorten the board
    expect(calls[0].body.structuredQuery.limit).toBe(5 + HIDDEN_SLACK);
  });
});

describe('Firestore + fallback (graceful degradation)', () => {
  const fallback = (handler: (method: string, body: unknown) => Reply) => {
    const { f, calls } = mockFetch(handler);
    const local = new LocalHighscoreStore();
    const store = new FallbackHighscoreStore(new FirestoreHighscoreStore(cfg, { fetch: f }), local);
    return { store, local, calls };
  };

  it('success is remembered as submitted', async () => {
    const { store, local } = fallback(() => ({ status: 200, json: count(0) }));
    const r = run();
    expect(await store.submit(r)).toEqual({ status: 'server', rank: 1 });
    expect(local.submitted()[0]).toMatchObject({ runId: r.runId, rank: 1 });
  });

  it('rules missing/denied (403): failed, but kept in local scores and not retried', async () => {
    const { store, local } = fallback(() => ({
      status: 403,
      json: { error: { status: 'PERMISSION_DENIED' } },
    }));
    const r = run();
    expect(await store.submit(r)).toEqual({ status: 'failed', rank: 1 });
    expect(local.pending()).toHaveLength(0);
    // the board query is denied too → the local table is shown
    const top = await store.top(2);
    expect(top.source).toBe('local');
    expect(top.entries.map((e) => e.runId)).toEqual([r.runId]);
  });

  it('missing index (400 FAILED_PRECONDITION) on read → local table', async () => {
    const { store } = fallback((m) =>
      m === 'runQuery'
        ? { status: 400, json: { error: { status: 'FAILED_PRECONDITION' } } }
        : { status: 200, json: count(0) },
    );
    await store.submit(run());
    expect((await store.top(2)).source).toBe('local');
  });

  it('network error → saved locally, flushed when back online', async () => {
    let offline = true;
    const { store, local, calls } = fallback((m) =>
      offline
        ? new TypeError('Failed to fetch')
        : { status: 200, json: m === 'commit' ? {} : count(0) },
    );
    const r = run();
    expect((await store.submit(r)).status).toBe('local');
    expect(local.pending().map((e) => e.runId)).toEqual([r.runId]);
    offline = false;
    await store.submit(run());
    await vi.waitFor(() => expect(local.pending()).toHaveLength(0));
    expect(calls.filter((c) => methodOf(c) === 'commit').length).toBeGreaterThanOrEqual(3);
  });

  it('a pending run later rejected becomes a kept local score', async () => {
    let offline = true;
    const { store, local } = fallback(() =>
      offline ? new TypeError('Failed to fetch') : { status: 403 },
    );
    const r = run();
    await store.submit(r);
    offline = false;
    await store.flushPending();
    expect(local.pending()).toHaveLength(0);
    expect((await local.top(2)).entries.map((e) => e.id)).toEqual([`kept_${r.runId}`]);
  });
});

describe('backend selection', () => {
  it('prefers Firestore, then the HTTP server, then local only', () => {
    expect(pickBackend(cfg, 'https://api')).toBe('firestore');
    expect(pickBackend(null, 'https://api')).toBe('http');
    expect(pickBackend(null, null)).toBe('local');
    expect(createHighscoreStore(null, null).localOnly).toBe(true);
    expect(createHighscoreStore(cfg, null).localOnly).toBe(false);
  });
});
