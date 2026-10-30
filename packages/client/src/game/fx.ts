import { DECAL_VARIANTS, type ContentRegistry, type GameEvent, type PlayerSnap } from '@sms/shared';
import type { AudioEngine } from '../audio/AudioEngine.js';
import type { Renderer } from '../render/Renderer.js';
import { DEFAULT_ENEMY_VISUAL, ENEMY_VISUALS } from '../render/visuals.js';

export type NoticeKind = 'info' | 'good' | 'bad' | 'warn';

export interface FxContext {
  renderer: Renderer;
  audio: AudioEngine;
  content: ContentRegistry;
  myId: number;
  players: (id: number) => PlayerSnap | undefined;
  notify: (text: string, kind: NoticeKind) => void;
  /** Local damage flash intensity accumulator. */
  hurtFlash: (amount: number) => void;
}

/** Events about the local player are played on arrival (no interpolation delay) for responsiveness. */
export const isImmediate = (ev: GameEvent, myId: number): boolean =>
  (ev.e === 'shot' ||
    ev.e === 'hurt' ||
    ev.e === 'reload' ||
    ev.e === 'switch' ||
    ev.e === 'pickup' ||
    ev.e === 'unlock') &&
  ev.p === myId;

const decal = (prefix: string) => `decal_${prefix}_${Math.floor(Math.random() * DECAL_VARIANTS)}`;

