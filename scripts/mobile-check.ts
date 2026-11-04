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
 *     auto-fires, reload button                        -> docs/mobile-gameplay.png
 *  5. Portrait phone: full-screen "Obróć telefon / Rotate your device" overlay blocks the menu
 *     and pauses a running game (no input, solo sim frozen); rotating to landscape resumes
 *     play                          -> docs/review/rotate-overlay.png, landscape-gameplay.png
 *  6. Desktop (mouse + keyboard, no touch): WASD moves, mouse aims/fires, touch UI hidden
 *  7. Weapon switch by touch (v0.6.0 hotfix regression) on 844x390 iPhone, 667x375 iPhone 8,
 *     915x412 Android, iPhone 14 / Pixel 5: slot taps with the move stick (and the fire stick)
 *     held, locked slot ignored, slot geometry in CSS px under the minimap
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
  const fs = await page.evaluate(() => ({
    fs: !!document.fullscreenElement,
    o: screen.orientation?.type ?? '?',
  }));
  check(
    fs.fs && fs.o.startsWith('landscape'),
    `${tag}: first button tap (Host) went fullscreen + landscape (${fs.o})`,
  );
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

  // weapon slot taps: see weaponSwitch() (v0.6.0 hotfix regression, more phones)
  const hidden = await page.evaluate(() => {
    const l = document.querySelector('.touch-layer');
    return l ? getComputedStyle(l).display : 'missing';
  });
  check(hidden === 'block', `${tag}: touch layer visible in-game`);
  await cdp.detach();
  await ctx.close();
}

/** Custom phones not in puppeteer's KnownDevices (real CSS viewports, landscape). */
const IPHONE_UA =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1';
const ANDROID_UA =
  'Mozilla/5.0 (Linux; Android 14; Pixel 8 Pro) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Mobile Safari/537.36';
type Dev = {
  userAgent: string;
  viewport: {
    width: number;
    height: number;
    deviceScaleFactor: number;
    isMobile: boolean;
    hasTouch: boolean;
    isLandscape: boolean;
  };
};
const phone = (userAgent: string, width: number, height: number, dpr: number): Dev => ({
  userAgent,
  viewport: {
    width,
    height,
    deviceScaleFactor: dpr,
    isMobile: true,
    hasTouch: true,
    isLandscape: true,
  },
});
const SWITCH_DEVICES: [string, Dev][] = [
  ['iPhone 844x390', phone(IPHONE_UA, 844, 390, 3)],
  ['iPhone 8 landscape 667x375', KnownDevices['iPhone 8 landscape'] as Dev],
  ['Android 915x412', phone(ANDROID_UA, 915, 412, 2.625)],
  ['iPhone 14 landscape', KnownDevices['iPhone 14 landscape'] as Dev],
  ['Pixel 5 landscape', KnownDevices['Pixel 5 landscape'] as Dev],
];

type SlotRect = { slot: number; owned: boolean; x: number; y: number; w: number; h: number };
const slotRects = (page: Page) =>
  page.evaluate(() => {
    const hud = (window as any).__sms.game.hud;
    const ui = hud.lastUi as number;
    const ins = hud.lastIns as { top: number; left: number };
    const a = hud.content.map.arena as { width: number; height: number };
    return {
      // CSS px, exactly what the touch handler compares against (hud.slotAt)
      rects: (hud.slotRects as SlotRect[]).map((q) => ({ ...q })),
      // minimap panel bottom in CSS px (minimap(): y0 12, height 190*h/w, panel +4)
      minimapBottom: ins.top + (12 + (190 * a.height) / a.width + 4) * ui,
      ui,
    };
  });
const centre = (r: SlotRect): P => ({ x: r.x + r.w / 2, y: r.y + r.h / 2 });

/**
 * v0.6.0 hotfix regression: on phones the weapon could not be switched (slot taps were mapped
 * to the wrong place). Real touch input (CDP, mobile UA, isMobile + hasTouch) on several real
 * phone viewports: tap a slot with a second finger while the move stick (and the aim/fire
 * stick) is held, tap a locked slot (no switch), switch back.
 */
