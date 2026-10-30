import { sanitizeName } from '@sms/shared';
import { storage } from '../../util/storage.js';
import { escapeHtml } from '../format.js';
import { $, html } from '../dom.js';

export interface JoinActions {
  join(name: string): void;
  menu(): void;
}

const NAME_KEY = 'sms.name';

/** Shown when the game is opened from a join link / QR: just a callsign and a big JOIN button. */
export function createJoinScreen(code: string, actions: JoinActions, error?: string): HTMLElement {
  const el = html(`<div class="screen join-screen">
    <div class="card">
      <h2>JOIN SQUAD</h2>
      <div class="code-box"><span class="muted">ROOM CODE</span><div class="code">${escapeHtml(code)}</div></div>
      <label>CALLSIGN<input id="name" maxlength="16" autocomplete="nickname" spellcheck="false" placeholder="Marine" enterkeyhint="go"></label>
      <button id="go" class="primary wide">▶ JOIN SQUAD</button>
      <div class="error" id="err">${error ? escapeHtml(error) : ''}</div>
      <button id="menu" class="link">Main menu</button>
    </div>
  </div>`);
  const name = $<HTMLInputElement>(el, '#name');
  name.value = storage.get(NAME_KEY, '');
  const go = $<HTMLButtonElement>(el, '#go');
  const submit = () => {
    const n = sanitizeName(name.value) || 'Marine';
    storage.set(NAME_KEY, n);
    $(el, '#err').textContent = '';
    go.disabled = true;
    go.textContent = 'CONNECTING…';
    actions.join(n);
  };
  go.addEventListener('click', submit);
  name.addEventListener('keydown', (e) => e.key === 'Enter' && submit());
  $(el, '#menu').addEventListener('click', () => actions.menu());
  // Desktop: focus the name; touch: don't pop the keyboard over the button.
  queueMicrotask(() => !matchMedia('(pointer: coarse)').matches && name.focus());
  return el;
}