/** Turns simulation events into particles, decals, sounds and HUD notices. */
export function playEvent(ev: GameEvent, fx: FxContext): void {
  const { renderer: r, audio, content } = fx;
  const P = r.particles;
  switch (ev.e) {
    case 'shot': {
      const w = content.weapons.get(ev.w);
      if (w) audio.play(w.sfx.fire, { x: ev.x, y: ev.y, volume: ev.p === fx.myId ? 1 : 0.6 });
      // ev.x/ev.y is the muzzle position
      const mx = ev.x;
      const my = ev.y;
      if (ev.w !== 'flamer') {
        P.spawn({
          x: mx,
          y: my,
          shape: 'sprite',
          sprite: 'fx_muzzle',
          maxLife: 0.06,
          size: ev.w === 'shotgun' || ev.w === 'rocket' ? 1.4 : 1,
          angle: ev.a,
          additive: true,
          drag: 0,
          color: '#ffd070',
        });
        if (ev.w === 'rifle' || ev.w === 'shotgun') {
          const side = ev.a + Math.PI / 2;
          P.spawn({
            x: ev.x,
            y: ev.y,
            vx: Math.cos(side) * 120 + (Math.random() - 0.5) * 40,
            vy: Math.sin(side) * 120,
            maxLife: 0.5,
            size: 1.6,
            color: '#d4a640',
            drag: 6,
          });
        }
      } else {
        P.burst(mx, my, 2, {
          speed: 60,
          dir: ev.a,
          spread: 0.6,
          color: '#ffb050',
          maxLife: 0.2,
          size: 4,
          additive: true,
        });
      }
      if (ev.p === fx.myId && (ev.w === 'shotgun' || ev.w === 'rocket')) r.camera.addShake(2.5);
      break;
    }
    case 'hit': {
      // k = projectile kind that hit
      const color = ev.k === 'acid' ? '#9cff3a' : ev.k === 'plasma' ? '#7fe0ff' : '#7a2a9a';
      P.burst(ev.x, ev.y, 4, { speed: 160, color, maxLife: 0.35, size: 2.5, drag: 5 });
      P.burst(ev.x, ev.y, 2, {
        speed: 260,
        color: '#ffe0a0',
        maxLife: 0.12,
        size: 1.5,
        shape: 'spark',
        additive: true,
      });
      break;
    }
    case 'die': {
      const def = content.enemies.get(ev.t);
      const vis = ENEMY_VISUALS[ev.t] ?? DEFAULT_ENEMY_VISUAL;
      const big = (def?.radius ?? 16) > 24;
      if (def) audio.play(def.sfx.death, { x: ev.x, y: ev.y, volume: 0.7 });
      P.burst(ev.x, ev.y, big ? 26 : 12, {
        speed: big ? 260 : 200,
        color: vis.ichor,
        maxLife: 0.6,
        size: big ? 4 : 3,
        drag: 4,
      });
      r.addDecal(decal(def?.decal ?? 'blood'), ev.x, ev.y, big ? 1.6 : 0.9);
      if (vis.deathShake) r.camera.addShake(vis.deathShake);
      break;
    }
    case 'boom': {
      audio.play('explosion', { x: ev.x, y: ev.y });
      const scale = ev.r / 64;
      P.spawn({
        x: ev.x,
        y: ev.y,
        shape: 'sprite',
        sprite: 'fx_explosion',
        maxLife: 0.45,
        size: scale * 1.3,
        additive: true,
        drag: 0,
        color: '#ff9030',
        angle: Math.random() * 6,
      });
      P.spawn({
        x: ev.x,
        y: ev.y,
        shape: 'sprite',
        sprite: 'fx_ring',
        maxLife: 0.3,
        size: scale * 0.5,
        grow: 4,
        additive: true,
        drag: 0,
        color: '#ffd080',
      });
      P.burst(ev.x, ev.y, 24, {
        speed: 520,
        color: '#ffc060',
        maxLife: 0.35,
        size: 2,
        shape: 'spark',
        additive: true,
        drag: 3,
      });
      P.burst(ev.x, ev.y, 10, {
        speed: 90,
        color: '#555',
        maxLife: 1.1,
        size: 10,
        grow: 2.5,
        shape: 'smoke',
        drag: 2,
      });
      r.addDecal('decal_scorch_0', ev.x, ev.y, scale, 0.7);
      const d = Math.hypot(ev.x - r.camera.x, ev.y - r.camera.y);
      r.camera.addShake(Math.max(0, 14 - d / 60));
      break;
    }
    case 'spit':
      audio.play('enemy_spit', { x: ev.x, y: ev.y, volume: 0.6 });
      P.burst(ev.x, ev.y, 5, {
        speed: 90,
        color: '#9cff3a',
        maxLife: 0.3,
        size: 2.5,
        additive: true,
      });
      break;
    case 'bite': {
      const p = fx.players(ev.p);
      if (p) audio.play('enemy_bite', { x: p.x, y: p.y, volume: 0.6 });
      break;
    }
    case 'hurt': {
      const p = fx.players(ev.p);
      if (!p) break;
      P.burst(p.x, p.y, 6, { speed: 150, color: '#c01818', maxLife: 0.4, size: 2.5 });
      if (ev.p === fx.myId) {
        audio.play('player_hurt', { volume: 0.8 });
        fx.hurtFlash(Math.min(0.35, ev.d / 60));
        r.camera.addShake(Math.min(8, ev.d / 3));
      }
      break;
    }
    case 'down': {
      const p = fx.players(ev.p);
      audio.play('player_down', p ? { x: p.x, y: p.y } : {});
      fx.notify(
        ev.p === fx.myId
          ? 'You are DOWN — wait for a revive!'
          : `${p?.name ?? 'A marine'} is down! Stand next to them to revive.`,
        'bad',
      );
      break;
    }
    case 'revive': {
      const p = fx.players(ev.p);
      const by = fx.players(ev.by);
      audio.play('revive', p ? { x: p.x, y: p.y } : {});
      if (p)
        P.burst(p.x, p.y, 20, {
          speed: 180,
          color: '#6fff8a',
          maxLife: 0.6,
          size: 3,
          additive: true,
        });
      fx.notify(`${p?.name ?? 'Marine'} revived by ${by?.name ?? 'a teammate'}`, 'good');
      break;
    }
    case 'dead': {
      const p = fx.players(ev.p);
      fx.notify(
        ev.p === fx.myId ? 'You died. Spectating…' : `${p?.name ?? 'A marine'} has fallen.`,
        'bad',
      );
      break;
    }
    case 'unlock': {
      if (ev.p !== fx.myId) break;
      const w = content.weapons.get(ev.w);
      audio.play('unlock');
      fx.notify(`${w?.name ?? ev.w} unlocked — press ${w?.slot ?? '?'}`, 'good');
      break;
    }
    case 'pickup': {
      const p = fx.players(ev.p);
      audio.play('pickup', p ? { x: p.x, y: p.y } : {});
      if (ev.p === fx.myId) {
        if (ev.k === 'medkit') fx.notify('+ Medkit', 'good');
        else
          fx.notify(
            `${content.weapons.get(ev.w ?? '')?.name ?? 'Weapon'} acquired — ammo refilled`,
            'good',
          );
      }
      break;
    }
    case 'crate':
      audio.play('crate_drop');
      fx.notify('Supply crate dropped! (see minimap)', 'info');
      P.burst(ev.x, ev.y, 16, {
        speed: 120,
        color: '#ffd060',
        maxLife: 0.8,
        size: 3,
        additive: true,
      });
      break;
    case 'surge':
      audio.play('surge');
      fx.notify(`⚠ SURGE ${ev.n} — the swarm is coming!`, 'warn');
      r.camera.addShake(6);
      break;
    case 'reload': {
      const p = fx.players(ev.p);
      const w = content.weapons.get(ev.w);
      if (w)
        audio.play(w.sfx.reload, p ? { x: p.x, y: p.y, volume: ev.p === fx.myId ? 1 : 0.5 } : {});
      break;
    }
    case 'switch':
      if (ev.p === fx.myId) audio.play('ui_click', { volume: 0.5 });
      break;
  }
}
