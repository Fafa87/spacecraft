/**
 * Sprint review screenshots + checks against a served client (e.g. `vite preview` of build:pages):
 *
 *   npx tsx scripts/sprint-shots.ts [clientUrl]     # default http://localhost:5173/
 *
 *  - desktop 1280x760: D + Shift sprints (×1.7), held mouse button does not fire or cancel it,
 *    stamina bar under the marine + greyed "SPRINT" weapon slot  -> docs/review/sprint-hud.png
 *    release Shift: 0.8 s weapon delay ("READY…")               -> docs/review/sprint-hud-ready.png
 *  - touch 844x390 landscape: » SPRINT button inside the viewport, not overlapping other
 *    controls; stick + tap toggles sprint, lifting the stick ends it
 *                                                                 -> docs/review/sprint-touch-844x390.png
 */
import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import puppeteer, { type CDPSession, type Page } from 'puppeteer-core';

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

const me = (page: Page) =>
  page.evaluate(() => {
    const p = (window as any).__sms.conn.host.world.players[0];
    return {
      x: p.x as number,
      y: p.y as number,
      ammo: p.ammo[p.current] as number,
      sprinting: !!p.sprint.sprinting,
      stamina: p.sprint.stamina as number,
      delay: p.sprint.weaponDelay as number,
      fire: !!p.input.fire,
    };
  });
const keepAlive = (page: Page) =>
  page.evaluate(() => {
    const w = (window as any).__sms.conn.host.world;
    w.director.idle = true; // quiet arena: the screenshots are about the HUD
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

async function desktop(page: Page) {
  await page.setViewport({ width: 1280, height: 760 });
  await page.goto(CLIENT, { waitUntil: 'networkidle0' });
  await startSolo(page, false);
  await page.mouse.move(1150, 380);
  const p0 = await me(page);
  await page.keyboard.down('KeyD');
  await page.keyboard.down('ShiftLeft');
  await page.mouse.down();
  await sleep(900);
  const p1 = await me(page);
  check(
    p1.sprinting && p1.stamina < 3 && p1.ammo === p0.ammo,
    `desktop: Shift+D sprints, held fire ignored (stamina ${p1.stamina.toFixed(2)}, ammo ${p0.ammo} → ${p1.ammo})`,
  );
  await page.screenshot({ path: path.join(out, 'sprint-hud.png') });
  await page.keyboard.up('ShiftLeft');
  await sleep(250);
  const p2 = await me(page);
  check(
    !p2.sprinting && p2.delay > 0 && p2.ammo === p0.ammo,
    `desktop: release Shift -> weapon delay ${p2.delay.toFixed(2)} s, still no shot`,
  );
  await page.screenshot({ path: path.join(out, 'sprint-hud-ready.png') });
  await sleep(1000);
  const p3 = await me(page);
  check(p3.ammo < p0.ammo, `desktop: fires after the delay (ammo ${p0.ammo} → ${p3.ammo})`);
  await page.mouse.up();
  await page.keyboard.up('KeyD');
}

async function touch(page: Page) {
  await page.emulate({
    userAgent:
      'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
    viewport: {
      width: 844,
      height: 390,
      deviceScaleFactor: 2,
      isMobile: true,
      hasTouch: true,
      isLandscape: true,
    },
  });
  await page.goto(CLIENT, { waitUntil: 'networkidle0' });
  await startSolo(page, true);
  const layout = await page.evaluate(() => {
    const btn = document.querySelector('.touch-layer .tb.sprint')!;
    const b = btn.getBoundingClientRect();
    const others = [...document.querySelectorAll('.touch-layer .tb:not(.sprint), .hud-slot, .slot')]
      .map((e) => e.getBoundingClientRect())
      .filter((o) => o.width > 0);
    const overlap = others.some(
      (o) => b.left < o.right && o.left < b.right && b.top < o.bottom && o.top < b.bottom,
    );
    return {
      b: { x: b.left, y: b.top, w: b.width, h: b.height },
      visible: getComputedStyle(btn).display !== 'none',
      inside: b.left >= 0 && b.top >= 0 && b.right <= innerWidth && b.bottom <= innerHeight,
      overlap,
      scrollX: document.documentElement.scrollWidth > innerWidth,
    };
  });
  check(
    layout.visible && layout.inside && !layout.overlap && !layout.scrollX && layout.b.h >= 44,
    `touch 844x390: SPRINT button ${layout.b.w | 0}x${layout.b.h | 0} at (${layout.b.x | 0},${layout.b.y | 0}), inside, no overlap, no h-scroll`,
  );
  const cdp: CDPSession = await page.createCDPSession();
  const touchPts = new Map<number, { x: number; y: number }>();
  const send = (type: string, pts: { id: number; x: number; y: number }[]) =>
    cdp.send('Input.dispatchTouchEvent', {
      type: type as 'touchStart',
      touchPoints: pts.map((p) => ({ ...p, radiusX: 8, radiusY: 8 })),
    });
  const all = () => [...touchPts].map(([id, p]) => ({ id, ...p }));
  const start = async (id: number, p: { x: number; y: number }) => {
    touchPts.set(id, p);
    await send('touchStart', all());
  };
  const move = async (id: number, p: { x: number; y: number }) => {
    touchPts.set(id, p);
    await send('touchMove', all());
  };
  const end = async (id: number) => {
    const p = touchPts.get(id)!;
    touchPts.delete(id);
    await send('touchEnd', [{ id, ...p }]);
  };
  const L = { x: 170, y: 390 - 100 };
  await start(0, L);
  for (let i = 1; i <= 6; i++) {
    await move(0, { x: L.x + 9 * i, y: L.y - 4 * i });
    await sleep(16);
  }
  await sleep(200);
  const c = { x: layout.b.x + layout.b.w / 2, y: layout.b.y + layout.b.h / 2 };
  await start(1, c);
  await end(1);
  await sleep(700);
  const s1 = await me(page);
  const on = await page.$eval('.tb.sprint', (b) => b.classList.contains('on'));
  check(s1.sprinting && on, `touch: stick + SPRINT tap sprints (button lit: ${on})`);
  await page.screenshot({ path: path.join(out, 'sprint-touch-844x390.png') });
  await end(0);
  await sleep(250);
  const s2 = await me(page);
  const off = await page.$eval('.tb.sprint', (b) => !b.classList.contains('on'));
  check(!s2.sprinting && off, 'touch: lifting the move stick ends the sprint (toggle off)');
}

const browser = await puppeteer.launch({
  executablePath: process.env.CHROME_PATH ?? '/usr/bin/google-chrome',
  headless: true,
  args: [
    '--no-sandbox',
    '--disable-background-timer-throttling',
    '--disable-renderer-backgrounding',
    '--disable-backgrounding-occluded-windows',
    '--use-gl=swiftshader',
    '--enable-unsafe-swiftshader',
  ],
});
const errors: string[] = [];
try {
  for (const fn of [desktop, touch]) {
    const ctx = await browser.createBrowserContext();
    const page = await ctx.newPage();
    page.on('pageerror', (e) => errors.push((e as Error).message));
    await fn(page);
    await ctx.close();
  }
} catch (e) {
  check(false, `crashed: ${(e as Error).stack}`);
} finally {
  await browser.close();
}
check(errors.length === 0, `no page errors${errors.length ? `: ${errors.join(' | ')}` : ''}`);
console.log(
  failures ? `\n${failures} check(s) failed` : '\nsprint shots OK — docs/review/sprint-*.png',
);
process.exit(failures ? 1 : 0);
