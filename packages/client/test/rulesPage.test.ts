import { describe, expect, it } from 'vitest';
import { defaultContent, expectedDps } from '@sms/shared';
import { rulesHtml } from '../src/rules/rulesPage.js';
import { dpsMatrix } from '../src/rules/compendium.js';

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
});
