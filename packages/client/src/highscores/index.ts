import { config } from '../config.js';
import { FallbackHighscoreStore } from './FallbackHighscoreStore.js';
import { HttpHighscoreStore } from './HttpHighscoreStore.js';
import { LocalHighscoreStore } from './LocalHighscoreStore.js';

export * from './HighscoreStore.js';
export { FallbackHighscoreStore, HttpHighscoreStore, LocalHighscoreStore };

/**
 * Default store: HTTP highscore server with localStorage fallback/cache, or a quiet
 * localStorage-only store when no server URL is configured (static deploys).
 */
export function createHighscoreStore(apiUrl = config.apiUrl): FallbackHighscoreStore {
  return new FallbackHighscoreStore(
    apiUrl ? new HttpHighscoreStore(apiUrl) : null,
    new LocalHighscoreStore(),
  );
}
