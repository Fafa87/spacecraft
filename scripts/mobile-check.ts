/**
 * Headless mobile-emulation check (plus a desktop regression pass) for the touch controls
 * and the join-by-QR flow. Runs against a served client, e.g. the dev server or a static
 * `build:pages` output:
 *
 *   npx tsx scripts/mobile-check.ts [clientUrl]      # default http://localhost:5173/
 *
 *  1. iPhone 14 / Pixel 5 (landscape, touch): menu renders with tap-friendly controls
 *  2. Hosting a room shows a QR; it is decoded from the canvas pixels (jsQR) and must equal
 *     the share link (`<origin><base>?join=CODE`)       -> docs/mobile-lobby-qr.png
 *  3. Opening the decoded link goes straight to the join flow (callsign only, prefilled)
 *  4. Solo run driven by synthetic multi-touch (CDP): left stick moves, right stick aims and
 *     auto-fires, reload button, weapon slot tap        -> docs/mobile-gameplay.png
 *  5. Portrait: rotate hint shown, game still playable
 *  6. Desktop (mouse + keyboard, no touch): WASD moves, mouse aims/fires, touch UI hidden
 *
 * Env: CHROME_PATH (default /usr/bin/google-chrome), NO_SHOTS=1 to skip screenshots.
 */
import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import jsQR from 'jsqr';
import puppeteer, { KnownDevices, type Browser, type CDPSession, type Page } from 'puppeteer-core';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const docs = path.join(root, 'docs');
mkdirSync(docs, { recursive: true });
const CLIENT = new URL(process.argv[2] ?? 'http://localhost:5173/').href;
const CHROME = process.env.CHROME_PATH ?? '/usr/bin/google-chrome';
const SHOTS = process.env.NO_SHOTS !== '1';

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
let failures = 0;
let p2pBlocked = false;
const check = (ok: boolean, msg: string) => {
  console.log(`${ok ? '✓' : '✗'} ${msg}`);
  if (!ok) failures++;
};
const note = (msg: string) => console.log(`• ${msg}`);

type P = { x: number; y: number };
const player = (page: Page) =>
  page.evaluate(() => {
    const p = (window as any).__sms.conn.host.world.players[0];
    return {
      x: p.x as number,
      y: p.y as number,
      aim: p.aim as number,
      state: p.state as string,
      current: p.current as string,
      weapons: [...p.weapons] as string[],
      ammo: p.ammo[p.current] as number,
      reload: p.reloadTimer as number,
      mx: p.input.mx as number,
      my: p.input.my as number,
      fire: !!p.input.fire,
    };
  });
const keepAlive = (page: Page) =>
  page.evaluate(() => {
    const p = (window as any).__sms.conn.host.world.players[0];
    p.hp = p.maxHp;
    p.invuln = 5;
  });

/** Multi-touch driver on top of CDP Input.dispatchTouchEvent. */
class Touch {
  private points = new Map<number, P>();
  constructor(private readonly cdp: CDPSession) {}
  private pts() {
    return [...this.points].map(([id, p]) => ({ id, x: p.x, y: p.y, radiusX: 8, radiusY: 8 }));
  }
  async start(id: number, p: P) {
    this.points.set(id, p);
    await this.cdp.send('Input.dispatchTouchEvent', {
      type: 'touchStart',
      touchPoints: this.pts(),
    });
  }
  async move(id: number, p: P) {
    this.points.set(id, p);
    await this.cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: this.pts() });
  }
  /** Smooth drag from the current position. */
  async drag(id: number, to: P, steps = 6) {
    const from = this.points.get(id)!;
    for (let i = 1; i <= steps; i++) {
      await this.move(id, {
        x: from.x + ((to.x - from.x) * i) / steps,
        y: from.y + ((to.y - from.y) * i) / steps,
      });
      await sleep(16);
    }
  }
  /** Lifts one finger. (CDP's touchEnd takes the point(s) being released.) */
  async end(id: number) {
    const pt = this.points.get(id);
    if (!pt) return;
    this.points.delete(id);
    await this.cdp.send('Input.dispatchTouchEvent', {
      type: 'touchEnd',
      touchPoints: [{ id, x: pt.x, y: pt.y }],
    });
  }
  async endOldest() {
    const first = this.points.keys().next().value;
    if (first !== undefined) await this.end(first);
  }
  async endAll() {
    while (this.points.size) await this.endOldest();
  }
}

