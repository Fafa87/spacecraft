/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Base URL of the highscore API, e.g. https://scores.example.com (default: http://<page host>:8787). */
  readonly VITE_HIGHSCORE_URL?: string;
  /** PeerJS signaling host override (default: from /api/config, else PeerJS cloud). */
  readonly VITE_PEER_HOST?: string;
  readonly VITE_PEER_PORT?: string;
  readonly VITE_PEER_PATH?: string;
  readonly VITE_PEER_SECURE?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
