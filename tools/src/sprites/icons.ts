import type { ChapterDef } from '@sms/shared';
import type { Ctx } from './types.js';

/**
 * Simple geometric chapter icons of our own design. Deliberately NOT replicas of the
 * official Games Workshop chapter badges. Drawn centred on (x, y) within `s` px.
 */
export function drawChapterIcon(
  ctx: Ctx,
  icon: ChapterDef['icon'],
  x: number,
  y: number,
  s: number,
  fill: string,
  rot = 0,
): void {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(rot);
  ctx.scale(s / 10, s / 10);
  ctx.fillStyle = fill;
  ctx.beginPath();
  switch (icon) {
    case 'chevron': // double upward chevron
      for (const oy of [-1.5, 2.5]) {
        ctx.moveTo(-4.5, oy + 1.8);
        ctx.lineTo(0, oy - 2.6);
        ctx.lineTo(4.5, oy + 1.8);
        ctx.lineTo(3, oy + 3.2);
        ctx.lineTo(0, oy + 0.2);
        ctx.lineTo(-3, oy + 3.2);
        ctx.closePath();
      }
      break;
    case 'drop': // teardrop with a notch
      ctx.moveTo(0, -4.8);
      ctx.bezierCurveTo(2.5, -1.5, 4, 0.5, 4, 2);
      ctx.arc(0, 2, 4, 0, Math.PI, false);
      ctx.bezierCurveTo(-4, 0.5, -2.5, -1.5, 0, -4.8);
      break;
    case 'blade': // downward sword
      ctx.rect(-0.9, -2.6, 1.8, 7.4);
      ctx.moveTo(-0.9, 4.8);
      ctx.lineTo(0, 6);
      ctx.lineTo(0.9, 4.8);
      ctx.rect(-3.4, -3.4, 6.8, 1.3);
      ctx.rect(-0.8, -5.4, 1.6, 2);
      break;
    case 'tower': // crenellated tower
      ctx.moveTo(-3.6, 4.6);
      ctx.lineTo(-3.6, -2.4);
      ctx.lineTo(-4.4, -2.4);
      ctx.lineTo(-4.4, -4.8);
      ctx.lineTo(-2.6, -4.8);
      ctx.lineTo(-2.6, -3.6);
      ctx.lineTo(-0.9, -3.6);
      ctx.lineTo(-0.9, -4.8);
      ctx.lineTo(0.9, -4.8);
      ctx.lineTo(0.9, -3.6);
      ctx.lineTo(2.6, -3.6);
      ctx.lineTo(2.6, -4.8);
      ctx.lineTo(4.4, -4.8);
      ctx.lineTo(4.4, -2.4);
      ctx.lineTo(3.6, -2.4);
      ctx.lineTo(3.6, 4.6);
      ctx.closePath();
      break;
    case 'fang': // curved fang pair
      ctx.moveTo(-3.8, -4.4);
      ctx.quadraticCurveTo(-0.5, -1, -1.8, 4.8);
      ctx.quadraticCurveTo(-2.4, 0, -5.2, -3.4);
      ctx.closePath();
      ctx.moveTo(3.8, -4.4);
      ctx.quadraticCurveTo(0.5, -1, 1.8, 4.8);
      ctx.quadraticCurveTo(2.4, 0, 5.2, -3.4);
      ctx.closePath();
      break;
  }
  ctx.fill('evenodd');
  ctx.restore();
}
