import cors from '@fastify/cors';
import Fastify, { type FastifyInstance } from 'fastify';
import { GAME_VERSION, PROTOCOL_VERSION } from '@sms/shared';
import type { ServerConfig } from './config.js';
import { highscoreRoutes } from './highscores/routes.js';
import type { HighscoreRepository } from './highscores/repository.js';

export interface AppDeps {
  config: ServerConfig;
  repo: HighscoreRepository;
  /** Live room count from the optional dedicated host. */
  roomCount?: () => number;
}

/** Builds the HTTP app (no listening) — used by index.ts and the API tests. */
export async function buildApp({ config, repo, roomCount }: AppDeps): Promise<FastifyInstance> {
  const app = Fastify({
    logger: config.logLevel === 'silent' ? false : { level: config.logLevel },
    trustProxy: true,
  });
  await app.register(cors, { origin: config.corsOrigin, methods: ['GET', 'POST', 'OPTIONS'] });

  app.get('/api/health', async () => ({
    ok: true,
    version: GAME_VERSION,
    protocol: PROTOCOL_VERSION,
    store: repo.kind,
    entries: await repo.count(),
    rooms: roomCount?.() ?? 0,
    uptimeSec: Math.round(process.uptime()),
  }));

  /** Tells clients which optional services this server offers. */
  app.get('/api/config', async () => ({
    version: GAME_VERSION,
    protocol: PROTOCOL_VERSION,
    peer:
      config.peerPort > 0
        ? { host: config.peerPublicHost, port: config.peerPort, path: config.peerPath }
        : null,
    wsGameHost: config.wsGameHost ? { path: '/ws' } : null,
  }));

  await app.register(highscoreRoutes, { repo, submitRatePerMinute: config.submitRatePerMinute });
  return app;
}
