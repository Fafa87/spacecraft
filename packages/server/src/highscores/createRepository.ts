import path from 'node:path';
import type { StoreKind } from '../config.js';
import { JsonFileHighscoreRepository } from './jsonFileRepository.js';
import { MemoryHighscoreRepository } from './memoryRepository.js';
import type { HighscoreRepository } from './repository.js';
import { SqliteHighscoreRepository } from './sqliteRepository.js';

export async function createRepository(
  kind: StoreKind,
  dataDir: string,
): Promise<HighscoreRepository> {
  let repo: HighscoreRepository;
  switch (kind) {
    case 'memory':
      repo = new MemoryHighscoreRepository();
      break;
    case 'json':
      repo = new JsonFileHighscoreRepository(path.join(dataDir, 'highscores.json'));
      break;
    case 'sqlite':
      repo = new SqliteHighscoreRepository(path.join(dataDir, 'highscores.sqlite'));
      break;
    default:
      throw new Error(`Unknown HIGHSCORE_STORE '${kind as string}' (use sqlite | json | memory)`);
  }
  await repo.init();
  return repo;
}
