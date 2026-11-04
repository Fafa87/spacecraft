/**
 * Visual review: every weapon's shot leaves the barrel tip of the drawn weapon.
 *   docs/review/muzzle-<weapon>.png       1280x720 frame ~30 ms (game time) after the shot
 *   docs/review/muzzle-<weapon>-zoom.png  3x zoomed crop on the marine + muzzle
 *   docs/review/muzzle-raise-zoom.png     first shot as the weapon comes up after a sprint
 *   docs/review/muzzle-mobile.png         844x390 touch, right stick firing
 * Page clock is slowed (8%) so frames land at precise game times. Needs a dev server or preview.
 * Usage: npx tsx scripts/muzzle-shots.ts [clientUrl]
 */
import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import puppeteer, { type Page } from 'puppeteer-core';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(root, 'docs', 'review');
mkdirSync(OUT, { recursive: true });
const CLIENT = (process.argv[2] ?? 'http://localhost:5173/').replace(/\/?$/, '/');
const SCALE = 0.08;
const WEAPONS = ['bolt_rifle', 'heavy_bolter', 'flamer', 'plasma_gun', 'meltagun', 'frag_grenade'];
const AFTER_MS: Record<string, number> = { flamer: 140, frag_grenade: 60 };
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const errors: string[] = [];
let failed = 0;
const check = (ok: boolean, msg: string) => {
  if (!ok) failed++;
  console.log(`${ok ? 'PASS' : 'FAIL'} ${msg}`);
};

const CLOCK = `
  globalThis.__name = (f) => f;
  (() => {
    const realNow = performance.now.bind(performance);
    let scale = 1, baseReal = realNow(), baseVirt = baseReal;
    const now = () => baseVirt + (realNow() - baseReal) * scale;
    globalThis.__setTimeScale = (s) => { baseVirt = now(); baseReal = realNow(); scale = s; };
    performance.now = now;
    const raf = globalThis.requestAnimationFrame.bind(globalThis);
    globalThis.requestAnimationFrame = (cb) => raf(() => cb(now()));
    const si = globalThis.setInterval.bind(globalThis), st = globalThis.setTimeout.bind(globalThis);
    globalThis.setInterval = (f, ms, ...a) => si(f, (ms ?? 0) / scale, ...a);
    globalThis.setTimeout = (f, ms, ...a) => st(f, (ms ?? 0) / scale, ...a);
  })();
`;

async function setup(page: Page): Promise<void> {
  await page.evaluateOnNewDocument(CLOCK);
  page.on('pageerror', (e) => errors.push((e as Error).message));
  await page.goto(`${CLIENT}?firestore=0&demo=hive&name=Filip`, { waitUntil: 'load' });
  await page.waitForFunction(() => (window as any).__sms?.conn?.host?.world?.enemies?.length > 5, {
    timeout: 20000,
  });
  await page.evaluate(() => {
    const w = (window as any).__sms.conn.host.world;
    const p = w.players[0];
    p.invuln = 1e6;
    (window as any).__park = setInterval(() => {
      // keep the swarm far away so the shots fly clean
      for (const e of w.enemies) {
        e.x = p.x - 900;
        e.y = p.y - 700;
        e.vx = e.vy = 0;
      }
    }, 8);
    const r = (window as any).__sms.game.renderer;
    const reg = r.registerShot.bind(r);
    (window as any).__shot = null;
    r.registerShot = (sx: number, sy: number, a: number, mx: number, my: number) => {
      if (!(window as any).__shot)
        (window as any).__shot = { t: performance.now(), mx, my, sx, sy };
      reg(sx, sy, a, mx, my);
    };
  });
}

async function arm(page: Page, weapon: string): Promise<void> {
  await page.evaluate((id: string) => {
    const w = (window as any).__sms.conn.host.world;
    const p = w.players[0];
    p.weapons = ['bolt_rifle', 'heavy_bolter', 'flamer', 'plasma_gun', 'meltagun', 'frag_grenade'];
    for (const k of p.weapons) p.ammo[k] = 999;
    for (const k of Object.keys(p.heat)) p.heat[k] = 0;
    p.current = id;
    p.reloadTimer = 0;
    p.venting = false;
    p.fireCooldown = 0;
    for (const pr of w.projectiles) if (pr.owner !== 'enemy') pr.dead = true;
    (window as any).__shot = null;
  }, weapon);
}

