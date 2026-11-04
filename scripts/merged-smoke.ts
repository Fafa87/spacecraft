/**
 * Post-merge smoke test against a build:pages preview (default http://localhost:4318/spacecraft/).
 * Menu (gothic bg + emblem) at 1280x800 / 844x390, ZASADY → rules.html (armour + compendium),
 * a ~60 s solo run (damage taken, kills, no console errors) and the game-over screen.
 * Screenshots: docs/review/merged-*.png. Co-op is covered by scripts/browser-smoke.ts.
 */
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import puppeteer, { type Page } from 'puppeteer-core';
import { loadConfig } from '../packages/server/src/config.js';
import { startServer } from '../packages/server/src/server.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const out = (f: string) => path.join(root, 'docs/review', f);
const BASE = (process.env.CLIENT_URL ?? 'http://localhost:4318/spacecraft/').replace(/\/?$/, '/');
const SOLO_MS = Number(process.env.SOLO_MS ?? 60000);
/** HEAL=1: top the marine up when below 30 hp so the run lasts the full SOLO_MS. */
const HEAL = process.env.HEAL === '1';
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
let failures = 0;
const check = (ok: boolean, msg: string) => {
  console.log(`${ok ? '✓' : '✗'} ${msg}`);
  if (!ok) failures++;
};
const errors: string[] = [];
const watch = (p: Page, label: string) => {
  p.on('pageerror', (e) => errors.push(`${label} pageerror: ${(e as Error).message}`));
  p.on('console', (m) => {
    if (m.type() === 'error') errors.push(`${label} console: ${m.text()}`);
  });
};

