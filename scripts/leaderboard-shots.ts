/**
 * Visual review: leaderboard tabs without results are hidden (not greyed out).
 *   docs/review/leaderboard-desktop.png          menu, runs only for 2- and 4-marine squads
 *   docs/review/leaderboard-desktop-marines.png  same, MARINES · POINTS board
 *   docs/review/leaderboard-mobile.png           844x390 phone (landscape), same data
 *   docs/review/leaderboard-empty.png            no runs at all → no tabs, normal message
 * Seeds this browser's local table (?firestore=0). Needs a dev server or preview.
 * Usage: npx tsx scripts/leaderboard-shots.ts [clientUrl]
 */
import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { GAME_VERSION, leaderboardBoard } from '@sms/shared';
import puppeteer, { type Browser, type Page } from 'puppeteer-core';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(root, 'docs', 'review');
mkdirSync(OUT, { recursive: true });
const CLIENT = (process.argv[2] ?? 'http://localhost:5173/').replace(/\/?$/, '/');
const KEY = `sms.highscores.board-${leaderboardBoard(GAME_VERSION)}`;
let failed = 0;
const check = (ok: boolean, msg: string) => {
  if (!ok) failed++;
  console.log(`${ok ? 'PASS' : 'FAIL'} ${msg}`);
};

const run = (teamSize: number, i: number) => {
  const players = ['Filip', 'Bratek', 'Kasia', 'Tomek', 'Ola', 'Marek', 'Ewa', 'Jan'].slice(
    0,
    teamSize,
  );
  return {
    runId: `seed-${teamSize}-${i}`,
    id: `kept_seed-${teamSize}-${i}`,
    teamSize,
    players,
    survivalMs: 600_000 - i * 47_000 - teamSize * 9_000,
    wave: 14 - i,
    kills: 300 - i * 20,
    playerScores: players.map((_, s) => 900 - i * 80 - s * 35),
    playerKills: players.map((_, s) => 60 - i * 4 - s * 3),
    endedAt: new Date(Date.UTC(2026, 10, 1 + i, 20)).toISOString(),
    submittedAt: new Date(Date.UTC(2026, 10, 1 + i, 20)).toISOString(),
    version: GAME_VERSION,
    mode: 'p2p',
  };
};
const SEED = { 2: [0, 1, 2].map((i) => run(2, i)), 4: [0, 1].map((i) => run(4, i)) };

async function open(browser: Browser, seed: unknown, mobile: boolean): Promise<Page> {
  const page = await browser.newPage();
  if (mobile)
    await page.emulate({
      viewport: { width: 844, height: 390, deviceScaleFactor: 2, isMobile: true, hasTouch: true },
      userAgent:
        'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
    });
  else await page.setViewport({ width: 1280, height: 900 });
  await page.evaluateOnNewDocument(
    (key, value) => {
      localStorage.clear();
      if (value) localStorage.setItem(key, value);
    },
    KEY,
    seed ? JSON.stringify(seed) : '',
  );
  await page.goto(`${CLIENT}?firestore=0&name=Filip`, { waitUntil: 'load' });
  await page.waitForFunction(
    () => {
      const b = document.querySelector('.highscores tbody')?.textContent ?? '';
      return b && !b.includes('Loading');
    },
    { timeout: 15000 },
  );
  return page;
}

const visible = (page: Page, sel: string) =>
  page.$$eval(sel, (els) =>
    els.filter((e) => (e as HTMLElement).offsetParent !== null).map((e) => e.textContent?.trim()),
  );

async function shot(page: Page, name: string, mobile: boolean) {
  const el = await page.$('.highscores');
  await el!.evaluate((e) => e.scrollIntoView({ block: 'center' }));
  const file = path.join(OUT, `leaderboard-${name}.png`);
  if (mobile) await page.screenshot({ path: file as `${string}.png` });
  else await (await page.$('.scores'))!.screenshot({ path: file as `${string}.png` });
  console.log('wrote', path.relative(root, file));
}

const browser = await puppeteer.launch({
  executablePath: '/usr/bin/google-chrome',
  args: ['--no-sandbox', '--disable-gpu'],
});
try {
  for (const mobile of [false, true]) {
    const page = await open(browser, SEED, mobile);
    const tag = mobile ? 'mobile' : 'desktop';
    check(
      JSON.stringify(await visible(page, '.highscores .boards button')) ===
        JSON.stringify(['SQUADS · SURVIVAL', 'MARINES · POINTS']),
      `${tag}: both boards shown`,
    );
    const sizes = await visible(page, '.highscores .sizes button');
    check(JSON.stringify(sizes) === JSON.stringify(['2', '4']), `${tag}: squad sizes ${sizes}`);
    const active = await page.$eval('.highscores .sizes button.active', (e) => e.textContent);
    check(active === '2', `${tag}: empty SOLO replaced by first non-empty (2), got ${active}`);
    await shot(page, tag, mobile);
    await page.$eval('.highscores .boards button[data-board="marines"]', (b) =>
      (b as HTMLButtonElement).click(),
    );
    const msizes = await visible(page, '.highscores .sizes button');
    check(
      JSON.stringify(msizes) === JSON.stringify(['ALL', '2', '4']),
      `${tag}: marines sizes ${msizes}`,
    );
    if (!mobile) await shot(page, 'desktop-marines', false);
    await page.close();
  }
  const page = await open(browser, null, false);
  const tabs = await visible(page, '.highscores .tabs button');
  check(tabs.length === 0, `empty: no tabs shown (${tabs.length})`);
  const msg = await page.$eval('.highscores tbody', (e) => e.textContent?.trim());
  check(/No runs yet/.test(msg ?? ''), `empty: normal message "${msg}"`);
  await shot(page, 'empty', false);
} finally {
  await browser.close();
}
if (failed) {
  console.log(`${failed} check(s) failed`);
  process.exit(1);
}
