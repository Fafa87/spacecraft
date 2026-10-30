/**
 * Headless-browser smoke test. Needs the Vite client running (`npm run dev`); it boots
 * its OWN highscore/peer/WS server in-process (memory store, ports 8797/9007) so test
 * runs never pollute the real leaderboard.
 *  1. Menu renders (docs/menu.png)
 *  2. Solo run: auto-start, move + shoot, screenshot (docs/screenshot.png), then force a
 *     game over and verify the host browser submitted the score to the highscore server.
 *  3. P2P co-op: page A hosts via PeerJS, page B joins by code, A starts, both get snapshots
 *     (docs/screenshot-coop.png).
 *
 * Env: CLIENT_URL (default http://localhost:5173), API_URL (use an existing server instead
 *      of the in-process one), CHROME_PATH (default /usr/bin/google-chrome), STRICT_P2P=1.
 */
import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import puppeteer, { type Browser, type Page } from 'puppeteer-core';
import { loadConfig } from '../packages/server/src/config.js';
import { startServer, type RunningServer } from '../packages/server/src/server.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const docs = path.join(root, 'docs');
mkdirSync(docs, { recursive: true });
const CLIENT = process.env.CLIENT_URL ?? 'http://localhost:5173';
let API = process.env.API_URL ?? '';
const CHROME = process.env.CHROME_PATH ?? '/usr/bin/google-chrome';

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
let failures = 0;
const check = (ok: boolean, msg: string) => {
  console.log(`${ok ? '✓' : '✗'} ${msg}`);
  if (!ok) failures++;
};

async function newPage(browser: Browser, label: string): Promise<{ page: Page; errors: string[] }> {
  const page = await browser.newPage();
  await page.setViewport({ width: 1440, height: 860 });
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(`${label} pageerror: ${(e as Error).message}`));
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(`${label} console: ${m.text()}`);
  });
  return { page, errors };
}

async function setName(page: Page, name: string): Promise<void> {
  await page.$eval('#name', (e) => ((e as HTMLInputElement).value = ''));
  await page.type('#name', name);
}

/** Reads a little state off the debug hook exposed by App. */
const appState = (page: Page) =>
  page.evaluate(() => {
    const app = (window as unknown as { __sms?: any }).__sms;
    const conn = app?.conn;
    return {
      screen: app?.screen as string,
      room: conn?.roomCode as string | undefined,
      playerId: conn?.session?.playerId as number | undefined,
      tick: (conn?.host?.world?.tick ?? app?.game?.buffer?.latest?.tick ?? -1) as number,
      players: (app?.game?.buffer?.latest?.players?.length ?? 0) as number,
      enemies: (app?.game?.buffer?.latest?.enemies?.length ?? 0) as number,
    };
  });

/**
 * Two tabs: A hosts, B joins by code, A starts, both receive snapshots and B's input
 * reaches the host. Returns 'blocked' if a P2P join timed out at the WebRTC layer.
 */
