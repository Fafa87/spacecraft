import { config } from '../config.js';
import { FallbackHighscoreStore } from './FallbackHighscoreStore.js';
import { HttpHighscoreStore } from './HttpHighscoreStore.js';
import { LocalHighscoreStore } from './LocalHighscoreStore.js';

export * from './HighscoreStore.js';
export { FallbackHighscoreStore, HttpHighscoreStore, LocalHighscoreStore };

/** Default store: HTTP highscore server with localStorage fallback/cache. */
export function createHighscoreStore(apiUrl = config.apiUrl): FallbackHighscoreStore {
  return new FallbackHighscoreStore(new HttpHighscoreStore(apiUrl), new LocalHighscoreStore());
}
