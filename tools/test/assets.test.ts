import { describe, expect, it } from 'vitest';
import { defaultContent, referencedAssetKeys, CORE_MUSIC } from '@sms/shared';
import { packShelves } from '../src/atlas/pack.js';
import { renderSong, SONGS } from '../src/audio/music.js';
import { renderSfx, SFX } from '../src/audio/sfxPresets.js';
import { decodeWav, encodeWav, normalize } from '../src/audio/wav.js';
import { SPRITES } from '../src/sprites/index.js';

describe('asset coverage', () => {
  const refs = referencedAssetKeys(defaultContent);
  it('every referenced sprite has a generator', () => {
    const have = new Set(SPRITES.map((s) => s.key));
    expect(refs.sprites.filter((k) => !have.has(k))).toEqual([]);
  });
  it('every referenced sound has a preset', () => {
    const have = new Set(SFX.map((s) => s.key));
    expect(refs.sounds.filter((k) => !have.has(k))).toEqual([]);
  });
  it('every core music track has a song spec', () => {
    const have = new Set(SONGS.map((s) => s.key));
    expect(CORE_MUSIC.filter((k) => !have.has(k))).toEqual([]);
  });
  it('sprite keys are unique and carry prompts', () => {
    expect(new Set(SPRITES.map((s) => s.key)).size).toBe(SPRITES.length);
    for (const s of SPRITES) expect(s.prompt.length).toBeGreaterThan(5);
  });
});

describe('atlas packer', () => {
  it('packs without overlaps inside the atlas', () => {
    const items = Array.from({ length: 80 }, (_, i) => ({
      id: `s${i}`,
      w: 8 + ((i * 37) % 90),
      h: 8 + ((i * 53) % 70),
    }));
    const res = packShelves(items, 512, 2);
    const rects = [...res.rects.values()];
    expect(rects).toHaveLength(items.length);
    for (const r of rects) {
      expect(r.x + r.w).toBeLessThanOrEqual(res.width);
      expect(r.y + r.h).toBeLessThanOrEqual(res.height);
    }
    for (let i = 0; i < rects.length; i++)
      for (let j = i + 1; j < rects.length; j++) {
        const a = rects[i];
        const b = rects[j];
        const overlap = a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
        expect(overlap).toBe(false);
      }
  });
  it('rejects sprites wider than the atlas', () => {
    expect(() => packShelves([{ id: 'big', w: 2000, h: 10 }], 1024)).toThrow();
  });
});

describe('audio', () => {
  it('WAV encode/decode round-trips', () => {
    const s = new Float32Array(1000).map((_, i) => Math.sin(i / 10) * 0.5);
    const wav = encodeWav(s, 22050);
    const d = decodeWav(wav);
    expect(d.sampleRate).toBe(22050);
    expect(d.samples.length).toBe(1000);
    for (let i = 0; i < 1000; i += 97) expect(d.samples[i]).toBeCloseTo(s[i], 3);
  });
  it('normalize hits the requested peak', () => {
    const n = normalize(new Float32Array([0.1, -0.2, 0.05]), 0.9);
    expect(Math.max(...[...n].map(Math.abs))).toBeCloseTo(0.9, 5);
  });
  it('sfx render non-silent, bounded and deterministic', () => {
    for (const def of SFX.slice(0, 6)) {
      const a = renderSfx(def, 22050);
      expect(a.length).toBeGreaterThan(100);
      expect(Math.max(...[...a].map(Math.abs))).toBeGreaterThan(0.01);
      expect([...a].every((v) => Number.isFinite(v) && Math.abs(v) <= 1.0001)).toBe(true);
      expect(renderSfx(def, 22050)).toEqual(a);
    }
  });
  it('songs have the length implied by bpm and bars', () => {
    const spec = SONGS[0];
    const sr = 8000;
    const pcm = renderSong(spec, sr);
    const expected = ((spec.bars * 4 * 60) / spec.bpm) * sr;
    expect(Math.abs(pcm.length - expected) / expected).toBeLessThan(0.05);
  });
});
