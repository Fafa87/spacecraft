import { describe, expect, it } from 'vitest';
import {
  aggregateVotes,
  makePetitionId,
  PETITION_LIMITS,
  sanitizeBody,
  sanitizeTitle,
  validatePetitionInput,
  validateVote,
  voteDocId,
} from '../src/index.js';

describe('petition validation', () => {
  const good = {
    id: 'pet_abc123_xyz789',
    category: 'bugs' as const,
    title: 'Carnifex zbyt szybki',
    body: 'Na fali 5 Carnifex dogania sprint. Proszę o nerf prędkości szarży.',
    name: 'Filip',
    gameVersion: '0.6.1',
    source: 'live' as const,
  };

  it('accepts a well-formed petition', () => {
    const v = validatePetitionInput(good);
    expect(v.ok).toBe(true);
    if (v.ok) expect(v.value.title).toBe(good.title);
  });

  it('sanitizes title/body and rejects empties / overlong', () => {
    expect(sanitizeTitle('  foo\nbar  ')).toBe('foo bar');
    expect(sanitizeBody('a\n\n\nb')).toBe('a\n\nb');
    expect(sanitizeTitle('x'.repeat(PETITION_LIMITS.titleMaxLength + 5)).length).toBe(
      PETITION_LIMITS.titleMaxLength,
    );
    expect(validatePetitionInput({ ...good, title: '' }).ok).toBe(false);
    expect(validatePetitionInput({ ...good, body: '' }).ok).toBe(false);
    expect(validatePetitionInput({ ...good, category: 'nope' as 'bugs' }).ok).toBe(false);
    expect(validatePetitionInput({ ...good, source: 'staging' as 'live' }).ok).toBe(false);
    expect(validatePetitionInput({ ...good, name: 'xXfuckXx' }).ok).toBe(false);
    expect(validatePetitionInput({ ...good, id: 'x' }).ok).toBe(false);
  });

  it('stamps makePetitionId in the allowed pattern', () => {
    expect(PETITION_LIMITS.petitionIdPattern.test(makePetitionId())).toBe(true);
  });
});

describe('petition votes', () => {
  const petitionId = 'pet_abc123_xyz789';
  const voterId = 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee';

  it('requires doc id petitionId_voterId and ±1/0 value', () => {
    const id = voteDocId(petitionId, voterId);
    expect(validateVote(id, { petitionId, voterId, value: 1 }).ok).toBe(true);
    expect(validateVote(id, { petitionId, voterId, value: 0 }).ok).toBe(true);
    expect(validateVote(id, { petitionId, voterId, value: 2 as 1 }).ok).toBe(false);
    expect(validateVote('wrong', { petitionId, voterId, value: 1 }).ok).toBe(false);
  });

  it('aggregates score and tracks myVote (0 ignored in totals)', () => {
    const votes = [
      { voterId: 'a', value: 1 as const },
      { voterId: 'b', value: 1 as const },
      { voterId: 'c', value: -1 as const },
      { voterId: 'd', value: 0 as const },
      { voterId: 'me', value: 1 as const },
    ];
    expect(aggregateVotes(votes, 'me')).toEqual({ score: 2, up: 3, down: 1, myVote: 1 });
    expect(aggregateVotes(votes, 'missing').myVote).toBe(0);
  });

  it('flip semantics: same vote → clear to 0', () => {
    // UI logic mirrored for the unit test.
    const next = (my: 1 | -1 | 0, want: 1 | -1) => (my === want ? 0 : want);
    expect(next(0, 1)).toBe(1);
    expect(next(1, 1)).toBe(0);
    expect(next(1, -1)).toBe(-1);
    expect(next(-1, -1)).toBe(0);
  });
});
