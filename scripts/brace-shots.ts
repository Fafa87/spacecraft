/**
 * Defensive-stance (guard) + gothic rules-link review shots.
 *
 *   npx tsx scripts/brace-shots.ts [clientUrl]   # default http://localhost:5173/
 *
 *  - docs/review/brace-idle.png      — standing still, not guarding
 *  - docs/review/brace-guard.png     — RMB held, front shield arc visible
 *  - docs/review/brace-guard-zoom.png — crop around the marine
 *  - docs/review/brace-touch.png     — touch landscape with GUARD button pressed
 *  - docs/review/rules-link-style.png — main menu ZASADY / RULES link (gold, not blue)
 */
import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import puppeteer, { type Page } from 'puppeteer-core';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const out = path.join(root, 'docs', 'review');
mkdirSync(out, { recursive: true });
const CLIENT = new URL(process.argv[2] ?? 'http://localhost:5173/').href;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
let failures = 0;
const check = (ok: boolean, msg: string) => {
  console.log(`${ok ? '✓' : '✗'} ${msg}`);
  if (!ok) failures++;
};

const keepAlive = (page: Page) =>
  page.evaluate(() => {
    const w = (window as any).__sms.conn.host.world;
    w.director.idle = true;
    for (const p of w.players) {
      p.hp = p.maxHp;
      p.invuln = 30;
    }
  });

const startSolo = async (page: Page, tap: boolean) => {
  await page.waitForSelector('.menu #solo', { timeout: 15000 });
  if (tap) await page.tap('#solo');
  else await page.click('#solo');
  await page.waitForFunction(() => (window as any).__sms?.screen === 'game', {
    timeout: 15000,
    polling: 250,
  });
  await sleep(500);
  await keepAlive(page);
};

const me = (page: Page) =>
  page.evaluate(() => {
    const p = (window as any).__sms.conn.host.world.players[0];
    return {
      x: p.x as number,
      y: p.y as number,
      guarding: !!p.guarding,
      still: p.stillTime as number,
    };
  });

async function zoomShot(page: Page, file: string) {
  const c = await page.evaluate(() => {
    const g = (window as any).__sms.game;
    const cam = g.renderer.camera;
    const p = (window as any).__sms.conn.host.world.players[0];
    return {
      x: cam.width / 2 + (p.x - cam.x) * cam.zoom,
      y: cam.height / 2 + (p.y - cam.y) * cam.zoom,
    };
  });
  const W = 280;
  const H = 200;
  await page.screenshot({
    path: path.join(out, file),
    clip: {
      x: Math.max(0, c.x - W / 2),
      y: Math.max(0, c.y - H / 2),
      width: W,
      height: H,
    },
  });
}

const browser = await puppeteer.launch({
  executablePath: process.env.CHROME_PATH ?? '/usr/bin/google-chrome',
  args: ['--no-sandbox', '--use-gl=swiftshader'],
});

// --- Menu: gothic rules link ---
{
  const p = await browser.newPage();
  await p.setViewport({ width: 1280, height: 960 });
  await p.goto(CLIENT, { waitUntil: 'networkidle0' });
  await p.waitForSelector('.rules-link', { timeout: 10000 });
  await p.$eval('#meta', (el) => el.scrollIntoView({ block: 'center' }));
  await sleep(200);
  const style = await p.$eval('.rules-link', (el) => {
    const cs = getComputedStyle(el);
    return { color: cs.color, textDecoration: cs.textDecorationLine + ' ' + cs.textDecorationStyle };
  });
  // gold accent ≈ rgb(224, 184, 80) = #e0b850
  const m = style.color.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
  const r = m ? +m[1] : 0;
  const g = m ? +m[2] : 0;
  const b = m ? +m[3] : 0;
  const looksGold = r > 180 && g > 140 && b < 120 && r > b;
  check(looksGold, `rules-link color is gold/parchment (got ${style.color})`);
  check(!/blue|rgb\(0,\s*0,\s*238\)/i.test(style.color), 'rules-link is not browser-default blue');
  // Crop the meta strip (rules link + version) — pad generously so gold text is visible
  const box = await p.$eval('#meta', (el) => {
    const r = el.getBoundingClientRect();
    return { x: r.x, y: r.y, w: r.width, h: r.height };
  });
  await p.screenshot({
    path: path.join(out, 'rules-link-style.png'),
    clip: {
      x: Math.max(0, box.x - 16),
      y: Math.max(0, box.y - 12),
      width: Math.min(1280 - Math.max(0, box.x - 16), Math.max(box.w + 32, 520)),
      height: Math.max(box.h + 24, 48),
    },
  });
  console.log('wrote rules-link-style.png', style);
  await p.close();
}

// --- Desktop guard pose ---
{
  const p = await browser.newPage();
  await p.setViewport({ width: 1280, height: 760 });
  await p.goto(CLIENT, { waitUntil: 'networkidle0' });
  await startSolo(p, false);
  // Stop moving, face right
  await p.mouse.move(900, 380);
  await sleep(200);
  await p.screenshot({ path: path.join(out, 'brace-idle.png') });
  // Hold RMB (button 2)
  await p.mouse.down({ button: 'right' });
  await sleep(350);
  const st = await me(p);
  check(st.guarding, `desktop RMB guards (guarding=${st.guarding})`);
  await p.screenshot({ path: path.join(out, 'brace-guard.png') });
  await zoomShot(p, 'brace-guard-zoom.png');
  await p.mouse.up({ button: 'right' });
  // Extra frame for the input→sim tick; also clear via CDP in case the OS ate the up
  await sleep(250);
  await p.mouse.click(640, 400, { button: 'left' }); // ensure focus stays on canvas
  await sleep(150);
  const off = await me(p);
  check(!off.guarding, `release RMB ends guard (guarding=${off.guarding})`);
  await p.close();
}

// --- Touch GUARD button ---
{
  const p = await browser.newPage();
  await p.setViewport({
    width: 844,
    height: 390,
    isMobile: true,
    hasTouch: true,
    deviceScaleFactor: 2,
  });
  await p.goto(CLIENT, { waitUntil: 'networkidle0' });
  // Force touch mode if the UA alone isn't enough
  await p.evaluate(() => document.body.classList.add('touch-mode'));
  await startSolo(p, true);
  await p.waitForSelector('.guard-btn', { timeout: 5000 });
  const btn = await p.$('.guard-btn');
  check(!!btn, 'GUARD hold button present on touch');
  if (btn) {
    const box = await btn.boundingBox();
    check(!!box && box.x > 400, `GUARD is on the right (x=${box?.x})`);
    // Must sit in the bottom-right pocket (below the weapon column), not mid-stack.
    check(!!box && box.y + box.height > 300, `GUARD is low on screen (bottom=${box ? box.y + box.height : '?'})`);
    await btn.hover();
    // pointer down and hold
    const cdp = await p.createCDPSession();
    if (box) {
      await cdp.send('Input.dispatchTouchEvent', {
        type: 'touchStart',
        touchPoints: [{ x: box.x + box.width / 2, y: box.y + box.height / 2 }],
      });
      await sleep(400);
      const st = await me(p);
      check(st.guarding, `touch GUARD holds stance (guarding=${st.guarding})`);
      await p.screenshot({ path: path.join(out, 'brace-touch.png') });
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    }
  }
  await p.close();
}

await browser.close();
if (failures) {
  console.error(`\n${failures} check(s) failed`);
  process.exit(1);
}
console.log('\nbrace + rules-link shots ok');