async function capture(page: Page, name: string, ms: number, zoomOnly = false): Promise<boolean> {
  const ok = await page
    .waitForFunction(() => (window as any).__shot, { timeout: 15000, polling: 2 })
    .then(() => true)
    .catch(() => false);
  if (!ok) return false;
  await page.waitForFunction(
    (m: number) => performance.now() - (window as any).__shot.t >= m,
    { polling: 2 },
    ms,
  );
  const c = await page.evaluate(() => {
    const cam = (window as any).__sms.game.renderer.camera;
    const s = (window as any).__shot;
    const w = (window as any).__sms.conn.host.world;
    const p = w.players[0];
    const toS = (x: number, y: number) => ({
      x: (x - cam.x) * cam.zoom + cam.width / 2,
      y: (y - cam.y) * cam.zoom + cam.height / 2,
    });
    return { m: toS(s.mx, s.my), p: toS(p.x, p.y) };
  });
  const cx = (c.m.x + c.p.x) / 2 + 30;
  const cy = (c.m.y + c.p.y) / 2;
  const clip = { x: Math.round(cx - 110), y: Math.round(cy - 70), width: 220, height: 140 };
  await page.screenshot({ path: path.join(OUT, `muzzle-${name}-zoom.png`), clip });
  if (!zoomOnly) await page.screenshot({ path: path.join(OUT, `muzzle-${name}.png`) });
  return true;
}

const browser = await puppeteer.launch({
  executablePath: process.env.CHROME_PATH ?? '/usr/bin/google-chrome',
  headless: true,
  args: ['--no-sandbox', '--autoplay-policy=no-user-gesture-required', '--use-gl=swiftshader'],
});
try {
  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 720, deviceScaleFactor: 3 });
  await setup(page);
  await page.mouse.move(1100, 300); // aim right, slightly up
  await sleep(1200);
  for (const wpn of WEAPONS) {
    await arm(page, wpn);
    await sleep(1100); // weapon switch / raise settles
    await page.evaluate((s: number) => (window as any).__setTimeScale(s), SCALE);
    await page.evaluate(() => ((window as any).__shot = null));
    await page.mouse.down();
    const ok = await capture(page, wpn, AFTER_MS[wpn] ?? 30);
    await page.mouse.up();
    await page.evaluate(() => (window as any).__setTimeScale(1));
    const d = await page.evaluate(() => {
      const s = (window as any).__shot;
      return s ? Math.hypot(s.mx - s.sx, s.my - s.sy) : -1;
    });
    check(ok, `${wpn}: shot captured, visual muzzle ${d.toFixed(1)} px from the sim muzzle`);
    await sleep(600);
  }

  // first shot the moment the post-sprint weapon raise allows it (trigger held through it) (aim down-left to vary the angle)
  await arm(page, 'bolt_rifle');
  await page.mouse.move(300, 560);
  await page.keyboard.down('ShiftLeft');
  await page.keyboard.down('KeyD');
  await sleep(900);
  await page.evaluate(() => ((window as any).__shot = null));
  await page.mouse.down();
  await page.evaluate((s: number) => (window as any).__setTimeScale(s), SCALE);
  await page.keyboard.up('KeyD');
  await page.keyboard.up('ShiftLeft');
  const okR = await capture(page, 'raise', 30, true);
  await page.mouse.up();
  await page.evaluate(() => (window as any).__setTimeScale(1));
  check(okR, 'shot right after a sprint (muzzle-raise-zoom.png)');
  await page.close();

  // mobile 844x390, right stick
  const ctx = await browser.createBrowserContext();
  const tp = await ctx.newPage();
  await tp.setViewport({
    width: 844,
    height: 390,
    deviceScaleFactor: 3,
    isMobile: true,
    hasTouch: true,
    isLandscape: true,
  });
  await setup(tp);
  await arm(tp, 'heavy_bolter');
  await sleep(1200);
  await tp.evaluate((s: number) => (window as any).__setTimeScale(s), SCALE);
  await tp.evaluate(() => ((window as any).__shot = null));
  await tp.touchscreen.touchStart(640, 260);
  await tp.touchscreen.touchMove(700, 230);
  const okM = await capture(tp, 'mobile', 40);
  await tp.touchscreen.touchEnd();
  check(okM, 'mobile 844x390 right-stick fire (muzzle-mobile.png)');
  await ctx.close();
} finally {
  await browser.close();
}
check(errors.length === 0, `no page errors${errors.length ? `: ${errors.join(' | ')}` : ''}`);
process.exit(failed ? 1 : 0);
