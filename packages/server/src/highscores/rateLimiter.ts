/** Tiny fixed-window per-key rate limiter (in-memory; use Redis etc. when scaling out). */
export class RateLimiter {
  private hits = new Map<string, { windowStart: number; count: number }>();

  constructor(
    private readonly limit: number,
    private readonly windowMs = 60_000,
    private readonly now: () => number = Date.now,
  ) {}

  /** Returns true if the action is allowed. */
  take(key: string): boolean {
    if (this.limit <= 0) return true;
    const t = this.now();
    const h = this.hits.get(key);
    if (!h || t - h.windowStart >= this.windowMs) {
      this.hits.set(key, { windowStart: t, count: 1 });
      if (this.hits.size > 10_000) this.prune(t);
      return true;
    }
    h.count++;
    return h.count <= this.limit;
  }

  private prune(t: number): void {
    for (const [k, v] of this.hits) if (t - v.windowStart >= this.windowMs) this.hits.delete(k);
  }
}