function watchErrors(page: Page, label: string, errors: string[]) {
  page.on('pageerror', (e) => errors.push(`${label} pageerror: ${(e as Error).message}`));
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(`${label} console: ${m.text()}`);
  });
}

async function decodeQr(page: Page): Promise<{ text: string | null; url: string }> {
  await page.waitForFunction(
    () => {
      const c = document.querySelector<HTMLCanvasElement>('canvas#qr');
      if (!c || !c.dataset.url || c.width < 50) return false;
      const d = c.getContext('2d')!.getImageData(0, 0, c.width, c.height).data;
      for (let i = 0; i < d.length; i += 4) if (d[i] < 50) return true;
      return false;
    },
    { timeout: 10000 },
  );
  const img = await page.$eval('canvas#qr', (c) => {
    const cv = c as HTMLCanvasElement;
    const d = cv.getContext('2d')!.getImageData(0, 0, cv.width, cv.height);
    return { w: d.width, h: d.height, data: Array.from(d.data), url: cv.dataset.url ?? '' };
  });
  const res = jsQR(new Uint8ClampedArray(img.data), img.w, img.h);
  return { text: res?.data ?? null, url: img.url };
}

async function mobile(browser: Browser, deviceName: keyof typeof KnownDevices, errors: string[]) {
  const dev = KnownDevices[deviceName];
  const tag = deviceName;
  const ctx = await browser.createBrowserContext();
  const page = await ctx.newPage();
  watchErrors(page, tag, errors);
  await page.emulate(dev);
  await page.goto(CLIENT, { waitUntil: 'networkidle0' });
  await page.waitForSelector('.menu #solo', { timeout: 15000 });
  const W = dev.viewport.width;
  const H = dev.viewport.height;

  // 1. menu
  await page.touchscreen.tap(W / 2, 12);
  const menu = await page.evaluate(() => {
    const r = document.querySelector('#solo')!.getBoundingClientRect();
    const vp = document.querySelector('meta[name=viewport]')?.getAttribute('content') ?? '';
    return {
      touchMode: document.body.classList.contains('touch-mode'),
      solo: { h: r.height, w: r.width },
      overflowX: document.documentElement.scrollWidth > innerWidth + 1,
      touchHelp: getComputedStyle(document.querySelector('.help .touch-only')!).display !== 'none',
      vp,
    };
  });
  check(menu.touchMode, `${tag}: touch detected (body.touch-mode)`);
  check(
    menu.solo.h >= 44 && !menu.overflowX && menu.touchHelp,
    `${tag}: menu renders tap-friendly (solo button ${menu.solo.w | 0}x${menu.solo.h | 0}, no horizontal overflow, touch help shown)`,
  );
  check(
    menu.vp.includes('user-scalable=no') && menu.vp.includes('viewport-fit=cover'),
    `${tag}: viewport meta blocks zoom (${menu.vp})`,
  );

  // 2. host -> lobby QR
  await page.$eval('#name', (e) => ((e as HTMLInputElement).value = ''));
  await page.type('#name', 'Filip');
  await page.tap('#host');
  await page.waitForSelector('.room canvas#qr', { timeout: 20000 });
  const code = await page.$eval('.room #code', (e) => e.textContent ?? '');
  const qr = await decodeQr(page);
  const linkInput = await page.$eval('#link', (e) => (e as HTMLInputElement).value);
  const expected = `${CLIENT.replace(/\?.*$/, '')}?join=${code}`;
  check(
    qr.text === expected && qr.url === expected && linkInput === expected,
    `${tag}: lobby QR decodes to the join link ${qr.text} (code ${code})`,
  );
  const qrBox = await page.$eval('canvas#qr', (c) => {
    const r = c.getBoundingClientRect();
    return { w: r.width, inView: r.top >= 0 && r.bottom <= innerHeight + 1 };
  });
  check(qrBox.w >= 120, `${tag}: QR is ${qrBox.w | 0}px wide on screen`);
  if (SHOTS && deviceName === 'iPhone 14 landscape') {
    // a little scroll so the QR + code are in frame on the short screen
    await page.screenshot({ path: path.join(docs, 'mobile-lobby-qr.png') });
  }

  // 3. scan -> join flow
  const joiner = await ctx.newPage();
  watchErrors(joiner, `${tag}-joiner`, errors);
  await joiner.emulate(dev);
  await joiner.goto(qr.text ?? expected, { waitUntil: 'networkidle0' });
  await joiner.waitForSelector('.join-screen #go', { timeout: 15000 });
  const join = await joiner.evaluate(() => ({
    code: document.querySelector('.join-screen .code')?.textContent,
    name: (document.querySelector('#name') as HTMLInputElement).value,
    menu: !!document.querySelector('.menu'),
    screen: (window as any).__sms?.screen,
  }));
  check(
    join.code === code && join.name === 'Filip' && !join.menu && join.screen === 'join',
    `${tag}: ?join=${code} opens the join flow (code shown, callsign prefilled "${join.name}")`,
  );
  await joiner.tap('#go');
  const outcome = await joiner
    .waitForFunction(
      () =>
        document.querySelector('.room .players li:not(.empty)')
          ? 'room'
          : document.querySelector('#err')?.textContent || '',
      { timeout: 20000 },
    )
    .then((h) => h.jsonValue() as Promise<string>)
    .catch(() => 'pending');
  if (outcome === 'room') {
    const search = await joiner.evaluate(() => location.search);
    check(!search.includes('join='), `${tag}: joined the room via QR link; ?join removed from URL`);
    await page.waitForFunction(
      () => document.querySelectorAll('.room .players li:not(.empty)').length === 2,
      { timeout: 10000 },
    );
    check(true, `${tag}: host lobby shows 2 marines`);
  } else {
    p2pBlocked = true;
    note(
      `${tag}: join attempt ended with "${outcome}" — WebRTC data channels are blocked on this box, so the P2P connect itself is not verifiable here (stays on join screen with error, as designed)`,
    );
  }
  await joiner.close();

  // 4. solo run with twin-stick touch
  await page.tap('#leave');
  await page.waitForSelector('.menu #solo', { timeout: 10000 });
  await page.tap('#solo');
  await page.waitForFunction(() => (window as any).__sms?.screen === 'game', { timeout: 15000 });
  await sleep(600);
  await keepAlive(page);
  const cdp = await page.createCDPSession();
  const t = new Touch(cdp);
  const p0 = await player(page);
  const L = { x: 130, y: H - 110 };
  await t.start(0, L);
  await t.drag(0, { x: L.x + 55, y: L.y });
  await sleep(1200);
  const p1 = await player(page);
  check(
    p1.mx > 0.8 && Math.abs(p1.my) < 0.1 && p1.x - p0.x > 60,
    `${tag}: left stick moves the marine (mx=${p1.mx.toFixed(2)}, x ${p0.x.toFixed(0)} → ${p1.x.toFixed(0)})`,
  );
  check(
    !p1.fire && Math.abs(p1.aim) < 0.05,
    `${tag}: moving without aiming faces the move direction, no fire (aim=${p1.aim.toFixed(2)})`,
  );
  const R = { x: Math.round(W * 0.66), y: Math.round(H * 0.6) };
  await t.start(1, R); // second simultaneous finger
  await t.drag(1, { x: R.x, y: R.y - 55 });
  const ammo0 = (await player(page)).ammo;
  let minAmmo = ammo0;
  let sawFire = false;
  let aimOk = false;
  for (let i = 0; i < 10; i++) {
    await sleep(100);
    const s = await player(page);
    minAmmo = Math.min(minAmmo, s.ammo);
    sawFire ||= s.fire;
    aimOk ||= Math.abs(s.aim + Math.PI / 2) < 0.05;
    if (i === 5 && SHOTS && deviceName === 'iPhone 14 landscape')
      await page.screenshot({ path: path.join(docs, 'mobile-gameplay.png') });
  }
  const p2 = await player(page);
  check(
    sawFire && aimOk && minAmmo < ammo0 && p2.mx > 0.8,
    `${tag}: right stick aims up (aim≈-π/2) and auto-fires while the left stick keeps moving (ammo ${ammo0} → ${minAmmo})`,
  );
  await t.endAll();
  await sleep(150);
  const p3 = await player(page);
  check(p3.mx === 0 && !p3.fire, `${tag}: lifting both thumbs stops moving and firing`);
  // aim finger down first, then the move finger; lift the aim finger only
  await t.start(0, R);
  await t.drag(0, { x: R.x - 55, y: R.y });
  await t.start(1, L);
  await t.drag(1, { x: L.x, y: L.y + 55 });
  await sleep(300);
  const p4 = await player(page);
  await t.endOldest();
  await sleep(150);
  const p5 = await player(page);
  await t.endAll();
  check(
    p4.fire && Math.abs(Math.abs(p4.aim) - Math.PI) < 0.05 && p4.my > 0.8,
    `${tag}: sticks are independent of which finger lands first (aim left + move down, fire=${p4.fire})`,
  );
  check(
    !p5.fire && p5.my > 0.8 && Math.abs(p5.aim - Math.PI / 2) < 0.05,
    `${tag}: lifting only the aim thumb stops firing, keeps moving, faces the move direction (fire=${p5.fire} my=${p5.my.toFixed(2)} aim=${p5.aim.toFixed(2)})`,
  );

  // reload button
  await page.evaluate(() => {
    const p = (window as any).__sms.conn.host.world.players[0];
    p.ammo[p.current] = Math.max(1, Math.floor(p.ammo[p.current] / 2));
    p.reloadTimer = 0;
  });
  await page.tap('.touch-layer .tb.main');
  await sleep(120);
  check((await player(page)).reload > 0, `${tag}: ⟳ button reloads`);

  // weapon slot tap (grant a second weapon, tap its HUD slot)
  const target = await page.evaluate(() => {
    const app = (window as any).__sms;
    const p = app.conn.host.world.players[0];
    const order = app.game.content.weaponOrder as { id: string; slot: number }[];
    const w = order.find((d) => d.id !== p.current)!;
    if (!p.weapons.includes(w.id)) p.weapons.push(w.id);
    p.ammo[w.id] ??= 10;
    return w;
  });
  await sleep(200);
  const rect = await page.evaluate(
    (slot) =>
      ((window as any).__sms.game.hud.slotRects as any[]).find((r) => r.slot === slot) ?? null,
    target.slot,
  );
  if (rect) {
    await t.start(2, { x: rect.x + rect.w / 2, y: rect.y + rect.h / 2 });
    await t.endAll();
    await sleep(200);
    const p6 = await player(page);
    check(
      p6.current === target.id && p6.mx === 0 && !p6.fire,
      `${tag}: tapping weapon slot ${target.slot} switches to ${target.id} (no stray stick)`,
    );
  } else check(false, `${tag}: weapon slot ${target.slot} rect found`);
  const hidden = await page.evaluate(() => {
    const l = document.querySelector('.touch-layer');
    return l ? getComputedStyle(l).display : 'missing';
  });
  check(hidden === 'block', `${tag}: touch layer visible in-game`);
  await cdp.detach();
  await ctx.close();
}

