/**
 * Captures the README screenshots for the Hive Siege look (needs `npm run dev`):
 *   docs/wh-menu.png      menu with chapter picker
 *   docs/wh-gameplay.png  `?demo=hive` staged fight (several Tyranid types, boss)
 *   docs/wh-mobile.png    the same on an emulated phone (touch controls)
 * Usage: npx tsx scripts/wh-shots.ts [clientUrl]   (always adds ?firestore=0)
 */
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import puppeteer, { type Page } from 'puppeteer-core';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const docs = path.join(root, 'docs');
const CLIENT = (process.argv[2] ?? 'http://localhost:5173/').replace(/\/?$/, '/');
const CHROME = process.env.CHROME_PATH ?? '/usr/bin/google-chrome';
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

const errors: string[] = [];
function watch(page: Page): void {
  page.on('pageerror', (e) => errors.push((e as Error).message));
}

async function fight(page: Page, ms: number, touch: boolean): Promise<void> {
  const vp = page.viewport()!;
  const cx = vp.width / 2;
  const cy = vp.height / 2;
  if (!touch) {
    await page.mouse.move(cx + 220, cy - 60);
    await page.mouse.down();
  }
  const t0 = Date.now();
  let i = 0;
  while (Date.now() - t0 < ms) {
    const a = i++ * 0.7;
    if (!touch) await page.mouse.move(cx + Math.cos(a) * 240, cy + Math.sin(a) * 160);
    await sleep(120);
  }
  if (!touch) await page.mouse.up();
}

const browser = await puppeteer.launch({
  executablePath: CHROME,
  headless: true,
  args: ['--no-sandbox', '--autoplay-policy=no-user-gesture-required', '--use-gl=swiftshader'],
});
try {
  // Menu
  const menu = await browser.newPage();
  watch(menu);
  await menu.setViewport({ width: 1440, height: 900 });
  await menu.goto(`${CLIENT}?firestore=0`, { waitUntil: 'networkidle0' });
  await menu.waitForSelector('.menu .chapter-chip', { timeout: 15000 });
  const chips = await menu.$$('.menu .chapter-chip');
  if (chips[1]) await chips[1].click();
  await sleep(600);
  await menu.screenshot({ path: path.join(docs, 'wh-menu.png') });
  await menu.close();

  // Desktop gameplay
  const game = await browser.newPage();
  watch(game);
  await game.setViewport({ width: 1440, height: 900 });
  await game.goto(`${CLIENT}?firestore=0&demo=hive&name=Filip`, { waitUntil: 'load' });
  await game.waitForFunction(() => (window as any).__sms?.conn?.host?.world?.enemies?.length > 10, {
    timeout: 20000,
  });
  await fight(game, 1800, false);
  await game.mouse.down();
  await sleep(250);
  await game.screenshot({ path: path.join(docs, 'wh-gameplay.png') });
  await game.mouse.up();
  const kinds = await game.evaluate(() => {
    const w = (window as any).__sms.conn.host.world;
    const s = new Set<string>();
    for (const e of w.enemies) s.add(e.type);
    return [...s];
  });
  console.log('enemy kinds on screen:', kinds.join(', '));
  await game.close();

  // Mobile gameplay
  const mob = await browser.newPage();
  watch(mob);
  await mob.emulate({
    viewport: {
      width: 844,
      height: 390,
      deviceScaleFactor: 2,
      isMobile: true,
      hasTouch: true,
      isLandscape: true,
    },
    userAgent:
      'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
  });
  await mob.goto(`${CLIENT}?firestore=0&demo=hive&name=Filip`, { waitUntil: 'load' });
  await mob.waitForFunction(() => (window as any).__sms?.conn?.host?.world?.enemies?.length > 10, {
    timeout: 20000,
  });
  await fight(mob, 1500, true);
  await mob.screenshot({ path: path.join(docs, 'wh-mobile.png') });
  await mob.close();
} finally {
  await browser.close();
}
console.log(errors.length ? `page errors:\n${errors.join('\n')}` : 'no page errors');
process.exit(errors.length ? 1 : 0);
