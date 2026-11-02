/**
 * Mobile-landscape game-over check (needs `npm run dev`; `?firestore=0`): emulates touch phones
 * at 844x390, 667x375 and 740x360, plays a 4-marine squad to game over, then
 *  - screenshots the summary (…-top.png), swipes the scrollable panel with a real touch scroll
 *    finger drag (CDP Input.dispatchTouchEvent touchStart/touchMove/touchEnd) and screenshots again
 *    (…-scrolled.png), visits every tab when present (…-<tab>.png);
 *  - checks MAIN MENU / DEPLOY AGAIN are fully on screen and that the swipe really scrolled.
 * Usage: npx tsx scripts/gameover-mobile-shot.ts [clientUrl] [prefix]
 */
import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import puppeteer, { type Page } from 'puppeteer-core';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(root, 'docs', 'review');
mkdirSync(OUT, { recursive: true });
const CLIENT = (process.argv[2] ?? 'http://localhost:5173/').replace(/\/?$/, '/');
const PREFIX = process.argv[3] ?? 'gameover-mobile';
const CHROME = process.env.CHROME_PATH ?? '/usr/bin/google-chrome';
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
let failed = false;
const check = (ok: boolean, msg: string) => {
  console.log(`${ok ? '✓' : '✗'} ${msg}`);
  if (!ok) failed = true;
};
const VIEWPORTS: [number, number][] = [
  [844, 390],
  [667, 375],
  [740, 360],
];
const IPHONE_UA =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1';

const browser = await puppeteer.launch({
  executablePath: CHROME,
  headless: true,
  args: ['--no-sandbox', '--autoplay-policy=no-user-gesture-required', '--use-gl=swiftshader'],
});

async function toGameOver(w: number, h: number): Promise<Page> {
  const page = await browser.newPage();
  await page.evaluateOnNewDocument('globalThis.__name = (f) => f');
  // the iOS add-to-home-screen hint is covered by its own check; keep it out of the way here
  await page.evaluateOnNewDocument(() => localStorage.setItem('sms.iosHint.dismissed', 'true'));
  await page.setUserAgent(IPHONE_UA);
  await page.setViewport({
    width: w,
    height: h,
    deviceScaleFactor: 2,
    isMobile: true,
    hasTouch: true,
    isLandscape: true,
  });
  await page.goto(`${CLIENT}?firestore=0`, { waitUntil: 'load' });
  await page.waitForSelector('.menu #name', { timeout: 15000 });
  await page.$eval('#host', (e) => (e as HTMLButtonElement).click());
  await page.waitForSelector('.room .code', { timeout: 15000 });
  await page.evaluate(async () => {
    const S: any = await import(
      /* @vite-ignore */ '/@fs/workspace/spacecraft/packages/shared/src/index.ts'
    );
    const host = (window as any).__sms.conn.host;
    for (const name of ['Bravo', 'Castor', 'Dorn']) {
      const [hs, c] = S.createLocalLinkPair(`bot-${name}`);
      host.addLink(hs);
      new S.ClientSession(c, name).join();
    }
  });
  await page.waitForFunction(
    () => document.querySelectorAll('.room .players li:not(.empty)').length === 4,
    { timeout: 10000 },
  );
  await page.$eval('#start', (e) => (e as HTMLButtonElement).click());
  await page.waitForFunction(() => (window as any).__sms?.screen === 'game', { timeout: 10000 });
  await sleep(1500);
  await page.evaluate(async () => {
    const S: any = await import(
      /* @vite-ignore */ '/@fs/workspace/spacecraft/packages/shared/src/index.ts'
    );
    const w = (window as any).__sms.conn.host.world;
    const p0 = w.players[0];
    const plan: [string, number, number][] = [
      ['carnifex', 0, 1],
      ['warrior', 1, 3],
      ['gaunt', 2, 9],
      ['genestealer', 3, 4],
      ['ravener', 0, 2],
      ['lictor', 1, 1],
      ['biovore', 2, 2],
      ['gargoyle', 3, 5],
      ['zoanthrope', 0, 1],
    ];
    for (const [type, slot, n] of plan)
      for (let i = 0; i < n; i++) {
        try {
          const e = S.spawnEnemy(w, type, p0.x + 1200, p0.y + 900);
          S.damageEnemy(w, e, e.hp + 1, { sourcePlayerId: w.players[slot].id });
        } catch {
          /* unknown type in this version */
        }
      }
    for (const p of w.players) {
      p.invuln = 0;
      p.state = 'downed';
      p.downedTime = 1e9;
    }
  });
  await page.waitForFunction(() => (window as any).__sms?.screen === 'over', { timeout: 15000 });
  await sleep(2500);
  return page;
}

