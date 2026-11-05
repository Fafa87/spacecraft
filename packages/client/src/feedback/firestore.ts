/**
 * Firestore REST helpers for Vox Relay petitions (no SDK, same style as highscores/firestore.ts).
 */
import {
  FIRESTORE_PETITIONS,
  FIRESTORE_PETITION_VOTES,
  PETITION_LIMITS,
  isPetitionCategory,
  isPetitionSource,
  isPetitionStatus,
  isPetitionVoteValue,
  type PetitionCategory,
  type PetitionDoc,
  type PetitionInput,
  type PetitionSource,
  type PetitionStatus,
  type PetitionVote,
  type PetitionVoteValue,
  voteDocId,
} from '@sms/shared';
import { documentsPath, FIRESTORE_DEFAULTS } from '../highscores/firestore.js';

export interface PetitionFirestoreConfig {
  apiKey: string;
  projectId: string;
  baseUrl?: string;
}

type Value =
  | { stringValue: string }
  | { integerValue: string }
  | { timestampValue: string };
type Fields = Record<string, Value>;

const str = (s: string): Value => ({ stringValue: s });
const int = (n: number): Value => ({ integerValue: String(n) });

export type PetitionMethod = 'commit' | 'runQuery';

export function petitionEndpoint(cfg: PetitionFirestoreConfig, method: PetitionMethod): string {
  const base = (cfg.baseUrl ?? FIRESTORE_DEFAULTS.baseUrl).replace(/\/$/, '');
  return `${base}/${documentsPath(cfg.projectId)}:${method}?key=${encodeURIComponent(cfg.apiKey)}`;
}

export const petitionDocName = (cfg: PetitionFirestoreConfig, id: string) =>
  `${documentsPath(cfg.projectId)}/${FIRESTORE_PETITIONS}/${id}`;

export const voteDocName = (cfg: PetitionFirestoreConfig, petitionId: string, voterId: string) =>
  `${documentsPath(cfg.projectId)}/${FIRESTORE_PETITION_VOTES}/${voteDocId(petitionId, voterId)}`;

/** Create-only petition write; createdAt = REQUEST_TIME. */
export function createPetitionBody(cfg: PetitionFirestoreConfig, p: PetitionInput) {
  const fields: Fields = {
    category: str(p.category),
    title: str(p.title),
    body: str(p.body),
    name: str(p.name),
    gameVersion: str(p.gameVersion),
    status: str('open'),
    source: str(p.source),
  };
  return {
    writes: [
      {
        update: { name: petitionDocName(cfg, p.id), fields },
        updateTransforms: [{ fieldPath: 'createdAt', setToServerValue: 'REQUEST_TIME' }],
        currentDocument: { exists: false },
      },
    ],
  };
}

/** Create or update a vote. `exists` false = create (value ±1), true = update (allows 0). */
export function voteBody(
  cfg: PetitionFirestoreConfig,
  vote: PetitionVote,
  exists: boolean,
) {
  const fields: Fields = {
    petitionId: str(vote.petitionId),
    voterId: str(vote.voterId),
    value: int(vote.value),
  };
  return {
    writes: [
      {
        update: {
          name: voteDocName(cfg, vote.petitionId, vote.voterId),
          fields,
        },
        currentDocument: { exists },
      },
    ],
  };
}

export function listPetitionsQuery(limit = PETITION_LIMITS.maxList) {
  return {
    structuredQuery: {
      from: [{ collectionId: FIRESTORE_PETITIONS }],
      limit: Math.max(1, Math.min(PETITION_LIMITS.maxList, Math.floor(limit) || 1)),
    },
  };
}

export function listVotesQuery(limit = PETITION_LIMITS.maxList * 4) {
  return {
    structuredQuery: {
      from: [{ collectionId: FIRESTORE_PETITION_VOTES }],
      limit: Math.max(1, Math.min(2000, Math.floor(limit) || 1)),
    },
  };
}

const obj = (v: unknown): Record<string, unknown> | null =>
  typeof v === 'object' && v !== null && !Array.isArray(v) ? (v as Record<string, unknown>) : null;

function readInt(f: Record<string, unknown>, key: string): number | null {
  const raw = obj(f[key])?.integerValue;
  const n =
    typeof raw === 'string' && /^-?\d{1,15}$/.test(raw)
      ? Number(raw)
      : typeof raw === 'number'
        ? raw
        : null;
  return n !== null && Number.isSafeInteger(n) ? n : null;
}

function readStr(f: Record<string, unknown>, key: string): string | null {
  const v = obj(f[key])?.stringValue;
  return typeof v === 'string' ? v : null;
}

/** runQuery response → petitions (malformed / hidden skipped at call site if desired). */
export function parsePetitions(json: unknown): PetitionDoc[] {
  if (!Array.isArray(json)) return [];
  const out: PetitionDoc[] = [];
  for (const row of json) {
    const doc = obj(obj(row)?.document);
    const f = obj(doc?.fields);
    if (!doc || !f) continue;
    const name = typeof doc.name === 'string' ? doc.name : '';
    const id = name.slice(name.lastIndexOf('/') + 1);
    const ts = obj(f.createdAt)?.timestampValue;
    const category = readStr(f, 'category');
    const title = readStr(f, 'title');
    const body = readStr(f, 'body');
    const author = readStr(f, 'name');
    const gameVersion = readStr(f, 'gameVersion');
    const status = readStr(f, 'status');
    const source = readStr(f, 'source');
    if (
      !id ||
      !isPetitionCategory(category) ||
      title === null ||
      body === null ||
      author === null ||
      gameVersion === null ||
      !isPetitionStatus(status) ||
      !isPetitionSource(source)
    )
      continue;
    out.push({
      id,
      category: category as PetitionCategory,
      title,
      body,
      name: author,
      gameVersion,
      status: status as PetitionStatus,
      source: source as PetitionSource,
      createdAt: typeof ts === 'string' ? ts : new Date(0).toISOString(),
    });
  }
  return out;
}

export function parseVotes(json: unknown): PetitionVote[] {
  if (!Array.isArray(json)) return [];
  const out: PetitionVote[] = [];
  for (const row of json) {
    const doc = obj(obj(row)?.document);
    const f = obj(doc?.fields);
    if (!doc || !f) continue;
    const petitionId = readStr(f, 'petitionId');
    const voterId = readStr(f, 'voterId');
    const value = readInt(f, 'value');
    if (petitionId === null || voterId === null || !isPetitionVoteValue(value)) continue;
    out.push({
      petitionId,
      voterId,
      value: value as PetitionVoteValue,
    });
  }
  return out;
}
