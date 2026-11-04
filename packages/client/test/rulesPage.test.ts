import { describe, expect, it } from 'vitest';
import {
  defaultContent,
  enemyProjectileDeflectChances,
  expectedDps,
  MARINE_DIRECTIONAL_ARMOUR,
  MARINE_SPRINT,
  PLAYER,
} from '@sms/shared';
import { rulesHtml } from '../src/rules/rulesPage.js';
import { armourTables, dpsMatrix, sprintTable } from '../src/rules/compendium.js';

describe('rules page', () => {
  const html = rulesHtml(defaultContent);
  it('lists every weapon and enemy from the shared tables', () => {
    for (const w of defaultContent.weaponOrder) expect(html).toContain(w.name);
    for (const e of defaultContent.enemies.values()) expect(html).toContain(e.name);
    expect(html).toContain('<details>');
  });
  it('DPS matrix uses the shared expectedDps', () => {
    const w = defaultContent.weaponOrder[0]!;
    const e = defaultContent.enemy('hormagaunt');
    expect(dpsMatrix(defaultContent)).toContain(String(Math.round(expectedDps(w, e))));
  });
  it('has no unfilled placeholders', () => {
    expect(html).not.toMatch(/undefined|NaN|\$\{/);
  });
  it('directional armour + ricochet values come from the shared constants', () => {
    const A = MARINE_DIRECTIONAL_ARMOUR;
    const t = armourTables(defaultContent);
    for (const v of [A.front, A.side, A.rear])
      expect(t).toContain(`×${String(v).replace('.', ',')}`);
    const ch = enemyProjectileDeflectChances(defaultContent.enemies.values());
    for (const v of Object.values(ch).filter((x) => x > 0))
      expect(t).toContain(`${Math.round(v * 100)}%`);
    expect(html).toContain('id="pancerz"');
    expect(html).toContain('Pancerz kierunkowy i rykoszety');
  });
  it('sprint section + compendium values come from MARINE_SPRINT', () => {
    const S = MARINE_SPRINT;
    const c = (v: number) => String(Number(v.toFixed(2))).replace('.', ',');
    expect(html).toContain('id="sprint"');
    expect(html).toContain('Shift');
    expect(html).toContain('SPRINT');
    const t = sprintTable();
    for (const v of [S.speedMul, S.staminaMaxS, S.minToStartS, S.weaponReadyDelayS, 7])
      expect(t).toContain(c(v));
    expect(t).toContain(c(PLAYER.speed * S.speedMul).split(',')[0]);
    expect(html).toContain(`${c(S.weaponReadyDelayS)} s`);
  });
});
