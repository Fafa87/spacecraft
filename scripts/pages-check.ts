/**
 * Checks a static deploy of the client (e.g. GitHub Pages) in headless Chrome:
 *   npx tsx scripts/pages-check.ts https://fafa87.github.io/spacecraft/ [screenshot.png]
 * - menu renders, assets (manifest + atlas) load under the base path
 * - no highscore server configured => "local scores" note, no failed requests / console errors
 * - a solo run ends and the score is saved locally
 * - hosting a P2P squad gets a room code from the public PeerJS broker
 */
import puppeteer from 'puppeteer-core';

// Headless runs must not write to the live leaderboard: Firestore is disabled with ?firestore=0,
// which exercises the local-scores path.
const BASE = process.argv[2] ?? 'http://localhost:4321/spacecraft/';
const URL_ = new URL('?firestore=0', BASE).href;
const SHOT = process.argv[3] ?? 'docs/pages-live.png';
const CHROME = process.env.CHROME_PATH ?? '/usr/bin/google-chrome';
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
let failures = 0;
const ok = (m: string) => console.log(`✓ ${m}`);
const fail = (m: string) => (failures++, console.log(`✗ ${m}`));

async function main() {
  const browser = await puppeteer.launch({
    executablePath: CHROME,
    headless: true,
    args: ['--no-sandbox', '--use-gl=swiftshader', '--enable-unsafe-swiftshader'],
  });
  const errors: string[] = [];
  const failed: string[] = [];
  try {
    const page = await browser.newPage();
    await page.setViewport({ width: 1280, height: 760 });
    page.on('console', (m) => {
      if (m.type() === 'error' || m.type() === 'warn') errors.push(`${m.type()}: ${m.text()}`);
    });
    page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
    page.on('requestfailed', (r) => failed.push(`${r.url()} (${r.failure()?.errorText})`));
    page.on('response', (r) => {
      if (r.status() >= 400) failed.push(`${r.url()} (${r.status()})`);
    });

    await page.goto(URL_, { waitUntil: 'networkidle0', timeout: 30000 });
    await page.waitForSelector('#solo', { timeout: 15000 });
    ok('menu renders');
    const assets = await page.evaluate(() => {
      const a = (window as unknown as { __sms: { assets: { manifest: unknown; atlas: unknown } } })
        .__sms.assets;
      return { manifest: !!a.manifest, atlas: !!a.atlas };
    });
    if (assets.manifest && assets.atlas) ok('asset manifest + atlas loaded under the base path');
    else fail(`assets not loaded ${JSON.stringify(assets)}`);
    await sleep(500);
    const status = await page.$eval('#status', (e) => e.textContent ?? '');
    if (/local scores/.test(status)) ok(`status note: "${status}"`);
    else fail(`unexpected status "${status}"`);
    const source = await page.$eval('.hs-source', (e) => e.textContent ?? '');
    ok(`highscore panel: "${source}"`);
    await page.screenshot({ path: SHOT });
    ok(`screenshot -> ${SHOT}`);

    // P2P host via public PeerJS broker
    await page.type('#name', 'PagesBot');
    await page.click('#host');
    try {
      await page.waitForFunction(
        () =>
          /[A-Z0-9]{5}/.test(document.querySelector('.room, .screen')?.textContent ?? '') &&
          !document.querySelector('#solo'),
        { timeout: 20000 },
      );
      const code = await page.evaluate(
        () =>
          (window as unknown as { __sms: { conn?: { roomCode: string } } }).__sms.conn?.roomCode,
      );
      ok(`P2P squad hosted via public PeerJS broker (room ${code})`);
    } catch {
      fail('P2P host did not get a room code');
    }

    // Solo run until the swarm wins, then check the local score.
    await page.goto(new URL('?firestore=0&autosolo=1&name=PagesBot', BASE).href, {
      waitUntil: 'load',
    });
    await page.waitForSelector('.gameover #submit', { timeout: 90000 });
    await page.waitForFunction(
      () => !/Submitting/.test(document.querySelector('.gameover #submit')?.textContent ?? ''),
      { timeout: 10000 },
    );
    const submit = await page.$eval('.gameover #submit', (e) => e.textContent ?? '');
    if (/local scores/i.test(submit)) ok(`solo run over, "${submit}"`);
    else fail(`unexpected submit text "${submit}"`);
    const rows = await page.$$eval('.gameover tbody tr', (r) => r.length);
    ok(`leaderboard rows after run: ${rows}`);
  } finally {
    await browser.close();
  }
  if (failed.length) fail(`failed requests:\n  ${failed.join('\n  ')}`);
  else ok('no failed requests');
  if (errors.length) fail(`console errors/warnings:\n  ${errors.join('\n  ')}`);
  else ok('no console errors or warnings');
  console.log(failures ? `\npages check FAILED (${failures})` : '\npages check OK');
  process.exit(failures ? 1 : 0);
}

void main();
