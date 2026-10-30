/** Global tunables. Gameplay content (weapons, enemies, waves) lives in `data/`. */

export const GAME_VERSION = '0.1.0';
/** Bump whenever the wire protocol or data tables change incompatibly. */
export const PROTOCOL_VERSION = 1;

export const TICK_RATE = 30;
export const TICK_DT = 1 / TICK_RATE;
/** Max simulation ticks the host will run in one frame to catch up after a stall. */
export const MAX_CATCHUP_TICKS = 5;

export const MAX_PLAYERS = 4;
export const MIN_TEAM_SIZE = 1;

export const ARENA = { width: 3200, height: 2200 } as const;

export const PLAYER = {
  radius: 16,
  speed: 230,
  maxHp: 100,
  /** Seconds a downed marine can wait for a revive before dying. */
  bleedOutTime: 20,
  /** Seconds a teammate must stand next to a downed marine to revive them. */
  reviveTime: 3,
  reviveRadius: 70,
  /** HP restored on revive (fraction of max). */
  reviveHpFraction: 0.4,
  /** Short invulnerability after being hit / revived (seconds). */
  hurtInvuln: 0.25,
  reviveInvuln: 2,
} as const;

export const PICKUP = {
  radius: 30,
  lifetime: 35,
  medkitHeal: 40,
} as const;

export const PLAYER_COLORS = ['#4fa3ff', '#ffb02e', '#5fe07a', '#e05fd5'] as const;
