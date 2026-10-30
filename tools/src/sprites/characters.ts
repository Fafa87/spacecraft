import { PLAYER_COLORS } from '@sms/shared';
import { circle, ellipse, glow, leg, line, poly, roundRect, shade, shadeHex } from './draw.js';
import type { Ctx, SpriteDef } from './types.js';

/* ------------------------------------------------------------------ marine */

function drawMarine(ctx: Ctx, color: string, frame: number, downed: boolean): void {
  const cx = 32;
  const cy = 32;
  ctx.save();
  ctx.translate(cx, cy);
  const step = Math.sin((frame / 4) * Math.PI * 2);
  const dark = shade(color, -0.55);
  const mid = shade(color, -0.2);
  const light = shade(color, 0.35);
  if (!downed) {
    // Boots (alternate with walk cycle).
    roundRect(ctx, -6 + step * 7, 4, 12, 7, 3, '#2a2d33', '#111', 1);
    roundRect(ctx, -6 - step * 7, -11, 12, 7, 3, '#2a2d33', '#111', 1);
  }
  // Backpack / power unit.
  roundRect(ctx, -19, -10, 9, 20, 3, '#3b3f47', '#15171a', 1.5);
  line(ctx, -17, -6, -12, -6, '#6b7280', 1.5);
  line(ctx, -17, 6, -12, 6, '#6b7280', 1.5);
  glow(ctx, -18, 0, 5, '#ff6a00', 0.7);
  // Torso.
  ellipse(ctx, -1, 0, 12, 13, mid, dark, 2);
  ellipse(ctx, 1, 0, 7, 8, color);
  // Gun (held forward, right side).
  roundRect(ctx, 2, 3, 22, 6, 2, '#25282e', '#0c0d0f', 1.5);
  roundRect(ctx, 20, 4, 7, 4, 1, '#3d424b');
  roundRect(ctx, 6, 1.5, 8, 3, 1, '#4b515c');
  // Arms.
  ellipse(ctx, 6, 7, 5, 4, mid, dark, 1.2);
  ellipse(ctx, 10, -2, 5, 4, mid, dark, 1.2);
  line(ctx, 10, -2, 12, 4, mid, 4);
  // Big pauldrons.
  for (const s of [-1, 1]) {
    ellipse(ctx, -2, s * 12, 8.5, 7, color, dark, 2);
    ellipse(ctx, -1, s * 12, 5, 4, light);
    line(ctx, -8, s * 12, 5, s * 12, dark, 1.2);
  }
  // Helmet.
  circle(ctx, 2, 0, 6.5, mid, dark, 1.8);
  poly(
    ctx,
    [
      [5, -3.5],
      [9, -1.5],
      [9, 1.5],
      [5, 3.5],
    ],
    '#0f2a1a',
  );
  line(ctx, 6, -2.5, 8.5, -1, '#6dff9c', 1.4);
  line(ctx, 6, 2.5, 8.5, 1, '#6dff9c', 1.4);
  ctx.restore();
}

const marines: SpriteDef[] = PLAYER_COLORS.flatMap((color, i): SpriteDef[] => [
  {
    key: `marine_${i}`,
    group: 'player',
    w: 64,
    h: 64,
    frames: 4,
    prompt: `Top-down space marine in bulky power armour, team colour ${color}, huge shoulder pauldrons, holding a rifle pointing right, 4-frame walk cycle`,
    draw: (ctx, frame) => drawMarine(ctx, color, frame, false),
  },
  {
    key: `marine_${i}_down`,
    group: 'player',
    w: 64,
    h: 64,
    frames: 1,
    prompt: `Top-down wounded space marine lying on the ground, team colour ${color}`,
    draw: (ctx) => {
      ctx.save();
      ctx.globalAlpha = 0.85;
      ctx.translate(32, 32);
      ctx.rotate(0.6);
      ctx.translate(-32, -32);
      drawMarine(ctx, shadeHex(color, -0.35), 0, true);
      ctx.restore();
      circle(ctx, 22, 40, 6, 'rgba(140,0,10,0.7)');
    },
  },
]);

/* ------------------------------------------------------------------ swarm */

const CHITIN = '#5a2470';
const CHITIN_DARK = '#2a0d36';
const CHITIN_LIGHT = '#9a4bb5';
const FLESH = '#d6a3b5';

