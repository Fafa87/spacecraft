/**
 * `npm run deploy:pages`: versioned GitHub Pages deploy to the `gh-pages` branch.
 *
 * Layout on gh-pages (served at https://<owner>.github.io/<repo>/):
 *   /                 latest build (BASE_PATH=/<repo>/)
 *   /vX.Y.Z/          frozen build of every released version (BASE_PATH=/<repo>/vX.Y.Z/)
 *   /dev/             unversioned dev preview (scripts/deploy-dev.ts); kept as is, never listed
 *   /versions.json    { versions: [{ version, date, title, path }] }, newest first; read by the
 *                     "Previous versions" link in the menu
 *
 * The script builds the current checkout twice (root + /vGAME_VERSION/). It replaces only the
 * root files and this version's folder. Every other vX.Y.Z/ folder is preserved. It makes a
 * normal commit on top of origin/gh-pages and pushes only with --push, **never with force**:
 * if the push is rejected, re-run the script, which starts again from the fresh origin/gh-pages.
 *
 * Options:
 *   --title "…"                   title for this version in versions.json (default: content title)
 *   --add <ver>=<distDir>[=<title>]  also install a prebuilt frozen build, e.g. a v0.1.0 build
 *                                 from a worktree of tag v0.1.0 built with
 *                                 BASE_PATH=/<repo>/v0.1.0/ (repeatable)
 *   --no-build                    reuse the existing dist-root/ and dist-v/ staging folders
 *   --push                        push the commit (git push origin HEAD:gh-pages, no force)
 *   --keep                        keep the temporary gh-pages worktree for inspection
 */
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { GAME_VERSION } from '../packages/shared/src/constants.js';
import { defaultContent } from '../packages/shared/src/data/index.js';

interface VersionEntry {
  version: string;
  date: string;
  title: string;
  path: string;
}

const ROOT = path.resolve(import.meta.dirname, '..');
const CLIENT_DIST = path.join(ROOT, 'packages/client/dist');
const STAGE = path.join(ROOT, '.deploy');

const args = process.argv.slice(2);
const flag = (n: string) => args.includes(`--${n}`);
const opt = (n: string) => {
  const i = args.indexOf(`--${n}`);
  return i >= 0 ? args[i + 1] : undefined;
};
const multi = (n: string) => args.flatMap((a, i) => (a === `--${n}` ? [args[i + 1]] : []));

const sh = (cmd: string, argv: string[], opts: { cwd?: string; env?: NodeJS.ProcessEnv } = {}) =>
  execFileSync(cmd, argv, {
    cwd: opts.cwd ?? ROOT,
    env: { ...process.env, ...opts.env },
    stdio: ['ignore', 'pipe', 'inherit'],
    encoding: 'utf8',
  }).trim();
const run = (cmd: string, argv: string[], opts: { cwd?: string; env?: NodeJS.ProcessEnv } = {}) =>
  execFileSync(cmd, argv, {
    cwd: opts.cwd ?? ROOT,
    env: { ...process.env, ...opts.env },
    stdio: 'inherit',
  });

export function semverDesc(a: string, b: string): number {
  const pa = a.split('.').map(Number);
  const pb = b.split('.').map(Number);
  for (let i = 0; i < 3; i++) if ((pa[i] ?? 0) !== (pb[i] ?? 0)) return (pb[i] ?? 0) - (pa[i] ?? 0);
  return 0;
}

/** Inserts or replaces an entry and keeps the list newest-first. */
export function upsertVersion(list: VersionEntry[], e: VersionEntry): VersionEntry[] {
  return [...list.filter((v) => v.version !== e.version), e].sort((a, b) =>
    semverDesc(a.version, b.version),
  );
}

function repoName(): string {
  const url = sh('git', ['remote', 'get-url', 'origin']);
  return path.basename(url).replace(/\.git$/, '');
}

function tagDate(version: string): string {
  try {
    return sh('git', ['log', '-1', '--format=%cs', `v${version}`]);
  } catch {
    return new Date().toISOString().slice(0, 10);
  }
}

function copyDir(from: string, to: string): void {
  fs.rmSync(to, { recursive: true, force: true });
  fs.cpSync(from, to, { recursive: true });
}

