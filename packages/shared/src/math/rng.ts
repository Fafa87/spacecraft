/**
 * Small, fast, seedable PRNG (mulberry32). The whole simulation draws randomness
 * from the world's Rng so a run is reproducible from its seed + inputs.
 */
export class Rng {
  private state: number;

  constructor(seed: number) {
    this.state = seed >>> 0 || 0x9e3779b9;
  }

  /** Float in [0, 1). */
  next(): number {
    let t = (this.state = (this.state + 0x6d2b79f5) >>> 0);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  range(min: number, max: number): number {
    return min + (max - min) * this.next();
  }

  int(min: number, maxInclusive: number): number {
    return Math.floor(this.range(min, maxInclusive + 1));
  }

  chance(p: number): boolean {
    return this.next() < p;
  }

  pick<T>(items: readonly T[]): T {
    return items[Math.floor(this.next() * items.length)];
  }

  /** Picks a key from a weight map; returns undefined if all weights are <= 0. */
  weighted<K extends string>(weights: Partial<Record<K, number>>): K | undefined {
    let total = 0;
    for (const k in weights) total += Math.max(0, weights[k] ?? 0);
    if (total <= 0) return undefined;
    let r = this.next() * total;
    for (const k in weights) {
      r -= Math.max(0, weights[k] ?? 0);
      if (r < 0) return k;
    }
    return undefined;
  }

  getState(): number {
    return this.state;
  }

  setState(s: number): void {
    this.state = s >>> 0;
  }
}

export const randomSeed = (): number => (Math.random() * 0xffffffff) >>> 0;
