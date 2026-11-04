/**
 * Main-menu gothic backdrop screenshots: docs/review/menu-bg-<WxH>.png at 1280x800, 844x390, 390x844.
 * Usage: npx tsx scripts/menu-bg-shot.ts [clientUrl]
 */
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import puppeteer from 'puppeteer-core';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const CLIENT = (process.argv[2] ?? 'http://localhost:5173/').replace(/\/?$/, '/');
const browser = await puppeteer.launch({
  executablePath: process.env.CHROME_PATH ?? '/usr/bin/google-chrome',
  headless: true,
  args: ['--no-sandbox', '--use-gl=swiftshader'],
});
for (const [w, h, mobile] of [
  [1280, 800, false],
  [844, 390, true],
  [390, 844, true],
] as const) {
  const p = await browser.newPage();
  p.on('pageerror', (e) => console.log('pageerror', e));
  await p.setViewport({
    width: w,
    height: h,
    isMobile: mobile,
    hasTouch: mobile,
    deviceScaleFactor: 1,
  });
  await p.goto(`${CLIENT}?firestore=0`, { waitUntil: 'load' });
  await p.waitForSelector('.menu #name', { timeout: 15000 });
  await new Promise((r) => setTimeout(r, 800));
  await p.screenshot({ path: path.join(root, `docs/review/menu-bg-${w}x${h}.png`) });
  console.log(`✓ menu-bg-${w}x${h}.png`);
  await p.close();
}
await browser.close();
