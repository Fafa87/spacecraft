/** Screenshots of the rules page (docs/review/rules-*.png). Needs `vite preview` on RULES_URL. */
import puppeteer from 'puppeteer-core';

const base = process.env.RULES_URL ?? 'http://localhost:4317/spacecraft/';
const out = 'docs/review';
const browser = await puppeteer.launch({
  executablePath: process.env.CHROME_PATH ?? '/usr/bin/google-chrome',
  args: ['--no-sandbox'],
});
const views = [
  ['desktop', 1280, 800, false],
  ['landscape', 844, 390, true],
  ['portrait', 390, 844, true],
] as const;
for (const [name, width, height, mobile] of views) {
  const p = await browser.newPage();
  await p.setViewport({
    width,
    height,
    isMobile: mobile,
    hasTouch: mobile,
    deviceScaleFactor: mobile ? 2 : 1,
  });
  await p.goto(`${base}rules.html`, { waitUntil: 'networkidle0' });
  await p.screenshot({ path: `${out}/rules-${name}.png` });
  await p.evaluate(() => {
    document.querySelector('details')!.open = true;
    document.querySelector('#kompendium')!.scrollIntoView();
  });
  await p.screenshot({ path: `${out}/rules-${name}-compendium.png` });
  if (name === 'desktop')
    await p.screenshot({ path: `${out}/rules-desktop-full.png`, fullPage: true });
  const dims = await p.evaluate(() => [
    document.documentElement.scrollWidth,
    innerWidth,
    document.documentElement.scrollHeight,
  ]);
  console.log(name, 'scrollWidth/innerWidth/scrollHeight', dims);
}
// Directional armour section + its compendium tables.
{
  const p = await browser.newPage();
  await p.setViewport({ width: 1280, height: 800 });
  await p.goto(`${base}rules.html#pancerz`, { waitUntil: 'networkidle0' });
  await p.evaluate(() => document.querySelector('#pancerz')!.scrollIntoView());
  await p.screenshot({ path: `${out}/rules-armour.png` });
  await p.evaluate(() => {
    document.querySelector('details')!.open = true;
    const h = [...document.querySelectorAll('h3')].find((e) =>
      e.textContent!.startsWith('Pancerz kierunkowy'),
    )!;
    h.scrollIntoView();
  });
  await p.screenshot({ path: `${out}/rules-armour-compendium.png` });
  const mp = await browser.newPage();
  await mp.setViewport({
    width: 390,
    height: 844,
    isMobile: true,
    hasTouch: true,
    deviceScaleFactor: 2,
  });
  await mp.goto(`${base}rules.html`, { waitUntil: 'networkidle0' });
  await mp.evaluate(() => document.querySelector('#pancerz')!.scrollIntoView());
  await mp.screenshot({ path: `${out}/rules-armour-portrait.png` });
}
const m = await browser.newPage();
const errors: string[] = [];
m.on('pageerror', (e) => errors.push(String(e)));
await m.setViewport({ width: 1280, height: 800 });
await m.goto(base, { waitUntil: 'networkidle0' });
await m.screenshot({ path: `${out}/rules-menu-link.png` });
await Promise.all([m.waitForNavigation(), m.click('.rules-link')]);
console.log('menu link ->', m.url(), errors);
await browser.close();
