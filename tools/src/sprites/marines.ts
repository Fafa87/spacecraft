import { CHAPTERS, type ChapterDef } from '@sms/shared';
import { circle, ellipse, glow, line, poly, roundRect, shade, shadeHex } from './draw.js';
import { drawChapterIcon } from './icons.js';
import { animLayout, type Ctx, type SpriteDef } from './types.js';

/**
 * Primaris-style marines, top-down, facing +X. Rendered in three layers so any held
 * weapon fits any chapter:   marine_<ch> (legs, backpack, torso, arms; walk cycle)
 *                         -> held_<weapon> (see weapons.ts)
 *                         -> marine_<ch>_top (pauldrons, helmet, gauntlets).
 * World size 72x72, centre (36,36); stored at 2x in the atlas.
 */
export const MARINE_SIZE = 72;
export const MARINE_SCALE = 2;
const C = MARINE_SIZE / 2;
/** Grip points (relative to centre) shared by marine arms and held weapons. */
export const GRIP_R: [number, number] = [11, 7];
export const GRIP_L: [number, number] = [20, 3];
const WALK = animLayout([['walk', 6]]);
const METAL = '#2b2d31';
const METAL_DARK = '#121316';

function drawLower(ctx: Ctx, ch: ChapterDef, frame: number): void {
  const step = Math.sin((frame / 6) * Math.PI * 2);
  const p = ch.primary;
  const dark = shade(p, -0.55);
  ctx.save();
  ctx.translate(C, C);
  // Legs / boots (top-down they poke out front & back as the marine strides).
  for (const [side, ph] of [
    [-1, 1],
    [1, -1],
  ] as const) {
    const fx = ph * step * 8;
    roundRect(ctx, -7 + fx, side * 7 - 4, 15, 8, 3.5, shade(p, -0.3), dark, 1.2);
    roundRect(ctx, 3 + fx, side * 7 - 3.5, 6, 7, 2.5, METAL, METAL_DARK, 1); // boot toe
    circle(ctx, 1 + fx, side * 7, 2.6, ch.trim); // knee pad
  }
  // Backpack: Mk X power pack with twin exhausts.
  roundRect(ctx, -22, -12, 12, 24, 4, shade(p, -0.15), dark, 1.6);
  roundRect(ctx, -20, -8, 7, 16, 2, shade(p, 0.12));
  for (const s of [-1, 1]) {
    circle(ctx, -21, s * 9.5, 3.4, METAL, METAL_DARK, 1);
    circle(ctx, -21, s * 9.5, 1.6, '#08090a');
  }
  glow(ctx, -23, 0, 4, '#ff7a1a', 0.35);
  // Torso / breastplate.
  ellipse(ctx, -1, 0, 13, 14, shade(p, -0.25), dark, 2);
  ellipse(ctx, 2, 0, 8, 9, p);
  // Chest eagle-free "devotional" plate: a simple trim bar + skull-ish stud.
  line(ctx, 4, -6, 4, 6, ch.trim, 2.2);
  circle(ctx, 6.5, 0, 1.6, ch.detail);
  // Arms reaching for the grip points.
  ellipse(ctx, 5, 10, 6, 4.2, shade(p, -0.1), dark, 1.2, 0.35);
  ellipse(ctx, 12, -4, 7, 4, shade(p, -0.1), dark, 1.2, 0.55);
  line(ctx, 4, -11, GRIP_L[0] - 3, GRIP_L[1] - 1, shade(p, -0.1), 5.5);
  ctx.restore();
}

