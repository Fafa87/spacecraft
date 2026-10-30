import { $, html } from './dom.js';

export interface LeaveDialogOptions {
  /** Solo / local play: the sim is paused while the dialog is open. */
  solo: boolean;
  /** This client hosts the squad (leaving ends the session for everyone). */
  host: boolean;
  onYes: () => void;
  onNo: () => void;
}

/**
 * "Leave the game?" confirmation (Escape, or the ⏸ touch button). Yes returns to the main
 * menu; No / Escape closes it. Plain DOM above the canvas.
 */
export function createLeaveDialog(o: LeaveDialogOptions): HTMLElement {
  const note = o.solo
    ? 'Game paused.'
    : o.host
      ? 'The battle continues for your squad while this is open. You are the host: leaving ends the session for everyone.'
      : 'The battle continues for your squad while this is open.';
  const el = html(`
    <div class="leave-dialog" role="dialog" aria-modal="true" aria-labelledby="leave-title">
      <div class="card">
        <h2 id="leave-title">ABANDON THE FIELD?</h2>
        <p>Leave the game and return to the main menu?</p>
        <p class="muted small" id="leave-note"></p>
        <div class="row">
          <button type="button" class="primary" id="leave-yes">YES, LEAVE</button>
          <button type="button" id="leave-no">NO, FIGHT ON</button>
        </div>
        <p class="muted small hint">Esc — close</p>
      </div>
    </div>`);
  $(el, '#leave-note').textContent = note;
  const stop = (e: Event) => e.stopPropagation();
  for (const t of ['mousedown', 'mouseup', 'touchstart', 'touchend', 'pointerdown'])
    el.addEventListener(t, stop);
  $(el, '#leave-yes').addEventListener('click', () => o.onYes());
  $(el, '#leave-no').addEventListener('click', () => o.onNo());
  el.addEventListener('click', (e) => {
    if (e.target === el) o.onNo();
  });
  return el;
}
