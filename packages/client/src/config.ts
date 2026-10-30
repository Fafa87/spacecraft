/**
 * Runtime configuration: build-time env (VITE_*) + URL params + /api/config
 * discovery from the highscore server.
 *   ?api=http://host:8787   override highscore server
 *   ?join=CODE              prefill join code
 *   ?ws=1                   use the experimental dedicated WebSocket host instead of P2P
 */
const params = new URLSearchParams(location.search);

function defaultApiUrl(): string {
  const host = location.hostname || 'localhost';
  const proto = location.protocol === 'https:' ? 'https:' : 'http:';
  return `${proto}//${host}:8787`;
}

export const config = {
  apiUrl: (params.get('api') ?? import.meta.env.VITE_HIGHSCORE_URL ?? defaultApiUrl()).replace(/\/$/, ''),
  joinCode: params.get('join') ?? '',
  useDedicatedHost: params.get('ws') === '1',
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

/** Fetches /api/config once (null if the server is unreachable). */
export function getServerInfo(): Promise<ServerInfo | null> {
  serverInfo ??= fetch(`${config.apiUrl}/api/config`, { signal: AbortSignal.timeout(2500) })
    .then((r) => (r.ok ? (r.json() as Promise<ServerInfo>) : null))
    .catch(() => null);
  return serverInfo;
}