async function coop(
  browser: Browser,
  mode: 'p2p' | 'ws',
  allErrors: string[],
): Promise<'ok' | 'blocked'> {
  const q = `api=${encodeURIComponent(API)}${mode === 'ws' ? '&ws=1' : ''}`;
  const label = mode === 'p2p' ? 'P2P (PeerJS)' : 'dedicated WS host';
  const a = await newPage(browser, `${mode}-hostA`);
  await a.page.goto(`${CLIENT}/?${q}`, { waitUntil: 'networkidle0' });
  await a.page.waitForSelector('.menu #name', { timeout: 10000 });
  await setName(a.page, 'Alpha');
  await a.page.click('#host');
  await a.page.waitForSelector('.room .code', { timeout: 15000 });
  const code = await a.page.$eval('.room .code', (e) => e.textContent ?? '');
  check(/^[A-Z0-9]{4,}$/.test(code), `${label}: room hosted with code ${code}`);

  const b = await newPage(browser, `${mode}-joinB`);
  if (mode === 'p2p') {
    // Signaling sanity: a wrong code is reported as not found.
    await b.page.goto(`${CLIENT}/?join=ZZZZZ&${q}`, { waitUntil: 'networkidle0' });
    await b.page.waitForSelector('.menu #join', { timeout: 10000 });
    await b.page.click('#join');
    await b.page.waitForFunction(
      () => document.querySelector('#err')?.textContent?.includes('not found'),
      { timeout: 15000 },
    );
    check(true, `${label}: unknown room code reported as not found`);
  }
  await b.page.goto(`${CLIENT}/?join=${code}&${q}`, { waitUntil: 'networkidle0' });
  await b.page.waitForSelector('.menu #name', { timeout: 10000 });
  await setName(b.page, 'Bravo');
  await b.page.click('#join');
  const joined = await b.page
    .waitForSelector('.room .players', { timeout: 15000 })
    .then(() => true)
    .catch(() => false);
  if (!joined) {
    const err = await b.page.$eval('#err', (e) => e.textContent ?? '').catch(() => '');
    await a.page.close();
    await b.page.close();
    if (mode === 'p2p' && err.includes('timed out')) return 'blocked';
    check(false, `${label}: join failed (${err})`);
    return 'ok';
  }
  await a.page.waitForFunction(
    () => document.querySelectorAll('.room .players li:not(.empty)').length === 2,
    { timeout: 10000 },
  );
  check(true, `${label}: player B joined; lobby shows 2 marines`);
  await a.page.bringToFront();
  await a.page.$eval('#start', (e) => (e as HTMLButtonElement).click());
  await Promise.all([
    a.page.waitForFunction(() => (window as any).__sms?.screen === 'game', { timeout: 10000 }),
    b.page.waitForFunction(() => (window as any).__sms?.screen === 'game', { timeout: 10000 }),
  ]);
  await b.page.bringToFront();
  await b.page.keyboard.down('KeyA');
  await b.page.mouse.move(300, 300);
  await b.page.mouse.down();
  await sleep(4000);
  await b.page.keyboard.up('KeyA');
  await b.page.mouse.up();
  const sa = await appState(a.page);
  const sb = await appState(b.page);
  check(
    sa.players === 2 && sb.players === 2 && sb.tick > 60,
    `${label}: both tabs receive snapshots (A tick ${sa.tick}, B tick ${sb.tick})`,
  );
  const bx = await b.page.evaluate(() => {
    const app = (window as any).__sms;
    const snap = app.game.buffer.latest;
    return snap.players.find((p: { id: number }) => p.id === app.conn.session.playerId).x as number;
  });
  check(bx < 1590, `${label}: B's input reaches the host (B x=${bx.toFixed(0)})`);
  await b.page.screenshot({ path: path.join(docs, `screenshot-coop-${mode}.png`) });
  allErrors.push(...a.errors, ...b.errors);
  await a.page.close();
  await b.page.close();
  return 'ok';
}

