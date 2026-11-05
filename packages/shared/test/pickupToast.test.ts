/** Crate pickup must not double-fire unlock+pickup toasts for a new weapon. */
import { describe, expect, it } from 'vitest';
import { createWorld, grantWeapon, type World } from '../src/sim/index.js';
import { updatePickups } from '../src/sim/systems/pickups.js';
import { unlockWaveWeapons } from '../src/sim/systems/weapons.js';

function world(): World {
  const w = createWorld([{ id: 1, name: 'M1' }], 7);
  w.director.idle = true;
  return w;
}

describe('weapon crate pickup announcements', () => {
  it('new crate grant emits pickup only (no unlock) so the HUD toasts once', () => {
    const w = world();
    const p = w.players[0]!;
    expect(p.weapons.includes('plasma_gun')).toBe(false);
    w.pickups.push({
      id: 99,
      kind: 'weapon',
      weapon: 'plasma_gun',
      x: p.x,
      y: p.y,
      life: 30,
    });
    w.events.length = 0;
    updatePickups(w, 1 / 60);
    expect(p.weapons.includes('plasma_gun')).toBe(true);
    const unlocks = w.events.filter((e) => e.e === 'unlock');
    const pickups = w.events.filter((e) => e.e === 'pickup');
    expect(unlocks).toHaveLength(0);
    expect(pickups).toEqual([{ e: 'pickup', p: p.id, k: 'weapon', w: 'plasma_gun' }]);
  });

  it('already-owned crate still emits a single pickup (ammo refill path)', () => {
    const w = world();
    const p = w.players[0]!;
    grantWeapon(w, p, 'plasma_gun', { announce: false });
    p.ammo.plasma_gun = 1;
    w.pickups.push({
      id: 100,
      kind: 'weapon',
      weapon: 'plasma_gun',
      x: p.x,
      y: p.y,
      life: 30,
    });
    w.events.length = 0;
    updatePickups(w, 1 / 60);
    expect(p.ammo.plasma_gun).toBe(w.content.weapon('plasma_gun').magazine);
    expect(w.events.filter((e) => e.e === 'unlock')).toHaveLength(0);
    expect(w.events.filter((e) => e.e === 'pickup')).toHaveLength(1);
  });

  it('wave unlocks still emit unlock (banner for shared arsenal grants)', () => {
    const w = world();
    const p = w.players[0]!;
    w.events.length = 0;
    unlockWaveWeapons(w, 5); // plasma_gun
    expect(p.weapons.includes('plasma_gun')).toBe(true);
    expect(w.events.filter((e) => e.e === 'unlock' && e.w === 'plasma_gun')).toHaveLength(1);
  });
});
