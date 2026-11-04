/**
 * Sprint review screenshots + checks against a served client (e.g. `vite preview` of build:pages):
 *
 *   npx tsx scripts/sprint-shots.ts [clientUrl]     # default http://localhost:5173/
 *
 *  - desktop 1280x760: Shift held together with the fire button does NOT start a sprint; once fire
 *    is released D + Shift sprints (×1.56) with the weapon hidden (not drawn), and pressing fire
 *    again neither fires nor cancels it                         -> docs/review/sprint-stowed.png
 *    release Shift: weapon raised over the 0.8 s delay          -> docs/review/sprint-ready-raise.png
 *    (+ *-zoom.png crops around the marine)
 *  - touch 844x390 + 667x375 landscape: move stick pushed past its ring into the sprint zone
 *    sprints (band lit), back inside stops it; no » SPRINT button any more (hotfix); the right
 *    thumb aims/fires at the same time  -> docs/review/sprint-touch-844x390.png, sprint-touch-667x375.png
 *  - move-stick feedback at 844x390: walking (plain ring), max walk (gold ring + knob, in the dead
 *    gap before the sprint band), sprint (band lit), blocked by a held trigger (band greyed)
 *    -> docs/review/stick-walk.png, stick-maxwalk.png, stick-sprint.png, stick-blocked.png
 */
import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import puppeteer, { type CDPSession, type Page } from 'puppeteer-core';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const out = path.join(root, 'docs', 'review');
mkdirSync(out, { recursive: true });
const CLIENT = new URL(process.argv[2] ?? 'http://localhost:5173/').href;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
let failures = 0;
const check = (ok: boolean, msg: string) => {
  console.log(`${ok ? '✓' : '✗'} ${msg}`);
  if (!ok) failures++;
};

const me = (page: Page) =>
  page.evaluate(() => {
    const p = (window as any).__sms.conn.host.world.players[0];
    return {
      x: p.x as number,
      y: p.y as number,
      ammo: p.ammo[p.current] as number,
      sprinting: !!p.sprint.sprinting,
      stamina: p.sprint.stamina as number,
      delay: p.sprint.weaponDelay as number,
      fire: !!p.input.fire,
    };
  });
const keepAlive = (page: Page) =>
  page.evaluate(() => {
    const w = (window as any).__sms.conn.host.world;
    w.director.idle = true; // quiet arena: the screenshots are about the HUD
    for (const p of w.players) {
      p.hp = p.maxHp;
      p.invuln = 30;
    }
  });
const startSolo = async (page: Page, tap: boolean) => {
  await page.waitForSelector('.menu #solo', { timeout: 15000 });
  if (tap) await page.tap('#solo');
  else await page.click('#solo');
  await page.waitForFunction(() => (window as any).__sms?.screen === 'game', {
    timeout: 15000,
    polling: 250,
  });
  await sleep(500);
  await keepAlive(page);
};

/** Zoomed crop around my marine (the full-size shots show it small). */
async function zoomShot(page: Page, file: string) {
  const c = await page.evaluate(() => {
    const g = (window as any).__sms.game;
    const cam = g.renderer.camera;
    const p = g.conn?.host?.world?.players?.[0] ?? (window as any).__sms.conn.host.world.players[0];
    return {
      x: cam.width / 2 + (p.x - cam.x) * cam.zoom,
      y: cam.height / 2 + (p.y - cam.y) * cam.zoom,
    };
  });
  const W = 260;
  const H = 170;
  await page.screenshot({
    path: path.join(out, file),
    clip: {
      x: Math.max(0, c.x - W / 2),
      y: Math.max(0, c.y - H / 2),
      width: W,
      height: H,
      scale: 3,
    },
  });
}

async function desktop(page: Page) {
  await page.setViewport({ width: 1280, height: 760 });
  await page.goto(CLIENT, { waitUntil: 'networkidle0' });
  await startSolo(page, false);
  await page.mouse.move(1150, 380);
  // Fire held first: Shift does not start a sprint (v0.6.0 hotfix rule).
  await page.mouse.down();
  await page.keyboard.down('KeyD');
  await page.keyboard.down('ShiftLeft');
  await sleep(400);
  const pf = await me(page);
  check(
    !pf.sprinting && pf.fire,
    `desktop: Shift while the trigger is held does not start a sprint (sprinting ${pf.sprinting})`,
  );
  await page.mouse.up();
  await sleep(200);
  const p0 = await me(page);
  check(p0.sprinting, `desktop: releasing the trigger with Shift still held starts the sprint`);
  // Trigger pressed during the sprint: ignored, the sprint goes on.
  await page.mouse.down();
  await sleep(700);
  const p1 = await me(page);
  check(
    p1.sprinting && p1.stamina < 2.4 && p1.ammo === p0.ammo,
    `desktop: Shift+D sprints, held fire ignored (stamina ${p1.stamina.toFixed(2)}, ammo ${p0.ammo} → ${p1.ammo})`,
  );
  await page.screenshot({ path: path.join(out, 'sprint-stowed.png') });
  await zoomShot(page, 'sprint-stowed-zoom.png');
  await page.keyboard.up('ShiftLeft');
  await sleep(250);
  await zoomShot(page, 'sprint-ready-raise-zoom.png');
  const p2 = await me(page);
  check(
    !p2.sprinting && p2.delay > 0 && p2.ammo === p0.ammo,
    `desktop: release Shift -> weapon being raised, delay ${p2.delay.toFixed(2)} s, still no shot`,
  );
  await page.screenshot({ path: path.join(out, 'sprint-ready-raise.png') });
  await sleep(1000);
  const p3 = await me(page);
  check(p3.ammo < p0.ammo, `desktop: fires after the delay (ammo ${p0.ammo} → ${p3.ammo})`);
  await zoomShot(page, 'sprint-ready-zoom.png');
  await page.mouse.up();
  await page.keyboard.up('KeyD');
}