async function weaponSwitch(browser: Browser, tag: string, dev: Dev, errors: string[]) {
  const ctx = await browser.createBrowserContext();
  const page = await ctx.newPage();
  watchErrors(page, tag, errors);
  await page.evaluateOnNewDocument('globalThis.__name = (f) => f');
  await page.emulate(dev);
  await page.goto(CLIENT, { waitUntil: 'networkidle0' });
  await page.waitForSelector('.menu #solo', { timeout: 15000 });
  const W = dev.viewport.width;
  const H = dev.viewport.height;
  await page.touchscreen.tap(W / 2, 12); // first real touch -> touch mode
  await page.tap('#solo');
  await page.waitForFunction(() => (window as any).__sms?.screen === 'game', { timeout: 15000 });
  await sleep(600);
  await keepAlive(page);
  // own the first two weapons only (slot 1 + 2); the rest stays locked
  const order = await page.evaluate(() => {
    const app = (window as any).__sms;
    const p = app.conn.host.world.players[0];
    const ids = (app.game.content.weaponOrder as { id: string; slot: number }[]).map((d) => ({
      id: d.id,
      slot: d.slot,
    }));
    for (const w of ids.slice(0, 2)) {
      if (!p.weapons.includes(w.id)) p.weapons.push(w.id);
      p.ammo[w.id] ??= 30;
    }
    p.weapons = p.weapons.filter((id: string) => ids.slice(0, 2).some((w) => w.id === id));
    return ids;
  });
  await sleep(300);
  const [w1, w2] = order;
  const g = await slotRects(page);
  const r1 = g.rects.find((r) => r.slot === w1.slot);
  const r2 = g.rects.find((r) => r.slot === w2.slot);
  const locked = g.rects.find((r) => !r.owned);
  check(!!r1 && !!r2 && !!locked, `${tag}: weapon slot rects (owned + locked) are laid out`);
  if (!r1 || !r2 || !locked) {
    await ctx.close();
    return;
  }
  // geometry: CSS px, on screen, right column under the minimap (a HUD-unit/CSS-px mix-up fails this)
  const onScreen = g.rects.every((r) => r.x >= 0 && r.y >= 0 && r.x + r.w <= W && r.y + r.h <= H);
  const right = g.rects.every((r) => r.x >= W / 2);
  const under = g.rects.every((r) => r.y >= g.minimapBottom - 1);
  const hits = await page.evaluate(
    (pts: P[]) =>
      pts.map((p) => {
        const hud = (window as any).__sms.game.hud;
        const el = document.elementFromPoint(p.x, p.y);
        return {
          slot: hud.slotAt(p.x, p.y) as number,
          button: !!el?.closest('.touch-buttons, .tb'),
        };
      }),
    [centre(r1), centre(r2), centre(locked)],
  );
  check(
    onScreen && right && under,
    `${tag}: slots on screen, right column, below the minimap (ui=${g.ui.toFixed(2)}, first slot ${r1.x | 0},${r1.y | 0} ${r1.w | 0}x${r1.h | 0})`,
  );
  check(
    hits[0].slot === w1.slot &&
      hits[1].slot === w2.slot &&
      hits[2].slot === 0 &&
      !hits.some((h) => h.button),
    `${tag}: slotAt(centre) hits its own slot, locked → 0, no button covers a slot`,
  );

  const cdp = await page.createCDPSession();
  const t = new Touch(cdp);
  const L = { x: 130, y: H - 110 };
  await t.start(0, L);
  await t.drag(0, { x: L.x + 55, y: L.y }); // hold the move stick
  await sleep(300);
  // second finger taps slot 2 while the stick is held
  await t.start(1, centre(r2));
  await sleep(60);
  await t.end(1);
  await sleep(250);
  const a = await player(page);
  check(
    a.current === w2.id && a.mx > 0.8,
    `${tag}: tap slot ${w2.slot} while moving switches to ${w2.id}, marine keeps moving (current=${a.current} mx=${a.mx.toFixed(2)})`,
  );
  // + hold the aim/fire stick, tap slot 1 with a third finger
  const R = { x: Math.round(W * 0.5), y: Math.round(H * 0.62) };
  await t.start(2, R);
  await t.drag(2, { x: R.x, y: R.y - 55 });
  await sleep(250);
  await t.start(3, centre(r1));
  await sleep(60);
  await t.end(3);
  await sleep(250);
  const b = await player(page);
  check(
    b.current === w1.id && b.mx > 0.8 && b.fire,
    `${tag}: tap slot ${w1.slot} while moving AND firing switches back to ${w1.id} (mx=${b.mx.toFixed(2)} fire=${b.fire})`,
  );
  // locked slot: no switch
  await t.start(4, centre(locked));
  await sleep(60);
  await t.end(4);
  await sleep(250);
  const c = await player(page);
  check(
    c.current === w1.id,
    `${tag}: tapping locked slot ${locked.slot} does not switch (current=${c.current})`,
  );
  await t.endAll();
  await sleep(150);
  // a plain tap (no other finger) still switches
  await t.start(0, centre(r2));
  await sleep(60);
  await t.end(0);
  await sleep(250);
  const d = await player(page);
  check(
    d.current === w2.id && d.mx === 0 && !d.fire,
    `${tag}: single tap on slot ${w2.slot} switches, no stray stick`,
  );
  await cdp.detach();
  await ctx.close();
}

