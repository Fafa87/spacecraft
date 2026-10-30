import { PLAYER } from '../../constants.js';
import type { WeaponDef } from '../../data/index.js';
import { allocId } from '../world.js';
import type { Player, World } from '../types.js';

/** Grants a weapon to a player (no-op if owned). Returns true if newly granted. */
export function grantWeapon(world: World, player: Player, weaponId: string): boolean {
  if (player.weapons.includes(weaponId)) return false;
  const def = world.content.weapon(weaponId);
  player.weapons.push(weaponId);
  player.weapons.sort((a, b) => world.content.weapon(a).slot - world.content.weapon(b).slot);
  player.ammo[weaponId] = def.magazine;
  world.events.push({ e: 'unlock', p: player.id, w: weaponId });
  return true;
}

/** Time-based unlocks: every marine gets the weapon when survival time crosses `unlockAtSec`. */
export function updateTimedUnlocks(world: World, prevTime: number): void {
  for (const def of world.content.weaponOrder) {
    if (def.unlockAtSec === null || def.unlockAtSec <= 0) continue;
    if (prevTime < def.unlockAtSec && world.time >= def.unlockAtSec) {
      for (const p of world.players) if (p.state !== 'dead') grantWeapon(world, p, def.id);
    }
  }
}

export function updatePlayerWeapon(world: World, p: Player, dt: number): void {
  if (p.state !== 'alive') {
    p.triggerWasDown = false;
    return;
  }
  const input = p.input;
  p.aim = input.aim;

  // Weapon switching.
  if (input.slot > 0) {
    const target = p.weapons.find((id) => world.content.weapon(id).slot === input.slot);
    if (target && target !== p.current) {
      p.current = target;
      p.reloadTimer = 0;
      p.fireCooldown = Math.max(p.fireCooldown, 0.15);
      world.events.push({ e: 'switch', p: p.id, w: target });
    }
  }

  const def = world.content.weapon(p.current);
  p.fireCooldown = Math.max(0, p.fireCooldown - dt);

  if (p.reloadTimer > 0) {
    p.reloadTimer -= dt;
    if (p.reloadTimer <= 0) {
      p.reloadTimer = 0;
      p.ammo[def.id] = def.magazine;
    }
  } else if (input.reload && p.ammo[def.id] < def.magazine) {
    startReload(world, p, def);
  }

  const wantsFire = input.fire && (def.automatic || !p.triggerWasDown);
  p.triggerWasDown = input.fire;
  if (!wantsFire || p.reloadTimer > 0) return;

  // Fire as many shots as the cooldown allows this tick (fast weapons > tick rate).
  let guard = 0;
  while (p.fireCooldown <= 0 && guard++ < 8) {
    if (p.ammo[def.id] <= 0) {
      startReload(world, p, def);
      return;
    }
    fireWeapon(world, p, def);
    p.ammo[def.id]--;
    p.fireCooldown += def.fireInterval;
    if (!def.automatic) break;
  }
  if (p.ammo[def.id] <= 0) startReload(world, p, def);
}

function startReload(world: World, p: Player, def: WeaponDef): void {
  if (p.reloadTimer > 0) return;
  p.reloadTimer = def.reloadTime;
  world.events.push({ e: 'reload', p: p.id, w: def.id });
}

export function fireWeapon(world: World, p: Player, def: WeaponDef): void {
  const spec = def.projectile;
  const muzzle = PLAYER.radius + 10;
  const mx = p.x + Math.cos(p.aim) * muzzle;
  const my = p.y + Math.sin(p.aim) * muzzle;
  world.stats.shots++;
  world.events.push({ e: 'shot', p: p.id, w: def.id, x: Math.round(mx), y: Math.round(my), a: Math.round(p.aim * 100) / 100 });
  for (let i = 0; i < def.pellets; i++) {
    const a = p.aim + (world.rng.next() - 0.5) * def.spread;
    const speed = spec.speed * (1 + (world.rng.next() - 0.5) * 2 * (spec.speedJitter ?? 0));
    world.projectiles.push({
      id: allocId(world),
      owner: 'player',
      ownerId: p.id,
      sx: p.x,
      sy: p.y,
      kind: spec.kind,
      x: mx,
      y: my,
      vx: Math.cos(a) * speed,
      vy: Math.sin(a) * speed,
      life: spec.lifetime,
      radius: spec.radius,
      damage: spec.damage,
      pierceLeft: spec.pierce,
      armorPierce: !!spec.armorPierce,
      drag: spec.drag ?? 0,
      knockback: spec.knockback,
      explosion: spec.explosion,
      hit: [],
      dead: false,
    });
  }
}
