import { recoilPushPx, weaponRecoil } from '@sms/shared';

/**
 * Client mirror of the host's aim recoil (Player.recoil, snapshot `rc`). Between snapshots it
 * recovers with the same exponential as the sim (data/recoil.ts), so the reticle, the drawn
 * marine and the host's shot aim agree: shot aim = input aim + recoil = drawn aim.
 */
export class RecoilMirror {
  private v = 0;
  private t = 0;
  private w = '';

  /** Authoritative value from a snapshot for our marine (0 when absent / not alive). */
  sync(rc: number | undefined, weapon: string, nowMs: number): void {
    this.v = rc ?? 0;
    this.t = nowMs;
    this.w = weapon;
  }

  reset(): void {
    this.v = 0;
  }

  /** Lateral offset (rad) now: the last authoritative value recovered for the elapsed time. */
  angle(nowMs: number): number {
    if (this.v === 0) return 0;
    const dt = Math.max(0, (nowMs - this.t) / 1000);
    return this.v * Math.exp(-weaponRecoil(this.w).recoveryPerS * dt);
  }

  /** Reticle push-out along the aim (px, display only). */
  push(nowMs: number): number {
    return recoilPushPx(weaponRecoil(this.w), this.angle(nowMs));
  }
}

/**
 * Where the reticle is drawn: the input point (mouse cursor / touch reticle) rotated around the
 * marine by the recoil offset and pushed out along the new aim. Same CSS-px space as the input.
 */
export function recoilReticle(
  input: { x: number; y: number },
  marine: { x: number; y: number },
  recoil: number,
  pushPx = 0,
): { x: number; y: number } {
  if (recoil === 0 && pushPx === 0) return { ...input };
  const dx = input.x - marine.x;
  const dy = input.y - marine.y;
  const d = Math.hypot(dx, dy);
  if (d < 1e-6) return { ...input };
  const a = Math.atan2(dy, dx) + recoil;
  const r = d + pushPx;
  return { x: marine.x + Math.cos(a) * r, y: marine.y + Math.sin(a) * r };
}
