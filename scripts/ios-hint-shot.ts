/**
 * iPhone "add to home screen" hint check (needs `npm run dev`): emulates an iPhone in landscape
 * and portrait-free 844x390, screenshots the hint (docs/review/ios-hint-844x390.png), taps
 * "OK, nie pokazuj", reloads and checks it stays gone; checks Android never sees it and that the
 * apple-touch-icon / manifest icons resolve.
 * Usage: npx tsx scripts/ios-hint-shot.ts [clientUrl]
 */
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import puppeteer from 'puppeteer-core';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const CLIENT = (process.argv[2] ?? 'http://localhost:5173/').replace(/\/?$/, '/');
const IPHONE_UA =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1';
const ANDROID_UA =
  'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Mobile Safari/537.36';
let failed = false;
const check = (ok: boolean, msg: string) => {
  console.log(`${ok ? '✓' : '✗'} ${msg}`);
  if (!ok) failed = true;
};
const browser = await puppeteer.launch({
  executablePath: process.env.CHROME_PATH ?? '/usr/bin/google-chrome',
  headless: true,
  args: ['--no-sandbox', '--use-gl=swiftshader'],
});
const vp = {
  width: 844,
  height: 390,
  deviceScaleFactor: 2,
  isMobile: true,
  hasTouch: true,
  isLandscape: true,
};

const ios = await browser.newPage();
await ios.setUserAgent(IPHONE_UA);
await ios.setViewport(vp);
await ios.goto(`${CLIENT}?firestore=0`, { waitUntil: 'load' });
await ios.waitForSelector('.menu #name', { timeout: 15000 });
const hint = await ios.waitForSelector('.ios-hint', { timeout: 5000 }).catch(() => null);
check(!!hint, 'iPhone Safari tab shows the home-screen hint');
await new Promise((r) => setTimeout(r, 400));
await ios.screenshot({ path: path.join(root, 'docs/review/ios-hint-844x390.png') });
const box = await hint?.boundingBox();
check(!!box && box.y + box.height <= vp.height && box.y >= 0, 'hint fully on screen');
await ios.tap('.ios-hint-ok');
check((await ios.$('.ios-hint')) === null, 'OK dismisses it');
await ios.reload({ waitUntil: 'load' });
await ios.waitForSelector('.menu #name', { timeout: 15000 });
await new Promise((r) => setTimeout(r, 500));
check((await ios.$('.ios-hint')) === null, 'dismissal is remembered after reload');
for (const href of [
  'apple-touch-icon.png',
  'icon-192.png',
  'icon-512.png',
  'manifest.webmanifest',
]) {
  const st = await ios.evaluate(async (u) => (await fetch(u)).status, href);
  check(st === 200, `${href} → ${st}`);
}
const touchIcon = await ios.$eval('link[rel="apple-touch-icon"]', async (l) => {
  const href = (l as HTMLLinkElement).href;
  return `${href} → ${(await fetch(href)).status}`;
});
check(touchIcon.endsWith('200'), `<link rel="apple-touch-icon"> ${touchIcon}`);

const android = await browser.newPage();
await android.setUserAgent(ANDROID_UA);
await android.setViewport(vp);
await android.goto(`${CLIENT}?firestore=0`, { waitUntil: 'load' });
await android.waitForSelector('.menu #name', { timeout: 15000 });
await new Promise((r) => setTimeout(r, 500));
check((await android.$('.ios-hint')) === null, 'Android never sees the iPhone hint');

await browser.close();
process.exit(failed ? 1 : 0);
