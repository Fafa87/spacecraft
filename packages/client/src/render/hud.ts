import {
  PLAYER,
  ROLE_COLOR,
  ROLE_SHORT,
  weaponProfileLabel,
  weaponRolesLabel,
  MARINE_SPRINT,
  type ContentRegistry,
  type EnemyDef,
  type WeaponDef,
  type PlayerSnap,
  type Snapshot,
} from '@sms/shared';
import type { NoticeKind } from '../game/fx.js';
import { formatTime } from '../ui/format.js';
import type { StickView } from '../input/TouchInput.js';
import type { Assets } from './assets.js';
import { chapterUiColor } from './colors.js';

/** Gothic HUD palette: smoked umber panels, brass frames, parchment text. */
export const HUD = {
  panel: 'rgba(18,12,7,0.78)',
  brass: '#b08a3e',
  brassDark: '#5a4520',
  parchment: '#e8d9b0',
  dim: '#a8956a',
  gold: '#e0b850',
  red: '#c83228',
  heat: '#6fd0ff',
  serif: "Georgia, 'Times New Roman', 'Liberation Serif', serif",
  mono: 'ui-monospace, Menlo, Consolas, monospace',
} as const;
const F = (weight: number, px: number, mono = false) =>
  `${weight} ${px}px ${mono ? HUD.mono : HUD.serif}`;

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
  /** Crosshair in CSS px (mouse cursor, or projected aim on touch); null = hidden. */
  crosshair: { x: number; y: number } | null;
  /** Touch sticks when the touch layout is active; null = PC layout. */
  touch: StickView[] | null;
  /** Safe-area insets in CSS px (notches). */
  inset?: Insets;
  roomCode: string;
  mode: string;
  muted: boolean;
  debug: string | null;
  /** Camera centre (world px) + zoom (world px -> CSS px). */
  camera?: { x: number; y: number; zoom: number };
  /** Render clock, seconds (animations). */
  now?: number;
}

export interface Insets {
  top: number;
  right: number;
  bottom: number;
  left: number;
}

const NO_INSETS: Insets = { top: 0, right: 0, bottom: 0, left: 0 };

/** HUD scale: 1 on desktop; on touch, shrink to fit small phone screens. */
export function hudScale(w: number, h: number, touch: boolean): number {
  if (!touch) return 1;
  return Math.max(0.6, Math.min(1, w / 900, h / 520));
}

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** Where the DOM voice overlay may sit (CSS px); `align` = how its chips line up in it. */
export interface VoiceSlot {
  x: number;
  y: number;
  w: number;
  align: 'left' | 'center';
  compact: boolean;
}

/** Idle move-stick hint (centre, CSS px) — also where a thumb usually lands. */
export const MOVE_HINT = { x: 110, fromBottom: 100 };

/**
 * Compact phone layout: touch + short landscape viewport. The top-centre clock/score plates
 * move into a stacked block in the top-left corner (with the armour bar), which leaves the
 * top centre free for the voice overlay.
 */
export function compactTouch(cw: number, ch: number, touch: boolean): boolean {
  return touch && ch <= 500 && cw > ch;
}

export interface HudLayout {
  ui: number;
  compact: boolean;
  /** Compact only: the stacked top-left block (HUD units) and its rows. */
  block: (Rect & { armourY: number; heatY: number }) | null;
  team: { top: number; cols: 1 | 2; rowH: number; h: number } | null;
  /** Bottom of the left column in HUD units (last element drawn there). */
  leftBottom: number;
  voice: VoiceSlot;
}

const TEAM_W = 200;
const BLOCK_W = 252;

/**
 * Pure HUD layout of the left column + the voice-overlay slot (testable without a canvas).
 * HUD units = CSS px / ui, inside the safe area.
 */
export function hudLayout(
  cw: number,
  ch: number,
  touch: boolean,
  ins: Insets,
  o: { players: number; me: boolean; heat: boolean },
): HudLayout {
  const ui = hudScale(cw, ch, touch);
  const compact = compactTouch(cw, ch, touch);
  const w = (cw - ins.left - ins.right) / ui;
  const showTeam = o.players >= 2;
  let block: HudLayout['block'] = null;
  let teamTop: number;
  let cols: 1 | 2 = 1;
  let rowH = o.players > 4 ? 19 : 26;
  if (compact) {
    // clock row 10..50, wave row ..62, armour bar 66..80, optional heat row 84..96
    const armourY = 66;
    const heatY = 86;
    const bottom = !o.me ? 66 : o.heat ? 104 : 88;
    block = { x: 10, y: 10, w: BLOCK_W, h: bottom - 10, armourY, heatY };
    teamTop = bottom + 6;
    // a big squad goes to two columns so the column never reaches the move stick
    cols = o.players > 4 ? 2 : 1;
    rowH = 22;
  } else teamTop = touch ? (o.me ? 76 : 10) : 10;
  const rows = cols === 2 ? Math.ceil(o.players / 2) : o.players;
  const team = showTeam ? { top: teamTop, cols, rowH, h: 14 + rows * rowH } : null;
  const leftBottom = team ? team.top + team.h : block ? block.y + block.h : touch && o.me ? 68 : 0;
  let voice: VoiceSlot;
  if (compact) {
    // top centre, between the left block and the minimap (minimap panel: w-206 .. w-8)
    const x0 = 10 + BLOCK_W + 8;
    const x1 = w - 190 - 12 - 4 - 8;
    voice = {
      x: ins.left + x0 * ui,
      y: ins.top + 6,
      w: Math.max(0, (x1 - x0) * ui),
      align: 'center',
      compact: true,
    };
  } else {
    // under the team list / armour in the left column (desktop: armour is bottom-left)
    const y = (team ? leftBottom : touch && o.me ? 68 : 10) + 8;
    voice = {
      x: ins.left + 10 * ui,
      y: ins.top + y * ui,
      w: Math.min(420, Math.max(TEAM_W, w / 2 - 140)) * ui,
      align: 'left',
      compact: touch,
    };
  }
  return { ui, compact, block, team, leftBottom, voice };
}

