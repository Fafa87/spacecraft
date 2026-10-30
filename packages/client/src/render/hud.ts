import {
  ARENA,
  PLAYER,
  PLAYER_COLORS,
  type ContentRegistry,
  type PlayerSnap,
  type Snapshot,
} from '@sms/shared';
import type { NoticeKind } from '../game/fx.js';
import { formatTime } from '../ui/format.js';
import type { Assets } from './assets.js';

export interface Notice {
  text: string;
  kind: NoticeKind;
  /** Seconds remaining on screen. */
  ttl: number;
}

export interface HudState {
  snap: Snapshot;
  me: PlayerSnap | undefined;
  myPos: { x: number; y: number } | null;
  notices: Notice[];
  ping: number;
  fps: number;
  mouse: { x: number; y: number };
  roomCode: string;
  mode: string;
  muted: boolean;
  debug: string | null;
}

const NOTICE_COLORS: Record<NoticeKind, string> = {
  info: '#cfe3ff',
  good: '#7dffa0',
  bad: '#ff7070',
  warn: '#ffc04a',
};

/** Screen-space HUD drawn on the game canvas. */
export class Hud {
  constructor(
    private readonly assets: Assets,
    private readonly content: ContentRegistry,
  ) {}

  draw(ctx: CanvasRenderingContext2D, dpr: number, w: number, h: number, s: HudState): void {
    ctx.save();
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.textBaseline = 'alphabetic';
    this.timer(ctx, w, s);
    this.team(ctx, s);
    this.minimap(ctx, w, s);
    if (s.me) {
      this.health(ctx, h, s.me);
      this.weapons(ctx, w, h, s.me);
      this.stateBanner(ctx, w, h, s.me);
    }
    this.notices(ctx, w, s.notices);
    this.footer(ctx, w, h, s);
    if (s.me?.st === 'alive') this.crosshair(ctx, s);
    ctx.restore();
  }

  private panel(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number): void {
    ctx.fillStyle = 'rgba(8,12,18,0.62)';
    ctx.strokeStyle = 'rgba(120,170,220,0.25)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.roundRect(x, y, w, h, 6);
    ctx.fill();
    ctx.stroke();
  }

  private timer(ctx: CanvasRenderingContext2D, w: number, s: HudState): void {
    this.panel(ctx, w / 2 - 110, 10, 220, 62);
    ctx.textAlign = 'center';
    ctx.fillStyle = '#fff';
    ctx.font = '700 32px ui-monospace, Menlo, Consolas, monospace';
    ctx.fillText(formatTime(s.snap.time * 1000), w / 2, 46);
    ctx.font = '600 12px system-ui, sans-serif';
    ctx.fillStyle = '#9fc4ff';
    const kills = s.snap.players.reduce((a, p) => a + p.k, 0);
    ctx.fillText(
      `WAVE ${s.snap.wave}   ·   ${s.snap.enemies.length} HOSTILES   ·   ${kills} KILLS`,
      w / 2,
      64,
    );
  }

  private team(ctx: CanvasRenderingContext2D, s: HudState): void {
    const players = s.snap.players;
    if (players.length < 2) return;
    this.panel(ctx, 10, 10, 200, 14 + players.length * 26);
    ctx.textAlign = 'left';
    players.forEach((p, i) => {
      const y = 22 + i * 26;
      ctx.fillStyle = PLAYER_COLORS[p.c % 4];
      ctx.fillRect(20, y, 6, 18);
      ctx.font = '600 12px system-ui, sans-serif';
      ctx.fillStyle = p.st === 'dead' ? '#777' : '#eee';
      ctx.fillText(`${p.name}${p.id === s.me?.id ? ' (you)' : ''}`, 34, y + 10);
      const label = p.st === 'alive' ? '' : p.st === 'downed' ? `DOWN ${Math.ceil(p.bo)}s` : 'KIA';
      ctx.fillStyle = p.st === 'downed' ? '#ff7070' : '#888';
      ctx.textAlign = 'right';
      ctx.fillText(label || `${p.k}`, 200, y + 10);
      ctx.textAlign = 'left';
      ctx.fillStyle = 'rgba(255,255,255,0.12)';
      ctx.fillRect(34, y + 14, 160, 3);
      ctx.fillStyle = p.st === 'alive' ? '#5fe07a' : '#ff5050';
      ctx.fillRect(
        34,
        y + 14,
        p.st === 'alive' ? (160 * p.hp) / p.mhp : (160 * p.bo) / PLAYER.bleedOutTime,
        3,
      );
    });
  }

