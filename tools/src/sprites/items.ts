import { defaultContent } from '@sms/shared';
import { circle, ellipse, glow, line, poly, roundRect, rgba } from './draw.js';
import type { Ctx, SpriteDef } from './types.js';

/* ------------------------------------------------------------ weapon icons */

/** Silhouette drawers for weapon icons, in a 64x28 box. Unknown ids use `generic`. */
const ICONS: Record<string, (ctx: Ctx, c: string, d: string) => void> = {
  rifle: (ctx, c, d) => {
    roundRect(ctx, 6, 9, 40, 9, 2, c, d, 1.5);
    roundRect(ctx, 44, 11, 14, 4, 1, c, d, 1.2);
    poly(
      ctx,
      [
        [18, 17],
        [25, 17],
        [22, 26],
        [16, 26],
      ],
      c,
      d,
      1.2,
    );
    poly(
      ctx,
      [
        [6, 9],
        [0, 7],
        [0, 20],
        [6, 18],
      ],
      c,
      d,
      1.2,
    );
    roundRect(ctx, 20, 5, 12, 4, 1, c, d, 1);
  },
  shotgun: (ctx, c, d) => {
    roundRect(ctx, 14, 8, 46, 6, 2, c, d, 1.5);
    roundRect(ctx, 14, 14, 36, 4, 1, c, d, 1.2);
    roundRect(ctx, 30, 14, 14, 6, 2, c, d, 1.2);
    poly(
      ctx,
      [
        [14, 8],
        [2, 10],
        [2, 22],
        [10, 22],
        [16, 16],
      ],
      c,
      d,
      1.2,
    );
  },
  flamer: (ctx, c, d) => {
    roundRect(ctx, 4, 7, 38, 11, 3, c, d, 1.5);
    roundRect(ctx, 40, 10, 16, 5, 1, c, d, 1.2);
    circle(ctx, 14, 22, 5, c, d, 1.2);
    circle(ctx, 28, 22, 5, c, d, 1.2);
    poly(
      ctx,
      [
        [56, 8],
        [63, 12.5],
        [56, 17],
      ],
      '#ff9a2e',
    );
  },
  plasma: (ctx, c, d) => {
    roundRect(ctx, 6, 8, 36, 12, 4, c, d, 1.5);
    roundRect(ctx, 40, 10, 16, 8, 2, c, d, 1.2);
    for (let i = 0; i < 3; i++) line(ctx, 14 + i * 8, 9, 14 + i * 8, 19, '#5fd0ff', 2);
    circle(ctx, 58, 14, 3.5, '#9ae6ff');
    poly(
      ctx,
      [
        [16, 20],
        [24, 20],
        [21, 27],
        [15, 27],
      ],
      c,
      d,
      1.2,
    );
  },
  rocket: (ctx, c, d) => {
    roundRect(ctx, 2, 7, 56, 12, 5, c, d, 1.5);
    roundRect(ctx, 54, 6, 8, 14, 2, c, d, 1.2);
    roundRect(ctx, 18, 19, 6, 7, 1, c, d, 1.2);
    roundRect(ctx, 30, 3, 10, 4, 1, c, d, 1);
    circle(ctx, 60, 13, 2.5, '#ff4a2e');
  },
  generic: (ctx, c, d) => {
    roundRect(ctx, 6, 9, 46, 10, 3, c, d, 1.5);
    poly(
      ctx,
      [
        [18, 18],
        [26, 18],
        [22, 26],
        [16, 26],
      ],
      c,
      d,
      1.2,
    );
  },
};

const WEAPON_TINT: Record<string, string> = {
  rifle: '#c9cfd8',
  shotgun: '#e0b77a',
  flamer: '#ff9a2e',
  plasma: '#5fd0ff',
  rocket: '#ff5a4a',
};

function drawIcon(ctx: Ctx, id: string, color = '#d7dde6'): void {
  (ICONS[id] ?? ICONS.generic)(ctx, color, '#0b0c0e');
}

const weapons = defaultContent.weaponOrder;

const icons: SpriteDef[] = weapons.map(({ id, sprites }) => ({
  key: sprites.icon,
  group: 'icon',
  w: 64,
  h: 28,
  frames: 1,
  prompt: `Side-view silhouette icon of a sci-fi ${id}, light grey with dark outline, HUD style`,
  draw: (ctx) => drawIcon(ctx, id),
}));

