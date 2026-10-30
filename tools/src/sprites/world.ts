import { circle, ellipse, line, poly, rgba, roundRect, shade, shadeHex } from './draw.js';
import { FLEET } from './palette.js';
import type { Ctx, SpriteDef } from './types.js';

/** Imperial hive-city floor, ruined props and Tyranid creep. Tiles are 64x64 and seamless. */

type R = { next(): number; range(a: number, b: number): number };

function rivets(ctx: Ctx, pts: Array<[number, number]>): void {
  for (const [x, y] of pts) {
    circle(ctx, x, y, 1.6, 'rgba(0,0,0,0.55)');
    circle(ctx, x - 0.4, y - 0.4, 0.9, 'rgba(220,200,160,0.18)');
  }
}

function grime(ctx: Ctx, rng: R, n: number, color = '0,0,0'): void {
  for (let i = 0; i < n; i++)
    ellipse(
      ctx,
      rng.range(0, 64),
      rng.range(0, 64),
      rng.range(2, 9),
      rng.range(1, 5),
      `rgba(${color},${rng.range(0.04, 0.14)})`,
      undefined,
      0,
      rng.next() * 3,
    );
}

/** Base plate: worn ferrocrete-grey steel with bevelled edges. */
function basePlate(ctx: Ctx, rng: R, base = '#2b2824'): void {
  ctx.fillStyle = base;
  ctx.fillRect(0, 0, 64, 64);
  const g = ctx.createLinearGradient(0, 0, 64, 64);
  g.addColorStop(0, 'rgba(255,240,210,0.05)');
  g.addColorStop(1, 'rgba(0,0,0,0.18)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 64, 64);
  ctx.strokeStyle = 'rgba(0,0,0,0.6)';
  ctx.lineWidth = 2;
  ctx.strokeRect(1, 1, 62, 62);
  ctx.strokeStyle = 'rgba(200,180,140,0.07)';
  ctx.lineWidth = 1;
  ctx.strokeRect(3, 3, 58, 58);
  grime(ctx, rng, 16);
  rivets(ctx, [
    [5, 5],
    [59, 5],
    [5, 59],
    [59, 59],
  ]);
}

const tiles: SpriteDef[] = [
  {
    key: 'tile_floor_0',
    group: 'tile',
    w: 64,
    h: 64,
    frames: 1,
    prompt:
      'Seamless top-down worn gothic steel deck plate, dark umber-grey, rivets at the corners',
    draw: (ctx, _f, rng) => basePlate(ctx, rng),
  },
  {
    key: 'tile_floor_1',
    group: 'tile',
    w: 64,
    h: 64,
    frames: 1,
    prompt: 'Seamless top-down steel deck plate with a cross-hatched tread pattern',
    draw: (ctx, _f, rng) => {
      basePlate(ctx, rng, '#2a2723');
      for (let y = 10; y < 56; y += 6)
        for (let x = 10; x < 56; x += 6)
          line(ctx, x, y, x + 3, y + (((x + y) / 6) % 2 ? 3 : -3), 'rgba(0,0,0,0.35)', 1.2);
    },
  },
  {
    key: 'tile_floor_2',
    group: 'tile',
    w: 64,
    h: 64,
    frames: 1,
    prompt: 'Seamless top-down cracked steel deck plate, battle damage, scorch',
    draw: (ctx, _f, rng) => {
      basePlate(ctx, rng, '#2a2622');
      let x = rng.range(10, 30);
      let y = rng.range(8, 20);
      ctx.beginPath();
      ctx.moveTo(x, y);
      for (let i = 0; i < 6; i++) {
        x += rng.range(-6, 9);
        y += rng.range(4, 9);
        ctx.lineTo(x, y);
      }
      ctx.strokeStyle = 'rgba(0,0,0,0.7)';
      ctx.lineWidth = 1.4;
      ctx.stroke();
      ellipse(ctx, rng.range(20, 44), rng.range(20, 44), 12, 8, 'rgba(10,6,4,0.25)');
    },
  },
  {
    key: 'tile_floor_3',
    group: 'tile',
    w: 64,
    h: 64,
    frames: 1,
    prompt: 'Seamless top-down steel deck plate with a brass gothic quatrefoil inlay',
    draw: (ctx, _f, rng) => {
      basePlate(ctx, rng, '#2c2925');
      ctx.save();
      ctx.translate(32, 32);
      ctx.strokeStyle = 'rgba(184,145,58,0.45)';
      ctx.lineWidth = 2;
      for (let i = 0; i < 4; i++) {
        ctx.beginPath();
        ctx.arc(
          Math.cos((i * Math.PI) / 2) * 8,
          Math.sin((i * Math.PI) / 2) * 8,
          8,
          0,
          Math.PI * 2,
        );
        ctx.stroke();
      }
      ctx.strokeRect(-18, -18, 36, 36);
      ctx.restore();
    },
  },
  {
    key: 'tile_grate',
    group: 'tile',
    w: 64,
    h: 64,
    frames: 1,
    prompt: 'Seamless top-down drainage grate over a dark shaft, iron bars',
    draw: (ctx, _f, rng) => {
      basePlate(ctx, rng, '#26231f');
      roundRect(ctx, 8, 8, 48, 48, 3, '#0b0907', 'rgba(0,0,0,0.8)', 2);
      for (let x = 12; x <= 52; x += 6) roundRect(ctx, x - 1.5, 9, 3, 46, 1, '#3a352e');
      line(ctx, 9, 32, 55, 32, '#3a352e', 3);
    },
  },
  {
    key: 'tile_hazard',
    group: 'tile',
    w: 64,
    h: 64,
    frames: 1,
    prompt: 'Seamless top-down deck plate with worn yellow-black hazard chevrons',
    draw: (ctx, _f, rng) => {
      basePlate(ctx, rng);
      ctx.save();
      ctx.beginPath();
      ctx.rect(4, 22, 56, 20);
      ctx.clip();
      for (let i = -2; i < 10; i++)
        poly(
          ctx,
          [
            [i * 10, 42],
            [i * 10 + 6, 42],
            [i * 10 + 22, 22],
            [i * 10 + 16, 22],
          ],
          'rgba(200,150,30,0.5)',
        );
      ctx.restore();
      grime(ctx, rng, 10);
    },
  },
  {
    key: 'tile_seal',
    group: 'tile',
    w: 64,
    h: 64,
    frames: 1,
    prompt:
      'Top-down deck plate with an inlaid circular brass cog-and-skull seal (original design)',
    draw: (ctx, _f, rng) => {
      basePlate(ctx, rng);
      ctx.save();
      ctx.translate(32, 32);
      // Cog ring.
      ctx.beginPath();
      for (let i = 0; i < 24; i++) {
        const a = (i / 24) * Math.PI * 2;
        const r = i % 2 ? 22 : 25;
        ctx.lineTo(Math.cos(a) * r, Math.sin(a) * r);
      }
      ctx.closePath();
      ctx.fillStyle = 'rgba(150,115,45,0.55)';
      ctx.fill();
      circle(ctx, 0, 0, 18, '#2b2824');
      // Small skull.
      ellipse(ctx, 0, -2, 9, 8, 'rgba(200,180,140,0.55)');
      roundRect(ctx, -5, 4, 10, 6, 2, 'rgba(200,180,140,0.55)');
      circle(ctx, -3.5, -2, 2.6, '#1a1612');
      circle(ctx, 3.5, -2, 2.6, '#1a1612');
      poly(
        ctx,
        [
          [0, 1],
          [-1.4, 4],
          [1.4, 4],
        ],
        '#1a1612',
      );
      for (const x of [-3, 0, 3]) line(ctx, x, 6, x, 10, '#1a1612', 0.8);
      ctx.restore();
    },
  },
];

/* ---------------------------------------------------------------- props */

function rubble(ctx: Ctx, rng: R, n: number, size: number): void {
  for (let i = 0; i < n; i++) {
    const x = size / 2 + rng.range(-size * 0.35, size * 0.35);
    const y = size / 2 + rng.range(-size * 0.35, size * 0.35);
    const r = rng.range(3, size * 0.14);
    const pts: Array<[number, number]> = [];
    const k = 5 + Math.floor(rng.next() * 3);
    for (let j = 0; j < k; j++) {
      const a = (j / k) * Math.PI * 2 + rng.range(-0.3, 0.3);
      pts.push([
        x + Math.cos(a) * r * rng.range(0.6, 1.2),
        y + Math.sin(a) * r * rng.range(0.6, 1.2),
      ]);
    }
    const tone = rng.range(-0.25, 0.15);
    poly(ctx, pts, shade('#5a544a', tone), 'rgba(0,0,0,0.6)', 1);
    line(ctx, pts[0]![0], pts[0]![1], pts[2]![0], pts[2]![1], 'rgba(255,240,210,0.08)', 1);
  }
}

const props: SpriteDef[] = [
  {
    key: 'prop_rubble_0',
    group: 'prop',
    w: 80,
    h: 80,
    scale: 1.5,
    frames: 1,
    prompt: 'Top-down pile of broken gothic masonry and ferrocrete chunks, soft shadow',
    draw: (ctx, _f, rng) => {
      ellipse(ctx, 40, 42, 34, 28, 'rgba(0,0,0,0.3)');
      rubble(ctx, rng, 16, 80);
    },
  },
  {
    key: 'prop_rubble_1',
    group: 'prop',
    w: 80,
    h: 80,
    scale: 1.5,
    frames: 1,
    prompt: 'Top-down fallen statue fragments and twisted rebar among rubble',
    draw: (ctx, _f, rng) => {
      ellipse(ctx, 40, 42, 34, 26, 'rgba(0,0,0,0.3)');
      rubble(ctx, rng, 10, 80);
      for (let i = 0; i < 4; i++) {
        const x = rng.range(15, 65);
        const y = rng.range(15, 65);
        line(ctx, x, y, x + rng.range(-20, 20), y + rng.range(-20, 20), '#5a3a26', 1.6);
      }
      // A broken stone wing fragment.
      poly(
        ctx,
        [
          [30, 30],
          [56, 24],
          [52, 32],
          [58, 34],
          [34, 40],
        ],
        '#6a6458',
        'rgba(0,0,0,0.6)',
        1,
      );
    },
  },
  {
    key: 'prop_pillar',
    group: 'prop',
    w: 96,
    h: 96,
    scale: 1.5,
    frames: 1,
    prompt:
      'Top-down broken gothic column with a fluted top and buttress, seen from above, ruined hive city',
    draw: (ctx, _f, rng) => {
      circle(ctx, 50, 52, 40, 'rgba(0,0,0,0.4)');
      // Square plinth.
      roundRect(ctx, 14, 14, 68, 68, 4, '#3b362e', '#14110d', 2);
      roundRect(ctx, 20, 20, 56, 56, 3, '#4a443a');
      // Fluted column top.
      circle(ctx, 48, 48, 22, '#5c554a', '#1a1612', 2);
      for (let i = 0; i < 12; i++) {
        const a = (i / 12) * Math.PI * 2;
        line(
          ctx,
          48 + Math.cos(a) * 10,
          48 + Math.sin(a) * 10,
          48 + Math.cos(a) * 21,
          48 + Math.sin(a) * 21,
          'rgba(0,0,0,0.35)',
          1.4,
        );
      }
      circle(ctx, 48, 48, 9, '#6a6356');
      // Break line / missing chunk.
      poly(
        ctx,
        [
          [60, 30],
          [72, 40],
          [66, 52],
          [58, 44],
        ],
        '#2b2824',
      );
      rubble(ctx, rng, 4, 96);
    },
  },
  {
    key: 'prop_skull_pile',
    group: 'prop',
    w: 56,
    h: 56,
    scale: 2,
    frames: 1,
    prompt: 'Top-down small heap of old bone skulls, grimdark battlefield debris',
    draw: (ctx, _f, rng) => {
      ellipse(ctx, 28, 30, 24, 20, 'rgba(0,0,0,0.35)');
      for (let i = 0; i < 9; i++) {
        const x = 28 + rng.range(-15, 15);
        const y = 28 + rng.range(-12, 12);
        const r = rng.range(4.5, 6.5);
        ellipse(
          ctx,
          x,
          y,
          r,
          r * 0.9,
          shade('#cfc2a0', rng.range(-0.35, 0)),
          'rgba(40,30,20,0.8)',
          0.8,
        );
        circle(ctx, x - r * 0.35, y + r * 0.1, r * 0.25, '#1e1812');
        circle(ctx, x + r * 0.35, y + r * 0.1, r * 0.25, '#1e1812');
      }
    },
  },
  {
    key: 'prop_barricade',
    group: 'prop',
    w: 96,
    h: 48,
    scale: 1.5,
    frames: 1,
    prompt: 'Top-down defensive barricade: sandbags and riveted plasteel tank-traps',
    draw: (ctx, _f, rng) => {
      ellipse(ctx, 48, 28, 44, 16, 'rgba(0,0,0,0.35)');
      for (let i = 0; i < 6; i++)
        roundRect(
          ctx,
          6 + i * 14,
          14 + (i % 2) * 3,
          16,
          11,
          5,
          shade('#5d5440', rng.range(-0.2, 0.05)),
          '#1a160e',
          1,
        );
      for (const x of [16, 80]) {
        line(ctx, x - 9, 34 - 9, x + 9, 34 + 9, '#3a3b3e', 4);
        line(ctx, x + 9, 34 - 9, x - 9, 34 + 9, '#3a3b3e', 4);
      }
    },
  },
];

/* --------------------------------------------------------------- creep */

const creep: SpriteDef[] = [0, 1, 2].map((i) => ({
  key: `creep_${i}`,
  group: 'tile',
  w: 192,
  h: 192,
  frames: 1,
  prompt: `Top-down organic alien biomass creep patch spreading over a metal floor, ${FLEET.creep} veined, soft irregular edge, transparent background`,
  draw: (ctx, _f, rng) => {
    // Soft blobby biomass.
    for (let k = 0; k < 26; k++) {
      const a = rng.next() * Math.PI * 2;
      const d = rng.range(0, 62);
      const g = ctx.createRadialGradient(
        96 + Math.cos(a) * d,
        96 + Math.sin(a) * d,
        0,
        96 + Math.cos(a) * d,
        96 + Math.sin(a) * d,
        rng.range(22, 40),
      );
      g.addColorStop(0, rgba(FLEET.creep, 0.5));
      g.addColorStop(1, rgba(FLEET.creep, 0));
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, 192, 192);
    }
    // Veins.
    for (let k = 0; k < 9; k++) {
      let x = 96;
      let y = 96;
      let a = rng.next() * Math.PI * 2;
      ctx.beginPath();
      ctx.moveTo(x, y);
      for (let s = 0; s < 8; s++) {
        a += rng.range(-0.6, 0.6);
        x += Math.cos(a) * 10;
        y += Math.sin(a) * 10;
        ctx.lineTo(x, y);
      }
      ctx.strokeStyle = rgba(shadeHex(FLEET.flesh, -0.2), 0.45);
      ctx.lineWidth = rng.range(1, 2.6);
      ctx.stroke();
    }
    // Pustules.
    for (let k = 0; k < 7; k++) {
      const a = rng.next() * Math.PI * 2;
      const d = rng.range(5, 45);
      circle(
        ctx,
        96 + Math.cos(a) * d,
        96 + Math.sin(a) * d,
        rng.range(2, 4.5),
        rgba('#b85a8c', 0.5),
      );
    }
  },
}));

export const worldSprites: SpriteDef[] = [...tiles, ...props, ...creep];
