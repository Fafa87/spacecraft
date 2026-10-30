/**
 * Asset manifest written by `npm run assets` (tools/) and read by the client.
 * Lives in shared so both sides agree on the format. Paths are relative to the
 * manifest's own URL.
 */
export type AssetSource = 'procedural' | 'override';

export interface SpriteEntry {
  /** Frame size in px. */
  w: number;
  h: number;
  /** Anchor in px within the frame. */
  ax: number;
  ay: number;
  /** Top-left of each frame inside the atlas image. */
  frames: Array<[number, number]>;
  source: AssetSource;
  group: string;
}

export interface SoundEntry {
  file: string;
  volume: number;
  maxVoices: number;
  durationSec: number;
  source: AssetSource;
}

export interface MusicEntry {
  file: string;
  volume: number;
  loop: boolean;
  durationSec: number;
  source: AssetSource;
}

export interface AssetManifest {
  version: 1;
  generatedAt: string;
  atlas: { image: string; width: number; height: number };
  sprites: Record<string, SpriteEntry>;
  sounds: Record<string, SoundEntry>;
  music: Record<string, MusicEntry>;
}

export const MANIFEST_PATH = 'assets/generated/manifest.json';

/** Every asset key referenced by content data, so tools/tests can verify coverage. */
export interface ReferencedAssetKeys {
  sprites: string[];
  sounds: string[];
}
