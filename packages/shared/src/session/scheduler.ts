/** Abstracts time so sessions can run in browsers, Node, workers or tests. */
export interface Scheduler {
  now(): number;
  /** Calls fn roughly every `ms`; returns a cancel function. */
  every(ms: number, fn: () => void): () => void;
}

export const realScheduler: Scheduler = {
  now: () => performance.now(),
  every(ms, fn) {
    const h = setInterval(fn, ms);
    return () => clearInterval(h);
  },
};

/** Manually-driven scheduler for tests. */
export class ManualScheduler implements Scheduler {
  time = 0;
  private tasks: Array<{ ms: number; fn: () => void; next: number; id: number }> = [];
  private ids = 0;

  now(): number {
    return this.time;
  }

  every(ms: number, fn: () => void): () => void {
    const id = ++this.ids;
    this.tasks.push({ ms, fn, next: this.time + ms, id });
    return () => {
      this.tasks = this.tasks.filter((t) => t.id !== id);
    };
  }

  advance(ms: number): void {
    const end = this.time + ms;
    while (true) {
      const due = this.tasks.filter((t) => t.next <= end).sort((a, b) => a.next - b.next)[0];
      if (!due) break;
      this.time = due.next;
      due.next += due.ms;
      due.fn();
    }
    this.time = end;
  }
}
