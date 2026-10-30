import { ARENA } from '@sms/shared';

/** Follows a target with smoothing, aim look-ahead and screen shake. */
export class Camera {
  x = ARENA.width / 2;
  y = ARENA.height / 2;
  width = 0;
  height = 0;
  /** Device-independent zoom (world px -> CSS px). */
  zoom = 1;
  private shake = 0;
  shakeX = 0;
  shakeY = 0;

  resize(w: number, h: number): void {
    this.width = w;
    this.height = h;
    // Keep roughly the same visible world area across screen sizes.
    this.zoom = Math.max(0.6, Math.min(1.3, Math.sqrt((w * h) / (1500 * 900))));
  }

  addShake(amount: number): void {
    this.shake = Math.min(24, this.shake + amount);
  }

  follow(tx: number, ty: number, dt: number, snap = false): void {
    const k = snap ? 1 : 1 - Math.exp(-dt * 10);
    this.x += (tx - this.x) * k;
    this.y += (ty - this.y) * k;
    this.shake *= Math.exp(-dt * 9);
    this.shakeX = (Math.random() * 2 - 1) * this.shake;
    this.shakeY = (Math.random() * 2 - 1) * this.shake;
  }

  /** Screen (CSS px) -> world. */
  toWorld(sx: number, sy: number): { x: number; y: number } {
    return { x: (sx - this.width / 2) / this.zoom + this.x, y: (sy - this.height / 2) / this.zoom + this.y };
  }

  /** Visible world rect with margin. */
  view(margin = 0): { x0: number; y0: number; x1: number; y1: number } {
    const hw = this.width / 2 / this.zoom + margin;
    const hh = this.height / 2 / this.zoom + margin;
    return { x0: this.x - hw, y0: this.y - hh, x1: this.x + hw, y1: this.y + hh };
  }
}
