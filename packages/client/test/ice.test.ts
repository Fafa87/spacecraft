import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  hasTurn,
  iceServers,
  parseIceServers,
  resetIceCache,
  staticIceServers,
  withStun,
} from '../src/net/ice.js';
import { classifyPeerError, joinErrorMessage } from '../src/net/joinErrors.js';

describe('ICE servers', () => {
  afterEach(() => {
    resetIceCache();
    vi.unstubAllGlobals();
  });

  it('never relies on the discontinued PeerJS TURN relay; STUN is always present', async () => {
    const s = await iceServers({});
    const all = JSON.stringify(s);
    expect(all).not.toContain('turn.peerjs.com');
    expect(all).toContain('stun:stun.l.google.com:19302');
    expect(hasTurn(s)).toBe(false);
  });

  it('parses env JSON and static TURN credentials', () => {
    expect(
      staticIceServers({
        iceServersJson: '[{"urls":"turns:t.example:443","username":"u","credential":"c"}]',
      }),
    ).toEqual([{ urls: 'turns:t.example:443', username: 'u', credential: 'c' }]);
    expect(staticIceServers({ iceServersJson: 'nope' })).toEqual([]);
    const s = staticIceServers({
      turnUrls: 'turn:a:80, turns:a:443?transport=tcp',
      turnUsername: 'u',
      turnCredential: 'p',
    });
    expect(s).toEqual([
      { urls: ['turn:a:80', 'turns:a:443?transport=tcp'], username: 'u', credential: 'p' },
    ]);
    expect(hasTurn(withStun(s))).toBe(true);
  });

  it('accepts iceServers arrays, {iceServers} objects and single servers', () => {
    const one = { urls: 'turn:x:3478', username: 'a', credential: 'b' };
    expect(parseIceServers([one, { bogus: 1 }])).toEqual([one]);
    expect(parseIceServers({ iceServers: [one] })).toEqual([one]);
    expect(parseIceServers({ iceServers: one })).toEqual([one]);
    expect(parseIceServers(one)).toEqual([one]);
    expect(parseIceServers(null)).toEqual([]);
  });

  it('fetches relay credentials from an endpoint (e.g. Metered) and falls back on failure', async () => {
    const turn = { urls: 'turn:global.relay.metered.ca:80', username: 'u', credential: 'c' };
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(JSON.stringify([turn]))),
    );
    const s = await iceServers({
      credentialsUrl: 'https://x.metered.live/api/v1/turn/credentials?apiKey=k',
    });
    expect(s.at(-1)).toEqual(turn);
    expect(hasTurn(s)).toBe(true);
    resetIceCache();
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new Error('offline');
      }),
    );
    const f = await iceServers({ credentialsUrl: 'https://down', turnUrls: 'turn:b:3478' });
    expect(hasTurn(f)).toBe(true);
  });
});

describe('join error messages', () => {
  it('maps PeerJS error types', () => {
    expect(classifyPeerError('peer-unavailable')).toBe('not-found');
    expect(classifyPeerError('network')).toBe('signaling');
    expect(classifyPeerError('server-error')).toBe('signaling');
    expect(classifyPeerError('negotiation-failed')).toBe('ice-failed');
    expect(classifyPeerError('browser-incompatible')).toBe('unsupported');
    expect(classifyPeerError('whatever')).toBeNull();
  });
  it('explains each failure in Polish', () => {
    expect(joinErrorMessage('not-found', 'ABCD', false)).toMatch(/Nie znaleziono pokoju ABCD/);
    expect(joinErrorMessage('ice-failed', 'ABCD', false)).toMatch(/danych komórkowych/);
    expect(joinErrorMessage('ice-failed', 'ABCD', true)).toMatch(/TURN/);
    expect(joinErrorMessage('signaling', 'ABCD', false)).toMatch(/serwerem parowania/);
  });
});
