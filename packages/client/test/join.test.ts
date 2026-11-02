import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

type Handler = (d?: unknown) => void;
class Emitter {
  h: Record<string, Handler[]> = {};
  on(ev: string, cb: Handler) {
    (this.h[ev] ??= []).push(cb);
    return this;
  }
  once(ev: string, cb: Handler) {
    const w: Handler = (d) => {
      this.off(ev, w);
      cb(d);
    };
    return this.on(ev, w);
  }
  off(ev: string, cb: Handler) {
    this.h[ev] = (this.h[ev] ?? []).filter((x) => x !== cb);
    return this;
  }
  emit(ev: string, d?: unknown) {
    for (const cb of [...(this.h[ev] ?? [])]) cb(d);
  }
}

class FakePc extends EventTarget {
  iceConnectionState = 'new';
  setIce(st: string) {
    this.iceConnectionState = st;
    this.dispatchEvent(new Event('iceconnectionstatechange'));
  }
}
class FakeConn extends Emitter {
  serialization = 'raw';
  open = false;
  peerConnection = new FakePc();
  closed = false;
  send() {}
  close() {
    this.closed = true;
  }
}

/** Scripted behaviour of each `peer.connect()` call. */
let script: ((peer: FakePeer, conn: FakeConn) => void)[] = [];
let lastOptions: unknown;
let peers: FakePeer[] = [];
class FakePeer extends Emitter {
  destroyed = false;
  disconnected = false;
  conns: FakeConn[] = [];
  constructor(...args: unknown[]) {
    super();
    lastOptions = args.at(-1);
    peers.push(this);
    setTimeout(() => this.emit('open', 'me'), 0);
  }
  connect() {
    const c = new FakeConn();
    this.conns.push(c);
    const step = script.shift();
    setTimeout(() => step?.(this, c), 0);
    return c;
  }
  destroy() {
    this.destroyed = true;
  }
}
vi.mock('peerjs', () => ({ default: FakePeer }));
vi.stubGlobal('location', new URL('https://example.test/spacecraft/v0.5.2/'));
vi.stubGlobal('RTCPeerConnection', class {});
// no dev highscore/signaling server in tests
vi.stubGlobal('fetch', async () => {
  throw new Error('offline');
});

const { joinPeerGame } = await import('../src/net/connection.js');
const { JoinError } = await import('../src/net/joinErrors.js');
const { resetIceCache } = await import('../src/net/ice.js');

const notFound = (p: FakePeer) =>
  p.emit('error', Object.assign(new Error('x'), { type: 'peer-unavailable' }));

describe('joinPeerGame', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    script = [];
    peers = [];
    resetIceCache();
  });
  afterEach(() => vi.useRealTimers());

  it('passes explicit ICE servers (STUN at least) to PeerJS', async () => {
    script = [(_, c) => ((c.open = true), c.emit('open'))];
    const p = joinPeerGame('ABCD', 'Marine');
    await vi.advanceTimersByTimeAsync(10);
    await p;
    const cfg = (lastOptions as { config: RTCConfiguration }).config;
    expect(JSON.stringify(cfg.iceServers)).toContain('stun:stun.l.google.com:19302');
    expect(cfg.iceTransportPolicy).toBeUndefined();
  });

  it('?relay=1 forces TURN-only (iceTransportPolicy relay)', async () => {
    vi.stubGlobal('location', new URL('https://example.test/spacecraft/?relay=1'));
    script = [(_, c) => c.emit('open')];
    const p = joinPeerGame('ABCD', 'Marine');
    await vi.advanceTimersByTimeAsync(10);
    await p;
    expect((lastOptions as { config: RTCConfiguration }).config.iceTransportPolicy).toBe('relay');
    vi.stubGlobal('location', new URL('https://example.test/spacecraft/v0.5.2/'));
  });

  it('retries "room not found" while the host re-registers, then connects', async () => {
    const progress: string[] = [];
    script = [(p) => notFound(p), (p) => notFound(p), (_, c) => c.emit('open')];
    const p = joinPeerGame('abcd', 'Marine', (m) => progress.push(m));
    await vi.advanceTimersByTimeAsync(5000);
    const conn = await p;
    expect(conn.roomCode).toBe('ABCD');
    expect(peers[0]!.conns).toHaveLength(3);
    expect(peers[0]!.conns[0]!.closed).toBe(true);
    expect(progress.at(-1)).toMatch(/Połączono/);
  });

  it('gives up with a clear "room not found" after the retry window', async () => {
    script = Array.from({ length: 20 }, () => (p: FakePeer) => notFound(p));
    const p = joinPeerGame('ABCD', 'Marine');
    const err = expect(p).rejects.toMatchObject({ kind: 'not-found' });
    await vi.advanceTimersByTimeAsync(20000);
    await err;
    await expect(p).rejects.toThrow(/Nie znaleziono pokoju ABCD/);
    expect(peers[0]!.destroyed).toBe(true);
  });

  it('reports a NAT / ICE failure when PeerJS negotiation fails on the connection', async () => {
    script = [
      (_, c) => {
        c.peerConnection.setIce('checking');
        c.emit(
          'error',
          Object.assign(new Error('Negotiation of connection to sms-v1-ABCD failed.'), {
            type: 'negotiation-failed',
          }),
        );
      },
    ];
    const p = joinPeerGame('ABCD', 'Marine');
    const err = expect(p).rejects.toBeInstanceOf(JoinError);
    await vi.advanceTimersByTimeAsync(10);
    await err;
    await expect(p).rejects.toMatchObject({ kind: 'ice-failed' });
    await expect(p).rejects.toThrow(/Wi-Fi/);
  });

  it('reports ICE "failed" seen on the RTCPeerConnection', async () => {
    script = [(_, c) => (c.peerConnection.setIce('checking'), c.peerConnection.setIce('failed'))];
    const p = joinPeerGame('ABCD', 'Marine');
    const err = expect(p).rejects.toMatchObject({ kind: 'ice-failed' });
    await vi.advanceTimersByTimeAsync(10);
    await err;
  });

  it('times out as an ICE failure when the host answered but no path opened', async () => {
    script = [(_, c) => c.peerConnection.setIce('checking')];
    const p = joinPeerGame('ABCD', 'Marine');
    const err = expect(p).rejects.toMatchObject({ kind: 'ice-failed' });
    await vi.advanceTimersByTimeAsync(31000);
    await err;
  });

  it('times out generically when nothing happens', async () => {
    script = [() => {}];
    const p = joinPeerGame('ABCD', 'Marine');
    const err = expect(p).rejects.toMatchObject({ kind: 'timeout' });
    await vi.advanceTimersByTimeAsync(31000);
    await err;
  });

  it('reports the signaling server being unreachable', async () => {
    script = [
      (p) => p.emit('error', Object.assign(new Error('Lost connection'), { type: 'network' })),
    ];
    const p = joinPeerGame('ABCD', 'Marine');
    const err = expect(p).rejects.toMatchObject({ kind: 'signaling' });
    await vi.advanceTimersByTimeAsync(10);
    await err;
    await expect(p).rejects.toThrow(/serwerem parowania/);
  });
});
