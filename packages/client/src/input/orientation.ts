import { getInputKind, onInputKindChange } from './device.js';

/**
 * Phones play in landscape:
 *  - on the first button tap (Start / Solo / Join …) on a touch phone we ask for fullscreen and
 *    `screen.orientation.lock('landscape')` (works on Android Chrome; iOS Safari has neither);
 *  - while a touch phone is still held in portrait, a full-screen "rotate your device" overlay
 *    covers the page and input is paused (see `isRotateBlocked`). Tapping it retries the lock.
 * Desktop (mouse + keyboard) and tablets are untouched.
 */

/** Viewports whose short side is below this (CSS px) count as phones. */
export const PHONE_MAX_SHORT_SIDE = 600;

/** Pure rule (unit tested): show the overlay for a touch phone held in portrait. */
export function needsRotate(touch: boolean, width: number, height: number): boolean {
  return touch && height > width && Math.min(width, height) < PHONE_MAX_SHORT_SIDE;
}

let blocked = false;
let overlay: HTMLElement | null = null;
let triedOnGesture = false;
const listeners = new Set<(blocked: boolean) => void>();

export function isRotateBlocked(): boolean {
  return blocked;
}

export function onRotateBlockedChange(fn: (blocked: boolean) => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

function isTouchPhone(): boolean {
  return (
    getInputKind() === 'touch' &&
    Math.min(window.innerWidth, window.innerHeight) < PHONE_MAX_SHORT_SIDE
  );
}

/** Fullscreen + landscape lock. Must run inside a user gesture. Never throws. */
export async function requestLandscape(): Promise<boolean> {
  try {
    const el = document.documentElement;
    if (!document.fullscreenElement && el.requestFullscreen && document.fullscreenEnabled)
      await el.requestFullscreen({ navigationUI: 'hide' }).catch(() => undefined);
    const o = screen.orientation as
      (ScreenOrientation & { lock?: (o: string) => Promise<void> }) | undefined;
    if (!o?.lock) return false;
    await o.lock('landscape');
    return true;
  } catch {
    return false; // not supported (iOS Safari, desktop) or not allowed
  }
}

function update(): void {
  const next = needsRotate(getInputKind() === 'touch', window.innerWidth, window.innerHeight);
  if (next === blocked) return;
  blocked = next;
  document.body.classList.toggle('rotate-blocked', blocked);
  overlay?.setAttribute('aria-hidden', blocked ? 'false' : 'true');
  for (const fn of listeners) fn(blocked);
}

const ROTATE_ICON = `<svg viewBox="0 0 64 64" width="96" height="96" aria-hidden="true">
  <g fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round">
    <rect class="phone" x="22" y="8" width="20" height="36" rx="3"/>
    <line x1="29" y1="39" x2="35" y2="39"/>
    <path d="M10 40 A 24 24 0 0 0 36 58" />
    <polyline points="31,53 36,58 31,62" />
  </g>
</svg>`;

export function initOrientation(): void {
  if (overlay) return;
  overlay = document.createElement('div');
  overlay.className = 'rotate-overlay';
  overlay.setAttribute('role', 'dialog');
  overlay.setAttribute('aria-hidden', 'true');
  overlay.innerHTML = `
    <div class="rotate-box">
      <div class="rotate-icon">${ROTATE_ICON}</div>
      <h2>Obróć telefon</h2>
      <p class="en">Rotate your device</p>
      <p class="small">Hive Siege is played in landscape. The game waits until you turn the phone.</p>
    </div>`;
  const retry = (e: Event) => {
    e.preventDefault();
    e.stopPropagation();
    void requestLandscape();
  };
  overlay.addEventListener('click', retry);
  overlay.addEventListener('touchend', retry, { passive: false });
  // Swallow touches so nothing underneath (sticks, menu) reacts while portrait.
  overlay.addEventListener('touchstart', (e) => e.stopPropagation(), { passive: true });
  document.body.append(overlay);

  // First button tap on a touch phone: go fullscreen + landscape right away.
  const onGesture = (e: Event) => {
    if (triedOnGesture || !isTouchPhone()) return;
    if (!(e.target as HTMLElement | null)?.closest?.('button')) return;
    triedOnGesture = true;
    void requestLandscape();
  };
  window.addEventListener('click', onGesture, { capture: true });
  window.addEventListener('touchend', onGesture, { capture: true, passive: true });

  window.addEventListener('resize', update);
  window.addEventListener('orientationchange', update);
  screen.orientation?.addEventListener?.('change', update);
  onInputKindChange(update);
  update();
}
