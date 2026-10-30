import {
  NO_ACTIONS,
  type ActionIntent,
  type ContinuousIntent,
  type InputSource,
} from './InputSource.js';
import { VirtualStick, type StickVector } from './joystick.js';

/** Tuning for the twin-stick layout (CSS px). */
export const TOUCH_TUNING = {
  move: { radius: 60, deadzone: 0.12 },
  aim: { radius: 60, deadzone: 0.2 },
  /** Fire once the aim stick magnitude (after deadzone) reaches this. 0 = as soon as it's past the deadzone. */
  fireThreshold: 0,
};

/**
 * Maps the two stick vectors to the normalized intent (pure, unit tested):
 *  - left stick: movement (analog)
 *  - right stick: aim direction + auto-fire while pushed past the deadzone
 *  - aim stick idle but moving: face the movement direction (no fire)
 */
export function touchIntent(
  move: StickVector,
  aim: StickVector,
  fireThreshold = TOUCH_TUNING.fireThreshold,
): ContinuousIntent {
  const m = move.active ? { x: move.x, y: move.y } : { x: 0, y: 0 };
  if (aim.active)
    return { move: m, aim: { kind: 'angle', angle: aim.angle }, fire: aim.mag >= fireThreshold };
  if (move.active) return { move: m, aim: { kind: 'angle', angle: move.angle }, fire: false };
  return { move: m, aim: null, fire: false };
}

/** Which stick a new touch starts: left half moves, right half aims. */
export function zoneFor(x: number, width: number): 'move' | 'aim' {
  return x < width / 2 ? 'move' : 'aim';
}

export interface StickView {
  kind: 'move' | 'aim';
  engaged: boolean;
  origin: { x: number; y: number };
  knob: { x: number; y: number };
  radius: number;
  active: boolean;
}

export interface TouchInputOptions {
  /** Hit-test a tap against HUD widgets (weapon slots); returns a slot number or 0. */
  hitSlot?: (x: number, y: number) => number;
  /** System buttons. */
  onButton?: (action: 'mute') => void;
}

/**
 * Twin-stick touch controls on a full-screen overlay: floating sticks on each half,
 * weapon slots via HUD taps, and buttons for reload / mute / fullscreen.
 * Only visible in `body.touch-mode` (see device.ts).
 */
export class TouchInput implements InputSource {
  readonly kind = 'touch' as const;
  readonly layer: HTMLElement;
  readonly moveStick = new VirtualStick({ ...TOUCH_TUNING.move, follow: true });
  readonly aimStick = new VirtualStick({ ...TOUCH_TUNING.aim, follow: true });
  private latched: ActionIntent = { ...NO_ACTIONS };
  private listeners: Array<() => void> = [];
  onActivity: (() => void) | null = null;

  constructor(
    host: HTMLElement,
    private readonly opts: TouchInputOptions = {},
  ) {
    const canFullscreen =
      !!document.documentElement.requestFullscreen && document.fullscreenEnabled;
    this.layer = document.createElement('div');
    this.layer.className = 'touch-layer';
    this.layer.innerHTML = `
      <div class="touch-buttons">
        <button class="tb" data-act="mute" aria-label="Mute">🔊</button>
        <button class="tb main" data-act="reload" aria-label="Reload">⟳<span>RELOAD</span></button>
        ${canFullscreen ? '<button class="tb" data-act="fullscreen" aria-label="Fullscreen">⛶</button>' : ''}
      </div>
      <div class="rotate-hint">↻ Rotate to landscape for the best experience</div>`;
    host.append(this.layer);

    const on = <K extends keyof HTMLElementEventMap>(
      el: HTMLElement | Document,
      type: K,
      fn: (e: HTMLElementEventMap[K]) => void,
      opts: AddEventListenerOptions = { passive: false },
    ) => {
      el.addEventListener(type, fn as EventListener, opts);
      this.listeners.push(() => el.removeEventListener(type, fn as EventListener, opts));
    };

    on(this.layer, 'touchstart', (e) => this.onStart(e));
    on(this.layer, 'touchmove', (e) => this.onMove(e));
    on(this.layer, 'touchend', (e) => this.onEnd(e));
    on(this.layer, 'touchcancel', (e) => this.onEnd(e));
    // No long-press menus / pull-to-refresh / pinch while playing.
    on(this.layer, 'contextmenu', (e) => e.preventDefault());
    on(document, 'touchmove', (e) => e.preventDefault());
    on(document, 'gesturestart' as keyof HTMLElementEventMap, (e) => e.preventDefault());

    this.layer.querySelectorAll<HTMLButtonElement>('button[data-act]').forEach((b) => {
      const act = b.dataset.act!;
      const fire = (e: Event) => {
        e.preventDefault();
        e.stopPropagation();
        this.button(act, b);
      };
      on(b, 'touchstart', fire);
      on(b, 'click', fire);
    });
  }

