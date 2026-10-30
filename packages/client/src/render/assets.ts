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
    // BASE_URL is Vite's `base` (e.g. /spacecraft/ on GitHub Pages); atlas/audio resolve from it.
    const url = new URL(import.meta.env.BASE_URL + MANIFEST_PATH, location.href);
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
      console.warn(
        '[assets] generated assets missing — run `npm run assets`. Using fallback shapes.',
        err,
      );
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

  /** Named animation range [start, count] (from SpriteDef.anims), if any. */
  anim(key: string, name: string): [number, number] | undefined {
    const a = this.manifest?.sprites[key]?.anims?.[name];
    return a && a[1] > 0 ? a : undefined;
  }

  /**
   * Frame index for animation `name` at time `t` seconds (looping or clamped).
   * Falls back to frame 0 when the sprite has no such animation.
   */
  animFrame(key: string, name: string, t: number, fps: number, loop = true): number {
    const a = this.anim(key, name);
    if (!a) return 0;
    const i = Math.floor(t * fps);
    return a[0] + (loop ? ((i % a[1]) + a[1]) % a[1] : Math.max(0, Math.min(a[1] - 1, i)));
  }

  /**
   * Draws a sprite frame centred on its anchor at (x, y) rotated by `angle`.
   * Atlas frames may be stored at `scale`× world resolution (hi-res sprites);
   * they are drawn at world size × `scale` argument.
   */
  draw(
    ctx: CanvasRenderingContext2D,
    key: string,
    frame: number,
    x: number,
    y: number,
    angle = 0,
    scale = 1,
  ): boolean {
    const s = this.manifest?.sprites[key];
    if (!s || !this.atlas) return false;
    const [fx, fy] =
      s.frames[((Math.floor(frame) % s.frames.length) + s.frames.length) % s.frames.length];
    const k = scale / (s.scale ?? 1);
    if (angle === 0 && k === 1) {
      ctx.drawImage(
        this.atlas,
        fx,
        fy,
        s.w,
        s.h,
        Math.round(x - s.ax),
        Math.round(y - s.ay),
        s.w,
        s.h,
      );
      return true;
    }
    if (angle === 0) {
      ctx.drawImage(this.atlas, fx, fy, s.w, s.h, x - s.ax * k, y - s.ay * k, s.w * k, s.h * k);
      return true;
    }
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(angle);
    ctx.drawImage(this.atlas, fx, fy, s.w, s.h, -s.ax * k, -s.ay * k, s.w * k, s.h * k);
    ctx.restore();
    return true;
  }

  /**
   * Like draw(), but with a non-uniform scale in the sprite's own frame (sx along the facing,
   * sy across it): squash / stretch for crouches, leaps and rearing.
   */
  drawXform(
    ctx: CanvasRenderingContext2D,
    key: string,
    frame: number,
    x: number,
    y: number,
    angle: number,
    sx: number,
    sy: number,
  ): boolean {
    const s = this.manifest?.sprites[key];
    if (!s || !this.atlas) return false;
    const [fx, fy] =
      s.frames[((Math.floor(frame) % s.frames.length) + s.frames.length) % s.frames.length];
    const k = 1 / (s.scale ?? 1);
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(angle);
    ctx.scale(sx, sy);
    ctx.drawImage(this.atlas, fx, fy, s.w, s.h, -s.ax * k, -s.ay * k, s.w * k, s.h * k);
    ctx.restore();
    return true;
  }
}
