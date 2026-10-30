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
  let nearest: { x: number; y: number; d: number } | null = null;
  let fx = 0;
  let fy = 0;
  for (const e of world.enemies) {
    const d = Math.hypot(e.x - p.x, e.y - p.y);
    if (!nearest || d < nearest.d) nearest = { x: e.x, y: e.y, d };
    if (d < 320) {
      fx -= (e.x - p.x) / (d * d + 1);
      fy -= (e.y - p.y) / (d * d + 1);
    }
  }
  const aim = nearest ? Math.atan2(nearest.y - p.y, nearest.x - p.x) : p.aim;
  let mx = 0;
  let my = 0;
  if (bot === 'kite') {
    const cx = ARENA.width / 2 - p.x;
    const cy = ARENA.height / 2 - p.y;
    const downed = world.players.find((o) => o.state === 'downed');
    const crate = world.pickups[0];
    const target =
      downed ?? (crate && Math.hypot(crate.x - p.x, crate.y - p.y) < 500 ? crate : null);
    mx = fx * 900 + cx * 0.0012 - cy * 0.0009;
    my = fy * 900 + cy * 0.0012 + cx * 0.0009;
    if (target) {
      const d = Math.hypot(target.x - p.x, target.y - p.y) || 1;
      if (d > PLAYER.reviveRadius * 0.5) {
        mx += ((target.x - p.x) / d) * 0.8;
        my += ((target.y - p.y) / d) * 0.8;
      }
    }
    const len = Math.hypot(mx, my);
    if (len > 1) {
      mx /= len;
      my /= len;
    }
  }
  // Switch to the newest owned weapon now and then.
  const slot = seq % 150 === 0 ? world.content.weapon(p.weapons[p.weapons.length - 1]!).slot : 0;
  return { ...emptyInput(), seq, mx, my, aim, fire: !!nearest && nearest.d < 900, slot };
}

console.log(`bot=${bot} seeds=${seeds} max=${maxSec}s`);
for (const size of sizes) {
  const times: number[] = [];
  let kills = 0;
  let waves = 0;
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
    kills += world.stats.kills;
    waves += world.director.wave;
  }
  times.sort((a, b) => a - b);
  const avg = times.reduce((a, b) => a + b, 0) / times.length;
  const fmt = (t: number) => `${Math.floor(t / 60)}:${String(Math.floor(t % 60)).padStart(2, '0')}`;
  console.log(
    `team ${size}: avg ${fmt(avg)}  min ${fmt(times[0]!)}  median ${fmt(times[Math.floor(times.length / 2)]!)}  max ${fmt(times[times.length - 1]!)}` +
      `  | kills/run ${(kills / seeds).toFixed(0)}  waves/run ${(waves / seeds).toFixed(1)}`,
  );
}
