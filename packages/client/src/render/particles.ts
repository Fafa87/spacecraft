export type ParticleShape = 'dot' | 'spark' | 'sprite' | 'smoke';

export interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  maxLife: number;
  size: number;
  /** Size multiplier at end of life. */
  grow: number;
  color: string;
  drag: number;
  shape: ParticleShape;
  additive: boolean;
  /** Sprite key + frame-by-life when shape === 'sprite'. */
  sprite?: string;
  angle: number;
}

const MAX_PARTICLES = 2500;

/** Simple pooled particle system (visual only, never networked). */
export class Particles {
  readonly list: Particle[] = [];
  private pool: Particle[] = [];

  spawn(p: Partial<Particle> & { x: number; y: number }): void {
    if (this.list.length >= MAX_PARTICLES) return;
    const q = this.pool.pop() ?? ({} as Particle);
    q.x = p.x;
    q.y = p.y;
    q.vx = p.vx ?? 0;
    q.vy = p.vy ?? 0;
    q.life = q.maxLife = p.maxLife ?? p.life ?? 0.5;
    q.size = p.size ?? 3;
    q.grow = p.grow ?? 1;
    q.color = p.color ?? '#fff';
    q.drag = p.drag ?? 3;
    q.shape = p.shape ?? 'dot';
    q.additive = p.additive ?? false;
    q.sprite = p.sprite;
    q.angle = p.angle ?? Math.atan2(q.vy, q.vx);
    this.list.push(q);
  }

  /** Radial burst helper. */
  burst(
    x: number,
    y: number,
    n: number,
    opts: Partial<Particle> & { speed: number; spread?: number; dir?: number },
  ): void {
    for (let i = 0; i < n; i++) {
      const a =
        opts.dir !== undefined
          ? opts.dir + (Math.random() - 0.5) * (opts.spread ?? Math.PI * 2)
          : Math.random() * Math.PI * 2;
      const s = opts.speed * (0.3 + Math.random() * 0.7);
      this.spawn({
        ...opts,
        x,
        y,
        vx: Math.cos(a) * s,
        vy: Math.sin(a) * s,
        maxLife: (opts.maxLife ?? 0.5) * (0.6 + Math.random() * 0.6),
        size: (opts.size ?? 3) * (0.7 + Math.random() * 0.6),
      });
    }
  }

  update(dt: number): void {
    const l = this.list;
    for (let i = l.length - 1; i >= 0; i--) {
      const p = l[i];
      p.life -= dt;
      if (p.life <= 0) {
        l[i] = l[l.length - 1];
        l.pop();
        this.pool.push(p);
        continue;
      }
      const d = Math.exp(-p.drag * dt);
      p.vx *= d;
      p.vy *= d;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
    }
  }

  clear(): void {
    this.pool.push(...this.list);
    this.list.length = 0;
  }
}
