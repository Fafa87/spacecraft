/**
 * Runtime configuration: build-time env (VITE_*) + URL params + /api/config
 * discovery from the highscore server.
 *   ?api=http://host:8787   override highscore server
 *   ?join=CODE              prefill join code
 *   ?ws=1                   use the experimental dedicated WebSocket host instead of P2P
 */
const params = new URLSearchParams(location.search);

/** Dev default: the highscore server started by `npm run dev` on the page host, port 8787. */
function devApiUrl(): string {
  const host = location.hostname || 'localhost';
  const proto = location.protocol === 'https:' ? 'https:' : 'http:';
  return `${proto}//${host}:8787`;
}

/**
 * Highscore server base URL, or null when none is configured. Production builds only talk to
 * a server when VITE_HIGHSCORE_URL is set at build time (or ?api=... is passed); otherwise the
 * game runs fully static with local (browser) highscores.
 */
function resolveApiUrl(): string | null {
  const raw =
    params.get('api') ??
    import.meta.env.VITE_HIGHSCORE_URL ??
    (import.meta.env.DEV ? devApiUrl() : '');
  const url = raw.trim().replace(/\/$/, '');
  return url || null;
}

const apiUrl = resolveApiUrl();

export const config = {
  apiUrl,
  /** False on a static deploy: local-only highscores, no dedicated WS host. */
  hasServer: apiUrl !== null,
  joinCode: params.get('join') ?? '',
  /** ?ws=1 picks the dedicated WebSocket host; ignored when no server is configured. */
  useDedicatedHost: apiUrl !== null && params.get('ws') === '1',
  debug: params.get('debug') === '1',
  /** Auto-start a solo run (used by the headless browser smoke test). */
  autoSolo: params.get('autosolo') === '1',
  autoName: params.get('name') ?? '',
  peerOverride: import.meta.env.VITE_PEER_HOST
    ? {
        host: import.meta.env.VITE_PEER_HOST,
        port: Number(import.meta.env.VITE_PEER_PORT ?? 443),
        path: import.meta.env.VITE_PEER_PATH ?? '/',
        secure: (import.meta.env.VITE_PEER_SECURE ?? 'true') !== 'false',
      }
    : null,
};

export interface ServerInfo {
  version: string;
  protocol: number;
  peer: { host: string | null; port: number; path: string } | null;
  wsGameHost: { path: string } | null;
}

let serverInfo: Promise<ServerInfo | null> | null = null;

/** Fetches /api/config once (null if no server is configured or it is unreachable). */
export function getServerInfo(): Promise<ServerInfo | null> {
  if (!config.apiUrl) return Promise.resolve(null);
  serverInfo ??= fetch(`${config.apiUrl}/api/config`, { signal: AbortSignal.timeout(2500) })
    .then((r) => (r.ok ? (r.json() as Promise<ServerInfo>) : null))
    .catch(() => null);
  return serverInfo;
}
