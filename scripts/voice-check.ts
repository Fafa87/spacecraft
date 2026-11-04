/**
 * Headless check of the voice-chat prototype (packages/client/src/voice): three Chrome tabs
 * with Chrome's fake microphone (a beep) join the same voice room through the dev harness
 * /voice-lab.html, must form a full mesh, receive each other's audio (WebRTC stats + the
 * analyser level), and a muted tab must go silent for the others.
 * Starts its own PeerJS/highscore server (memory, :8798/:9008) and Vite dev server (:5179).
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
  const vite = await createServer({
    configFile: path.join(root, 'packages/client/vite.config.ts'),
    root: path.join(root, 'packages/client'),
    server: { port: 5179, strictPort: true, host: '127.0.0.1' },
    logLevel: 'warn',
  });
  await vite.listen();
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
  try {
    const room = `V${Date.now().toString(36).slice(-4).toUpperCase()}`;
    const relay = process.env.VOICE_RELAY === '1' ? '&relay=1' : '';
    const api = encodeURIComponent(`http://localhost:${server.port}`);
    const pages: Page[] = [];
    for (const name of ['Alpha', 'Bravo', 'Charlie']) {
      const p = await browser.newPage();
      p.on('pageerror', (e) => errors.push(`${name}: ${(e as Error).message}`));
      logs.set(p, []);
      p.on('console', (m) => {
        logs.get(p)!.push(`${m.type()} ${m.text()}`);
        if (m.type() === 'error' && !m.text().includes('404') && !m.text().includes('PeerJS'))
          errors.push(`${name}: ${m.text()}`);
      });
      await p.goto(
        `http://127.0.0.1:5179/voice-lab.html?room=${room}&name=${name}&api=${api}&firestore=0${relay}${process.env.VOICE_DEBUG ? '&debug=1' : ''}`,
      );
      await p.click('#go');
      await p.waitForFunction(() => (window as any).__voice()?.state === 'live', {
        timeout: 15000,
        polling: 250,
      });
      pages.push(p);
    }
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
    await pages[2].evaluate(() => (window as any).__voice().stop());
    await pages[0].waitForFunction(() => (window as any).__voice().peers().length === 1, {
      timeout: 15000,
      polling: 250,
    });
    check(true, 'a leaving tab disappears from the others');
    // Rejoin into the freed slot range.
    await pages[2].reload();
    await pages[2].click('#go');
    await pages[2].waitForFunction(
      () =>
        (window as any)
          .__voice()
          ?.peers()
          .filter((x: { state: string }) => x.state === 'connected').length === 2,
      { timeout: 25000, polling: 250 },
    );
    check(true, 'a rejoining tab reconnects to both');
  } catch (e) {
    check(false, `voice check aborted: ${(e as Error).message}`);
    for (const p of await browser.pages())
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
    await vite.close();
    await server.close();
  }
  process.exit(failures ? 1 : 0);
}

void main();
