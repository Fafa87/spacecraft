import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));

export const TOOLS_DIR = path.resolve(here, '..');
export const REPO_ROOT = path.resolve(TOOLS_DIR, '..');
/** Where generated assets go (served by Vite from client/public). */
export const OUT_DIR =
  process.env.ASSETS_OUT_DIR ?? path.join(REPO_ROOT, 'packages/client/public/assets/generated');
/** Drop hand-made or AI-made files here to replace procedural output. */
export const OVERRIDES_DIR = path.join(TOOLS_DIR, 'assets-src/overrides');
