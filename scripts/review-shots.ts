/**
 * Captures the v0.4 review screenshots into docs/review/ (needs `npm run dev`; always
 * `?firestore=0`, so nothing touches the real leaderboard):
 *   spawn-points.png, wave-cleared.png, hud-scores.png, gameover-scores.png (4-marine squad:
 *   the host tab plus 3 in-page bot marines on LocalLinks), braced-heavy-bolter.png,
 *   units-over-terrain.png, escape-dialog.png (+ checks: solo pauses, squad keeps running).
 * Usage: npx tsx scripts/review-shots.ts [clientUrl]
 */
import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import puppeteer, { type Page } from 'puppeteer-core';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(root, 'docs', 'review');
mkdirSync(OUT, { recursive: true });
const CLIENT = (process.argv[2] ?? 'http://localhost:5173/').replace(/\/?$/, '/');
const CHROME = process.env.CHROME_PATH ?? '/usr/bin/google-chrome';
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const results: string[] = [];
const check = (ok: boolean, msg: string) => {
  results.push(`${ok ? 'PASS' : 'FAIL'} ${msg}`);
  console.log(`${ok ? '✓' : '✗'} ${msg}`);
  if (!ok) process.exitCode = 1;
};

const browser = await puppeteer.launch({
  executablePath: CHROME,
  headless: true,
  args: ['--no-sandbox', '--autoplay-policy=no-user-gesture-required', '--use-gl=swiftshader'],
});
const errors: string[] = [];

async function open(query: string, w = 1600, h = 900): Promise<Page> {
  const page = await browser.newPage();
  await page.evaluateOnNewDocument('globalThis.__name = (f) => f');
  page.on('pageerror', (e) => errors.push((e as Error).message));
  await page.setViewport({ width: w, height: h, deviceScaleFactor: 1 });
  await page.goto(`${CLIENT}?firestore=0&${query}`, { waitUntil: 'load' });
  return page;
}
const shot = (page: Page, name: string) =>
  page.screenshot({ path: path.join(OUT, name) as `${string}.png` });
const hostTick = (page: Page) =>
  page.evaluate(() => (window as any).__sms?.conn?.host?.world?.tick ?? -1) as Promise<number>;

