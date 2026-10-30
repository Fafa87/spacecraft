import { grantWeapon, spawnEnemy, type ContentRegistry, type World } from '@sms/shared';

/**
 * `?demo=hive`: stages a busy late-game fight for screenshots / showcase. Solo only and
 * never submitted to any leaderboard (App passes a no-op submit).
 */
export function stageHiveDemo(world: World, content: ContentRegistry): void {
  const p = world.players[0];
  if (!p) return;
  world.time = Math.max(world.time, 400);
  // Fast-forward the director quietly: count the surges/boss waves that would have happened so
  // it doesn't replay them all at once, with a modest budget so the staged ring stays readable but busy.
  const cfg = content.director;
  const st = world.director;
  while (st.nextSurgeAt <= world.time) {
    st.wave++;
    st.nextSurgeAt += cfg.surge.interval;
    const b = cfg.bosses;
    if (st.wave >= b.firstSurge && (st.wave - b.firstSurge) % b.everySurge === 0) st.bossWaves++;
  }
  st.nextSurgeAt = Math.max(st.nextSurgeAt, world.time + 20);
  st.budget = 45;
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
    }
  }
}
