import { TICK_DT, type Snapshot } from '@sms/shared';

const TICK_MS = TICK_DT * 1000;

/**
 * Buffers snapshots and returns a pair to interpolate between at
 * `now - delay`. Server time is estimated from tick numbers with a smoothed
 * clock offset so jittery delivery doesn't cause stutter.
 */
export class SnapshotBuffer {
  private snaps: Snapshot[] = [];
  private offset: number | null = null;
  delayMs: number;
  private readonly baseDelayMs: number;

  constructor(delayMs = 2.5 * TICK_MS) {
    this.delayMs = this.baseDelayMs = delayMs;
  }

  get latest(): Snapshot | undefined {
    return this.snaps[this.snaps.length - 1];
  }

  clear(): void {
    this.snaps = [];
    this.offset = null;
  }

  push(s: Snapshot, nowMs: number): void {
    const last = this.latest;
    if (last && s.tick <= last.tick) return;
    // Multiplayer hosts send a snapshot every NET.snapshotEvery ticks: keep the render
    // delay at one snapshot interval + 1.5 ticks of jitter margin (solo: every tick).
    if (last) this.delayMs = Math.max(this.baseDelayMs, (s.tick - last.tick + 1.5) * TICK_MS);
    this.snaps.push(s);
    if (this.snaps.length > 40) this.snaps.shift();
    const target = s.tick * TICK_MS - nowMs;
    if (this.offset === null || Math.abs(target - this.offset) > 500) this.offset = target;
    // Snapshots arriving early pull the clock forward quickly; late ones drift it slowly.
    else this.offset += (target - this.offset) * (target > this.offset ? 0.2 : 0.02);
  }

  /** Returns the two snapshots bracketing render time and the blend factor. */
  sample(nowMs: number): { a: Snapshot; b: Snapshot; t: number } | null {
    if (!this.snaps.length || this.offset === null) return null;
    const renderTick = (nowMs + this.offset - this.delayMs) / TICK_MS;
    const s = this.snaps;
    if (renderTick <= s[0].tick) return { a: s[0], b: s[0], t: 0 };
    for (let i = s.length - 1; i > 0; i--) {
      if (s[i - 1].tick <= renderTick) {
        const a = s[i - 1];
        const b = s[i];
        if (renderTick >= b.tick) return { a: b, b, t: 0 };
        return { a, b, t: (renderTick - a.tick) / (b.tick - a.tick) };
      }
    }
    return { a: s[s.length - 1], b: s[s.length - 1], t: 0 };
  }

  /** Snapshots newer than `tick` (for firing events in order). */
  since(tick: number): Snapshot[] {
    return this.snaps.filter((s) => s.tick > tick);
  }
}

export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

export function lerpAngle(a: number, b: number, t: number): number {
  let d = b - a;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return a + d * t;
}
