import { describe, expect, it } from 'vitest';
import {
  emptyInput,
  stepPlayerMovement,
  TICK_DT,
  type PlayerInput,
  type Snapshot,
} from '@sms/shared';
import { Predictor } from '../src/game/prediction.js';
import { lerpAngle, SnapshotBuffer } from '../src/game/interpolation.js';

const input = (seq: number, mx: number, my = 0): PlayerInput => ({ ...emptyInput(), seq, mx, my });
const snap = (tick: number) => ({ tick }) as unknown as Snapshot;

describe('Predictor', () => {
  it('initializes from the first authoritative position', () => {
    const p = new Predictor();
    p.applyLocal(input(1, 1), 200, true); // ignored before init
    p.reconcile(100, 100, 0, true);
    expect(p.ready).toBe(true);
    expect(p.pos).toEqual({ x: 100, y: 100 });
  });

  it('replays unacknowledged inputs on reconcile (no error when host agrees)', () => {
    const p = new Predictor();
    p.reconcile(500, 500, 0, true);
    for (let s = 1; s <= 10; s++) p.applyLocal(input(s, 1), 200, true);
    // host has processed inputs 1..4
    const host = { x: 500, y: 500 };
    for (let s = 1; s <= 4; s++) stepPlayerMovement(host, 1, 0, 200, TICK_DT);
    p.reconcile(host.x, host.y, 4, true);
    expect(p.pendingCount).toBe(6);
    expect(p.lastCorrection).toBeCloseTo(0, 6);
    expect(p.pos.x).toBeCloseTo(500 + 10 * 200 * TICK_DT, 6);
  });

  it('corrects towards the host when it disagrees', () => {
    const p = new Predictor();
    p.reconcile(500, 500, 0, true);
    p.applyLocal(input(1, 1), 200, true);
    p.reconcile(480, 500, 1, true); // host says we got pushed back
    expect(p.pos.x).toBe(480);
    expect(p.lastCorrection).toBeGreaterThan(0);
  });
});

describe('SnapshotBuffer', () => {
  it('interpolates between bracketing snapshots behind real time', () => {
    const tickMs = TICK_DT * 1000;
    const buf = new SnapshotBuffer(2 * tickMs);
    for (let t = 0; t <= 10; t++) buf.push(snap(t), t * tickMs);
    const s = buf.sample(10 * tickMs - tickMs / 2)!;
    expect(s.a.tick).toBeLessThanOrEqual(s.b.tick);
    expect(s.b.tick - s.a.tick).toBeLessThanOrEqual(1);
    expect(s.t).toBeGreaterThanOrEqual(0);
    expect(s.t).toBeLessThanOrEqual(1);
    expect(s.a.tick).toBeLessThan(10);
  });

  it('drops stale / out-of-order snapshots', () => {
    const buf = new SnapshotBuffer();
    buf.push(snap(5), 0);
    buf.push(snap(4), 1);
    buf.push(snap(5), 2);
    expect(buf.latest?.tick).toBe(5);
    expect(buf.since(0)).toHaveLength(1);
  });

  it('lerpAngle takes the short way round', () => {
    expect(lerpAngle(Math.PI - 0.1, -Math.PI + 0.1, 0.5)).toBeCloseTo(Math.PI, 5);
  });
});
