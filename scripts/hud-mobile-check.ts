/**
 * Phone HUD layout check in a real voice-enabled P2P mission: a desktop host enables
 * CZAT GŁOSOWY, two touch phones (844x390, 667x375 landscape) join, everybody taps 🎙 GŁOS.
 * On the phones the clock/wave/score/armour must sit in the stacked top-left block (above the
 * move stick, inside the safe area) and the voice overlay at the top centre, both clear of the
 * minimap, the weapon column, the touch buttons and each other; on desktop the HUD is unchanged
 * and the overlay sits under the squad list. Screenshots: docs/review/hud-mobile-*.png.
 * Needs a running client (CLIENT_URL, e.g. `vite preview`); starts its own PeerJS/API server.
 * Usage: CLIENT_URL=http://localhost:4318/spacecraft npx tsx scripts/hud-mobile-check.ts
 */
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import puppeteer, { type Page } from 'puppeteer-core';
import { loadConfig } from '../packages/server/src/config.js';
import { startServer } from '../packages/server/src/server.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const CLIENT = (process.env.CLIENT_URL ?? 'http://localhost:4318/spacecraft').replace(/\/$/, '');
const CHROME = process.env.CHROME_PATH ?? '/usr/bin/google-chrome';
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
let failures = 0;
const check = (ok: boolean, msg: string) => {
  console.log(`${ok ? '✓' : '✗'} ${msg}`);
  if (!ok) failures++;
};
type Box = { x: number; y: number; w: number; h: number; n?: string };
const hit = (a: Box, b: Box) =>
  a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
const IPHONE =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1';

/** HUD + DOM boxes (CSS px) of the current frame. */
function boxes(p: Page) {
  return p.evaluate(() => {
    const g = (window as any).__sms.game;
    const hud = g.hud;
    const L = hud.layout;
    const ui = hud.lastUi as number;
    const ins = hud.lastIns as { left: number; top: number; right: number };
    const cw = g.renderer.camera.width as number;
    const ch = g.renderer.camera.height as number;
    const css = (x: number, y: number, w: number, h: number, n: string) => ({
      x: ins.left + x * ui,
      y: ins.top + y * ui,
      w: w * ui,
      h: h * ui,
      n,
    });
    const wu = (cw - ins.left - ins.right) / ui;
    const hudBoxes = [css(wu - 206, 8, 198, 140, 'minimap')];
    if (L.block) hudBoxes.push(css(L.block.x, L.block.y, L.block.w, L.block.h, 'corner block'));
    if (L.team)
      hudBoxes.push(css(10, L.team.top, L.team.cols === 2 ? 252 : 200, L.team.h, 'squad list'));
    const slots = (hud.slotRects as Box[]).map((r) => ({ ...r, n: 'weapon slot' }));
    const dom = (sel: string, n: string) =>
      [...document.querySelectorAll(sel)]
        .map((e) => e.getBoundingClientRect())
        .filter((r) => r.width > 0)
        .map((r) => ({ x: r.left, y: r.top, w: r.width, h: r.height, n }));
    return {
      cw,
      ch,
      ui,
      ins,
      compact: L.compact as boolean,
      leftBottom: ins.top + (L.leftBottom as number) * ui,
      hud: hudBoxes,
      slots,
      buttons: dom('.touch-layer .tb', 'touch button'),
      voice: dom('.vx > *', 'voice overlay'),
      touch: g.input.active === 'touch',
    };
  });
}

