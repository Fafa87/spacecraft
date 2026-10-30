import type { InputKind } from './InputSource.js';

/**
 * Tracks which kind of device the player is using and mirrors it as `body.touch-mode`
 * (CSS shows the touch controls and bigger tap targets). Starts from the pointer media
 * query, switches to touch on the first touch and back on real mouse/keyboard use.
 */
let current: InputKind = 'kbm';
const listeners = new Set<(k: InputKind) => void>();
let initialized = false;

export function getInputKind(): InputKind {
  return current;
}

export function setInputKind(kind: InputKind): void {
  if (kind === current) return;
  current = kind;
  document.body.classList.toggle('touch-mode', kind === 'touch');
  for (const fn of listeners) fn(kind);
}

export function onInputKindChange(fn: (k: InputKind) => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

/** Pure helper for the initial guess (unit tested). */
export function initialInputKind(coarsePointer: boolean, hasTouchPoints: boolean): InputKind {
  return coarsePointer && hasTouchPoints ? 'touch' : 'kbm';
}

export function initDeviceDetection(): void {
  if (initialized) return;
  initialized = true;
  const coarse = window.matchMedia?.('(pointer: coarse)').matches ?? false;
  current = initialInputKind(coarse, (navigator.maxTouchPoints ?? 0) > 0);
  document.body.classList.toggle('touch-mode', current === 'touch');
  window.addEventListener('touchstart', () => setInputKind('touch'), {
    capture: true,
    passive: true,
  });
  window.addEventListener(
    'pointermove',
    (e) => {
      if (e.pointerType === 'mouse' && (e.movementX || e.movementY)) setInputKind('kbm');
    },
    { passive: true },
  );
  window.addEventListener('keydown', (e) => {
    const t = e.target as HTMLElement | null;
    if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA')) return;
    setInputKind('kbm');
  });
}
