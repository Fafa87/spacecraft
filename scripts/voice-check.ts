/**
 * Headless check of in-game voice chat (packages/client/src/voice) through the REAL game flow:
 *  1. Toggle OFF (default): host + joiner play a P2P mission; no voice chunk (VoiceOverlay /
 *     VoiceChat) may be requested and no overlay shown.
 *  2. Toggle ON: the host flips CZAT GŁOSOWY in the squad room, two joiners see the indicator
 *     and the overlay (lazy chunk, already in the room; off/on again unmounts/remounts it),
 *     the mission starts, all three tap "🎙 GŁOS" (Chrome's fake microphone = a beep) and must
 *     form a full mesh, receive each other's audio (WebRTC stats + analyser level); mute, PTT,
 *     leave (✕) and rejoin are checked. Screenshots go to docs/review/voice-optin-*.png.
 * Starts its own PeerJS/highscore server (memory, :8798/:9008) and the Vite dev server (:5179),
 * or uses an already running client at CLIENT_URL (e.g. a `vite preview` of the production build).
 * TURN: the production ICE servers (.env.production VITE_ICE_SERVERS, the Metered relay) are
 * used unless VOICE_TURN=0 — needed where the browser may not use plain UDP (e.g. a sandbox
 * whose Chrome policy is `disable_non_proxied_udp`). VOICE_RELAY=1 forces relay-only (?relay=1).
 */
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import puppeteer, { type Page } from 'puppeteer-core';
import { createServer, loadEnv } from 'vite';
import { loadConfig } from '../packages/server/src/config.js';
import { startServer } from '../packages/server/src/server.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const CHROME = process.env.CHROME_PATH ?? '/usr/bin/google-chrome';
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
let failures = 0;
const check = (ok: boolean, msg: string) => {
  console.log(`${ok ? '✓' : '✗'} ${msg}`);
  if (!ok) failures++;
};

type Stat = { id: string; bytesReceived: number; totalAudioEnergy: number; candidateType?: string };
const stats = (p: Page) => p.evaluate(() => (window as any).__voice()?.stats() as Promise<Stat[]>);
const peers = (p: Page) =>
  p.evaluate(
    () =>
      (window as any).__voice()?.peers() as Array<{
        name: string;
        state: string;
        level: number;
        slot: number;
      }>,
  );

/** Peak speaking level per remote slot over `ms` (Chrome's fake mic beeps, so sample a window). */
function peaks(p: Page, ms = 2000): Promise<Record<number, number>> {
  return p.evaluate(async (ms) => {
    const out: Record<number, number> = {};
    const end = performance.now() + ms;
    while (performance.now() < end) {
      for (const x of (window as any).__voice().peers() as { slot: number; level: number }[])
        out[x.slot] = Math.max(out[x.slot] ?? 0, x.level);
      await new Promise((r) => setTimeout(r, 50));
    }
    return out;
  }, ms);
}

