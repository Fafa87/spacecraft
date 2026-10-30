import { MAX_PLAYERS, type HighscoreEntry } from '@sms/shared';
import type { HighscoreStore } from '../highscores/index.js';
import { $, html } from './dom.js';
import { escapeHtml, formatDate, formatTime } from './format.js';

export function highscoreRows(
  entries: HighscoreEntry[],
  highlightRunId?: string,
  tagLocal = true,
): string {
  if (!entries.length)
    return `<tr><td colspan="5" class="muted center">No runs yet — be the first.</td></tr>`;
  return entries
    .map(
      (e, i) => `<tr class="${e.runId === highlightRunId ? 'hl' : ''}">
        <td class="rank">${i + 1}</td>
        <td class="time">${formatTime(e.survivalMs)}</td>
        <td class="names">${e.players.map(escapeHtml).join(', ')}</td>
        <td class="num">${e.wave}</td>
        <td class="date">${formatDate(e.endedAt)}${tagLocal && e.id.startsWith('local_') ? ' <span class="tag">local</span>' : ''}</td>
      </tr>`,
    )
    .join('');
}

/** Tabbed highscore widget: one table per team size (1..MAX_PLAYERS). */
export function createHighscorePanel(
  store: HighscoreStore,
  opts: { teamSize?: number; highlightRunId?: string; limit?: number } = {},
): HTMLElement {
  const el = html(`<div class="highscores">
    <div class="tabs">${Array.from({ length: MAX_PLAYERS }, (_, i) => `<button data-ts="${i + 1}">${i + 1} ${i ? 'MARINES' : 'MARINE'}</button>`).join('')}</div>
    <table><thead><tr><th>#</th><th>SURVIVED</th><th>SQUAD</th><th>WAVE</th><th>DATE</th></tr></thead><tbody></tbody></table>
    <div class="hs-source muted"></div>
  </div>`);
  const body = $(el, 'tbody');
  const source = $(el, '.hs-source');
  let current = opts.teamSize ?? 1;
  const load = async (ts: number) => {
    current = ts;
    el.querySelectorAll<HTMLButtonElement>('.tabs button').forEach((b) =>
      b.classList.toggle('active', Number(b.dataset.ts) === ts),
    );
    body.innerHTML = `<tr><td colspan="5" class="muted center">Loading…</td></tr>`;
    const res = await store.top(ts, opts.limit ?? 10);
    if (current !== ts) return;
    body.innerHTML = highscoreRows(res.entries, opts.highlightRunId, !store.localOnly);
    source.textContent =
      res.source === 'server'
        ? 'Global leaderboard'
        : store.localOnly
          ? 'Local scores — saved in this browser'
          : 'Global leaderboard unreachable — showing scores saved in this browser';
  };
  el.querySelectorAll<HTMLButtonElement>('.tabs button').forEach((b) =>
    b.addEventListener('click', () => void load(Number(b.dataset.ts))),
  );
  void load(current);
  (el as HTMLElement & { reload?: () => void }).reload = () => void load(current);
  return el;
}
