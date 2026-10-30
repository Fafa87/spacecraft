import { describe, expect, it } from 'vitest';
import { needsRotate, PHONE_MAX_SHORT_SIDE } from '../src/input/orientation.js';

describe('needsRotate (rotate-your-device overlay)', () => {
  it('shows for a touch phone held in portrait', () => {
    expect(needsRotate(true, 390, 844)).toBe(true); // iPhone 14
    expect(needsRotate(true, 393, 851)).toBe(true); // Pixel 5
  });
  it('hides once the phone is in landscape', () => {
    expect(needsRotate(true, 844, 390)).toBe(false);
    expect(needsRotate(true, 851, 393)).toBe(false);
  });
  it('never shows on PC (mouse + keyboard), even in a tall window', () => {
    expect(needsRotate(false, 390, 844)).toBe(false);
    expect(needsRotate(false, 1280, 800)).toBe(false);
  });
  it('leaves tablets alone', () => {
    expect(needsRotate(true, 820, 1180)).toBe(false); // iPad Air portrait
    expect(needsRotate(true, PHONE_MAX_SHORT_SIDE, 1000)).toBe(false);
  });
});
