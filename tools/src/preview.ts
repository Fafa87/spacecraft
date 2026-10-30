import fs from 'node:fs';
import type { AssetManifest } from '@sms/shared';

/** Writes a self-contained HTML contact sheet for the generated assets. */
export function writePreview(m: AssetManifest, file: string): void {
  const sprites = Object.entries(m.sprites)
    .map(([key, s]) => {
      const frames = s.frames
        .map(
          ([x, y]) =>
            `<div class="f" style="width:${s.w}px;height:${s.h}px;background:url(${m.atlas.image}) -${x}px -${y}px"></div>`,
        )
        .join('');
      // Frames are shown at atlas resolution (scale × world size).
      const anims = s.anims
        ? ' · ' +
          Object.entries(s.anims)
            .map(([n, [a, c]]) => `${n} ${a}-${a + c - 1}`)
            .join(', ')
        : '';
      return `<div class="card"><div class="frames">${frames}</div><code>${key}</code><small>${s.group} · ${s.frames.length}f · ×${s.scale ?? 1}${anims} · ${s.source}</small></div>`;
    })
    .join('\n');
  const sounds = Object.entries(m.sounds)
    .map(([key, s]) => `<button onclick="new Audio('${s.file}').play()">▶ ${key}</button>`)
    .join(' ');
  const music = Object.entries(m.music)
    .map(
      ([key, s]) =>
        `<div><b>${key}</b> (${s.durationSec}s) <audio controls loop src="${s.file}"></audio></div>`,
    )
    .join('\n');
  fs.writeFileSync(
    file,
    `<!doctype html><meta charset="utf-8"><title>Asset preview</title>
<style>body{background:#15171b;color:#ddd;font:13px system-ui;margin:20px}.grid{display:flex;flex-wrap:wrap;gap:10px}
.card{background:#22252b;padding:8px;border-radius:6px;display:flex;flex-direction:column;gap:4px}.frames{display:flex;gap:4px;flex-wrap:wrap;max-width:900px}
.f{image-rendering:pixelated;outline:1px dashed #333}small{color:#888}button{margin:3px;background:#2d3139;color:#ddd;border:1px solid #444;padding:4px 8px;border-radius:4px;cursor:pointer}</style>
<h1>Spacecraft: Hive Siege — generated assets</h1><p>Generated ${m.generatedAt}. Atlas ${m.atlas.width}×${m.atlas.height}.</p>
<h2>Sprites</h2><div class="grid">${sprites}</div><h2>Sound effects</h2><div>${sounds}</div><h2>Music</h2>${music}
<h2>Atlas</h2><img src="${m.atlas.image}" style="background:#333">`,
  );
}
