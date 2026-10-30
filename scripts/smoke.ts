/**
 * Headless end-to-end smoke test (no browser, no running dev server needed).
 * Boots the real server in-process (memory store, random port), then:
 *   1. Two WebSocket clients create/join a room on the dedicated host, start a run,
 *      stream inputs and receive snapshots.
 *   2. The run is ended (all marines downed) and the host's automatic highscore
 *      submission is checked.
 *   3. A run result is POSTed to the highscore API and read back with GET.
 *   4. A full solo run plays out headless over a LocalLink pair (P2P host code path).
 */
import { WebSocket } from 'ws';
import {
  ClientSession,
  createLocalLinkPair,
  HostSession,
  type RunResult,
  type Snapshot,
  type TopResponse,
} from '@sms/shared';
import { loadConfig } from '../packages/server/src/config.js';
import { WsLink } from '../packages/server/src/gamehost/wsLink.js';
import { startServer } from '../packages/server/src/server.js';

let failures = 0;
const check = (ok: boolean, msg: string) => {
  console.log(`${ok ? '✓' : '✗'} ${msg}`);
  if (!ok) failures++;
};
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const waitFor = <T>(fn: (resolve: (v: T) => void) => void, ms: number, what: string) =>
  new Promise<T>((resolve, reject) => {
    const t = setTimeout(() => reject(new Error(`timeout waiting for ${what}`)), ms);
    fn((v) => {
      clearTimeout(t);
      resolve(v);
    });
  });

async function wsClient(base: string, name: string, query: string): Promise<ClientSession> {
  const ws = new WebSocket(`${base}/ws?${query}`);
  await waitFor<void>((r) => ws.once('open', () => r()), 5000, `${name} ws open`);
  const session = new ClientSession(new WsLink(name, ws), name);
  session.join();
  return session;
}

async function main(): Promise<void> {
  const server = await startServer({
    ...loadConfig({}),
    host: '127.0.0.1',
    port: 0,
    store: 'memory',
    peerPort: 0,
    logLevel: 'silent',
  });
  const http = `http://127.0.0.1:${server.port}`;
  const ws = `ws://127.0.0.1:${server.port}`;
  try {
    const health = (await (await fetch(`${http}/api/health`)).json()) as { ok: boolean; store: string };
    check(health.ok && health.store === 'memory', `server up on ${http} (store ${health.store})`);

    // 1. two clients on the dedicated host
    const a = await wsClient(ws, 'Alpha', 'create=1');
    const welcome = await waitFor<{ room: string }>((r) => a.once('welcome', r), 5000, 'welcome');
    const b = await wsClient(ws, 'Bravo', `room=${welcome.room}`);
    await waitFor<void>((r) => a.on('lobby', (l) => l.players.length === 2 && r()), 5000, 'lobby with 2');
    check(a.isOwner && !b.isOwner, `room ${welcome.room}: Alpha owns it, Bravo joined`);
    a.requestStart();
    const snaps: Record<string, Snapshot[]> = { a: [], b: [] };
    a.on('snapshot', (s) => snaps.a.push(s));
    b.on('snapshot', (s) => snaps.b.push(s));
    for (let i = 0; i < 60; i++) {
      a.sendInput({ mx: 1, my: 0, aim: 0, fire: true, slot: 0, reload: false });
      b.sendInput({ mx: -1, my: 0, aim: Math.PI, fire: true, slot: 0, reload: false });
      await sleep(1000 / 30);
    }
    const lastB = snaps.b.at(-1)!;
    check(snaps.a.length > 40 && snaps.b.length > 40, `snapshots streamed (A ${snaps.a.length}, B ${snaps.b.length}, tick ${lastB?.tick})`);
    const pa = lastB.players.find((p) => p.id === a.playerId)!;
    const pb = lastB.players.find((p) => p.id === b.playerId)!;
    check(pa.x > 1650 && pb.x < 1550, `inputs applied server-side (A x=${pa.x.toFixed(0)}, B x=${pb.x.toFixed(0)})`);

    // 2. end the run: down every marine on the host world
    const room = server.gameHost!.rooms.get(welcome.room)!;
    for (const p of room.world!.players) {
      p.state = 'downed';
      p.hp = 0;
    }
    const submitted = await waitFor<{ status: string; rank?: number }>((r) => b.once('submitted', r), 5000, 'submitted');
    check(submitted.status === 'server', `dedicated host submitted the run (status ${submitted.status}, rank #${submitted.rank})`);
    const t2 = (await (await fetch(`${http}/api/highscores/2`)).json()) as TopResponse;
    check(
      t2.entries.length === 1 && t2.entries[0]!.players.join() === 'Alpha,Bravo',
      `2-marine table holds the run: ${t2.entries.map((e) => `${e.players.join('+')} ${e.survivalMs}ms`).join()}`,
    );
    a.close();
    b.close();

    // 3. direct API submit + read
    const run: RunResult = {
      runId: `smoke_${Date.now()}`,
      teamSize: 3,
      players: ['Ripley', 'Hicks', 'Vasquez'],
      survivalMs: 187_400,
      wave: 4,
      kills: 512,
      mode: 'p2p',
      version: '0.1.0',
      endedAt: new Date().toISOString(),
    };
    const post = await fetch(`${http}/api/highscores`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(run),
    });
    const postBody = (await post.json()) as { rank: number };
    check(post.status === 201 && postBody.rank === 1, `POST /api/highscores -> ${post.status}, rank #${postBody.rank}`);
    const dup = await fetch(`${http}/api/highscores`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(run),
    });
    check(dup.status === 200, `re-POST of the same runId is idempotent (${dup.status})`);
    const all = (await (await fetch(`${http}/api/highscores?limit=5`)).json()) as { tables: Record<string, unknown[]> };
    check(all.tables['3']!.length === 1 && all.tables['1']!.length === 0, `GET /api/highscores returns separate tables per team size`);

    // 4. headless solo run over local links (same HostSession code path the browser host uses)
    let result: RunResult | null = null;
    const host = new HostSession({
      roomCode: 'SOLO',
      mode: 'local',
      maxPlayers: 1,
      submitResult: async (r) => {
        result = r;
        return { status: 'server', rank: 1 };
      },
    });
    const [hs, cs] = createLocalLinkPair('smoke');
    host.addLink(hs);
    const solo = new ClientSession(cs, 'Solo');
    solo.join();
    await sleep(50);
    solo.requestStart();
    await sleep(50);
    const world = host.world!;
    // Fast-forward the sim directly (stand still, never shoot) until the swarm wins.
    while (!world.over && world.time < 600) host.tick();
    await sleep(50);
    check(!!result && (result as RunResult).survivalMs > 5000, `solo run ended by the swarm after ${((result as RunResult | null)?.survivalMs ?? 0) / 1000}s`);
    host.close();
  } finally {
    await server.close();
  }
  console.log(failures ? `\n${failures} check(s) failed` : '\nsmoke OK');
  process.exit(failures ? 1 : 0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
