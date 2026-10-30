import {
  Emitter,
  playerMoveSpeed,
  TICK_DT,
  type ContentRegistry,
  type PlayerSnap,
  type PlayerSummary,
  type RunResult,
  type Snapshot,
} from '@sms/shared';
import type { AudioEngine } from '../audio/AudioEngine.js';
import { config } from '../config.js';
import type { GameConnection } from '../net/connection.js';
import type { Assets } from '../render/assets.js';
import { Hud, type Notice } from '../render/hud.js';
import { Renderer } from '../render/Renderer.js';
import { isImmediate, playEvent, type FxContext, type NoticeKind } from './fx.js';
import { InputState } from './input.js';
import { SnapshotBuffer } from './interpolation.js';
import { Predictor } from './prediction.js';

export type GameClientEvents = {
  over: { result: RunResult; summary: PlayerSummary[] };
};

/**
 * Runs one game on the client: samples input at the tick rate, predicts the
 * local marine, interpolates everything else and renders world + HUD.
 */
export class GameClient extends Emitter<GameClientEvents> {
  readonly renderer: Renderer;
  private readonly hud: Hud;
  private readonly input: InputState;
  private readonly buffer = new SnapshotBuffer();
  private readonly predictor = new Predictor();
  private notices: Notice[] = [];
  private raf = 0;
  private lastFrame = 0;
  private inputAcc = 0;
  private aim = 0;
  private lastEventTick = -1;
  private hurt = 0;
  private fps = 60;
  private pingTimer = 0;
  private over = false;
  private cameraInit = false;
  private unsubs: Array<() => void> = [];
  private disposed = false;

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
    this.input = new InputState(canvas);
    this.input.onKey = (code) => {
      if (code === 'KeyM') this.notify(this.audio.toggleMute() ? 'Sound muted' : 'Sound on', 'info');
      if (code === 'F3') config.debug = !config.debug;
    };
    const s = conn.session;
    this.unsubs.push(
      s.on('snapshot', (snap) => this.onSnapshot(snap)),
      s.on('over', (o) => {
        this.over = true;
        this.audio.playMusic('gameover');
        this.emit('over', o);
      }),
    );
    const onResize = () => this.renderer.resize();
    window.addEventListener('resize', onResize);
    this.unsubs.push(() => window.removeEventListener('resize', onResize));
  }

  start(): void {
    this.renderer.clearWorld();
    this.audio.playMusic('battle');
    this.canvas.classList.add('playing');
    this.lastFrame = performance.now();
    const loop = (now: number) => {
      if (this.disposed) return;
      this.frame(now);
      this.raf = requestAnimationFrame(loop);
    };
    this.raf = requestAnimationFrame(loop);
  }

  dispose(): void {
    this.disposed = true;
    cancelAnimationFrame(this.raf);
    this.input.dispose();
    for (const u of this.unsubs) u();
    this.canvas.classList.remove('playing');
    this.clear();
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
      const alive = me.st === 'alive';
      const { mx, my } = alive ? this.input.move() : { mx: 0, my: 0 };
      const cur = this.content.weapons.get(me.w);
      const owned = this.content.weaponOrder.filter((w) => me.ws.includes(w.id)).map((w) => w.slot);
      const slot = this.input.consumeSlot(owned, cur?.slot ?? 1);
      const sent = this.conn.session.sendInput({
        mx,
        my,
        aim: this.aim,
        fire: alive && this.input.fire(),
        slot,
        reload: this.input.consumeReload(),
      });
      this.predictor.applyLocal(sent, playerMoveSpeed(cur?.moveSpeedMul ?? 1), alive);
    }
  }

  private frame(now: number): void {
    const dt = Math.min(0.1, (now - this.lastFrame) / 1000);
    this.lastFrame = now;
    if (dt > 0) this.fps += (1 / dt - this.fps) * 0.05;
    const r = this.renderer;

    // aim from predicted position (falls back to camera centre)
    const mouseWorld = r.camera.toWorld(this.input.mouseX, this.input.mouseY);
    const p0 = this.predictor.ready ? this.predictor.pos : { x: r.camera.x, y: r.camera.y };
    this.aim = Math.atan2(mouseWorld.y - p0.y, mouseWorld.x - p0.x);

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
    const myPos = this.predictor.ready && alive ? this.predictor.renderPos(this.inputAcc / TICK_DT, dt) : null;

    // camera: own marine (with aim look-ahead), or the first living teammate when dead
    let target: { x: number; y: number } | undefined = myPos ?? (meLatest && meLatest.st !== 'dead' ? meLatest : undefined);
    if (!target) target = latest.players.find((p) => p.st !== 'dead') ?? meLatest;
    if (target) {
      const look = myPos ? 0.18 : 0;
      const tx = target.x + (mouseWorld.x - target.x) * look;
      const ty = target.y + (mouseWorld.y - target.y) * look;
      r.camera.follow(tx, ty, dt, !this.cameraInit);
      this.cameraInit = true;
    }
    this.audio.listener = { x: r.camera.x, y: r.camera.y };

    r.render({ a: sample.a, b: sample.b, t: sample.t, myId: this.myId, me: myPos ? { ...myPos, aim: this.aim } : null, nowMs: now, dt });
    this.hurt = Math.max(0, this.hurt - dt * 1.2);
    r.ctx.setTransform(1, 0, 0, 1, 0, 0);
    r.damageOverlay(this.hurt);

    for (const n of this.notices) n.ttl -= dt;
    this.notices = this.notices.filter((n) => n.ttl > 0);
    const hudSnap = { ...sample.b, players: latest.players, time: latest.time, wave: latest.wave };
    this.hud.draw(r.ctx, r.pixelRatio, r.camera.width, r.camera.height, {
      snap: hudSnap,
      me: meLatest,
      myPos,
      notices: this.notices,
      ping: this.conn.session.rtt,
      fps: this.fps,
      mouse: { x: this.input.mouseX, y: this.input.mouseY },
      roomCode: this.conn.roomCode,
      mode: this.conn.mode,
      muted: this.audio.muted,
      debug: config.debug
        ? `tick ${latest.tick} · buf ${(sample.t * 100) | 0}% · pending ${this.predictor.pendingCount} · corr ${this.predictor.lastCorrection.toFixed(1)}px · ents ${latest.enemies.length}/${latest.projectiles.length}`
        : null,
    });
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
