import jsQR from 'jsqr';
import { PNG } from 'pngjs';
import QRCode from 'qrcode';
import { describe, expect, it } from 'vitest';
import { buildJoinUrl, normalizeBase, parseJoinCode, stripJoinParams } from '../src/net/joinUrl.js';

describe('join URL', () => {
  it('respects the deploy base path', () => {
    expect(
      buildJoinUrl({ origin: 'https://fafa87.github.io', base: '/spacecraft/', code: 'abc23' }),
    ).toBe('https://fafa87.github.io/spacecraft/?join=ABC23');
    expect(buildJoinUrl({ origin: 'http://192.168.1.20:5173/', base: '/', code: 'K7QXZ' })).toBe(
      'http://192.168.1.20:5173/?join=K7QXZ',
    );
  });

  it('adds dedicated-host and api params when needed (encoded)', () => {
    const url = buildJoinUrl({
      origin: 'https://x.dev',
      base: 'game',
      code: ' k7-qxz ',
      dedicated: true,
      api: 'https://api.x.dev:8787',
    });
    const u = new URL(url);
    expect(u.pathname).toBe('/game/');
    expect(u.searchParams.get('join')).toBe('K7QXZ');
    expect(u.searchParams.get('ws')).toBe('1');
    expect(u.searchParams.get('api')).toBe('https://api.x.dev:8787');
  });

  it('normalizes base paths', () => {
    expect(normalizeBase('')).toBe('/');
    expect(normalizeBase('./')).toBe('/');
    expect(normalizeBase('/a')).toBe('/a/');
    expect(normalizeBase('a/b/')).toBe('/a/b/');
    expect(normalizeBase('//a//')).toBe('/a/');
  });

  it('parses and strips join params', () => {
    expect(parseJoinCode('?join=k7qxz')).toBe('K7QXZ');
    expect(parseJoinCode('?join=%3Cscript%3E')).toBe('SCRIPT');
    expect(parseJoinCode('?foo=1')).toBe('');
    expect(stripJoinParams('https://h.io/spacecraft/?join=AB&ws=1&debug=1#x')).toBe(
      '/spacecraft/?debug=1#x',
    );
    expect(stripJoinParams('https://h.io/spacecraft/?join=AB')).toBe('/spacecraft/');
  });

  it('round-trips through a real QR code', async () => {
    const url = buildJoinUrl({
      origin: 'https://fafa87.github.io',
      base: '/spacecraft/',
      code: 'K7QXZ',
    });
    const buf = await QRCode.toBuffer(url, { width: 220, margin: 2, errorCorrectionLevel: 'M' });
    const png = PNG.sync.read(buf);
    const decoded = jsQR(new Uint8ClampedArray(png.data), png.width, png.height);
    expect(decoded?.data).toBe(url);
    expect(parseJoinCode(new URL(decoded!.data).search)).toBe('K7QXZ');
  });
});
