/**
 * `npm run assets` — builds every game asset into packages/client/public/assets/generated:
 *   atlas.png + manifest.json (sprites), sfx/*.wav, music/*.wav, preview.html.
 *
 * Override pipeline: any file in tools/assets-src/overrides/{sprites,sfx,music}
 * named after an asset key replaces the procedural version:
 *   sprites/<key>.png  — a horizontal strip of `frames` frames (any size; scaled to frame size)
 *   sfx/<key>.wav      — copied as-is
 *   music/<key>.wav    — copied as-is
 * This is the hook for AI-generated or hand-drawn assets.
 */
import fs from 'node:fs';
import path from 'node:path';
import { createCanvas, loadImage } from '@napi-rs/canvas';
import { defaultContent, referencedAssetKeys, Rng, type AssetManifest } from '@sms/shared';
import { packShelves } from './atlas/pack.js';
import { SONGS, renderSong } from './audio/music.js';
import { SFX, renderSfx } from './audio/sfxPresets.js';
import { decodeWav, encodeWav } from './audio/wav.js';
import { OUT_DIR, OVERRIDES_DIR } from './paths.js';
import { SPRITES } from './sprites/index.js';
import { writePreview } from './preview.js';

const args = new Set(process.argv.slice(2));
const only = [...args].find((a) => a.startsWith('--only='))?.slice(7);
const doSprites = !only || only === 'sprites';
const doAudio = !only || only === 'audio';

function hashKey(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}

function loadExistingManifest(): AssetManifest | null {
  try {
    return JSON.parse(
      fs.readFileSync(path.join(OUT_DIR, 'manifest.json'), 'utf8'),
    ) as AssetManifest;
  } catch {
    return null;
  }
}

async function buildSprites(manifest: AssetManifest): Promise<void> {
  const t0 = Date.now();
  const items: Array<{ id: string; w: number; h: number }> = [];
  for (const s of SPRITES)
    for (let f = 0; f < s.frames; f++) items.push({ id: `${s.key}#${f}`, w: s.w, h: s.h });
  const packed = packShelves(items, 1024, 2);
  const atlas = createCanvas(packed.width, packed.height);
  const actx = atlas.getContext('2d');
  let overrides = 0;

  for (const s of SPRITES) {
    const overridePath = path.join(OVERRIDES_DIR, 'sprites', `${s.key}.png`);
    const override = fs.existsSync(overridePath) ? await loadImage(overridePath) : null;
    if (override) overrides++;
    const frames: Array<[number, number]> = [];
    for (let f = 0; f < s.frames; f++) {
      const r = packed.rects.get(`${s.key}#${f}`)!;
      frames.push([r.x, r.y]);
      actx.save();
      actx.beginPath();
      actx.rect(r.x, r.y, r.w, r.h);
      actx.clip();
      if (override) {
        const fw = override.width / s.frames;
        actx.drawImage(override, fw * f, 0, fw, override.height, r.x, r.y, r.w, r.h);
      } else {
        actx.translate(r.x, r.y);
        s.draw(actx, f, new Rng(hashKey(s.key) + f * 7919));
      }
      actx.restore();
    }
    const [ax, ay] = s.anchor ?? [0.5, 0.5];
    manifest.sprites[s.key] = {
      w: s.w,
      h: s.h,
      ax: s.w * ax,
      ay: s.h * ay,
      frames,
      source: override ? 'override' : 'procedural',
      group: s.group,
    };
  }
  fs.writeFileSync(path.join(OUT_DIR, 'atlas.png'), await atlas.encode('png'));
  manifest.atlas = { image: 'atlas.png', width: packed.width, height: packed.height };
  console.log(
    `  sprites: ${SPRITES.length} sprites / ${items.length} frames -> atlas ${packed.width}x${packed.height} (${overrides} overrides) in ${Date.now() - t0} ms`,
  );
}

function buildAudio(manifest: AssetManifest): void {
  const t0 = Date.now();
  fs.mkdirSync(path.join(OUT_DIR, 'sfx'), { recursive: true });
  fs.mkdirSync(path.join(OUT_DIR, 'music'), { recursive: true });
  let overrides = 0;
  for (const def of SFX) {
    const file = `sfx/${def.key}.wav`;
    const ov = path.join(OVERRIDES_DIR, 'sfx', `${def.key}.wav`);
    let buf: Buffer;
    let source: 'override' | 'procedural' = 'procedural';
    if (fs.existsSync(ov)) {
      buf = fs.readFileSync(ov);
      source = 'override';
      overrides++;
    } else buf = encodeWav(renderSfx(def), 44100);
    fs.writeFileSync(path.join(OUT_DIR, file), buf);
    const wav = decodeWav(buf);
    manifest.sounds[def.key] = {
      file,
      volume: def.volume,
      maxVoices: def.maxVoices,
      durationSec: +(wav.samples.length / wav.channels / wav.sampleRate).toFixed(3),
      source,
    };
  }
  for (const song of SONGS) {
    const file = `music/${song.key}.wav`;
    const ov = path.join(OVERRIDES_DIR, 'music', `${song.key}.wav`);
    let buf: Buffer;
    let source: 'override' | 'procedural' = 'procedural';
    if (fs.existsSync(ov)) {
      buf = fs.readFileSync(ov);
      source = 'override';
      overrides++;
    } else buf = encodeWav(renderSong(song, 22050), 22050);
    fs.writeFileSync(path.join(OUT_DIR, file), buf);
    const wav = decodeWav(buf);
    manifest.music[song.key] = {
      file,
      volume: song.volume,
      loop: true,
      durationSec: +(wav.samples.length / wav.channels / wav.sampleRate).toFixed(2),
      source,
    };
  }
  console.log(
    `  audio: ${SFX.length} sfx + ${SONGS.length} music tracks (${overrides} overrides) in ${Date.now() - t0} ms`,
  );
}

function checkCoverage(manifest: AssetManifest): string[] {
  const refs = referencedAssetKeys(defaultContent);
  const missing: string[] = [];
  for (const k of refs.sprites) if (!manifest.sprites[k]) missing.push(`sprite:${k}`);
  for (const k of refs.sounds) if (!manifest.sounds[k]) missing.push(`sound:${k}`);
  return missing;
}

async function main(): Promise<void> {
  console.log(`Generating assets -> ${path.relative(process.cwd(), OUT_DIR) || OUT_DIR}`);
  fs.mkdirSync(OUT_DIR, { recursive: true });
  const prev = loadExistingManifest();
  const manifest: AssetManifest = {
    version: 1,
    generatedAt: new Date().toISOString(),
    atlas: prev?.atlas ?? { image: 'atlas.png', width: 0, height: 0 },
    sprites: doSprites ? {} : (prev?.sprites ?? {}),
    sounds: doAudio ? {} : (prev?.sounds ?? {}),
    music: doAudio ? {} : (prev?.music ?? {}),
  };
  if (doSprites) await buildSprites(manifest);
  if (doAudio) buildAudio(manifest);
  fs.writeFileSync(path.join(OUT_DIR, 'manifest.json'), JSON.stringify(manifest, null, 2));
  writePreview(manifest, path.join(OUT_DIR, 'preview.html'));
  const missing = checkCoverage(manifest);
  if (missing.length) {
    console.error(`  MISSING assets referenced by content: ${missing.join(', ')}`);
    process.exitCode = 1;
  } else console.log('  coverage: every asset referenced by content data exists ✓');
  console.log(
    `Done. Open ${path.join(OUT_DIR, 'preview.html')} (or /assets/generated/preview.html on the dev server) to browse.`,
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
