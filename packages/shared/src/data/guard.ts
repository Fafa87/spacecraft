/**
 * Defensive stance ("guard"): a holdable brace that raises the front plate. Entered only while
 * standing still; any real movement input cancels it immediately. Distinct from a heavy weapon's
 * auto-brace (fire-rate / tighter cone after standing still) — that stays on `braceDelay`.
 *
 * While guarding:
 *   - front damage multiplier becomes `frontMul` (armour +100% vs the idle front plate:
 *     idle front 0.7 → 0.35);
 *   - front-plate deflection chance rises: non-deflect chance is halved
 *     (`deflect' = 1 − nonDeflectFactor·(1 − base)`);
 *   - a front projectile that still lands (no deflect) takes a further `landedDamageMul`
 *     (−30% by default). Melee / blasts get the stronger front plate only.
 *
 * Constants live here; the Polish rules page and the compendium read them live.
 */
import { MARINE_DIRECTIONAL_ARMOUR } from './armour.js';

export const MARINE_GUARD = {
  /**
   * Front damage multiplier while guarding. Equals idle front / (1 + armourBonus)
   * with armourBonus 1 (= +100% front armour). Documented as "pancerz przedni +100%".
   */
  frontMul: MARINE_DIRECTIONAL_ARMOUR.front / 2,
  /** Idle-front ÷ guarding-front − 1; kept explicit so the rules page can say "+100%". */
  frontArmourBonus: 1,
  /** Factor applied to (1 − baseDeflectChance) while guarding (0.5 = non-deflect halved). */
  nonDeflectFactor: 0.5,
  /** Extra damage multiplier for a front projectile that lands (no deflect) while guarding. */
  landedDamageMul: 0.7,
} as const;

/** True when the marine may hold the defensive stance this tick. */
export function canGuard(alive: boolean, moving: boolean): boolean {
  return alive && !moving;
}

/** Effective guard this tick: input held and standing still while alive. */
export function isGuarding(want: boolean, alive: boolean, moving: boolean): boolean {
  return want && canGuard(alive, moving);
}

/**
 * Deflection chance while guarding: non-deflect chance × nonDeflectFactor.
 * `base` already 0 for explosives / harmless shots — stays 0.
 */
export function guardDeflectChance(base: number): number {
  if (!(base > 0)) return 0;
  const f = MARINE_GUARD.nonDeflectFactor;
  return 1 - f * (1 - base);
}
