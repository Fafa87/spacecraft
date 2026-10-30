import { PICKUP, PLAYER } from '../../constants.js';
import { dist2 } from '../../math/vec.js';
import type { World } from '../types.js';
import { grantWeapon } from './weapons.js';

export function updatePickups(world: World, dt: number): void {
  const r = PICKUP.radius + PLAYER.radius;
  for (const pk of world.pickups) {
    pk.life -= dt;
    if (pk.life <= 0) continue;
    for (const p of world.players) {
      if (p.state !== 'alive') continue;
      if (dist2(pk.x, pk.y, p.x, p.y) > r * r) continue;
      if (pk.kind === 'medkit') {
        if (p.hp >= p.maxHp) continue;
        p.hp = Math.min(p.maxHp, p.hp + PICKUP.medkitHeal);
      } else if (pk.weapon) {
        if (!grantWeapon(world, p, pk.weapon)) {
          // Already owned: refill that weapon and patch up a little.
          p.ammo[pk.weapon] = world.content.weapon(pk.weapon).magazine;
          p.hp = Math.min(p.maxHp, p.hp + PICKUP.medkitHeal / 2);
        }
      }
      world.events.push({ e: 'pickup', p: p.id, k: pk.kind, w: pk.weapon });
      pk.life = 0;
      break;
    }
  }
  world.pickups = world.pickups.filter((pk) => pk.life > 0);
}