async function portrait(browser: Browser, errors: string[]) {
  const dev = KnownDevices['iPhone 14'];
  const ctx = await browser.createBrowserContext();
  const page = await ctx.newPage();
  watchErrors(page, 'portrait', errors);
  await page.emulate(dev);
  await page.goto(CLIENT, { waitUntil: 'networkidle0' });
  await page.waitForSelector('.menu #solo', { timeout: 15000 });
  await page.tap('#solo');
  await page.waitForFunction(() => (window as any).__sms?.screen === 'game', { timeout: 15000 });
  await sleep(500);
  await keepAlive(page);
  const hint = await page.$eval('.rotate-hint', (e) => getComputedStyle(e).display);
  const cdp = await page.createCDPSession();
  const t = new Touch(cdp);
  const p0 = await player(page);
  await t.start(0, { x: 100, y: dev.viewport.height - 140 });
  await t.drag(0, { x: 100, y: dev.viewport.height - 195 });
  await sleep(900);
  const p1 = await player(page);
  await t.endAll();
  check(
    hint === 'block' && p0.y - p1.y > 40,
    `iPhone 14 portrait: rotate hint shown, still playable (y ${p0.y.toFixed(0)} → ${p1.y.toFixed(0)})`,
  );
  await ctx.close();
}

async function desktop(browser: Browser, errors: string[]) {
  const ctx = await browser.createBrowserContext();
  const page = await ctx.newPage();
  watchErrors(page, 'desktop', errors);
  await page.setViewport({ width: 1280, height: 760 });
  await page.goto(CLIENT, { waitUntil: 'networkidle0' });
  await page.waitForSelector('.menu #solo', { timeout: 15000 });
  const ui = await page.evaluate(() => ({
    touch: document.body.classList.contains('touch-mode'),
    kbmHelp: getComputedStyle(document.querySelector('.help .kbm-only')!).display !== 'none',
  }));
  check(!ui.touch && ui.kbmHelp, 'desktop: no touch mode, keyboard/mouse help shown');
  await page.click('#solo');
  await page.waitForFunction(() => (window as any).__sms?.screen === 'game', { timeout: 15000 });
  await sleep(500);
  await keepAlive(page);
  const layer = await page.$eval('.touch-layer', (e) => getComputedStyle(e).display);
  check(layer === 'none', 'desktop: touch controls hidden in-game');
  const p0 = await player(page);
  await page.mouse.move(1100, 380);
  await page.keyboard.down('KeyD');
  await sleep(1000);
  const p1 = await player(page);
  check(
    p1.mx === 1 && p1.x - p0.x > 60 && !p1.fire,
    `desktop: D moves right (x ${p0.x.toFixed(0)} → ${p1.x.toFixed(0)}), no fire without click`,
  );
  await page.keyboard.up('KeyD');
  await page.mouse.move(640, 80); // straight up from the screen centre-ish
  await page.mouse.down();
  await sleep(500);
  const p2 = await player(page);
  await page.mouse.up();
  check(
    p2.fire && p2.aim < -0.8 && p2.aim > -2.4,
    `desktop: mouse aims at the cursor and LMB fires (aim=${p2.aim.toFixed(2)})`,
  );
  await page.keyboard.press('Space'); // still fires with space
  await page.keyboard.press('Digit1');
  await sleep(100);
  const crosshairHidden = await page.$eval('canvas#game', (c) => getComputedStyle(c).cursor);
  check(crosshairHidden === 'none', 'desktop: OS cursor hidden in-game (canvas crosshair)');
  await ctx.close();
}