const crates: SpriteDef[] = weapons.map(({ id, sprites }) => ({
  key: sprites.pickup,
  group: 'pickup',
  w: 48,
  h: 48,
  frames: 2,
  prompt: `Top-down military supply crate with a ${id} stencil and glowing ${WEAPON_TINT[id] ?? 'white'} light strip, 2-frame blink`,
  draw: (ctx, frame) => {
    const tint = WEAPON_TINT[id] ?? '#ffffff';
    glow(ctx, 24, 24, 24, tint, frame ? 0.45 : 0.25);
    roundRect(ctx, 6, 8, 36, 32, 4, '#4b5a3a', '#1b2214', 2);
    roundRect(ctx, 9, 11, 30, 26, 2, '#5d6e48');
    line(ctx, 6, 18, 42, 18, '#1b2214', 1.5);
    line(ctx, 6, 30, 42, 30, '#1b2214', 1.5);
    roundRect(ctx, 6, 22, 36, 4, 1, tint);
    ctx.save();
    ctx.translate(12, 14);
    ctx.scale(0.38, 0.38);
    drawIcon(ctx, id, '#1d2416');
    ctx.restore();
    for (const [x, y] of [
      [9, 11],
      [39, 11],
      [9, 37],
      [39, 37],
    ])
      circle(ctx, x, y, 1.5, '#9aa77f');
  },
}));

const medkit: SpriteDef = {
  key: 'medkit',
  group: 'pickup',
  w: 40,
  h: 40,
  frames: 2,
  prompt: 'Top-down white medkit with a red cross, soft green glow, 2-frame blink',
  draw: (ctx, frame) => {
    glow(ctx, 20, 20, 20, '#6dff9c', frame ? 0.45 : 0.2);
    roundRect(ctx, 7, 9, 26, 22, 4, '#e8ecef', '#6b7280', 1.5);
    roundRect(ctx, 17, 12, 6, 16, 1, '#e0283a');
    roundRect(ctx, 12, 17, 16, 6, 1, '#e0283a');
    roundRect(ctx, 16, 6, 8, 4, 1, '#9ca3af');
  },
};

/* ------------------------------------------------------------- projectiles */

const projectiles: SpriteDef[] = [
  {
    key: 'proj_bullet',
    group: 'projectile',
    w: 24,
    h: 8,
    frames: 1,
    prompt: 'Bright yellow tracer bullet streak pointing right',
    draw: (ctx) => {
      const g = ctx.createLinearGradient(0, 0, 24, 0);
      g.addColorStop(0, 'rgba(255,200,80,0)');
      g.addColorStop(1, 'rgba(255,240,170,1)');
      ctx.fillStyle = g;
      roundRect(ctx, 0, 2, 24, 4, 2, g as unknown as string);
      ellipse(ctx, 20, 4, 3.5, 2, '#ffffff');
    },
  },
  {
    key: 'proj_pellet',
    group: 'projectile',
    w: 14,
    h: 8,
    frames: 1,
    prompt: 'Small orange shotgun pellet streak',
    draw: (ctx) => {
      ellipse(ctx, 7, 4, 6.5, 2.5, 'rgba(255,170,60,0.7)');
      circle(ctx, 10, 4, 2.2, '#fff2c4');
    },
  },
  {
    key: 'proj_flame',
    group: 'projectile',
    w: 32,
    h: 32,
    frames: 1,
    prompt: 'Soft round blob of fire, additive blending friendly',
    draw: (ctx) => {
      glow(ctx, 16, 16, 16, '#ff7a1a', 0.9);
      glow(ctx, 16, 16, 9, '#ffd66a', 0.9);
    },
  },
  {
    key: 'proj_plasma',
    group: 'projectile',
    w: 32,
    h: 20,
    frames: 1,
    prompt: 'Glowing cyan plasma bolt pointing right',
    draw: (ctx) => {
      glow(ctx, 18, 10, 12, '#3ab8ff', 0.9);
      ellipse(ctx, 18, 10, 9, 5, 'rgba(160,230,255,0.9)');
      ellipse(ctx, 20, 10, 5, 3, '#ffffff');
    },
  },
  {
    key: 'proj_rocket',
    group: 'projectile',
    w: 28,
    h: 12,
    frames: 1,
    prompt: 'Small rocket with fins and a flame, pointing right',
    draw: (ctx) => {
      glow(ctx, 5, 6, 6, '#ff9a2e', 1);
      roundRect(ctx, 6, 3, 17, 6, 3, '#c2c8d0', '#30343a', 1);
      poly(
        ctx,
        [
          [22, 3],
          [28, 6],
          [22, 9],
        ],
        '#e0283a',
      );
      poly(
        ctx,
        [
          [8, 3],
          [5, 0],
          [11, 3],
        ],
        '#30343a',
      );
      poly(
        ctx,
        [
          [8, 9],
          [5, 12],
          [11, 9],
        ],
        '#30343a',
      );
    },
  },
  {
    key: 'proj_acid',
    group: 'projectile',
    w: 20,
    h: 20,
    frames: 1,
    prompt: 'Glob of glowing green acid',
    draw: (ctx) => {
      glow(ctx, 10, 10, 10, '#8dff3a', 0.9);
      circle(ctx, 10, 10, 5, '#b6ff5a', '#3f8a12', 1);
      circle(ctx, 8.5, 8.5, 1.6, '#f0ffd0');
    },
  },
];

