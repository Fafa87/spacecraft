/**
 * v0.6.0 hotfix: compact phone top-centre messages, against a served client (e.g. `vite preview`
 * of build:pages):
 *
 *   npx tsx scripts/banner-shots.ts [clientUrl]     # default http://localhost:5173/
 *
 * Touch 844x390 + 667x375 landscape, solo mission:
 *  - a Carnifex on the field: its health bar hugs the top of the safe area, in the free band
 *    between the top-left HUD block and the minimap   -> docs/review/boss-bar-mobile-WxH.png
 *  - boss bar + "WAVE N CLEARED" breather countdown + unlock / pickup / crate / teammate-down
 *    notices at once: stacked downward from the top, no overlaps, all inside the band
 *    -> docs/review/banners-mobile-WxH.png (+ banners-mobile-down-WxH.png: own marine down too)
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

interface R {
  x: number;
  y: number;
  w: number;
  h: number;
}
const overlap = (a: R, b: R) =>
  a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;

/** Keep the arena quiet and the marine alive; optionally a Carnifex far away, frozen. */
const stage = (page: Page, opts: { boss: boolean; banners: boolean; down?: boolean }) =>
  page.evaluate((o) => {
    const sms = (window as any).__sms;
    const w = sms.conn.host.world;
    w.director.idle = true;
    const p = w.players[0];
    p.hp = p.maxHp;
    p.invuln = 60;
    if (o.boss && !w.enemies.some((e: any) => e.type === 'carnifex' && !e.dead)) {
      const def = w.content.enemy('carnifex');
      w.enemies.push({
        id: w.nextId++,
        type: 'carnifex',
        x: Math.min(w.map.arena.width - 80, p.x + 700),
        y: p.y,
        vx: 0,
        vy: 0,
        angle: 0,
        hp: def.hp * 0.7,
        maxHp: def.hp,
        attackCooldown: 999,
        fuse: -1,
        strafe: 1,
        chargePhase: 0,
        chargeTimer: 0,
        chargeCooldown: 999,
        chargeDx: 0,
        chargeDy: 0,
        burrowed: false,
        synSpeed: 0,
        synDamage: 1,
        attackAnim: 0,
        dead: false,
        child: false,
        children: 0,
        spawnTimer: 0,
        hunt: false,
      });
    }
    if (o.banners) {
      // breather after wave 3 with its countdown + the real notice texts (fx.ts): unlock,
      // pickup, crate drop, a battle-brother down
      w.director.wave = Math.max(3, w.director.wave);
      w.director.phase = 'breather';
      w.director.nextWaveAt = w.time + 25;
      const g = sms.game;
      g.notify('Heavy Bolter unlocked — press 2 · ANTI-HORDE', 'good');
      g.notify('+ Medicae kit', 'good');
      g.notify('Supply crate dropped! (see minimap)', 'info');
      g.notify('Brother Kael is down! Stand next to them to revive.', 'bad');
    }
    if (o.down) {
      // own marine down (solo: straight to "fallen") -> the state alert joins the stack
      p.state = 'downed';
      p.downedTime = 0;
    }
  }, opts);

const geometry = (page: Page) =>
  page.evaluate(() => {
    const hud = (window as any).__sms.game.hud;
    const ui: number = hud.lastUi;
    const ins = hud.lastIns;
    const L = hud.layout;
    const css = (r: R) => ({
      x: ins.left + r.x * ui,
      y: ins.top + r.y * ui,
      w: r.w * ui,
      h: r.h * ui,
    });
    const w = (innerWidth - ins.left - ins.right) / ui;
    return {
      compact: !!L.compact,
      stack: (hud.topStack as R[]).map(css),
      block: L.block ? css(L.block) : null,
      minimap: css({ x: w - 206, y: 4, w: 198, h: 160 }),
      insTop: ins.top as number,
      ui,
      voice: [...document.querySelectorAll('.vx > *')]
        .map((e) => e.getBoundingClientRect())
        .filter((r) => r.width > 0)
        .map((r) => ({ x: r.x, y: r.y, w: r.width, h: r.height })),
    };
  });

