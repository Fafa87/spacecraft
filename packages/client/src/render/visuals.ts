/**
 * Client-only presentation tables keyed by content ids. New weapons/enemies
 * work without an entry here (sane defaults); add one to tune their look.
 */
export interface ProjectileVisual {
  color: string;
  /** Additive blending (glowy). */
  glow: boolean;
  /** Trail particles per second. */
  trail: number;
  trailColor?: string;
  fallbackRadius: number;
}

export const PROJECTILE_VISUALS: Record<string, ProjectileVisual> = {
  bullet: { color: '#ffe28a', glow: true, trail: 0, fallbackRadius: 3 },
  pellet: { color: '#ffd27a', glow: true, trail: 0, fallbackRadius: 3 },
  flame: { color: '#ff8a2a', glow: true, trail: 0, fallbackRadius: 10 },
  plasma: { color: '#6fd8ff', glow: true, trail: 30, trailColor: '#7fe0ff', fallbackRadius: 7 },
  rocket: { color: '#ffb060', glow: false, trail: 60, trailColor: '#aaa', fallbackRadius: 5 },
  acid: { color: '#9cff3a', glow: true, trail: 20, trailColor: '#8cff40', fallbackRadius: 7 },
};

export const DEFAULT_PROJECTILE_VISUAL: ProjectileVisual = {
  color: '#fff',
  glow: true,
  trail: 0,
  fallbackRadius: 4,
};

export interface EnemyVisual {
  color: string;
  /** Gore particle colour. */
  ichor: string;
  /** Animation frames per second (walk cycle). */
  animFps: number;
  /** Screen shake on death. */
  deathShake: number;
}

export const ENEMY_VISUALS: Record<string, EnemyVisual> = {
  swarmer: { color: '#8a4fd0', ichor: '#6a2f9a', animFps: 12, deathShake: 0 },
  brute: { color: '#b04a4a', ichor: '#7a2020', animFps: 5, deathShake: 5 },
  spitter: { color: '#5aa84a', ichor: '#7acc30', animFps: 6, deathShake: 0 },
  burster: { color: '#d0a030', ichor: '#c8d040', animFps: 8, deathShake: 0 },
};

export const DEFAULT_ENEMY_VISUAL: EnemyVisual = {
  color: '#c050c0',
  ichor: '#802080',
  animFps: 8,
  deathShake: 0,
};