function main(): void {
  const repo = repoName();
  const base = `/${repo}/`;
  const ver = GAME_VERSION;
  const title = opt('title') ?? defaultContent.title;
  const sha = sh('git', ['rev-parse', '--short', 'HEAD']);
  if (sh('git', ['status', '--porcelain']) !== '')
    console.warn('! working tree has uncommitted changes; the deploy is built from them');

  const rootStage = path.join(STAGE, 'dist-root');
  const verStage = path.join(STAGE, 'dist-v');
  if (!flag('no-build')) {
    run('npm', ['run', 'assets', '--silent']);
    for (const [b, out] of [
      [base, rootStage],
      [`${base}v${ver}/`, verStage],
    ] as const) {
      console.log(`\n== vite build, BASE_PATH=${b}`);
      run('npm', ['run', 'build', '-w', '@sms/client'], { env: { BASE_PATH: b } });
      copyDir(CLIENT_DIST, out);
    }
  }

  // Fresh worktree of origin/gh-pages (detached), so the commit always sits on top of it.
  run('git', ['fetch', 'origin', 'gh-pages']);
  const wt = fs.mkdtempSync(path.join(os.tmpdir(), 'ghp-'));
  run('git', ['worktree', 'add', '--detach', wt, 'origin/gh-pages']);
  try {
    // Root: drop everything except .git, frozen version folders, the dev preview and versions.json.
    for (const f of fs.readdirSync(wt)) {
      if (f === '.git' || /^v\d+\.\d+\.\d+$/.test(f) || f === 'dev' || f === 'versions.json')
        continue;
      fs.rmSync(path.join(wt, f), { recursive: true, force: true });
    }
    fs.cpSync(rootStage, wt, { recursive: true });
    fs.writeFileSync(path.join(wt, '.nojekyll'), '');
    copyDir(verStage, path.join(wt, `v${ver}`));

    const vjPath = path.join(wt, 'versions.json');
    let versions: VersionEntry[] = fs.existsSync(vjPath)
      ? ((JSON.parse(fs.readFileSync(vjPath, 'utf8')) as { versions: VersionEntry[] }).versions ??
        [])
      : [];
    for (const spec of multi('add')) {
      const [v, dir, t] = spec.split('=');
      if (!v || !dir || !fs.existsSync(path.join(dir, 'index.html')))
        throw new Error(`--add ${spec}: expected <version>=<distDir with index.html>[=<title>]`);
      copyDir(path.resolve(dir), path.join(wt, `v${v}`));
      const prev = versions.find((e) => e.version === v);
      versions = upsertVersion(versions, {
        version: v,
        date: prev?.date ?? tagDate(v),
        title: t ?? prev?.title ?? `v${v}`,
        path: `${base}v${v}/`,
      });
    }
    versions = upsertVersion(versions, {
      version: ver,
      date: tagDate(ver),
      title,
      path: `${base}v${ver}/`,
    });
    // Every listed version must have its folder.
    versions = versions.filter((e) => fs.existsSync(path.join(wt, `v${e.version}`, 'index.html')));
    fs.writeFileSync(vjPath, JSON.stringify({ latest: ver, versions }, null, 2) + '\n');

    run('git', ['add', '-A'], { cwd: wt });
    if (sh('git', ['status', '--porcelain'], { cwd: wt }) === '') {
      console.log('gh-pages already up to date; nothing to commit');
      return;
    }
    run(
      'git',
      [
        'commit',
        '-q',
        '-m',
        `Deploy ${sha}: v${ver} ${title} (versions: ${versions.map((e) => e.version).join(', ')})`,
      ],
      {
        cwd: wt,
      },
    );
    console.log(
      sh('git', ['log', '--stat', '--oneline', '-1'], { cwd: wt })
        .split('\n')
        .slice(0, 1)
        .join('\n'),
    );
    if (flag('push')) {
      run('git', ['push', 'origin', 'HEAD:gh-pages'], { cwd: wt }); // never --force
      console.log(`pushed. Live in ~1 min: https://<owner>.github.io${base} and ${base}v${ver}/`);
    } else {
      console.log(`not pushed (dry run). Inspect ${wt}, then re-run with --push.`);
    }
  } finally {
    if (!flag('keep') && flag('push')) run('git', ['worktree', 'remove', '--force', wt]);
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(import.meta.filename)) main();
