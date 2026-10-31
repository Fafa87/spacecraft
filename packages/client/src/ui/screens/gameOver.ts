import type {
  ChapterDef,
  ContentRegistry,
  EnemyDef,
  PlayerSummary,
  RunResult,
  SquadSummary,
} from '@sms/shared';
import { chapterBadgeSvg } from '../chapters.js';
import type { HighscoreStore } from '../../highscores/index.js';
import { $, html } from '../dom.js';
import { escapeHtml, formatTime } from '../format.js';
import { createHighscorePanel } from '../highscoreTable.js';

export interface GameOverActions {
  again(): void;
  menu(): void;
}

export interface SubmitInfo {
  status: 'pending' | 'server' | 'local' | 'failed';
  rank?: number;
}

export function createGameOverScreen(
  result: RunResult,
  summary: PlayerSummary[],
  opts: {
    store: HighscoreStore;
    canRestart: boolean;
    colors: Map<number, ChapterDef>;
    content?: ContentRegistry;
    /** Squad-wide kill totals from the host (absent from older hosts). */
    squad?: SquadSummary;
    /** Sprite key → small image URL for the kill tally (optional). */
    icon?: (spriteKey: string) => string | undefined;
  },
  actions: GameOverActions,
): { el: HTMLElement; setSubmit(s: SubmitInfo): void } {
  const el = html(`<div class="screen gameover">
    <div class="card">
      <h1 class="dead">THE LINE HAS FALLEN</h1>
      <div class="survived"><span class="muted">SURVIVED</span><div class="big">${formatTime(result.survivalMs)}</div>
        <div class="muted">wave ${result.wave} · ${result.kills} kills · ${result.teamSize}-marine squad</div></div>
      <div class="submit" id="submit">Submitting score…</div>
${breakdownTable(summary, opts)}
${killTally(summary, opts)}
      <div class="row">
        <button id="menu">MAIN MENU</button>
        ${opts.canRestart ? '<button id="again" class="primary">DEPLOY AGAIN</button>' : '<span class="muted">Waiting for squad leader…</span>'}
      </div>
    </div>
    <div class="card scores"><h2>LEADERBOARDS</h2><div id="hs"></div></div>
  </div>`);
  const hsHost = $(el, '#hs');
  const mountTable = () => {
    hsHost.innerHTML = '';
    hsHost.append(
      createHighscorePanel(opts.store, { teamSize: result.teamSize, highlightRunId: result.runId }),
    );
  };
  mountTable();
  $(el, '#menu').addEventListener('click', () => actions.menu());
  el.querySelector('#again')?.addEventListener('click', () => actions.again());
  const submit = $(el, '#submit');
  return {
    el,
    setSubmit(s) {
      submit.className = `submit ${s.status}`;
      submit.textContent =
        s.status === 'pending'
          ? 'Submitting score…'
          : s.status === 'server'
            ? `Score recorded on the global leaderboard${s.rank ? ` — rank #${s.rank}` : ''}`
            : s.status === 'local' && opts.store.localOnly
              ? `Saved to local scores${s.rank ? ` — local rank #${s.rank}` : ''}`
              : s.status === 'local'
                ? `Global leaderboard unreachable — saved locally${s.rank ? ` (local rank #${s.rank})` : ''}, will retry`
                : `Score was not accepted by the global leaderboard — kept in this browser's scores${s.rank ? ` (local rank #${s.rank})` : ''}.`;
      if (s.status !== 'pending') mountTable();
    },
  };
}

/**
 * Per-marine breakdown, best score first: points, kills, the enemy types behind them,
 * damage dealt and when the marine fell. The top scorer of a squad is marked MVP.
 */
export function breakdownTable(
  summary: PlayerSummary[],
  opts: { colors: Map<number, ChapterDef>; content?: ContentRegistry },
): string {
  const rows = [...summary].sort((a, b) => b.score - a.score || b.kills - a.kills);
  const total = rows.reduce((n, p) => n + p.score, 0);
  const enemyName = (id: string) => opts.content?.enemies.get(id)?.name ?? id;
  const kinds = (p: PlayerSummary) =>
    Object.entries(p.killsByType)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(([id, n]) => `${n}× ${escapeHtml(enemyName(id))}`)
      .join(' · ') || '—';
  const mvp = rows.length > 1 && rows[0].score > 0 ? rows[0].id : -1;
  return `<table class="summary"><thead><tr><th></th><th>MARINE</th><th class="num">SCORE</th><th class="num">KILLS</th><th class="num">DAMAGE</th><th class="num">FELL AT</th></tr></thead><tbody>
    ${rows
      .map((p) => {
        const ch = opts.colors.get(p.id);
        const share =
          total > 0 && rows.length > 1
            ? ` <span class="muted">${Math.round((p.score / total) * 100)}%</span>`
            : '';
        return `<tr${p.id === mvp ? ' class="mvp"' : ''}><td>${ch ? chapterBadgeSvg(ch, 18) : ''}</td><td>${escapeHtml(p.name)}${p.id === mvp ? ' <span class="tag mvp">MVP</span>' : ''}<div class="kinds">${kinds(p)}</div></td><td class="num score">${p.score}${share}</td><td class="num">${p.kills}</td><td class="num">${Math.round(p.damage)}</td><td class="num">${p.diedAtMs === null ? '—' : formatTime(p.diedAtMs)}</td></tr>`;
      })
      .join('')}
    ${rows.length > 1 ? `<tr class="total"><td></td><td>SQUAD</td><td class="num score">${total}</td><td class="num">${rows.reduce((n, p) => n + p.kills, 0)}</td><td class="num">${Math.round(rows.reduce((n, p) => n + p.damage, 0))}</td><td></td></tr>` : ''}
  </tbody></table>`;
}

export type EnemyRank = 'boss' | 'elite' | 'swarm';

/** Boss (content flag), elite (threat >= the director's eliteThreat) or swarm. */
export function enemyRank(def: EnemyDef, content?: ContentRegistry): EnemyRank {
  if (def.boss) return 'boss';
  return def.threat >= (content?.director.teamScaling.eliteThreat ?? 3) ? 'elite' : 'swarm';
}

export interface KillTallyRow {
  id: string;
  name: string;
  rank: EnemyRank;
  sprite?: string;
  /** Kills per marine, aligned with the summary order passed in. */
  perMarine: number[];
  /** Whole-squad kills (>= sum of perMarine; the rest are uncredited chain blasts). */
  total: number;
}

/**
 * Every enemy type of the content (plus any unknown id that was killed), bosses first, then
 * elites, then the swarm, each group by threat descending.
 */
export function killTallyRows(
  summary: PlayerSummary[],
  squad: SquadSummary | undefined,
  content?: ContentRegistry,
): KillTallyRow[] {
  const ids = new Set<string>(content ? [...content.enemies.keys()] : []);
  for (const p of summary) for (const id of Object.keys(p.killsByType)) ids.add(id);
  for (const id of Object.keys(squad?.killsByType ?? {})) ids.add(id);
  const order: Record<EnemyRank, number> = { boss: 0, elite: 1, swarm: 2 };
  return [...ids]
    .map((id) => {
      const def = content?.enemies.get(id);
      const perMarine = summary.map((p) => p.killsByType[id] ?? 0);
      const credited = perMarine.reduce((a, b) => a + b, 0);
      return {
        id,
        name: def?.name ?? id,
        rank: def ? enemyRank(def, content) : 'swarm',
        sprite: def?.sprite,
        perMarine,
        total: Math.max(credited, squad?.killsByType[id] ?? 0),
        threat: def?.threat ?? 0,
      };
    })
    .sort((a, b) => order[a.rank] - order[b.rank] || b.threat - a.threat)
    .map(({ threat: _t, ...r }) => r);
}

/**
 * The full list of purged xenos: every Tyranid type with the squad's kills (and each marine's
 * when there are several). Bosses and elites are tagged and listed first; untouched types dim.
 */
export function killTally(
  summary: PlayerSummary[],
  opts: {
    colors: Map<number, ChapterDef>;
    content?: ContentRegistry;
    squad?: SquadSummary;
    icon?: (spriteKey: string) => string | undefined;
  },
): string {
  const marines = [...summary].sort((a, b) => b.score - a.score || b.kills - a.kills);
  const rows = killTallyRows(marines, opts.squad, opts.content);
  const multi = marines.length > 1;
  const total = rows.reduce((n, r) => n + r.total, 0);
  const credited = rows.reduce((n, r) => n + r.perMarine.reduce((a, b) => a + b, 0), 0);
  const head = multi
    ? marines
        .map((p) => {
          const ch = opts.colors.get(p.id);
          return `<th class="num marine" title="${escapeHtml(p.name)}">${ch ? chapterBadgeSvg(ch, 16) : ''}<span>${escapeHtml(p.name)}</span></th>`;
        })
        .join('')
    : '';
  const body = rows
    .map((r) => {
      const img = r.sprite ? opts.icon?.(r.sprite) : undefined;
      const tag =
        r.rank === 'swarm' ? '' : ` <span class="tag ${r.rank}">${r.rank.toUpperCase()}</span>`;
      const cells = multi
        ? r.perMarine.map((n) => `<td class="num${n ? '' : ' zero'}">${n || '·'}</td>`).join('')
        : '';
      return `<tr class="${r.rank}${r.total ? '' : ' none'}"><td class="ico">${img ? `<img src="${img}" alt="">` : ''}</td><td class="xeno">${escapeHtml(r.name)}${tag}</td>${cells}<td class="num tot">${r.total}</td></tr>`;
    })
    .join('');
  const extra = total - credited;
  return `<div class="tally"><h2>XENOS PURGED <span class="muted">${total}</span></h2>
  <table class="kills"><thead><tr><th></th><th>TYRANID</th>${head}<th class="num">${multi ? 'SQUAD' : 'KILLS'}</th></tr></thead><tbody>${body}</tbody></table>${
    extra > 0
      ? `<div class="muted note">${extra} caught in Tyranid blasts — not credited to a marine.</div>`
      : ''
  }</div>`;
}