function drawTop(ctx: Ctx, ch: ChapterDef): void {
  const p = ch.primary;
  const dark = shade(p, -0.6);
  ctx.save();
  ctx.translate(C, C);
  // Gauntlets at the grip points.
  for (const [gx, gy] of [GRIP_R, GRIP_L]) {
    circle(ctx, gx, gy, 3.6, shade(p, -0.2), dark, 1.2);
    circle(ctx, gx + 0.8, gy - 0.6, 1.4, shade(p, 0.25));
  }
  // Big rounded pauldrons with trim rims. Left (-y): chapter icon. Right (+y): squad arrow.
  for (const s of [-1, 1]) {
    const y = s * 14;
    ellipse(ctx, -2, y, 11, 8.6, shade(p, -0.35), dark, 1.5);
    ellipse(ctx, -2, y, 9.4, 7.2, p, ch.trim, 2.4);
    ellipse(ctx, -3.5, y - s * 1.8, 4.5, 2.6, shade(p, 0.35)); // highlight
  }
  drawChapterIcon(ctx, ch.icon, -2, -14, 9, ch.detail, Math.PI / 2);
  // Squad marking: a plain tactical arrow.
  poly(
    ctx,
    [
      [2.5, 14],
      [-3, 10.5],
      [-3, 12.6],
      [-7, 12.6],
      [-7, 15.4],
      [-3, 15.4],
      [-3, 17.5],
    ],
    ch.detail,
  );
  // Purity seal on the right pauldron.
  circle(ctx, 5, 19, 2.2, '#8c1c18', '#4a0b09', 0.8);
  line(ctx, 5, 20.5, 2, 25, '#d8ccaa', 1.6, 'butt');
  // Helmet: Mk X tacticus dome, front grille, glowing lenses.
  circle(ctx, 2, 0, 8, shade(p, -0.3), dark, 1.6);
  circle(ctx, 1.5, 0, 6.8, p);
  ellipse(ctx, 0, -1.5, 3.6, 2.2, shade(p, 0.4)); // dome shine
  line(ctx, -5, 0, 4, 0, ch.trim, 1.4); // crest ridge
  roundRect(ctx, 7, -2.6, 3.2, 5.2, 1.2, METAL, METAL_DARK, 0.8); // grille
  for (const gy of [-1.4, 0, 1.4]) line(ctx, 7.6, gy, 9.8, gy, '#4a4e55', 0.6, 'butt');
  for (const s of [-1, 1]) {
    ellipse(ctx, 6.4, s * 3.8, 1.9, 1.3, ch.lens, undefined, 0, s * 0.5);
    glow(ctx, 7, s * 3.8, 4, ch.lens, 0.55);
  }
  ctx.restore();
}

function drawDown(ctx: Ctx, ch: ChapterDef): void {
  ctx.save();
  // Blood pool.
  ellipse(ctx, C - 2, C + 3, 24, 16, 'rgba(110,10,8,0.55)');
  ctx.translate(C, C);
  ctx.rotate(0.55);
  ctx.translate(-C, -C);
  ctx.globalAlpha = 0.92;
  drawLower(ctx, { ...ch, primary: shadeHex(ch.primary, -0.25) }, 1);
  drawTop(ctx, { ...ch, primary: shadeHex(ch.primary, -0.25), lens: '#3a3a3a' });
  ctx.restore();
}

/** Shield badge used by the lobby chapter picker and the HUD. */
export function drawBadge(ctx: Ctx, ch: ChapterDef, s: number): void {
  const k = s / 32;
  ctx.save();
  ctx.scale(k, k);
  poly(
    ctx,
    [
      [4, 4],
      [28, 4],
      [28, 16],
      [16, 29],
      [4, 16],
    ],
    ch.primary,
    ch.trim,
    2.4,
  );
  drawChapterIcon(ctx, ch.icon, 16, 14.5, 14, ch.detail);
  ctx.restore();
}

export const marineSprites: SpriteDef[] = CHAPTERS.flatMap((ch): SpriteDef[] => [
  {
    key: `marine_${ch.id}`,
    group: 'player',
    w: MARINE_SIZE,
    h: MARINE_SIZE,
    scale: MARINE_SCALE,
    ...WALK,
    prompt: `Top-down (bird's-eye) armoured super-soldier in heavy rounded power armour, ${ch.name} colours (${ch.primary} with ${ch.trim} trim), backpack power unit, facing right, body only (legs, backpack, torso, arms reaching to a rifle grip), 6-frame walk cycle`,
    draw: (ctx, frame) => drawLower(ctx, ch, frame),
  },
  {
    key: `marine_${ch.id}_top`,
    group: 'player',
    w: MARINE_SIZE,
    h: MARINE_SIZE,
    scale: MARINE_SCALE,
    frames: 1,
    prompt: `Top-down overlay: two huge rounded shoulder pauldrons (${ch.primary}, ${ch.trim} rims, a simple ${ch.icon} icon), grille-faced round helmet with glowing ${ch.lens} lenses, two gauntlets; transparent elsewhere, facing right`,
    draw: (ctx) => drawTop(ctx, ch),
  },
  {
    key: `marine_${ch.id}_down`,
    group: 'player',
    w: MARINE_SIZE,
    h: MARINE_SIZE,
    scale: MARINE_SCALE,
    frames: 1,
    prompt: `Top-down wounded armoured soldier (${ch.name} colours) slumped on the floor in a blood pool`,
    draw: (ctx) => drawDown(ctx, ch),
  },
  {
    key: `badge_${ch.id}`,
    group: 'ui',
    w: 32,
    h: 32,
    scale: 2,
    frames: 1,
    prompt: `Heraldic shield badge, ${ch.primary} field, ${ch.trim} border, simple ${ch.icon} symbol`,
    draw: (ctx) => drawBadge(ctx, ch, 32),
  },
]);
