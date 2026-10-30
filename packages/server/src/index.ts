import { buildApp } from './app.js';
import { loadConfig } from './config.js';
import { WsGameHost } from './gamehost/wsGameHost.js';
import { createRepository } from './highscores/createRepository.js';
import { startPeerServer } from './peer/peerServer.js';

async function main(): Promise<void> {
  const config = loadConfig();
  const repo = await createRepository(config.store, config.dataDir);
  let gameHost: WsGameHost | null = null;
  const app = await buildApp({ config, repo, roomCount: () => gameHost?.rooms.size ?? 0 });

  if (config.wsGameHost) {
    gameHost = new WsGameHost(app.server, {
      submitResult: async (r) => {
        const res = await repo.add(r);
        return { status: 'server', rank: res.rank };
      },
      log: (...a) => app.log.info(a.join(' ')),
    });
  }

  await app.listen({ host: config.host, port: config.port });
  app.log.info(`Highscore API on http://localhost:${config.port}/api (store: ${repo.kind}, data: ${config.dataDir})`);

  const peer = config.peerPort > 0 ? startPeerServer(config.peerPort, config.peerPath, (m) => app.log.info(m)) : null;

  const shutdown = async (signal: string) => {
    app.log.info(`${signal} received, shutting down`);
    gameHost?.close();
    peer?.close();
    await app.close();
    await repo.close();
    process.exit(0);
  };
  process.on('SIGINT', () => void shutdown('SIGINT'));
  process.on('SIGTERM', () => void shutdown('SIGTERM'));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
