/**
 * Guard-pose CANDIDATES for Filip — preview PNGs only, no game-code changes.
 *
 *   npx tsx scripts/brace-options.ts [clientUrl]
 *
 * Writes docs/review/brace-options/{idle,current,A,B,C,D,sheet}.png
 * using the live client's atlas sprites (same layers as Renderer.drawPlayers).
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import puppeteer, { type Page } from 'puppeteer-core';
import { createCanvas, loadImage, GlobalFonts, type Image } from '@napi-rs/canvas';

GlobalFonts.registerFromPath('/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf', 'DejaVu Sans');
GlobalFonts.registerFromPath('/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf', 'DejaVu Sans');

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const out = path.join(root, 'docs', 'review', 'brace-options');
mkdirSync(out, { recursive: true });
const CLIENT = new URL(process.argv[2] ?? 'http://localhost:4175/spacecraft/dev/').href;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

const ZW = 280;
const ZH = 200;

const keepAlive = (page: Page) =>
  page.evaluate(() => {
    const w = (window as any).__sms.conn.host.world;
    w.director.idle = true;
    for (const p of w.players) {
      p.hp = p.maxHp;
      p.invuln = 30;
      // Suppress accuracy-brace skull discs so idle/current shots show pose only.
      p.stillTime = 0;
    }
  });

const startSolo = async (page: Page) => {
  await page.waitForSelector('.menu #solo', { timeout: 15000 });
  await page.click('#solo');
  await page.waitForFunction(() => (window as any).__sms?.screen === 'game', {
    timeout: 15000,
    polling: 250,
  });
  await sleep(500);
  await keepAlive(page);
};

async function marineScreenPos(page: Page) {
  return page.evaluate(() => {
    const g = (window as any).__sms.game;
    const cam = g.renderer.camera;
    const p = (window as any).__sms.conn.host.world.players[0];
    return {
      x: cam.width / 2 + (p.x - cam.x) * cam.zoom,
      y: cam.height / 2 + (p.y - cam.y) * cam.zoom,
    };
  });
}

async function zoomClip(page: Page, file: string) {
  const c = await marineScreenPos(page);
  await page.screenshot({
    path: path.join(out, file),
    clip: {
      x: Math.max(0, c.x - ZW / 2),
      y: Math.max(0, c.y - ZH / 2),
      width: ZW,
      height: ZH,
    },
  });
}

/** Browser-side drawer (string) — avoids tsx injecting __name into evaluate. */
const DRAW_CANDIDATE = `(function(option) {
  var sms = window.__sms;
  var r = sms.game.renderer;
  var assets = r.assets;
  var p = sms.conn.host.world.players[0];
  var ch = r.content.chapter(p.chapter);
  var wdef = r.content.weapons.get(p.current);
  var held = (wdef && wdef.sprites && wdef.sprites.held) || 'held_bolt_rifle';
  var body = 'marine_' + ch.id;
  var top = body + '_top';

  var canvas = document.createElement('canvas');
  canvas.width = 280;
  canvas.height = 200;
  var ctx = canvas.getContext('2d');

  ctx.fillStyle = '#14161c';
  ctx.fillRect(0, 0, 280, 200);
  ctx.strokeStyle = 'rgba(255,255,255,0.06)';
  ctx.lineWidth = 1;
  for (var i = 0; i < 280; i += 40) {
    ctx.beginPath();
    ctx.moveTo(i, 0);
    ctx.lineTo(i, 200);
    ctx.stroke();
  }
  for (var j = 0; j < 200; j += 40) {
    ctx.beginPath();
    ctx.moveTo(0, j);
    ctx.lineTo(280, j);
    ctx.stroke();
  }

  var scale = 2.35;
  var x = 0;
  var y = 0;
  var a = 0;
  ctx.save();
  ctx.translate(140, 108);
  ctx.scale(scale, scale);

  ctx.strokeStyle = ch.primary;
  ctx.globalAlpha = 0.35;
  ctx.lineWidth = 2 / scale;
  ctx.beginPath();
  ctx.ellipse(0, 4, 25, 16, 0, 0, Math.PI * 2);
  ctx.stroke();
  ctx.globalAlpha = 1;

  var cos = Math.cos(a);
  var sin = Math.sin(a);

  function drawGauntlet(px, py, rad) {
    ctx.fillStyle = ch.primary;
    ctx.strokeStyle = ch.trim;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(px, py, rad, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
  }
  function drawForearm(x0, y0, x1, y1, width) {
    ctx.lineCap = 'round';
    ctx.strokeStyle = ch.primary;
    ctx.lineWidth = width;
    ctx.beginPath();
    ctx.moveTo(x0, y0);
    ctx.lineTo(x1, y1);
    ctx.stroke();
    ctx.strokeStyle = ch.trim;
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    ctx.moveTo(x0, y0);
    ctx.lineTo(x1, y1);
    ctx.stroke();
  }

  if (option === 'A') {
    var twistA = -0.2;
    var bodyA = a + twistA;
    assets.draw(ctx, body, 0, x, y, bodyA);
    assets.draw(ctx, held, 0, x - cos * 8 + sin * 3, y - sin * 8 - cos * 3, a + 0.35, 0.95);
    assets.draw(ctx, top, 0, x, y, bodyA);
  } else if (option === 'B') {
    var twistB = -0.3;
    var bodyB = a + twistB;
    assets.draw(ctx, body, 0, x, y, bodyB);
    assets.draw(ctx, held, 0, x - cos * 10 + sin * 10, y - sin * 10 - cos * 10, a + 0.7, 0.95);
    var lead = 6;
    assets.draw(ctx, top, 0, x - sin * lead + cos * 2, y + cos * lead + sin * 2, bodyB);
  } else if (option === 'C') {
    var twistC = -0.25;
    var bodyC = a + twistC;
    assets.draw(ctx, body, 0, x, y, bodyC);
    assets.draw(ctx, held, 0, x - cos * 10 + sin * 11, y - sin * 10 - cos * 11, a + 0.6, 0.95);
    assets.draw(ctx, top, 0, x, y, bodyC);
    var shX = x + cos * 2 - sin * 10;
    var shY = y + sin * 2 + cos * 10;
    var handX = x + cos * 16 - sin * 12;
    var handY = y + sin * 16 + cos * 12;
    drawForearm(shX, shY, handX, handY, 5);
    drawGauntlet(handX, handY, 4.5);
  } else {
    var twistD = -0.35;
    var bodyD = a + twistD;
    ctx.save();
    ctx.translate(0, 3);
    ctx.scale(0.96, 0.96);
    assets.draw(ctx, body, 0, x, y, bodyD);
    assets.draw(ctx, held, 0, x - cos * 12 + sin * 13, y - sin * 12 - cos * 13, a + 0.85, 0.92);
    assets.draw(ctx, top, 0, x, y, bodyD);
    drawGauntlet(x - cos * 6 + sin * 12, y - sin * 6 - cos * 12, 4);
    var shXd = x + cos * 1 - sin * 11;
    var shYd = y + sin * 1 + cos * 11;
    var handXd = x + cos * 18 - sin * 13;
    var handYd = y + sin * 18 + cos * 13;
    drawForearm(shXd, shYd, handXd, handYd, 6);
    drawGauntlet(handXd, handYd, 5);
    ctx.restore();
  }

  ctx.restore();
  return canvas.toDataURL('image/png');
})`;

