/**
 * Sprint review screenshots + checks against a served client (e.g. `vite preview` of build:pages):
 *
 *   npx tsx scripts/sprint-shots.ts [clientUrl]     # default http://localhost:5173/
 *
 *  - desktop 1280x760: D + Shift sprints (×1.7) with the weapon stowed on the back, held mouse
 *    button does not fire or cancel it                         -> docs/review/sprint-stowed.png
 *    release Shift: weapon raised over the 0.8 s delay          -> docs/review/sprint-ready-raise.png
 *    (+ *-zoom.png crops around the marine)
 *  - touch 844x390 + 667x375 landscape: move stick pushed past its ring into the sprint zone
 *    sprints (ring lit), back inside stops it; » SPRINT button bottom-right toggles; the right
 *    thumb aims/fires at the same time; button inside the viewport and clear of the other
 *    buttons + the weapon column  -> docs/review/sprint-touch-844x390.png, sprint-touch-667x375.png
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

/** Zoomed crop around my marine (the full-size shots show it small). */
async function zoomShot(page: Page, file: string) {
  const c = await page.evaluate(() => {
    const g = (window as any).__sms.game;
    const cam = g.renderer.camera;
    const p = g.conn?.host?.world?.players?.[0] ?? (window as any).__sms.conn.host.world.players[0];
    return {
      x: cam.width / 2 + (p.x - cam.x) * cam.zoom,
      y: cam.height / 2 + (p.y - cam.y) * cam.zoom,
    };
  });
  const W = 260;
  const H = 170;
  await page.screenshot({
    path: path.join(out, file),
    clip: {
      x: Math.max(0, c.x - W / 2),
      y: Math.max(0, c.y - H / 2),
      width: W,
      height: H,
      scale: 3,
    },
  });
}

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
  await page.screenshot({ path: path.join(out, 'sprint-stowed.png') });
  await zoomShot(page, 'sprint-stowed-zoom.png');
  await page.keyboard.up('ShiftLeft');
  await sleep(250);
  await zoomShot(page, 'sprint-ready-raise-zoom.png');
  const p2 = await me(page);
  check(
    !p2.sprinting && p2.delay > 0 && p2.ammo === p0.ammo,
    `desktop: release Shift -> weapon being raised, delay ${p2.delay.toFixed(2)} s, still no shot`,
  );
  await page.screenshot({ path: path.join(out, 'sprint-ready-raise.png') });
  await sleep(1000);
  const p3 = await me(page);
  check(p3.ammo < p0.ammo, `desktop: fires after the delay (ammo ${p0.ammo} → ${p3.ammo})`);
  await zoomShot(page, 'sprint-ready-zoom.png');
  await page.mouse.up();
  await page.keyboard.up('KeyD');
}

type Box = { x: number; y: number; w: number; h: number };
const hit = (a: Box, b: Box) =>
  a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;

