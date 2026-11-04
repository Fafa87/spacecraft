import { describe, expect, it } from 'vitest';
import { MARINE_SPRINT } from '@sms/shared';
import { weaponDrawn, weaponPose } from '../src/render/Renderer.js';

describe('weaponPose (sprint stow / raise animation)', () => {
  it('is stowed while sprinting, held when ready, raised over the ready delay', () => {
    const D = MARINE_SPRINT.weaponReadyDelayS;
    expect(weaponPose(true, 0)).toBe(0);
    expect(weaponPose(true, D)).toBe(0);
    expect(weaponPose(false, 0)).toBe(1);
    expect(weaponPose(false, D)).toBe(0);
    expect(weaponPose(false, D / 2)).toBeCloseTo(0.5, 9);
    expect(weaponPose(false, D * 0.1)).toBeCloseTo(0.9, 9);
  });
  it('v0.6.0 hotfix: weapon hidden while sprinting, drawn again during the ready delay', () => {
    const D = MARINE_SPRINT.weaponReadyDelayS;
    expect(weaponDrawn(weaponPose(true, 0))).toBe(false);
    expect(weaponDrawn(weaponPose(true, D))).toBe(false);
    expect(weaponDrawn(weaponPose(false, D * 0.5))).toBe(true);
    expect(weaponDrawn(weaponPose(false, 0))).toBe(true);
  });
});
