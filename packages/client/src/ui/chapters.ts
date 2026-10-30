import type { ChapterDef, ContentRegistry } from '@sms/shared';
import { escapeHtml } from './format.js';

/**
 * Small inline-SVG shoulder badges for the DOM screens. Plain geometry of our own design
 * (chevron, drop, blade, tower, fang, flame, bolt, feather); they deliberately do not replicate any chapter logo.
 */
const ICON_PATHS: Record<ChapterDef['icon'], string> = {
  chevron: 'M4 7 L12 15 L20 7 L20 11 L12 19 L4 11 Z',
  drop: 'M12 3 C12 3 5 11 5 15 A7 7 0 0 0 19 15 C19 11 12 3 12 3 Z',
  blade: 'M11 2 L13 2 L13.5 15 L17 15 L17 17 L13 17 L13 22 L11 22 L11 17 L7 17 L7 15 L10.5 15 Z',
  tower: 'M5 21 L5 6 L8 6 L8 9 L10.5 9 L10.5 6 L13.5 6 L13.5 9 L16 9 L16 6 L19 6 L19 21 Z',
  fang: 'M5 4 L19 4 L16 9 L13 20 L12 21 L11 20 L8 9 Z',
  flame:
    'M12 2 C14 7 18 9 18 15 A6 6 0 0 1 6 15 C6 11 9 10 9 6 C11 8 11 10 12 11 C13 8 13 5 12 2 Z',
  bolt: 'M14 2 L6 13 L11 13 L9 22 L18 10 L13 10 L15 2 Z',
  feather: 'M18 3 C10 5 6 11 6 17 L4 21 L6 21 L8 18 C14 18 18 12 18 3 Z',
};

/** Round shoulder-pad badge: armour colour, trim ring, detail-coloured icon. */
export function chapterBadgeSvg(ch: ChapterDef, size = 22): string {
  return `<svg width="${size}" height="${size}" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="11" fill="${ch.primary}" stroke="${ch.trim}" stroke-width="2"/><path d="${ICON_PATHS[ch.icon]}" transform="translate(12 12) scale(0.62) translate(-12 -12)" fill="${ch.detail}"/></svg>`;
}

export interface ChapterPicker {
  el: HTMLElement;
  /** Marks chapter indices as taken by other players (room screen). */
  setTaken(taken: Set<number>, mine: number | null): void;
}

/** Row of chapter chips; `onPick` gets the chapter id. */
export function createChapterPicker(
  content: ContentRegistry,
  selectedId: string | undefined,
  onPick: (id: string) => void,
): ChapterPicker {
  const el = document.createElement('div');
  el.className = 'chapter-picker';
  const chapters = content.chapters;
  let selected = Math.max(0, selectedId ? content.chapterIndex(selectedId) : 0);
  el.innerHTML = `<div class="chapters" role="radiogroup" aria-label="Chapter">${chapters
    .map(
      (c, i) =>
        `<button type="button" class="chapter-chip" role="radio" data-i="${i}" data-id="${escapeHtml(c.id)}" title="${escapeHtml(c.name)}">${chapterBadgeSvg(c)}<span>${escapeHtml(c.name)}</span></button>`,
    )
    .join('')}</div><div class="chapter-motto"></div>`;
  const motto = el.querySelector('.chapter-motto') as HTMLElement;
  const chips = [...el.querySelectorAll<HTMLButtonElement>('.chapter-chip')];
  const paint = () => {
    chips.forEach((b, i) => {
      b.classList.toggle('selected', i === selected);
      b.setAttribute('aria-checked', String(i === selected));
    });
    motto.textContent = `“${chapters[selected]?.motto ?? ''}”`;
  };
  chips.forEach((b, i) =>
    b.addEventListener('click', () => {
      if (b.disabled) return;
      selected = i;
      paint();
      onPick(chapters[i].id);
    }),
  );
  paint();
  return {
    el,
    setTaken(taken, mine) {
      if (mine !== null) selected = mine;
      chips.forEach((b, i) => (b.disabled = taken.has(i) && i !== mine));
      paint();
    },
  };
}
