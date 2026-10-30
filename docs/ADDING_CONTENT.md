# Adding content

All gameplay content is data in `packages/shared/src/data/`. Assets are referenced **by key**,
and `npm run assets` (and `npm test`) fail if a referenced key has no generator. You therefore
cannot forget the art or the sound.

After any change, run: `npm run assets && npm test && npm run dev`.

## Add a weapon

1. **Data:** append a `WeaponDef` to `packages/shared/src/data/weapons.ts`:

   ```ts
   {
     id: 'autocannon',
     name: 'Autocannon',
     slot: 8,                     // number key + HUD order (must be unique, 1..9)
     description: 'Slow, heavy, piercing shells.',
     fireInterval: 0.3,           // seconds between shots
     automatic: true,
     magazine: 12,
     reloadTime: 2.2,
     pellets: 1,
     spread: 0.04,                // radians, total cone
     moveSpeedMul: 0.85,
     projectile: {
       kind: 'shell',             // → sprite key `proj_shell`
       speed: 1300, lifetime: 0.8, radius: 6,
       damage: 70, pierce: 3, armorPierce: true, knockback: 120,
       // explosion: { radius: 60, damage: 40, edgeFactor: 0.3 },
     },
     unlockAtSec: 480,            // 0 = starting weapon, null = crate-only
     crateWeight: 4,              // chance weight in weapon crates
     // heat: { perShot: 0.16, max: 1, coolPerSec: 0.35, superchargeAt: 0.6,
     //         superchargeDamageMul: 1.6, ventTime: 1.6, selfDamage: 22 },  // plasma-style
     sfx: { fire: 'shoot_autocannon', reload: 'reload_bolter' },
     sprites: { icon: 'icon_autocannon', pickup: 'crate_autocannon', held: 'held_autocannon' },
   },
   ```

   `heat` (optional) replaces the magazine as the limit. Each shot adds `perShot`. From
   `superchargeAt · max` shots are supercharged (`superchargeDamageMul`, a bigger projectile, the
   `s: 1` flag in the shot event). Reaching `max` overheats: the weapon vents for `ventTime` and
   the marine takes `selfDamage`.

