/**
 * v0.5 review screenshots into docs/review/ (needs `npm run dev`; always `?firestore=0`):
 *   weapon-roles-hud.png (+ -crop): desktop weapon bar with role tags, the active weapon's
 *     S/AP · roles tooltip and the pickup notice with roles;
 *   armour-bounce.png: bolt rifle vs Carnifex (2+ save): ricochet sparks only, no enemy markers;
 *   weapon-roles-hud-touch.png: the touch weapon column with role tags (iPhone 14 landscape).
 * Also measures the firing slow-down in the real client (marine distance walked with and
 * without the trigger held).
 * Usage: npx tsx scripts/v05-shots.ts [clientUrl]
 */
import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import puppeteer, { KnownDevices, type Page } from 'puppeteer-core';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(root, 'docs', 'review');
mkdirSync(OUT, { recursive: true });
const CLIENT = (process.argv[2] ?? 'http://localhost:5173/').replace(/\/?$/, '/');
const CHROME = process.env.CHROME_PATH ?? '/usr/bin/google-chrome';
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const check = (ok: boolean, msg: string) => {
  console.log(`${ok ? '✓' : '✗'} ${msg}`);
  if (!ok) process.exitCode = 1;
};
const errors: string[] = [];
const browser = await puppeteer.launch({
  executablePath: CHROME,
  headless: true,
  args: ['--no-sandbox', '--autoplay-policy=no-user-gesture-required', '--use-gl=swiftshader'],
});

async function demo(page: Page): Promise<void> {
  await page.evaluateOnNewDocument('globalThis.__name = (f) => f');
  page.on('pageerror', (e) => errors.push((e as Error).message));
  await page.goto(`${CLIENT}?firestore=0&demo=hive&name=Filip`, { waitUntil: 'load' });
  await page.waitForFunction(() => (window as any).__sms?.conn?.host?.world?.enemies?.length > 10, {
    timeout: 20000,
  });
  await page.evaluate(() => {
    const w = (window as any).__sms.conn.host.world;
    w.players[0].invuln = 1e6;
  });
}

/** Freeze every Tyranid in place (or park them far away) so a shot is readable. */
const holdEnemies = (page: Page, mode: 'away' | 'carnifex') =>
  page.evaluate((mode) => {
    const w = (window as any).__sms.conn.host.world;
    const p = w.players[0];
    clearInterval((window as any).__hold);
    (window as any).__hold = setInterval(() => {
      let k = 0;
      for (const e of w.enemies) {
        if (e.dead) continue;
        if (mode === 'carnifex' && e.type === 'carnifex') {
          e.x = p.x + 260;
          e.y = p.y - 10;
        } else {
          e.x = 200 + (k % 10) * 40;
          e.y = 200 + Math.floor(k++ / 10) * 40;
        }
        e.vx = e.vy = 0;
      }
    }, 8);
  }, mode);

try {
  // ---------------------------------------------------------------- desktop HUD
  const page = await browser.newPage();
  await page.setViewport({ width: 1600, height: 900, deviceScaleFactor: 1 });
  await demo(page);
  await holdEnemies(page, 'away');
  await page.keyboard.press('Digit5');
  await sleep(300);
  await page.evaluate(() => {
    const w = (window as any).__sms.conn.host.world;
    const p = w.players[0];
    w.pickups.push({
      id: w.nextId++,
      kind: 'weapon',
      weapon: 'meltagun',
      x: p.x,
      y: p.y,
      life: 20,
    });
  });
  await sleep(700);
  await page.screenshot({ path: path.join(OUT, 'weapon-roles-hud.png') });
  await page.screenshot({
    path: path.join(OUT, 'weapon-roles-hud-crop.png'),
    clip: { x: 300, y: 640, width: 1000, height: 260 },
  });
  const cur = await page.evaluate(() => (window as any).__sms.conn.host.world.players[0].current);
  check(cur === 'meltagun', `desktop HUD with role tags, melta selected (weapon-roles-hud.png)`);

  // ---------------------------------------------------------------- firing slow-down
  await page.keyboard.press('Digit1');
  await sleep(200);
  const walk = async (fire: boolean) => {
    await page.evaluate(() => {
      const p = (window as any).__sms.conn.host.world.players[0];
      p.x = 1200;
      p.y = 1100;
    });
    await page.mouse.move(300, 450);
    if (fire) await page.mouse.down();
    await sleep(250);
    const x0 = await page.evaluate(() => (window as any).__sms.conn.host.world.players[0].x);
    await page.keyboard.down('KeyD');
    await sleep(1000);
    await page.keyboard.up('KeyD');
    const x1 = await page.evaluate(() => (window as any).__sms.conn.host.world.players[0].x);
    if (fire) await page.mouse.up();
    await sleep(500);
    return x1 - x0;
  };
  const free = await walk(false);
  const firing = await walk(true);
  check(
    firing / free > 0.7 && firing / free < 0.9,
    `bolt rifle: walked ${free.toFixed(0)} px/s idle vs ${firing.toFixed(0)} px/s firing (×${(firing / free).toFixed(2)}, fireMoveMul 0.8)`,
  );

  // ---------------------------------------------------------------- armour bounce
  await holdEnemies(page, 'carnifex');
  const hp0 = await page.evaluate(
    () => (window as any).__sms.conn.host.world.enemies.find((e: any) => e.type === 'carnifex')?.hp,
  );
  const p = await page.evaluate(() => {
    const w = (window as any).__sms.conn.host.world;
    return { x: w.players[0].x, y: w.players[0].y };
  });
  void p;
  await page.mouse.move(1100, 445);
  await page.mouse.down();
  await sleep(1300);
  await page.screenshot({ path: path.join(OUT, 'armour-bounce.png') });
  await sleep(700);
  await page.mouse.up();
  const hp1 = await page.evaluate(
    () => (window as any).__sms.conn.host.world.enemies.find((e: any) => e.type === 'carnifex')?.hp,
  );
  check(
    hp1 !== undefined && hp0 - hp1 < hp0 * 0.08,
    `bolt rifle vs Carnifex for 2 s: ${(hp0 - hp1).toFixed(0)} / ${hp0.toFixed(0)} HP (armour-bounce.png)`,
  );
  await page.close();

  // ---------------------------------------------------------------- touch HUD
  const ctx = await browser.createBrowserContext();
  const tp = await ctx.newPage();
  await tp.emulate(KnownDevices['iPhone 14 landscape']);
  await demo(tp);
  await holdEnemies(tp, 'away');
  await sleep(800);
  await tp.screenshot({ path: path.join(OUT, 'weapon-roles-hud-touch.png') });
  const touch = await tp.evaluate(() => document.body.classList.contains('touch-mode'));
  check(touch, 'touch HUD with role tags (weapon-roles-hud-touch.png)');
  await ctx.close();
} finally {
  await browser.close();
}
check(errors.length === 0, `no page errors${errors.length ? `: ${errors.join(' | ')}` : ''}`);
