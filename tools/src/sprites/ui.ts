import { circle, ellipse, poly, roundRect } from './draw.js';
import type { Ctx, SpriteDef } from './types.js';

/**
 * Our own procedural "skull and wings" emblem (deliberately not the Imperial Aquila:
 * no eagle, no double head). Drawn in a 256x128 box.
 */
export function drawEmblem(ctx: Ctx, w = 256, h = 128): void {
  ctx.save();
  ctx.scale(w / 256, h / 128);
  const brass = ctx.createLinearGradient(0, 10, 0, 118);
  brass.addColorStop(0, '#f2d48a');
  brass.addColorStop(0.45, '#c3923c');
  brass.addColorStop(1, '#6e4a18');
  const dark = '#2a1a08';
  // Wings: stacked blade-like feathers sweeping out and up.
  for (const s of [-1, 1]) {
    for (let i = 0; i < 6; i++) {
      const y0 = 50 + i * 9;
      const len = 96 - i * 13;
      const lift = 30 - i * 4;
      const x0 = 128 + s * 26;
      poly(
        ctx,
        [
          [x0, y0],
          [x0 + s * len * 0.55, y0 - lift * 0.9],
          [x0 + s * len, y0 - lift],
          [x0 + s * len * 0.92, y0 - lift + 7],
          [x0 + s * len * 0.5, y0 - lift * 0.45 + 8],
          [x0, y0 + 9],
        ],
        brass,
        dark,
        2,
      );
    }
  }
  // Laurel bar under the skull.
  roundRect(ctx, 96, 96, 64, 9, 4, brass, dark, 2);
  // Skull.
  ellipse(ctx, 128, 58, 27, 29, '#e9dcb8', dark, 2.5);
  roundRect(ctx, 111, 72, 34, 22, 7, '#e9dcb8', dark, 2.5);
  ellipse(ctx, 118, 58, 8, 9, '#1a120a');
  ellipse(ctx, 138, 58, 8, 9, '#1a120a');
  circle(ctx, 119, 57, 2, '#ff3b2f');
  circle(ctx, 137, 57, 2, '#ff3b2f');
  poly(
    ctx,
    [
      [128, 66],
      [124, 75],
      [132, 75],
    ],
    '#1a120a',
  );
  ctx.strokeStyle = dark;
  ctx.lineWidth = 1.6;
  for (const x of [118, 123, 128, 133, 138]) {
    ctx.beginPath();
    ctx.moveTo(x, 80);
    ctx.lineTo(x, 92);
    ctx.stroke();
  }
  // Crown studs.
  for (const x of [112, 128, 144]) circle(ctx, x, 33, 3, brass, dark, 1.2);
  ctx.restore();
}

/** Tileable aged-parchment texture. */
export function drawParchment(
  ctx: Ctx,
  s: number,
  rng: { next(): number; range(a: number, b: number): number },
): void {
  ctx.fillStyle = '#d9c79c';
  ctx.fillRect(0, 0, s, s);
  for (let i = 0; i < 900; i++) {
    const x = rng.next() * s;
    const y = rng.next() * s;
    const r = rng.range(2, 22);
    const tone = rng.next() < 0.5 ? '110,80,40' : '250,236,200';
    // Draw wrapped copies so the texture tiles.
    for (const dx of [-s, 0, s])
      for (const dy of [-s, 0, s]) {
        if (x + dx < -r || x + dx > s + r || y + dy < -r || y + dy > s + r) continue;
        ellipse(
          ctx,
          x + dx,
          y + dy,
          r,
          r * rng.range(0.4, 1),
          `rgba(${tone},${rng.range(0.02, 0.06)})`,
        );
      }
  }
  for (let i = 0; i < 160; i++)
    circle(ctx, rng.next() * s, rng.next() * s, rng.range(0.4, 1.2), 'rgba(80,50,20,0.25)');
}

export interface UiImage {
  key: string;
  w: number;
  h: number;
  draw(ctx: Ctx, rng: { next(): number; range(a: number, b: number): number }): void;
}

/** Written to assets/generated/ui/<key>.png for the DOM menus (override: overrides/ui/<key>.png). */
export const UI_IMAGES: UiImage[] = [
  { key: 'emblem', w: 512, h: 256, draw: (ctx) => drawEmblem(ctx, 512, 256) },
  { key: 'parchment', w: 512, h: 512, draw: (ctx, rng) => drawParchment(ctx, 512, rng) },
];

export const uiSprites: SpriteDef[] = [
  {
    key: 'ui_emblem',
    group: 'ui',
    w: 128,
    h: 64,
    scale: 2,
    frames: 1,
    prompt: 'Original brass skull-and-wings emblem (no eagle), grimdark gothic HUD ornament',
    draw: (ctx) => drawEmblem(ctx, 128, 64),
  },
];
