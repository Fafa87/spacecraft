import { stepPlayerMovement, TICK_DT, type PlayerInput } from '@sms/shared';

/**
 * Client-side prediction for the local marine's movement. Inputs are applied
 * immediately with the same pure function the host uses; when a snapshot
 * arrives we rewind to the authoritative position and replay unacknowledged
 * inputs. A decaying visual offset hides small corrections.
 */
export class Predictor {
  pos = { x: 0, y: 0 };
  /** Position before the latest predicted tick (for sub-tick render blending). */
  prev = { x: 0, y: 0 };
  private pending: Array<{ input: PlayerInput; speed: number }> = [];
  private initialized = false;
  /** Visual error offset that decays to 0. */
  private errX = 0;
  private errY = 0;
  /** Largest correction seen recently (debug overlay). */
  lastCorrection = 0;

  get ready(): boolean {
    return this.initialized;
  }

  reset(): void {
    this.pending = [];
    this.initialized = false;
    this.errX = this.errY = 0;
  }

  /** Apply a freshly sent input locally. */
  applyLocal(input: PlayerInput, speed: number, canMove: boolean): void {
    if (!this.initialized) return;
    this.prev = { ...this.pos };
    this.pending.push({ input, speed: canMove ? speed : 0 });
    if (this.pending.length > 120) this.pending.shift();
    if (canMove) stepPlayerMovement(this.pos, input.mx, input.my, speed, TICK_DT);
  }

  /** Reconcile with the authoritative state for our player. */
  reconcile(serverX: number, serverY: number, ackSeq: number, canMove: boolean): void {
    if (!this.initialized) {
      this.pos = { x: serverX, y: serverY };
      this.prev = { ...this.pos };
      this.initialized = true;
      return;
    }
    const before = { ...this.pos };
    this.pending = this.pending.filter((p) => p.input.seq > ackSeq);
    const next = { x: serverX, y: serverY };
    if (canMove) for (const p of this.pending) stepPlayerMovement(next, p.input.mx, p.input.my, p.speed, TICK_DT);
    const dx = before.x - next.x;
    const dy = before.y - next.y;
    const err = Math.hypot(dx, dy);
    this.lastCorrection = err;
    if (err > 120) {
      // Teleport-sized error (e.g. revive / desync): snap.
      this.errX = this.errY = 0;
      this.prev = { ...next };
    } else {
      this.errX += dx;
      this.errY += dy;
      this.prev.x -= dx;
      this.prev.y -= dy;
    }
    this.pos = next;
  }

  /** Render position: blend prev->pos by sub-tick alpha plus the decaying error. */
  renderPos(alpha: number, dt: number): { x: number; y: number } {
    const k = Math.exp(-dt * 12);
    this.errX *= k;
    this.errY *= k;
    return {
      x: this.prev.x + (this.pos.x - this.prev.x) * alpha + this.errX,
      y: this.prev.y + (this.pos.y - this.prev.y) * alpha + this.errY,
    };
  }

  get pendingCount(): number {
    return this.pending.length;
  }
}
