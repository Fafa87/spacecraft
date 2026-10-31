import {
  Emitter,
  marineMoveSpeed,
  playerMoveSpeed,
  stepFireSlow,
  TICK_DT,
  type ContentRegistry,
  type PlayerSnap,
  type PlayerSummary,
  type SquadSummary,
  type RunResult,
  type Snapshot,
} from '@sms/shared';
import type { AudioEngine } from '../audio/AudioEngine.js';
import { config } from '../config.js';
import type { GameConnection } from '../net/connection.js';
import type { Assets } from '../render/assets.js';
import { InputManager, resolveSlot } from '../input/index.js';
import { Hud, type Insets, type Notice } from '../render/hud.js';
import { Renderer } from '../render/Renderer.js';
import { EnemyAudio } from './enemyAudio.js';
import { isImmediate, playEvent, type FxContext, type NoticeKind } from './fx.js';
import { SnapshotBuffer } from './interpolation.js';
import { Predictor } from './prediction.js';
import { createLeaveDialog } from '../ui/leaveDialog.js';
import { isRotateBlocked, onRotateBlockedChange } from '../input/orientation.js';

export type GameClientEvents = {
  over: { result: RunResult; summary: PlayerSummary[]; squad?: SquadSummary };
  /** The player confirmed "leave the game" in the Escape / ⏸ dialog. */
  leave: undefined;
};

/**
 * Runs one game on the client: samples input at the tick rate, predicts the
 * local marine, interpolates everything else and renders world + HUD.
 */
export class GameClient extends Emitter<GameClientEvents> {
  readonly renderer: Renderer;
  private readonly hud: Hud;
  private readonly input: InputManager;
  private readonly enemyAudio: EnemyAudio;
  /** World point the camera leans towards (mouse cursor / aim direction); null = none. */
  private lookPoint: { x: number; y: number } | null = null;
  private readonly buffer = new SnapshotBuffer();
  private readonly predictor = new Predictor();
  private notices: Notice[] = [];
  private raf = 0;
  private lastFrame = 0;
  private inputAcc = 0;
  /** Predicted firing slow-down 0..1 (mirrors Player.fireSlow on the host). */
  private fireSlow = 0;
  private aim = 0;
  private lastEventTick = -1;
  private hurt = 0;
  private fps = 60;
  private pingTimer = 0;
  private over = false;
  private cameraInit = false;
  private unsubs: Array<() => void> = [];
  private disposed = false;
  /** Smoothed 0..1 music intensity and seconds since a boss was last on the field. */
  private intensity = 0;
  private sinceBoss = Infinity;
  /** Open leave-game dialog, or null. */
  private dialog: HTMLElement | null = null;

  constructor(
    private readonly conn: GameConnection,
    private readonly canvas: HTMLCanvasElement,
    assets: Assets,
    private readonly audio: AudioEngine,
    private readonly content: ContentRegistry,
  ) {
    super();
    this.renderer = new Renderer(canvas, assets, content);
    this.hud = new Hud(assets, content);
    this.enemyAudio = new EnemyAudio(audio, content);
    this.input = new InputManager(canvas, {
      hitSlot: (x, y) => this.hud.slotAt(x, y),
      onButton: (act) => (act === 'mute' ? this.toggleMute() : this.toggleLeaveDialog()),
    });
    this.input.touch.setMuted(this.audio.muted);
    this.input.onKey = (code) => {
      if (code === 'KeyM') this.toggleMute();
      if (code === 'F3') config.debug = !config.debug;
      if (code === 'Escape') this.toggleLeaveDialog();
    };
    const s = conn.session;
    this.unsubs.push(
      s.on('snapshot', (snap) => this.onSnapshot(snap)),
      s.on('over', (o) => {
        this.closeLeaveDialog();
        this.over = true;
        this.enemyAudio.stop();
        this.audio.playMusic('gameover');
        this.emit('over', o);
      }),
    );
    // Portrait phone: the rotate overlay is up. Solo pauses like the leave dialog does.
    this.unsubs.push(onRotateBlockedChange(() => this.syncPause()));
    const onResize = () => this.renderer.resize();
    window.addEventListener('resize', onResize);
    this.unsubs.push(() => window.removeEventListener('resize', onResize));
  }