async function main(): Promise<void> {
  const server = await startServer({
    ...loadConfig({}),
    port: 8798,
    peerPort: 9008,
    store: 'memory',
    logLevel: 'warn',
  });
  if (process.env.VOICE_TURN !== '0' && !process.env.VITE_ICE_SERVERS) {
    const env = loadEnv('production', root, 'VITE_ICE_SERVERS');
    if (env.VITE_ICE_SERVERS) process.env.VITE_ICE_SERVERS = env.VITE_ICE_SERVERS;
  }
  const external = process.env.CLIENT_URL?.replace(/\/$/, '');
  const vite = external
    ? null
    : await createServer({
        configFile: path.join(root, 'packages/client/vite.config.ts'),
        root: path.join(root, 'packages/client'),
        server: { port: 5179, strictPort: true, host: '127.0.0.1' },
        logLevel: 'warn',
      });
  await vite?.listen();
  const CLIENT =
    external ?? `http://127.0.0.1:5179${(vite!.config.base ?? '/').replace(/\/$/, '')}`;
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
      '--disable-features=WebRtcHideLocalIpsWithMdns',
    ],
  });
  const errors: string[] = [];
  const logs = new Map<Page, string[]>();
  const voiceReqs = new Map<Page, string[]>();
  const relay = process.env.VOICE_RELAY === '1' ? '&relay=1' : '';
  const q = `firestore=0&api=${encodeURIComponent(`http://localhost:${server.port}`)}${relay}`;
  const shots = path.join(root, 'docs/review');
  const open = async (name: string, mobile = false): Promise<Page> => {
    const ctx = await browser.createBrowserContext();
    const p = await ctx.newPage();
    await p.setViewport(
      mobile
        ? { width: 844, height: 390, hasTouch: true, isMobile: true, deviceScaleFactor: 1 }
        : { width: 1280, height: 800 },
    );
    p.on('pageerror', (e) => errors.push(`${name}: ${(e as Error).message}`));
    logs.set(p, []);
    voiceReqs.set(p, []);
    p.on('request', (r) => {
      if (/VoiceOverlay|VoiceChat/.test(r.url())) voiceReqs.get(p)!.push(r.url());
    });
    p.on('console', (m) => {
      logs.get(p)!.push(`${m.type()} ${m.text()}`);
      if (m.type() === 'error' && !m.text().includes('404') && !m.text().includes('PeerJS'))
        errors.push(`${name}: ${m.text()}`);
    });
    return p;
  };
  const setName = async (p: Page, name: string) => {
    await p.$eval('#name', (e) => ((e as HTMLInputElement).value = ''));
    await p.type('#name', name);
  };
  const host = async (name: string, mobile = false) => {
    const p = await open(name, mobile);
    await p.goto(`${CLIENT}/?${q}`, { waitUntil: 'networkidle0' });
    await p.waitForSelector('.menu #name', { timeout: 10000 });
    await setName(p, name);
    await p.click('#host');
    await p.waitForSelector('.room .code', { timeout: 15000 });
    const code = await p.$eval('.room .code', (e) => (e.textContent ?? '').trim());
    return { p, code };
  };
  const join = async (code: string, name: string, mobile = false) => {
    const p = await open(name, mobile);
    await p.goto(`${CLIENT}/?join=${code}&${q}`, { waitUntil: 'networkidle0' });
    await p.waitForSelector('.join-screen #name', { timeout: 10000 });
    await setName(p, name);
    await p.click('#go');
    await p.waitForSelector('.room .players', { timeout: 15000 });
    return p;
  };
  const squad = (p: Page, n: number) =>
    p.waitForFunction(
      (n) => document.querySelectorAll('#players li:not(.empty)').length === n,
      { timeout: 20000, polling: 200 },
      n,
    );
  const voiceState = (p: Page, re: string) =>
    p.waitForFunction(
      (re) => new RegExp(re).test(document.querySelector('#voice-state')?.textContent ?? ''),
      { timeout: 10000, polling: 200 },
      re,
    );
  const playing = (p: Page) =>
    p.waitForFunction(() => (window as any).__sms?.screen === 'game', {
      timeout: 15000,
      polling: 200,
    });
  try {
    // ---- 1. voice OFF (default): nothing of the voice code may load -----------------------
    {
      const a = await host('Offa');
      const b = await join(a.code, 'Offb');
      const toggle = await a.p.$eval('#voice', (e) => e.getAttribute('aria-checked'));
      check(toggle === 'false', `host room shows CZAT GŁOSOWY toggle, default OFF (${toggle})`);
      check((await b.$('#voice')) === null, 'a joiner has no voice toggle (host decides)');
      await squad(a.p, 2);
      await voiceState(b, 'wyłączony');
      const ind = await b.$eval('#voice-state', (e) => e.textContent ?? '');
      check(true, `joiner sees "voice off" indicator: ${ind}`);
      await a.p.$eval('#start', (e) => (e as HTMLButtonElement).click());
      await Promise.all([playing(a.p), playing(b)]);
      await sleep(2500);
      const vx = (await a.p.$('.vx')) || (await b.$('.vx'));
      const reqs = [...voiceReqs.get(a.p)!, ...voiceReqs.get(b)!];
      check(
        !vx && reqs.length === 0,
        `voice off: no overlay, no voice chunk requested (${reqs.length})`,
      );
      await a.p.browserContext().close();
      await b.browserContext().close();
    }
    // ---- 2. voice ON ------------------------------------------------------------------------
    const a = await host('Alpha');
    await a.p.click('#voice');
    await a.p.waitForFunction(
      () => document.querySelector('#voice')?.getAttribute('aria-checked') === 'true',
      { timeout: 5000 },
    );
    const b = await join(a.code, 'Bravo');
    const c = await join(a.code, 'Charlie', true);
    await squad(a.p, 3);
    for (const p of [b, c]) await voiceState(p, 'włączony');
    check(true, 'host enabled voice; both joiners see "🎙 Czat głosowy włączony"');
    // Enabled = the overlay is lazy-loaded right away (the squad can talk in the room already).
    for (const p of [a.p, b, c]) await p.waitForSelector('.vx button.join', { timeout: 10000 });
    check(
      true,
      'voice on: the overlay chunk is lazy-loaded for every player (already in the room)',
    );
    // Host switches it off again → overlays disappear; back on → they return.
    await a.p.click('#voice');
    for (const p of [b, c])
      await p.waitForFunction(() => !document.querySelector('.vx'), { timeout: 5000 });
    await voiceState(b, 'wyłączony');
    await a.p.click('#voice');
    for (const p of [b, c]) await p.waitForSelector('.vx button.join', { timeout: 5000 });
    check(true, 'host toggling off/on removes/restores the overlay for the joiners');
    await sleep(300);
    await a.p.screenshot({ path: path.join(shots, 'voice-optin-room-host.png') });
    await b.screenshot({ path: path.join(shots, 'voice-optin-room-joiner.png') });
    await a.p.$eval('#start', (e) => (e as HTMLButtonElement).click());
    const pages = [a.p, b, c];
    await Promise.all(pages.map(playing));
    // Keep the squad alive for the whole check (idle marines would fall in ~20 s).
    await a.p.evaluate(() => {
      setInterval(() => {
        for (const m of (window as any).__sms?.conn?.host?.world?.players ?? []) m.hp = m.maxHp;
      }, 100);
    });
    for (const [i, p] of pages.entries()) {
      await p.waitForSelector('.vx button.join', { timeout: 10000 });
      if (i === 0) await p.screenshot({ path: path.join(shots, 'voice-optin-game-1280x800.png') });
      if (i === 2) await p.screenshot({ path: path.join(shots, 'voice-optin-game-844x390.png') });
    }
    for (const p of pages) {
      await p.click('.vx button.join');
      await p.waitForFunction(() => (window as any).__voice?.()?.state === 'live', {
        timeout: 15000,
        polling: 250,
      });
      await p.evaluate(() => (window as any).__voice().setMode('open'));
    }
    check(true, 'all three tapped 🎙 GŁOS and went live (open mic)');
    const slots = await Promise.all(
      pages.map((p) => p.evaluate(() => (window as any).__voice().slot as number)),
    );
    check(new Set(slots).size === 3, `three tabs claimed distinct voice slots ${slots.join(',')}`);
    await Promise.all(
      pages.map((p) =>
        p.waitForFunction(
          () =>
            (window as any)
              .__voice()
              .peers()
              .filter((x: { state: string }) => x.state === 'connected').length === 2,
          { timeout: 20000, polling: 250 },
        ),
      ),
    );
    check(true, 'full mesh: every tab has 2 connected voice peers');
    await sleep(3000);
    await pages[2].screenshot({ path: path.join(shots, 'voice-optin-game-844x390-live.png') });
    await pages[0].screenshot({ path: path.join(shots, 'voice-optin-game-1280x800-live.png') });
    for (const [i, p] of pages.entries()) {
      const st = await stats(p);
      const ps = await peers(p);
      const pk = Object.values(await peaks(p));
      check(
        st.length === 2 &&
          st.every((s) => s.bytesReceived > 2000) &&
          pk.length === 2 &&
          pk.every((l) => l > 0.001),
        `tab ${i + 1} receives audio from both (bytes ${st.map((s) => s.bytesReceived).join('/')}, peak level ${pk.map((l) => l.toFixed(3)).join('/')}, via ${st.map((s) => s.candidateType).join('/')})`,
      );
      check(
        ps.every((x) => x.name && !x.name.startsWith('#')),
        `tab ${i + 1} knows callsigns: ${ps.map((x) => x.name).join(', ')}`,
      );
    }
    // Mute Alpha: Bravo's level for Alpha's slot must drop to ~0 while Charlie stays audible.
    const before = (await peaks(pages[1]))[slots[0]];
    await pages[0].evaluate(() => (window as any).__voice().setMuted(true));
    await sleep(500);
    const muted = await peaks(pages[1]);
    check(
      before > 0.001 && muted[slots[0]] < 0.001 && muted[slots[2]] > 0.001,
      `mute silences Alpha for Bravo (peak ${before.toFixed(4)} → ${muted[slots[0]].toFixed(4)}; Charlie still ${muted[slots[2]].toFixed(4)})`,
    );
    // Push-to-talk: Charlie switches to PTT (silent), then holds the key.
    await pages[2].evaluate(() => (window as any).__voice().setMode('ptt'));
    await sleep(500);
    const ptt0 = (await peaks(pages[1]))[slots[2]];
    await pages[2].evaluate(() => (window as any).__voice().pushToTalk(true));
    await sleep(300);
    const ptt1 = (await peaks(pages[1]))[slots[2]];
    check(
      ptt0 < 0.001 && ptt1 > 0.001,
      `push-to-talk gates Charlie (released ${ptt0.toFixed(4)}, held ${ptt1.toFixed(4)})`,
    );
    // Leaving: Charlie stops, the others drop him.
    await pages[2].click('.vx button[title="Wyjdź z głosu"]');
    await pages[0].waitForFunction(() => (window as any).__voice().peers().length === 1, {
      timeout: 15000,
      polling: 250,
    });
    check(true, 'a leaving tab disappears from the others');
    // Rejoin: tap 🎙 GŁOS again.
    await pages[2].waitForSelector('.vx button.join', { timeout: 5000 });
    await pages[2].click('.vx button.join');
    await pages[2].waitForFunction(
      () =>
        (window as any)
          .__voice()
          ?.peers()
          .filter((x: { state: string }) => x.state === 'connected').length === 2,
      { timeout: 25000, polling: 250 },
    );
    check(true, 'a rejoining tab reconnects to both');
    check(
      await a.p.evaluate(() => (window as any).__sms?.screen === 'game'),
      'mission still running during the whole voice session',
    );
  } catch (e) {
    check(false, `voice check aborted: ${(e as Error).message}`);
    for (const p of (await Promise.all(browser.browserContexts().map((x) => x.pages()))).flat())
      console.log(
        p.url().split('?')[1]?.slice(0, 30),
        JSON.stringify(
          await p.evaluate(() => (window as any).__voice?.()?.peers()).catch(() => null),
        ),
        logs
          .get(p)
          ?.filter((l) => l.includes('[voice]') || l.includes('PeerJS'))
          .slice(-30),
        await p
          .evaluate(() =>
            [...((window as any).__voice?.()?.remotes?.values() ?? [])].map((r: any) => [
              r.id,
              r.outgoing,
              !!r.stream,
              r.call.peerConnection?.connectionState,
              r.call.peerConnection?.iceConnectionState,
              r.call.peerConnection?.iceGatheringState,
              r.call.peerConnection?.signalingState,
              (r.call.peerConnection?.localDescription?.sdp.match(/a=candidate/g) ?? []).length,
              (r.call.peerConnection?.remoteDescription?.sdp.match(/a=candidate/g) ?? []).length,
              r.call.open,
            ]),
          )
          .catch(() => null),
      );
  } finally {
    check(errors.length === 0, `no page errors${errors.length ? `: ${errors.join(' | ')}` : ''}`);
    await browser.close();
    await vite?.close();
    await server.close();
  }
  process.exit(failures ? 1 : 0);
}

void main();
