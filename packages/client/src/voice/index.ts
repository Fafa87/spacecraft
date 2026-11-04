/**
 * Voice-chat prototype entry point — the ONLY voice file the game imports. Off by default:
 * `?voice=1` turns it on (remembered in localStorage, `?voice=0` turns it off). When off,
 * nothing else of the voice code is loaded (VoiceOverlay/VoiceChat are a lazy chunk).
 */
import type { GameConnection } from '../net/connection.js';
import { voiceFlag } from './core.js';

const KEY = 'sms.voice';

export function voiceRequested(): boolean {
  let stored: string | null = null;
  try {
    stored = localStorage.getItem(KEY);
  } catch {
    /* private mode */
  }
  const f = voiceFlag(location.search, stored);
  try {
    if (f.store === '1') localStorage.setItem(KEY, '1');
    else if (f.store === null) localStorage.removeItem(KEY);
  } catch {
    /* ignore */
  }
  return f.on;
}

/** Shows the voice HUD for a P2P room; returns its cleanup (safe to call before it loaded). */
export function attachVoice(conn: GameConnection): () => void {
  if (conn.mode !== 'p2p' || !voiceRequested()) return () => {};
  let disposed = false;
  let dispose: (() => void) | null = null;
  import('./VoiceOverlay.js')
    .then((m) => {
      if (!disposed)
        dispose = m.mountVoiceOverlay({ roomCode: conn.roomCode, name: conn.session.name });
    })
    .catch((e) => console.warn('[voice] failed to load', e));
  return () => {
    disposed = true;
    dispose?.();
  };
}
