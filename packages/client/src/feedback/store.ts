import {
  aggregateVotes,
  validatePetitionInput,
  validateVote,
  voteDocId,
  type PetitionCard,
  type PetitionCategory,
  type PetitionInput,
  type PetitionVote,
  type PetitionVoteValue,
} from '@sms/shared';
import { HttpError } from '../highscores/HttpHighscoreStore.js';
import {
  createPetitionBody,
  listPetitionsQuery,
  listVotesQuery,
  parsePetitions,
  parseVotes,
  petitionEndpoint,
  voteBody,
  type PetitionFirestoreConfig,
  type PetitionMethod,
} from './firestore.js';

type Fetch = typeof fetch;

export class PetitionStore {
  constructor(
    private readonly cfg: PetitionFirestoreConfig,
    private readonly opts: { timeoutMs?: number; fetch?: Fetch } = {},
  ) {}

  private async post(method: PetitionMethod, body: unknown): Promise<unknown> {
    const f = this.opts.fetch ?? fetch;
    const res = await f(petitionEndpoint(this.cfg, method), {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
      cache: 'no-store',
      credentials: 'omit',
      signal: AbortSignal.timeout(this.opts.timeoutMs ?? 8000),
    });
    if (!res.ok) {
      let detail = '';
      try {
        const e = ((await res.json()) as { error?: { status?: string; message?: string } }).error;
        detail = [e?.status, e?.message].filter(Boolean).join(': ');
      } catch {
        /* not JSON */
      }
      throw new HttpError(res.status, `firestore ${method}: ${res.status} ${detail}`.trim());
    }
    return res.json();
  }

  async list(voterId: string): Promise<PetitionCard[]> {
    const [petJson, voteJson] = await Promise.all([
      this.post('runQuery', listPetitionsQuery()),
      this.post('runQuery', listVotesQuery()),
    ]);
    const petitions = parsePetitions(petJson).filter((p) => p.status !== 'hidden');
    const votes = parseVotes(voteJson);
    const byPet = new Map<string, PetitionVote[]>();
    for (const v of votes) {
      const list = byPet.get(v.petitionId) ?? [];
      list.push(v);
      byPet.set(v.petitionId, list);
    }
    return petitions.map((p) => {
      const agg = aggregateVotes(byPet.get(p.id) ?? [], voterId);
      return { ...p, ...agg };
    });
  }

  async create(raw: Partial<PetitionInput>): Promise<void> {
    const v = validatePetitionInput(raw);
    if (!v.ok) throw new HttpError(400, `invalid petition: ${v.error}`);
    try {
      await this.post('commit', createPetitionBody(this.cfg, v.value));
    } catch (err) {
      if (!(err instanceof HttpError && err.status === 409)) throw err;
    }
  }

  /**
   * Set this browser's vote. `0` clears (updates an existing vote to 0).
   * Create only accepts ±1; clear/flip of an existing row is an update.
   */
  async cast(petitionId: string, voterId: string, value: PetitionVoteValue): Promise<void> {
    const id = voteDocId(petitionId, voterId);
    const v = validateVote(id, { petitionId, voterId, value });
    if (!v.ok) throw new HttpError(400, `invalid vote: ${v.error}`);
    if (value === 0) {
      await this.post('commit', voteBody(this.cfg, v.value, true));
      return;
    }
    try {
      await this.post('commit', voteBody(this.cfg, v.value, false));
    } catch (err) {
      if (!(err instanceof HttpError && (err.status === 409 || err.status === 400))) throw err;
      // Already exists (or create precondition) — update value (flip / change).
      await this.post('commit', voteBody(this.cfg, v.value, true));
    }
  }
}

export type CategoryFilter = PetitionCategory | 'all';

export function sortPetitions(
  cards: readonly PetitionCard[],
  category: CategoryFilter,
  mode: 'score' | 'newest',
): PetitionCard[] {
  const filtered = category === 'all' ? [...cards] : cards.filter((c) => c.category === category);
  return filtered.sort((a, b) => {
    if (mode === 'newest') {
      const t = b.createdAt.localeCompare(a.createdAt);
      return t !== 0 ? t : b.score - a.score;
    }
    const s = b.score - a.score;
    return s !== 0 ? s : b.createdAt.localeCompare(a.createdAt);
  });
}
