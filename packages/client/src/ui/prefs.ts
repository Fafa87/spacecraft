import { storage } from '../util/storage.js';

/**
 * Preferences shared by every deployed version (same github.io origin):
 * name (`sms.name`), mute (`sms.muted`) and the preferred chapter. Highscore tables are
 * per leaderboard board instead (see highscores/LocalHighscoreStore.ts).
 */
const CHAPTER_KEY = 'sms.chapter';

export const prefs = {
  chapter: (): string | undefined => storage.get<string>(CHAPTER_KEY, '') || undefined,
  setChapter: (id: string): void => storage.set(CHAPTER_KEY, id),
};
