/** Writes firestore.rules and firestore.indexes.json from the shared highscore limits / name rules. */
import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  buildFirestoreRules,
  FIRESTORE_INDEXES,
} from '../packages/shared/src/highscore/firestoreRules.js';

const out = resolve(import.meta.dirname, '..', 'firestore.rules');
writeFileSync(out, buildFirestoreRules());
console.log(`wrote ${out}`);
const idx = resolve(import.meta.dirname, '..', 'firestore.indexes.json');
writeFileSync(idx, JSON.stringify(FIRESTORE_INDEXES, null, 2) + '\n');
console.log(`wrote ${idx}`);
