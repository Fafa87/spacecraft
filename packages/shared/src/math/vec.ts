export interface Vec2 {
  x: number;
  y: number;
}

export const clamp = (v: number, min: number, max: number): number =>
  v < min ? min : v > max ? max : v;

export const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;

export const dist2 = (ax: number, ay: number, bx: number, by: number): number => {
  const dx = bx - ax;
  const dy = by - ay;
  return dx * dx + dy * dy;
};

export const dist = (ax: number, ay: number, bx: number, by: number): number =>
  Math.sqrt(dist2(ax, ay, bx, by));

export const len = (x: number, y: number): number => Math.sqrt(x * x + y * y);

/** Normalizes (x, y); returns [0, 0] for zero-length input. */
export const normalize = (x: number, y: number): [number, number] => {
  const l = Math.sqrt(x * x + y * y);
  return l > 1e-9 ? [x / l, y / l] : [0, 0];
};

/** Shortest signed difference between two angles in radians. */
export const angleDiff = (a: number, b: number): number => {
  let d = (b - a) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d < -Math.PI) d += Math.PI * 2;
  return d;
};

export const lerpAngle = (a: number, b: number, t: number): number => a + angleDiff(a, b) * t;

/** Round to n decimals (used to shrink snapshots). */
export const round = (v: number, decimals = 1): number => {
  const f = 10 ** decimals;
  return Math.round(v * f) / f;
};