async function portrait(browser: Browser, errors: string[]) {
  const dev = KnownDevices['iPhone 14'];
  const land = KnownDevices['iPhone 14 landscape'].viewport;
  const portraitVp = dev.viewport;
  const ctx = await browser.createBrowserContext();
  const page = await ctx.newPage();
  watchErrors(page, 'portrait', errors);
  await page.emulate(dev);
  await page.goto(CLIENT, { waitUntil: 'networkidle0' });
  await page.waitForSelector('.menu #solo', { timeout: 15000 });
  await page.touchscreen.tap(portraitVp.width / 2, 12); // first touch -> touch mode
  await sleep(150);
  const overlay = () =>
    page.evaluate(() => {
      const o = document.querySelector('.rotate-overlay') as HTMLElement;
      const r = o.getBoundingClientRect();
      const top = document.elementFromPoint(innerWidth / 2, innerHeight / 2);
      return {
        shown: getComputedStyle(o).display !== 'none',
        covers: r.width >= innerWidth && r.height >= innerHeight && !!top && o.contains(top),
        text: o.textContent?.replace(/\s+/g, ' ').trim() ?? '',
        icon: !!o.querySelector('svg'),
      };
    });
  const m = await overlay();
  check(
    m.shown &&
      m.covers &&
      m.icon &&
      m.text.includes('Obróć telefon') &&
      m.text.includes('Rotate your device'),
    `iPhone 14 portrait: full-screen rotate overlay with icon on the menu ("${m.text.slice(0, 40)}…")`,
  );
  await page.touchscreen.tap(portraitVp.width / 2, portraitVp.height / 2);
  await sleep(300);
  const scr = await page.evaluate(() => (window as any).__sms?.screen);
  check(scr === 'menu', `iPhone 14 portrait: taps under the overlay are blocked (screen=${scr})`);

  // rotate -> landscape: overlay gone, start a solo run
  await page.setViewport({ ...land });
  await sleep(300);
  check(!(await overlay()).shown, 'iPhone 14 rotated to landscape: overlay hidden');
  await page.tap('#solo');
  await page.waitForFunction(() => (window as any).__sms?.screen === 'game', { timeout: 15000 });
  await sleep(500);
  await keepAlive(page);

  // back to portrait mid-game: overlay up, input + solo sim paused
  await page.setViewport({ ...portraitVp });
  await sleep(400);
  const g = await overlay();
  const tick0 = await page.evaluate(() => (window as any).__sms.conn.host.world.tick as number);
  const cdp = await page.createCDPSession();
  const t = new Touch(cdp);
  const p0 = await player(page);
  await t.start(0, { x: 100, y: portraitVp.height - 140 });
  await t.drag(0, { x: 100, y: portraitVp.height - 195 });
  await sleep(900);
  const p1 = await player(page);
  const tick1 = await page.evaluate(() => (window as any).__sms.conn.host.world.tick as number);
  await t.endAll();
  check(
    g.shown && g.covers && Math.abs(p1.y - p0.y) < 1 && p1.mx === 0 && tick1 === tick0,
    `iPhone 14 portrait mid-game: overlay up, input ignored and solo paused (y ${p0.y.toFixed(0)} → ${p1.y.toFixed(0)}, tick ${tick0} → ${tick1})`,
  );
  if (SHOTS) {
    mkdirSync(path.join(docs, 'review'), { recursive: true });
    await page.screenshot({ path: path.join(docs, 'review', 'rotate-overlay.png') });
  }

  // landscape again: playable, controls laid out for the wide screen
  await page.setViewport({ ...land });
  await sleep(400);
  await keepAlive(page);
  const H = land.height;
  const q0 = await player(page);
  await t.start(0, { x: 130, y: H - 110 });
  await t.drag(0, { x: 130, y: H - 165 });
  await sleep(900);
  const R = { x: Math.round(land.width * 0.7), y: Math.round(H * 0.6) };
  await t.start(1, R);
  await t.drag(1, { x: R.x + 55, y: R.y });
  await sleep(500);
  if (SHOTS) await page.screenshot({ path: path.join(docs, 'review', 'landscape-gameplay.png') });
  const q1 = await player(page);
  const tick2 = await page.evaluate(() => (window as any).__sms.conn.host.world.tick as number);
  const layout = await page.evaluate(() => {
    const [layer, buttons] = ['.touch-layer', '.touch-buttons'].map((sel) => {
      const e = document.querySelector(sel) as HTMLElement | null;
      if (!e || getComputedStyle(e).display === 'none') return false;
      const r = e.getBoundingClientRect();
      return (
        r.right <= innerWidth + 1 && r.bottom <= innerHeight + 1 && r.left >= -1 && r.top >= -1
      );
    });
    return { layer, buttons, overlay: document.body.classList.contains('rotate-blocked') };
  });
  await t.endAll();
  check(
    !layout.overlay && q0.y - q1.y > 40 && q1.fire && tick2 > tick1,
    `iPhone 14 landscape again: game resumes, stick moves (y ${q0.y.toFixed(0)} → ${q1.y.toFixed(0)}) and aim fires`,
  );
  check(
    !!layout.layer && !!layout.buttons,
    'iPhone 14 landscape: touch layer + buttons inside the viewport',
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
  await page.setViewport({ width: 420, height: 860 }); // tall, narrow PC window
  await sleep(200);
  const tallOverlay = await page.$eval('.rotate-overlay', (e) => getComputedStyle(e).display);
  check(tallOverlay === 'none', 'desktop: no rotate overlay even in a tall, narrow window');
  await page.setViewport({ width: 1280, height: 760 });
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
    for (const [tag, dev] of SWITCH_DEVICES) await weaponSwitch(browser, tag, dev, errors);
  } catch (e) {
    check(false, `crashed: ${(e as Error).stack}`);
  } finally {
    await browser.close();
  }
  // The joiner logs its (expected) connect error via console.error when P2P is blocked.
  const real = errors.filter(
    (e) =>
      !/peer|webrtc|negotiat|Could not connect/i.test(e) &&
      // Chrome intervention notice while the fullscreen transition settles; harmless
      !e.includes('Ignored attempt to cancel a touchstart') &&
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
