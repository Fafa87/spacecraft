/**
 * Uniform-grid spatial hash for broad-phase queries (enemy separation,
 * projectile hits). Rebuilt every tick; cheap for a few hundred entities.
 */
export class SpatialHash<T extends { x: number; y: number }> {
  private cells = new Map<number, T[]>();

  constructor(private readonly cellSize: number) {}

  private key(cx: number, cy: number): number {
    // Arena is bounded and small, so a simple packed key is fine.
    return (cx + 1024) * 4096 + (cy + 1024);
  }

  clear(): void {
    this.cells.clear();
  }

  insert(item: T): void {
    const k = this.key(Math.floor(item.x / this.cellSize), Math.floor(item.y / this.cellSize));
    let cell = this.cells.get(k);
    if (!cell) {
      cell = [];
      this.cells.set(k, cell);
    }
    cell.push(item);
  }

  /** Calls fn for every item whose cell overlaps the circle (x, y, r). Items may be outside r. */
  query(x: number, y: number, r: number, fn: (item: T) => void): void {
    const minX = Math.floor((x - r) / this.cellSize);
    const maxX = Math.floor((x + r) / this.cellSize);
    const minY = Math.floor((y - r) / this.cellSize);
    const maxY = Math.floor((y + r) / this.cellSize);
    for (let cx = minX; cx <= maxX; cx++) {
      for (let cy = minY; cy <= maxY; cy++) {
        const cell = this.cells.get(this.key(cx, cy));
        if (cell) for (const item of cell) fn(item);
      }
    }
  }
}
