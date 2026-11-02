import { describe, expect, it } from 'vitest';
import { isIos, shouldShowIosHint } from '../src/ui/iosInstallHint.js';
import { isInScrollableUi } from '../src/input/TouchInput.js';
import { canFullscreen } from '../src/input/orientation.js';

const IPHONE =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1';
const ANDROID =
  'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Mobile Safari/537.36';

const env = (o: Partial<Parameters<typeof shouldShowIosHint>[0]> = {}) => ({
  userAgent: IPHONE,
  platform: 'iPhone',
  maxTouchPoints: 5,
  standalone: false,
  displayModeApp: false,
  ...o,
});

describe('iPhone home-screen hint', () => {
  it('detects iPhone and iPadOS (MacIntel + touch), not Android or desktop Mac', () => {
    expect(isIos(env())).toBe(true);
    expect(isIos(env({ userAgent: 'Mozilla/5.0 (Macintosh)', platform: 'MacIntel' }))).toBe(true);
    expect(
      isIos(env({ userAgent: 'Mozilla/5.0 (Macintosh)', platform: 'MacIntel', maxTouchPoints: 0 })),
    ).toBe(false);
    expect(isIos(env({ userAgent: ANDROID, platform: 'Linux armv8l' }))).toBe(false);
  });

  it('shows only in an iOS browser tab, never once launched from the home screen or after dismissal', () => {
    expect(shouldShowIosHint(env(), false)).toBe(true);
    expect(shouldShowIosHint(env(), true)).toBe(false);
    expect(shouldShowIosHint(env({ standalone: true }), false)).toBe(false);
    expect(shouldShowIosHint(env({ displayModeApp: true }), false)).toBe(false);
    expect(shouldShowIosHint(env({ userAgent: ANDROID, platform: 'Linux' }), false)).toBe(false);
  });

  it('is not shown when the browser can go fullscreen itself (feature-detected)', () => {
    expect(shouldShowIosHint(env({ fullscreenApi: false }), false)).toBe(true);
    expect(shouldShowIosHint(env({ fullscreenApi: true }), false)).toBe(false);
  });

  it('canFullscreen detects the standard or webkit API, never by user agent', () => {
    const doc = (o: Record<string, unknown>, el: Record<string, unknown>) =>
      ({ ...o, documentElement: el }) as unknown as Document;
    const fn = () => undefined;
    expect(canFullscreen(doc({ fullscreenEnabled: true }, { requestFullscreen: fn }))).toBe(true);
    expect(canFullscreen(doc({ fullscreenEnabled: false }, { requestFullscreen: fn }))).toBe(false);
    expect(canFullscreen(doc({}, {}))).toBe(false); // iPhone Safari today
    expect(
      canFullscreen(doc({ webkitFullscreenEnabled: true }, { webkitRequestFullscreen: fn })),
    ).toBe(true);
    expect(canFullscreen(undefined)).toBe(false);
  });
});

describe('touch scrolling on overlay screens', () => {
  const fakeEl = (insideUi: boolean) =>
    ({
      closest: (sel: string) => (sel.includes('#ui') && insideUi ? {} : null),
    }) as unknown as EventTarget;
  it('lets a finger scroll inside the visible #ui (game-over summary), blocks it elsewhere', () => {
    expect(isInScrollableUi(fakeEl(true))).toBe(true);
    expect(isInScrollableUi(fakeEl(false))).toBe(false);
    expect(isInScrollableUi(null)).toBe(false);
  });
});