function drawSwarmer(ctx: Ctx, frame: number): void {
  ctx.save();
  ctx.translate(24, 24);
  const ph = (frame / 3) * Math.PI * 2;
  // Six legs scuttling.
  for (let i = 0; i < 3; i++) {
    for (const s of [-1, 1]) {
      const sw = Math.sin(ph + i * 2.1 + (s > 0 ? Math.PI : 0)) * 4;
      leg(ctx, -2 + i * 5 - 4, s * 4, -6 + i * 7 + sw, s * 17, s * -4, CHITIN_DARK, 2.2);
    }
  }
  // Tail + abdomen.
  ellipse(ctx, -11, 0, 8, 6, CHITIN, CHITIN_DARK, 1.5);
  ellipse(ctx, -2, 0, 8, 7, CHITIN, CHITIN_DARK, 1.5);
  for (const x of [-12, -6, 0]) line(ctx, x, -5, x, 5, CHITIN_DARK, 1.2);
  // Scything claws.
  const cl = Math.sin(ph) * 0.25;
  for (const s of [-1, 1]) {
    ctx.save();
    ctx.translate(6, s * 5);
    ctx.rotate(s * (0.5 + cl));
    poly(
      ctx,
      [
        [0, -1.5],
        [14, -2],
        [19, s * 4],
        [13, 0],
        [0, 1.5],
      ],
      CHITIN_LIGHT,
      CHITIN_DARK,
      1.2,
    );
    ctx.restore();
  }
  // Head.
  ellipse(ctx, 9, 0, 6, 5, CHITIN_LIGHT, CHITIN_DARK, 1.5);
  poly(
    ctx,
    [
      [13, -2],
      [18, 0],
      [13, 2],
    ],
    FLESH,
  );
  circle(ctx, 11, -2.5, 1.3, '#ffdf3d');
  circle(ctx, 11, 2.5, 1.3, '#ffdf3d');
  ctx.restore();
}

function drawBrute(ctx: Ctx, frame: number): void {
  ctx.save();
  ctx.translate(48, 48);
  const ph = frame * Math.PI;
  // Legs.
  for (const s of [-1, 1]) {
    const sw = Math.sin(ph + (s > 0 ? Math.PI : 0)) * 6;
    roundRect(ctx, -14 + sw, s * 22 - 6, 18, 12, 5, CHITIN_DARK);
    leg(ctx, 0, s * 20, 10 + sw, s * 36, s * 6, CHITIN_DARK, 6);
  }
  // Huge armoured carapace.
  ellipse(ctx, -6, 0, 28, 25, '#43195a', CHITIN_DARK, 3);
  for (let i = 0; i < 4; i++) ellipse(ctx, -22 + i * 9, 0, 7, 20 - i * 2, CHITIN, CHITIN_DARK, 2);
  // Back spines.
  for (let i = 0; i < 5; i++)
    poly(
      ctx,
      [
        [-26 + i * 8, -3],
        [-30 + i * 8, 0],
        [-26 + i * 8, 3],
        [-18 + i * 8, 0],
      ],
      '#e7d3a6',
      '#6d5a37',
      1,
    );
  // Crushing claws.
  const reach = Math.sin(ph) * 3;
  for (const s of [-1, 1]) {
    ctx.save();
    ctx.translate(14, s * 18);
    ctx.rotate(s * 0.35);
    roundRect(ctx, 0, -6, 18 + reach, 12, 5, CHITIN_LIGHT, CHITIN_DARK, 2);
    poly(
      ctx,
      [
        [16 + reach, -8],
        [32 + reach, -2],
        [16 + reach, 2],
      ],
      '#e7d3a6',
      '#6d5a37',
      1.5,
    );
    poly(
      ctx,
      [
        [16 + reach, 8],
        [30 + reach, 4],
        [16 + reach, 0],
      ],
      '#e7d3a6',
      '#6d5a37',
      1.5,
    );
    ctx.restore();
  }
  // Head with armoured crest.
  ellipse(ctx, 18, 0, 13, 12, CHITIN, CHITIN_DARK, 2.5);
  poly(
    ctx,
    [
      [8, -12],
      [26, -6],
      [30, 0],
      [26, 6],
      [8, 12],
      [12, 0],
    ],
    CHITIN_LIGHT,
    CHITIN_DARK,
    2,
  );
  circle(ctx, 24, -4, 2, '#ff3b2f');
  circle(ctx, 24, 4, 2, '#ff3b2f');
  ctx.restore();
}

