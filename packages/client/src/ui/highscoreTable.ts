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

export type Board = 'squads' | 'marines';

/** One selectable table: a board plus a team size (0 = ALL, marines only). */
export interface Category {
  board: Board;
  ts: number;
}

/** Every category the panel can show, in tab order (boards first, then sizes). */
export function allCategories(maxPlayers = MAX_PLAYERS): Category[] {
  const sizes = Array.from({ length: maxPlayers }, (_, i) => i + 1);
  return [
    ...sizes.map((ts) => ({ board: 'squads' as const, ts })),
    ...[0, ...sizes].map((ts) => ({ board: 'marines' as const, ts })),
  ];
}

export const categoryKey = (c: Category) => `${c.board}:${c.ts}`;

/**
 * Which tabs to show, from the fetched row counts (key = categoryKey): a board tab only when
 * one of its tables has rows, a size tab only when that board+size has rows. Nothing at all
 * when every table is empty (the panel then shows the normal "no runs yet" message).
 */
export function visibleTabs(
  counts: ReadonlyMap<string, number>,
  maxPlayers = MAX_PLAYERS,
): { boards: Board[]; sizes: Record<Board, number[]> } {
  const sizes: Record<Board, number[]> = { squads: [], marines: [] };
  for (const c of allCategories(maxPlayers))
    if ((counts.get(categoryKey(c)) ?? 0) > 0) sizes[c.board].push(c.ts);
  const boards = (['squads', 'marines'] as const).filter((b) => sizes[b].length > 0);
  return { boards, sizes };
}

/**
 * The category to open: the wanted one if it has rows, else the first non-empty size of the
 * same board, else the first non-empty category of any board; the wanted one when all are empty.
 */
export function pickCategory(
  want: Category,
  tabs: { boards: Board[]; sizes: Record<Board, number[]> },
): Category {
  if (tabs.sizes[want.board].includes(want.ts)) return want;
  const same = tabs.sizes[want.board][0];
  if (same !== undefined) return { board: want.board, ts: same };
  const b = tabs.boards[0];
  if (b) return { board: b, ts: tabs.sizes[b][0]! };
  return want;
}

type Rows = HighscoreEntry[] | PlayerScoreEntry[];
interface Fetched {
  entries: Rows;
  source: 'server' | 'local';
}

/**
 * Tabbed highscore widget. SQUADS: one table per team size (1..MAX_PLAYERS), ranked by
 * survival time. MARINES: the individual leaderboard by personal points, across all team
 * sizes (ALL) or per team size.
 *
 * All tables are fetched up front (in parallel) so board / size tabs without any results can
 * be left out entirely; tabs stay hidden while loading so empty ones never flash. Switching
 * tabs then renders from the fetched data.
 */
export function createHighscorePanel(
  store: HighscoreStore,
  opts: { teamSize?: number; highlightRunId?: string; limit?: number; board?: Board } = {},
): HTMLElement {
  const sizes = Array.from({ length: MAX_PLAYERS }, (_, i) => i + 1);
  const el = html(`<div class="highscores">
    <div class="tabs boards" hidden><button data-board="squads">SQUADS · SURVIVAL</button><button data-board="marines">MARINES · POINTS</button></div>
    <div class="tabs sizes" hidden><button data-ts="0" class="all">ALL</button>${sizes.map((n) => `<button data-ts="${n}" title="${n === 1 ? 'Solo' : `${n}-marine squads`}">${n === 1 ? 'SOLO' : n}</button>`).join('')}</div>
    <table><thead></thead><tbody></tbody></table>
    <div class="hs-source muted"></div>
  </div>`);
  const head = $(el, 'thead');
  const body = $(el, 'tbody');
  const source = $(el, '.hs-source');
  const boardRow = $(el, '.tabs.boards');
  const sizeRow = $(el, '.tabs.sizes');
  const limit = opts.limit ?? 10;
  let cur: Category = { board: opts.board ?? 'squads', ts: opts.teamSize ?? 1 };
  if (cur.board === 'squads' && cur.ts === 0) cur.ts = 1;
  let data = new Map<string, Fetched>();
  let tabs = visibleTabs(new Map());
  let token = 0;

  const setHead = (b: Board) => {
    head.innerHTML =
      b === 'squads'
        ? '<tr><th>#</th><th>SURVIVED</th><th>SQUAD</th><th>WAVE</th><th>DATE</th></tr>'
        : '<tr><th>#</th><th>MARINE</th><th class="num">POINTS</th><th class="num">KILLS</th><th class="num">SQUAD</th><th>DATE</th></tr>';
  };

  const render = () => {
    const { board: b, ts } = cur;
    boardRow.hidden = tabs.boards.length === 0;
    sizeRow.hidden = tabs.sizes[b].length === 0;
    el.querySelectorAll<HTMLButtonElement>('.boards button').forEach((x) => {
      x.hidden = !tabs.boards.includes(x.dataset.board as Board);
      x.classList.toggle('active', x.dataset.board === b);
    });
    el.querySelectorAll<HTMLButtonElement>('.sizes button').forEach((x) => {
      const n = Number(x.dataset.ts);
      x.hidden = !tabs.sizes[b].includes(n);
      x.classList.toggle('active', n === ts);
    });
    setHead(b);
    const res = data.get(categoryKey(cur)) ?? { entries: [], source: 'local' as const };
    body.innerHTML =
      b === 'squads'
        ? highscoreRows(res.entries as HighscoreEntry[], opts.highlightRunId, !store.localOnly)
        : playerRows(res.entries as PlayerScoreEntry[], opts.highlightRunId);
    const anyServer = [...data.values()].some((r) => r.source === 'server');
    source.textContent =
      res.source === 'server' || (tabs.boards.length === 0 && anyServer)
        ? 'Global leaderboard'
        : store.localOnly
          ? 'Local scores — saved in this browser'
          : 'Global leaderboard unreachable — showing scores saved in this browser';
  };

  const load = async () => {
    const mine = ++token;
    boardRow.hidden = true;
    sizeRow.hidden = true;
    setHead(cur.board);
    body.innerHTML = `<tr><td colspan="${cur.board === 'squads' ? 5 : 6}" class="muted center">Loading…</td></tr>`;
    source.textContent = '';
    const cats = allCategories();
    const results = await Promise.all(
      cats.map((c): Promise<Fetched> =>
        (c.board === 'squads' ? store.top(c.ts, limit) : store.topPlayers(c.ts, limit)).catch(
          () => ({ entries: [], source: 'local' as const }),
        ),
      ),
    );
    if (mine !== token) return;
    data = new Map(cats.map((c, i) => [categoryKey(c), results[i]!]));
    tabs = visibleTabs(new Map([...data].map(([k, r]) => [k, r.entries.length])));
    cur = pickCategory(cur, tabs);
    render();
  };

  const select = (want: Category) => {
    cur = pickCategory(want, tabs);
    render();
  };
  el.querySelectorAll<HTMLButtonElement>('.boards button').forEach((x) =>
    x.addEventListener('click', () =>
      select({
        board: x.dataset.board as Board,
        ts: x.dataset.board === cur.board ? cur.ts : cur.ts || 1,
      }),
    ),
  );
  el.querySelectorAll<HTMLButtonElement>('.sizes button').forEach((x) =>
    x.addEventListener('click', () => select({ board: cur.board, ts: Number(x.dataset.ts) })),
  );
  void load();
  (el as HTMLElement & { reload?: () => void }).reload = () => void load();
  return el;
}
