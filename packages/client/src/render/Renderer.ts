import {
  ARENA,
  defaultContent,
  PLAYER,
  PLAYER_COLORS,
  type ContentRegistry,
  type PlayerSnap,
  type Snapshot,
} from '@sms/shared';
import { lerp, lerpAngle } from '../game/interpolation.js';
import type { Assets } from './assets.js';
import { Camera } from './camera.js';
import { Particles } from './particles.js';
import {
  DEFAULT_ENEMY_VISUAL,
  DEFAULT_PROJECTILE_VISUAL,
  ENEMY_VISUALS,
  PROJECTILE_VISUALS,
} from './visuals.js';

/** Everything the renderer needs for one frame. */
export interface RenderFrame {
  a: Snapshot;
  b: Snapshot;
  t: number;
  myId: number;
  /** Predicted local position + aim (overrides interpolated state for our marine). */
  me: { x: number; y: number; aim: number } | null;
  nowMs: number;
  dt: number;
}

const DECAL_SCALE = 0.5;
const TILE = 64;

const hash2 = (x: number, y: number) => {
  let h = (x * 374761393 + y * 668265263) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return (h ^ (h >>> 16)) >>> 0;
};

/** Canvas2D world renderer (floor, decals, entities, particles). HUD is in hud.ts. */
export class Renderer {
  readonly ctx: CanvasRenderingContext2D;
  readonly camera = new Camera();
  readonly particles = new Particles();
  private dpr = 1;
  private decals: HTMLCanvasElement;
  private decalCtx: CanvasRenderingContext2D;
  private hitFlash = new Map<number, number>();
  private lastHp = new Map<number, number>();
  private walk = new Map<number, { x: number; y: number; dist: number }>();
  private trailAcc = new Map<number, number>();
  private vignette: CanvasGradient | null = null;

  constructor(
    readonly canvas: HTMLCanvasElement,
    readonly assets: Assets,
    readonly content: ContentRegistry = defaultContent,
  ) {
    this.ctx = canvas.getContext('2d', { alpha: false })!;
    this.decals = document.createElement('canvas');
    this.decals.width = ARENA.width * DECAL_SCALE;
    this.decals.height = ARENA.height * DECAL_SCALE;
    this.decalCtx = this.decals.getContext('2d')!;
    this.resize();
  }

  resize(): void {
    this.dpr = Math.min(2, window.devicePixelRatio || 1);
    const w = window.innerWidth;
    const h = window.innerHeight;
    this.canvas.width = Math.floor(w * this.dpr);
    this.canvas.height = Math.floor(h * this.dpr);
    this.canvas.style.width = `${w}px`;
    this.canvas.style.height = `${h}px`;
    this.camera.resize(w, h);
    this.vignette = null;
  }

  clearWorld(): void {
    this.decalCtx.clearRect(0, 0, this.decals.width, this.decals.height);
    this.particles.clear();
    this.hitFlash.clear();
    this.lastHp.clear();
    this.walk.clear();
  }

  /** Paints a persistent decal (blood, acid, scorch) onto the floor layer. */
  addDecal(key: string, x: number, y: number, scale = 1, alpha = 0.85): void {
    const c = this.decalCtx;
    c.save();
    c.globalAlpha = alpha;
    c.translate(x * DECAL_SCALE, y * DECAL_SCALE);
    c.rotate(Math.random() * Math.PI * 2);
    c.scale(scale * DECAL_SCALE, scale * DECAL_SCALE);
    if (!this.assets.draw(c, key, 0, 0, 0)) {
      c.fillStyle = key.includes('acid') ? '#6a8a20' : key.includes('scorch') ? '#111' : '#4a1030';
      c.beginPath();
      c.arc(0, 0, 18, 0, Math.PI * 2);
      c.fill();
    }
    c.restore();
  }