  private minimap(ctx: CanvasRenderingContext2D, w: number, s: HudState): void {
    const mw = 190;
    const mh = (mw * ARENA.height) / ARENA.width;
    const x0 = w - mw - 12;
    const y0 = 12;
    const k = mw / ARENA.width;
    this.panel(ctx, x0 - 4, y0 - 4, mw + 8, mh + 8);
    ctx.fillStyle = 'rgba(30,40,50,0.6)';
    ctx.fillRect(x0, y0, mw, mh);
    ctx.fillStyle = '#e05050';
    for (const e of s.snap.enemies) ctx.fillRect(x0 + e[2] * k - 1, y0 + e[3] * k - 1, 2, 2);
    for (const p of s.snap.pickups) {
      ctx.fillStyle = p.k === 'medkit' ? '#6fff8a' : '#ffd040';
      ctx.fillRect(x0 + p.x * k - 2.5, y0 + p.y * k - 2.5, 5, 5);
    }
    for (const p of s.snap.players) {
      if (p.st === 'dead') continue;
      const pos = p.id === s.me?.id && s.myPos ? s.myPos : p;
      ctx.fillStyle = PLAYER_COLORS[p.c % 4];
      ctx.beginPath();
      ctx.arc(x0 + pos.x * k, y0 + pos.y * k, p.id === s.me?.id ? 4 : 3, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  private health(ctx: CanvasRenderingContext2D, h: number, me: PlayerSnap): void {
    const x = 16;
    const y = h - 64;
    this.panel(ctx, x - 6, y - 22, 252, 58);
    ctx.textAlign = 'left';
    ctx.font = '600 11px system-ui, sans-serif';
    ctx.fillStyle = '#9fc4ff';
    ctx.fillText('ARMOUR INTEGRITY', x, y - 6);
    ctx.fillStyle = 'rgba(255,255,255,0.1)';
    ctx.fillRect(x, y, 240, 18);
    const frac = me.st === 'alive' ? Math.max(0, me.hp / me.mhp) : 0;
    ctx.fillStyle = frac > 0.5 ? '#5fe07a' : frac > 0.25 ? '#ffc04a' : '#ff4a4a';
    ctx.fillRect(x, y, 240 * frac, 18);
    ctx.font = '700 13px ui-monospace, monospace';
    ctx.fillStyle = '#fff';
    ctx.fillText(`${Math.max(0, me.hp)} / ${me.mhp}`, x + 6, y + 14);
    ctx.textAlign = 'right';
    ctx.fillStyle = '#ccc';
    ctx.fillText(`☠ ${me.k}`, x + 236, y + 14);
  }

  private weapons(ctx: CanvasRenderingContext2D, w: number, h: number, me: PlayerSnap): void {
    const order = this.content.weaponOrder;
    const cell = 86;
    const total = order.length * (cell + 6) - 6;
    let x = w / 2 - total / 2;
    const y = h - 78;
    for (const def of order) {
      const owned = me.ws.includes(def.id);
      const active = me.w === def.id;
      ctx.globalAlpha = owned ? 1 : 0.35;
      this.panel(ctx, x, y, cell, 64);
      if (active) {
        ctx.strokeStyle = '#ffc04a';
        ctx.lineWidth = 2;
        ctx.strokeRect(x + 1, y + 1, cell - 2, 62);
      }
      ctx.textAlign = 'left';
      ctx.font = '700 11px system-ui, sans-serif';
      ctx.fillStyle = active ? '#ffc04a' : '#9fc4ff';
      ctx.fillText(String(def.slot), x + 5, y + 13);
      if (!this.assets.draw(ctx, def.sprites.icon, 0, x + cell / 2, y + 30)) {
        ctx.fillStyle = '#ccc';
        ctx.fillRect(x + cell / 2 - 24, y + 26, 48, 8);
      }
      ctx.textAlign = 'center';
      ctx.font = '600 10px system-ui, sans-serif';
      ctx.fillStyle = '#ddd';
      ctx.fillText(
        owned
          ? def.name.toUpperCase()
          : def.unlockAtSec
            ? `UNLOCK ${formatTime(def.unlockAtSec * 1000)}`
            : 'CRATE ONLY',
        x + cell / 2,
        y + 56,
      );
      if (active) {
        // ammo / reload
        const by = y - 14;
        ctx.fillStyle = 'rgba(0,0,0,0.6)';
        ctx.fillRect(x, by, cell, 8);
        if (me.rl > 0) {
          ctx.fillStyle = '#ffc04a';
          ctx.fillRect(x, by, cell * (1 - me.rl / def.reloadTime), 8);
          ctx.font = '700 11px system-ui';
          ctx.fillText('RELOADING', x + cell / 2, by - 4);
        } else {
          ctx.fillStyle = me.ammo / def.magazine < 0.25 ? '#ff5050' : '#e8e8e8';
          ctx.fillRect(x, by, (cell * me.ammo) / def.magazine, 8);
          ctx.font = '700 12px ui-monospace, monospace';
          ctx.fillText(`${me.ammo}/${def.magazine}`, x + cell / 2, by - 4);
        }
      }
      ctx.globalAlpha = 1;
      x += cell + 6;
    }
  }

  private stateBanner(ctx: CanvasRenderingContext2D, w: number, h: number, me: PlayerSnap): void {
    if (me.st === 'alive') return;
    ctx.textAlign = 'center';
    ctx.font = '800 34px system-ui, sans-serif';
    ctx.fillStyle = me.st === 'downed' ? '#ff5a5a' : '#bbb';
    ctx.fillText(me.st === 'downed' ? 'YOU ARE DOWN' : 'KILLED IN ACTION', w / 2, h / 2 - 90);
    ctx.font = '600 16px system-ui, sans-serif';
    ctx.fillStyle = '#eee';
    ctx.fillText(
      me.st === 'downed'
        ? me.rv > 0
          ? `Being revived… ${Math.round(me.rv * 100)}%`
          : `Bleeding out in ${Math.ceil(me.bo)}s — a teammate must stand next to you`
        : 'Spectating your squad',
      w / 2,
      h / 2 - 62,
    );
  }

  private notices(ctx: CanvasRenderingContext2D, w: number, notices: Notice[]): void {
    ctx.textAlign = 'center';
    notices.slice(-5).forEach((n, i) => {
      ctx.globalAlpha = Math.min(1, n.ttl);
      ctx.font =
        n.kind === 'warn' ? '800 22px system-ui, sans-serif' : '700 16px system-ui, sans-serif';
      ctx.fillStyle = 'rgba(0,0,0,0.7)';
      ctx.fillText(n.text, w / 2 + 1, 111 + i * 26);
      ctx.fillStyle = NOTICE_COLORS[n.kind];
      ctx.fillText(n.text, w / 2, 110 + i * 26);
    });
    ctx.globalAlpha = 1;
  }

  private footer(ctx: CanvasRenderingContext2D, w: number, h: number, s: HudState): void {
    ctx.textAlign = 'right';
    ctx.font = '500 11px ui-monospace, monospace';
    ctx.fillStyle = 'rgba(200,220,255,0.6)';
    const room = s.mode === 'local' ? 'SOLO' : `ROOM ${s.roomCode}`;
    ctx.fillText(
      `${room} · ${s.mode.toUpperCase()} · ping ${Math.round(s.ping)}ms · ${Math.round(s.fps)} fps${s.muted ? ' · MUTED (M)' : ''}`,
      w - 12,
      h - 10,
    );
    if (s.debug) {
      ctx.textAlign = 'left';
      ctx.fillText(s.debug, 12, h - 96);
    }
  }

  private crosshair(ctx: CanvasRenderingContext2D, s: HudState): void {
    const { x, y } = s.mouse;
    ctx.strokeStyle = '#ffe9a8';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(x, y, 9, 0, Math.PI * 2);
    for (const [dx, dy] of [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
    ]) {
      ctx.moveTo(x + dx * 5, y + dy * 5);
      ctx.lineTo(x + dx * 14, y + dy * 14);
    }
    ctx.stroke();
  }
}
