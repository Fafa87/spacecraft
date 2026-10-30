/**
 * Captures docs/leap-windup.png: a Hormagaunt crouched mid wind-up and a Carnifex rearing
 * before its charge (needs `npm run dev`). The wind-up is held open by re-arming the charge
 * timer every tick, so the pose is caught at full extension.
 * Usage: npx tsx scripts/leap-shot.ts [clientUrl]   (always adds ?firestore=0)
 */
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import puppeteer from 'puppeteer-core';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = process.argv[3] ?? path.join(root, 'docs', 'leap-windup.png');
const CLIENT = (process.argv[2] ?? 'http://localhost:5173/').replace(/\/?$/, '/');
const CHROME = process.env.CHROME_PATH ?? '/usr/bin/google-chrome';
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

const browser = await puppeteer.launch({
  executablePath: CHROME,
  headless: true,
  args: ['--no-sandbox', '--autoplay-policy=no-user-gesture-required', '--use-gl=swiftshader'],
});
const errors: string[] = [];
try {
  const page = await browser.newPage();
  // tsx (esbuild keepNames) wraps named closures in __name(); define it in the page too
  await page.evaluateOnNewDocument('globalThis.__name = (f) => f');
  page.on('pageerror', (e) => errors.push((e as Error).message));
  await page.setViewport({ width: 1920, height: 1200, deviceScaleFactor: 2 });
  await page.goto(`${CLIENT}?firestore=0&demo=hive&name=Filip`, { waitUntil: 'load' });
  await page.waitForFunction(() => (window as any).__sms?.conn?.host?.world?.enemies?.length > 10, {
    timeout: 20000,
  });
  await sleep(600);
  const ok = await page.evaluate(() => {
    const app = (window as any).__sms;
    const w = app.conn.host.world;
    const p = w.players[0];
    const h = w.enemies.find((e: any) => e.type === 'hormagaunt');
    const c = w.enemies.find((e: any) => e.type === 'carnifex');
    if (!h || !c) return false;
    w.enemies.length = 0;
    w.enemies.push(h, c);
    if (w.projectiles) w.projectiles.length = 0;
    w.director.budget = 0;
    w.director.nextSurgeAt = w.time + 1e6;
    p.invuln = 1e6;
    const place = (e: any, x: number, y: number) => {
      e.x = x;
      e.y = y;
      e.vx = e.vy = 0;
      e.chargePhase = 1;
      e.chargeTimer = 10;
    };
    place(h, p.x + 95, p.y - 25);
    place(c, p.x - 150, p.y + 5);
    (window as any).__hold = setInterval(() => {
      for (const e of [h, c]) {
        e.chargePhase = 1;
        e.chargeTimer = 10;
        e.vx = e.vy = 0;
      }
      h.x = p.x + 95;
      h.y = p.y - 25;
      c.x = p.x - 150;
      c.y = p.y + 5;
      if (w.enemies.length !== 2) {
        w.enemies.length = 0;
        w.enemies.push(h, c);
      }
    }, 8);
    return true;
  });
  if (!ok) throw new Error('demo did not spawn a hormagaunt and a carnifex');
  await sleep(400);
  // clean deck: the removed swarm turned into corpses on the client; clear them, the blood and
  // the creep so the two poses read clearly
  await page.evaluate(() => {
    const r = (window as any).__sms.game.renderer;
    r.corpses.length = 0;
    r.creep.length = 0;
    r.particles.list.length = 0;
    r.decals.getContext('2d').clearRect(0, 0, r.decals.width, r.decals.height);
  });
  await sleep(1100); // both wind-ups at full extension (Carnifex 1.1 s), paw dust kicking
  // frame the pair: world -> CSS px through the live camera
  const box = await page.evaluate(() => {
    const app = (window as any).__sms;
    const cam = app.game.renderer.camera;
    const p = app.conn.host.world.players[0];
    const sx = (x: number) => (x - cam.x) * cam.zoom + cam.width / 2;
    const sy = (y: number) => (y - cam.y) * cam.zoom + cam.height / 2;
    return { x: sx(p.x - 255), y: sy(p.y - 110), w: 400 * cam.zoom, h: 200 * cam.zoom };
  });
  await page.screenshot({
    path: OUT,
    clip: { x: Math.max(0, box.x), y: Math.max(0, box.y), width: box.w, height: box.h },
  });
  console.log('wrote', OUT);
} finally {
  await browser.close();
}
if (errors.length) {
  console.error('page errors:', errors);
  process.exit(1);
}
