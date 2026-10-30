import { describe, expect, it } from 'vitest';
import { TICK_DT } from '../src/constants.js';
import type { RunResult } from '../src/highscore/types.js';
import { createLocalLinkPair } from '../src/net/link.js';
import { ClientSession, HostSession, ManualScheduler } from '../src/session/index.js';
import type { Snapshot } from '../src/sim/snapshot.js';

const flush = () => new Promise((r) => setTimeout(r, 0));

describe('HostSession over local links', () => {
  it('runs lobby -> game -> submit for a 2-marine team', async () => {
    const scheduler = new ManualScheduler();
    const results: RunResult[] = [];
    const host = new HostSession({
      roomCode: 'TEST1',
      mode: 'p2p',
      scheduler,
      seed: () => 123,
      submitResult: async (r) => {
        results.push(r);
        return { status: 'server', rank: 1 };
      },
    });
    const [h1, c1] = createLocalLinkPair('a');
    const [h2, c2] = createLocalLinkPair('b');
    host.addLink(h1);
    host.addLink(h2);
    const a = new ClientSession(c1, 'Alpha');
    const b = new ClientSession(c2, 'Bravo');
    const snapsB: Snapshot[] = [];
    b.on('snapshot', (s) => snapsB.push(s as Snapshot));
    a.join();
    await flush();
    b.join();
    await flush();
    expect(host.playerCount).toBe(2);

    a.requestStart();
    await flush();
    expect(host.phase).toBe('playing');
    scheduler.advance(1000);
    await flush();
    expect(snapsB.length).toBeGreaterThan(0);

    const world = host.world!;
    // simulate the swarm winning
    for (const p of world.players) {
      p.state = 'dead';
      p.diedAt = world.time;
    }
    world.time = Math.max(world.time, 5);
    scheduler.advance(TICK_DT * 1000 * 3);
    await flush();
    await flush();
    expect(results).toHaveLength(1);
    expect(results[0].teamSize).toBe(2);
    expect(results[0].players.sort()).toEqual(['Alpha', 'Bravo']);
    expect(results[0].mode).toBe('p2p');
    host.close();
  });
});
