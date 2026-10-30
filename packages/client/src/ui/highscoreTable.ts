import { MAX_PLAYERS, type HighscoreEntry, type PlayerScoreEntry } from '@sms/shared';
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

export function playerRows(entries: PlayerScoreEntry[], highlightRunId?: string): string {
  if (!entries.length)
    return `<tr><td colspan="6" class="muted center">No scores yet — be the first.</td></tr>`;
  return entries
    .map(
      (e, i) => `<tr class="${e.runId === highlightRunId ? 'hl' : ''}">
        <td class="rank">${i + 1}</td>
        <td class="names">${escapeHtml(e.name)}</td>
        <td class="num score">${e.score}</td>
        <td class="num">${e.kills}</td>
        <td class="num">${e.teamSize}</td>
        <td class="date">${formatDate(e.at)}${e.id.startsWith('local_') ? ' <span class="tag">local</span>' : ''}</td>
      </tr>`,
    )
    .join('');
}

type Board = 'squads' | 'marines';

/**
 * Tabbed highscore widget. SQUADS: one table per team size (1..MAX_PLAYERS), ranked by
 * survival time. MARINES: the individual leaderboard by personal points, across all team
 * sizes (ALL) or per team size.
 */
export function createHighscorePanel(
  store: HighscoreStore,
  opts: { teamSize?: number; highlightRunId?: string; limit?: number; board?: Board } = {},
): HTMLElement {
  const sizes = Array.from({ length: MAX_PLAYERS }, (_, i) => i + 1);
  const el = html(`<div class="highscores">
    <div class="tabs boards"><button data-board="squads">SQUADS · SURVIVAL</button><button data-board="marines">MARINES · POINTS</button></div>
    <div class="tabs sizes"><button data-ts="0" class="all">ALL</button>${sizes.map((n) => `<button data-ts="${n}" title="${n === 1 ? 'Solo' : `${n}-marine squads`}">${n === 1 ? 'SOLO' : n}</button>`).join('')}</div>
    <table><thead></thead><tbody></tbody></table>
    <div class="hs-source muted"></div>
  </div>`);
  const head = $(el, 'thead');
  const body = $(el, 'tbody');
  const source = $(el, '.hs-source');
  const allTab = $(el, '.sizes .all');
  let board: Board = opts.board ?? 'squads';
  let current = opts.teamSize ?? 1;
  let token = 0;
  const load = async (b: Board, ts: number) => {
    if (b === 'squads' && ts === 0) ts = opts.teamSize ?? 1;
    board = b;
    current = ts;
    const mine = ++token;
    allTab.hidden = b !== 'marines';
    el.querySelectorAll<HTMLButtonElement>('.boards button').forEach((x) =>
      x.classList.toggle('active', x.dataset.board === b),
    );
    el.querySelectorAll<HTMLButtonElement>('.sizes button').forEach((x) =>
      x.classList.toggle('active', Number(x.dataset.ts) === ts),
    );
    const cols = b === 'squads' ? 5 : 6;
    head.innerHTML =
      b === 'squads'
        ? '<tr><th>#</th><th>SURVIVED</th><th>SQUAD</th><th>WAVE</th><th>DATE</th></tr>'
        : '<tr><th>#</th><th>MARINE</th><th class="num">POINTS</th><th class="num">KILLS</th><th class="num">SQUAD</th><th>DATE</th></tr>';
    body.innerHTML = `<tr><td colspan="${cols}" class="muted center">Loading…</td></tr>`;
    const res =
      b === 'squads'
        ? await store.top(ts, opts.limit ?? 10)
        : await store.topPlayers(ts, opts.limit ?? 10);
    if (mine !== token) return;
    body.innerHTML =
      b === 'squads'
        ? highscoreRows(res.entries as HighscoreEntry[], opts.highlightRunId, !store.localOnly)
        : playerRows(res.entries as PlayerScoreEntry[], opts.highlightRunId);
    source.textContent =
      res.source === 'server'
        ? 'Global leaderboard'
        : store.localOnly
          ? 'Local scores — saved in this browser'
          : 'Global leaderboard unreachable — showing scores saved in this browser';
  };
  el.querySelectorAll<HTMLButtonElement>('.boards button').forEach((x) =>
    x.addEventListener('click', () => void load(x.dataset.board as Board, current)),
  );
  el.querySelectorAll<HTMLButtonElement>('.sizes button').forEach((x) =>
    x.addEventListener('click', () => void load(board, Number(x.dataset.ts))),
  );
  void load(board, current);
  (el as HTMLElement & { reload?: () => void }).reload = () => void load(board, current);
  return el;
}
