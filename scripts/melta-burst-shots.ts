/**
 * Visual review: meltagun end-of-range burst (a miss flashes the floor where the beam runs out).
 *   docs/review/melta-burst.png             1280x720 frame just after the burst
 *   docs/review/melta-burst-zoom.png        crop around the burst (heat flash + embers)
 *   docs/review/melta-burst-scorch-zoom.png same spot ~1.5 s later (faint scorch decal)
 *   docs/review/melta-burst-vs-frag-zoom.png a frag grenade blast at the same moment, for scale
 * Needs a dev server or preview.
 * Usage: npx tsx scripts/melta-burst-shots.ts [clientUrl]
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

interface Boom {
  x: number;
  y: number;
  r: number;
  k?: string;
}

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
    p.weapons = ['bolt_rifle', 'heavy_bolter', 'flamer', 'plasma_gun', 'meltagun', 'frag_grenade'];
    for (const k of p.weapons) p.ammo[k] = 999;
    // park the swarm far away so the beam hits nothing
    setInterval(() => {
      for (const e of w.enemies) {
        e.x = p.x - 900;
        e.y = p.y - 700;
        e.vx = e.vy = 0;
      }
    }, 8);
    (window as any).__booms = [] as unknown[];
    // record every boom the sim pushes (the host may run several ticks per frame)
    let evs: any[] = w.events;
    const hook = (arr: any[]) => {
      arr.push = (...items: any[]) => {
        for (const ev of items) {
          if (ev.e !== 'boom') continue;
          (window as any).__booms.push({ ...ev });
          // freeze right at the blast we are waiting for, so the capture shows its first frames
          if ((window as any).__freezeOn === (ev.k ?? 'plain'))
            (window as any).__setTimeScale(0.02);
        }
        return Array.prototype.push.apply(arr, items);
      };
      return arr;
    };
    hook(evs);
    Object.defineProperty(w, 'events', {
      get: () => evs,
      set: (v: any[]) => {
        evs = hook(v);
      },
    });
  });
}

async function fireAndCatch(
  page: Page,
  weapon: string,
  holdMs: number,
  kind?: string,
): Promise<Boom> {
  await page.evaluate(
    (id: string, k: string) => {
      const p = (window as any).__sms.conn.host.world.players[0];
      p.current = id;
      p.reloadTimer = 0;
      p.fireCooldown = 0;
      (window as any).__booms.length = 0;
      (window as any).__freezeOn = k;
    },
    weapon,
    kind ?? 'plain',
  );
  await sleep(600);
  await page.mouse.down();
  await sleep(holdMs);
  await page.mouse.up();
  await page.waitForFunction(
    (k) => (window as any).__booms.some((b: Boom) => b.k === (k ?? undefined)),
    { timeout: 5000, polling: 1 },
    kind ?? null,
  );
  await page.evaluate(() => ((window as any).__freezeOn = null));
  return page.evaluate(
    (k) => (window as any).__booms.find((b: Boom) => b.k === (k ?? undefined)),
    kind ?? null,
  );
}

async function screenOf(page: Page, b: Boom) {
  return page.evaluate((b: Boom) => {
    const cam = (window as any).__sms.game.renderer.camera;
    return {
      x: (b.x - cam.x) * cam.zoom + cam.width / 2,
      y: (b.y - cam.y) * cam.zoom + cam.height / 2,
    };
  }, b);
}

const browser = await puppeteer.launch({
  executablePath: process.env.CHROME_PATH ?? '/usr/bin/google-chrome',
  headless: true,
  args: ['--no-sandbox', '--autoplay-policy=no-user-gesture-required', '--use-gl=swiftshader'],
});
let melta: Boom | undefined;
let frag: Boom | undefined;
try {
  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 720, deviceScaleFactor: 2 });
  await setup(page);
  await page.mouse.move(1100, 360);
  await sleep(1200);

  melta = await fireAndCatch(page, 'meltagun', 60, 'melta');
  await sleep(2500); // ~50 ms of game time at 0.02
  const c = await screenOf(page, melta);
  const clip = (cx: number, cy: number) => ({
    x: Math.round(cx - 160),
    y: Math.round(cy - 110),
    width: 320,
    height: 220,
  });
  await page.screenshot({ path: path.join(OUT, 'melta-burst.png') });
  await page.screenshot({ path: path.join(OUT, 'melta-burst-zoom.png'), clip: clip(c.x, c.y) });
  await page.evaluate(() => (window as any).__setTimeScale(1));
  await sleep(1500);
  const c2 = await screenOf(page, melta);
  await page.screenshot({
    path: path.join(OUT, 'melta-burst-scorch-zoom.png'),
    clip: clip(c2.x, c2.y),
  });

  await page.mouse.move(1100, 560);
  frag = await fireAndCatch(page, 'frag_grenade', 60);
  await sleep(2500);
  const c3 = await screenOf(page, frag);
  await page.screenshot({
    path: path.join(OUT, 'melta-burst-vs-frag-zoom.png'),
    clip: clip(c3.x, c3.y),
  });
  await page.evaluate(() => (window as any).__setTimeScale(1));
  await page.close();
} finally {
  await browser.close();
}
console.log('melta burst', melta, 'frag', frag);
check(melta?.r === 66, 'melta burst radius from data (66)');
check(!!frag && frag.r === 120 && frag.k === undefined, 'frag blast is a plain boom (r 120)');
check(errors.length === 0, `no page errors${errors.length ? `: ${errors.join(' | ')}` : ''}`);
process.exit(failed ? 1 : 0);