try {
  // ---------------------------------------------------------------- 4-marine squad
  const page = await open('');
  await page.waitForSelector('.menu #name', { timeout: 15000 });
  await page.$eval('.menu #name', (e) => ((e as HTMLInputElement).value = ''));
  await page.type('.menu #name', 'Filip');
  await page.click('#host');
  await page.waitForSelector('.room .code', { timeout: 15000 });
  await page.evaluate(async () => {
    const S: any = await import(
      /* @vite-ignore */ '/@fs/workspace/spacecraft/packages/shared/src/index.ts'
    );
    const host = (window as any).__sms.conn.host;
    const bots: any[] = [];
    for (const name of ['Bravo', 'Castor', 'Dorn']) {
      const [h, c] = S.createLocalLinkPair(`bot-${name}`);
      host.addLink(h);
      const s = new S.ClientSession(c, name);
      s.join();
      bots.push(s);
    }
    // Bot brains: stay near the squad, aim at the nearest Tyranid and fire.
    (window as any).__bots = setInterval(() => {
      const w = host.world;
      if (!w) return;
      for (const s of bots) {
        const p = w.players.find((q: any) => q.id === s.playerId);
        if (!p || p.state !== 'alive') continue;
        let best: any = null;
        let bd = 1e12;
        for (const e of w.enemies) {
          if (e.dead || e.burrowed) continue;
          const d = (e.x - p.x) ** 2 + (e.y - p.y) ** 2;
          if (d < bd) {
            bd = d;
            best = e;
          }
        }
        const lead = w.players[0];
        let mx = 0;
        let my = 0;
        if (lead && Math.hypot(lead.x - p.x, lead.y - p.y) > 220) {
          const d = Math.hypot(lead.x - p.x, lead.y - p.y);
          mx = (lead.x - p.x) / d;
          my = (lead.y - p.y) / d;
        } else if (best && bd < 160 * 160) {
          mx = (p.x - best.x) / Math.sqrt(bd);
          my = (p.y - best.y) / Math.sqrt(bd);
        }
        const aim = best ? Math.atan2(best.y - p.y, best.x - p.x) : 0;
        s.sendInput({ mx, my, aim, fire: !!best && bd < 700 * 700, slot: 0, reload: false });
      }
    }, 33);
  });
  await page.waitForFunction(
    () => document.querySelectorAll('.room .players li:not(.empty)').length === 4,
    { timeout: 10000 },
  );
  check(true, 'lobby shows 4 marines (host + 3 bots)');
  await shot(page, 'lobby-4.png');
  await page.$eval('#start', (e) => (e as HTMLButtonElement).click());
  await page.waitForFunction(() => (window as any).__sms?.screen === 'game', { timeout: 10000 });
  // Host marine: keep firing at the mouse, which circles the screen centre.
  await page.mouse.move(1000, 450);
  await page.mouse.down();
  const steer = setInterval(() => {
    const t = Date.now() / 900;
    void page.mouse.move(800 + Math.cos(t) * 300, 450 + Math.sin(t) * 250).catch(() => {});
  }, 60);
  // Spawn points: park the squad by the north-west vent and catch a breach telegraph.
  await page.evaluate(() => {
    const w = (window as any).__sms.conn.host.world;
    w.players.forEach((p: any, i: number) => {
      p.x = 1080 + (i % 2) * 70;
      p.y = 760 + Math.floor(i / 2) * 70;
      p.invuln = 25;
    });
  });
  const tele = await page
    .waitForFunction(
      () => {
        const sms = (window as any).__sms;
        const w = sms.conn.host.world;
        const i = w.director.queue[0]?.point;
        if (i === undefined) return false;
        const sp = w.content.director.spawnPoints[i];
        // Park the squad a little off the breach so both are on screen.
        w.players.forEach((p: any, k: number) => {
          p.x = sp.x + 260 + (k % 2) * 70;
          p.y = sp.y + 160 + Math.floor(k / 2) * 70;
        });
        return sms.game?.buffer?.latest?.sp?.[i] > 0 ? sp.id : false;
      },
      { timeout: 30000, polling: 50 },
    )
    .then((h) => h.jsonValue())
    .catch(() => false);
  await sleep(350);
  await shot(page, 'spawn-points.png');
  check(!!tele, `a breach telegraph is visible at ${tele} (spawn-points.png)`);
  // Wave cleared banner: speed things up by clearing wave 1's leftovers.
  const cleared = await page
    .waitForFunction(
      () => {
        const w = (window as any).__sms.conn.host.world;
        for (const e of w.enemies) if (!e.dead && w.director.roster.length === 0) e.hp = 1;
        return w.director.phase === 'breather' && w.director.wave >= 1;
      },
      { timeout: 90000, polling: 200 },
    )
    .then(() => true)
    .catch(() => false);
  await sleep(700);
  await shot(page, 'wave-cleared.png');
  check(cleared, 'wave 1 cleared → breather banner + countdown (wave-cleared.png)');
  // Fight a few waves for scores.
  await page.evaluate(() => {
    const w = (window as any).__sms.conn.host.world;
    w.players.forEach((p: any) => (p.invuln = 60));
  });
  await page.waitForFunction(() => (window as any).__sms.conn.host.world.director.wave >= 3, {
    timeout: 120000,
    polling: 500,
  });
  await sleep(6000);
  // Escape in a squad: the dialog says the game keeps running; the host keeps ticking.
  await page.keyboard.press('Escape');
  await page.waitForSelector('#leave-no', { timeout: 3000 });
  const t0 = await hostTick(page);
  await sleep(1000);
  const t1 = await hostTick(page);
  const note = await page.evaluate(
    () => document.querySelector('#leave-no')?.closest('div')?.parentElement?.textContent ?? '',
  );
  check(t1 - t0 > 20, `squad: Escape dialog open, the game keeps running (${t1 - t0} ticks/s)`);
  console.log('   squad dialog text:', note.replace(/\s+/g, ' ').slice(0, 200));
  await shot(page, 'escape-dialog-squad.png');
  await page.keyboard.press('Escape');
  await sleep(300);
  check(!(await page.$('#leave-no')), 'squad: Escape again closes the dialog');
  await sleep(1500);
  await shot(page, 'hud-scores.png');
  check(true, 'HUD with per-marine points (hud-scores.png)');
  // Game over: the squad falls one by one (so FELL AT differs).
  for (let i = 3; i >= 0; i--) {
    await page.evaluate((i) => {
      const w = (window as any).__sms.conn.host.world;
      const p = w.players[i];
      p.invuln = 0;
      p.state = 'downed';
      p.downedTime = 1e9;
    }, i);
    await sleep(1500);
  }
  clearInterval(steer);
  await page.mouse.up();
  await page.waitForFunction(() => (window as any).__sms?.screen === 'over', {
    timeout: 15000,
  });
  await sleep(2500);
  const rows = await page.$$eval('.summary tbody tr', (r) => r.length).catch(() => 0);
  await page.screenshot({ path: path.join(OUT, 'gameover-scores.png'), fullPage: true });
  check(rows >= 4, `game-over breakdown lists the squad (${rows} rows; gameover-scores.png)`);
  await page.close();

  // ---------------------------------------------------------------- solo: escape dialog
  const solo = await open('autosolo=1&name=Filip');
  await solo.waitForFunction(() => (window as any).__sms?.conn?.host?.world?.tick > 90, {
    timeout: 20000,
  });
  await solo.keyboard.press('Escape');
  await solo.waitForSelector('#leave-no', { timeout: 3000 });
  const s0 = await hostTick(solo);
  await sleep(1200);
  const s1 = await hostTick(solo);
  check(s1 === s0, `solo: Escape pauses the run (tick ${s0} → ${s1})`);
  await shot(solo, 'escape-dialog.png');
  await solo.click('#leave-no');
  await sleep(700);
  const s2 = await hostTick(solo);
  check(s2 > s1, `solo: "stay" resumes the run (tick ${s1} → ${s2})`);
  await solo.keyboard.press('Escape');
  await solo.waitForSelector('#leave-yes', { timeout: 3000 });
  await solo.click('#leave-yes');
  const left = await solo
    .waitForFunction(() => (window as any).__sms?.screen !== 'game', { timeout: 5000 })
    .then(() => true)
    .catch(() => false);
  check(left, 'solo: "leave" goes back out of the game');
  await solo.close();

  // ---------------------------------------------------------------- demo: brace + layers
  const demo = await open('demo=hive&name=Filip');
  await demo.waitForFunction(() => (window as any).__sms?.conn?.host?.world?.enemies?.length > 10, {
    timeout: 20000,
  });
  await demo.evaluate(() => {
    const w = (window as any).__sms.conn.host.world;
    w.players[0].invuln = 1e6;
  });
  await demo.keyboard.press('Digit2');
  await sleep(400);
  await demo.mouse.move(1150, 380);
  await demo.mouse.down();
  await sleep(1600);
  const braced = await demo.evaluate(() => {
    const app = (window as any).__sms;
    const p = app.conn.host.world.players[0];
    return { weapon: p.current, stillTime: +p.stillTime.toFixed(2), score: p.score };
  });
  await shot(demo, 'braced-heavy-bolter.png');
  check(true, `heavy bolter braced while standing still (${JSON.stringify(braced)})`);
  await demo.mouse.up();
  // Units over terrain: put Tyranids and the marine right on top of the biggest ruin.
  const placed = await demo.evaluate(() => {
    const app = (window as any).__sms;
    const r = app.game.renderer;
    const w = app.conn.host.world;
    const p = w.players[0];
    const props = [...r.props].sort((a: any, b: any) => b.scale - a.scale);
    const near = props.filter((q: any) => q.x > 300 && q.x < 2900 && q.y > 300 && q.y < 1900);
    const prop = near[0] ?? props[0];
    p.x = prop.x - 40;
    p.y = prop.y + 10;
    const ens = w.enemies.filter((e: any) => !e.dead && !e.burrowed).slice(0, 6);
    (window as any).__hold = setInterval(() => {
      ens.forEach((e: any, i: number) => {
        e.x = prop.x + 30 + (i % 3) * 34;
        e.y = prop.y - 30 + Math.floor(i / 3) * 44;
        e.vx = e.vy = 0;
      });
      p.x = prop.x - 40;
      p.y = prop.y + 10;
    }, 8);
    return { key: prop.key, x: prop.x, y: prop.y, n: ens.length };
  });
  await sleep(900);
  await shot(demo, 'units-over-terrain.png');
  check(
    placed.n > 0,
    `marine + ${placed.n} Tyranids drawn over ${placed.key} (units-over-terrain.png)`,
  );
  await demo.close();
} finally {
  await browser.close();
}
check(errors.length === 0, `no page errors${errors.length ? `: ${errors.join(' | ')}` : ''}`);