function drawSpitter(ctx: Ctx, frame: number): void {
  ctx.save();
  ctx.translate(28, 28);
  const pulse = frame === 0 ? 0 : 1.5;
  for (let i = 0; i < 2; i++)
    for (const s of [-1, 1]) {
      const sw = (frame === 0 ? 1 : -1) * (i ? -3 : 3);
      leg(ctx, -4 + i * 8, s * 5, -6 + i * 10 + sw, s * 18, s * -4, CHITIN_DARK, 2.4);
    }
  // Long body.
  ellipse(ctx, -6, 0, 14, 8, '#2f5a26', '#112409', 1.8);
  // Glowing acid sac.
  glow(ctx, -10, 0, 14 + pulse, '#8dff3a', 0.55);
  ellipse(ctx, -10, 0, 8 + pulse, 7 + pulse, '#7fe32c', '#2f6a12', 1.5);
  ellipse(ctx, -12, -2, 3, 2, '#d8ff9c');
  // Neck + head with spit orifice.
  ellipse(ctx, 8, 0, 8, 6, '#3d7330', '#112409', 1.5);
  ellipse(ctx, 15, 0, 5, 4, '#56993f', '#112409', 1.2);
  circle(ctx, 19, 0, 2.2, '#c6ff6a');
  circle(ctx, 13, -3, 1.2, '#ffdf3d');
  circle(ctx, 13, 3, 1.2, '#ffdf3d');
  ctx.restore();
}

function drawBurster(ctx: Ctx, frame: number): void {
  ctx.save();
  ctx.translate(28, 28);
  const sw = frame === 0 ? 1 : 1.12;
  for (const s of [-1, 1])
    for (let i = 0; i < 3; i++)
      leg(ctx, -4 + i * 5, s * 8, -8 + i * 9 + (frame ? 2 : -2), s * 19, s * -3, '#4a3a12', 2);
  glow(ctx, 0, 0, 22 * sw, '#f7ff4a', 0.4);
  ellipse(ctx, -1, 0, 15 * sw, 14 * sw, '#a9a326', '#4a3a12', 2);
  // Pustules.
  const pts: Array<[number, number, number]> = [
    [-6, -6, 4],
    [3, -8, 3],
    [-8, 5, 3.5],
    [2, 6, 4.5],
    [-2, -1, 3],
  ];
  for (const [x, y, r] of pts) {
    ellipse(ctx, x * sw, y * sw, r * sw, r * sw, '#eaff5a', '#6e7a14', 1);
    circle(ctx, x * sw - 1, y * sw - 1, r * 0.35, '#ffffd0');
  }
  ellipse(ctx, 13, 0, 5, 4, '#6e5a1a', '#2e2408', 1.2);
  circle(ctx, 15, -2, 1.1, '#ff3b2f');
  circle(ctx, 15, 2, 1.1, '#ff3b2f');
  ctx.restore();
}

const enemies: SpriteDef[] = [
  {
    key: 'enemy_swarmer',
    group: 'enemy',
    w: 48,
    h: 48,
    frames: 3,
    prompt:
      'Top-down small purple chitinous alien bug with scything claws, six legs, facing right, 3-frame scuttle',
    draw: drawSwarmer,
  },
  {
    key: 'enemy_brute',
    group: 'enemy',
    w: 96,
    h: 96,
    frames: 2,
    prompt:
      'Top-down huge armoured purple alien beast with bone crest and crushing claws, facing right, 2-frame stomp',
    draw: drawBrute,
  },
  {
    key: 'enemy_spitter',
    group: 'enemy',
    w: 56,
    h: 56,
    frames: 2,
    prompt: 'Top-down green alien with glowing acid sac on its back, facing right, 2-frame pulse',
    draw: drawSpitter,
  },
  {
    key: 'enemy_burster',
    group: 'enemy',
    w: 56,
    h: 56,
    frames: 2,
    prompt:
      'Top-down bloated yellow alien covered in glowing pustules about to explode, facing right, 2-frame throb',
    draw: drawBurster,
  },
];

export const characterSprites: SpriteDef[] = [...marines, ...enemies];
