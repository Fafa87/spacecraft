/**
 * Tyranid spawn points (director.spawnPoints): breaches torn in the deck, burrow tunnels and
 * vents, drawn procedurally as part of the terrain layer (under every unit). Each one is
 * ringed by creep and pulsing tendrils; when the director telegraphs a wave the point pulses
 * red-violet and throws out shock rings, and while a wave is emerging it glows hot.
 */
import { BREACH_STATE, type SpawnPointDef } from '@sms/shared';

const TAU = Math.PI * 2;

function rnd(seed: number): () => number {
  let s = seed >>> 0 || 1;
  return () => {
    s ^= s << 13;
    s ^= s >>> 17;
    s ^= s << 5;
    return ((s >>> 0) % 100000) / 100000;
  };
}

interface Shape {
  rim: [number, number][];
  shards: { a: number; r: number; w: number; l: number }[];
  tendrils: { a: number; len: number; w: number; ph: number; curl: number }[];
  creep: { x: number; y: number; r: number }[];
}

const cache = new Map<string, Shape>();

function shapeFor(p: SpawnPointDef, i: number): Shape {
  let s = cache.get(p.id);
  if (s) return s;
  const r = rnd(9173 * (i + 1) + p.x * 7 + p.y);
  const base = p.kind === 'vent' ? 34 : p.kind === 'tunnel' ? 46 : 54;
  const rim: [number, number][] = [];
  const n = p.kind === 'tunnel' ? 22 : 16;
  for (let k = 0; k < n; k++) {
    const a = (k / n) * TAU;
    const jag = p.kind === 'breach' ? (k % 2 ? 0.62 : 1.08) + r() * 0.25 : 0.88 + r() * 0.2;
    rim.push([Math.cos(a) * base * jag, Math.sin(a) * base * jag * 0.86]);
  }
  const shards = Array.from({ length: p.kind === 'breach' ? 9 : 5 }, () => ({
    a: r() * TAU,
    r: base * (0.95 + r() * 0.3),
    w: 6 + r() * 10,
    l: 10 + r() * 16,
  }));
  const tendrils = Array.from({ length: p.kind === 'vent' ? 6 : 9 }, () => ({
    a: r() * TAU,
    len: base * (0.9 + r() * 1.1),
    w: 3 + r() * 5,
    ph: r() * TAU,
    curl: (r() - 0.5) * 1.6,
  }));
  const creep = Array.from({ length: 14 }, () => {
    const a = r() * TAU;
    const d = base * (0.8 + r() * 1.6);
    return { x: Math.cos(a) * d, y: Math.sin(a) * d * 0.9, r: 14 + r() * 26 };
  });
  s = { rim, shards, tendrils, creep };
  cache.set(p.id, s);
  return s;
}

/** Glow colour per state. */
function glow(state: number): [string, number] {
  return state === BREACH_STATE.active
    ? ['255,70,120', 1]
    : state === BREACH_STATE.telegraph
      ? ['255,40,90', 0.8]
      : ['150,60,170', 0.35];
}