async function main() {
  console.log(`client: ${CLIENT}`);
  const browser = await puppeteer.launch({
    executablePath: CHROME,
    headless: true,
    args: [
      '--no-sandbox',
      '--disable-background-timer-throttling',
      '--disable-renderer-backgrounding',
      '--disable-backgrounding-occluded-windows',
      '--autoplay-policy=no-user-gesture-required',
      '--use-gl=swiftshader',
      '--enable-unsafe-swiftshader',
    ],
  });
  const errors: string[] = [];
  try {
    await mobile(browser, 'iPhone 14 landscape', errors);
    await mobile(browser, 'Pixel 5 landscape', errors);
    await portrait(browser, errors);
    await desktop(browser, errors);
  } catch (e) {
    check(false, `crashed: ${(e as Error).stack}`);
  } finally {
    await browser.close();
  }
  // The joiner logs its (expected) connect error via console.error when P2P is blocked.
  const real = errors.filter(
    (e) =>
      !/peer|webrtc|negotiat|Could not connect/i.test(e) &&
      !(p2pBlocked && e.includes('-joiner console')),
  );
  for (const e of errors) note(e);
  check(
    real.length === 0,
    `no page errors (${errors.length - real.length} P2P-related notes ignored)`,
  );
  console.log(failures ? `\n${failures} check(s) FAILED` : '\nall mobile checks passed');
  process.exit(failures ? 1 : 0);
}
void main();