const server = await startServer({
  ...loadConfig({}),
  port: 8798,
  peerPort: 9008,
  store: 'memory',
  logLevel: 'warn',
});
const API = `http://localhost:${server.port}`;
const Q = `firestore=0&api=${encodeURIComponent(API)}`;
const browser = await puppeteer.launch({
  executablePath: process.env.CHROME_PATH ?? '/usr/bin/google-chrome',
  headless: true,
  args: [
    '--no-sandbox',
    '--use-gl=swiftshader',
    '--enable-unsafe-swiftshader',
    '--autoplay-policy=no-user-gesture-required',
  ],
});
try {
  // 1. Menu at desktop + phone landscape
  for (const [w, h, mobile] of [
    [1280, 800, false],
    [844, 390, true],
  ] as const) {
    const p = await browser.newPage();
    watch(p, `menu-${w}x${h}`);
    await p.setViewport({ width: w, height: h, isMobile: mobile, hasTouch: mobile });
    await p.goto(`${BASE}?${Q}`, { waitUntil: 'networkidle0' });
    await p.waitForSelector('.menu #name', { timeout: 15000 });
    await sleep(800);
    const info = await p.evaluate(async () => {
      const bg = getComputedStyle(document.body, '::before').backgroundImage;
      const url = /menu-bg[^"')]*\.webp/.exec(bg)?.[0];
      let bgOk = false;
      if (url) {
        const m = /url\("?([^")]*menu-bg[^")]*)"?\)/.exec(bg);
        bgOk = !!m && (await fetch(m[1]!)).ok;
      }
      const em = document.querySelector('.title .emblem') as HTMLImageElement | null;
      const link = [...document.querySelectorAll('a')].find((a) => /rules\.html/.test(a.href));
      return {
        bgOk,
        emblem: em ? { w: em.naturalWidth, src: em.src.slice(0, 60) } : null,
        rules: link ? { href: link.href, text: link.textContent?.trim() } : null,
      };
    });
    check(info.bgOk, `menu ${w}x${h}: gothic backdrop (menu-bg.webp) applied and served`);
    check(
      !!info.emblem && info.emblem.w > 0,
      `menu ${w}x${h}: emblem rendered (${JSON.stringify(info.emblem)})`,
    );
    check(!!info.rules, `menu ${w}x${h}: rules link ${JSON.stringify(info.rules)}`);
    await p.screenshot({ path: out(`merged-menu-${w}x${h}.png`) });
    if (w === 1280) {
      // 2. ZASADY link → rules.html
      const [popup] = await Promise.all([
        new Promise<Page | null>((res) => {
          browser.once('targetcreated', async (t) => res(await t.page()));
          setTimeout(() => res(null), 5000);
        }),
        p.$$eval('a', (as) =>
          (as.find((a) => /rules\.html/.test(a.href)) as HTMLAnchorElement).click(),
        ),
      ]);
      const rp = popup ?? p;
      watch(rp, 'rules');
      await rp.setViewport({ width: 1280, height: 800 });
      await rp.waitForSelector('#pancerz', { timeout: 15000 });
      const r = await rp.evaluate(() => {
        const d = document.querySelector('details');
        if (d) d.open = true;
        const t = document.body.innerText;
        return {
          url: location.href,
          armour: document.querySelector('#pancerz')?.textContent?.includes('×0,7') ?? false,
          ricochet:
            t.includes('Rykoszet z przedniego pancerza') &&
            t.includes('60%') &&
            t.includes('14,7%'),
          compendium: t.includes('Pancerz kierunkowy i rykoszety') && t.includes('Bronie'),
        };
      });
      check(/rules\.html/.test(r.url), `ZASADY link opens ${r.url}${popup ? ' (new tab)' : ''}`);
      check(r.armour, 'rules: armour section (#pancerz) with ×0,7 front multiplier');
      check(r.ricochet && r.compendium, 'rules: compendium armour + ricochet tables (60% / 14,7%)');
      await rp.evaluate(() => document.querySelector('#pancerz')!.scrollIntoView());
      await rp.screenshot({ path: out('merged-rules-armour.png') });
      await rp.evaluate(() =>
        [...document.querySelectorAll('h3')]
          .find((e) => e.textContent!.startsWith('Pancerz kierunkowy'))!
          .scrollIntoView(),
      );
      await rp.screenshot({ path: out('merged-rules-compendium.png') });
      if (popup) await popup.close();
    }
    await p.close();
  }

  // 3. Solo ~60 s
  const p = await browser.newPage();
  watch(p, 'solo');
  await p.setViewport({ width: 1280, height: 800 });
  await p.goto(`${BASE}?${Q}&autosolo=1&name=Merged`, { waitUntil: 'networkidle0' });
  await p.waitForFunction(() => (window as any).__sms?.screen === 'game', { timeout: 15000 });
  // Count armour/ricochet effects host-side (events are per tick).
  await p.evaluate(() => {
    const w = (window as any).__sms.conn.host.world;
    const s = ((window as any).__stats = { minHp: 1e9, dmgTaken: 0 });
    setInterval(() => {
      const pl = w.players[0];
      if (pl) s.minHp = Math.min(s.minHp, pl.hp);
    }, 30);
  });
  let lastHp = 100;
  const t0 = Date.now();
  let i = 0;
  const keys = ['KeyW', 'KeyD', 'KeyS', 'KeyA'];
  await p.mouse.down();
  while (Date.now() - t0 < SOLO_MS) {
    const st = await p.evaluate(() => {
      const app = (window as any).__sms;
      const w = app.conn?.host?.world;
      const pl = w?.players[0];
      const en = w?.enemies?.find((e: any) => e.hp > 0);
      return { screen: app.screen, hp: pl?.hp ?? 0, x: pl?.x, y: pl?.y, ex: en?.x, ey: en?.y };
    });
    if (st.screen !== 'game') break;
    if (st.hp < lastHp)
      await p.evaluate((d) => ((window as any).__stats.dmgTaken += d), lastHp - st.hp);
    lastHp = st.hp;
    if (HEAL && st.hp > 0 && st.hp < 30) {
      await p.evaluate(() => ((window as any).__sms.conn.host.world.players[0].hp = 100));
      lastHp = 100;
    }
    // aim toward the nearest-ish enemy relative to screen centre
    if (st.ex !== undefined) {
      const dx = st.ex - st.x,
        dy = st.ey - st.y,
        l = Math.hypot(dx, dy) || 1;
      await p.mouse.move(640 + (dx / l) * 250, 400 + (dy / l) * 250);
    }
    const k = keys[i++ % 4]!;
    await p.keyboard.down(k);
    await sleep(700);
    await p.keyboard.up(k);
    if (Date.now() - t0 > 20000 && Date.now() - t0 < 21000)
      await p.screenshot({ path: out('merged-gameplay.png') });
  }
  await p.mouse.up();
  const res = await p.evaluate(() => {
    const app = (window as any).__sms;
    const w = app.conn.host.world;
    return {
      screen: app.screen,
      tick: w.tick,
      wave: w.director?.wave,
      kills: w.players.reduce((a: number, pl: any) => a + (pl.kills ?? 0), 0),
      hp: w.players[0].hp,
      state: w.players[0].state,
      stats: (window as any).__stats,
    };
  });
  console.log('solo:', JSON.stringify(res));
  check(
    res.tick > 1500 || res.screen === 'over',
    `solo ran ${((Date.now() - t0) / 1000).toFixed(0)} s (tick ${res.tick}, wave ${res.wave})`,
  );
  check(res.kills > 0, `marine killed enemies (${res.kills})`);
  check(
    res.stats.dmgTaken > 0 || res.stats.minHp < 100,
    `marine took damage (min hp ${res.stats.minHp.toFixed(0)}${HEAL ? ', healed when low' : ''})`,
  );
  if (res.screen === 'game') {
    await p.screenshot({ path: out('merged-gameplay-60s.png') });
    await p.evaluate(() => {
      const pl = (window as any).__sms.conn.host.world.players[0];
      pl.state = 'downed';
      pl.hp = 0;
    });
  }
  await p.waitForFunction(() => (window as any).__sms?.screen === 'over', { timeout: 90000 });
  await sleep(1500);
  const overText = await p.evaluate(() => document.querySelector('#ui')?.textContent ?? '');
  check(
    overText.length > 20,
    `game-over screen shown ("${overText.replace(/\s+/g, ' ').slice(0, 90)}…")`,
  );
  await p.screenshot({ path: out('merged-gameover.png') });
  await p.close();
} finally {
  await browser.close();
  await server.close();
}
const relevant = errors.filter((e) => !/favicon|AudioContext/.test(e));
check(
  relevant.length === 0,
  `no console/page errors${relevant.length ? ':\n  ' + relevant.join('\n  ') : ''}`,
);
console.log(failures ? `\n${failures} check(s) failed` : '\nmerged smoke OK');
process.exit(failures ? 1 : 0);