  start(): void {
    this.renderer.clearWorld();
    this.audio.playMusic('combat');
    this.canvas.classList.add('playing');
    this.lastFrame = performance.now();
    this.syncPause();
    const loop = (now: number) => {
      if (this.disposed) return;
      this.frame(now);
      this.raf = requestAnimationFrame(loop);
    };
    this.raf = requestAnimationFrame(loop);
  }

  dispose(): void {
    this.closeLeaveDialog();
    this.disposed = true;
    cancelAnimationFrame(this.raf);
    this.input.dispose();
    for (const u of this.unsubs) u();
    this.enemyAudio.stop();
    this.canvas.classList.remove('playing');
    this.clear();
  }

  get leaveDialogOpen(): boolean {
    return !!this.dialog;
  }

  /** Escape / ⏸: "leave the game?" — pauses solo play, multiplayer keeps running. */
  toggleLeaveDialog(): void {
    if (this.dialog) return this.closeLeaveDialog();
    if (this.over || this.disposed) return;
    const solo = this.conn.mode === 'local';
    this.dialog = createLeaveDialog({
      solo,
      host: !!this.conn.host && !solo,
      onYes: () => {
        this.closeLeaveDialog();
        this.emit('leave', undefined);
      },
      onNo: () => this.closeLeaveDialog(),
    });
    document.body.append(this.dialog);
    this.canvas.classList.add('menu-open');
    this.syncPause();
    (this.dialog.querySelector('#leave-no') as HTMLElement | null)?.focus();
  }

  private closeLeaveDialog(): void {
    if (!this.dialog) return;
    this.dialog.remove();
    this.dialog = null;
    this.canvas.classList.remove('menu-open');
    this.syncPause();
    this.input.takeActions(); // drop slot / reload presses made while the dialog was open
  }

  /** Solo only: the sim pauses while the leave dialog or the rotate overlay is up. */
  private get soloPaused(): boolean {
    return this.conn.mode === 'local' && !this.over && (!!this.dialog || isRotateBlocked());
  }

  private syncPause(): void {
    if (this.conn.mode === 'local') this.conn.host?.setPaused(this.soloPaused);
  }

  private toggleMute(): void {
    const muted = this.audio.toggleMute();
    this.input.touch.setMuted(muted);
    this.notify(muted ? 'Sound muted' : 'Sound on', 'info');
  }

  get myId(): number {
    return this.conn.session.playerId;
  }

  private me(snap: Snapshot | undefined): PlayerSnap | undefined {
    return snap?.players.find((p) => p.id === this.myId);
  }

  private notify(text: string, kind: NoticeKind): void {
    this.notices.push({ text, kind, ttl: kind === 'warn' ? 4 : 3 });
    if (this.notices.length > 8) this.notices.shift();
  }

  private fxContext(snap: Snapshot): FxContext {
    return {
      renderer: this.renderer,
      audio: this.audio,
      content: this.content,
      myId: this.myId,
      players: (id) => snap.players.find((p) => p.id === id),
      notify: (t, k) => this.notify(t, k),
      hurtFlash: (a) => (this.hurt = Math.min(0.5, this.hurt + a)),
    };
  }

  private onSnapshot(snap: Snapshot): void {
    this.buffer.push(snap, performance.now());
    const me = this.me(snap);
    if (me) this.predictor.reconcile(me.x, me.y, me.seq, me.st === 'alive');
    const ctx = this.fxContext(snap);
    for (const ev of snap.events) if (isImmediate(ev, this.myId)) playEvent(ev, ctx);
  }