  private button(act: string, b: HTMLButtonElement): void {
    if (act === 'reload') this.latched.reload = true;
    else if (act === 'mute') this.opts.onButton?.('mute');
    else if (act === 'fullscreen') void toggleFullscreen();
    b.classList.add('pressed');
    setTimeout(() => b.classList.remove('pressed'), 120);
  }

  setMuted(muted: boolean): void {
    const b = this.layer.querySelector('[data-act="mute"]');
    if (b) b.textContent = muted ? '🔇' : '🔊';
  }

  private onStart(e: TouchEvent): void {
    e.preventDefault();
    this.onActivity?.();
    const w = this.layer.clientWidth || window.innerWidth;
    for (const t of Array.from(e.changedTouches)) {
      const slot = this.opts.hitSlot?.(t.clientX, t.clientY) ?? 0;
      if (slot) {
        this.latched.slot = slot;
        continue;
      }
      const stick = zoneFor(t.clientX, w) === 'move' ? this.moveStick : this.aimStick;
      if (!stick.engaged) stick.begin(t.identifier, t.clientX, t.clientY);
    }
  }

  private onMove(e: TouchEvent): void {
    e.preventDefault();
    for (const t of Array.from(e.changedTouches)) {
      for (const s of [this.moveStick, this.aimStick])
        if (s.touchId === t.identifier) s.move(t.clientX, t.clientY);
    }
  }

  private onEnd(e: TouchEvent): void {
    e.preventDefault();
    for (const t of Array.from(e.changedTouches)) {
      for (const s of [this.moveStick, this.aimStick]) if (s.touchId === t.identifier) s.end();
    }
  }

  read(): ContinuousIntent {
    return touchIntent(this.moveStick.vector, this.aimStick.vector);
  }

  takeActions(): ActionIntent {
    const a = this.latched;
    this.latched = { ...NO_ACTIONS };
    return a;
  }

  sticks(): StickView[] {
    return (
      [
        ['move', this.moveStick],
        ['aim', this.aimStick],
      ] as const
    ).map(([kind, s]) => ({
      kind,
      engaged: s.engaged,
      origin: { x: s.originX, y: s.originY },
      knob: s.knob,
      radius: s.opts.radius,
      active: s.vector.active,
    }));
  }

  /** Releases both sticks (e.g. when the window loses focus). */
  reset(): void {
    this.moveStick.end();
    this.aimStick.end();
  }

  dispose(): void {
    for (const off of this.listeners) off();
    this.listeners = [];
    this.layer.remove();
  }
}

async function toggleFullscreen(): Promise<void> {
  try {
    if (document.fullscreenElement) await document.exitFullscreen();
    else {
      await document.documentElement.requestFullscreen({ navigationUI: 'hide' });
      const o = screen.orientation as ScreenOrientation & { lock?: (o: string) => Promise<void> };
      await o.lock?.('landscape').catch(() => undefined);
    }
  } catch {
    /* not allowed (e.g. iOS Safari) — ignore */
  }
}
