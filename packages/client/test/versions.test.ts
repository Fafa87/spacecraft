import { describe, expect, it } from 'vitest';
import { siteRoot } from '../src/ui/versions.js';

describe('Previous versions: site root', () => {
  it('strips a frozen vX.Y.Z/ folder so every build reads the same versions.json', () => {
    expect(siteRoot('/spacecraft/')).toBe('/spacecraft/');
    expect(siteRoot('/spacecraft/v0.1.0/')).toBe('/spacecraft/');
    expect(siteRoot('/spacecraft/v10.2.33/')).toBe('/spacecraft/');
    expect(siteRoot('/')).toBe('/');
    expect(siteRoot('/spacecraft/v0.1/')).toBe('/spacecraft/v0.1/');
  });
});
