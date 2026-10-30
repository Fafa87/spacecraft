/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Base URL of the highscore API, e.g. https://scores.example.com (default: http://<page host>:8787). */
  readonly VITE_HIGHSCORE_URL?: string;
  /** Firebase web config for the Firestore leaderboard (public by design). */
  readonly VITE_FIREBASE_API_KEY?: string;
  /** Default display-name preset (see shared data/naming.ts). */
  readonly VITE_NAMES?: string;
  readonly VITE_FIREBASE_PROJECT_ID?: string;
  /** Firestore REST root override, e.g. http://127.0.0.1:8080/v1 (emulator). */
  readonly VITE_FIRESTORE_URL?: string;
  /** PeerJS signaling host override (default: from /api/config, else PeerJS cloud). */
  readonly VITE_PEER_HOST?: string;
  readonly VITE_PEER_PORT?: string;
  readonly VITE_PEER_PATH?: string;
  readonly VITE_PEER_SECURE?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
