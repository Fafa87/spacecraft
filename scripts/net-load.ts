/**
 * Network load probe: runs a real HostSession with N bot clients over in-memory links,
 * pushes the swarm to a heavy late wave, and measures what the host uploads.
 *
 *   npm run net:load                    # 8 clients, measure 30 s from wave 12
 *   npm run net:load -- --clients=8 --fromWave=14 --window=30
 *   npm run net:load -- --every=1          # v4 rate: a snapshot every 30 Hz tick
 *
 * Bytes are the JSON wire size (WsLink uses codec.encode; PeerJS "json" serialization
 * is the same JSON.stringify), i.e. payload bytes before transport framing / SCTP/TCP.
 * Bots are invulnerable so the run reaches a late wave; they aim and fire at the
 * nearest enemy and drift around the arena centre.
 */
import {
  ARENA,
  codec,
  createLocalLinkPair,
  createWireCodec,
  NET,
  ClientSession,
  HostSession,
  ManualScheduler,
  type HostMessage,
  type Link,
  type Snapshot,
  type World,
} from '@sms/shared';

const args: Record<string, string> = {};
for (const a of process.argv.slice(2)) {
  const [k, v] = a.replace(/^--/, '').split('=');
  args[k] = v ?? 'true';
}
const N = Number(args.clients ?? 8);
const FROM_WAVE = Number(args.fromWave ?? 12);
const WINDOW = Number(args.window ?? 30);
const MAX_SIM = Number(args.max ?? 2400);
const EVERY = Number(args.every ?? NET.snapshotEvery);

const macro = () => new Promise<void>((r) => setImmediate(r));
const sizeCache = new WeakMap<object, number>();
const byteSize = (m: object) => {
  let n = sizeCache.get(m);
  if (n === undefined) {
    n = Buffer.byteLength(codec.encode(m));
    sizeCache.set(m, n);
  }
  return n;
};

interface Meter {
  /** v4: plain JSON per message. */
  bytes: number;
  msgs: number;
  snapBytes: number;
  snaps: number;
  /** v5: per-link binary delta snapshots (net/wire.ts). */
  wire: number;
  wireSnap: number;
  peakWire: number;
}
const wireStats = { header: 0, players: 0, enemies: 0, projectiles: 0, pickups: 0, events: 0 };
let wireStatsAt = 0;
let mismatches = 0;
let checked = 0;
const meters: Meter[] = [];
let measuring = false;

function metered(link: Link, m: Meter, verify: boolean): Link {
  const send = link.send.bind(link);
  const hostCodec = createWireCodec(verify ? wireStats : undefined);
  const clientCodec = createWireCodec();
  link.send = (msg: unknown) => {
    const frame = hostCodec.encode(msg);
    const back = clientCodec.decode(frame) as HostMessage;
    if (verify && back.t === 'snap') checkRoundTrip((msg as { s: Snapshot }).s, back.s);
    if (measuring) {
      const wb = typeof frame === 'string' ? Buffer.byteLength(frame) : frame.length;
      m.wire += wb;
      if (back.t === 'snap') {
        m.wireSnap += wb;
        m.peakWire = Math.max(m.peakWire, wb);
      }
      const b = byteSize(msg as object);
      m.bytes += b;
      m.msgs++;
      if ((msg as HostMessage).t === 'snap') {
        m.snapBytes += b;
        m.snaps++;
      }
    }
    send(msg);
  };
  return link;
}

