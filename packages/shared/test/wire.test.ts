import { describe, expect, it } from 'vitest';
import { NET, TICK_DT } from '../src/constants.js';
import { codec, createWireCodec } from '../src/net/index.js';
import { applyInput, createWorld, emptyInput, stepWorld } from '../src/sim/index.js';
import { buildSnapshot, type Snapshot } from '../src/sim/snapshot.js';

const json = (v: unknown) => JSON.parse(JSON.stringify(v)) as unknown;

/** A busy 4-marine run, one snapshot per `every` ticks. */
function* snapshots(ticks: number, every = 1): Generator<Snapshot> {
  const w = createWorld(
    [1, 2, 3, 4].map((id) => ({ id, name: `M${id}` })),
    777,
  );
  for (let i = 0; i < ticks; i++) {
    for (const p of w.players) {
      p.hp = p.maxHp; // keep everyone alive and shooting
      applyInput(w, p.id, {
        ...emptyInput(),
        seq: i,
        mx: Math.sin(i / 40 + p.id),
        my: Math.cos(i / 55 + p.id),
        aim: i / 15 + p.id,
        fire: true,
      });
    }
    stepWorld(w, TICK_DT);
    if (i % every === 0) yield buildSnapshot(w, 60);
  }
}

const roundTrip = (
  host: ReturnType<typeof createWireCodec>,
  client: ReturnType<typeof createWireCodec>,
  msg: unknown,
) => client.decode(host.encode(msg));

describe('wire codec (protocol v5)', () => {
  it('is lossless vs JSON without interest management', () => {
    const host = createWireCodec();
    const client = createWireCodec();
    let binary = 0;
    let enemies = 0;
    for (const s of snapshots(1500, 2)) {
      const frame = host.encode({ t: 'snap', s });
      if (frame instanceof Uint8Array) binary++;
      enemies = Math.max(enemies, s.enemies.length);
      expect(client.decode(frame)).toEqual(json({ t: 'snap', s }));
    }
    expect(binary).toBe(750);
    expect(enemies).toBeGreaterThan(5);
  });

  it('keeps near entities exact and culled ones converging with interest management', () => {
    const host = createWireCodec();
    const client = createWireCodec();
    roundTrip(host, client, { t: 'welcome', playerId: 1 });
    roundTrip(host, client, { t: 'start' });
    let n = 0;
    for (const s of snapshots(1200)) {
      const got = roundTrip(host, client, { t: 'snap', s }) as { s: Snapshot };
      const want = json(s) as Snapshot;
      expect(got.s.players).toEqual(want.players);
      expect(got.s.events).toEqual(want.events);
      expect(got.s.enemies.map((e) => e[0])).toEqual(want.enemies.map((e) => e[0]));
      const me = want.players[0];
      want.enemies.forEach((e, i) => {
        const near =
          Math.abs(e[2] - me.x) <= NET.interest.halfWidth &&
          Math.abs(e[3] - me.y) <= NET.interest.halfHeight;
        if (near) expect(got.s.enemies[i]).toEqual(e);
        // culled rows are refreshed every farEvery snapshots: never far off
        if (!near)
          expect(Math.hypot(got.s.enemies[i][2] - e[2], got.s.enemies[i][3] - e[3])).toBeLessThan(
            120,
          );
      });
      n++;
    }
    expect(n).toBe(1200);
  });

  it('falls back to JSON for anything it cannot code exactly, without breaking the delta state', () => {
    const host = createWireCodec();
    const client = createWireCodec();
    const all = [...snapshots(300)];
    for (const s of all.slice(0, 100)) roundTrip(host, client, { t: 'snap', s });
    const odd = structuredClone(all[100]);
    odd.time = 1 / 3; // finer than the binary format's 1 ms
    const frame = host.encode({ t: 'snap', s: odd });
    expect(typeof frame).toBe('string');
    expect(client.decode(frame)).toEqual(json({ t: 'snap', s: odd }));
    for (const s of all.slice(101))
      expect(roundTrip(host, client, { t: 'snap', s })).toEqual(json({ t: 'snap', s }));
    // other messages are plain JSON (v4-compatible), and bytes decode too
    expect(host.encode({ t: 'lobby', x: 1 })).toBe('{"t":"lobby","x":1}');
    expect(client.decode(new TextEncoder().encode('{"t":"ping"}'))).toEqual({ t: 'ping' });
    expect(codec.decode('{"t":"ping"}')).toEqual({ t: 'ping' });
  });

  it('is several times smaller than JSON', () => {
    const host = createWireCodec();
    let a = 0;
    let b = 0;
    for (const s of snapshots(900)) {
      const f = host.encode({ t: 'snap', s });
      a += JSON.stringify({ t: 'snap', s }).length;
      b += typeof f === 'string' ? f.length : f.length;
    }
    expect(a / b).toBeGreaterThan(4);
  });
});
