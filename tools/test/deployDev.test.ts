import { describe, expect, it } from 'vitest';
import { isDevPath } from '../../scripts/deploy-dev.js';

describe('deploy:dev guard', () => {
  it('only accepts paths inside dev/', () => {
    expect(isDevPath('dev')).toBe(true);
    expect(isDevPath('dev/index.html')).toBe(true);
    expect(isDevPath('dev/assets/main.js')).toBe(true);
    expect(isDevPath('index.html')).toBe(false);
    expect(isDevPath('versions.json')).toBe(false);
    expect(isDevPath('v0.6.0/index.html')).toBe(false);
    expect(isDevPath('devtools/x')).toBe(false);
  });
});
