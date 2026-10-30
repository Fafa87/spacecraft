import path from 'node:path';

export type StoreKind = 'json' | 'sqlite' | 'memory';

export interface ServerConfig {
  host: string;
  port: number;
  store: StoreKind;
  dataDir: string;
  corsOrigin: string | string[] | boolean;
  /** Enable the experimental dedicated WebSocket game host at /ws. */
  wsGameHost: boolean;
  /** Port for the bundled PeerJS signaling server (0 = disabled). */
  peerPort: number;
  peerPath: string;
  /** Public host clients should use for PeerJS (default: same host as the page). */
  peerPublicHost: string | null;
  /** Max highscore submissions per IP per minute. */
  submitRatePerMinute: number;
  logLevel: string;
}

const bool = (v: string | undefined, def: boolean) =>
  v === undefined ? def : !['0', 'false', 'no', 'off'].includes(v.toLowerCase());

export function loadConfig(env: NodeJS.ProcessEnv = process.env): ServerConfig {
  const cors = env.CORS_ORIGIN ?? '*';
  return {
    host: env.HOST ?? '0.0.0.0',
    port: parseInt(env.PORT ?? '8787', 10),
    store: (env.HIGHSCORE_STORE as StoreKind) ?? 'sqlite',
    dataDir: path.resolve(env.DATA_DIR ?? path.join(process.cwd(), 'data')),
    corsOrigin: cors === '*' ? true : cors.split(',').map((s) => s.trim()),
    wsGameHost: bool(env.WS_GAME_HOST, true),
    peerPort: parseInt(env.PEER_PORT ?? '9000', 10),
    peerPath: env.PEER_PATH ?? '/peerjs',
    peerPublicHost: env.PEER_PUBLIC_HOST ?? null,
    submitRatePerMinute: parseInt(env.SUBMIT_RATE_PER_MINUTE ?? '20', 10),
    logLevel: env.LOG_LEVEL ?? 'info',
  };
}