/* ------------------------------------------------------------------- tiles */

function plate(
  ctx: Ctx,
  rng: { next(): number; range(a: number, b: number): number },
  base: string,
): void {
  ctx.fillStyle = base;
  ctx.fillRect(0, 0, 64, 64);
  // Grime noise.
  for (let i = 0; i < 260; i++) {
    const a = rng.range(0.02, 0.09);
    ctx.fillStyle = rng.next() < 0.5 ? `rgba(0,0,0,${a})` : `rgba(255,255,255,${a * 0.5})`;
    ctx.fillRect(
      Math.floor(rng.next() * 64),
      Math.floor(rng.next() * 64),
      1 + Math.floor(rng.next() * 3),
      1 + Math.floor(rng.next() * 2),
    );
  }
  // Seams + bevel.
  ctx.fillStyle = 'rgba(0,0,0,0.45)';
  ctx.fillRect(0, 0, 64, 1);
  ctx.fillRect(0, 0, 1, 64);
  ctx.fillStyle = 'rgba(255,255,255,0.06)';
  ctx.fillRect(1, 1, 63, 1);
  ctx.fillRect(1, 1, 1, 63);
  for (const [x, y] of [
    [5, 5],
    [59, 5],
    [5, 59],
    [59, 59],
  ]) {
    circle(ctx, x, y, 1.6, 'rgba(0,0,0,0.5)');
    circle(ctx, x - 0.4, y - 0.4, 0.9, 'rgba(255,255,255,0.15)');
  }
}

const tiles: SpriteDef[] = [
  {
    key: 'tile_floor_0',
    group: 'tile',
    w: 64,
    h: 64,
    frames: 1,
    prompt: 'Seamless dark sci-fi metal floor plate with rivets, top-down',
    draw: (ctx, _f, rng) => plate(ctx, rng, '#262a30'),
  },
  {
    key: 'tile_floor_1',
    group: 'tile',
    w: 64,
    h: 64,
    frames: 1,
    prompt: 'Seamless dark sci-fi metal floor plate, scuffed variant',
    draw: (ctx, _f, rng) => {
      plate(ctx, rng, '#23272c');
      line(ctx, 10, 40, 30, 52, 'rgba(0,0,0,0.3)', 2);
      line(ctx, 34, 12, 50, 20, 'rgba(255,255,255,0.05)', 1);
    },
  },
  {
    key: 'tile_floor_2',
    group: 'tile',
    w: 64,
    h: 64,
    frames: 1,
    prompt: 'Seamless sci-fi floor grate with vents, top-down',
    draw: (ctx, _f, rng) => {
      plate(ctx, rng, '#202328');
      roundRect(ctx, 10, 10, 44, 44, 3, '#14161a', '#3a3f47', 1.5);
      for (let i = 0; i < 6; i++) line(ctx, 14, 15 + i * 7, 50, 15 + i * 7, '#2d3238', 3, 'butt');
    },
  },
  {
    key: 'tile_floor_3',
    group: 'tile',
    w: 64,
    h: 64,
    frames: 1,
    prompt: 'Seamless sci-fi floor plate with yellow/black hazard stripe',
    draw: (ctx, _f, rng) => {
      plate(ctx, rng, '#262a30');
      ctx.save();
      ctx.beginPath();
      ctx.rect(0, 26, 64, 12);
      ctx.clip();
      for (let i = -2; i < 10; i++)
        poly(
          ctx,
          [
            [i * 10, 38],
            [i * 10 + 6, 38],
            [i * 10 + 18, 26],
            [i * 10 + 12, 26],
          ],
          'rgba(214,168,32,0.55)',
        );
      ctx.restore();
    },
  },
];

/* ------------------------------------------------------------------ decals */

function splat(
  ctx: Ctx,
  rng: { next(): number; range(a: number, b: number): number },
  color: string,
): void {
  for (let i = 0; i < 14; i++) {
    const a = rng.next() * Math.PI * 2;
    const d = rng.range(0, 20);
    ellipse(
      ctx,
      32 + Math.cos(a) * d,
      32 + Math.sin(a) * d,
      rng.range(3, 11),
      rng.range(3, 9),
      rgba(color, rng.range(0.35, 0.7)),
      undefined,
      0,
      a,
    );
  }
  for (let i = 0; i < 10; i++) {
    const a = rng.next() * Math.PI * 2;
    const d = rng.range(18, 30);
    circle(ctx, 32 + Math.cos(a) * d, 32 + Math.sin(a) * d, rng.range(1, 2.6), rgba(color, 0.6));
  }
}