/** Visible-in-viewport check for a button. */
async function onScreen(page: Page, sel: string): Promise<boolean> {
  return page.evaluate((sel) => {
    const b = document.querySelector(sel);
    if (!b) return false;
    const r = b.getBoundingClientRect();
    return (
      r.width > 0 &&
      r.top >= 0 &&
      r.left >= 0 &&
      r.bottom <= innerHeight + 0.5 &&
      r.right <= innerWidth + 0.5
    );
  }, sel);
}

/** Real touch swipe (finger moving up) in the middle of `sel`; returns its scrollTop before/after. */
async function swipe(page: Page, sel: string, h: number) {
  const st = await page.$eval(sel, (el) => {
    const r = el.getBoundingClientRect();
    return {
      top: el.scrollTop,
      max: el.scrollHeight - el.clientHeight,
      x: Math.round(r.left + r.width / 2),
      y: Math.round(Math.max(r.top, 0) + Math.min(r.bottom, innerHeight) - Math.max(r.top, 0)) / 2,
    };
  });
  if (process.env.DEBUG_SWIPE)
    console.log(
      await page.evaluate(
        (x, y) => {
          const w = window as any;
          w.__tm = { n: 0, prevented: 0 };
          addEventListener(
            'touchmove',
            (e) => (w.__tm.n++, e.defaultPrevented && w.__tm.prevented++),
          );
          const el = document.elementFromPoint(x, y);
          return `hit ${el?.tagName}.${el?.className}`;
        },
        st.x,
        Math.round(st.y),
      ),
    );
  const cdp = await page.createCDPSession();
  // A real finger drag through the browser input pipeline: touchStart, 12 touchMoves, touchEnd.
  const x = st.x;
  const y0 = Math.round(st.y + Math.min(120, h * 0.3));
  const dist = Math.max(150, Math.round(h * 0.55));
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y: y0 }] });
  for (let i = 1; i <= 12; i++) {
    await cdp.send('Input.dispatchTouchEvent', {
      type: 'touchMove',
      touchPoints: [{ x, y: Math.round(y0 - (dist * i) / 12) }],
    });
    await sleep(16);
  }
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await sleep(700);
  const after = await page.$eval(sel, (el) => el.scrollTop);
  if (process.env.DEBUG_SWIPE)
    console.log(await page.evaluate(() => JSON.stringify((window as any).__tm)));
  await cdp.detach();
  return { before: st.top, after, max: st.max };
}

try {
  for (const [w, h] of VIEWPORTS) {
    const page = await toGameOver(w, h);
    const tag = `${PREFIX}-${w}x${h}`;
    await page.screenshot({ path: path.join(OUT, `${tag}-top.png`) });
    const menuOk = await onScreen(page, '.gameover #menu');
    const againOk = await onScreen(page, '.gameover #again');
    check(
      menuOk && againOk,
      `${w}x${h}: MAIN MENU and DEPLOY AGAIN fully on screen without scrolling`,
    );
    const tabs = await page.$$eval('.go-tabs button', (bs) =>
      bs.map((b) => (b as HTMLElement).dataset.tab ?? ''),
    );
    for (const t of tabs) {
      await page.tap(`.go-tabs button[data-tab="${t}"]`);
      await sleep(300);
      await page.screenshot({ path: path.join(OUT, `${tag}-${t}.png`) });
      const vis = await page.$eval(
        `.go-panel[data-panel="${t}"]`,
        (e) => (e as HTMLElement).offsetParent !== null,
      );
      check(vis, `${w}x${h}: tab ${t} shows its panel`);
      check(
        await onScreen(page, '.gameover #menu'),
        `${w}x${h}: buttons still on screen on tab ${t}`,
      );
      const sc = await swipe(page, `.go-panel[data-panel="${t}"]`, h);
      if (sc.max > 0) {
        await page.screenshot({ path: path.join(OUT, `${tag}-${t}-scrolled.png`) });
        check(
          sc.after > sc.before,
          `${w}x${h}: finger swipe scrolls the ${t} panel (${sc.before} → ${sc.after} of ${sc.max})`,
        );
        check(
          await onScreen(page, '.gameover #again'),
          `${w}x${h}: DEPLOY AGAIN on screen after scrolling ${t}`,
        );
      } else console.log(`  (${t} panel fits, nothing to scroll)`);
    }
    if (!tabs.length) {
      const sc = await swipe(page, '#ui', h);
      await page.screenshot({ path: path.join(OUT, `${tag}-scrolled.png`) });
      check(
        sc.max <= 0 || sc.after > sc.before,
        `${w}x${h}: finger swipe scrolls #ui (${sc.before} → ${sc.after} of ${sc.max})`,
      );
    }
    // the button really responds to a tap
    if (w === 844) {
      await page.tap('.gameover #again');
      const ok = await page
        .waitForFunction(() => (window as any).__sms?.screen === 'room', { timeout: 5000 })
        .then(
          () => true,
          () => false,
        );
      check(ok, `${w}x${h}: tapping DEPLOY AGAIN returns the squad to the room`);
    }
    await page.close();
  }
} finally {
  await browser.close();
}
process.exit(failed ? 1 : 0);