async function main(): Promise<void> {
  const server = await startServer({
    ...loadConfig({}),
    port: 8799,
    peerPort: 9009,
    store: 'memory',
    logLevel: 'warn',
  });
  const browser = await puppeteer.launch({
    executablePath: CHROME,
    headless: true,
    args: [
      '--no-sandbox',
      '--use-fake-ui-for-media-stream',
      '--use-fake-device-for-media-stream',
      '--autoplay-policy=no-user-gesture-required',
      '--disable-background-timer-throttling',
      '--disable-renderer-backgrounding',
      '--disable-backgrounding-occluded-windows',
    ],
  });
  const errors: string[] = [];
  const q = `firestore=0&api=${encodeURIComponent(`http://localhost:${server.port}`)}`;
  const shots = path.join(root, 'docs/review');
  const open = async (name: string, phone?: [number, number]) => {
    const ctx = await browser.createBrowserContext();
    const p = await ctx.newPage();
    // tsx wraps named arrow functions in __name(); give page.evaluate bodies that helper too
    await p.evaluateOnNewDocument('globalThis.__name = (f) => f');
    if (phone)
      await p.emulate({
        userAgent: IPHONE,
        viewport: {
          width: phone[0],
          height: phone[1],
          deviceScaleFactor: 2,
          isMobile: true,
          hasTouch: true,
          isLandscape: true,
        },
      });
    else await p.setViewport({ width: 1280, height: 800 });
    p.on('pageerror', (e) => errors.push(`${name}: ${(e as Error).message}`));
    p.on('console', (m) => {
      if (m.type() === 'error' && !m.text().includes('404') && !m.text().includes('PeerJS'))
        errors.push(`${name}: ${m.text()}`);
    });
    return p;
  };
  const setName = async (p: Page, name: string) => {
    await p.$eval('#name', (e) => ((e as HTMLInputElement).value = ''));
    await p.type('#name', name);
  };
  try {
    const host = await open('Alpha');
    await host.goto(`${CLIENT}/?${q}`, { waitUntil: 'networkidle0' });
    await host.waitForSelector('.menu #name', { timeout: 10000 });
    await setName(host, 'Alpha');
    await host.click('#host');
    await host.waitForSelector('.room .code', { timeout: 15000 });
    const code = await host.$eval('.room .code', (e) => (e.textContent ?? '').trim());
    await host.click('#voice');
    const phones: Array<{ p: Page; size: [number, number] }> = [];
    for (const [name, size] of [
      ['Bravo', [844, 390]],
      ['Charlie', [667, 375]],
    ] as Array<[string, [number, number]]>) {
      const p = await open(name, size);
      await p.goto(`${CLIENT}/?join=${code}&${q}`, { waitUntil: 'networkidle0' });
      await p.waitForSelector('.join-screen #name', { timeout: 10000 });
      await setName(p, name);
      await p.tap('#go');
      await p.waitForSelector('.room .players', { timeout: 15000 });
      phones.push({ p, size });
    }
    await host.waitForFunction(
      () => document.querySelectorAll('#players li:not(.empty)').length === 3,
      { timeout: 20000, polling: 200 },
    );
    await host.$eval('#start', (e) => (e as HTMLButtonElement).click());
    const all = [host, ...phones.map((x) => x.p)];
    await Promise.all(
      all.map((p) =>
        p.waitForFunction(() => (window as any).__sms?.screen === 'game', {
          timeout: 15000,
          polling: 200,
        }),
      ),
    );
    await host.evaluate(() => {
      setInterval(() => {
        for (const m of (window as any).__sms?.conn?.host?.world?.players ?? []) m.hp = m.maxHp;
      }, 100);
    });
    for (const { p } of phones) {
      // a tap on the free right half makes the touch layout active, then join voice by touch
      await p.touchscreen.tap(p.viewport()!.width * 0.62, p.viewport()!.height * 0.45);
      await p.waitForSelector('.vx button.join', { timeout: 10000 });
      await p.tap('.vx button.join');
    }
    await host.waitForSelector('.vx button.join', { timeout: 10000 });
    await host.click('.vx button.join');
    for (const p of all)
      await p.waitForFunction(
        () =>
          (window as any).__voice?.()?.state === 'live' &&
          (window as any)
            .__voice()
            .peers()
            .filter((x: { state: string }) => x.state === 'connected').length === 2,
        { timeout: 25000, polling: 250 },
      );
    check(true, 'voice-enabled room: 3 players live in voice during the mission');
    await sleep(1200);
    for (const { p, size } of phones) {
      const tag = `${size[0]}x${size[1]}`;
      const b = await boxes(p);
      check(b.touch && b.compact, `${tag}: touch layout active, compact phone HUD`);
      const hintTop = b.ch - 100 - 72 - 14;
      check(
        b.leftBottom < hintTop,
        `${tag}: corner block + squad list end at y=${b.leftBottom | 0} above the move stick (${hintTop | 0})`,
      );
      const block = b.hud.find((x) => x.n === 'corner block')!;
      check(
        block.x >= b.ins.left && block.y >= 0,
        `${tag}: corner block inside the safe area (x=${block.x | 0}, inset ${b.ins.left})`,
      );
      const clashes: string[] = [];
      const pairs: Array<[Box[], Box[]]> = [
        [b.voice, [...b.hud, ...b.slots, ...b.buttons]],
        [b.hud, [...b.slots, ...b.buttons]],
      ];
      for (const [as, bs] of pairs)
        for (const x of as) for (const y of bs) if (hit(x, y)) clashes.push(`${x.n}×${y.n}`);
      for (let i = 0; i < b.hud.length; i++)
        for (let j = i + 1; j < b.hud.length; j++)
          if (hit(b.hud[i], b.hud[j])) clashes.push(`${b.hud[i].n}×${b.hud[j].n}`);
      check(
        clashes.length === 0 && b.voice.length >= 3,
        `${tag}: no overlaps between ${b.voice.length} voice controls, ${b.hud.length} HUD panels, ${b.slots.length} weapon slots, ${b.buttons.length} touch buttons${clashes.length ? ` — ${[...new Set(clashes)].join(', ')}` : ''}`,
      );
      const vTop = Math.min(...b.voice.map((v) => v.y));
      const vMid =
        (Math.min(...b.voice.map((v) => v.x)) + Math.max(...b.voice.map((v) => v.x + v.w))) / 2;
      check(
        vTop < 20 &&
          Math.abs(vMid - (block.x + block.w + (b.hud[0].x - block.x - block.w) / 2)) < 60,
        `${tag}: voice overlay at the top centre between the corner block and the minimap`,
      );
      await p.screenshot({ path: path.join(shots, `hud-mobile-${tag}.png`) });
      // v0.6.0 hotfix: with the voice row shown, the top-centre messages stack right under it
      await p.evaluate(() => (window as any).__sms.game.notify('+ Medicae kit', 'good'));
      await new Promise((r) => setTimeout(r, 500));
      const stack = await p.evaluate(() => {
        const hud = (window as any).__sms.game.hud;
        const ui: number = hud.lastUi;
        const ins = hud.lastIns;
        return (hud.topStack as Box[]).map((r) => ({
          x: ins.left + r.x * ui,
          y: ins.top + r.y * ui,
          w: r.w * ui,
          h: r.h * ui,
          n: 'top message',
        }));
      });
      const vBottom = Math.max(...b.voice.map((v) => v.y + v.h));
      check(
        stack.length === 1 &&
          stack[0].y >= vBottom &&
          stack[0].y - vBottom < 12 &&
          !stack.some((m) => [...b.voice, ...b.hud].some((x) => hit(m, x))),
        `${tag}: top-centre notice sits right under the voice row (y=${stack[0]?.y | 0}, voice bottom ${vBottom | 0}), clear of voice + HUD`,
      );
    }
    const d = await boxes(host);
    const dClash = d.voice.some((v) => [...d.hud].some((x) => hit(v, x)));
    check(
      !d.compact && !d.touch && !dClash && d.voice.every((v) => v.x < 640 && v.y > 100),
      'desktop: classic HUD; voice overlay under the squad list, clear of the HUD',
    );
    await host.screenshot({ path: path.join(shots, 'hud-desktop-voice-1280x800.png') });
  } catch (e) {
    check(false, `hud check aborted: ${(e as Error).message}`);
  } finally {
    check(errors.length === 0, `no page errors${errors.length ? `: ${errors.join(' | ')}` : ''}`);
    await browser.close();
    await server.close();
  }
  process.exit(failures ? 1 : 0);
}

void main();
