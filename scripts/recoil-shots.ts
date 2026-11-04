/**
 * Visual review: aim recoil. The reticle is drawn where the host shoots (input aim + recoil);
 * a faint dot marks the real mouse point while they differ.
 *   docs/review/recoil-<case>.png       1280x720 frame mid-burst (heavy bolter / meltagun)
 *   docs/review/recoil-<case>-zoom.png  crop around the mouse point + reticle
 * Cases: hb-standing, hb-walking, melta-walking. Needs a dev server or preview.
 * Usage: npx tsx scripts/recoil-shots.ts [clientUrl]
 */
import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import puppeteer, { type Page } from 'puppeteer-core';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(root, 'docs', 'review');
mkdirSync(OUT, { recursive: true });
const CLIENT = (process.argv[2] ?? 'http://localhost:5173/').replace(/\/?$/, '/');
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
    setInterval(() => {
      for (const e of w.enemies) {
        e.x = p.x - 900;
        e.y = p.y - 700;
        e.vx = e.vy = 0;
      }
    }, 8);
    // max recoil seen per burst (host truth)
    (window as any).__maxRc = 0;
    setInterval(() => {
      (window as any).__maxRc = Math.max((window as any).__maxRc, Math.abs(p.recoil));
    }, 4);
  });
}

async function arm(page: Page, weapon: string): Promise<void> {
  await page.evaluate((id: string) => {
    const w = (window as any).__sms.conn.host.world;
    const p = w.players[0];
    p.weapons = ['bolt_rifle', 'heavy_bolter', 'flamer', 'plasma_gun', 'meltagun', 'frag_grenade'];
    for (const k of p.weapons) p.ammo[k] = 999;
    p.current = id;
    p.reloadTimer = 0;
    p.fireCooldown = 0;
    p.recoil = 0;
    (window as any).__maxRc = 0;
  }, weapon);
}

interface Shot {
  rcDeg: number;
  maxDeg: number;
  moveFrac: number;
}

async function burst(page: Page, name: string, weapon: string, walk: boolean, fireMs: number) {
  const mouse = { x: 1060, y: 330 };
  await arm(page, weapon);
  await page.mouse.move(mouse.x, mouse.y);
  if (walk) await page.keyboard.down('KeyS');
  await sleep(walk ? 500 : 1100); // stride up / brace
  await page.mouse.down();
  await sleep(fireMs);
  await page.evaluate(() => (window as any).__setTimeScale(0.02)); // freeze-ish for the capture
  await sleep(120);
  const s: Shot = await page.evaluate(() => {
    const p = (window as any).__sms.conn.host.world.players[0];
    return {
      rcDeg: (p.recoil * 180) / Math.PI,
      maxDeg: ((window as any).__maxRc * 180) / Math.PI,
      moveFrac: p.moveFrac,
    };
  });
  await page.screenshot({ path: path.join(OUT, `recoil-${name}.png`) });
  const clip = { x: mouse.x - 160, y: mouse.y - 110, width: 320, height: 220 };
  await page.screenshot({ path: path.join(OUT, `recoil-${name}-zoom.png`), clip });
  await page.evaluate(() => (window as any).__setTimeScale(1));
  await page.mouse.up();
  if (walk) await page.keyboard.up('KeyS');
  await sleep(900);
  return s;
}

const browser = await puppeteer.launch({
  executablePath: process.env.CHROME_PATH ?? '/usr/bin/google-chrome',
  headless: true,
  args: ['--no-sandbox', '--autoplay-policy=no-user-gesture-required', '--use-gl=swiftshader'],
});
const rows: Record<string, Shot> = {};
try {
  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 720, deviceScaleFactor: 2 });
  await setup(page);
  await page.mouse.move(1060, 330);
  await sleep(1200);
  rows['hb-standing'] = await burst(page, 'hb-standing', 'heavy_bolter', false, 900);
  rows['hb-walking'] = await burst(page, 'hb-walking', 'heavy_bolter', true, 900);
  rows['melta-walking'] = await burst(page, 'melta-walking', 'meltagun', true, 120);
  await page.close();
} finally {
  await browser.close();
}
for (const [k, s] of Object.entries(rows))
  console.log(
    `${k}: recoil now ${s.rcDeg.toFixed(2)}°, burst max ${s.maxDeg.toFixed(2)}°, moveFrac ${s.moveFrac.toFixed(2)}`,
  );
check(rows['hb-standing'].maxDeg < rows['hb-walking'].maxDeg / 3, 'standing burst ≪ walking burst');
check(rows['hb-walking'].moveFrac > 0.9, 'walking case really walking');
check(rows['melta-walking'].maxDeg > 4, 'melta kick is big');
check(errors.length === 0, `no page errors${errors.length ? `: ${errors.join(' | ')}` : ''}`);
process.exit(failed ? 1 : 0);
