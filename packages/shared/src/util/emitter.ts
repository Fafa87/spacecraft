/** Minimal typed event emitter (works in browser & Node). */
export class Emitter<Events extends Record<string, unknown>> {
  private handlers: { [K in keyof Events]?: Array<(payload: Events[K]) => void> } = {};

  on<K extends keyof Events>(event: K, fn: (payload: Events[K]) => void): () => void {
    (this.handlers[event] ??= []).push(fn);
    return () => this.off(event, fn);
  }

  /** Like `on`, but removes itself after the first call. */
  once<K extends keyof Events>(event: K, fn: (payload: Events[K]) => void): () => void {
    const off = this.on(event, (payload) => {
      off();
      fn(payload);
    });
    return off;
  }

  off<K extends keyof Events>(event: K, fn: (payload: Events[K]) => void): void {
    this.handlers[event] = this.handlers[event]?.filter((h) => h !== fn);
  }

  emit<K extends keyof Events>(event: K, payload: Events[K]): void {
    for (const h of this.handlers[event] ?? []) h(payload);
  }

  clear(): void {
    this.handlers = {};
  }
}
