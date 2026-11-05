import { describe, expect, it } from 'vitest';
import { createCanvas } from '@napi-rs/canvas';
import { defaultContent, muzzleDef, WEAPON_MUZZLE } from '@sms/shared';
import { SPRITES } from '../src/sprites/index.js';
import { HELD_W } from '../src/sprites/weapons.js';
import { MARINE_SIZE } from '../src/sprites/marines.js';

/** Renders a held-weapon sprite at 4x and returns alpha at marine-frame (forward, lateral). */
function alphaProbe(key: string): (f: number, l: number) => number {
  const def = SPRITES.find((s) => s.key === key)!;
  const K = 4;
  const cv = createCanvas(def.w * K, def.h * K);
  const ctx = cv.getContext('2d');
  ctx.scale(K, K);
  def.draw(ctx as never, 0, undefined as never);
  const img = ctx.getImageData(0, 0, def.w * K, def.h * K).data;
  const [ax, ay] = def.anchor ?? [0.5, 0.5];
  return (f, l) => {
    const x = Math.round((def.w * ax + f) * K);
    const y = Math.round((def.h * ay + l) * K);
    if (x < 0 || y < 0 || x >= def.w * K || y >= def.h * K) return 0;
    return img[(y * def.w * K + x) * 4 + 3]!;
  };
}

describe('muzzle data matches the held-weapon sprites', () => {
  it('held sprites are anchored on the marine centre and wide enough for every barrel', () => {
    for (const w of defaultContent.weaponOrder) {
      const def = SPRITES.find((s) => s.key === w.sprites.held)!;
      expect(def.w).toBe(HELD_W);
      expect(def.w * (def.anchor?.[0] ?? 0.5)).toBeCloseTo(MARINE_SIZE / 2, 6);
      expect(muzzleDef(w.id).forward + 4).toBeLessThan(HELD_W - MARINE_SIZE / 2);
    }
  });
  it('every weapon has an explicit muzzle and the sprite ends right at it', () => {
    for (const w of defaultContent.weaponOrder) {
      expect(WEAPON_MUZZLE).toHaveProperty(w.id);
      const m = muzzleDef(w.id);
      const a = alphaProbe(w.sprites.held);
      expect(a(m.forward - 1, m.lateral), `${w.id} solid just behind the tip`).toBeGreaterThan(200);
      // nothing solid beyond the tip (soft pilot-light / lens glows allowed)
      expect(a(m.forward + 3, m.lateral), `${w.id} clear past the tip`).toBeLessThan(140);
      expect(a(m.forward + 5, m.lateral), `${w.id} clear past the tip`).toBeLessThan(40);
    }
  });
});
