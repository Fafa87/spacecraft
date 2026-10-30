import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { buildFirestoreRules, FIRESTORE_INDEXES } from '../src/index.js';

describe('firestore.rules', () => {
  it('is up to date with the shared limits (run `npm run rules`)', () => {
    const file = readFileSync(resolve(import.meta.dirname, '../../../firestore.rules'), 'utf8');
    expect(file).toBe(buildFirestoreRules());
  });

  it('firestore.indexes.json lists the leaderboard indexes (run `npm run rules`)', () => {
    const file = readFileSync(
      resolve(import.meta.dirname, '../../../firestore.indexes.json'),
      'utf8',
    );
    expect(JSON.parse(file)).toEqual(FIRESTORE_INDEXES);
  });
});
