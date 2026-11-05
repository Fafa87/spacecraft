import { describe, expect, it } from 'vitest';
import type { RunResult } from '@sms/shared';
import {
  boardFor,
  DEV_BOARD,
  DEV_RUN_VERSION,
  isDevBoardVersion,
  runForBoard,
} from '../src/devPreview.js';
import { siteRoot } from '../src/ui/versions.js';

describe('Dev preview (/dev/)', () => {
  it('uses its own leaderboard board only when built as a preview', () => {
    expect(DEV_BOARD).toBe('0.0.0');
    expect(boardFor('0.6.0', null)).toBe('0.6.0');
    expect(boardFor('0.6.0', 'abc1234')).toBe('0.0.0');
  });

  it('re-tags preview runs so the rules accept them on boards/0.0.0 (and nowhere else)', () => {
    const r = { runId: 'run_x', version: '0.6.0' } as RunResult;
    expect(runForBoard(r, null)).toBe(r);
    expect(runForBoard(r, 'abc1234').version).toBe(DEV_RUN_VERSION);
    // firestore.rules boardVersion: version.split('[-+]')[0] == board
    expect(DEV_RUN_VERSION.split(/[-+]/)[0]).toBe(DEV_BOARD);
    expect(DEV_RUN_VERSION).toMatch(/^\d{1,3}\.\d{1,3}\.\d{1,3}(?:-[0-9A-Za-z.]{1,12})?$/);
  });

  it('re-tags aliased releases (0.6.1 → 0.6.0-0.6.1) so published rules accept the shared board', () => {
    const r = { runId: 'run_y', version: '0.6.1' } as RunResult;
    expect(runForBoard(r, null).version).toBe('0.6.0-0.6.1');
    expect(runForBoard(r, null).version.split(/[-+]/)[0]).toBe('0.6.0');
    expect(runForBoard({ ...r, version: '0.6.1-test' } as RunResult, null).version).toBe(
      '0.6.0-test',
    );
  });

  it('never lists the dev board as a real version', () => {
    expect(isDevBoardVersion('0.0.0')).toBe(true);
    expect(isDevBoardVersion('0.0.0-dev')).toBe(true);
    expect(isDevBoardVersion('0.6.0')).toBe(false);
    expect(isDevBoardVersion('10.0.0')).toBe(false);
  });

  it('reads the shared versions.json from the site root', () => {
    expect(siteRoot('/spacecraft/dev/')).toBe('/spacecraft/');
    expect(siteRoot('/spacecraft/dev')).toBe('/spacecraft/');
    expect(siteRoot('/spacecraft/devx/')).toBe('/spacecraft/devx/');
  });
});
