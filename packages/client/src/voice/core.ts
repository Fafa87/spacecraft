/**
 * Pure, DOM-free helpers of the voice-chat prototype (unit tested in test/voice.test.ts).
 *
 * Discovery model: every participant registers a SECOND PeerJS id, independent of the game
 * connection, in a small per-room slot space — `sms-voice-v1-<ROOM>-<n>`, n = 1..maxSlots.
 * The first free slot wins (PeerJS answers `unavailable-id` for taken ones). Each player then
 * calls every LOWER slot (absent ones just answer `peer-unavailable`, and are retried every
 * few seconds) and answers calls from higher slots. That gives a full
 * mesh (each player sends one Opus stream to each other player) without touching the game
 * protocol or the host's Peer.
 */

export const VOICE_PREFIX = 'sms-voice-v1-';
export const DEFAULT_MAX_SLOTS = 8;

export const voicePeerId = (room: string, slot: number) => `${VOICE_PREFIX}${room}-${slot}`;

/** Slot number of a voice peer id of this room, or null for anything else. */
export function slotOf(room: string, id: string): number | null {
  const pre = `${VOICE_PREFIX}${room}-`;
  if (!id.startsWith(pre)) return null;
  const n = Number(id.slice(pre.length));
  return Number.isInteger(n) && n > 0 ? n : null;
}

/** The slots this player calls: all lower ones (higher slots call us — no glare). */
export function callTargets(room: string, mine: number): string[] {
  const out: string[] = [];
  for (let n = 1; n < mine; n++) out.push(voicePeerId(room, n));
  return out;
}

/** PeerJS reports "Could not connect to peer <id>" for an absent remote. */
export function unavailablePeerOf(message: string): string | null {
  const m = /Could not connect to peer (\S+)/.exec(message);
  return m ? m[1] : null;
}

/**
 * SDP munging for the Opus fmtp line: mono speech, capped average bitrate, DTX (no packets
 * while silent — big saving on a push-to-talk / mostly-quiet channel through TURN) and
 * in-band FEC (survives lossy mobile links).
 */
export function tuneOpus(sdp: string, bitrate = 24000): string {
  const pt = /a=rtpmap:(\d+) opus\/48000/i.exec(sdp)?.[1];
  if (!pt) return sdp;
  const want: Record<string, string> = {
    maxaveragebitrate: String(bitrate),
    stereo: '0',
    usedtx: '1',
    useinbandfec: '1',
  };
  const re = new RegExp(`^a=fmtp:${pt} ([^\\r\\n]*)`, 'm');
  const m = re.exec(sdp);
  if (!m) {
    const line = `a=fmtp:${pt} ${Object.entries(want)
      .map(([k, v]) => `${k}=${v}`)
      .join(';')}`;
    return sdp.replace(new RegExp(`^(a=rtpmap:${pt} opus/48000[^\\r\\n]*)`, 'mi'), `$1\r\n${line}`);
  }
  const params = new Map(
    m[1]
      .split(';')
      .map((kv) => kv.trim())
      .filter(Boolean)
      .map((kv) => {
        const i = kv.indexOf('=');
        return [i < 0 ? kv : kv.slice(0, i), i < 0 ? '' : kv.slice(i + 1)] as [string, string];
      }),
  );
  for (const [k, v] of Object.entries(want)) params.set(k, v);
  const joined = [...params].map(([k, v]) => (v === '' ? k : `${k}=${v}`)).join(';');
  return sdp.replace(re, `a=fmtp:${pt} ${joined}`);
}

/** RMS of a time-domain block (-1..1 floats). */
export function rms(block: ArrayLike<number>): number {
  let s = 0;
  for (let i = 0; i < block.length; i++) s += block[i] * block[i];
  return block.length ? Math.sqrt(s / block.length) : 0;
}

export const toDb = (r: number) => (r > 0 ? 20 * Math.log10(r) : -Infinity);

export interface SpeakingState {
  speaking: boolean;
  /** Last time (ms) the level was above the threshold. */
  lastLoud: number;
}

/** Speaking indicator with a release hold so it doesn't flicker between syllables. */
export function updateSpeaking(
  st: SpeakingState,
  level: number,
  now: number,
  thresholdDb = -50,
  holdMs = 300,
): SpeakingState {
  if (toDb(level) > thresholdDb) return { speaking: true, lastLoud: now };
  return { speaking: st.speaking && now - st.lastLoud < holdMs, lastLoud: st.lastLoud };
}

export type MicMode = 'open' | 'ptt';

/** Whether the local mic track should be live. */
export function transmitting(mode: MicMode, muted: boolean, pttDown: boolean): boolean {
  if (muted) return false;
  return mode === 'open' ? true : pttDown;
}

/**
 * Voice chat is opt-in per room: the host's CZAT GŁOSOWY toggle (lobby `voice` field). Only P2P
 * rooms have voice (solo / dedicated: never). `?voice=1` is a harmless dev override that shows
 * the overlay for this tab only (not remembered; the others still need the host's toggle).
 */
export function voiceWanted(
  mode: string,
  lobbyVoice: boolean | undefined,
  search: string,
): boolean {
  if (mode !== 'p2p') return false;
  return lobbyVoice === true || new URLSearchParams(search).get('voice') === '1';
}

export const clampVolume = (v: number) => (Number.isFinite(v) ? Math.min(2, Math.max(0, v)) : 1);
