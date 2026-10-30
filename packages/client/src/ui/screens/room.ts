import { PLAYER_COLORS, type ClientSession, type LobbyInfo } from '@sms/shared';
import { escapeHtml } from '../format.js';
import { config } from '../../config.js';
import { buildJoinUrl } from '../../net/joinUrl.js';
import { renderQr } from '../qr.js';
import { $, html } from '../dom.js';

export interface RoomActions {
  leave(): void;
}

/** Pre-game lobby: room code + QR + share link, player list, owner starts the run. */
export function createRoomScreen(
  session: ClientSession,
  roomCode: string,
  mode: string,
  actions: RoomActions,
): { el: HTMLElement; dispose(): void } {
  const link = buildJoinUrl({
    origin: location.origin,
    base: import.meta.env.BASE_URL,
    code: roomCode,
    dedicated: mode === 'dedicated',
    api: config.apiFromUrl,
  });
  const el = html(`<div class="screen room">
    <div class="card">
      <h2>SQUAD ROOM</h2>
      <div class="share">
        <canvas id="qr" class="qr" width="200" height="200" aria-label="QR code to join this room"></canvas>
        <div class="share-info">
          <div class="code-box"><span class="muted">ROOM CODE</span><div class="code" id="code">${escapeHtml(roomCode)}</div></div>
          <p class="muted small">Scan with a phone camera to join, or share the code / link.</p>
          <div class="row"><input id="link" readonly value="${escapeHtml(link)}"><button id="copy">COPY LINK</button></div>
        </div>
      </div>
      <p class="muted small">Up to 4 marines. Each squad size has its own leaderboard.</p>
      <ul class="players" id="players"></ul>
      <div class="row">
        <button id="leave">LEAVE</button>
        <button id="start" class="primary">START MISSION</button>
      </div>
      <div class="muted small" id="hint"></div>
    </div>
  </div>`);
  const qr = $<HTMLCanvasElement>(el, '#qr');
  qr.dataset.url = link;
  void renderQr(qr, link, 200).catch((e) => {
    console.warn('[qr]', e);
    qr.remove();
  });
  const players = $(el, '#players');
  const start = $<HTMLButtonElement>(el, '#start');
  const hint = $(el, '#hint');
  const render = (l: LobbyInfo | null) => {
    if (!l) return;
    players.innerHTML = Array.from({ length: l.maxPlayers }, (_, i) => {
      const p = l.players[i];
      if (!p) return `<li class="empty">— open slot —</li>`;
      return `<li><span class="dot" style="background:${PLAYER_COLORS[p.colorIndex % 4]}"></span>${escapeHtml(p.name)}${p.id === l.ownerId ? ' <span class="tag">LEADER</span>' : ''}${p.id === session.playerId ? ' <span class="tag you">YOU</span>' : ''}</li>`;
    }).join('');
    const owner = session.isOwner;
    start.style.display = owner ? '' : 'none';
    start.disabled = l.phase === 'playing';
    hint.textContent = owner
      ? `Start when your squad is ready (${l.players.length}/${l.maxPlayers}).`
      : 'Waiting for the squad leader to start…';
  };
  render(session.lobby);
  const off = session.on('lobby', render);
  $(el, '#copy').addEventListener('click', () => {
    const input = $<HTMLInputElement>(el, '#link');
    const done = () => ($(el, '#copy').textContent = 'COPIED');
    input.select();
    if (navigator.clipboard?.writeText)
      void navigator.clipboard.writeText(link).then(done, () => done());
    else {
      // non-secure contexts (LAN dev over http) have no async clipboard
      try {
        document.execCommand('copy');
      } catch {
        /* ignore */
      }
      done();
    }
  });
  start.addEventListener('click', () => {
    start.disabled = true;
    session.requestStart();
  });
  $(el, '#leave').addEventListener('click', () => actions.leave());
  return { el, dispose: off };
}
