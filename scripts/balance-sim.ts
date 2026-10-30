/**
 * Headless balance simulator: runs the real shared simulation with simple bots and
 * reports survival times per team size. Use it after tuning data files.
 *
 *   npm run sim                 # 6 seeds, team sizes 1-MAX_PLAYERS (8), "kite" bots
 *   npm run sim -- --bot=turret --seeds=10 --max=900
 *
 * Bots: "turret" stands still and aims at the nearest enemy; "kite" also moves away
 * from nearby enemies, circles the arena centre, picks up crates and revives teammates.
 */
import {
  applyInput,
  ARENA,
  createWorld,
  emptyInput,
  MAX_PLAYERS,
  PLAYER,
  stepWorld,
  sustainedDps,
  TICK_DT,
  type World,
} from '@sms/shared';

/** Accepts `--key=value` and `--key value`. */
const args: Record<string, string> = {};
{
  const argv = process.argv.slice(2);
  for (let i = 0; i < argv.length; i++) {
    const [k, v] = argv[i].replace(/^--/, '').split('=');
    if (v !== undefined) args[k] = v;
    else if (argv[i + 1] && !argv[i + 1].startsWith('--')) args[k] = argv[++i];
    else args[k] = 'true';
  }
}
const bot = (args.bot ?? 'kite') as 'kite' | 'turret';
const seeds = Number(args.seeds ?? 6);
const maxSec = Number(args.max ?? 600);
const sizes = String(args.sizes ?? Array.from({ length: MAX_PLAYERS }, (_, i) => i + 1).join(','))
  .split(',')
  .map(Number);

function think(world: World, id: number, seq: number) {
  const p = world.players.find((x) => x.id === id)!;
  let nearest: { x: number; y: number; d: number; type: string } | null = null;
  let big: { x: number; y: number; d: number; type: string; threat: number } | null = null;
  let crowd = 0;
  let fx = 0;
  let fy = 0;
  for (const e of world.enemies) {
    if (e.dead || e.burrowed) continue;
    const d = Math.hypot(e.x - p.x, e.y - p.y);
    if (!nearest || d < nearest.d) nearest = { x: e.x, y: e.y, d, type: e.type };
    const threat = world.content.enemy(e.type).threat;
    if (d < 480 && (!big || threat > big.threat)) big = { x: e.x, y: e.y, d, type: e.type, threat };
    if (d < 360) crowd++;
    if (d < 320) {
      fx -= (e.x - p.x) / (d * d + 1);
      fy -= (e.y - p.y) / (d * d + 1);
    }
  }
  // Shoot the biggest threat close by (else the nearest bug).
  const target = big && big.threat >= 3 ? big : nearest;
  const aim = target ? Math.atan2(target.y - p.y, target.x - p.x) : p.aim;
  let mx = 0;
  let my = 0;
  if (bot === 'kite') {
    const cx = ARENA.width / 2 - p.x;
    const cy = ARENA.height / 2 - p.y;
    const downed = world.players.find((o) => o.state === 'downed');
    const crate = world.pickups[0];
    const goal = downed ?? (crate && Math.hypot(crate.x - p.x, crate.y - p.y) < 500 ? crate : null);
    mx = fx * 900 + cx * 0.0012 - cy * 0.0009;
    my = fy * 900 + cy * 0.0012 + cx * 0.0009;
    if (goal) {
      const d = Math.hypot(goal.x - p.x, goal.y - p.y) || 1;
      if (d > PLAYER.reviveRadius * 0.5) {
        mx += ((goal.x - p.x) / d) * 0.8;
        my += ((goal.y - p.y) / d) * 0.8;
      }
    }
    const len = Math.hypot(mx, my);
    if (len > 1) {
      mx /= len;
      my /= len;
    }
  }
  // Every half second pick the owned weapon with the best expected DPS (S/AP vs T/Sv) against the
  // target, in range, with ammo; splash / piercing weapons get a bonus in a crowd.
  let slot = 0;
  if (target && seq % 30 === 0) {
    const tdef = world.content.enemy(target.type);
    let best = -1;
    for (const id of p.weapons) {
      if ((p.ammo[id] ?? 1) <= 0) continue;
      const w = world.content.weapon(id);
      const range = w.projectile.speed * w.projectile.lifetime;
      let score = sustainedDps(w, tdef);
      if (target.d > range * 0.9) score *= 0.05;
      if (w.projectile.explosion || w.projectile.pierce > 2)
        score *= 1 + Math.min(crowd, 12) * 0.15;
      if (score > best) {
        best = score;
        slot = w.slot;
      }
    }
    if (slot === world.content.weapon(p.current).slot) slot = 0;
  }
  return { ...emptyInput(), seq, mx, my, aim, fire: !!target && target.d < 900, slot };
}

console.log(`bot=${bot} seeds=${seeds} max=${maxSec}s`);
for (const size of sizes) {
  const times: number[] = [];
  let kills = 0;
  let waves = 0;
  // Leaderboard plausibility headroom (Firestore rules / validateLeaderboardRun): worst marine.
  let maxPtsPerSec = 0;
  let maxKillsPerSec = 0;
  for (let s = 1; s <= seeds; s++) {
    const world = createWorld(
      Array.from({ length: size }, (_, i) => ({ id: i + 1, name: `bot${i + 1}` })),
      s * 7919,
    );
    let seq = 0;
    while (!world.over && world.time < maxSec) {
      seq++;
      for (const p of world.players) applyInput(world, p.id, think(world, p.id, seq));
      stepWorld(world, TICK_DT);
    }
    times.push(world.time);
    for (const p of world.players) {
      maxPtsPerSec = Math.max(maxPtsPerSec, p.score / Math.max(1, world.time));
      maxKillsPerSec = Math.max(maxKillsPerSec, p.kills / Math.max(1, world.time));
    }
    kills += world.stats.kills;
    waves += world.director.wave;
  }
  times.sort((a, b) => a - b);
  const avg = times.reduce((a, b) => a + b, 0) / times.length;
  const fmt = (t: number) => `${Math.floor(t / 60)}:${String(Math.floor(t % 60)).padStart(2, '0')}`;
  console.log(
    `team ${size}: avg ${fmt(avg)}  min ${fmt(times[0]!)}  median ${fmt(times[Math.floor(times.length / 2)]!)}  max ${fmt(times[times.length - 1]!)}` +
      `  | kills/run ${(kills / seeds).toFixed(0)}  waves/run ${(waves / seeds).toFixed(1)}` +
      `  | max/marine ${maxPtsPerSec.toFixed(1)} pts/s ${maxKillsPerSec.toFixed(2)} kills/s`,
  );
}