/** Draws one spawn point. `t` = seconds (render clock), `state` = BREACH_STATE. */
export function drawBreach(
  ctx: CanvasRenderingContext2D,
  p: SpawnPointDef,
  i: number,
  state: number,
  t: number,
): void {
  const s = shapeFor(p, i);
  const [rgb, g0] = glow(state);
  const pulseHz = state === BREACH_STATE.idle ? 0.6 : 4;
  const pulse = 0.5 + 0.5 * Math.sin(t * TAU * pulseHz + i);
  ctx.save();
  ctx.translate(p.x, p.y);

  // creep carpet
  for (const c of s.creep) {
    const gr = ctx.createRadialGradient(c.x, c.y, 0, c.x, c.y, c.r);
    gr.addColorStop(0, 'rgba(92,34,78,0.75)');
    gr.addColorStop(0.7, 'rgba(60,22,52,0.45)');
    gr.addColorStop(1, 'rgba(40,14,34,0)');
    ctx.fillStyle = gr;
    ctx.beginPath();
    ctx.arc(c.x, c.y, c.r, 0, TAU);
    ctx.fill();
  }

  // under-glow
  const R = 120 + (state === BREACH_STATE.idle ? 0 : 40 * pulse);
  const gl = ctx.createRadialGradient(0, 0, 10, 0, 0, R);
  gl.addColorStop(0, `rgba(${rgb},${(0.25 + 0.35 * pulse) * g0})`);
  gl.addColorStop(1, `rgba(${rgb},0)`);
  ctx.fillStyle = gl;
  ctx.beginPath();
  ctx.arc(0, 0, R, 0, TAU);
  ctx.fill();

  // tendrils (behind the rim): tapered, swaying, pulsing
  for (const td of s.tendrils) {
    const sway = Math.sin(t * 1.7 + td.ph) * 0.35 + td.curl;
    const reach = td.len * (state === BREACH_STATE.idle ? 1 : 1.15 + 0.15 * pulse);
    const x0 = Math.cos(td.a) * 18;
    const y0 = Math.sin(td.a) * 16;
    const xm = Math.cos(td.a + sway * 0.5) * reach * 0.6;
    const ym = Math.sin(td.a + sway * 0.5) * reach * 0.6;
    const x1 = Math.cos(td.a + sway) * reach;
    const y1 = Math.sin(td.a + sway) * reach;
    ctx.lineCap = 'round';
    ctx.strokeStyle = '#3a1630';
    ctx.lineWidth = td.w + 3;
    ctx.beginPath();
    ctx.moveTo(x0, y0);
    ctx.quadraticCurveTo(xm, ym, x1, y1);
    ctx.stroke();
    ctx.strokeStyle = `rgba(178,70,140,${0.75 + 0.25 * pulse})`;
    ctx.lineWidth = td.w;
    ctx.stroke();
    ctx.strokeStyle = `rgba(${rgb},${0.35 * g0 + 0.3 * pulse * g0})`;
    ctx.lineWidth = Math.max(1, td.w * 0.35);
    ctx.stroke();
    // bulb at the tip
    ctx.fillStyle = '#c86aa8';
    ctx.beginPath();
    ctx.arc(x1, y1, td.w * 0.55, 0, TAU);
    ctx.fill();
  }

  if (p.kind === 'vent') {
    // armoured vent grate, prised open
    ctx.fillStyle = '#0d0a0c';
    ctx.fillRect(-36, -26, 72, 52);
    ctx.strokeStyle = '#5b5148';
    ctx.lineWidth = 5;
    ctx.strokeRect(-36, -26, 72, 52);
    ctx.fillStyle = `rgba(${rgb},${0.25 + 0.45 * pulse * g0})`;
    ctx.fillRect(-30, -20, 60, 40);
    ctx.fillStyle = '#3d362f';
    for (let k = 0; k < 6; k++) {
      const bent = k === 2 || k === 3 ? Math.sin(t * 3 + k) * 2 + 4 : 0;
      ctx.save();
      ctx.translate(-30 + k * 12 + 4, 0);
      ctx.rotate(bent * 0.06);
      ctx.fillRect(-2.5, -20, 5, 40);
      ctx.restore();
    }
    // hazard corners
    ctx.fillStyle = '#b08a3e';
    for (const [x, y] of [
      [-36, -26],
      [30, -26],
      [-36, 20],
      [30, 20],
    ] as const)
      ctx.fillRect(x, y, 6, 6);
    // spore mist puffs rising from the slats
    for (let k = 0; k < 5; k++) {
      const ph = (t * 0.45 + k / 5) % 1;
      ctx.fillStyle = `rgba(170,110,190,${0.32 * (1 - ph)})`;
      ctx.beginPath();
      ctx.arc(-20 + k * 10 + Math.sin(k * 3 + t) * 6, -ph * 46, 8 + ph * 18, 0, TAU);
      ctx.fill();
    }
  } else {
    // the hole
    ctx.beginPath();
    s.rim.forEach(([x, y], k) => (k ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
    ctx.closePath();
    const hole = ctx.createRadialGradient(0, 4, 4, 0, 0, 60);
    hole.addColorStop(0, `rgba(${rgb},${0.15 + 0.4 * pulse * g0})`);
    hole.addColorStop(0.35, '#0a0507');
    hole.addColorStop(1, '#1c0e16');
    ctx.fillStyle = hole;
    ctx.fill();
    ctx.lineWidth = p.kind === 'breach' ? 6 : 8;
    ctx.strokeStyle = p.kind === 'breach' ? '#4a4038' : '#3a2a22';
    ctx.stroke();
    // torn deck plates / rock lip
    for (const sh of s.shards) {
      ctx.save();
      ctx.translate(Math.cos(sh.a) * sh.r, Math.sin(sh.a) * sh.r * 0.86);
      ctx.rotate(sh.a + 0.4);
      ctx.fillStyle = p.kind === 'breach' ? '#5a5047' : '#4a3a2e';
      ctx.strokeStyle = '#211a15';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(-sh.w / 2, -sh.l / 2);
      ctx.lineTo(sh.w / 2, -sh.l / 3);
      ctx.lineTo(sh.w / 3, sh.l / 2);
      ctx.lineTo(-sh.w / 2, sh.l / 3);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      ctx.restore();
    }
  }

  // telegraph shock rings
  if (state !== BREACH_STATE.idle) {
    for (let k = 0; k < 2; k++) {
      const ph = (t * 1.6 + k * 0.5) % 1;
      ctx.strokeStyle = `rgba(${rgb},${0.7 * (1 - ph)})`;
      ctx.lineWidth = 5 * (1 - ph) + 1;
      ctx.beginPath();
      ctx.arc(0, 0, 50 + ph * 120, 0, TAU);
      ctx.stroke();
    }
  }
  ctx.restore();
}
