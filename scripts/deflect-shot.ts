/**
 * Review screenshot of the front-plate ricochet (docs/review/deflect.png + deflect-crop.png):
 * the marine faces right and a stream of Termagant fleshborer / Warrior deathspitter shots hits
 * his front plate; every one is forced to deflect (screenshot only) so the ping flash, sparks
 * and ricochet streaks are on screen. Needs `npm run dev:client`; always `?firestore=0`.
 * Usage: npx tsx scripts/deflect-shot.ts [clientUrl]
 */
import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import puppeteer from 'puppeteer-core';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(root, 'docs', 'review');
mkdirSync(OUT, { recursive: true });
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
  await page.setViewport({ width: 1280, height: 720, deviceScaleFactor: 1 });
  await page.evaluateOnNewDocument('globalThis.__name = (f) => f');
  page.on('pageerror', (e) => errors.push((e as Error).message));
  await page.goto(`${CLIENT}?firestore=0&demo=hive&name=Filip`, { waitUntil: 'load' });
  await page.waitForFunction(() => (window as any).__sms?.conn?.host?.world?.enemies?.length > 10, {
    timeout: 20000,
  });
  await page.mouse.move(1100, 360); // face right
  await page.evaluate(() => {
    const w = (window as any).__sms.conn.host.world;
    const p = w.players[0];
    p.invuln = 1e6;
    const chance = w.rng.chance.bind(w.rng);
    // Screenshot only: force every front-plate roll (0.21 / 0.30) to succeed.
    w.rng.chance = (q: number) => (q > 0.2 && q <= 0.3 ? true : chance(q));
    let k = 0;
    setInterval(() => {
      let i = 0;
      for (const e of w.enemies) {
        e.x = 200 + (i % 10) * 40;
        e.y = 200 + Math.floor(i++ / 10) * 40;
        e.vx = e.vy = 0;
      }
    }, 8);
    setInterval(() => {
      const kind = k++ % 2 ? 'fleshborer' : 'deathspitter';
      const off = ((k % 5) - 2) * 0.22; // fan of shots across the front arc
      const sx = p.x + Math.cos(off) * 120;
      const sy = p.y + Math.sin(off) * 120;
      const l = Math.hypot(p.x - sx, p.y - sy);
      w.projectiles.push({
        id: w.nextId++,
        owner: 'enemy',
        ownerId: 0,
        kind,
        x: sx,
        y: sy,
        vx: ((p.x - sx) / l) * 450,
        vy: ((p.y - sy) / l) * 450,
        life: 2,
        radius: 6,
        damage: kind === 'fleshborer' ? 7 : 10,
        pierceLeft: 0,
        ap: 0,
        drag: 0,
        knockback: 0,
        hit: [],
        dead: false,
      });
    }, 70);
  });
  let defl = 0;
  await page.exposeFunction('__countDefl', (n: number) => (defl += n));
  await sleep(1500);
  await page.screenshot({ path: path.join(OUT, 'deflect.png') });
  await page.screenshot({
    path: path.join(OUT, 'deflect-crop.png'),
    clip: { x: 440, y: 210, width: 400, height: 300 },
  });
  const hp = await page.evaluate(() => (window as any).__sms.conn.host.world.players[0].hp);
  console.log(`✓ deflect.png written (marine hp ${hp}); page errors: ${errors.length}`);
  void defl;
} finally {
  await browser.close();
}
if (errors.length) {
  console.log(errors.join('\n'));
  process.exitCode = 1;
}
