import { describe, expect, it } from 'vitest';
import { ARENA, TICK_DT } from '../src/constants.js';
import { defaultContent, DIRECTOR } from '../src/data/index.js';
import {
  DEFAULT_MAP_ID,
  defineMap,
  getMap,
  MAPS,
  validateMapRegistry,
  WAVE_MAP,
} from '../src/maps/index.js';
import { HostSession } from '../src/session/hostSession.js';
import { applyInput, createWorld, stepWorld } from '../src/sim/index.js';
import { emptyInput } from '../src/sim/types.js';

const squad = (n: number) =>
  Array.from({ length: n }, (_, i) => ({ id: i + 1, name: `M${i + 1}` }));

describe('map registry', () => {
  it('registers the original wave map as the default', () => {
    expect(DEFAULT_MAP_ID).toBe('wave');
    expect(MAPS[0]).toBe(WAVE_MAP);
    expect(getMap()).toBe(WAVE_MAP);
    expect(getMap('wave')).toBe(WAVE_MAP);
    expect(() => getMap('nope')).toThrow();
    expect(validateMapRegistry()).toEqual([]);
  });

  it('the wave map is exactly the pre-maps game data', () => {
    expect(WAVE_MAP.director).toBe(DIRECTOR);
    expect(WAVE_MAP.arena).toBe(ARENA);
    expect(defaultContent.map).toBe(WAVE_MAP);
    expect(defaultContent.director).toBe(DIRECTOR);
    expect(defaultContent.withMap('wave')).toBe(defaultContent);
    expect(defaultContent.withNames('generic').map).toBe(WAVE_MAP);
  });

  it('every registered map validates against the content', () => {
    for (const m of MAPS) expect(defaultContent.withMap(m).validate(), m.id).toEqual([]);
  });
});

describe('sim reads the active map', () => {
  it('createWorld defaults to the wave map; mapId "wave" is identical', () => {
    const a = createWorld(squad(3), 5);
    const b = createWorld(squad(3), 5, defaultContent, 'wave');
    expect(a.map).toBe(WAVE_MAP);
    expect(b.content).toBe(defaultContent);
    for (let i = 0; i < 300; i++) {
      stepWorld(a, TICK_DT);
      stepWorld(b, TICK_DT);
    }
    const strip = (w: unknown) => JSON.stringify(w, (k, v) => (k === 'content' ? undefined : v));
    expect(strip(a)).toBe(strip(b));
  });

  it('a derived map changes arena, player spawn and director without touching the wave map', () => {
    const small = defineMap(WAVE_MAP, {
      id: 'test_small',
      name: 'Test',
      tier: 2,
      arena: { width: 1000, height: 800 },
      playerSpawn: { x: 500, y: 400, ringMin: 50, ringPerMarine: 16 },
      director: {
        waves: { firstDelay: 1 },
        spawnPoints: [{ id: 'n', x: 500, y: 60, kind: 'breach' }],
      },
    });
    expect(small.director.waves.breather).toBe(DIRECTOR.waves.breather);
    expect(DIRECTOR.waves.firstDelay).not.toBe(1);
    const content = defaultContent.withMap(small);
    expect(content.validate()).toEqual([]);
    const w = createWorld(squad(1), 3, content);
    expect(w.map).toBe(small);
    expect(w.director.nextWaveAt).toBe(1);
    expect(w.director.activeUntil).toHaveLength(1);
    expect([w.players[0]!.x, w.players[0]!.y]).toEqual([500, 400]);
    for (let i = 0; i < 200; i++) {
      applyInput(w, 1, { ...emptyInput(), seq: i + 1, mx: 1 });
      stepWorld(w, TICK_DT);
    }
    expect(w.players[0]!.x).toBeLessThanOrEqual(1000);
    expect(w.players[0]!.x).toBeGreaterThan(900);
  });

  it('HostSession takes an optional mapId (default = wave map)', () => {
    const h = new HostSession({ roomCode: 'T', mode: 'local' });
    expect((h as unknown as { content: typeof defaultContent }).content.map).toBe(WAVE_MAP);
    expect(() => new HostSession({ roomCode: 'T', mode: 'local', mapId: 'x' })).toThrow();
  });
});
