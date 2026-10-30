const ROOM_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

/** Human-friendly room code (no 0/O/1/I). */
export function makeRoomCode(length = 5, rand: () => number = Math.random): string {
  let s = '';
  for (let i = 0; i < length; i++) s += ROOM_ALPHABET[Math.floor(rand() * ROOM_ALPHABET.length)];
  return s;
}

export const normalizeRoomCode = (code: string): string => code.trim().toUpperCase().replace(/[^A-Z0-9]/g, '');

export function makeRunId(rand: () => number = Math.random): string {
  const t = Date.now().toString(36);
  let r = '';
  for (let i = 0; i < 10; i++) r += Math.floor(rand() * 36).toString(36);
  return `run_${t}_${r}`;
}
