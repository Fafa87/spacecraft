/**
 * Virtual joystick math (pure, DOM-free, unit tested).
 *
 * A floating stick: its origin is wherever the thumb lands; dragging beyond the
 * radius drags the origin along ("follow"), so the stick never gets stuck at the edge.
 */

export interface StickVector {
  /** Direction scaled by magnitude; (0,0) inside the deadzone. */
  x: number;
  y: number;
  /** 0..1 after deadzone rescaling. */
  mag: number;
  /** Raw angle of the thumb relative to the origin (radians, atan2 convention). */
  angle: number;
  /** True when past the deadzone. */
  active: boolean;
}

export const ZERO_STICK: StickVector = { x: 0, y: 0, mag: 0, angle: 0, active: false };

/**
 * Converts a thumb offset to a stick vector. Magnitude is clamped to 1 at `radius` and
 * rescaled so it ramps from 0 at the deadzone edge to 1 at full deflection.
 */
export function stickVector(dx: number, dy: number, radius: number, deadzone: number): StickVector {
  const dist = Math.hypot(dx, dy);
  if (dist === 0 || radius <= 0) return ZERO_STICK;
  const angle = Math.atan2(dy, dx);
  const raw = Math.min(1, dist / radius);
  if (raw <= deadzone) return { ...ZERO_STICK, angle };
  const mag = deadzone >= 1 ? 1 : (raw - deadzone) / (1 - deadzone);
  return { x: (dx / dist) * mag, y: (dy / dist) * mag, mag, angle, active: true };
}

export interface StickOptions {
  /** Full-deflection radius in CSS px. */
  radius: number;
  /** 0..1 fraction of the radius ignored around the origin. */
  deadzone: number;
  /** Drag the origin along when the thumb goes past the radius. */
  follow?: boolean;
  /**
   * Follow only past `outer` × radius (default 1): the band between the radius (full
   * deflection) and `outer` is an extra "overdrive" zone, read via `reach` (e.g. sprint).
   */
  outer?: number;
}

/** One floating stick bound to a single touch identifier. */
export class VirtualStick {
  touchId: number | null = null;
  originX = 0;
  originY = 0;
  thumbX = 0;
  thumbY = 0;

  constructor(readonly opts: StickOptions) {}

  get engaged(): boolean {
    return this.touchId !== null;
  }

  begin(id: number, x: number, y: number): void {
    this.touchId = id;
    this.originX = this.thumbX = x;
    this.originY = this.thumbY = y;
  }

  move(x: number, y: number): void {
    this.thumbX = x;
    this.thumbY = y;
    if (this.opts.follow === false) return;
    const dx = x - this.originX;
    const dy = y - this.originY;
    const d = Math.hypot(dx, dy);
    const lim = this.opts.radius * (this.opts.outer ?? 1);
    if (d > lim) {
      const k = (d - lim) / d;
      this.originX += dx * k;
      this.originY += dy * k;
    }
  }

  end(): void {
    this.touchId = null;
  }

  get vector(): StickVector {
    if (!this.engaged) return ZERO_STICK;
    return stickVector(
      this.thumbX - this.originX,
      this.thumbY - this.originY,
      this.opts.radius,
      this.opts.deadzone,
    );
  }

  /** Thumb distance from the origin in radii (0 when idle; up to `outer`). */
  get reach(): number {
    if (!this.engaged || this.opts.radius <= 0) return 0;
    return Math.hypot(this.thumbX - this.originX, this.thumbY - this.originY) / this.opts.radius;
  }

  /** Knob position for rendering (thumb clamped to the outer limit). */
  get knob(): { x: number; y: number } {
    const dx = this.thumbX - this.originX;
    const dy = this.thumbY - this.originY;
    const d = Math.hypot(dx, dy);
    const lim = this.opts.radius * (this.opts.outer ?? 1);
    const k = d > lim ? lim / d : 1;
    return { x: this.originX + dx * k, y: this.originY + dy * k };
  }
}
