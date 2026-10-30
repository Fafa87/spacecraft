import { MIX_CHANNELS, MIX_LABELS, type MixChannel, type MixVolumes } from '../audio/mixer.js';
import { html } from './dom.js';

export interface MixerControls {
  volumes: MixVolumes;
  setVolume(ch: MixChannel, v: number): void;
  /** Plays a short sample of a bus so the slider can be judged by ear. */
  preview?(ch: MixChannel): void;
}

const SAMPLE_DELAY = 180;

/** Collapsible per-bus volume sliders (persisted by the AudioEngine). */
export function createMixerPanel(mixer: MixerControls): HTMLElement {
  const el = html(
    `<details class="mixer"><summary>SOUND MIX</summary><div class="sliders"></div></details>`,
  );
  const box = el.querySelector('.sliders')!;
  for (const ch of MIX_CHANNELS) {
    const pct = Math.round(mixer.volumes[ch] * 100);
    const row = html(
      `<label class="slider"><span>${MIX_LABELS[ch]}</span><input type="range" min="0" max="100" step="1" value="${pct}" data-ch="${ch}" aria-label="${MIX_LABELS[ch]} volume"><output>${pct}</output></label>`,
    );
    const input = row.querySelector('input')!;
    const out = row.querySelector('output')!;
    let t = 0;
    input.addEventListener('input', () => {
      mixer.setVolume(ch, Number(input.value) / 100);
      out.textContent = input.value;
      clearTimeout(t);
      t = window.setTimeout(() => mixer.preview?.(ch), SAMPLE_DELAY);
    });
    box.append(row);
  }
  return el;
}
