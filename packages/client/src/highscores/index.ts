import { config } from '../config.js';
import { FallbackHighscoreStore } from './FallbackHighscoreStore.js';
import type { FirestoreConfig } from './firestore.js';
import { FirestoreHighscoreStore } from './FirestoreHighscoreStore.js';
import type { HighscoreStore } from './HighscoreStore.js';
import { HttpHighscoreStore } from './HttpHighscoreStore.js';
import { LocalHighscoreStore } from './LocalHighscoreStore.js';

export * from './HighscoreStore.js';
export { FallbackHighscoreStore, FirestoreHighscoreStore, HttpHighscoreStore, LocalHighscoreStore };

export type HighscoreBackend = 'firestore' | 'http' | 'local';

/** Which global board to use: Firestore if configured, else the HTTP server, else none. */
export function pickBackend(
  firebase: FirestoreConfig | null,
  apiUrl: string | null,
): HighscoreBackend {
  return firebase ? 'firestore' : apiUrl ? 'http' : 'local';
}

/**
 * Default store: the global board (Firestore REST or the HTTP highscore server) with a
 * localStorage fallback/cache, or a quiet localStorage-only store when neither is configured.
 */
export function createHighscoreStore(
  firebase: FirestoreConfig | null = config.firebase,
  apiUrl: string | null = config.apiUrl,
): FallbackHighscoreStore {
  const backend = pickBackend(firebase, apiUrl);
  const remote: HighscoreStore | null =
    backend === 'firestore' && firebase
      ? new FirestoreHighscoreStore(firebase)
      : backend === 'http' && apiUrl
        ? new HttpHighscoreStore(apiUrl)
        : null;
  return new FallbackHighscoreStore(remote, new LocalHighscoreStore());
}