  private sendInputs(dt: number): void {
    const latest = this.buffer.latest;
    const me = this.me(latest);
    this.inputAcc = Math.min(this.inputAcc + dt, TICK_DT * 4);
    while (this.inputAcc >= TICK_DT) {
      this.inputAcc -= TICK_DT;
      if (this.over || !me) continue;
      // solo + dialog / rotate overlay: the sim is paused, send nothing (keeps prediction in step)
      if (this.soloPaused) continue;
      const alive = me.st === 'alive' && !this.dialog && !isRotateBlocked();
      const intent = this.input.read();
      const { x: mx, y: my } = alive ? intent.move : { x: 0, y: 0 };
      const cur = this.content.weapons.get(me.w);
      const owned = this.content.weaponOrder.filter((w) => me.ws.includes(w.id)).map((w) => w.slot);
      const actions = this.input.takeActions();
      const slot = resolveSlot(actions, owned, cur?.slot ?? 1);
      const sent = this.conn.session.sendInput({
        mx,
        my,
        aim: this.aim,
        fire: alive && intent.fire,
        slot,
        reload: actions.reload,
      });
      // Same firing slow-down as the host sim (shared pure helpers), driven by our own inputs.
      this.fireSlow = alive ? stepFireSlow(this.fireSlow, sent.fire, TICK_DT) : 0;
      const speed = cur ? marineMoveSpeed(cur, this.fireSlow) : playerMoveSpeed(1);
      this.predictor.applyLocal(sent, speed, alive);
    }
  }

  private frame(now: number): void {
    const dt = Math.min(0.1, (now - this.lastFrame) / 1000);
    this.lastFrame = now;
    if (dt > 0) this.fps += (1 / dt - this.fps) * 0.05;
    const r = this.renderer;

    // aim from predicted position (falls back to camera centre)
    const p0 = this.predictor.ready ? this.predictor.pos : { x: r.camera.x, y: r.camera.y };
    const aim = this.input.read().aim;
    if (aim?.kind === 'screen') {
      // mouse: aim at the cursor, camera leans towards it (unchanged PC behaviour)
      const mouseWorld = r.camera.toWorld(aim.x, aim.y);
      this.aim = Math.atan2(mouseWorld.y - p0.y, mouseWorld.x - p0.x);
      this.lookPoint = mouseWorld;
    } else if (aim?.kind === 'angle') {
      this.aim = aim.angle;
      this.lookPoint = { x: p0.x + Math.cos(aim.angle) * 260, y: p0.y + Math.sin(aim.angle) * 260 };
    } else this.lookPoint = null;

    this.sendInputs(dt);

    this.pingTimer -= dt;
    if (this.pingTimer <= 0 && this.conn.mode !== 'local') {
      this.pingTimer = 2;
      this.conn.session.ping();
    }

    const sample = this.buffer.sample(now);
    if (!sample) {
      this.drawWaiting();
      return;
    }
    // fire non-immediate events whose snapshot is now being displayed
    for (const s of this.buffer.since(this.lastEventTick)) {
      if (s.tick > sample.b.tick) break;
      const ctx = this.fxContext(s);
      for (const ev of s.events) if (!isImmediate(ev, this.myId)) playEvent(ev, ctx);
      this.lastEventTick = s.tick;
    }

    const latest = this.buffer.latest!;
    const meLatest = this.me(latest);
    const alive = meLatest?.st === 'alive';
    const myPos =
      this.predictor.ready && alive ? this.predictor.renderPos(this.inputAcc / TICK_DT, dt) : null;

    // camera: own marine (with aim look-ahead), or the first living teammate when dead
    let target: { x: number; y: number } | undefined =
      myPos ?? (meLatest && meLatest.st !== 'dead' ? meLatest : undefined);
    if (!target) target = latest.players.find((p) => p.st !== 'dead') ?? meLatest;
    if (target) {
      const look = myPos ? 0.18 : 0;
      const lp = this.lookPoint ?? target;
      const tx = target.x + (lp.x - target.x) * look;
      const ty = target.y + (lp.y - target.y) * look;
      r.camera.follow(tx, ty, dt, !this.cameraInit);
      this.cameraInit = true;
    }
    this.audio.listener = { x: r.camera.x, y: r.camera.y };
    this.audio.spatial.halfWidth = Math.max(320, r.camera.width / 2 / (r.camera.zoom || 1));

    r.render({
      a: sample.a,
      b: sample.b,
      t: sample.t,
      myId: this.myId,
      me: myPos ? { ...myPos, aim: this.aim } : null,
      nowMs: now,
      dt,
    });
    if (!this.over) {
      this.enemyAudio.update(sample.b, this.audio.listener, dt, meLatest, r.landings);
      this.updateMusic(latest, dt);
    }
    this.audio.update();
    this.hurt = Math.max(0, this.hurt - dt * 1.2);
    r.ctx.setTransform(1, 0, 0, 1, 0, 0);
    r.damageOverlay(this.hurt);

    for (const n of this.notices) n.ttl -= dt;
    this.notices = this.notices.filter((n) => n.ttl > 0);
    const hudSnap = {
      ...sample.b,
      players: latest.players,
      time: latest.time,
      wave: latest.wave,
      wv: latest.wv,
      sp: latest.sp,
    };
    this.hud.draw(r.ctx, r.pixelRatio, r.camera.width, r.camera.height, {
      snap: hudSnap,
      me: meLatest,
      myPos,
      notices: this.notices,
      ping: this.conn.session.rtt,
      fps: this.fps,
      crosshair: this.crosshair(),
      touch: this.input.active === 'touch' ? this.input.touch.sticks() : null,
      inset: safeAreaInsets(),
      roomCode: this.conn.roomCode,
      mode: this.conn.mode,
      muted: this.audio.muted,
      camera: { x: r.camera.x, y: r.camera.y, zoom: r.camera.zoom },
      now: now / 1000,
      debug: config.debug
        ? `tick ${latest.tick} · buf ${(sample.t * 100) | 0}% · pending ${this.predictor.pendingCount} · corr ${this.predictor.lastCorrection.toFixed(1)}px · ents ${latest.enemies.length}/${latest.projectiles.length}`
        : null,
    });
  }