interface SlotRect {
  slot: number;
  owned: boolean;
  x: number;
  y: number;
  w: number;
  h: number;
}

const NOTICE_COLORS: Record<NoticeKind, string> = {
  info: '#e8d9b0',
  good: '#9be07a',
  bad: '#ff6a50',
  warn: '#f0c050',
};

/** Screen-space HUD drawn on the game canvas. */
export class Hud {
  constructor(
    private readonly assets: Assets,
    private readonly content: ContentRegistry,
  ) {}

  /** Weapon slot rects in HUD units from the last frame (touch hit-testing). */
  private slotRects: SlotRect[] = [];
  /** Last frame's HUD scale + safe-area inset, to map CSS px into HUD units. */
  private lastUi = 1;
  private lastIns: Insets = NO_INSETS;
  /** Last frame's layout (debug / layout checks). */
  layout: HudLayout | null = null;
  private voiceKey = '';

  /**
   * Tell the DOM voice overlay (voice/VoiceOverlay.ts) where it may sit without covering the
   * HUD: CSS variables on <html>, written only when they change.
   */
  private publishVoiceSlot(v: VoiceSlot): void {
    const key = `${v.x.toFixed(1)}|${v.y.toFixed(1)}|${v.w.toFixed(1)}|${v.align}|${v.compact}`;
    if (key === this.voiceKey || typeof document === 'undefined') return;
    this.voiceKey = key;
    const st = document.documentElement.style;
    st.setProperty('--vx-x', `${v.x}px`);
    st.setProperty('--vx-y', `${v.y}px`);
    st.setProperty('--vx-w', `${v.w}px`);
    st.setProperty('--vx-tf', 'none');
    st.setProperty('--vx-jc', v.align === 'center' ? 'center' : 'flex-start');
    document.documentElement.toggleAttribute('data-vx-compact', v.compact);
  }

  /** Game over / left: the overlay goes back to its default spot (top centre). */
  dispose(): void {
    this.voiceKey = '';
    if (typeof document === 'undefined') return;
    const st = document.documentElement.style;
    for (const k of ['--vx-x', '--vx-y', '--vx-w', '--vx-tf', '--vx-jc']) st.removeProperty(k);
    document.documentElement.removeAttribute('data-vx-compact');
  }

  /** Returns the owned weapon slot under a CSS-px point, or 0. */
  slotAt(cx: number, cy: number): number {
    const x = (cx - this.lastIns.left) / this.lastUi;
    const y = (cy - this.lastIns.top) / this.lastUi;
    const pad = 6;
    const hit = this.slotRects.find(
      (r) => x >= r.x - pad && x <= r.x + r.w + pad && y >= r.y - pad && y <= r.y + r.h + pad,
    );
    return hit?.owned ? hit.slot : 0;
  }

  draw(ctx: CanvasRenderingContext2D, dpr: number, cw: number, ch: number, s: HudState): void {
    const touch = !!s.touch;
    const ui = hudScale(cw, ch, touch);
    const ins = s.inset ?? NO_INSETS;
    this.lastUi = ui;
    this.lastIns = ins;
    // Everything below works in "HUD units" = CSS px / ui, inside the safe area.
    const w = (cw - ins.left - ins.right) / ui;
    const h = (ch - ins.top - ins.bottom) / ui;
    ctx.save();
    ctx.setTransform(dpr * ui, 0, 0, dpr * ui, dpr * ins.left, dpr * ins.top);
    ctx.textBaseline = 'alphabetic';
    this.slotRects = [];
    const heat = !!s.me && s.me.st === 'alive' && !!this.content.weapons.get(s.me.w)?.heat;
    const L = hudLayout(cw, ch, touch, ins, {
      players: s.snap.players.length,
      me: !!s.me,
      heat,
    });
    this.layout = L;
    this.publishVoiceSlot(L.voice);
    if (L.block) this.compactBlock(ctx, L.block, s);
    else {
      this.timer(ctx, w, s);
      if (s.me) this.score(ctx, w, s.me);
    }
    this.minimap(ctx, w, s);
    if (L.block) {
      // armour bar lives inside the compact block
    } else if (touch) {
      if (s.me) this.health(ctx, 96, s.me);
    } else if (s.me) this.health(ctx, h, s.me);
    if (L.team) this.team(ctx, s, L.team.top, L.team.cols, L.team.rowH);
    if (s.me) {
      if (touch) this.weaponColumn(ctx, w, s.me);
      else this.weapons(ctx, w, h, s.me);
      this.stateBanner(ctx, w, h, s.me);
      if (s.me.br && s.me.st === 'alive') this.braced(ctx, w, touch ? h - 24 : h - 122, s.now ?? 0);
    }
    // compact: the clock left the top centre, the voice overlay (one row) sits there instead
    const boss = this.bossBar(ctx, w, s, L.compact ? 64 : 80);
    this.waveBanner(ctx, w, h, s);
    this.notices(ctx, w, s.notices, (boss ? 136 : 110) - (L.compact ? 6 : 0));
    this.footer(ctx, w, h, s);
    // convert slot rects to CSS px
    for (const r of this.slotRects) {
      r.x = r.x * ui + ins.left;
      r.y = r.y * ui + ins.top;
      r.w *= ui;
      r.h *= ui;
    }
    // sticks + crosshair are positioned in raw CSS px
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    if (s.touch) this.sticks(ctx, cw, ch, s.touch, s.me?.st === 'alive');
    if (s.me?.st === 'alive' && s.crosshair) this.crosshair(ctx, s.crosshair);
    ctx.restore();
  }