async function renderCandidate(page: Page, opt: 'A' | 'B' | 'C' | 'D'): Promise<Buffer> {
  const dataUrl = (await page.evaluate(
    ({ option, code }: { option: string; code: string }) => {
      // code is an IIFE function expression; call it with the option.
      const fn = (0, eval)(code) as (o: string) => string;
      return fn(option);
    },
    { option: opt, code: DRAW_CANDIDATE },
  )) as string;
  if (typeof dataUrl !== 'string' || !dataUrl.startsWith('data:image')) {
    throw new Error('candidate draw failed: ' + String(dataUrl).slice(0, 120));
  }
  const b64 = dataUrl.replace(/^data:image\/png;base64,/, '');
  return Buffer.from(b64, 'base64');
}

function labelSheet(cells: { img: Image; title: string; sub: string }[], cols: number): Buffer {
  const pad = 12;
  const labelH = 44;
  const cellW = ZW;
  const cellH = ZH + labelH;
  const rows = Math.ceil(cells.length / cols);
  const W = cols * cellW + (cols + 1) * pad;
  const H = rows * cellH + (rows + 1) * pad + 36;
  const canvas = createCanvas(W, H);
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#0c0d10';
  ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = '#e8c46a';
  ctx.font = 'bold 18px DejaVu Sans';
  ctx.fillText('Guard pose candidates — wybierz opcję (A–D)', pad, 28);
  ctx.fillStyle = '#8a8e98';
  ctx.font = '12px DejaVu Sans';
  ctx.fillText('Real marine sprites · no game rebuild · docs/review/brace-options/', pad, 46);

  cells.forEach((cell, i) => {
    const col = i % cols;
    const row = Math.floor(i / cols);
    const x = pad + col * (cellW + pad);
    const y = 58 + pad + row * (cellH + pad);
    ctx.fillStyle = '#1a1c22';
    ctx.fillRect(x, y, cellW, cellH);
    ctx.strokeStyle = '#e8c46a55';
    ctx.strokeRect(x + 0.5, y + 0.5, cellW - 1, cellH - 1);
    ctx.fillStyle = '#e8c46a';
    ctx.font = 'bold 14px DejaVu Sans';
    ctx.fillText(cell.title, x + 10, y + 20);
    ctx.fillStyle = '#b0b4be';
    ctx.font = '11px DejaVu Sans';
    ctx.fillText(cell.sub, x + 10, y + 36);
    ctx.drawImage(cell.img, x, y + labelH, ZW, ZH);
  });

  return canvas.toBuffer('image/png');
}

