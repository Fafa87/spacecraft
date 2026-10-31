/**
 * Captures the game-over kill tally (needs `npm run dev`; `?firestore=0`, nothing touches the
 * real leaderboard): docs/review/kill-summary.png (4-marine squad: host tab + 3 in-page bot
 * marines on LocalLinks) and docs/review/kill-summary-solo.png.
 * Kills are real sim kills: the squad fights a few seconds, then Tyranids of every type are
 * spawned and killed through damageEnemy / explode (bolts, blasts, an uncredited blast).
 * Usage: npx tsx scripts/kill-summary-shot.ts [clientUrl]
 */
import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import puppeteer, { type Page } from 'puppeteer-core';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(root, 'docs', 'review');
mkdirSync(OUT, { recursive: true });
const CLIENT = (process.argv[2] ?? 'http://localhost:5173/').replace(/\/?$/, '/');
const CHROME = process.env.CHROME_PATH ?? '/usr/bin/google-chrome';
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
let failed = false;
const check = (ok: boolean, msg: string) => {
  console.log(`${ok ? '✓' : '✗'} ${msg}`);
  if (!ok) failed = true;
};

const browser = await puppeteer.launch({
  executablePath: CHROME,
  headless: true,
  args: ['--no-sandbox', '--autoplay-policy=no-user-gesture-required', '--use-gl=swiftshader'],
});
const errors: string[] = [];

async function open(query: string, w = 1600, h = 1200): Promise<Page> {
  const page = await browser.newPage();
  await page.evaluateOnNewDocument('globalThis.__name = (f) => f');
  page.on('pageerror', (e) => errors.push((e as Error).message));
  await page.setViewport({ width: w, height: h, deviceScaleFactor: 1 });
  await page.goto(`${CLIENT}?firestore=0&${query}`, { waitUntil: 'load' });
  return page;
}

/** Kills a spread of Tyranids in the host world: [type, slot | -1 (uncredited blast), count]. */
async function slaughter(page: Page, plan: [string, number, number][]): Promise<void> {
  await page.evaluate(async (plan) => {
    const S: any = await import(
      /* @vite-ignore */ '/@fs/workspace/spacecraft/packages/shared/src/index.ts'
    );
    const w = (window as any).__sms.conn.host.world;
    const p0 = w.players[0];
    for (const [type, slot, n] of plan) {
      for (let i = 0; i < n; i++) {
        const e = S.spawnEnemy(w, type, p0.x + 1200, p0.y + 900);
        if (slot >= 0) S.damageEnemy(w, e, e.hp + 1, { sourcePlayerId: w.players[slot].id });
        else
          S.explode(
            w,
            e.x,
            e.y,
            { radius: 20, damage: 1e6, edgeFactor: 1 },
            {
              hurtsPlayers: false,
              hurtsEnemies: true,
            },
          );
      }
    }
  }, plan);
}

async function fallAndWait(page: Page): Promise<void> {
  await page.evaluate(() => {
    const w = (window as any).__sms.conn.host.world;
    for (const p of w.players) {
      p.invuln = 0;
      p.state = 'downed';
      p.downedTime = 1e9;
    }
  });
  await page.waitForFunction(() => (window as any).__sms?.screen === 'over', { timeout: 15000 });
  await sleep(2000);
}

try {
  // ---------------------------------------------------------------- 4-marine squad
  const page = await open('');
  await page.waitForSelector('.menu #name', { timeout: 15000 });
  await page.$eval('.menu #name', (e) => ((e as HTMLInputElement).value = ''));
  await page.type('.menu #name', 'Filip');
  await page.click('#host');
  await page.waitForSelector('.room .code', { timeout: 15000 });
  await page.evaluate(async () => {
    const S: any = await import(
      /* @vite-ignore */ '/@fs/workspace/spacecraft/packages/shared/src/index.ts'
    );
    const host = (window as any).__sms.conn.host;
    for (const name of ['Bravo', 'Castor', 'Dorn']) {
      const [h, c] = S.createLocalLinkPair(`bot-${name}`);
      host.addLink(h);
      new S.ClientSession(c, name).join();
    }
  });
  await page.waitForFunction(
    () => document.querySelectorAll('.room .players li:not(.empty)').length === 4,
    { timeout: 10000 },
  );
  await page.$eval('#start', (e) => (e as HTMLButtonElement).click());
  await page.waitForFunction(() => (window as any).__sms?.screen === 'game', { timeout: 10000 });
  await page.evaluate(() => {
    const w = (window as any).__sms.conn.host.world;
    w.players.forEach((p: any) => (p.invuln = 30));
  });
  // The host marine fights the first wave for real for a while.
  await page.mouse.move(1000, 450);
  await page.mouse.down();
  await sleep(8000);
  await page.mouse.up();
  await slaughter(page, [
    ['carnifex', 0, 1],
    ['carnifex', 2, 1],
    ['warrior', 1, 3],
    ['warrior', 0, 2],
    ['ravener', 3, 2],
    ['genestealer', 0, 4],
    ['genestealer', 2, 3],
    ['biovore', 1, 2],
    ['termagant', 0, 11],
    ['termagant', 1, 7],
    ['termagant', 3, 9],
    ['hormagaunt', 0, 14],
    ['hormagaunt', 2, 12],
    ['hormagaunt', 3, 6],
    ['hormagaunt', -1, 3],
    ['spore_mine', 1, 4],
    ['ripper', 2, 5],
    ['ripper', -1, 4],
  ]);
  await fallAndWait(page);
  const rows = await page.$$eval('table.kills tbody tr', (r) =>
    r.map((t) => (t.querySelector('.xeno')?.textContent ?? '').trim()),
  );
  console.log('   tally rows:', rows.join(' | '));
  check(rows.length >= 9, `squad tally lists every Tyranid type (${rows.length} rows)`);
  check(/Carnifex.*BOSS/.test(rows[0] ?? ''), 'the boss is listed first and tagged');
  const note = await page.$eval('.tally .note', (e) => e.textContent).catch(() => '');
  check(/7 caught/.test(note ?? ''), `uncredited kills noted ("${note}")`);
  await page.screenshot({ path: path.join(OUT, 'kill-summary.png'), fullPage: true });
  await page.close();

  // ---------------------------------------------------------------- solo
  const solo = await open('autosolo=1&name=Filip');
  await solo.waitForFunction(() => (window as any).__sms?.conn?.host?.world?.tick > 30, {
    timeout: 20000,
  });
  await slaughter(solo, [
    ['warrior', 0, 2],
    ['genestealer', 0, 3],
    ['termagant', 0, 9],
    ['hormagaunt', 0, 17],
    ['ripper', 0, 4],
  ]);
  await fallAndWait(solo);
  const soloRows = await solo.$$eval('table.kills tbody tr', (r) => r.length);
  check(soloRows >= 9, `solo tally lists every type (${soloRows} rows, unkilled dimmed)`);
  await solo.screenshot({ path: path.join(OUT, 'kill-summary-solo.png'), fullPage: true });
  await solo.close();
} finally {
  await browser.close();
}
check(errors.length === 0, `no page errors${errors.length ? `: ${errors.join(' | ')}` : ''}`);
if (failed) process.exitCode = 1;
