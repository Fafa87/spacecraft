/**
 * Leaderboard name rules (like Pulp Wars): 1-16 letters/digits/`.,!?'_-` and inner spaces, plus
 * a small EN/PL rude-word filter. firestore.rules is generated from these same lists
 * (firestoreRules.ts); the client check is always at least as strict as the rules.
 */
import { HIGHSCORE_LIMITS, sanitizeName } from './limits.js';

/** Allowed characters (regex class body, valid in JS u-mode and RE2). */
export const NAME_CHAR = "\\p{L}\\p{N}.,!?'_\\-";
/** Unanchored: RE2 `matches()` in rules is a full match; JS adds ^…$. */
export const NAME_PATTERN_SOURCE = `[${NAME_CHAR}]([${NAME_CHAR} ]{0,${HIGHSCORE_LIMITS.nameMaxLength - 2}}[${NAME_CHAR}])?`;
export const NAME_PATTERN = new RegExp(`^(?:${NAME_PATTERN_SOURCE})$`, 'u');

/** Rejected anywhere in the name (after removing everything but a-z). */
export const RUDE_SUBSTRINGS = [
  'fuck',
  'shit',
  'cunt',
  'nigg',
  'faggot',
  'whore',
  'bitch',
  'asshole',
  'retard',
  'pussy',
  'rapist',
  'hitler',
  'porn',
  'motherf',
  'wanker',
  'dildo',
  'jizz',
  'kurwa',
  'chuj',
  'pierdol',
  'jeban',
  'pizd',
] as const;
/** Rejected as a whole word (optionally plural "s"), so "Cassandra" / "Titan" stay fine. */
export const RUDE_WORDS = [
  'ass',
  'arse',
  'fag',
  'cock',
  'dick',
  'slut',
  'rape',
  'nazi',
  'kike',
  'spic',
  'chink',
  'coon',
  'gook',
  'tit',
  'twat',
  'wank',
  'penis',
  'vagina',
  'cum',
  'anal',
  'anus',
  'sex',
  'tranny',
  'piss',
  'prick',
  'bollock',
  'dupa',
  'cipa',
  'huj',
] as const;

const LEET: Record<string, string> = {
  '0': 'o',
  '1': 'i',
  '3': 'e',
  '4': 'a',
  '5': 's',
  '7': 't',
  '@': 'a',
  $: 's',
  '!': 'i',
};
/** Accents stripped + leetspeak undone ("Ł" → "l", "a$$" → "ass"). */
const folded = (s: string) =>
  s
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/ł/g, 'l')
    .replace(/[013457@$!]/g, (c) => LEET[c]);

const words = (s: string) => s.split(/[^a-z]+/).filter(Boolean);
const wordHit = (w: string) =>
  (RUDE_WORDS as readonly string[]).includes(w) ||
  (w.endsWith('s') && (RUDE_WORDS as readonly string[]).includes(w.slice(0, -1)));

export function isRudeName(name: string): boolean {
  // The plain lowercase form is exactly what firestore.rules checks; the folded form catches more.
  for (const form of [name.toLowerCase(), folded(name)]) {
    const letters = form.replace(/[^a-z]/g, '');
    if (RUDE_SUBSTRINGS.some((r) => letters.includes(r))) return true;
    if (words(form).some(wordHit)) return true;
  }
  return false;
}

export type NameProblem = 'EMPTY' | 'TOO_LONG' | 'CHARACTERS' | 'RUDE';

export function nameProblem(name: string): NameProblem | null {
  if (name.length === 0) return 'EMPTY';
  if (Array.from(name).length > HIGHSCORE_LIMITS.nameMaxLength) return 'TOO_LONG';
  if (!NAME_PATTERN.test(name)) return 'CHARACTERS';
  if (isRudeName(name)) return 'RUDE';
  return null;
}

export function nameProblemMessage(p: NameProblem): string {
  switch (p) {
    case 'EMPTY':
      return 'Enter a name.';
    case 'TOO_LONG':
      return `Max ${HIGHSCORE_LIMITS.nameMaxLength} characters.`;
    case 'CHARACTERS':
      return "Use letters, digits, spaces and . , ! ? ' _ - only.";
    case 'RUDE':
      return 'Please pick a different name.';
  }
}

/**
 * The name as it goes on the global board: sanitized, disallowed characters dropped, and
 * replaced by "Marine N" if it is still not acceptable (so a squad's run is never lost to a name).
 */
export function leaderboardName(raw: string, n = 1): string {
  let s = sanitizeName(raw);
  if (nameProblem(s) === 'CHARACTERS')
    s = sanitizeName(s.replace(new RegExp(`[^${NAME_CHAR} ]`, 'gu'), ''));
  return nameProblem(s) === null ? s : `Marine ${n}`;
}
