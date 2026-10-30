import { GAME_VERSION, sanitizeName } from '@sms/shared';
import type { HighscoreStore } from '../../highscores/index.js';
import { storage } from '../../util/storage.js';
import { $, html } from '../dom.js';
import { createHighscorePanel } from '../highscoreTable.js';

export interface MenuActions {
  solo(name: string): void;
  host(name: string): void;
  join(name: string, code: string): void;
}

export interface MenuOptions {
  store: HighscoreStore;
  joinCode?: string;
  error?: string;
  serverStatus: Promise<string>;
  dedicated: boolean;
}

const NAME_KEY = 'sms.name';

export function createMenuScreen(actions: MenuActions, opts: MenuOptions): HTMLElement {
  const el = html(`<div class="screen menu">
    <div class="title">
      <h1>SPACE MARINE <span>SURVIVAL</span></h1>
      <p class="tagline">Hold the line. The swarm never stops. Survive as long as you can.</p>
    </div>
    <div class="cols">
      <div class="card play">
        <label>CALLSIGN<input id="name" maxlength="16" autocomplete="off" spellcheck="false" placeholder="Marine"></label>
        <button id="solo" class="primary">▶ SOLO DEPLOY</button>
        <div class="row">
          <button id="host">HOST SQUAD (CO-OP)</button>
        </div>
        <div class="row join">
          <input id="code" maxlength="8" placeholder="ROOM CODE" autocomplete="off" spellcheck="false">
          <button id="join">JOIN</button>
        </div>
        <div class="error" id="err"></div>
        <div class="help">
          <b>WASD</b> move · <b>Mouse</b> aim · <b>LMB / Space</b> fire · <b>1-5</b> / <b>Q E</b> / wheel switch weapon · <b>R</b> reload · <b>M</b> mute<br>
          Stand next to a downed squadmate to revive them. New weapons unlock over time; crates drop on the map.
        </div>
        <div class="muted small">v${GAME_VERSION} · <span id="status">checking highscore server…</span>${opts.dedicated ? ' · dedicated host mode' : ' · P2P (browser-hosted)'}</div>
      </div>
      <div class="card scores"><h2>HIGHSCORES</h2></div>
    </div>
  </div>`);
  const name = $<HTMLInputElement>(el, '#name');
  const code = $<HTMLInputElement>(el, '#code');
  const err = $(el, '#err');
  name.value = storage.get(NAME_KEY, '');
  if (opts.joinCode) code.value = opts.joinCode;
  if (opts.error) err.textContent = opts.error;
  $(el, '.scores').append(createHighscorePanel(opts.store));
  void opts.serverStatus.then((s) => ($(el, '#status').textContent = s));

  const getName = (): string | null => {
    const n = sanitizeName(name.value) || 'Marine';
    storage.set(NAME_KEY, n);
    return n;
  };
  const busy = (b: boolean) => el.querySelectorAll('button').forEach((x) => ((x as HTMLButtonElement).disabled = b));
  const run = (fn: () => void) => {
    err.textContent = '';
    busy(true);
    fn();
  };
  $(el, '#solo').addEventListener('click', () => run(() => actions.solo(getName()!)));
  $(el, '#host').addEventListener('click', () => run(() => actions.host(getName()!)));
  const doJoin = () => {
    if (!code.value.trim()) {
      err.textContent = 'Enter the room code your squad leader shared.';
      return;
    }
    run(() => actions.join(getName()!, code.value));
  };
  $(el, '#join').addEventListener('click', doJoin);
  code.addEventListener('keydown', (e) => e.key === 'Enter' && doJoin());
  queueMicrotask(() => (opts.joinCode ? $(el, '#join') : name).focus());
  return el;
}
