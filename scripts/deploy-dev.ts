/**
 * `npm run deploy:dev`: on-demand, unversioned dev preview at https://<owner>.github.io/<repo>/dev/.
 *
 * Builds the current checkout with BASE_PATH=/<repo>/dev/ and VITE_DEV_PREVIEW=<short sha>
 * (menu badge "DEV PREVIEW <sha>", hidden leaderboard board `0.0.0`), then replaces ONLY the
 * `dev/` folder on gh-pages in one normal commit on top of origin/gh-pages. The root build,
 * every vX.Y.Z/ folder and versions.json are left untouched; the preview is never listed.
 * Never force-pushes: if the push is rejected, just run it again.
 *
 * Options:
 *   --dry-run   build + commit in a temporary gh-pages worktree, print the diff stat, no push
 *   --no-build  reuse .deploy/dist-dev/
 *   --keep      keep the temporary worktree (always kept on --dry-run)
 */
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..');
const CLIENT_DIST = path.join(ROOT, 'packages/client/dist');
const STAGE = path.join(ROOT, '.deploy', 'dist-dev');
export const DEV_DIR = 'dev';

const args = process.argv.slice(2);
const flag = (n: string) => args.includes(`--${n}`);

const sh = (cmd: string, argv: string[], cwd = ROOT) =>
  execFileSync(cmd, argv, { cwd, stdio: ['ignore', 'pipe', 'inherit'], encoding: 'utf8' }).trim();
const run = (cmd: string, argv: string[], cwd = ROOT, env: NodeJS.ProcessEnv = {}) =>
  execFileSync(cmd, argv, { cwd, env: { ...process.env, ...env }, stdio: 'inherit' });

/** Paths a dev deploy may touch on gh-pages (everything else must stay byte-identical). */
export const isDevPath = (p: string): boolean => p === DEV_DIR || p.startsWith(`${DEV_DIR}/`);

function main(): void {
  const dry = flag('dry-run');
  const repo = path.basename(sh('git', ['remote', 'get-url', 'origin'])).replace(/\.git$/, '');
  const base = `/${repo}/${DEV_DIR}/`;
  const sha = sh('git', ['rev-parse', '--short', 'HEAD']);
  const branch = sh('git', ['rev-parse', '--abbrev-ref', 'HEAD']);
  const dirty = sh('git', ['status', '--porcelain', '--untracked-files=no']) !== '';
  const label = dirty ? `${sha}*` : sha;
  if (dirty) console.warn('! working tree has uncommitted changes; the preview is built from them');

  if (!flag('no-build')) {
    run('npm', ['run', 'assets', '--silent']);
    console.log(`\n== vite build, BASE_PATH=${base}, VITE_DEV_PREVIEW=${label}`);
    run('npm', ['run', 'build', '-w', '@sms/client'], ROOT, {
      BASE_PATH: base,
      VITE_DEV_PREVIEW: label,
    });
    fs.rmSync(STAGE, { recursive: true, force: true });
    fs.cpSync(CLIENT_DIST, STAGE, { recursive: true });
  }
  if (!fs.existsSync(path.join(STAGE, 'index.html'))) throw new Error(`no build in ${STAGE}`);

  run('git', ['fetch', 'origin', 'gh-pages']);
  const wt = fs.mkdtempSync(path.join(os.tmpdir(), 'ghp-dev-'));
  run('git', ['worktree', 'add', '--detach', wt, 'origin/gh-pages']);
  let ok = false;
  try {
    const dest = path.join(wt, DEV_DIR);
    fs.rmSync(dest, { recursive: true, force: true });
    fs.cpSync(STAGE, dest, { recursive: true });
    run('git', ['add', '-A', '--', DEV_DIR], wt);
    const changed = sh('git', ['diff', '--cached', '--name-only'], wt).split('\n').filter(Boolean);
    const outside = changed.filter((p) => !isDevPath(p));
    if (outside.length) throw new Error(`refusing: paths outside ${DEV_DIR}/ changed: ${outside}`);
    if (!changed.length) {
      console.log('dev/ already up to date; nothing to commit');
      ok = true;
      return;
    }
    run('git', ['commit', '-q', '-m', `Dev preview ${label} (${branch}) → /${DEV_DIR}/`], wt);
    console.log(sh('git', ['show', '--stat', '--format=%h %s', 'HEAD'], wt));
    const top = sh('git', ['diff', '--dirstat=files,0', 'HEAD~1', 'HEAD'], wt);
    console.log(`dirstat:\n${top}`);
    if (dry) {
      console.log(`\ndry run: not pushed. Worktree kept at ${wt}`);
    } else {
      run('git', ['push', 'origin', 'HEAD:gh-pages'], wt); // never --force
      console.log(`pushed. Live in ~1 min: https://<owner>.github.io${base}`);
    }
    ok = true;
  } finally {
    if (!dry && !flag('keep') && ok) run('git', ['worktree', 'remove', '--force', wt]);
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(import.meta.filename)) main();