  /**
   * Adaptive score: the combat drive stems follow the number of live enemies (silent in a
   * breather), and a boss on the field switches to the boss track (with a few seconds'
   * hysteresis so a dying Carnifex does not flip the music back and forth).
   */
  private updateMusic(snap: Snapshot, dt: number): void {
    const boss = snap.enemies.some(
      (e) => this.content.enemies.get(this.content.enemyIds[e[1]] ?? '')?.boss,
    );
    this.sinceBoss = boss ? 0 : this.sinceBoss + dt;
    this.audio.playMusic(this.sinceBoss < 6 ? 'boss' : 'combat');
    const active = !snap.wv || snap.wv.a === 1;
    const target = active ? Math.min(1, snap.enemies.length / 30) : 0;
    this.intensity += (target - this.intensity) * Math.min(1, dt / 2.5);
    this.audio.setMusicIntensity(this.intensity);
  }

  /** Crosshair position in CSS px: the mouse on PC, a reticle along the aim stick on touch. */
  private crosshair(): { x: number; y: number } | null {
    if (this.input.active === 'kbm') return { x: this.input.kbm.mouseX, y: this.input.kbm.mouseY };
    if (!this.input.touch.aimStick.vector.active || !this.predictor.ready) return null;
    const cam = this.renderer.camera;
    const p = this.predictor.pos;
    const d = 150;
    return {
      x: (p.x - cam.x) * cam.zoom + cam.width / 2 + Math.cos(this.aim) * d,
      y: (p.y - cam.y) * cam.zoom + cam.height / 2 + Math.sin(this.aim) * d,
    };
  }

  private drawWaiting(): void {
    const { ctx, canvas } = this.renderer;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = '#07090c';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = '#9fc4ff';
    ctx.font = `${16 * this.renderer.pixelRatio}px system-ui`;
    ctx.textAlign = 'center';
    ctx.fillText('Deploying…', canvas.width / 2, canvas.height / 2);
  }
}

/** Safe-area insets (notch / home indicator) in CSS px, measured via a probe element. */
let insetCache: { key: string; v: Insets } | null = null;
function safeAreaInsets(): Insets {
  const key = `${window.innerWidth}x${window.innerHeight}`;
  if (insetCache?.key === key) return insetCache.v;
  let probe = document.getElementById('safe-probe');
  if (!probe) {
    probe = document.createElement('div');
    probe.id = 'safe-probe';
    document.body.append(probe);
  }
  const cs = getComputedStyle(probe);
  const px = (v: string) => parseFloat(v) || 0;
  const v = {
    top: px(cs.paddingTop),
    right: px(cs.paddingRight),
    bottom: px(cs.paddingBottom),
    left: px(cs.paddingLeft),
  };
  insetCache = { key, v };
  return v;
}
