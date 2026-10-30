/**
 * `npm run assets` — builds every game asset into packages/client/public/assets/generated:
 *   atlas.png + manifest.json (sprites), sfx/*.wav, music/*.wav, preview.html.
 *
 * Override pipeline: any file in tools/assets-src/overrides/{sprites,sfx,music}
 * named after an asset key replaces the procedural version:
 *   sprites/<key>.png  — a horizontal strip of `frames` frames (any size; scaled to frame size,
 *                        frame order = the sprite's `anims` layout, see docs/ART_PIPELINE.md)
 *   sfx/<key>.wav      — copied as-is (single take), or sfx/<key>_0.wav, <key>_1.wav… (variants)
 *   music/<key>.wav    — copied as-is
 * This is the hook for AI-generated or hand-painted assets.
 *
 * Options: --only=sprites|audio, --fleet=behemoth|leviathan (Tyranid palette).
 * Also writes ui/emblem.png + ui/parchment.png (DOM menu art) and preview.html.
 */
import fs from 'node:fs';
import path from 'node:path';
import { createCanvas, loadImage } from '@napi-rs/canvas';
import { defaultContent, referencedAssetKeys, Rng, type AssetManifest } from '@sms/shared';
import { packShelves } from './atlas/pack.js';
import { SONGS, renderSong } from './audio/music.js';
import { RECIPES } from './audio/recipes.js';
import { renderRecipe, variantCount } from './audio/synth.js';
import { SR } from './audio/dsp.js';
import { decodeWav, encodeWav } from './audio/wav.js';
import { OUT_DIR, OVERRIDES_DIR } from './paths.js';
import { SPRITES, UI_IMAGES, type SpriteDef } from './sprites/index.js';
import { writePreview } from './preview.js';

const args = new Set(process.argv.slice(2));
const only = [...args].find((a) => a.startsWith('--only='))?.slice(7);
const doSprites = !only || only === 'sprites';
const doAudio = !only || only === 'audio';
const ATLAS_WIDTH = 2048;

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
  const px = (s: SpriteDef) => [Math.ceil(s.w * (s.scale ?? 1)), Math.ceil(s.h * (s.scale ?? 1))];
  for (const s of SPRITES) {
    const [w, h] = px(s);
    for (let f = 0; f < s.frames; f++) items.push({ id: `${s.key}#${f}`, w, h });
  }
  const packed = packShelves(items, ATLAS_WIDTH, 2);
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
        if (s.scale && s.scale !== 1) actx.scale(s.scale, s.scale);
        s.draw(actx, f, new Rng(hashKey(s.key) + f * 7919));
      }
      actx.restore();
    }
    const [ax, ay] = s.anchor ?? [0.5, 0.5];
    const [w, h] = px(s);
    manifest.sprites[s.key] = {
      w,
      h,
      ...(s.scale && s.scale !== 1 ? { scale: s.scale } : {}),
      ...(s.anims ? { anims: s.anims } : {}),
      ax: w * ax,
      ay: h * ay,
      frames,
      source: override ? 'override' : 'procedural',
      group: s.group,
    };
  }
  fs.writeFileSync(path.join(OUT_DIR, 'atlas.png'), await atlas.encode('png'));
  await writeUiImages();
  manifest.atlas = { image: 'atlas.png', width: packed.width, height: packed.height };
  console.log(
    `  sprites: ${SPRITES.length} sprites / ${items.length} frames -> atlas ${packed.width}x${packed.height} (${overrides} overrides) in ${Date.now() - t0} ms`,
  );
}

/** Larger standalone images for the DOM menu (emblem + parchment texture). */
async function writeUiImages(): Promise<void> {
  fs.mkdirSync(path.join(OUT_DIR, 'ui'), { recursive: true });
  for (const img of UI_IMAGES) {
    const ov = path.join(OVERRIDES_DIR, 'ui', `${img.key}.png`);
    const out = path.join(OUT_DIR, 'ui', `${img.key}.png`);
    if (fs.existsSync(ov)) {
      fs.copyFileSync(ov, out);
      continue;
    }
    const c = createCanvas(img.w, img.h);
    img.draw(c.getContext('2d'), new Rng(hashKey(img.key)));
    fs.writeFileSync(out, await c.encode('png'));
  }
}

function buildAudio(manifest: AssetManifest): void {
  const t0 = Date.now();
  const sfxDir = path.join(OUT_DIR, 'sfx');
  fs.mkdirSync(sfxDir, { recursive: true });
  fs.mkdirSync(path.join(OUT_DIR, 'music'), { recursive: true });
  // stale renders of removed / renamed sounds would otherwise ship forever
  for (const f of fs.readdirSync(sfxDir)) if (f.endsWith('.wav')) fs.rmSync(path.join(sfxDir, f));
  let overrides = 0;
  let files = 0;
  for (const r of RECIPES) {
    // overrides: sfx/<key>.wav (single take) or sfx/<key>_0.wav, <key>_1.wav ... (variants)
    const ovDir = path.join(OVERRIDES_DIR, 'sfx');
    const ovSingle = path.join(ovDir, `${r.key}.wav`);
    const ovVariants = fs.existsSync(ovDir)
      ? fs
          .readdirSync(ovDir)
          .filter((f) => new RegExp(`^${r.key}_\\d+\\.wav$`).test(f))
          .sort()
          .map((f) => path.join(ovDir, f))
      : [];
    const takes: Buffer[] = [];
    let source: 'override' | 'procedural' = 'procedural';
    if (fs.existsSync(ovSingle) || ovVariants.length) {
      for (const f of fs.existsSync(ovSingle) ? [ovSingle] : ovVariants)
        takes.push(fs.readFileSync(f));
      source = 'override';
      overrides++;
    } else for (let v = 0; v < variantCount(r); v++) takes.push(encodeWav(renderRecipe(r, v), SR));
    const variants: string[] = [];
    let dur = 0;
    takes.forEach((buf, i) => {
      const file = `sfx/${r.key}_${i}.wav`;
      fs.writeFileSync(path.join(OUT_DIR, file), buf);
      variants.push(file);
      const wav = decodeWav(buf);
      dur = Math.max(dur, wav.samples.length / wav.channels / wav.sampleRate);
      files++;
    });
    manifest.sounds[r.key] = {
      file: variants[0],
      variants,
      volume: r.volume,
      maxVoices: r.maxVoices,
      durationSec: +dur.toFixed(3),
      source,
      bus: r.bus,
      priority: r.priority,
      ...(r.loop ? { loop: true } : {}),
      ...(r.duck ? { duck: r.duck } : {}),
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
    `  audio: ${RECIPES.length} sfx (${files} variant files) + ${SONGS.length} music tracks (${overrides} overrides) in ${Date.now() - t0} ms`,
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
