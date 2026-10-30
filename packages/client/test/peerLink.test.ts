import type { DataConnection } from 'peerjs';
import { ClientSession, HostSession, ManualScheduler, type Snapshot } from '@sms/shared';
import { describe, expect, it } from 'vitest';
import { PeerLink } from '../src/net/PeerLink.js';

type Handler = (d: unknown) => void;

/**
 * Two fake PeerJS DataConnections wired back to back. 'raw' mimics an RTCDataChannel with
 * binaryType 'arraybuffer' (strings stay strings, bytes arrive as a fresh ArrayBuffer);
 * 'json' mimics PeerJS JSON serialization (structured objects).
 */
function connPair(serialization: 'raw' | 'json') {
  const make = (id: string) => {
    const h: Record<string, Handler[]> = {};
    const conn = {
      connectionId: id,
      peer: id,
      serialization,
      open: true,
      peerConnection: undefined,
      sent: 0,
      bytes: 0,
      other: null as null | { emit: (ev: string, d?: unknown) => void },
      on(ev: string, cb: Handler) {
        (h[ev] ??= []).push(cb);
        return conn;
      },
      emit(ev: string, d?: unknown) {
        for (const cb of h[ev] ?? []) cb(d);
      },
      send(d: unknown) {
        if (serialization === 'raw' && typeof d !== 'string' && !(d instanceof Uint8Array))
          throw new TypeError('raw data channels carry strings or bytes only');
        conn.sent++;
        conn.bytes += typeof d === 'string' ? d.length : d instanceof Uint8Array ? d.length : 0;
        const wire =
          d instanceof Uint8Array
            ? d.slice().buffer
            : serialization === 'json'
              ? JSON.parse(JSON.stringify(d))
              : d;
        queueMicrotask(() => conn.other?.emit('data', wire));
      },
      close() {
        conn.open = false;
        conn.emit('close');
        conn.other?.emit('close');
      },
    };
    return conn;
  };
  const a = make('host');
  const b = make('guest');
  a.other = b;
  b.other = a;
  return [a, b] as const;
}

const flush = () => new Promise<void>((r) => setTimeout(r, 0));

async function run(serialization: 'raw' | 'json') {
  const scheduler = new ManualScheduler();
  const host = new HostSession({
    roomCode: 'PEER',
    mode: 'p2p',
    scheduler,
    seed: () => 99,
    submitResult: async () => ({ status: 'local' }),
  });
  const [h, g] = connPair(serialization);
  host.addLink(new PeerLink(h as unknown as DataConnection));
  const client = new ClientSession(new PeerLink(g as unknown as DataConnection), 'Guest');
  const snaps: Snapshot[] = [];
  client.on('snapshot', (s) => snaps.push(s));
  client.join();
  await flush();
  client.requestStart();
  await flush();
  for (let i = 0; i < 300; i++) {
    client.sendInput({ mx: 1, my: 0, aim: 0, fire: true, slot: 0, reload: false });
    await flush();
    host.tick();
    await flush();
  }
  return { host, client, snaps, conn: h };
}

describe('PeerLink (protocol v5 over PeerJS)', () => {
  it("carries binary delta snapshots over 'raw' data channels, lossless", async () => {
    const { host, snaps, conn } = await run('raw');
    expect(snaps.length).toBeGreaterThan(100);
    const last = snaps.at(-1)!;
    const world = host.world!;
    expect(last.players[0].x).toBeCloseTo(world.players[0].x, 1);
    expect(last.enemies.length).toBe(world.enemies.length);
    // snapshot frames are bytes, a fraction of the JSON size
    expect(conn.bytes / conn.sent).toBeLessThan(600);
  });

  it("still speaks plain objects to a 'json' (pre-v5) connection", async () => {
    const { snaps } = await run('json');
    expect(snaps.length).toBeGreaterThan(100);
  });
});