  /** Brass-framed smoked panel with rivets in the corners. */
  private panel(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number): void {
    ctx.fillStyle = HUD.panel;
    ctx.fillRect(x, y, w, h);
    ctx.strokeStyle = HUD.brassDark;
    ctx.lineWidth = 3;
    ctx.strokeRect(x + 1.5, y + 1.5, w - 3, h - 3);
    ctx.strokeStyle = HUD.brass;
    ctx.lineWidth = 1;
    ctx.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);
    ctx.strokeStyle = 'rgba(176,138,62,0.35)';
    ctx.strokeRect(x + 4.5, y + 4.5, w - 9, h - 9);
    ctx.fillStyle = HUD.brass;
    for (const [rx, ry] of [
      [x + 3, y + 3],
      [x + w - 3, y + 3],
      [x + 3, y + h - 3],
      [x + w - 3, y + h - 3],
    ])
      ctx.fillRect(rx - 1.5, ry - 1.5, 3, 3);
  }

  /** Bar with a dark well and brass edge. */
  private bar(
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    w: number,
    h: number,
    frac: number,
    color: string,
  ): void {
    ctx.fillStyle = 'rgba(0,0,0,0.55)';
    ctx.fillRect(x, y, w, h);
    ctx.fillStyle = color;
    ctx.fillRect(x, y, w * Math.max(0, Math.min(1, frac)), h);
    ctx.fillStyle = 'rgba(255,255,255,0.12)';
    ctx.fillRect(x, y, w * Math.max(0, Math.min(1, frac)), Math.max(1, h / 3));
    ctx.strokeStyle = HUD.brassDark;
    ctx.lineWidth = 1;
    ctx.strokeRect(x - 0.5, y - 0.5, w + 1, h + 1);
  }

  private chapterColor(c: number): string {
    return chapterUiColor(this.content.chapter(c));
  }

  /** Boss health bar under the timer; returns true when drawn. */
  private bossBar(ctx: CanvasRenderingContext2D, w: number, s: HudState, y: number): boolean {
    let def: EnemyDef | undefined;
    let hp = 0;
    let count = 0;
    for (const e of s.snap.enemies) {
      const d = this.content.enemies.get(this.content.enemyIds[e[1]] ?? '');
      if (!d?.boss) continue;
      count++;
      if (!def || e[5] > hp) {
        def = d;
        hp = e[5];
      }
    }
    if (!def) return false;
    const bw = 360;
    const x = w / 2 - bw / 2;
    this.panel(ctx, x - 8, y - 4, bw + 16, 34);
    ctx.textAlign = 'center';
    ctx.font = F(700, 12);
    ctx.fillStyle = HUD.parchment;
    ctx.fillText(`☠ ${def.name.toUpperCase()}${count > 1 ? ` ×${count}` : ''} ☠`, w / 2, y + 10);
    this.bar(ctx, x + 4, y + 15, bw - 8, 8, hp / 100, '#a01818');
    return true;
  }

  private timer(ctx: CanvasRenderingContext2D, w: number, s: HudState): void {
    this.panel(ctx, w / 2 - 125, 8, 250, 64);
    // own skull-and-wings emblem flanking the clock
    ctx.globalAlpha = 0.28;
    this.assets.draw(ctx, 'ui_emblem', 0, w / 2, 38, 0, 1.1);
    ctx.globalAlpha = 1;
    ctx.textAlign = 'center';
    ctx.fillStyle = HUD.parchment;
    ctx.font = F(700, 28, true);
    ctx.fillText(formatTime(s.snap.time * 1000), w / 2, 48);
    ctx.font = F(600, 11);
    ctx.fillStyle = HUD.gold;
    const kills = s.snap.players.reduce((a, p) => a + p.k, 0);
    const wv = s.snap.wv;
    const status = !wv
      ? `${s.snap.enemies.length} XENOS`
      : wv.a
        ? `${wv.r} REMAINING`
        : `NEXT IN ${Math.ceil(wv.nx ?? 0)}s`;
    ctx.fillStyle = wv?.h ? '#ff8a60' : HUD.gold;
    ctx.fillText(`WAVE ${s.snap.wave}  ✠  ${status}  ✠  ${kills} PURGED`, w / 2, 65);
  }

  /** Breather between waves: big "WAVE N CLEARED" plate with the countdown. */
  private waveBanner(ctx: CanvasRenderingContext2D, w: number, h: number, s: HudState): void {
    const wv = s.snap.wv;
    if (!wv || wv.a || s.snap.wave < 1) return;
    const y = h * 0.3;
    this.panel(ctx, w / 2 - 190, y - 34, 380, 64);
    ctx.textAlign = 'center';
    ctx.font = F(800, 24);
    ctx.fillStyle = HUD.gold;
    ctx.fillText(`✠ WAVE ${s.snap.wave} CLEARED ✠`, w / 2, y - 2);
    ctx.font = F(600, 13);
    ctx.fillStyle = HUD.parchment;
    ctx.fillText(
      `Wave ${s.snap.wave + 1} in ${Math.ceil(wv.nx ?? 0)}s — resupply, regroup`,
      w / 2,
      y + 20,
    );
  }

  private team(
    ctx: CanvasRenderingContext2D,
    s: HudState,
    top: number,
    cols: 1 | 2,
    rowH: number,
  ): void {
    const players = s.snap.players;
    if (players.length < 2) return;
    // Up to 4 marines get roomy rows; a 5..8 squad packs into compact rows (or 2 columns).
    const tight = rowH < 22 || cols === 2;
    const colW = cols === 2 ? BLOCK_W / 2 : TEAM_W;
    const badge = tight ? 0.42 : 0.55;
    const rows = cols === 2 ? Math.ceil(players.length / 2) : players.length;
    this.panel(ctx, 10, top, cols === 2 ? BLOCK_W : TEAM_W, 14 + rows * rowH);
    ctx.textAlign = 'left';
    players.forEach((p, i) => {
      const col = cols === 2 ? i % 2 : 0;
      const row = cols === 2 ? Math.floor(i / 2) : i;
      const x = col * colW;
      const y = top + (rowH < 22 ? 9 : rowH < 26 ? 10 : 12) + row * rowH;
      const right = x + colW - (cols === 2 ? 6 : 0);
      const barW = right - 6 - (x + 34);
      const ch = this.content.chapter(p.c);
      if (!this.assets.draw(ctx, `badge_${ch.id}`, 0, x + 23, y + (tight ? 7 : 9), 0, badge)) {
        ctx.fillStyle = this.chapterColor(p.c);
        ctx.fillRect(x + 20, y, 6, tight ? 14 : 18);
      }
      ctx.font = F(600, tight ? 11 : 12);
      ctx.fillStyle = p.st === 'dead' ? '#6a6050' : HUD.parchment;
      const you = p.id === s.me?.id ? (cols === 2 ? '*' : ' (you)') : '';
      const label = p.st === 'alive' ? '' : p.st === 'downed' ? `DOWN ${Math.ceil(p.bo)}s` : 'KIA';
      const name = `${p.name}${you}`;
      if (cols === 2) {
        // two narrow columns: name clipped, then the score / state underneath the bar
        ctx.save();
        ctx.beginPath();
        ctx.rect(x + 30, y - 10, colW - 34, 14);
        ctx.clip();
        ctx.fillText(name, x + 34, y + 9);
        ctx.restore();
      } else ctx.fillText(name, x + 34, y + (tight ? 9 : 10));
      ctx.fillStyle = p.st === 'downed' ? '#ff6a50' : HUD.dim;
      ctx.textAlign = 'right';
      if (!label) ctx.font = F(600, 10, true);
      if (cols === 2) {
        ctx.font = F(600, 9, true);
        ctx.fillText(label || `${p.sc ?? 0}`, right, y + 9);
      } else ctx.fillText(label || `${p.sc ?? 0} pts`, right, y + (tight ? 9 : 10));
      ctx.textAlign = 'left';
      this.bar(
        ctx,
        x + 34,
        y + (tight ? 12 : 14),
        cols === 2 ? barW : 160,
        tight ? 2 : 3,
        p.st === 'alive' ? p.hp / p.mhp : p.bo / PLAYER.bleedOutTime,
        p.st === 'alive' ? HUD.gold : HUD.red,
      );
    });
  }

  /**
   * Compact phone layout: clock + wave status + own score + armour (+ plasma heat) stacked in
   * the top-left corner (the emblem watermark behind the clock), instead of the top-centre
   * plates and the separate armour panel.
   */
  private compactBlock(
    ctx: CanvasRenderingContext2D,
    b: NonNullable<HudLayout['block']>,
    s: HudState,
  ): void {
    const { x, y, w } = b;
    const me = s.me;
    this.panel(ctx, x, y, w, b.h);
    ctx.globalAlpha = 0.22;
    this.assets.draw(ctx, 'ui_emblem', 0, x + w / 2, y + 26, 0, 0.75);
    ctx.globalAlpha = 1;
    ctx.textAlign = 'left';
    ctx.font = F(700, 24, true);
    ctx.fillStyle = HUD.parchment;
    ctx.fillText(formatTime(s.snap.time * 1000), x + 10, y + 32);
    if (me) {
      ctx.textAlign = 'right';
      ctx.font = F(700, 8);
      ctx.fillStyle = HUD.gold;
      ctx.fillText('SCORE', x + w - 10, y + 16);
      ctx.font = F(800, 18, true);
      ctx.fillStyle = '#fff2c8';
      ctx.fillText(String(me.sc ?? 0), x + w - 10, y + 34);
    }
    ctx.textAlign = 'left';
    ctx.font = F(600, 10);
    const kills = s.snap.players.reduce((a, p) => a + p.k, 0);
    const wv = s.snap.wv;
    const status = !wv
      ? `${s.snap.enemies.length} XENOS`
      : wv.a
        ? `${wv.r} LEFT`
        : `NEXT IN ${Math.ceil(wv.nx ?? 0)}s`;
    ctx.fillStyle = wv?.h ? '#ff8a60' : HUD.gold;
    ctx.fillText(`WAVE ${s.snap.wave}  ✠  ${status}  ✠  ${kills} PURGED`, x + 10, y + 49);
    if (!me) return;
    const ay = b.armourY;
    const frac = me.st === 'alive' ? Math.max(0, me.hp / me.mhp) : 0;
    this.bar(
      ctx,
      x + 6,
      ay,
      w - 12,
      14,
      frac,
      frac > 0.5 ? '#c9a040' : frac > 0.25 ? '#d07a28' : HUD.red,
    );
    ctx.font = F(700, 11, true);
    ctx.fillStyle = '#fff6e0';
    ctx.fillText(`${Math.max(0, me.hp)} / ${me.mhp}`, x + 12, ay + 11);
    ctx.textAlign = 'right';
    ctx.fillStyle = HUD.parchment;
    ctx.fillText(`☠ ${me.k}`, x + w - 12, ay + 11);
    const def = this.content.weapons.get(me.w);
    if (me.st === 'alive' && def?.heat) {
      const ht = me.ht ?? 0;
      const venting = !!me.vt;
      const hot = ht >= def.heat.superchargeAt;
      ctx.textAlign = 'left';
      ctx.font = F(700, 9);
      ctx.fillStyle = venting ? '#ff6a50' : hot ? '#bff0ff' : HUD.dim;
      ctx.fillText(venting ? 'VENTING' : hot ? 'SUPERCHARGED' : 'PLASMA HEAT', x + 8, b.heatY + 8);
      const bx = x + 110;
      const bw = w - 116;
      this.bar(ctx, bx, b.heatY + 1, bw, 8, ht, venting ? HUD.red : hot ? '#bff0ff' : HUD.heat);
      ctx.fillStyle = HUD.parchment;
      ctx.fillRect(bx + bw * def.heat.superchargeAt, b.heatY - 1, 1, 12);
    }
  }

  /** Own score: big, right of the clock (teammates' scores are small, in the team panel). */
  private score(ctx: CanvasRenderingContext2D, w: number, me: PlayerSnap): void {
    const x = w / 2 + 131;
    this.panel(ctx, x, 8, 110, 64);
    ctx.textAlign = 'center';
    ctx.font = F(700, 10);
    ctx.fillStyle = HUD.gold;
    ctx.fillText('YOUR SCORE', x + 55, 24);
    ctx.font = F(800, 26, true);
    ctx.fillStyle = '#fff2c8';
    ctx.fillText(String(me.sc ?? 0), x + 55, 54);
    ctx.font = F(600, 9);
    ctx.fillStyle = HUD.dim;
    ctx.fillText(`${me.k} KILLS`, x + 55, 66);
  }

  /** Heavy Bolter brace indicator. */
  private braced(ctx: CanvasRenderingContext2D, w: number, y: number, t: number): void {
    const text = '◆ BRACED · RATE OF FIRE UP ◆';
    ctx.textAlign = 'center';
    ctx.font = F(800, 14);
    const tw = ctx.measureText(text).width + 24;
    this.panel(ctx, w / 2 - tw / 2, y - 17, tw, 24);
    ctx.fillStyle = `rgba(255,${200 + Math.round(40 * Math.sin(t * 8))},110,1)`;
    ctx.fillText(text, w / 2, y);
  }

  private minimap(ctx: CanvasRenderingContext2D, w: number, s: HudState): void {
    const mw = 190;
    const mh = (mw * this.content.map.arena.height) / this.content.map.arena.width;
    const x0 = w - mw - 12;
    const y0 = 12;
    const k = mw / this.content.map.arena.width;
    this.panel(ctx, x0 - 4, y0 - 4, mw + 8, mh + 8);
    ctx.fillStyle = 'rgba(40,30,20,0.6)';
    ctx.fillRect(x0, y0, mw, mh);
    // spawn points are plain map features: same dim dot whether idle, telegraphing or active
    ctx.fillStyle = 'rgba(120,70,120,0.55)';
    for (const p of this.content.director.spawnPoints) {
      ctx.beginPath();
      ctx.arc(x0 + p.x * k, y0 + p.y * k, 2.5, 0, Math.PI * 2);
      ctx.fill();
    }
    // every xeno looks the same (no straggler highlight)
    ctx.fillStyle = '#c05ad0';
    for (const e of s.snap.enemies) ctx.fillRect(x0 + e[2] * k - 1, y0 + e[3] * k - 1, 2, 2);
    for (const p of s.snap.pickups) {
      ctx.fillStyle = p.k === 'medkit' ? '#9be07a' : HUD.gold;
      ctx.fillRect(x0 + p.x * k - 2.5, y0 + p.y * k - 2.5, 5, 5);
    }
    for (const p of s.snap.players) {
      if (p.st === 'dead') continue;
      const pos = p.id === s.me?.id && s.myPos ? s.myPos : p;
      ctx.fillStyle = this.chapterColor(p.c);
      ctx.beginPath();
      ctx.arc(x0 + pos.x * k, y0 + pos.y * k, p.id === s.me?.id ? 4 : 3, 0, Math.PI * 2);
      ctx.fill();
      if (p.id === s.me?.id) {
        ctx.strokeStyle = HUD.parchment;
        ctx.lineWidth = 1;
        ctx.stroke();
      }
    }
  }

  private health(ctx: CanvasRenderingContext2D, h: number, me: PlayerSnap): void {
    const def = this.content.weapons.get(me.w);
    const heat = !!def?.heat && me.st === 'alive';
    const x = 16;
    const y = h - 64 - (heat ? 22 : 0);
    this.panel(ctx, x - 6, y - 22, 252, 58 + (heat ? 22 : 0));
    ctx.textAlign = 'left';
    ctx.font = F(700, 11);
    ctx.fillStyle = HUD.gold;
    ctx.fillText('ARMOUR INTEGRITY', x + 2, y - 6);
    const frac = me.st === 'alive' ? Math.max(0, me.hp / me.mhp) : 0;
    this.bar(ctx, x, y, 240, 18, frac, frac > 0.5 ? '#c9a040' : frac > 0.25 ? '#d07a28' : HUD.red);
    ctx.font = F(700, 13, true);
    ctx.fillStyle = '#fff6e0';
    ctx.fillText(`${Math.max(0, me.hp)} / ${me.mhp}`, x + 6, y + 14);
    ctx.textAlign = 'right';
    ctx.fillStyle = HUD.parchment;
    ctx.fillText(`☠ ${me.k}`, x + 236, y + 14);
    if (heat && def?.heat) {
      const ht = me.ht ?? 0;
      const venting = !!me.vt;
      const hot = ht >= def.heat.superchargeAt;
      ctx.textAlign = 'left';
      ctx.font = F(700, 10);
      ctx.fillStyle = venting ? '#ff6a50' : hot ? '#bff0ff' : HUD.dim;
      ctx.fillText(
        venting ? 'VENTING — COILS CRITICAL' : hot ? 'SUPERCHARGED' : 'PLASMA HEAT',
        x + 2,
        y + 32,
      );
      this.bar(ctx, x + 120, y + 25, 120, 8, ht, venting ? HUD.red : hot ? '#bff0ff' : HUD.heat);
      // supercharge threshold tick
      ctx.fillStyle = HUD.parchment;
      ctx.fillRect(x + 120 + 120 * def.heat.superchargeAt, y + 23, 1, 12);
    }
  }

  /** Defining role of a weapon as a small coloured tag, right-aligned at (x, y). */
  private roleTag(
    ctx: CanvasRenderingContext2D,
    def: WeaponDef,
    x: number,
    y: number,
    size: number,
  ): void {
    const role = def.roles[0];
    if (!role) return;
    ctx.save();
    ctx.textAlign = 'right';
    ctx.font = F(800, size);
    ctx.fillStyle = ROLE_COLOR[role];
    ctx.fillText(ROLE_SHORT[role], x, y);
    ctx.restore();
  }

  private weapons(ctx: CanvasRenderingContext2D, w: number, h: number, me: PlayerSnap): void {
    const order = this.content.weaponOrder;
    const cell = order.length > 6 ? 80 : 86;
    const total = order.length * (cell + 6) - 6;
    let x = w / 2 - total / 2;
    const y = h - 78;
    const cur = this.content.weapons.get(me.w);
    if (cur && me.st === 'alive') {
      // Active weapon "tooltip": its 40k profile and every role tag.
      const label = `${cur.name.toUpperCase()}  ${weaponProfileLabel(cur)}  ·  ${weaponRolesLabel(cur)}`;
      ctx.font = F(700, 10);
      const tw = ctx.measureText(label).width;
      ctx.fillStyle = 'rgba(8,6,4,0.62)';
      ctx.fillRect(w / 2 - tw / 2 - 8, y - 46, tw + 16, 16);
      ctx.textAlign = 'center';
      ctx.fillStyle = ROLE_COLOR[cur.roles[0] ?? 'GENERALIST'];
      ctx.fillText(label, w / 2, y - 34);
    }
    for (const def of order) {
      const owned = me.ws.includes(def.id);
      const active = me.w === def.id;
      ctx.globalAlpha = owned ? 1 : 0.35;
      this.panel(ctx, x, y, cell, 64);
      if (active) {
        ctx.strokeStyle = HUD.gold;
        ctx.lineWidth = 2;
        ctx.strokeRect(x + 1, y + 1, cell - 2, 62);
      }
      ctx.textAlign = 'left';
      ctx.font = F(700, 11);
      ctx.fillStyle = active ? HUD.gold : HUD.dim;
      ctx.fillText(String(def.slot), x + 5, y + 13);
      this.roleTag(ctx, def, x + cell - 4, y + 12, 7.5);
      if (!this.assets.draw(ctx, def.sprites.icon, 0, x + cell / 2, y + 30)) {
        ctx.fillStyle = '#ccc';
        ctx.fillRect(x + cell / 2 - 24, y + 26, 48, 8);
      }
      ctx.textAlign = 'center';
      ctx.font = F(600, 9);
      ctx.fillStyle = HUD.parchment;
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
        if (me.vt) {
          ctx.fillStyle = HUD.red;
          ctx.fillRect(x, by, cell * (me.ht ?? 1), 8);
          ctx.font = F(700, 11);
          ctx.fillText('VENTING', x + cell / 2, by - 4);
        } else if (me.rl > 0) {
          ctx.fillStyle = HUD.gold;
          ctx.fillRect(x, by, cell * (1 - me.rl / def.reloadTime), 8);
          ctx.font = F(700, 11);
          ctx.fillText('RELOADING', x + cell / 2, by - 4);
        } else {
          ctx.fillStyle = me.ammo / def.magazine < 0.25 ? '#ff6a50' : HUD.parchment;
          ctx.fillRect(x, by, (cell * me.ammo) / def.magazine, 8);
          ctx.font = F(700, 12, true);
          ctx.fillText(`${me.ammo}/${def.magazine}`, x + cell / 2, by - 4);
        }
      }
      if (active) this.weaponLock(ctx, me, x, y, cell, 64);
      ctx.globalAlpha = 1;
      this.slotRects.push({ slot: def.slot, owned, x, y, w: cell, h: 64 });
      x += cell + 6;
    }
  }

  /**
   * Sprint weapon lock on the active slot: greyed out while sprinting ("SPRINT"), then a gold
   * fill rises over the MARINE_SPRINT.weaponReadyDelayS until the weapon is ready again.
   */
  private weaponLock(
    ctx: CanvasRenderingContext2D,
    me: PlayerSnap,
    x: number,
    y: number,
    cw: number,
    ch: number,
  ): void {
    const wd = me.wd ?? 0;
    if (!me.sp && wd <= 0) return;
    const ready = me.sp ? 0 : 1 - Math.min(1, wd / MARINE_SPRINT.weaponReadyDelayS);
    ctx.fillStyle = 'rgba(12,12,14,0.68)';
    ctx.fillRect(x + 2, y + 2, cw - 4, (ch - 4) * (1 - ready));
    ctx.fillStyle = 'rgba(232,196,106,0.85)';
    ctx.fillRect(x + 2, y + ch - 5, (cw - 4) * ready, 3);
    ctx.textAlign = 'center';
    ctx.font = F(700, 10);
    ctx.fillStyle = me.sp ? '#f2e3b0' : HUD.gold;
    ctx.fillText(me.sp ? 'SPRINT' : 'READY…', x + cw / 2, y + ch / 2 + 4);
  }

  /** Touch layout: big tappable weapon slots stacked under the minimap on the right. */
  private weaponColumn(ctx: CanvasRenderingContext2D, w: number, me: PlayerSnap): void {
    const order = this.content.weaponOrder;
    const cols = order.length > 5 ? 2 : 1;
    const rows = Math.ceil(order.length / cols);
    const cw = cols > 1 ? 84 : 92;
    const chh = 56;
    const y0 = 164;
    order.forEach((def, i) => {
      const col = cols > 1 ? i % cols : 0;
      const row = cols > 1 ? Math.floor(i / cols) : i;
      const x = w - 12 - (cols - col) * (cw + 6) + 6;
      const y = y0 + row * (chh + 6);
      void rows;
      const owned = me.ws.includes(def.id);
      const active = me.w === def.id;
      ctx.globalAlpha = owned ? 1 : 0.3;
      this.panel(ctx, x, y, cw, chh);
      if (active) {
        ctx.strokeStyle = HUD.gold;
        ctx.lineWidth = 2;
        ctx.strokeRect(x + 1, y + 1, cw - 2, chh - 2);
      }
      ctx.textAlign = 'left';
      ctx.font = F(700, 11);
      ctx.fillStyle = active ? HUD.gold : HUD.dim;
      ctx.fillText(String(def.slot), x + 5, y + 13);
      this.roleTag(ctx, def, x + cw - 4, y + 12, 7.5);
      if (!this.assets.draw(ctx, def.sprites.icon, 0, x + cw / 2, y + 24)) {
        ctx.fillStyle = '#ccc';
        ctx.fillRect(x + cw / 2 - 22, y + 20, 44, 8);
      }
      ctx.textAlign = 'center';
      if (active) {
        const by = y + chh - 10;
        ctx.fillStyle = 'rgba(0,0,0,0.6)';
        ctx.fillRect(x + 4, by, cw - 8, 5);
        const reloading = me.rl > 0;
        const venting = !!me.vt;
        const heat = def.heat ? (me.ht ?? 0) : -1;
        const frac = venting
          ? (me.ht ?? 1)
          : reloading
            ? 1 - me.rl / def.reloadTime
            : me.ammo / def.magazine;
        ctx.fillStyle = venting
          ? HUD.red
          : reloading
            ? HUD.gold
            : frac < 0.25
              ? '#ff6a50'
              : HUD.parchment;
        ctx.fillRect(x + 4, by, (cw - 8) * frac, 5);
        if (heat >= 0 && !venting) {
          ctx.fillStyle = HUD.heat;
          ctx.fillRect(x + 4, by + 6, (cw - 8) * heat, 3);
        }
        ctx.font = F(700, 11, true);
        ctx.fillStyle = HUD.parchment;
        ctx.fillText(
          venting ? 'VENT' : reloading ? 'RELOAD' : `${me.ammo}/${def.magazine}`,
          x + cw / 2,
          by - 3,
        );
      } else {
        ctx.font = F(600, 9);
        ctx.fillStyle = HUD.parchment;
        ctx.fillText(
          owned
            ? def.name.toUpperCase()
            : def.unlockAtSec
              ? `🔒 ${formatTime(def.unlockAtSec * 1000)}`
              : 'CRATE',
          x + cw / 2,
          y + chh - 6,
        );
      }
      if (active) this.weaponLock(ctx, me, x, y, cw, chh);
      ctx.globalAlpha = 1;
      this.slotRects.push({ slot: def.slot, owned, x, y, w: cw, h: chh });
    });
  }

  /** Floating stick bases/knobs (engaged) or faint hints where to put thumbs (idle). */
  private sticks(
    ctx: CanvasRenderingContext2D,
    w: number,
    h: number,
    sticks: StickView[],
    alive: boolean,
  ): void {
    if (!alive) return;
    for (const st of sticks) {
      const color = st.kind === 'move' ? '232,217,176' : '224,184,80';
      if (!st.engaged) {
        const hx = st.kind === 'move' ? 110 : w - 230;
        const hy = h - 100;
        ctx.strokeStyle = `rgba(${color},0.22)`;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(hx, hy, st.radius, 0, Math.PI * 2);
        ctx.stroke();
        ctx.textAlign = 'center';
        ctx.font = F(600, 11);
        ctx.fillStyle = `rgba(${color},0.5)`;
        ctx.fillText(st.kind === 'move' ? 'MOVE' : 'AIM · FIRE', hx, hy + 4);
        if (st.sprintRing) this.sprintRing(ctx, hx, hy, st.sprintRing, false, true);
        continue;
      }
      if (st.sprintRing)
        this.sprintRing(ctx, st.origin.x, st.origin.y, st.sprintRing, !!st.sprintLit, false);
      ctx.fillStyle = `rgba(${color},0.12)`;
      ctx.strokeStyle = `rgba(${color},0.5)`;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(st.origin.x, st.origin.y, st.radius, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = `rgba(${color},${st.active ? 0.75 : 0.4})`;
      ctx.beginPath();
      ctx.arc(st.knob.x, st.knob.y, st.radius * 0.45, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  /** Move stick's outer "sprint zone": push the thumb out here to sprint (lit while sprinting). */
  private sprintRing(
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    r: number,
    lit: boolean,
    hint: boolean,
  ): void {
    ctx.save();
    ctx.setLineDash(lit ? [] : [6, 6]);
    ctx.lineWidth = lit ? 5 : 2;
    ctx.strokeStyle = lit
      ? 'rgba(255,192,74,0.9)'
      : hint
        ? 'rgba(232,217,176,0.14)'
        : 'rgba(255,192,74,0.38)';
    if (lit) {
      ctx.shadowColor = 'rgba(255,170,40,0.8)';
      ctx.shadowBlur = 12;
    }
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.stroke();
    ctx.shadowBlur = 0;
    ctx.setLineDash([]);
    ctx.textAlign = 'center';
    ctx.font = F(700, 9);
    ctx.fillStyle = lit ? 'rgba(255,214,130,0.95)' : `rgba(232,217,176,${hint ? 0.3 : 0.55})`;
    ctx.fillText(lit ? '» SPRINT «' : '» SPRINT', x, y - r - 5);
    ctx.restore();
  }

  private stateBanner(ctx: CanvasRenderingContext2D, w: number, h: number, me: PlayerSnap): void {
    if (me.st === 'alive') return;
    ctx.textAlign = 'center';
    ctx.font = F(800, 34);
    ctx.fillStyle = me.st === 'downed' ? '#e04a30' : HUD.dim;
    ctx.fillText(
      me.st === 'downed' ? 'BATTLE-BROTHER DOWN' : 'FALLEN IN SERVICE',
      w / 2,
      h / 2 - 90,
    );
    ctx.font = F(600, 16);
    ctx.fillStyle = HUD.parchment;
    ctx.fillText(
      me.st === 'downed'
        ? me.rv > 0
          ? `Being revived… ${Math.round(me.rv * 100)}%`
          : `Bleeding out in ${Math.ceil(me.bo)}s — a battle-brother must stand next to you`
        : 'Your squad fights on. Spectating…',
      w / 2,
      h / 2 - 62,
    );
  }

  private notices(ctx: CanvasRenderingContext2D, w: number, notices: Notice[], top: number): void {
    ctx.textAlign = 'center';
    notices.slice(-5).forEach((n, i) => {
      ctx.globalAlpha = Math.min(1, n.ttl);
      ctx.font = n.kind === 'warn' ? F(800, 22) : F(700, 16);
      ctx.fillStyle = 'rgba(0,0,0,0.75)';
      ctx.fillText(n.text, w / 2 + 1, top + 1 + i * 26);
      ctx.fillStyle = NOTICE_COLORS[n.kind];
      ctx.fillText(n.text, w / 2, top + i * 26);
    });
    ctx.globalAlpha = 1;
  }

  private footer(ctx: CanvasRenderingContext2D, w: number, h: number, s: HudState): void {
    ctx.textAlign = 'right';
    ctx.font = F(500, 11, true);
    ctx.fillStyle = 'rgba(232,217,176,0.55)';
    const room = s.mode === 'local' ? 'SOLO' : `ROOM ${s.roomCode}`;
    ctx.fillText(
      `${room} · ${s.mode.toUpperCase()} · ping ${Math.round(s.ping)}ms · ${Math.round(s.fps)} fps${s.muted ? (s.touch ? ' · MUTED' : ' · MUTED (M)') : ''}`,
      w - 12,
      h - 10,
    );
    if (s.debug) {
      ctx.textAlign = 'left';
      ctx.fillText(s.debug, 12, h - 96);
    }
  }

  private crosshair(ctx: CanvasRenderingContext2D, pos: { x: number; y: number }): void {
    const { x, y } = pos;
    ctx.strokeStyle = 'rgba(0,0,0,0.6)';
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.arc(x, y, 9, 0, Math.PI * 2);
    ctx.stroke();
    ctx.strokeStyle = '#f0d890';
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