/** Decoded v5 snapshot must equal the JSON one, except far entities (interest-culled). */
function checkRoundTrip(sent: Snapshot, got: Snapshot): void {
  checked++;
  const json = JSON.parse(JSON.stringify(sent)) as Snapshot;
  const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);
  const ok =
    same(json.players, got.players) &&
    same(json.pickups, got.pickups) &&
    same(json.wv, got.wv) &&
    same(json.sp, got.sp) &&
    json.tick === got.tick &&
    json.enemies.length === got.enemies.length &&
    json.projectiles.length === got.projectiles.length &&
    same(json.events, got.events);
  const me = json.players.find((p) => p.id === firstId);
  const near = (x: number, y: number) =>
    !me ||
    (Math.abs(x - me.x) <= NET.interest.halfWidth && Math.abs(y - me.y) <= NET.interest.halfHeight);
  let tuples = true;
  json.enemies.forEach((e, i) => {
    if (near(e[2], e[3]) && !same(e, got.enemies[i])) tuples = false;
  });
  json.projectiles.forEach((e, i) => {
    if (near(e[2], e[3]) && !same(e, got.projectiles[i])) tuples = false;
  });
  if (!ok || !tuples) {
    if (mismatches < 3) {
      console.error('round-trip mismatch at tick', json.tick, { ok, tuples });
      for (const k of ['players', 'pickups', 'wv', 'sp'] as const)
        if (!same(json[k], got[k]))
          console.error(
            k,
            JSON.stringify(json[k]).slice(0, 400),
            '\n vs',
            JSON.stringify(got[k]).slice(0, 400),
          );
      console.error(
        json.enemies.length,
        got.enemies.length,
        json.projectiles.length,
        got.projectiles.length,
        json.events.length,
        got.events.length,
      );
    }
    mismatches++;
  }
}
let firstId = -1;

const scheduler = new ManualScheduler();
const host = new HostSession({
  roomCode: 'LOAD',
  mode: 'p2p',
  scheduler,
  seed: () => 4242,
  snapshotEvery: EVERY,
  submitResult: async () => ({ status: 'local' }),
});
const clients: ClientSession[] = [];
let last: Snapshot | null = null;
const partBytes = { players: 0, enemies: 0, projectiles: 0, pickups: 0, events: 0, other: 0 };
let peak = { bytes: 0, enemies: 0, projectiles: 0 };
let sampled = 0;
for (let i = 0; i < N; i++) {
  const [h, c] = createLocalLinkPair(`c${i}`);
  const m: Meter = { bytes: 0, msgs: 0, snapBytes: 0, snaps: 0, wire: 0, wireSnap: 0, peakWire: 0 };
  meters.push(m);
  host.addLink(metered(h, m, i === 0));
  const s = new ClientSession(c, `Bot${i + 1}`);
  if (i === 0)
    s.on('snapshot', (snap) => {
      last = snap;
      if (!measuring) return;
      const total = Buffer.byteLength(codec.encode({ t: 'snap', s: snap }));
      let parts = 0;
      for (const k of ['players', 'enemies', 'projectiles', 'pickups', 'events'] as const) {
        const b = Buffer.byteLength(JSON.stringify(snap[k]));
        partBytes[k] += b;
        parts += b;
      }
      partBytes.other += total - parts;
      sampled++;
      if (total > peak.bytes)
        peak = { bytes: total, enemies: snap.enemies.length, projectiles: snap.projectiles.length };
    });
  clients.push(s);
  s.join();
  await macro();
}
firstId = clients[0].playerId;
clients[0].requestStart();
await macro();
if (host.phase !== 'playing') throw new Error('host did not start');

function botInput(world: World, id: number) {
  const p = world.players.find((x) => x.id === id)!;
  let best: { x: number; y: number; d: number } | null = null;
  for (const e of world.enemies) {
    const d = Math.hypot(e.x - p.x, e.y - p.y);
    if (!best || d < best.d) best = { x: e.x, y: e.y, d };
  }
  const aim = best ? Math.atan2(best.y - p.y, best.x - p.x) : p.aim;
  const t = world.time * 0.3 + id;
  const tx = ARENA.width / 2 + Math.cos(t) * 260;
  const ty = ARENA.height / 2 + Math.sin(t) * 200;
  const dx = tx - p.x;
  const dy = ty - p.y;
  const len = Math.hypot(dx, dy) || 1;
  const slot = Math.floor(world.time) % 20 === 0 ? 1 + (id % 4) : 0;
  return { mx: dx / len, my: dy / len, aim, fire: !!best && best.d < 900, slot, reload: false };
}

