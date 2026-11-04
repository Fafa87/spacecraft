/**
 * Directional power armour (v0.5.3-dev): a marine's front plate shrugs off more than his
 * flanks, and the backpack/rear is the weak spot. "Front" is the marine's facing, which is his
 * aim direction (`Player.aim`). The incoming direction is the damage source: the attacker for
 * melee/charges, the incoming travel direction for projectiles, the blast centre for explosions.
 *
 * Arcs are measured from the facing: within ±frontArcDeg → `front`; within ±rearArcDeg of
 * directly behind → `rear`; everything in between → `side`. Hits with no source position
 * (overheat self-damage, a blast centred exactly on the marine) use `side` (= unmodified).
 */
export const MARINE_DIRECTIONAL_ARMOUR = {
  /** Half-width of the front arc, degrees (front arc = 90° total). */
  frontArcDeg: 45,
  /** Half-width of the rear arc, degrees (rear arc = 90° total, centred on the back). */
  rearArcDeg: 45,
  front: 0.7,
  side: 1.0,
  rear: 1.3,
} as const;

export type ArmourArc = 'front' | 'side' | 'rear';

const DEG = Math.PI / 180;
const FRONT_COS = Math.cos(MARINE_DIRECTIONAL_ARMOUR.frontArcDeg * DEG);
const REAR_COS = -Math.cos(MARINE_DIRECTIONAL_ARMOUR.rearArcDeg * DEG);

/**
 * Which armour arc a hit lands on. `facing` = marine aim (radians); (dx, dy) = vector from the
 * marine towards the damage source (need not be normalised). Zero vector → 'side'.
 * Pure arithmetic (dot product, no RNG) so it's deterministic on host and in replays.
 */
export function armourArc(facing: number, dx: number, dy: number): ArmourArc {
  const len = Math.hypot(dx, dy);
  if (!(len > 1e-6)) return 'side';
  const c = (Math.cos(facing) * dx + Math.sin(facing) * dy) / len;
  // Boundaries are inclusive for the front/rear arcs (exactly 45° counts as front).
  if (c >= FRONT_COS - 1e-9) return 'front';
  if (c <= REAR_COS + 1e-9) return 'rear';
  return 'side';
}

/** Damage multiplier for a hit from (dx, dy) relative to the marine, given its facing. */
export function armourMul(facing: number, dx: number, dy: number): number {
  return MARINE_DIRECTIONAL_ARMOUR[armourArc(facing, dx, dy)];
}

/**
 * Front-plate deflection: an enemy projectile (not melee, not blasts) striking the FRONT arc may
 * ricochet off the ceramite. The weakest Tyranid shot glances off `maxChance` of the time;
 * harder-hitting shots less often: chance = maxChance × weakestDamage / damage, clamped to
 * [minChance, maxChance]. "Damage" is the projectile's base `damage` from the enemy table
 * (synapse buffs don't change the odds). Explosive shells (Biovore spore) never deflect: they
 * burst on impact. A deflected shot does no damage, is mirrored off the plate (small seeded
 * jitter, slowed), turns harmless to everyone and fades out within `fadeTime` seconds.
 */
export const MARINE_DEFLECTION = {
  maxChance: 0.3,
  minChance: 0.05,
  /** Max ± rotation (radians) applied to the mirrored direction. */
  jitter: 0.35,
  /** Speed multiplier of the ricochet. */
  speedMul: 0.6,
  /** Seconds the harmless ricochet lives before vanishing. */
  fadeTime: 0.25,
} as const;

/** Minimal slice of an enemy def used here (keeps this file free of the registry). */
interface RangedEnemyLike {
  ranged?: { projectile: { kind: string; damage: number; explosion?: unknown } };
}

/** Deflection chance per enemy projectile kind (0 for explosive / harmless shots). */
export function enemyProjectileDeflectChances(
  enemies: Iterable<RangedEnemyLike>,
): Record<string, number> {
  const specs = [...enemies].flatMap((e) => (e.ranged ? [e.ranged.projectile] : []));
  const direct = specs.filter((s) => !s.explosion && s.damage > 0);
  const weakest = Math.min(...direct.map((s) => s.damage));
  const out: Record<string, number> = {};
  const { maxChance, minChance } = MARINE_DEFLECTION;
  for (const s of specs) {
    out[s.kind] =
      s.explosion || !(s.damage > 0)
        ? 0
        : Math.min(maxChance, Math.max(minChance, (maxChance * weakest) / s.damage));
  }
  return out;
}
