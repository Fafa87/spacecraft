/**
 * Shelf bin-packer: sorts rects by height and fills rows left-to-right.
 * Good enough for a few hundred sprites; swap for MaxRects if the atlas grows.
 */
export interface PackInput {
  id: string;
  w: number;
  h: number;
}

export interface PackResult {
  width: number;
  height: number;
  rects: Map<string, { x: number; y: number; w: number; h: number }>;
}

const nextPow2 = (n: number): number => 2 ** Math.ceil(Math.log2(Math.max(1, n)));

export function packShelves(items: PackInput[], maxWidth = 1024, padding = 2): PackResult {
  const sorted = [...items].sort((a, b) => b.h - a.h || b.w - a.w || a.id.localeCompare(b.id));
  const rects = new Map<string, { x: number; y: number; w: number; h: number }>();
  let x = padding;
  let y = padding;
  let shelfH = 0;
  let usedW = 0;
  for (const it of sorted) {
    if (it.w + padding * 2 > maxWidth) throw new Error(`Sprite '${it.id}' (${it.w}px) wider than atlas (${maxWidth}px)`);
    if (x + it.w + padding > maxWidth) {
      x = padding;
      y += shelfH + padding;
      shelfH = 0;
    }
    rects.set(it.id, { x, y, w: it.w, h: it.h });
    x += it.w + padding;
    usedW = Math.max(usedW, x);
    shelfH = Math.max(shelfH, it.h);
  }
  return { width: nextPow2(usedW), height: nextPow2(y + shelfH + padding), rects };
}