const world = host.world!;
let measureStart = 0;
let tickCount = 0;
const enemiesSeen: number[] = [];
while (world.time < MAX_SIM) {
  for (let i = 0; i < N; i++) clients[i].sendInput(botInput(world, clients[i].playerId));
  await macro();
  host.tick();
  tickCount++;
  for (const p of world.players) {
    p.hp = p.maxHp;
    if (p.state !== 'alive') {
      p.state = 'alive';
      p.downedTime = 0;
    }
    for (const w of p.weapons) p.ammo[w] = Math.max(p.ammo[w] ?? 0, 50);
  }
  if (!measuring && world.director.wave >= FROM_WAVE) {
    measuring = true;
    for (const k of Object.keys(wireStats) as Array<keyof typeof wireStats>) wireStats[k] = 0;
    wireStatsAt = meters[0].snaps;
    measureStart = world.time;
  }
  if (measuring) {
    enemiesSeen.push(world.enemies.length);
    if (world.time - measureStart >= WINDOW) break;
  }
  if (tickCount % 3000 === 0)
    console.error(
      `  t=${world.time.toFixed(0)}s wave ${world.director.wave} enemies ${world.enemies.length}`,
    );
}
await macro();
if (!measuring) throw new Error(`never reached wave ${FROM_WAVE} (wave ${world.director.wave})`);
const secs = world.time - measureStart;
const kbps = (b: number) => (b * 8) / 1000 / secs;
const total = meters.reduce((s, m) => s + m.bytes, 0);
const perClient = total / N;
const avgSnap = meters[0].snapBytes / Math.max(1, meters[0].snaps);
const avgEnemies = enemiesSeen.reduce((a, b) => a + b, 0) / Math.max(1, enemiesSeen.length);
console.log(`--- JSON snapshots (protocol v4 encoding), one per ${EVERY} tick(s) ---`);
console.log(
  `clients ${N}, window ${secs.toFixed(1)} s from wave ${FROM_WAVE} (reached wave ${world.director.wave})`,
);
console.log(`enemies on field: avg ${avgEnemies.toFixed(0)}, max ${Math.max(...enemiesSeen)}`);
console.log(`snapshots/s per client: ${(meters[0].snaps / secs).toFixed(1)}`);
console.log(
  `snapshot size: avg ${avgSnap.toFixed(0)} B, peak ${peak.bytes} B (${peak.enemies} enemies, ${peak.projectiles} projectiles)`,
);
const share = (k: keyof typeof partBytes) => `${k} ${(partBytes[k] / sampled) | 0} B`;
console.log(
  `  avg breakdown: ${(Object.keys(partBytes) as Array<keyof typeof partBytes>).map(share).join(', ')}`,
);
console.log(
  `host upload per client: ${(perClient / secs / 1024).toFixed(1)} KiB/s = ${kbps(perClient).toFixed(0)} kbit/s`,
);
console.log(
  `host upload total (${N} remote clients, dedicated/WS host): ${kbps(total).toFixed(0)} kbit/s = ${(kbps(total) / 1000).toFixed(2)} Mbit/s`,
);
console.log(
  `host upload total (P2P: host plays + ${N - 1} remote): ${kbps(perClient * (N - 1)).toFixed(0)} kbit/s = ${(kbps(perClient * (N - 1)) / 1000).toFixed(2)} Mbit/s`,
);
const wTotal = meters.reduce((s, m) => s + m.wire, 0);
const wPer = wTotal / N;
console.log('--- protocol v5 (binary delta snapshots + interest management) ---');
console.log(
  `snapshot size: avg ${(meters[0].wireSnap / Math.max(1, meters[0].snaps)).toFixed(0)} B, peak ${Math.max(...meters.map((m) => m.peakWire))} B`,
);
console.log(
  `host upload per client: ${(wPer / secs / 1024).toFixed(1)} KiB/s = ${kbps(wPer).toFixed(0)} kbit/s`,
);
console.log(
  `host upload total (${N} remote clients, dedicated/WS host): ${kbps(wTotal).toFixed(0)} kbit/s = ${(kbps(wTotal) / 1000).toFixed(2)} Mbit/s`,
);
console.log(
  `host upload total (P2P: host plays + ${N - 1} remote): ${kbps(wPer * (N - 1)).toFixed(0)} kbit/s = ${(kbps(wPer * (N - 1)) / 1000).toFixed(2)} Mbit/s`,
);
console.log(
  `  avg breakdown: ${Object.entries(wireStats)
    .map(([k, v]) => `${k} ${(v / Math.max(1, meters[0].snaps - wireStatsAt)) | 0} B`)
    .join(', ')}`,
);
console.log(
  `reduction: ${(total / wTotal).toFixed(1)}x; round-trip check: ${checked} snapshots, ${mismatches} mismatches`,
);
void last;
host.close();
process.exit(0);
