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
  /** TURN relay for P2P (see net/ice.ts): credentials endpoint returning iceServers JSON. */
  readonly VITE_TURN_CREDENTIALS_URL?: string;
  /** JSON RTCIceServer[] used for P2P. */
  readonly VITE_ICE_SERVERS?: string;
  /** Comma-separated turn:/turns: URLs + static credentials. */
  readonly VITE_TURN_URLS?: string;
  readonly VITE_TURN_USERNAME?: string;
  readonly VITE_TURN_CREDENTIAL?: string;
  /** Short sha of an unversioned /dev/ preview build (scripts/deploy-dev.ts); unset otherwise. */
  readonly VITE_DEV_PREVIEW?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
