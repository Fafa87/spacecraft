/**
 * Keyboard + mouse state. Discrete actions (slot switch, reload, cycle) are
 * latched until consumed so a quick tap between ticks is never lost.
 */
export class InputState {
  private keys = new Set<string>();
  mouseX = 0;
  mouseY = 0;
  mouseDown = false;
  private latchedSlot = 0;
  private latchedReload = false;
  private latchedCycle = 0;
  private listeners: Array<() => void> = [];
  /** Extra key handlers (e.g. M = mute, Tab = scoreboard). */
  onKey: ((code: string) => void) | null = null;

  constructor(private readonly canvas: HTMLCanvasElement) {
    const on = <K extends keyof WindowEventMap>(
      target: Window | HTMLElement,
      type: K,
      fn: (e: WindowEventMap[K]) => void,
    ) => {
      target.addEventListener(type, fn as EventListener);
      this.listeners.push(() => target.removeEventListener(type, fn as EventListener));
    };
    on(window, 'keydown', (e) => {
      if (isTyping(e)) return;
      this.keys.add(e.code);
      if (/^Digit[1-9]$/.test(e.code)) this.latchedSlot = Number(e.code.slice(5));
      if (e.code === 'KeyR') this.latchedReload = true;
      if (e.code === 'KeyQ') this.latchedCycle = -1;
      if (e.code === 'KeyE') this.latchedCycle = 1;
      if (e.code === 'Space' || e.code === 'Tab') e.preventDefault();
      if (!e.repeat) this.onKey?.(e.code);
    });
    on(window, 'keyup', (e) => this.keys.delete(e.code));
    on(window, 'blur', () => {
      this.keys.clear();
      this.mouseDown = false;
    });
    on(window, 'mousemove', (e) => {
      const r = canvas.getBoundingClientRect();
      this.mouseX = e.clientX - r.left;
      this.mouseY = e.clientY - r.top;
    });
    on(canvas, 'mousedown', (e) => {
      if (e.button === 0) this.mouseDown = true;
    });
    on(window, 'mouseup', (e) => {
      if (e.button === 0) this.mouseDown = false;
    });
    on(canvas, 'contextmenu', (e) => e.preventDefault());
    on(canvas, 'wheel', (e) => {
      this.latchedCycle = e.deltaY > 0 ? 1 : -1;
    });
  }

  down(code: string): boolean {
    return this.keys.has(code);
  }

  /** Movement vector from WASD / arrows. */
  move(): { mx: number; my: number } {
    const mx =
      (this.down('KeyD') || this.down('ArrowRight') ? 1 : 0) -
      (this.down('KeyA') || this.down('ArrowLeft') ? 1 : 0);
    const my =
      (this.down('KeyS') || this.down('ArrowDown') ? 1 : 0) -
      (this.down('KeyW') || this.down('ArrowUp') ? 1 : 0);
    return { mx, my };
  }

  fire(): boolean {
    return this.mouseDown || this.down('Space');
  }

  /** Returns (and clears) a latched weapon slot request, resolving wheel/Q/E cycling against owned slots. */
  consumeSlot(ownedSlots: number[], currentSlot: number): number {
    let slot = this.latchedSlot;
    if (!slot && this.latchedCycle && ownedSlots.length > 1) {
      const idx = ownedSlots.indexOf(currentSlot);
      slot = ownedSlots[(idx + this.latchedCycle + ownedSlots.length) % ownedSlots.length];
    }
    this.latchedSlot = 0;
    this.latchedCycle = 0;
    return slot;
  }

  consumeReload(): boolean {
    const r = this.latchedReload;
    this.latchedReload = false;
    return r;
  }

  dispose(): void {
    for (const off of this.listeners) off();
    this.listeners = [];
  }
}

const isTyping = (e: KeyboardEvent) => {
  const t = e.target as HTMLElement | null;
  return !!t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA');
};
