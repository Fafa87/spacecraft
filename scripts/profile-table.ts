/**
 * Prints the WH40k-style weapon vs Tyranid matrix from the content data: seconds to kill one
 * enemy (wave-1 HP, sustained DPS incl. reloads, every shot hitting) and the expected % of each
 * hit's damage that gets through Toughness and the armour save.
 *
 *   npx tsx scripts/profile-table.ts
 */
import { defaultContent as c, expectedHitMul, sustainedDps, weaponProfileLabel } from '@sms/shared';

const ws = c.weaponOrder;
const pad = (s: string, n: number) => s.padStart(n);
console.log(
  'seconds to kill (single target)'.padEnd(26),
  ws.map((w) => pad(w.id.slice(0, 12), 13)).join(''),
);
console.log(''.padEnd(26), ws.map((w) => pad(weaponProfileLabel(w), 13)).join(''));
for (const e of c.enemies.values()) {
  const row = ws.map((w) => {
    const dps = sustainedDps(w, e);
    const through = expectedHitMul(
      w.projectile.strength !== undefined ? w.projectile : (w.projectile.explosion ?? {}),
      e,
    );
    return pad(`${(e.hp / dps).toFixed(1)}s ${Math.round(through * 100)}%`, 13);
  });
  console.log(
    `${e.id} T${e.toughness} Sv${e.save < 7 ? `${e.save}+` : '-'} ${e.hp}hp`.padEnd(26),
    row.join(''),
  );
}
