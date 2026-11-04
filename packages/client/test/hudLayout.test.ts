import { describe, expect, it } from 'vitest';
import { TOUCH_TUNING } from '../src/input/TouchInput.js';
import { MOVE_HINT, compactTouch, hudLayout } from '../src/render/hud.js';

const PHONES: Array<[number, number]> = [
  [568, 320],
  [640, 360],
  [667, 375],
  [740, 360],
  [844, 390],
  [896, 414],
  [932, 430],
];
const NOTCH = [
  { top: 0, right: 0, bottom: 0, left: 0 },
  { top: 0, right: 0, bottom: 21, left: 47 },
  { top: 0, right: 47, bottom: 21, left: 0 },
];
// top of the idle move-stick hint incl. the sprint ring and its "» SPRINT" label
const hintTop = (ch: number) =>
  ch - MOVE_HINT.fromBottom - TOUCH_TUNING.move.radius * TOUCH_TUNING.sprintZone.enter - 14;

describe('compact phone HUD layout', () => {
  it('only short touch landscape viewports are compact', () => {
    expect(compactTouch(844, 390, true)).toBe(true);
    expect(compactTouch(1024, 768, true)).toBe(false); // tablet
    expect(compactTouch(844, 390, false)).toBe(false); // desktop window
    expect(compactTouch(390, 844, true)).toBe(false); // portrait (rotate overlay)
  });

  for (const [cw, ch] of PHONES)
    for (const ins of NOTCH)
      it(`${cw}x${ch} inset L${ins.left}/R${ins.right}: corner block, team and voice slot never collide`, () => {
        for (let players = 1; players <= 8; players++)
          for (const heat of [false, true]) {
            const L = hudLayout(cw, ch, true, ins, { players, me: true, heat });
            expect(L.compact).toBe(true);
            const b = L.block!;
            // inside the safe area
            expect(ins.left + b.x * L.ui).toBeGreaterThanOrEqual(ins.left);
            // left column stays above the move stick (+ sprint ring + label)
            expect(ins.top + L.leftBottom * L.ui).toBeLessThan(hintTop(ch) - 2);
            // voice slot: right of the block, left of the minimap, wide enough for its buttons
            const blockRight = ins.left + (b.x + b.w) * L.ui;
            const w = (cw - ins.left - ins.right) / L.ui;
            const minimapLeft = ins.left + (w - 190 - 12 - 4) * L.ui;
            expect(L.voice.x).toBeGreaterThan(blockRight);
            expect(L.voice.x + L.voice.w).toBeLessThan(minimapLeft);
            expect(L.voice.w).toBeGreaterThan(180);
            expect(L.voice.align).toBe('center');
            // v0.6.0 hotfix: the top-centre message band shares the voice slot's free columns
            const band = L.topBand!;
            expect(ins.left + band.x0 * L.ui).toBeGreaterThan(blockRight);
            expect(ins.left + band.x1 * L.ui).toBeLessThan(minimapLeft);
            expect(band.x1 - band.x0).toBeGreaterThanOrEqual(300); // boss bar + panel fit
          }
      });

  it('desktop keeps the classic layout; the voice slot goes under the squad list', () => {
    const L = hudLayout(1280, 800, false, NOTCH[0], { players: 4, me: true, heat: false });
    expect(L.compact).toBe(false);
    expect(L.block).toBeNull();
    expect(L.topBand).toBeNull(); // desktop banners keep their classic offsets
    expect(L.team).toEqual({ top: 10, cols: 1, rowH: 26, h: 14 + 4 * 26 });
    expect(L.voice).toMatchObject({ x: 10, y: 10 + 14 + 4 * 26 + 8, align: 'left' });
    const big = hudLayout(1280, 800, false, NOTCH[0], { players: 8, me: true, heat: false });
    expect(big.team).toMatchObject({ cols: 1, rowH: 19 });
  });

  it('a big squad on a phone goes to two columns', () => {
    const L = hudLayout(844, 390, true, NOTCH[0], { players: 7, me: true, heat: false });
    expect(L.team).toMatchObject({ cols: 2, h: 14 + 4 * 22 });
  });
});
