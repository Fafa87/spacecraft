import { grantWeapon, spawnEnemy, type ContentRegistry, type World } from '@sms/shared';

/**
 * `?demo=hive`: stages a busy late-game fight for screenshots / showcase. Solo only and
 * never submitted to any leaderboard (App passes a no-op submit).
 */
export function stageHiveDemo(world: World, content: ContentRegistry): void {
  const p = world.players[0];
  if (!p) return;
  world.time = Math.max(world.time, 400);
  // Jump the director to a late wave whose whole roster is the staged ring below: no extra
  // spawns, so the scene stays readable, and the wave clears when the ring is dead.
  const b = content.director.bosses;
  const st = world.director;
  st.wave = 12;
  st.bossWaves = st.wave >= b.firstWave ? Math.floor((st.wave - b.firstWave) / b.everyWave) : 0;
  st.phase = 'active';
  st.waveStartedAt = world.time;
  st.roster = [];
  st.queue = [];
  st.waveChildren = 0;
  st.waveTotal = 0;
  for (const w of content.weaponOrder) grantWeapon(world, p, w.id);
  p.current = content.weapon('heavy_bolter') ? 'heavy_bolter' : p.current;
  p.maxHp = p.hp = 5000;
  const ring: Array<[string, number, number]> = [
    ['carnifex', 1, 330],
    ['warrior', 2, 260],
    ['genestealer', 4, 200],
    ['hormagaunt', 10, 170],
    ['termagant', 8, 300],
    ['ripper', 6, 120],
    ['ravener', 2, 240],
    ['biovore', 1, 420],
    ['spore_mine', 3, 220],
  ];
  let a = 0;
  for (const [type, n, dist] of ring) {
    if (!content.enemies.has(type)) continue;
    for (let i = 0; i < n; i++) {
      a += 2.399963; // golden angle spreads them around
      const d = dist * (0.85 + ((i * 37) % 30) / 100);
      spawnEnemy(world, type, p.x + Math.cos(a) * d, p.y + Math.sin(a) * d * 0.7);
      st.waveTotal++;
    }
  }
}