  render(f: RenderFrame): void {
    const { ctx, camera } = this;
    this.particles.update(f.dt);
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = '#07090c';
    ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
    const s = this.dpr * camera.zoom;
    ctx.setTransform(
      s,
      0,
      0,
      s,
      (camera.width / 2) * this.dpr - (camera.x + camera.shakeX) * s,
      (camera.height / 2) * this.dpr - (camera.y + camera.shakeY) * s,
    );
    ctx.imageSmoothingEnabled = true;

    this.drawFloor();
    ctx.drawImage(this.decals, 0, 0, ARENA.width, ARENA.height);
    this.drawArenaEdge();
    this.drawPickups(f);
    this.drawEnemies(f);
    this.drawPlayers(f);
    this.drawProjectiles(f);
    this.drawParticles();

    ctx.setTransform(1, 0, 0, 1, 0, 0);
    this.drawVignette();
  }

  private drawFloor(): void {
    const { ctx } = this;
    const v = this.camera.view(TILE);
    const tx0 = Math.max(0, Math.floor(v.x0 / TILE));
    const ty0 = Math.max(0, Math.floor(v.y0 / TILE));
    const tx1 = Math.min(ARENA.width / TILE, Math.ceil(v.x1 / TILE));
    const ty1 = Math.min(ARENA.height / TILE, Math.ceil(v.y1 / TILE));
    const hasTiles = this.assets.has('tile_floor_0');
    for (let ty = ty0; ty < ty1; ty++) {
      for (let tx = tx0; tx < tx1; tx++) {
        const h = hash2(tx, ty);
        const variant = h % 100 < 70 ? 0 : 1 + (h % 3);
        const cx = tx * TILE + TILE / 2;
        const cy = ty * TILE + TILE / 2;
        if (hasTiles) this.assets.draw(ctx, `tile_floor_${variant}`, 0, cx, cy);
        else {
          ctx.fillStyle = (tx + ty) % 2 ? '#1a2026' : '#1d242b';
          ctx.fillRect(tx * TILE, ty * TILE, TILE, TILE);
        }
      }
    }
  }

  private drawArenaEdge(): void {
    const { ctx } = this;
    ctx.save();
    ctx.lineWidth = 10;
    ctx.strokeStyle = '#d8a01a';
    ctx.setLineDash([40, 30]);
    ctx.strokeRect(-5, -5, ARENA.width + 10, ARENA.height + 10);
    ctx.setLineDash([]);
    ctx.lineWidth = 2;
    ctx.strokeStyle = 'rgba(255,190,60,0.35)';
    ctx.strokeRect(-14, -14, ARENA.width + 28, ARENA.height + 28);
    ctx.restore();
  }

  private drawShadow(x: number, y: number, r: number): void {
    const { ctx } = this;
    if (this.assets.has('shadow')) {
      this.assets.draw(ctx, 'shadow', 0, x, y + r * 0.35, 0, r / 22);
      return;
    }
    ctx.fillStyle = 'rgba(0,0,0,0.35)';
    ctx.beginPath();
    ctx.ellipse(x, y + r * 0.35, r, r * 0.6, 0, 0, Math.PI * 2);
    ctx.fill();
  }

  private drawPickups(f: RenderFrame): void {
    const { ctx } = this;
    const time = f.nowMs / 1000;
    for (const p of f.b.pickups) {
      if (p.life < 6 && Math.floor(time * 6) % 2 === 0) continue; // blink before despawn
      const bob = Math.sin(time * 3 + p.id) * 3;
      const glowColor = p.k === 'medkit' ? 'rgba(90,255,120,' : 'rgba(255,200,60,';
      const g = ctx.createRadialGradient(p.x, p.y, 4, p.x, p.y, 42);
      g.addColorStop(0, glowColor + '0.35)');
      g.addColorStop(1, glowColor + '0)');
      ctx.fillStyle = g;
      ctx.fillRect(p.x - 42, p.y - 42, 84, 84);
      this.drawShadow(p.x, p.y + 6, 16);
      const key =
        p.k === 'medkit' ? 'medkit' : (this.content.weapons.get(p.w ?? '')?.sprites.pickup ?? '');
      const frame = Math.floor(time * 2) % 2;
      if (!this.assets.draw(ctx, key, frame, p.x, p.y + bob)) {
        ctx.fillStyle = p.k === 'medkit' ? '#e8e8e8' : '#b07a2a';
        ctx.fillRect(p.x - 14, p.y - 14 + bob, 28, 28);
        ctx.fillStyle = p.k === 'medkit' ? '#e33' : '#222';
        ctx.fillRect(p.x - 3, p.y - 10 + bob, 6, 20);
        ctx.fillRect(p.x - 10, p.y - 3 + bob, 20, 6);
      }
      if (p.k === 'weapon' && p.w) {
        ctx.font = 'bold 11px system-ui, sans-serif';
        ctx.textAlign = 'center';
        ctx.fillStyle = '#ffd87a';
        ctx.fillText(this.content.weapons.get(p.w)?.name.toUpperCase() ?? p.w, p.x, p.y - 26 + bob);
      }
    }
  }

