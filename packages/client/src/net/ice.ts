/**
 * ICE servers for the P2P (PeerJS / WebRTC) connections.
 *
 * Why this exists: PeerJS's built-in config points at its free public TURN relay
 * (eu-0/us-0.turn.peerjs.com), which PeerJS has discontinued. Phones on mobile data sit behind
 * carrier-grade (symmetric) NAT, where STUN alone cannot open a direct path, so phone-to-phone
 * joins over 4G/5G time out unless a working TURN relay is configured.
 *
 * Sources (first match wins, STUN is always kept):
 *  - `VITE_TURN_CREDENTIALS_URL` (build time) or `?turnApi=` : a URL returning an `iceServers`
 *    array (or `{ iceServers }`), e.g. Metered's free TURN
 *    `https://<app>.metered.live/api/v1/turn/credentials?apiKey=<key>`; fetched once, 4 s timeout.
 *  - `VITE_ICE_SERVERS` (build time): a JSON `RTCIceServer[]`.
 *  - `VITE_TURN_URLS` (comma separated) + `VITE_TURN_USERNAME` + `VITE_TURN_CREDENTIAL`.
 * Without any of them only public STUN servers are used (works on Wi-Fi / most home NATs).
 */

/** Public STUN servers (address discovery only, no relay). */
export const STUN_SERVERS: RTCIceServer[] = [
  { urls: ['stun:stun.l.google.com:19302', 'stun:stun1.l.google.com:19302'] },
  { urls: 'stun:stun.cloudflare.com:3478' },
];

export interface IceEnv {
  credentialsUrl?: string;
  iceServersJson?: string;
  turnUrls?: string;
  turnUsername?: string;
  turnCredential?: string;
}

/** Normalises whatever a TURN credential endpoint / env JSON returned into RTCIceServer[]. */
export function parseIceServers(raw: unknown): RTCIceServer[] {
  const list = Array.isArray(raw)
    ? raw
    : raw && typeof raw === 'object' && 'iceServers' in raw
      ? (raw as { iceServers: unknown }).iceServers
      : raw && typeof raw === 'object' && 'urls' in raw
        ? [raw]
        : [];
  const arr = Array.isArray(list) ? list : [list];
  return arr.filter(
    (s): s is RTCIceServer =>
      !!s &&
      typeof s === 'object' &&
      (typeof (s as RTCIceServer).urls === 'string' || Array.isArray((s as RTCIceServer).urls)),
  );
}

const urlsOf = (s: RTCIceServer) => (Array.isArray(s.urls) ? s.urls : [s.urls]);
export const hasTurn = (servers: RTCIceServer[]) =>
  servers.some((s) => urlsOf(s).some((u) => /^turns?:/.test(u)));

/** Static (no fetch) part: env JSON or TURN url/user/credential. */
export function staticIceServers(env: IceEnv): RTCIceServer[] {
  if (env.iceServersJson?.trim()) {
    try {
      return parseIceServers(JSON.parse(env.iceServersJson));
    } catch {
      console.warn('[ice] VITE_ICE_SERVERS is not valid JSON, ignored');
    }
  }
  const urls = (env.turnUrls ?? '')
    .split(',')
    .map((u) => u.trim())
    .filter(Boolean);
  if (urls.length)
    return [{ urls, username: env.turnUsername ?? '', credential: env.turnCredential ?? '' }];
  return [];
}

/** STUN first, then the configured relays; STUN entries already present are not repeated. */
export function withStun(servers: RTCIceServer[]): RTCIceServer[] {
  const extra = servers.filter((s) => !urlsOf(s).every((u) => /^stun:/.test(u)));
  return [...STUN_SERVERS, ...extra];
}

let cached: Promise<RTCIceServer[]> | null = null;

export function readIceEnv(): IceEnv {
  const params = new URLSearchParams(location.search);
  return {
    credentialsUrl:
      params.get('turnApi')?.trim() || import.meta.env.VITE_TURN_CREDENTIALS_URL?.trim(),
    iceServersJson: import.meta.env.VITE_ICE_SERVERS,
    turnUrls: import.meta.env.VITE_TURN_URLS,
    turnUsername: import.meta.env.VITE_TURN_USERNAME,
    turnCredential: import.meta.env.VITE_TURN_CREDENTIAL,
  };
}

/** The ICE servers for a new Peer (cached; never rejects). */
export function iceServers(env: IceEnv = readIceEnv()): Promise<RTCIceServer[]> {
  cached ??= (async () => {
    if (env.credentialsUrl) {
      try {
        const r = await fetch(env.credentialsUrl, { signal: AbortSignal.timeout(4000) });
        if (r.ok) {
          const got = parseIceServers(await r.json());
          if (got.length) return withStun(got);
        }
        console.warn('[ice] TURN credentials endpoint returned nothing usable', r.status);
      } catch (e) {
        console.warn('[ice] TURN credentials endpoint failed', e);
      }
    }
    return withStun(staticIceServers(env));
  })();
  return cached;
}

/** Test hook. */
export function resetIceCache(): void {
  cached = null;
}

/** `?relay=1`: iceTransportPolicy 'relay' — only TURN candidates, proves the relay works. */
export function forceRelay(
  search: string = typeof location === 'undefined' ? '' : location.search,
): boolean {
  return new URLSearchParams(search).get('relay') === '1';
}
