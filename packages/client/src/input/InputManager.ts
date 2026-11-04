import { getInputKind, onInputKindChange, setInputKind } from './device.js';
import {
  mergeActions,
  type ActionIntent,
  type ContinuousIntent,
  type InputKind,
} from './InputSource.js';
import { isRotateBlocked, onRotateBlockedChange } from './orientation.js';
import { KeyboardMouseInput } from './KeyboardMouseInput.js';
import { TouchInput, type TouchInputOptions } from './TouchInput.js';

/**
 * Combines all input sources into one player intent. Movement/fire from any device; aim
 * from the active device (mouse cursor on PC, aim stick on touch), so keyboard+mouse
 * behaves exactly as before while touch can take over at any moment.
 */
export class InputManager {
  readonly kbm: KeyboardMouseInput;
  readonly touch: TouchInput;
  private offKind: () => void;
  private offRotate: () => void;

  constructor(canvas: HTMLCanvasElement, touchOpts: TouchInputOptions = {}) {
    this.kbm = new KeyboardMouseInput(canvas);
    this.touch = new TouchInput(document.body, touchOpts);
    this.kbm.onActivity = () => setInputKind('kbm');
    this.touch.onActivity = () => setInputKind('touch');
    this.offKind = onInputKindChange((k) => k === 'kbm' && this.touch.reset());
    // Portrait phone (rotate overlay up): drop held sticks and queued presses.
    this.offRotate = onRotateBlockedChange(() => {
      this.touch.reset();
      this.takeActions();
    });
  }

  get active(): InputKind {
    return getInputKind();
  }

  set onKey(fn: ((code: string) => void) | null) {
    this.kbm.onKey = fn;
  }

  read(): ContinuousIntent {
    if (isRotateBlocked()) return { move: { x: 0, y: 0 }, aim: null, fire: false, sprint: false };
    return combineIntents(this.active, this.kbm.read(), this.touch.read());
  }

  takeActions(): ActionIntent {
    return mergeActions([this.kbm.takeActions(), this.touch.takeActions()]);
  }

  dispose(): void {
    this.offKind();
    this.offRotate();
    this.kbm.dispose();
    this.touch.dispose();
  }
}

/** Pure merge rule (unit tested). */
export function combineIntents(
  active: InputKind,
  kbm: ContinuousIntent,
  touch: ContinuousIntent,
): ContinuousIntent {
  const touchMoving = touch.move.x !== 0 || touch.move.y !== 0;
  return {
    move: touchMoving ? touch.move : kbm.move,
    aim: active === 'touch' ? touch.aim : kbm.aim,
    fire: kbm.fire || touch.fire,
    sprint: kbm.sprint || touch.sprint,
  };
}
