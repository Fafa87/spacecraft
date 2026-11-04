/**
 * Close-up of ONE front-plate ricochet for visual review, in slow motion (page clock scaled
 * to 8%) so frames can be sampled at precise game times.
 *   docs/review/deflect-<tag>.png        2× zoom on the hit ~35 ms (game time) after the ricochet
 *   docs/review/deflect-<tag>-strip.png  4 frames: ~10 / 60 / 130 / 220 ms
 * The roll is forced to succeed (screenshot only). Needs `npm run dev:client` (or a preview).
 * Usage: npx tsx scripts/deflect-fx.ts <tag> [clientUrl]
 */
import { execFileSync } from 'node:child_process';
import { mkdirSync, rmSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import puppeteer from 'puppeteer-core';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(root, 'docs', 'review');
const TMP = '/tmp/deflect-frames';
mkdirSync(OUT, { recursive: true });
rmSync(TMP, { recursive: true, force: true });
mkdirSync(TMP, { recursive: true });
const tag = process.argv[2] ?? 'after';
const CLIENT = (process.argv[3] ?? 'http://localhost:5173/').replace(/\/?$/, '/');
const SCALE = 0.08;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const browser = await puppeteer.launch({
  executablePath: process.env.CHROME_PATH ?? '/usr/bin/google-chrome',
  headless: true,
  args: ['--no-sandbox', '--autoplay-policy=no-user-gesture-required', '--use-gl=swiftshader'],
});
const errors: string[] = [];
try {
  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 720, deviceScaleFactor: 2 });
  await page.evaluateOnNewDocument(`
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
  `);
  page.on('pageerror', (e) => errors.push((e as Error).message));
  await page.goto(`${CLIENT}?firestore=0&demo=hive&name=Filip`, { waitUntil: 'load' });
  await page.waitForFunction(() => (window as any).__sms?.conn?.host?.world?.enemies?.length > 10, {
    timeout: 20000,
  });
  await page.mouse.move(1100, 330); // face right (slightly up)
  await page.evaluate(() => {
    const w = (window as any).__sms.conn.host.world;
    const p = w.players[0];
    p.invuln = 1e6;
    w.rng.chance = () => false;
    (window as any).__park = setInterval(() => {
      let i = 0;
      for (const e of w.enemies) {
        e.x = 150 + (i % 10) * 40;
        e.y = 150 + Math.floor(i++ / 10) * 40;
        e.vx = e.vy = 0;
      }
      for (const pr of w.projectiles) if (pr.owner !== 'enemy') pr.dead = true;
    }, 8);
  });
  await sleep(1500);
  // Marine's screen position (camera follows him) for the crop.
  const box = await page.evaluate(() => {
    const w = (window as any).__sms.conn.host.world;
    return { aim: w.players[0].aim as number };
  });
  await page.evaluate((scale: number) => {
    const w = (window as any).__sms.conn.host.world;
    const p = w.players[0];
    const chance = w.rng.chance;
    w.rng.chance = (q: number) => (q > 0.2 && q <= 0.3 ? true : chance(q));
    // one fleshborer coming in ~25° off the front, so the ricochet glances away
    const a = p.aim + 0.45;
    const sx = p.x + Math.cos(a) * 70;
    const sy = p.y + Math.sin(a) * 70;
    const l = Math.hypot(p.x - sx, p.y - sy);
    (window as any).__setTimeScale(scale);
    w.projectiles.push({
      id: w.nextId++,
      owner: 'enemy',
      ownerId: 0,
      kind: 'fleshborer',
      x: sx,
      y: sy,
      vx: ((p.x - sx) / l) * 450,
      vy: ((p.y - sy) / l) * 450,
      life: 2,
      radius: 6,
      damage: 7,
      pierceLeft: 0,
      ap: 0,
      drag: 0,
      knockback: 0,
      hit: [],
      dead: false,
    });
    // t0 = the moment the client spawns the ricochet effect (first particle after arming;
    // nothing else is firing), and its world position for the crop.
    const g = (window as any).__sms.game;
    const P = g.renderer.particles;
    const spawn = P.spawn.bind(P);
    (window as any).__t0 = 0;
    P.spawn = (q: any) => {
      if (!(window as any).__t0) {
        (window as any).__t0 = performance.now();
        (window as any).__hit = { x: q.x, y: q.y };
      }
      spawn(q);
    };
  }, SCALE);
  await page.waitForFunction(() => (window as any).__t0 > 0, { timeout: 20000, polling: 5 });
  const c = await page.evaluate(() => {
    const cam = (window as any).__sms.game.renderer.camera;
    const h = (window as any).__hit;
    return {
      x: (h.x - cam.x) * cam.zoom + cam.width / 2,
      y: (h.y - cam.y) * cam.zoom + cam.height / 2,
    };
  });
  const clip = { x: Math.round(c.x - 90), y: Math.round(c.y - 70), width: 180, height: 140 };
  const targets = [10, 35, 60, 130, 220];
  const frames: string[] = [];
  for (const ms of targets) {
    await page.waitForFunction(
      (m) => performance.now() - (window as any).__t0 >= m,
      { polling: 2 },
      ms,
    );
    const t = await page.evaluate(() => performance.now() - (window as any).__t0);
    const f = path.join(TMP, `f${ms}.png`);
    await page.screenshot({ path: f, clip });
    frames.push(f);
    console.log(`frame target ${ms} ms → ${t.toFixed(0)} ms`);
  }
  // Tight zoom (2×) on the hit point: 160×120 device px around it.
  const zoom = 'crop=160:120:100:70,scale=320:240:flags=neighbor';
  execFileSync('ffmpeg', [
    '-y',
    '-loglevel',
    'error',
    '-i',
    frames[1]!,
    '-vf',
    zoom,
    path.join(OUT, `deflect-${tag}.png`),
  ]);
  const strip = [frames[0]!, frames[2]!, frames[3]!, frames[4]!];
  const labels = ['10 ms', '60 ms', '130 ms', '220 ms'];
  const inputs = strip.flatMap((f) => ['-i', f]);
  const filt =
    strip
      .map(
        (_, i) =>
          `[${i}:v]${zoom},drawtext=text='${labels[i]}':x=6:y=6:fontsize=18:fontcolor=white:box=1:boxcolor=black@0.6[v${i}]`,
      )
      .join(';') + `;${strip.map((_, i) => `[v${i}]`).join('')}hstack=inputs=${strip.length}`;
  execFileSync('ffmpeg', [
    '-y',
    '-loglevel',
    'error',
    ...inputs,
    '-filter_complex',
    filt,
    path.join(OUT, `deflect-${tag}-strip.png`),
  ]);
  console.log(`✓ deflect-${tag}.png + deflect-${tag}-strip.png (aim ${box.aim.toFixed(2)})`);
} finally {
  await browser.close();
}
if (errors.length) {
  console.log(errors.join('\n'));
  process.exitCode = 1;
}
