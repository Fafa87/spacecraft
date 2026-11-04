import { describe, expect, it } from 'vitest';
import { boardFor, DEV_BOARD } from '../src/devPreview.js';
import { siteRoot } from '../src/ui/versions.js';

describe('Dev preview (/dev/)', () => {
  it('uses its own leaderboard board only when built as a preview', () => {
    expect(DEV_BOARD).toBe('dev');
    expect(boardFor('0.6', null)).toBe('0.6');
    expect(boardFor('0.6', 'abc1234')).toBe('dev');
  });

  it('reads the shared versions.json from the site root', () => {
    expect(siteRoot('/spacecraft/dev/')).toBe('/spacecraft/');
    expect(siteRoot('/spacecraft/dev')).toBe('/spacecraft/');
    expect(siteRoot('/spacecraft/devx/')).toBe('/spacecraft/devx/');
  });
});
