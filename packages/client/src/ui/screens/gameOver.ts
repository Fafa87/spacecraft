import type { ChapterDef, PlayerSummary, RunResult } from '@sms/shared';
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
  opts: { store: HighscoreStore; canRestart: boolean; colors: Map<number, ChapterDef> },
  actions: GameOverActions,
): { el: HTMLElement; setSubmit(s: SubmitInfo): void } {
  const el = html(`<div class="screen gameover">
    <div class="card">
      <h1 class="dead">THE LINE HAS FALLEN</h1>
      <div class="survived"><span class="muted">SURVIVED</span><div class="big">${formatTime(result.survivalMs)}</div>
        <div class="muted">wave ${result.wave} · ${result.kills} kills · ${result.teamSize}-marine squad</div></div>
      <div class="submit" id="submit">Submitting score…</div>
      <table class="summary"><thead><tr><th></th><th>MARINE</th><th>KILLS</th><th>DAMAGE</th><th>FELL AT</th></tr></thead><tbody>
        ${summary
          .map(
            (p) =>
              `<tr><td>${(() => {
                const ch = opts.colors.get(p.id);
                return ch ? chapterBadgeSvg(ch, 18) : '';
              })()}</td><td>${escapeHtml(p.name)}</td><td class="num">${p.kills}</td><td class="num">${Math.round(p.damage)}</td><td class="num">${p.diedAtMs === null ? '—' : formatTime(p.diedAtMs)}</td></tr>`,
          )
          .join('')}
      </tbody></table>
      <div class="row">
        <button id="menu">MAIN MENU</button>
        ${opts.canRestart ? '<button id="again" class="primary">DEPLOY AGAIN</button>' : '<span class="muted">Waiting for squad leader…</span>'}
      </div>
    </div>
    <div class="card scores"><h2>${result.teamSize}-MARINE LEADERBOARD</h2><div id="hs"></div></div>
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