async function main(): Promise<void> {
  let server: RunningServer | null = null;
  if (!API) {
    server = await startServer({
      ...loadConfig({}),
      port: 8797,
      peerPort: 9007,
      store: 'memory',
      logLevel: 'warn',
    });
    API = `http://localhost:${server.port}`;
    console.log(`(test server on ${API}, PeerJS on :9007, memory store)`);
  }
  const browser = await puppeteer.launch({
    executablePath: CHROME,
    headless: true,
    args: [
      '--no-sandbox',
      // Two tabs run at once in the co-op test; don't let the backgrounded host tab throttle.
      '--disable-background-timer-throttling',
      '--disable-renderer-backgrounding',
      '--disable-backgrounding-occluded-windows',
      // Headless Chrome hides LAN candidates behind mDNS names that don't resolve in CI/VMs.
      '--disable-features=WebRtcHideLocalIpsWithMdns',
      '--autoplay-policy=no-user-gesture-required',
      '--use-gl=swiftshader',
      '--enable-unsafe-swiftshader',
    ],
  });
  const allErrors: string[] = [];
  try {
    // 1. menu
    {
      const { page, errors } = await newPage(browser, 'menu');
      await page.goto(`${CLIENT}/?api=${encodeURIComponent(API)}`, { waitUntil: 'networkidle0' });
      await page.waitForSelector('.menu #solo', { timeout: 10000 });
      await page.waitForFunction(
        () => !document.querySelector('#status')?.textContent?.includes('checking'),
        { timeout: 5000 },
      );
      const status = await page.$eval('#status', (e) => e.textContent ?? '');
      check(status.includes('online'), `menu renders, ${status}`);
      await page.screenshot({ path: path.join(docs, 'menu.png') });
      allErrors.push(...errors);
      await page.close();
    }

    // 2. solo run
    {
      const { page, errors } = await newPage(browser, 'solo');
      const name = `Smoke${Date.now() % 10000}`;
      await page.goto(`${CLIENT}/?autosolo=1&name=${name}&api=${encodeURIComponent(API)}`, {
        waitUntil: 'networkidle0',
      });
      await page.waitForFunction(() => (window as any).__sms?.screen === 'game', {
        timeout: 10000,
      });
      await page.mouse.move(1000, 300);
      await page.keyboard.down('KeyD');
      await page.mouse.down();
      await sleep(2500);
      await page.keyboard.up('KeyD');
      await page.keyboard.down('KeyS');
      await page.mouse.move(500, 600);
      await sleep(2000);
      await page.keyboard.up('KeyS');
      await page.keyboard.press('Digit2');
      await page.mouse.move(1200, 500);
      await sleep(5500);
      await page.mouse.up();
      const st = await appState(page);
      check(
        st.screen === 'game' && st.tick > 200,
        `solo run is simulating (tick ${st.tick}, ${st.enemies} enemies)`,
      );
      const moved = await page.evaluate(() => {
        const p = (window as any).__sms.conn.host.world.players[0];
        return { x: p.x, y: p.y, kills: p.kills };
      });
      check(
        Math.abs(moved.x - 1600) > 50,
        `marine moved with WASD (x=${moved.x.toFixed(0)}, kills=${moved.kills})`,
      );
      await page.screenshot({ path: path.join(docs, 'screenshot.png') });
      // Force the end of the run (the sim ends it when no marine is alive).
      await page.evaluate(() => {
        const p = (window as any).__sms.conn.host.world.players[0];
        p.state = 'downed';
        p.hp = 0;
      });
      await page.waitForFunction(() => (window as any).__sms?.screen === 'over', {
        timeout: 10000,
      });
      await page.waitForFunction(
        () => !document.querySelector('#submit')?.textContent?.includes('Submitting'),
        { timeout: 8000 },
      );
      const submitText = await page.$eval('#submit', (e) => e.textContent ?? '');
      check(submitText.includes('global leaderboard'), `host submitted score: "${submitText}"`);
      await sleep(800);
      await page.screenshot({ path: path.join(docs, 'gameover.png') });
      const top = (await (await fetch(`${API}/api/highscores/1?limit=100`)).json()) as {
        entries: { players: string[] }[];
      };
      check(
        top.entries.some((e) => e.players.includes(name)),
        `server GET /api/highscores/1 contains the run by ${name}`,
      );
      allErrors.push(...errors);
      await page.close();
    }

    // 3. Co-op: P2P (PeerJS/WebRTC) first, then the dedicated WS host as a second transport.
    const p2p = await coop(browser, 'p2p', allErrors);
    if (p2p === 'blocked') {
      const msg =
        'P2P WebRTC data channel did not open (no ICE candidates). Some environments block WebRTC UDP via ' +
        'browser policy (e.g. WebRtcIPHandling=disable_non_proxied_udp). Set STRICT_P2P=1 to make this fatal.';
      if (process.env.STRICT_P2P === '1') check(false, msg);
      else console.log(`⚠ ${msg}`);
    }
    await coop(browser, 'ws', allErrors);
  } finally {
    await browser.close();
    await server?.close();
  }
  const relevant = allErrors.filter((e) => !/favicon|AudioContext/.test(e));
  check(
    relevant.length === 0,
    `no page errors${relevant.length ? ':\n  ' + relevant.join('\n  ') : ''}`,
  );
  console.log(
    failures ? `\n${failures} check(s) failed` : '\nbrowser smoke OK — screenshots in docs/',
  );
  process.exit(failures ? 1 : 0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
