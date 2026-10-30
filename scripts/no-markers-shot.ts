/**
 * v0.4.2 check: no markers on enemies and no warning where the swarm comes from.
 * Starts a solo run (needs `npm run dev`, always `?firestore=0`), forces the end-of-wave hunt
 * and waits for a breach telegraph, then records every HUD/world text drawn for 1.5 s and
 * saves docs/review/no-markers.png.
 * Usage: npx tsx scripts/no-markers-shot.ts [clientUrl]
 */
import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import puppeteer from 'puppeteer-core';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(root, 'docs', 'review');
mkdirSync(OUT, { recursive: true });
const CLIENT = (process.argv[2] ?? 'http://localhost:5173/').replace(/\/?$/, '/');
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
let failed = 0;
const check = (ok: boolean, msg: string) => {
  console.log(`${ok ? '✓' : '✗'} ${msg}`);
  if (!ok) failed++;
};

const browser = await puppeteer.launch({
  executablePath: process.env.CHROME_PATH ?? '/usr/bin/google-chrome',
  headless: true,
  args: ['--no-sandbox', '--autoplay-policy=no-user-gesture-required', '--use-gl=swiftshader'],
});
try {
  const page = await browser.newPage();
  await page.evaluateOnNewDocument(`
    globalThis.__name = (f) => f;
    globalThis.__texts = new Set();
    const ft = CanvasRenderingContext2D.prototype.fillText;
    CanvasRenderingContext2D.prototype.fillText = function (t, ...a) {
      if (globalThis.__rec) globalThis.__texts.add(String(t));
      return ft.call(this, t, ...a);
    };`);
  await page.setViewport({ width: 1600, height: 900, deviceScaleFactor: 1 });
  await page.goto(`${CLIENT}?firestore=0`, { waitUntil: 'load' });
  await page.waitForSelector('.menu #solo', { timeout: 15000 });
  await page.click('#solo');
  await page.waitForFunction(() => (window as any).__sms?.screen === 'game', { timeout: 15000 });
  await page.mouse.move(1100, 450);
  await page.mouse.down();
  // Wait for a pending breach telegraph with xenos alive; force the straggler hunt meanwhile.
  const state = await page
    .waitForFunction(
      () => {
        const sms = (window as any).__sms;
        const w = sms.conn.host.world;
        const p = w.players[0];
        p.hp = p.maxHp;
        p.invuln = 5;
        const alive = w.enemies.filter((e: any) => !e.dead && !e.burrowed);
        if (alive.length) {
          w.director.hunting = true;
          // keep a few hunting xenos on screen, right of the marine
          p.x = Math.max(200, Math.min(3000, alive[0].x - 320));
          p.y = Math.max(200, Math.min(2000, alive[0].y));
        }
        const snap = sms.game?.buffer?.latest;
        const tele = (snap?.sp ?? []).some((s: number) => s > 0);
        const hunters = (snap?.enemies ?? []).filter((e: number[]) => e[6] & 64).length;
        return tele && snap?.wv?.h && hunters >= 3 ? { hunters, sp: snap.sp } : false;
      },
      { timeout: 60000, polling: 50 },
    )
    .then((h) => h.jsonValue() as Promise<{ hunters: number; sp: number[] }>)
    .catch(() => null);
  check(
    !!state,
    `sim is in hunt mode with a breach telegraph pending (${state?.hunters} hunters, sp=${state?.sp})`,
  );
  await page.evaluate(() => ((window as any).__rec = true));
  await sleep(1500);
  await page.evaluate(() => {
    const w = (window as any).__sms.conn.host.world;
    const p = w.players[0];
    const e = w.enemies.find((q: any) => !q.dead && !q.burrowed);
    if (e) {
      p.x = Math.max(200, e.x - 320);
      p.y = e.y;
    }
  });
  await sleep(500);
  await page.screenshot({ path: path.join(OUT, 'no-markers.png') });
  const texts = await page.evaluate(() => [...(window as any).__texts] as string[]);
  const bad = texts.filter((t) => /^(BREACH|VENT|TUNNEL)$|revealed/i.test(t));
  check(
    bad.length === 0,
    `no BREACH / VENT / TUNNEL labels drawn (texts: ${bad.join(', ') || 'none'})`,
  );
  await page.mouse.up();
} finally {
  await browser.close();
}
if (failed) process.exitCode = 1;