const browser = await puppeteer.launch({
  executablePath: process.env.CHROME_PATH ?? '/usr/bin/google-chrome',
  args: ['--no-sandbox', '--use-gl=swiftshader'],
});

const page = await browser.newPage();
await page.setViewport({ width: 1280, height: 760 });
await page.goto(CLIENT, { waitUntil: 'networkidle0' });
await startSolo(page);
await page.mouse.move(900, 380);
await sleep(300);

await keepAlive(page);
await sleep(100);
await zoomClip(page, 'idle.png');
console.log('wrote idle.png');

await keepAlive(page);
await page.mouse.down({ button: 'right' });
await sleep(400);
await keepAlive(page);
const guarding = await page.evaluate(
  () => !!(window as any).__sms.conn.host.world.players[0].guarding,
);
console.log(guarding ? '✓ guarding for current.png' : '✗ not guarding');
await zoomClip(page, 'current.png');
console.log('wrote current.png');
await page.mouse.up({ button: 'right' });
await sleep(200);

for (const opt of ['A', 'B', 'C', 'D'] as const) {
  const buf = await renderCandidate(page, opt);
  writeFileSync(path.join(out, `${opt}.png`), buf);
  console.log(`wrote ${opt}.png (${buf.length} bytes)`);
}

await browser.close();

const load = async (name: string) => loadImage(path.join(out, name));
const sheet = labelSheet(
  [
    { img: await load('idle.png'), title: 'Idle / Spoczynek', sub: 'reference · zwykły marine' },
    {
      img: await load('current.png'),
      title: 'Current / Teraz (złe)',
      sub: 'blue blob — pomija _top',
    },
    {
      img: await load('A.png'),
      title: 'A · Subtle / Subtelny',
      sub: 'stock sprites · lekki skręt',
    },
    {
      img: await load('B.png'),
      title: 'B · Leading shoulder / Bark',
      sub: '_top przesunięty · broń przy biodrze',
    },
    {
      img: await load('C.png'),
      title: 'C · Raised arm / Ramię',
      sub: 'zostaje _top · gauntlet jak sprint',
    },
    {
      img: await load('D.png'),
      title: 'D · Planted / Zasadzony',
      sub: 'jak C · niżej · czytelniejszy guard',
    },
  ],
  3,
);
writeFileSync(path.join(out, 'sheet.png'), sheet);
console.log('wrote sheet.png');
console.log('\nbrace-options ready →', out);