2. **Sprites:** add `icon_autocannon`, `crate_autocannon`, `held_autocannon` (the gun in the
   marine's hands, drawn over the torso) and `proj_shell` to `tools/src/sprites/weapons.ts` /
   `icons.ts` / `fx.ts`. Each one is a `SpriteDef` with a `draw(ctx, frame, rng)` using
   the helpers in `sprites/draw.ts`. Copying an existing icon, crate and projectile is the
   fastest route. Fill in `prompt` as well (an art brief for later).
3. **Sound:** add a recipe with key `shoot_autocannon` to `tools/src/audio/recipes.ts`
   (bus `'weapons'`). The quickest route is to copy the heavy bolter recipe and change the
   building blocks (`crack`, `sub`, `body`, `rattle`, …) and the `post` chain, then listen in
   `preview.html`. Optional extra keys in the weapon's `sfx`: `impact` (hit on a Tyranid),
   `superFire`, `loop`/`end` (held-trigger loop such as the flamer) and `heatLoop`.
4. **Client visuals (optional):** `packages/client/src/render/visuals.ts` has
   `PROJECTILE_VISUALS` keyed by projectile kind (colour, glow, trail) and `WEAPON_VISUALS` keyed by
   weapon id (muzzle flash size, recoil, casings, screen shake). Unknown ids use the defaults.
5. `npm run assets && npm test`. ContentRegistry validation catches duplicate slots and ids and
   bad numbers.

## Add an enemy

1. **Data:** append an `EnemyDef` to `packages/shared/src/data/enemies.ts`:

   ```ts
   {
     id: 'lictor',
     name: 'Lictor',
     role: 'Camouflaged hunter; strikes from the shadows.',  // shown on the contact sheet
     hp: 120, armor: 2, speed: 210, accel: 6, radius: 22, mass: 2,
     behavior: 'melee',           // 'melee' | 'ranged' (needs `ranged`) | 'kamikaze' (needs `explode`)
     // Optional traits (any behaviour):
     // charge:  { triggerDistance, minDistance, windup, duration, speedMul, cooldown, damage },
     // burrow:  { emergeDistance, speedMul },        // spawns underground, untargetable
     // synapse: { radius, speedMul, damageMul },     // buffs other Tyranids nearby
     // group: [min, max], boss: true,                // bosses spawn from director.bosses
     contactDamage: 18, contactCooldown: 0.8,
     threat: 6,                   // director cost; higher = rarer, groups smaller
     points: 12,                  // personal score for the marine who kills it
     // spawner: { enemy, interval, max, range },   // children: count toward the wave, never drop
     medkitDropChance: 0.08,
     sprite: 'enemy_lictor',
     sfx: { death: 'nid_die_big', attack: 'nid_slash', roar: 'nid_shriek' },
     // optional: windup (charge telegraph), leap (dash start), step + stepEvery (footsteps
     // by px walked), move + moveEvery (skitter / burrow rumble), aura (looping drone)
     decal: 'blood',              // 'blood' | 'acid'
   },
   ```

2. **When it spawns:** give it a weight in one or more `waveTable` entries in
   `packages/shared/src/data/director.ts`:
   `{ fromWave: 7, weights: { hormagaunt: 9, termagant: 5, genestealer: 3, lictor: 1 } }`.
3. **Sprite:** add `enemy_lictor` to `tools/src/sprites/tyranids.ts`. It faces +X, uses the hive
   palette (`palette.ts`), and has `anims: { walk, attack, death }` frame ranges (see
   [ART_PIPELINE.md](ART_PIPELINE.md)). Optionally add an `ENEMY_VISUALS` entry in
   `client/src/render/visuals.ts` (animation fps, shadow, corpse).
4. **New behaviour?** Add it to `EnemyBehavior` in `data/types.ts`, implement it in
   `sim/systems/enemies.ts`, and add a validation rule in `ContentRegistry.validate()`.
5. `npm run assets && npm test`, then `npm run sim` to check the difficulty curve.

## Tune difficulty

Tuning lives in `packages/shared/src/data/director.ts`:

- `teamScale`: the multiplier for 1-8 marines (one entry per team size up to `MAX_PLAYERS`;
  validation fails if one is missing).
- `waves.budget`: each wave's total threat, `(base + perWave · (wave − 1))^exponent · teamScale`.
  The wave is finite: the next one starts only when it is fully cleared.
- `waves.pace`: threat sent out per second during a wave; `waves.flankPoints`: how many breaches
  a wave uses at once.
- `waves.firstDelay` / `waves.breather`: seconds before wave 1 and between waves.
- `waves.hpScalePerWave`: enemy HP growth. `waves.maxChildren`: cap on spawned children alive.
- `waves.reveal`: anti-stall (reveal and hunt when `remaining` or `fraction` are left, or after
  `afterSec`). `waves.forceNextAfter`: optional hard timeout per wave (omit it to disable).
- `maxAlive`: the alive cap (`base + perWave`, up to `cap`).
- `spawnPoints`: the breaches `{ id, x, y, kind: 'breach' | 'tunnel' | 'vent' }`; `spawn`: the
  telegraph times and group sizes.
- `drops`: medkits and crates per wave (`base + perMarine × marines`). `crates`: crate timing.
- `bosses`: which enemy leads boss waves, on which wave, and how many per team size.
- `waveTable`: the spawn weights by wave (`fromWave`).

Measure with `npm run sim -- --bot=kite --seeds=8 --sizes=1,2,4,8`.

Squad-wide survival tunables live in `PLAYER` (`shared/src/constants.ts`): `bleedOutTime`
(60 s since v0.4, was 20 s), `reviveTime` (3 s) and `reviveRadius`. Weapons can be **braced**
(`braceDelay`, `braceFireRateMult`, `braceSpreadMult`, see the Heavy Bolter).

## Add or replace a sound or music track

- **Procedural SFX:** add a `Recipe` to `tools/src/audio/recipes.ts`:
  `{ key, description, bus, volume, maxVoices, priority, variants?, vary?, duck?, loop?, layers, post? }`.
  - `layers` are rendered and summed. The kinds are `tone` (oscillator with a pitch contour; a
    `Range` is a number, `[from, to]` or a multi-point contour), `noise` (white/pink/brown through
    a swept biquad), `click` (transient), `metal` (inharmonic partials: clanks, rattles),
    `grains` (granular chitin and debris), `formant` (vowel throats: hisses, roars, grunts) and
    `crackle` (electric sparks).
  - `post` masters the sum: EQ, saturation, compression and a short reverb.
  - `variants` (default 3) are re-rolled with `vary` pitch/time jitter. `loop: { length, xf }`
    renders a seamless loop (a single variant). `duck` lowers the music when it plays.
  - `bus` (`weapons` | `enemies` | `ambience` | `ui`) picks the mixer slider. `priority` 0–10 decides
    who survives the 32-voice limit.
  - Game-event sounds the client always uses are listed in `CORE_SOUNDS` (`shared/src/assets/keys.ts`).
  - Audition: `npm run assets`, then `/assets/generated/preview.html`, or add the key to the
    scripted mix in `tools/src/audioPreview.ts` and run `npm run audio-preview -w @sms/tools`.
- **Procedural music:** add a `SongSpec` to `tools/src/audio/music.ts`:
  `{ key, style: 'menu'|'combat'|'combatDrive'|'boss'|'tension', bpm, bars, root, scale, progression, seed, volume }`.
  In game the client plays `combat` and layers the `combat_drive` stem in with the number of live
  Tyranids (silent during a breather), and switches to `boss` while a boss is on the field.
  Tracks the client plays are listed in `CORE_MUSIC`.
- **Hand-made or AI-made audio:** drop `tools/assets-src/overrides/sfx/<key>.wav` (one take) or
  `<key>_0.wav`, `<key>_1.wav`, … (variants), or `.../music/<key>.wav`. They are copied as-is, and
  the manifest marks them `source: "override"`.

## Replace a sprite with real art

Put `tools/assets-src/overrides/sprites/<key>.png` there: a horizontal strip with `frames`
frames, at any resolution (it is scaled to the frame size). Keep the facing convention (+X) and
the anchor, then rerun `npm run assets`. The `prompt` field of each SpriteDef is the text to give
an image model or an artist.

## Add a chapter (player colour scheme)

Append a `ChapterDef` to `packages/shared/src/data/chapters.ts`: `{ id, name, motto, primary,
trim, detail, lens, icon }`, where `icon` is one of `chevron | drop | blade | tower | fang | flame | bolt | feather`. There
must be at least `MAX_PLAYERS` (8) chapters, one per squad slot. The
sprite generator draws `marine_<id>`, `_top`, `_down` and `badge_<id>` automatically. Chapters are
sent on the wire by index, so append new ones at the end. Use only simple geometric badges of
your own. Never copy real chapter iconography.

## Rename things

Display names are data. Add a preset to `NAME_PRESETS` in `packages/shared/src/data/naming.ts`
(`{ title?, subtitle?, weapons?: {id: name}, enemies?: {id: name}, chapters?: {id: name} }`)
and select it with `?names=<preset>` or `VITE_NAMES=<preset>`. Ids never change, so saves,
replays and leaderboards stay compatible.
