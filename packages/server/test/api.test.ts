import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { FastifyInstance } from 'fastify';
import { afterEach, describe, expect, it } from 'vitest';
import type { RunResult } from '@sms/shared';
import { buildApp } from '../src/app.js';
import { loadConfig, type ServerConfig } from '../src/config.js';
import { createRepository } from '../src/highscores/createRepository.js';
import type { HighscoreRepository } from '../src/highscores/repository.js';
import { RateLimiter } from '../src/highscores/rateLimiter.js';

let seq = 0;
const run = (patch: Record<string, unknown> = {}) => ({
  runId: `test_${Date.now()}_${seq++}`,
  teamSize: 1,
  players: ['Ripley'],
  survivalMs: 60_000,
  kills: 10,
  wave: 0,
  mode: 'local',
  version: '0.1.0',
  ...patch,
});

const cfg = (patch: Partial<ServerConfig> = {}): ServerConfig => ({
  ...loadConfig({}),
  store: 'memory',
  logLevel: 'silent',
  peerPort: 0,
  ...patch,
});

let app: FastifyInstance | null = null;
let repo: HighscoreRepository | null = null;
afterEach(async () => {
  await app?.close();
  await repo?.close();
  app = null;
  repo = null;
});

async function setup(patch: Partial<ServerConfig> = {}) {
  const config = cfg(patch);
  repo = await createRepository(config.store, config.dataDir);
  app = await buildApp({ config, repo });
  return app;
}

describe('highscore API', () => {
  it('health and config', async () => {
    const a = await setup();
    const h = await a.inject({ method: 'GET', url: '/api/health' });
    expect(h.statusCode).toBe(200);
    expect(h.json()).toMatchObject({ ok: true, store: 'memory' });
    const c = await a.inject({ method: 'GET', url: '/api/config' });
    expect(c.json().peer).toBeNull();
  });

  it('POST returns 201 with rank, duplicates return 200', async () => {
    const a = await setup();
    const body = run();
    const r1 = await a.inject({ method: 'POST', url: '/api/highscores', payload: body });
    expect(r1.statusCode).toBe(201);
    expect(r1.json()).toMatchObject({ rank: 1, duplicate: false });
    const r2 = await a.inject({ method: 'POST', url: '/api/highscores', payload: body });
    expect(r2.statusCode).toBe(200);
    expect(r2.json().duplicate).toBe(true);
  });

  it('ranks by survival time, separately per team size', async () => {
    const a = await setup();
    await a.inject({
      method: 'POST',
      url: '/api/highscores',
      payload: run({ survivalMs: 30_000, players: ['Slow'] }),
    });
    const fast = await a.inject({
      method: 'POST',
      url: '/api/highscores',
      payload: run({ survivalMs: 90_000, players: ['Fast'] }),
    });
    expect(fast.json().rank).toBe(1);
    await a.inject({
      method: 'POST',
      url: '/api/highscores',
      payload: run({ teamSize: 3, players: ['A', 'B', 'C'], survivalMs: 200_000 }),
    });

    const one = (await a.inject({ method: 'GET', url: '/api/highscores/1' })).json();
    expect(one.entries.map((e: { players: string[] }) => e.players[0])).toEqual(['Fast', 'Slow']);
    const all = (await a.inject({ method: 'GET', url: '/api/highscores?limit=1' })).json();
    expect(Object.keys(all.tables)).toEqual(['1', '2', '3', '4', '5', '6', '7', '8']);
    expect(all.tables['1']).toHaveLength(1);
    expect(all.tables['2']).toHaveLength(0);
    expect(all.tables['3'][0].players).toEqual(['A', 'B', 'C']);
    const q = (await a.inject({ method: 'GET', url: '/api/highscores?teamSize=3' })).json();
    expect(q.teamSize).toBe(3);
  });

  it('validates input', async () => {
    const a = await setup();
    for (const bad of [
      run({ teamSize: 7 }),
      run({ players: ['   '] }),
      run({ survivalMs: -5 }),
      { nope: true },
    ]) {
      const r = await a.inject({ method: 'POST', url: '/api/highscores', payload: bad });
      expect(r.statusCode).toBe(400);
      expect(r.json().error).toBe('invalid_run');
    }
    expect((await a.inject({ method: 'GET', url: '/api/highscores/9' })).statusCode).toBe(400);
    expect(
      (await a.inject({ method: 'GET', url: '/api/highscores?teamSize=abc' })).statusCode,
    ).toBe(400);
    const huge = await a.inject({
      method: 'POST',
      url: '/api/highscores',
      payload: run({ junk: 'x'.repeat(10_000) }),
    });
    expect(huge.statusCode).toBe(413);
  });

  it('rate-limits submissions per IP', async () => {
    const a = await setup({ submitRatePerMinute: 3 });
    const codes: number[] = [];
    for (let i = 0; i < 5; i++)
      codes.push(
        (await a.inject({ method: 'POST', url: '/api/highscores', payload: run() })).statusCode,
      );
    expect(codes).toEqual([201, 201, 201, 429, 429]);
  });

  it('sends CORS headers', async () => {
    const a = await setup();
    const r = await a.inject({
      method: 'GET',
      url: '/api/highscores',
      headers: { origin: 'http://example.com' },
    });
    expect(r.headers['access-control-allow-origin']).toBe('http://example.com');
  });
});

describe('RateLimiter', () => {
  it('resets after the window', () => {
    let t = 0;
    const rl = new RateLimiter(1, 1000, () => t);
    expect(rl.take('a')).toBe(true);
    expect(rl.take('a')).toBe(false);
    expect(rl.take('b')).toBe(true);
    t = 1000;
    expect(rl.take('a')).toBe(true);
  });
});

describe.each(['json', 'sqlite'] as const)('%s repository persistence', (kind) => {
  it('survives a restart', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), `sms-${kind}-`));
    try {
      const r1 = await createRepository(kind, dir);
      await r1.add({
        ...(run({ survivalMs: 45_000 }) as unknown as RunResult),
        endedAt: new Date().toISOString(),
      });
      await r1.add({
        ...(run({ survivalMs: 75_000, teamSize: 2, players: ['A', 'B'] }) as unknown as RunResult),
        endedAt: new Date().toISOString(),
      });
      await r1.close();
      const r2 = await createRepository(kind, dir);
      expect(await r2.count()).toBe(2);
      expect(await r2.count(2)).toBe(1);
      const top = await r2.top(1, 10);
      expect(top[0].survivalMs).toBe(45_000);
      await r2.close();
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});