  private drawEnemies(f: RenderFrame): void {
    const { ctx } = this;
    const prev = new Map(f.a.enemies.map((e) => [e[0], e]));
    const time = f.nowMs / 1000;
    const v = this.camera.view(80);
    const seen = new Set<number>();
    for (const e of f.b.enemies) {
      const [id, typeIdx, bx, by, ba, hp, fuse] = e;
      seen.add(id);
      const pa = prev.get(id);
      const x = pa ? lerp(pa[2], bx, f.t) : bx;
      const y = pa ? lerp(pa[3], by, f.t) : by;
      const ang = pa ? lerpAngle(pa[4], ba, f.t) : ba;
      const last = this.lastHp.get(id);
      if (last !== undefined && hp < last) this.hitFlash.set(id, 0.08);
      this.lastHp.set(id, hp);
      if (x < v.x0 || x > v.x1 || y < v.y0 || y > v.y1) continue;
      const typeId = this.content.enemyIds[typeIdx] ?? '';
      const def = this.content.enemies.get(typeId);
      const vis = ENEMY_VISUALS[typeId] ?? DEFAULT_ENEMY_VISUAL;
      const r = def?.radius ?? 16;
      this.drawShadow(x, y, r);
      const frame = Math.floor(time * vis.animFps + id * 0.37);
      const pulse = fuse ? 1 + Math.sin(time * 30) * 0.08 : 1;
      if (fuse) {
        const g = ctx.createRadialGradient(x, y, 2, x, y, r * 2.4);
        g.addColorStop(0, 'rgba(255,80,40,0.6)');
        g.addColorStop(1, 'rgba(255,80,40,0)');
        ctx.fillStyle = g;
        ctx.fillRect(x - r * 2.4, y - r * 2.4, r * 4.8, r * 4.8);
      }
      const key = def?.sprite ?? '';
      if (!this.assets.draw(ctx, key, frame, x, y, ang, pulse)) {
        ctx.fillStyle = vis.color;
        ctx.beginPath();
        ctx.arc(x, y, r * pulse, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = '#000';
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.lineTo(x + Math.cos(ang) * r, y + Math.sin(ang) * r);
        ctx.stroke();
      }
      const flash = this.hitFlash.get(id) ?? 0;
      if (flash > 0) {
        this.hitFlash.set(id, flash - f.dt);
        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        ctx.globalAlpha = 0.55;
        if (!this.assets.draw(ctx, key, frame, x, y, ang, pulse)) {
          ctx.fillStyle = '#fff';
          ctx.beginPath();
          ctx.arc(x, y, r, 0, Math.PI * 2);
          ctx.fill();
        }
        ctx.restore();
      }
      // HP bar for damaged big enemies
      if (hp < 100 && (def?.hp ?? 0) >= 150) {
        ctx.fillStyle = 'rgba(0,0,0,0.6)';
        ctx.fillRect(x - r, y - r - 10, r * 2, 4);
        ctx.fillStyle = '#e04040';
        ctx.fillRect(x - r, y - r - 10, (r * 2 * hp) / 100, 4);
      }
    }
    for (const id of this.lastHp.keys()) {
      if (seen.has(id)) continue;
      this.lastHp.delete(id);
      this.hitFlash.delete(id);
    }
  }

  private playerPose(f: RenderFrame, p: PlayerSnap): { x: number; y: number; a: number } {
    if (p.id === f.myId && f.me && p.st === 'alive') return { x: f.me.x, y: f.me.y, a: f.me.aim };
    const pa = f.a.players.find((q) => q.id === p.id);
    if (!pa) return { x: p.x, y: p.y, a: p.a };
    return { x: lerp(pa.x, p.x, f.t), y: lerp(pa.y, p.y, f.t), a: lerpAngle(pa.a, p.a, f.t) };
  }

  private drawPlayers(f: RenderFrame): void {
    const { ctx } = this;
    const time = f.nowMs / 1000;
    for (const p of f.b.players) {
      if (p.st === 'dead') continue;
      const { x, y, a } = this.playerPose(f, p);
      const color = PLAYER_COLORS[p.c % PLAYER_COLORS.length];
      const w = this.walk.get(p.id) ?? { x, y, dist: 0 };
      w.dist += Math.hypot(x - w.x, y - w.y);
      w.x = x;
      w.y = y;
      this.walk.set(p.id, w);

      this.drawShadow(x, y, PLAYER.radius + 4);
      // team colour ring
      ctx.strokeStyle = color;
      ctx.globalAlpha = 0.55;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.ellipse(x, y + 4, 22, 14, 0, 0, Math.PI * 2);
      ctx.stroke();
      ctx.globalAlpha = 1;

      if (p.st === 'downed') {
        if (!this.assets.draw(ctx, `marine_${p.c % 4}_down`, 0, x, y, 0)) {
          ctx.fillStyle = color;
          ctx.globalAlpha = 0.6;
          ctx.beginPath();
          ctx.arc(x, y, PLAYER.radius, 0, Math.PI * 2);
          ctx.fill();
          ctx.globalAlpha = 1;
        }
        // bleed-out ring + revive progress
        const bleed = Math.max(0, p.bo / PLAYER.bleedOutTime);
        ctx.lineWidth = 4;
        ctx.strokeStyle = `rgba(255,60,60,${0.5 + 0.5 * Math.sin(time * 8)})`;
        ctx.beginPath();
        ctx.arc(x, y, 30, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * bleed);
        ctx.stroke();
        if (p.rv > 0) {
          ctx.strokeStyle = '#6fff8a';
          ctx.lineWidth = 6;
          ctx.beginPath();
          ctx.arc(x, y, 38, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * Math.min(1, p.rv));
          ctx.stroke();
        }
        ctx.font = 'bold 12px system-ui, sans-serif';
        ctx.textAlign = 'center';
        ctx.fillStyle = '#ff6a6a';
        ctx.fillText('REVIVE ME', x, y - 46);
      } else {
        const frame = Math.floor(w.dist / 14) % 4;
        if (!this.assets.draw(ctx, `marine_${p.c % 4}`, frame, x, y, a)) {
          ctx.fillStyle = color;
          ctx.beginPath();
          ctx.arc(x, y, PLAYER.radius, 0, Math.PI * 2);
          ctx.fill();
          ctx.strokeStyle = '#ddd';
          ctx.lineWidth = 5;
          ctx.beginPath();
          ctx.moveTo(x, y);
          ctx.lineTo(x + Math.cos(a) * 26, y + Math.sin(a) * 26);
          ctx.stroke();
        }
      }
      // name + hp
      if (p.id !== f.myId) {
        ctx.font = '600 12px system-ui, sans-serif';
        ctx.textAlign = 'center';
        ctx.fillStyle = 'rgba(0,0,0,0.6)';
        ctx.fillText(p.name, x + 1, y - 33);
        ctx.fillStyle = color;
        ctx.fillText(p.name, x, y - 34);
      }
      if (p.st === 'alive') {
        ctx.fillStyle = 'rgba(0,0,0,0.6)';
        ctx.fillRect(x - 18, y - 30, 36, 4);
        ctx.fillStyle = p.hp / p.mhp > 0.35 ? '#5fe07a' : '#ff5050';
        ctx.fillRect(x - 18, y - 30, (36 * p.hp) / p.mhp, 4);
      }
    }
  }

  private drawProjectiles(f: RenderFrame): void {
    const { ctx } = this;
    const prev = new Map(f.a.projectiles.map((p) => [p[0], p]));
    const seen = new Set<number>();
    for (const p of f.b.projectiles) {
      const [id, kindIdx, bx, by, ang] = p;
      seen.add(id);
      const pa = prev.get(id);
      const x = pa ? lerp(pa[2], bx, f.t) : bx;
      const y = pa ? lerp(pa[3], by, f.t) : by;
      const kind = this.content.projectileKinds[kindIdx] ?? '';
      const vis = PROJECTILE_VISUALS[kind] ?? DEFAULT_PROJECTILE_VISUAL;
      if (vis.trail > 0) {
        const acc = (this.trailAcc.get(id) ?? 0) + vis.trail * f.dt;
        let n = Math.floor(acc);
        this.trailAcc.set(id, acc - n);
        while (n-- > 0)
          this.particles.spawn({
            x: x + (Math.random() - 0.5) * 4,
            y: y + (Math.random() - 0.5) * 4,
            vx: (Math.random() - 0.5) * 20,
            vy: (Math.random() - 0.5) * 20,
            maxLife: 0.35,
            size: kind === 'rocket' ? 5 : 3,
            grow: kind === 'rocket' ? 3 : 0.3,
            color: vis.trailColor ?? vis.color,
            shape: kind === 'rocket' ? 'smoke' : 'dot',
            additive: kind !== 'rocket',
          });
      }
      if (vis.glow) ctx.globalCompositeOperation = 'lighter';
      if (!this.assets.draw(ctx, `proj_${kind}`, 0, x, y, ang)) {
        ctx.fillStyle = vis.color;
        ctx.beginPath();
        ctx.arc(x, y, vis.fallbackRadius, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalCompositeOperation = 'source-over';
    }
    for (const id of this.trailAcc.keys()) if (!seen.has(id)) this.trailAcc.delete(id);
  }

  private drawParticles(): void {
    const { ctx } = this;
    for (const p of this.particles.list) {
      const t = 1 - p.life / p.maxLife;
      const size = p.size * (1 + (p.grow - 1) * t);
      ctx.globalAlpha = p.shape === 'smoke' ? 0.45 * (1 - t) : Math.min(1, (1 - t) * 1.5);
      ctx.globalCompositeOperation = p.additive ? 'lighter' : 'source-over';
      if (p.shape === 'sprite' && p.sprite) {
        const frames = this.assets.frameCount(p.sprite);
        if (
          frames &&
          this.assets.draw(
            ctx,
            p.sprite,
            Math.min(frames - 1, Math.floor(t * frames)),
            p.x,
            p.y,
            p.angle,
            size,
          )
        )
          continue;
        ctx.fillStyle = p.color;
        ctx.beginPath();
        ctx.arc(p.x, p.y, 40 * size * (0.5 + t), 0, Math.PI * 2);
        ctx.fill();
      } else if (p.shape === 'spark') {
        ctx.strokeStyle = p.color;
        ctx.lineWidth = size;
        ctx.beginPath();
        ctx.moveTo(p.x, p.y);
        ctx.lineTo(p.x - p.vx * 0.03, p.y - p.vy * 0.03);
        ctx.stroke();
      } else {
        ctx.fillStyle = p.color;
        ctx.beginPath();
        ctx.arc(p.x, p.y, size, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
  }

  private drawVignette(): void {
    const { ctx, canvas } = this;
    if (!this.vignette) {
      const r = Math.hypot(canvas.width, canvas.height) / 2;
      const g = ctx.createRadialGradient(
        canvas.width / 2,
        canvas.height / 2,
        r * 0.45,
        canvas.width / 2,
        canvas.height / 2,
        r,
      );
      g.addColorStop(0, 'rgba(0,0,0,0)');
      g.addColorStop(1, 'rgba(0,0,0,0.55)');
      this.vignette = g;
    }
    ctx.fillStyle = this.vignette;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  }

  /** Full-screen red flash when the local marine takes damage. */
  damageOverlay(amount: number): void {
    if (amount <= 0) return;
    const { ctx, canvas } = this;
    ctx.fillStyle = `rgba(200,0,0,${Math.min(0.35, amount)})`;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  }

  get pixelRatio(): number {
    return this.dpr;
  }
}