const decals: SpriteDef[] = [
  ...[0, 1, 2].map((i): SpriteDef => ({
    key: `decal_blood_${i}`,
    group: 'decal',
    w: 64,
    h: 64,
    frames: 1,
    prompt: 'Top-down purple alien ichor splatter on the floor',
    draw: (ctx, _f, rng) => splat(ctx, rng, '#5b1a6e'),
  })),
  ...[0, 1, 2].map((i): SpriteDef => ({
    key: `decal_acid_${i}`,
    group: 'decal',
    w: 64,
    h: 64,
    frames: 1,
    prompt: 'Top-down green acid splatter on the floor',
    draw: (ctx, _f, rng) => splat(ctx, rng, '#4f9a1a'),
  })),
  {
    key: 'decal_scorch_0',
    group: 'decal',
    w: 96,
    h: 96,
    frames: 1,
    prompt: 'Top-down black scorch mark from an explosion',
    draw: (ctx, _f, rng) => {
      const g = ctx.createRadialGradient(48, 48, 4, 48, 48, 46);
      g.addColorStop(0, 'rgba(10,8,6,0.75)');
      g.addColorStop(0.6, 'rgba(20,16,12,0.4)');
      g.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, 96, 96);
      for (let i = 0; i < 12; i++) {
        const a = rng.next() * Math.PI * 2;
        line(
          ctx,
          48,
          48,
          48 + Math.cos(a) * rng.range(25, 46),
          48 + Math.sin(a) * rng.range(25, 46),
          'rgba(0,0,0,0.25)',
          rng.range(1, 3),
        );
      }
    },
  },
];

/* --------------------------------------------------------------------- fx */

const fx: SpriteDef[] = [
  {
    key: 'fx_explosion',
    group: 'fx',
    w: 128,
    h: 128,
    frames: 8,
    prompt: 'Top-down cartoon explosion fireball, 8-frame expanding then smoke dissipating',
    draw: (ctx, frame, rng) => {
      const t = frame / 7;
      const r = 20 + t * 42;
      ctx.save();
      ctx.globalAlpha = 1 - t * 0.85;
      // Smoke puffs.
      for (let i = 0; i < 9; i++) {
        const a = (i / 9) * Math.PI * 2 + rng.range(-0.3, 0.3);
        const d = r * 0.6;
        circle(
          ctx,
          64 + Math.cos(a) * d,
          64 + Math.sin(a) * d,
          r * 0.45,
          `rgba(${60 + t * 40},${50 + t * 40},${45 + t * 40},${0.7 - t * 0.3})`,
        );
      }
      if (t < 0.75) {
        glow(ctx, 64, 64, r * 1.1, '#ff6a00', 1 - t);
        glow(ctx, 64, 64, r * 0.7, '#ffd23a', 1 - t);
        if (t < 0.3) circle(ctx, 64, 64, r * 0.35, '#fffbe0');
      }
      ctx.restore();
    },
  },
  {
    key: 'fx_muzzle',
    group: 'fx',
    w: 32,
    h: 24,
    frames: 2,
    prompt: 'Muzzle flash star pointing right, 2 frames',
    draw: (ctx, frame) => {
      glow(ctx, 8, 12, 12, '#ffcf5a', 1);
      const len = frame ? 26 : 20;
      poly(
        ctx,
        [
          [2, 12],
          [len, 7],
          [len - 4, 12],
          [len, 17],
        ],
        'rgba(255,240,180,0.95)',
      );
      poly(
        ctx,
        [
          [4, 12],
          [12, 2],
          [10, 12],
          [12, 22],
        ],
        'rgba(255,220,120,0.8)',
      );
    },
  },
  {
    key: 'fx_particle',
    group: 'fx',
    w: 16,
    h: 16,
    frames: 1,
    prompt: 'Soft white round particle',
    draw: (ctx) => glow(ctx, 8, 8, 8, '#ffffff', 1),
  },
  {
    key: 'fx_ring',
    group: 'fx',
    w: 64,
    h: 64,
    frames: 1,
    prompt: 'Thin white glowing ring, used for revive/unlock pulses',
    draw: (ctx) => {
      ctx.beginPath();
      ctx.arc(32, 32, 28, 0, Math.PI * 2);
      ctx.strokeStyle = 'rgba(255,255,255,0.9)';
      ctx.lineWidth = 3;
      ctx.stroke();
    },
  },
  {
    key: 'shadow',
    group: 'fx',
    w: 64,
    h: 64,
    frames: 1,
    prompt: 'Soft round black drop shadow',
    draw: (ctx) => {
      const g = ctx.createRadialGradient(32, 32, 0, 32, 32, 30);
      g.addColorStop(0, 'rgba(0,0,0,0.55)');
      g.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, 64, 64);
    },
  },
];

export const itemSprites: SpriteDef[] = [
  ...icons,
  ...crates,
  medkit,
  ...projectiles,
  ...tiles,
  ...decals,
  ...fx,
];
