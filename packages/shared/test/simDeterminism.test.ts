/**
 * Determinism / regression guard: runs the full sim with fixed seeds and scripted inputs and
 * compares state hashes at checkpoints against a stored baseline. Any gameplay change (balance,
 * spawning, maps…) shows up here.
 *
 * Intentional gameplay change? Regenerate the baseline and commit it with the change:
 *   UPDATE_SIM_BASELINE=1 npx vitest run packages/shared/test/simDeterminism.test.ts
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { TICK_DT } from '../src/constants.js';
import { Rng } from '../src/math/rng.js';
import { applyInput, createWorld, stepWorld, type World } from '../src/sim/index.js';

const BASELINE = join(dirname(fileURLToPath(import.meta.url)), 'fixtures', 'sim-baseline.json');

interface Scenario {
  name: string;
  teamSize: number;
  seed: number;
  ticks: number;
  immortal: boolean;
}

const SCENARIOS: Scenario[] = [
  { name: 'solo-natural', teamSize: 1, seed: 12345, ticks: 6000, immortal: false },
  { name: 'solo-immortal', teamSize: 1, seed: 777, ticks: 9000, immortal: true },
  { name: 'duo-immortal', teamSize: 2, seed: 4242, ticks: 7000, immortal: true },
  { name: 'squad4-natural', teamSize: 4, seed: 99, ticks: 6000, immortal: false },
  { name: 'squad4-immortal', teamSize: 4, seed: 2026, ticks: 7000, immortal: true },
];
const CHECK_EVERY = 500;

function fnv1a(s: string, h = 0x811c9dc5): number {
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h >>> 0;
}

/** Stable hash of the whole mutable world state (static content/map definitions excluded). */
function hashWorld(w: World): string {
  const json = JSON.stringify(w, (k, v) =>
    k === 'content' || k === 'map'
      ? undefined
      : typeof v === 'number' && !Number.isFinite(v)
        ? String(v)
        : v,
  );
  return fnv1a(json).toString(16).padStart(8, '0');
}

function runScenario(sc: Scenario): { checkpoints: string[]; events: string; summary: string } {
  const w = createWorld(
    Array.from({ length: sc.teamSize }, (_, i) => ({ id: i + 1, name: `M${i + 1}` })),
    sc.seed,
  );
  const inRng = new Rng(sc.seed ^ 0x5a5a5a5a);
  const seq = new Map<number, number>();
  const dirs = new Map<number, { mx: number; my: number; left: number }>();
  const checkpoints: string[] = [];
  let ev = 0x811c9dc5;
  for (let t = 1; t <= sc.ticks; t++) {
    for (const p of w.players) {
      if (sc.immortal) {
        p.maxHp = 1e9;
        p.hp = 1e9;
      }
      let d = dirs.get(p.id);
      if (!d || d.left <= 0) {
        const a = inRng.range(0, Math.PI * 2);
        const move = inRng.chance(0.7);
        d = { mx: move ? Math.cos(a) : 0, my: move ? Math.sin(a) : 0, left: inRng.int(10, 60) };
        dirs.set(p.id, d);
      }
      d.left--;
      // aim at the nearest live enemy (or sweep) so the scripted marines actually fight
      let aim = (t * 0.05 + p.id) % (Math.PI * 2);
      let best = Infinity;
      for (const e of w.enemies) {
        if (e.dead) continue;
        const dd = (e.x - p.x) ** 2 + (e.y - p.y) ** 2;
        if (dd < best) {
          best = dd;
          aim = Math.atan2(e.y - p.y, e.x - p.x);
        }
      }
      const s = (seq.get(p.id) ?? 0) + 1;
      seq.set(p.id, s);
      applyInput(w, p.id, {
        seq: s,
        mx: d.mx,
        my: d.my,
        aim,
        fire: inRng.chance(0.85),
        slot: inRng.chance(0.01) ? inRng.int(1, 6) : 0,
        reload: inRng.chance(0.003),
      });
    }
    stepWorld(w, TICK_DT);
    if (w.events.length) ev = fnv1a(JSON.stringify(w.events), ev);
    if (t % CHECK_EVERY === 0 || t === sc.ticks) checkpoints.push(`${t}:${hashWorld(w)}`);
  }
  const summary = `wave=${w.director.wave} kills=${w.stats.kills} over=${w.over} time=${w.time.toFixed(2)}`;
  return { checkpoints, events: ev.toString(16), summary };
}

describe('sim determinism baseline', () => {
  const results = Object.fromEntries(SCENARIOS.map((sc) => [sc.name, runScenario(sc)]));

  it('is reproducible within one process', () => {
    expect(runScenario(SCENARIOS[0]!)).toEqual(results[SCENARIOS[0]!.name]);
  });

  it('matches the stored baseline (pre-maps-refactor wave map)', () => {
    if (process.env.UPDATE_SIM_BASELINE) {
      writeFileSync(BASELINE, JSON.stringify(results, null, 2) + '\n');
    }
    expect(existsSync(BASELINE), 'baseline missing: run with UPDATE_SIM_BASELINE=1').toBe(true);
    const baseline = JSON.parse(readFileSync(BASELINE, 'utf8'));
    expect(results).toEqual(baseline);
  });
});
