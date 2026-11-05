/** Limits for the Vox Relay petitions board (shared by client validation and firestore.rules). */
export const PETITION_LIMITS = {
  titleMinLength: 1,
  titleMaxLength: 80,
  bodyMinLength: 1,
  bodyMaxLength: 1500,
  /** Same callsign rules as the leaderboard. */
  nameMinLength: 1,
  nameMaxLength: 16,
  /** pet_<time>_<rand> — same character set as run ids. */
  petitionIdPattern: /^[A-Za-z0-9_-]{6,64}$/,
  /** crypto.randomUUID() shape. */
  voterIdPattern:
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
  /** semver-ish, same as highscores (allows -dev / -test tags). */
  versionPattern: /^\d{1,3}\.\d{1,3}\.\d{1,3}(?:-[0-9A-Za-z.]{1,12})?$/,
  maxList: 300,
} as const;

export const PETITION_CATEGORIES = ['bugs', 'balance', 'ideas'] as const;
export type PetitionCategory = (typeof PETITION_CATEGORIES)[number];

export const PETITION_STATUSES = ['open', 'done', 'hidden'] as const;
export type PetitionStatus = (typeof PETITION_STATUSES)[number];

/** Where the petition was filed from (dev preview vs a released build). */
export const PETITION_SOURCES = ['live', 'dev'] as const;
export type PetitionSource = (typeof PETITION_SOURCES)[number];

export const FIRESTORE_PETITIONS = 'petitions';
export const FIRESTORE_PETITION_VOTES = 'petitionVotes';

export const PETITION_FIELDS = [
  'category',
  'title',
  'body',
  'name',
  'createdAt',
  'gameVersion',
  'status',
  'source',
] as const;

export const PETITION_VOTE_FIELDS = ['petitionId', 'voterId', 'value'] as const;

/** Vote value: +1 up, -1 down, 0 = cleared (kept so delete stays denied). */
export const PETITION_VOTE_VALUES = [1, -1, 0] as const;
export type PetitionVoteValue = (typeof PETITION_VOTE_VALUES)[number];