async function run(page: Page, W: number, H: number) {
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
  await page.waitForSelector('.menu #solo', { timeout: 15000 });
  await page.tap('#solo');
  await page.waitForFunction(() => (window as any).__sms?.screen === 'game', {
    timeout: 15000,
    polling: 250,
  });
  await sleep(500);
  await page.touchscreen.tap(W * 0.75, H * 0.5); // touch layout active
  await stage(page, { boss: true, banners: false });
  await sleep(600);
  const g1 = await geometry(page);
  const boss = g1.stack[0];
  check(
    g1.compact && g1.stack.length === 1,
    `${tag}: compact layout, boss bar is the only top message`,
  );
  check(
    !!boss && boss.y <= g1.insTop + 8 * g1.ui + 1,
    `${tag}: boss bar hugs the top (y ${boss?.y.toFixed(1)} css px, safe-area top ${g1.insTop})`,
  );
  check(
    !!boss && !!g1.block && boss.x >= g1.block.x + g1.block.w && boss.x + boss.w <= g1.minimap.x,
    `${tag}: boss bar between the top-left block and the minimap`,
  );
  await page.screenshot({ path: path.join(out, `boss-bar-mobile-${W}x${H}.png`) });

  await stage(page, { boss: true, banners: true });
  await sleep(500);
  const g2 = await geometry(page);
  check(
    g2.stack.length === 3,
    `${tag}: boss bar + breather countdown + notices stacked (${g2.stack.length})`,
  );
  const sorted = g2.stack.every((r, i) => i === 0 || r.y >= g2.stack[i - 1].y + g2.stack[i - 1].h);
  check(sorted, `${tag}: stack grows downward without overlaps`);
  check(
    g2.stack[0].y <= g2.insTop + 8 * g2.ui + 1,
    `${tag}: first message at the top of the safe area`,
  );
  check(
    g2.stack.every(
      (r) =>
        !overlap(r, g2.block!) && !overlap(r, g2.minimap) && g2.voice.every((v) => !overlap(r, v)),
    ),
    `${tag}: no message overlaps the top-left block, minimap or voice controls`,
  );
  await page.screenshot({ path: path.join(out, `banners-mobile-${W}x${H}.png`) });

  await stage(page, { boss: true, banners: true, down: true });
  await sleep(500);
  const g3 = await geometry(page);
  check(
    g3.stack.length === 4 &&
      g3.stack.every((r, i) => i === 0 || r.y >= g3.stack[i - 1].y + g3.stack[i - 1].h) &&
      g3.stack.every((r) => !overlap(r, g3.block!) && !overlap(r, g3.minimap)),
    `${tag}: own downed/fallen alert joins the stack (${g3.stack.length} items), no overlaps`,
  );
  await page.screenshot({ path: path.join(out, `banners-mobile-down-${W}x${H}.png`) });
}

const browser = await puppeteer.launch({
  executablePath: process.env.CHROME_PATH ?? '/usr/bin/google-chrome',
  headless: true,
  args: ['--no-sandbox', '--use-gl=swiftshader', '--enable-unsafe-swiftshader'],
});
const errors: string[] = [];
try {
  for (const [W, H] of [
    [844, 390],
    [667, 375],
  ]) {
    const ctx = await browser.createBrowserContext();
    const page = await ctx.newPage();
    // tsx names inner arrow functions via __name(); give evaluate() bodies a no-op shim
    await page.evaluateOnNewDocument('globalThis.__name = (f) => f');
    page.on('pageerror', (e) => errors.push((e as Error).message));
    await run(page, W, H);
    await ctx.close();
  }
} catch (e) {
  check(false, `crashed: ${(e as Error).stack}`);
} finally {
  await browser.close();
}
check(errors.length === 0, `no page errors${errors.length ? `: ${errors.join(' | ')}` : ''}`);
console.log(
  failures
    ? `\n${failures} check(s) failed`
    : '\nbanner shots OK — docs/review/{boss-bar,banners}-mobile-*.png',
);
process.exit(failures ? 1 : 0);