async function touch(page: Page, W: number, H: number) {
  const tag = `touch ${W}x${H}`;
  await page.emulate({
    userAgent:
      'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
    viewport: {
      width: W,
      height: H,
      deviceScaleFactor: 2,
      isMobile: true,
      hasTouch: true,
      isLandscape: true,
    },
  });
  await page.goto(CLIENT, { waitUntil: 'networkidle0' });
  await startSolo(page, true);
  await sleep(300);
  const layout = await page.evaluate(() => {
    const hud = (window as any).__sms.game.hud;
    // slotRects are already CSS px (Hud.draw converts them)
    const slots = (
      hud.slotRects as {
        slot: number;
        owned: boolean;
        x: number;
        y: number;
        w: number;
        h: number;
      }[]
    ).map((q) => ({ ...q }));
    return {
      sprintButtons: document.querySelectorAll('.tb.sprint, [data-act="sprint"]').length,
      slots,
      scrollX: document.documentElement.scrollWidth > innerWidth,
    };
  });
  check(
    layout.sprintButtons === 0 && layout.slots.length > 0 && !layout.scrollX,
    `${tag}: no » SPRINT button on touch (v0.6.0 hotfix: sprint only via the move stick band)`,
  );
  const owned = layout.slots.find((q) => q.owned)!;
  const slotHit = await page.evaluate(
    (x, y) => (window as any).__sms.game.hud.slotAt(x, y) as number,
    owned.x + owned.w / 2,
    owned.y + owned.h / 2,
  );
  check(
    slotHit === owned.slot,
    `${tag}: weapon slot tap maps to slot ${slotHit} (want ${owned.slot})`,
  );

  const cdp: CDPSession = await page.createCDPSession();
  const touchPts = new Map<number, { x: number; y: number }>();
  const send = (type: string, pts: { id: number; x: number; y: number }[]) =>
    cdp.send('Input.dispatchTouchEvent', {
      type: type as 'touchStart',
      touchPoints: pts.map((p) => ({ ...p, radiusX: 8, radiusY: 8 })),
    });
  const all = () => [...touchPts].map(([id, p]) => ({ id, ...p }));
  const start = async (id: number, p: { x: number; y: number }) => {
    touchPts.set(id, p);
    await send('touchStart', all());
  };
  const move = async (id: number, p: { x: number; y: number }) => {
    touchPts.set(id, p);
    await send('touchMove', all());
  };
  const end = async (id: number) => {
    const p = touchPts.get(id)!;
    touchPts.delete(id);
    await send('touchEnd', [{ id, ...p }]);
  };
  const lit = () => page.evaluate(() => !!(window as any).__sms.game.input.touch.sprint.on);
  const R = 60; // TOUCH_TUNING.move.radius
  const L = { x: 150, y: H - 110 };
  const at = (k: number) => ({ x: L.x + R * k * 0.92, y: L.y - R * k * 0.39 });
  // Left thumb: walk at full deflection, just inside the ring -> no sprint.
  await start(0, L);
  for (let i = 1; i <= 6; i++) {
    await move(0, at((0.9 * i) / 6));
    await sleep(16);
  }
  await sleep(300);
  const w0 = await me(page);
  check(!w0.sprinting && !(await lit()), `${tag}: stick at 0.9 × ring walks, no sprint`);
  const moveView = () =>
    page.evaluate(() => {
      const v = ((window as any).__sms.game.hud.lastSticks ?? []).find(
        (q: any) => q.kind === 'move',
      );
      return v ? { maxWalk: !!v.maxWalk, mode: v.sprintMode as string } : null;
    });
  if (W === 844) {
    await move(0, at(0.6));
    await sleep(200);
    const v = await moveView();
    check(
      v?.maxWalk === false && v.mode === 'off',
      `${tag}: stick 0.6 → walk (${JSON.stringify(v)})`,
    );
    await page.screenshot({ path: path.join(out, 'stick-walk.png') });
    await move(0, at(1.1)); // the dead gap between max walk and the sprint band
    await sleep(200);
    const v2 = await moveView();
    const g = await me(page);
    check(
      v2?.maxWalk === true && v2.mode === 'off' && !g.sprinting,
      `${tag}: stick 1.1 (dead gap) → max walk, gold, no sprint (${JSON.stringify(v2)})`,
    );
    await page.screenshot({ path: path.join(out, 'stick-maxwalk.png') });
    await move(0, at(0.9));
    await sleep(100);
  }
  // Right thumb aims + fires at the same time (multi-touch), away from the weapon column.
  const A = { x: Math.round(W * 0.6), y: Math.round(H * 0.55) };
  await start(1, A);
  for (let i = 1; i <= 4; i++) {
    await move(1, { x: A.x + 12 * i, y: A.y - 4 * i });
    await sleep(16);
  }
  await sleep(500);
  await me(page);
  // Push the left thumb out into the sprint zone while firing: the sprint waits for the trigger.
  for (let i = 1; i <= 4; i++) {
    await move(0, at(0.9 + (0.45 * i) / 4));
    await sleep(16);
  }
  await sleep(300);
  const sf = await me(page);
  const vf = await moveView();
  check(
    !sf.sprinting && sf.fire && vf?.mode === 'fire',
    `${tag}: sprint zone while the aim stick fires → no sprint, band greyed (${JSON.stringify(vf)})`,
  );
  if (W === 844) await page.screenshot({ path: path.join(out, 'stick-blocked.png') });
  // Lift the aim thumb: the sprint starts; put it back: the running sprint ignores the trigger.
  await end(1);
  await sleep(200);
  const s0 = await me(page);
  const vs = await moveView();
  check(
    s0.sprinting && vs?.mode === 'on',
    `${tag}: trigger released → sprint starts, band lit (${JSON.stringify(vs)})`,
  );
  if (W === 844) await page.screenshot({ path: path.join(out, 'stick-sprint.png') });
  await start(1, A);
  for (let i = 1; i <= 4; i++) {
    await move(1, { x: A.x + 12 * i, y: A.y - 4 * i });
    await sleep(16);
  }
  await sleep(300);
  const s1 = await me(page);
  const ringLit = await lit();
  check(
    s1.sprinting && s1.fire && ringLit && s1.ammo === s0.ammo,
    `${tag}: stick in the sprint zone (1.35 × ring) keeps sprinting, aim stick fire ignored (ammo ${s0.ammo} → ${s1.ammo})`,
  );
  if (W === 844 || W === 667)
    await page.screenshot({ path: path.join(out, `sprint-touch-${W}x${H}.png`) });
  // Back inside the ring -> sprint ends, weapon comes up, the held aim stick fires again.
  await move(0, at(0.95));
  await sleep(150);
  const s2 = await me(page);
  check(!s2.sprinting && !(await lit()), `${tag}: back inside the ring stops the sprint`);
  await sleep(1300);
  const s3 = await me(page);
  check(
    s3.ammo < s1.ammo,
    `${tag}: aim/fire thumb fires after the ready delay (ammo ${s1.ammo} → ${s3.ammo})`,
  );
  await end(1);
  await end(0);
  await sleep(250);
  const b3 = await me(page);
  check(!b3.sprinting && !(await lit()), `${tag}: lifting the move stick ends the sprint`);
}

const browser = await puppeteer.launch({
  executablePath: process.env.CHROME_PATH ?? '/usr/bin/google-chrome',
  headless: true,
  args: [
    '--no-sandbox',
    '--disable-background-timer-throttling',
    '--disable-renderer-backgrounding',
    '--disable-backgrounding-occluded-windows',
    '--use-gl=swiftshader',
    '--enable-unsafe-swiftshader',
  ],
});
const errors: string[] = [];
try {
  const runs: ((p: Page) => Promise<void>)[] = [
    desktop,
    (p) => touch(p, 844, 390),
    (p) => touch(p, 667, 375),
  ];
  for (const fn of runs) {
    const ctx = await browser.createBrowserContext();
    const page = await ctx.newPage();
    page.on('pageerror', (e) => errors.push((e as Error).message));
    await fn(page);
    await ctx.close();
  }
} catch (e) {
  check(false, `crashed: ${(e as Error).stack}`);
} finally {
  await browser.close();
}
check(errors.length === 0, `no page errors${errors.length ? `: ${errors.join(' | ')}` : ''}`);
console.log(
  failures ? `\n${failures} check(s) failed` : '\nsprint shots OK — docs/review/sprint-*.png',
);
process.exit(failures ? 1 : 0);
