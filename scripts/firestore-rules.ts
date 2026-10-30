/** Writes firestore.rules from the shared highscore limits / name rules. */
import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { buildFirestoreRules } from '../packages/shared/src/highscore/firestoreRules.js';

const out = resolve(import.meta.dirname, '..', 'firestore.rules');
writeFileSync(out, buildFirestoreRules());
console.log(`wrote ${out}`);
