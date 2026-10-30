import { ENEMY_FLAG, type ContentRegistry, type PlayerSnap, type Snapshot } from '@sms/shared';
import type { AudioEngine } from '../audio/AudioEngine.js';
import type { Landing } from '../render/Renderer.js';

interface Track {
  x: number;
  y: number;
  /** Distance walked since the last footstep (px). */
  stepAcc: number;
  /** Seconds moving since the last movement sound. */
  moveAcc: number;
}

/** Only creatures this close to the camera make continuous sounds. */
const HEAR = 900;
const SWARM_RADIUS = 750;

/** Swarm level 0..1 from the number of nearby Tyranids (log-ish, saturates around 40). */
export function swarmLevel(count: number): number {
  if (count <= 0) return 0;
  return Math.min(1, 0.18 + 0.82 * Math.sqrt(Math.min(40, count) / 40));
}

/**
 * Continuous creature sound driven by the interpolated snapshot rather than sim events:
 * Carnifex footsteps by distance walked, Genestealer skitter and Ravener burrow rumble while
 * moving, the Warrior synapse drone near a Warrior, hisses from close gaunts, the swarm bed
 * that swells with the horde, landing thuds, and the plasma coil whine following heat.
 */
export class EnemyAudio {
  private tracks = new Map<number, Track>();
  private lastKeyAt = new Map<string, number>();
  private hissCd = 1;
  private time = 0;

  constructor(
    private readonly audio: AudioEngine,
    private readonly content: ContentRegistry,
  ) {}

  private once(key: string, minGap: number): boolean {
    const t = this.lastKeyAt.get(key) ?? -1e9;
    if (this.time - t < minGap) return false;
    this.lastKeyAt.set(key, this.time);
    return true;
  }

  update(
    snap: Snapshot,
    listener: { x: number; y: number },
    dt: number,
    me?: PlayerSnap,
    landings: Landing[] = [],
  ): void {
    const a = this.audio;
    this.time += dt;
    a.setLoop('amb:hive', 'amb_hive', 1);
    let near = 0;
    const auras = new Map<string, number>();
    let hissFrom: { x: number; y: number; d: number } | null = null;
    const seen = new Set<number>();
    for (const e of snap.enemies) {
      const [id, typeIdx, x, y, , , flags] = e;
      seen.add(id);
      const dx = x - listener.x;
      const dy = y - listener.y;
      const d = Math.hypot(dx, dy);
      if (d < SWARM_RADIUS) near++;
      let tr = this.tracks.get(id);
      if (!tr) {
        tr = { x, y, stepAcc: (id * 13) % 30, moveAcc: (id % 7) * 0.05 };
        this.tracks.set(id, tr);
      }
      const moved = Math.hypot(x - tr.x, y - tr.y);
      tr.x = x;
      tr.y = y;
      if (d > HEAR) continue;
      const def = this.content.enemies.get(this.content.enemyIds[typeIdx] ?? '');
      if (!def) continue;
      const sfx = def.sfx;
      const burrowed = (flags & ENEMY_FLAG.burrowed) !== 0;
      if (sfx.step && sfx.stepEvery && !burrowed) {
        tr.stepAcc += moved;
        if (tr.stepAcc >= sfx.stepEvery) {
          tr.stepAcc = 0;
          a.play(sfx.step, { x, y, priority: 6 });
        }
      }
      if (sfx.move && sfx.moveEvery && moved > 0.5) {
        // ravener rumble only underground; skitter only above
        const fits = def.id === 'ravener' ? burrowed : !burrowed;
        tr.moveAcc += dt;
        if (fits && tr.moveAcc >= sfx.moveEvery && this.once(sfx.move, 0.08)) {
          tr.moveAcc = 0;
          a.play(sfx.move, { x, y, volume: 0.8 });
        }
      }
      if (sfx.aura && !burrowed) {
        const lvl = Math.max(0, 1 - d / HEAR);
        auras.set(sfx.aura, Math.max(auras.get(sfx.aura) ?? 0, lvl));
      }
      if (def.radius < 20 && d < 280 && (!hissFrom || d < hissFrom.d)) hissFrom = { x, y, d };
    }
    for (const id of this.tracks.keys()) if (!seen.has(id)) this.tracks.delete(id);

    a.setLoop(
      'amb:swarm',
      'amb_swarm',
      swarmLevel(near),
      undefined,
      undefined,
      0.92 + 0.16 * swarmLevel(near),
    );
    for (const key of ['synapse_drone'])
      a.setLoop(`aura:${key}`, key, (auras.get(key) ?? 0) ** 1.3);

    this.hissCd -= dt;
    if (hissFrom && this.hissCd <= 0) {
      this.hissCd = 0.9 + Math.random() * 1.6;
      a.play('nid_hiss', { x: hissFrom.x, y: hissFrom.y, volume: 0.75 });
    }

    for (const l of landings.splice(0)) {
      const big = l.r > 24;
      a.play('dust_land', { x: l.x, y: l.y, volume: big ? 1 : 0.6 });
      if (big) a.play('carnifex_step', { x: l.x, y: l.y, priority: 8 });
    }

    // plasma coil whine follows the local gun's heat
    const w = me ? this.content.weapons.get(me.w) : undefined;
    const ht = me?.st === 'alive' && w?.sfx.heatLoop ? (me.ht ?? 0) : 0;
    if (w?.sfx.heatLoop || ht === 0)
      a.setLoop(
        'heat',
        w?.sfx.heatLoop ?? 'plasma_whine',
        ht > 0.05 ? 0.25 + 0.75 * ht ** 1.5 : 0,
        undefined,
        undefined,
        0.8 + 0.5 * ht,
      );
  }

  stop(): void {
    this.tracks.clear();
    this.audio.stopLoops();
  }
}
