import type { ChapterDef, ContentRegistry, PlayerSummary, RunResult } from '@sms/shared';
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
  return `<table class="summary"><thead><tr><th></th><th>MARINE</th><th class="num">SCORE</th><th class="num">KILLS</th><th class="kinds">TOP KILLS</th><th class="num">DAMAGE</th><th class="num">FELL AT</th></tr></thead><tbody>
    ${rows
      .map((p) => {
        const ch = opts.colors.get(p.id);
        const share =
          total > 0 && rows.length > 1
            ? ` <span class="muted">${Math.round((p.score / total) * 100)}%</span>`
            : '';
        return `<tr${p.id === mvp ? ' class="mvp"' : ''}><td>${ch ? chapterBadgeSvg(ch, 18) : ''}</td><td>${escapeHtml(p.name)}${p.id === mvp ? ' <span class="tag mvp">MVP</span>' : ''}</td><td class="num score">${p.score}${share}</td><td class="num">${p.kills}</td><td class="kinds">${kinds(p)}</td><td class="num">${Math.round(p.damage)}</td><td class="num">${p.diedAtMs === null ? '—' : formatTime(p.diedAtMs)}</td></tr>`;
      })
      .join('')}
    ${rows.length > 1 ? `<tr class="total"><td></td><td>SQUAD</td><td class="num score">${total}</td><td class="num">${rows.reduce((n, p) => n + p.kills, 0)}</td><td></td><td class="num">${Math.round(rows.reduce((n, p) => n + p.damage, 0))}</td><td></td></tr>` : ''}
  </tbody></table>`;
}
