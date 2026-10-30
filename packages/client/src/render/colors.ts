import type { ChapterDef } from '@sms/shared';

/** Mixes a #rrggbb colour towards white by `t` (0..1). */
export function lighten(hex: string, t: number): string {
  const n = parseInt(hex.replace('#', '').slice(0, 6), 16);
  if (Number.isNaN(n)) return hex;
  const c = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => Math.round(v + (255 - v) * t));
  return `#${c.map((v) => v.toString(16).padStart(2, '0')).join('')}`;
}

/** Readable UI colour for a chapter (armour colour lifted for dark schemes). */
export function chapterUiColor(ch: ChapterDef): string {
  const n = parseInt(ch.primary.replace('#', '').slice(0, 6), 16);
  const lum = 0.299 * ((n >> 16) & 255) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255);
  return lum < 110 ? lighten(ch.primary, 0.45) : ch.primary;
}