async function touch(page: Page, W: number, H: number) {
  const tag = `touch ${W}x${H}`;
  await page.emulate({
    userAgent:
      'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
    viewport: {
      width: W,
      height: H,
      deviceScaleFactor: 2,
      isMobile: true,
      hasTouch: true,
      isLandscape: true,
    },
  });
  await page.goto(CLIENT, { waitUntil: 'networkidle0' });
  await startSolo(page, true);
  await sleep(300);
  const layout = await page.evaluate(() => {
    const btn = document.querySelector('.touch-layer .tb.sprint')!;
    const r = btn.getBoundingClientRect();
    const others = [...document.querySelectorAll('.touch-layer .tb:not(.sprint)')]
      .map((e) => e.getBoundingClientRect())
      .filter((o) => o.width > 0)
      .map((o) => ({ x: o.left, y: o.top, w: o.width, h: o.height }));
    const hud = (window as any).__sms.game.hud;
    const ui = hud.lastUi as number;
    const ins = hud.lastIns as { left: number; top: number };
    const slots = (
      hud.slotRects as {
        slot: number;
        owned: boolean;
        x: number;
        y: number;
        w: number;
        h: number;
      }[]
    ).map((q) => ({
      slot: q.slot,
      owned: q.owned,
      x: ins.left + q.x * ui,
      y: ins.top + q.y * ui,
      w: q.w * ui,
      h: q.h * ui,
    }));
    return {
      b: { x: r.left, y: r.top, w: r.width, h: r.height },
      others,
      slots,
      visible: getComputedStyle(btn).display !== 'none',
      inside: r.left >= 0 && r.top >= 0 && r.right <= innerWidth && r.bottom <= innerHeight,
      scrollX: document.documentElement.scrollWidth > innerWidth,
    };
  });
  const overBtn = layout.others.some((o) => hit(layout.b, o));
  const overSlot = layout.slots.some((o) => hit(layout.b, o));
  check(
    layout.visible &&
      layout.inside &&
      !overBtn &&
      !overSlot &&
      layout.slots.length > 0 &&
      !layout.scrollX &&
      layout.b.h >= 56 &&
      layout.b.x > W / 2,
    `${tag}: SPRINT button ${layout.b.w | 0}x${layout.b.h | 0} at (${layout.b.x | 0},${layout.b.y | 0}) right side, inside, clear of ${layout.others.length} buttons + ${layout.slots.length} weapon slots`,
  );
  const owned = layout.slots.find((q) => q.owned)!;
  const slotHit = await page.evaluate(
    (x, y) => (window as any).__sms.game.hud.slotAt(x, y) as number,
    owned.x + owned.w / 2,
    owned.y + owned.h / 2,
  );
  check(
    slotHit === owned.slot,
    `${tag}: weapon slot tap maps to slot ${slotHit} (want ${owned.slot})`,
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
  const tapBtn = async () => {
    const c = { x: layout.b.x + layout.b.w / 2, y: layout.b.y + layout.b.h / 2 };
    await start(5, c);
    await sleep(30);
    await end(5);
    await sleep(120);
  };
  const lit = () => page.evaluate(() => !!(window as any).__sms.game.input.touch.sprint.on);
  const btnOn = () => page.$eval('.tb.sprint', (b) => b.classList.contains('on'));
  const R = 60; // TOUCH_TUNING.move.radius
  const L = { x: 150, y: H - 110 };
  const at = (k: number) => ({ x: L.x + R * k * 0.92, y: L.y - R * k * 0.39 });
  // Left thumb: walk at full deflection, just inside the ring -> no sprint.
  await start(0, L);
  for (let i = 1; i <= 6; i++) {
    await move(0, at((0.9 * i) / 6));
    await sleep(16);
  }
  await sleep(300);
  const w0 = await me(page);
  check(!w0.sprinting && !(await lit()), `${tag}: stick at 0.9 × ring walks, no sprint`);
  // Right thumb aims + fires at the same time (multi-touch), away from the weapon column.
  const A = { x: Math.round(W * 0.6), y: Math.round(H * 0.55) };
  await start(1, A);
  for (let i = 1; i <= 4; i++) {
    await move(1, { x: A.x + 12 * i, y: A.y - 4 * i });
    await sleep(16);
  }
  await sleep(500);
  await me(page);
  // Push the left thumb out into the sprint zone.
  for (let i = 1; i <= 4; i++) {
    await move(0, at(0.9 + (0.45 * i) / 4));
    await sleep(16);
  }
  await sleep(200);
  const s0 = await me(page);
  await sleep(600);
  const s1 = await me(page);
  const ringLit = await lit();
  const toggled = await btnOn();
  check(
    s0.sprinting && s1.sprinting && ringLit && !toggled && s1.ammo === s0.ammo,
    `${tag}: stick pushed into the sprint zone (1.35 × ring) sprints, ring lit (${ringLit}), fire held but no shot (ammo ${s0.ammo} → ${s1.ammo})`,
  );
  if (W === 844 || W === 667)
    await page.screenshot({ path: path.join(out, `sprint-touch-${W}x${H}.png`) });
  // Back inside the ring -> sprint ends, weapon comes up, the held aim stick fires again.
  await move(0, at(0.95));
  await sleep(150);
  const s2 = await me(page);
  check(!s2.sprinting && !(await lit()), `${tag}: back inside the ring stops the sprint`);
  await sleep(1300);
  const s3 = await me(page);
  check(
    s3.ammo < s1.ammo,
    `${tag}: aim/fire thumb fires after the ready delay (ammo ${s1.ammo} → ${s3.ammo})`,
  );
  await end(1);
  // Button toggle with the right thumb while walking.
  await tapBtn();
  await sleep(300);
  const b1 = await me(page);
  check(
    b1.sprinting && (await btnOn()) && (await lit()),
    `${tag}: SPRINT button tap toggles sprint on`,
  );
  await tapBtn();
  await sleep(150);
  const b2 = await me(page);
  check(!b2.sprinting && !(await btnOn()), `${tag}: 2nd tap toggles it off`);
  await tapBtn();
  await end(0);
  await sleep(250);
  const b3 = await me(page);
  check(!b3.sprinting && !(await btnOn()), `${tag}: lifting the move stick ends a toggled sprint`);
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
  const runs: ((p: Page) => Promise<void>)[] = [
    desktop,
    (p) => touch(p, 844, 390),
    (p) => touch(p, 667, 375),
  ];
  for (const fn of runs) {
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
