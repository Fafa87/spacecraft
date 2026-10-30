import { prefs } from '../ui/prefs.js';
import Peer, { type PeerOptions } from 'peerjs';
import {
  ClientSession,
  createLocalLinkPair,
  HostSession,
  makeRoomCode,
  normalizeRoomCode,
  type RunMode,
  type RunResult,
  type SubmitStatus,
} from '@sms/shared';
import { config, getServerInfo } from '../config.js';
import { PeerLink } from './PeerLink.js';
import { BrowserWsLink } from './WsLink.js';

/**
 * A live connection to a game room. The UI only ever talks to `session`
 * (ClientSession); `host` exists when this browser is the host.
 */
export interface GameConnection {
  mode: RunMode;
  roomCode: string;
  session: ClientSession;
  host: HostSession | null;
  close(): void;
}

export type SubmitFn = (r: RunResult) => Promise<{ status: SubmitStatus; rank?: number }>;

const PEER_PREFIX = 'sms-v1-';
const peerIdFor = (code: string) => `${PEER_PREFIX}${code}`;

/** Solo play: host + client in the same tab over an in-memory link. */
export function createLocalGame(name: string, submit: SubmitFn): GameConnection {
  const host = new HostSession({
    roomCode: 'SOLO',
    mode: 'local',
    maxPlayers: 1,
    submitResult: submit,
  });
  const [hostSide, clientSide] = createLocalLinkPair('local');
  host.addLink(hostSide);
  const session = new ClientSession(clientSide, name, prefs.chapter());
  session.join();
  return {
    mode: 'local',
    roomCode: 'SOLO',
    session,
    host,
    close: () => (session.close(), host.close()),
  };
}

async function peerOptions(): Promise<PeerOptions> {
  const base: PeerOptions = { debug: config.debug ? 2 : 0 };
  if (config.peerOverride) return { ...base, ...config.peerOverride };
  // The self-hosted signaling server (from /api/config) is only used in dev; production
  // builds use the public PeerJS cloud unless VITE_PEER_HOST points elsewhere.
  const info = import.meta.env.DEV ? await getServerInfo() : null;
  if (info?.peer) {
    return {
      ...base,
      host: info.peer.host ?? location.hostname,
      port: info.peer.port,
      path: info.peer.path,
      secure: location.protocol === 'https:',
    };
  }
  return base; // PeerJS public cloud (0.peerjs.com)
}

function openPeer(id: string | undefined, opts: PeerOptions): Promise<Peer> {
  return new Promise((resolve, reject) => {
    const peer = id ? new Peer(id, opts) : new Peer(opts);
    const timer = setTimeout(() => {
      peer.destroy();
      reject(new Error('Could not reach the PeerJS signaling server.'));
    }, 8000);
    peer.once('open', () => {
      clearTimeout(timer);
      resolve(peer);
    });
    peer.once('error', (err) => {
      clearTimeout(timer);
      peer.destroy();
      reject(err);
    });
  });
}

/** Host a P2P room in this browser. Other players connect over WebRTC. */
export async function hostPeerGame(name: string, submit: SubmitFn): Promise<GameConnection> {
  const opts = await peerOptions();
  let peer: Peer | null = null;
  let code = '';
  for (let attempt = 0; attempt < 5 && !peer; attempt++) {
    code = makeRoomCode();
    try {
      peer = await openPeer(peerIdFor(code), opts);
    } catch (err) {
      if ((err as { type?: string }).type !== 'unavailable-id') throw err;
    }
  }
  if (!peer) throw new Error('Could not allocate a room code, try again.');
  const host = new HostSession({
    roomCode: code,
    mode: 'p2p',
    submitResult: submit,
    log: (...a) => console.info(...a),
  });
  peer.on('connection', (conn) => {
    conn.on('open', () => host.addLink(new PeerLink(conn)));
  });
  peer.on('disconnected', () => {
    // Lost the signaling server: existing WebRTC connections keep working, but new joins need it.
    if (!peer!.destroyed) peer!.reconnect();
  });
  const [hostSide, clientSide] = createLocalLinkPair('host-local');
  host.addLink(hostSide);
  const session = new ClientSession(clientSide, name, prefs.chapter());
  session.join();
  return {
    mode: 'p2p',
    roomCode: code,
    session,
    host,
    close: () => {
      host.close();
      session.close();
      peer!.destroy();
    },
  };
}

/** Join someone else's P2P room by code. */
export async function joinPeerGame(rawCode: string, name: string): Promise<GameConnection> {
  const code = normalizeRoomCode(rawCode);
  if (code.length < 4) throw new Error('Enter a valid room code.');
  const peer = await openPeer(undefined, await peerOptions());
  const conn = peer.connect(peerIdFor(code), { reliable: true, serialization: 'raw' });
  await new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`Room ${code} not found (timed out).`)), 10000);
    conn.on('open', () => {
      clearTimeout(timer);
      resolve();
    });
    peer.on('error', (err) => {
      clearTimeout(timer);
      reject(
        (err as { type?: string }).type === 'peer-unavailable'
          ? new Error(`Room ${code} not found.`)
          : err,
      );
    });
  }).catch((err) => {
    peer.destroy();
    throw err;
  });
  const session = new ClientSession(new PeerLink(conn), name, prefs.chapter());
  session.join();
  return {
    mode: 'p2p',
    roomCode: code,
    session,
    host: null,
    close: () => (session.close(), peer.destroy()),
  };
}

/** EXPERIMENTAL: create/join a room on the dedicated WebSocket host (?ws=1). */
export async function connectDedicated(name: string, rawCode?: string): Promise<GameConnection> {
  const info = await getServerInfo();
  if (!config.apiUrl || !info?.wsGameHost)
    throw new Error('Dedicated host not available on the server.');
  const url = new URL(config.apiUrl.replace(/^http/, 'ws') + info.wsGameHost.path);
  if (rawCode) url.searchParams.set('room', normalizeRoomCode(rawCode));
  else url.searchParams.set('create', '1');
  const ws = new WebSocket(url);
  await new Promise<void>((resolve, reject) => {
    ws.addEventListener('open', () => resolve(), { once: true });
    ws.addEventListener(
      'error',
      () =>
        reject(new Error(rawCode ? 'Room not found.' : 'Could not connect to the dedicated host.')),
      { once: true },
    );
  });
  const session = new ClientSession(new BrowserWsLink(ws), name, prefs.chapter());
  const welcomed = new Promise<string>((resolve) => session.on('welcome', (w) => resolve(w.room)));
  session.join();
  const roomCode = await welcomed;
  return { mode: 'dedicated', roomCode, session, host: null, close: () => session.close() };
}
