/**
 * Voice-chat entry point — the ONLY voice file the game imports. Opt-in per room: the host
 * flips CZAT GŁOSOWY in the squad room and the lobby message carries `voice: true` to
 * everyone; then the overlay (a lazy chunk with VoiceOverlay/VoiceChat) is loaded and shown,
 * and each player taps "🎙 GŁOS" to grant the mic (or listens only). While it is off nothing
 * of the voice code is loaded. `?voice=1` = dev override for this tab only (see voiceWanted).
 */
import type { GameConnection } from '../net/connection.js';
import { voiceWanted } from './core.js';

/** Follows the room's voice opt-in; returns the cleanup (safe to call before it loaded). */
export function attachVoice(conn: GameConnection): () => void {
  if (conn.mode !== 'p2p') return () => {};
  try {
    localStorage.removeItem('sms.voice'); // the prototype's remembered flag is gone
  } catch {
    /* private mode */
  }
  let disposed = false;
  let mounted = false;
  let dispose: (() => void) | null = null;
  const unmount = () => {
    mounted = false;
    dispose?.();
    dispose = null;
  };
  const sync = () => {
    const want = voiceWanted(conn.mode, conn.session.lobby?.voice, location.search);
    if (want === mounted || disposed) return;
    if (!want) return unmount();
    mounted = true;
    import('./VoiceOverlay.js')
      .then((m) => {
        if (disposed || !mounted || dispose) return;
        dispose = m.mountVoiceOverlay({ roomCode: conn.roomCode, name: conn.session.name });
      })
      .catch((e) => {
        mounted = false;
        console.warn('[voice] failed to load', e);
      });
  };
  const off = conn.session.on('lobby', sync);
  sync();
  return () => {
    disposed = true;
    off();
    unmount();
  };
}
