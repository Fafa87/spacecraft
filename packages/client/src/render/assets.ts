import { MANIFEST_PATH, type AssetManifest, type SpriteEntry } from '@sms/shared';

/**
 * Loads the generated asset manifest + atlas. Everything degrades gracefully:
 * if assets are missing (forgot `npm run assets`), `draw` returns false and the
 * renderer falls back to simple shapes.
 */
export class Assets {
  manifest: AssetManifest | null = null;
  atlas: HTMLImageElement | null = null;
  baseUrl = '';

  async load(): Promise<void> {
    const url = new URL(MANIFEST_PATH, document.baseURI);
    this.baseUrl = url.href.replace(/manifest\.json$/, '');
    try {
      const res = await fetch(url);
      if (!res.ok) throw new Error(`${res.status}`);
      this.manifest = (await res.json()) as AssetManifest;
      const img = new Image();
      img.src = this.baseUrl + this.manifest.atlas.image;
      await img.decode();
      this.atlas = img;
    } catch (err) {
      console.warn('[assets] generated assets missing — run `npm run assets`. Using fallback shapes.', err);
      this.manifest = null;
      this.atlas = null;
    }
  }

  sprite(key: string): SpriteEntry | undefined {
    return this.manifest?.sprites[key];
  }

  has(key: string): boolean {
    return !!this.atlas && !!this.manifest?.sprites[key];
  }

  frameCount(key: string): number {
    return this.manifest?.sprites[key]?.frames.length ?? 0;
  }

  /** Draws a sprite frame centred on its anchor at (x, y) rotated by `angle`. */
  draw(ctx: CanvasRenderingContext2D, key: string, frame: number, x: number, y: number, angle = 0, scale = 1): boolean {
    const s = this.manifest?.sprites[key];
    if (!s || !this.atlas) return false;
    const [fx, fy] = s.frames[((Math.floor(frame) % s.frames.length) + s.frames.length) % s.frames.length];
    if (angle === 0 && scale === 1) {
      ctx.drawImage(this.atlas, fx, fy, s.w, s.h, Math.round(x - s.ax), Math.round(y - s.ay), s.w, s.h);
      return true;
    }
    ctx.save();
    ctx.translate(x, y);
    if (angle) ctx.rotate(angle);
    if (scale !== 1) ctx.scale(scale, scale);
    ctx.drawImage(this.atlas, fx, fy, s.w, s.h, -s.ax, -s.ay, s.w, s.h);
    ctx.restore();
    return true;
  }
}
