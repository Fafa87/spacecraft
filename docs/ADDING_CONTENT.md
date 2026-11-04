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
     moveSpeedMul: 0.85,          // speed while carried
     fireMoveMul: 0.75,           // extra speed factor while the trigger is held (0..1]
     roles: ['ANTI-ELITE'],       // shown in the HUD + pickup notice (see the profile table)
     projectile: {
       kind: 'shell',             // → sprite key `proj_shell`
       speed: 1300, lifetime: 0.8, radius: 6,
       damage: 70, strength: 7, ap: 1, pierce: 3, knockback: 120,
       // explosion: { radius: 60, damage: 40, edgeFactor: 0.3, strength: 5, ap: 0 },
     },
     unlockAtSec: 480,            // 0 = starting weapon, null = crate-only
     crateWeight: 4,              // chance weight in weapon crates
     // heat: { perShot: 0.16, max: 1, coolPerSec: 0.35, superchargeAt: 0.6,
     //         superchargeDamageMul: 1.6, superchargeStrength: 1, superchargeAp: 1,
     //         ventTime: 1.6, selfDamage: 22 },  // plasma-style
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
   bad numbers (a missing Strength, empty `roles`, `fireMoveMul` outside (0, 1], …).
6. `npx tsx scripts/profile-table.ts` prints time-to-kill and %-damage-through for every weapon
   against every Tyranid, so you can check the new gun has a niche.

## Add an enemy

1. **Data:** append an `EnemyDef` to `packages/shared/src/data/enemies.ts`:

   ```ts
   {
     id: 'lictor',
     name: 'Lictor',
     role: 'Camouflaged hunter; strikes from the shadows.',  // shown on the contact sheet
     hp: 120, toughness: 4, save: 5, speed: 210, accel: 6, radius: 22, mass: 2,
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

## Weapon and Tyranid profiles (v0.5)

Damage follows Warhammer 40k: weapons have **Strength (S)** and **Armour Penetration (AP)**, Tyranids
have **Toughness (T)** and an armour **Save (Sv, 2+ best … 7 = none)**. For every hit
(`sim/systems/combat.ts`, formula in `data/profile.ts`):

1. **Wound:** damage × `woundMul(S, T)`: ×1.25 if S ≥ 2T, ×1 if S > T, ×0.75 if S = T, ×0.5 if
   S < T, ×0.25 if 2S ≤ T.
2. **Save:** roll on the sim RNG; the save succeeds with chance `(7 − max(2, Sv + AP)) / 6` (never
   if that is 7+). A saved hit does **0 damage**, 40 % knockback, and plays the carapace ricochet
   with a few sparks (event `bnc`; there are deliberately no rings or markers on enemies).
3. Hits without a Strength (Tyranid spore-mine / Biovore blasts) ignore T and Sv.

| Weapon        | Direct hit (S / AP / dmg)             | Blast (S / AP / dmg) | Roles                    | `fireMoveMul` | `moveSpeedMul` |
| ------------- | ------------------------------------- | -------------------- | ------------------------ | ------------- | -------------- |
| Bolt Rifle    | 4 / −1 / 15                           | 4 / −1 / 9           | GENERALIST               | 0.80          | 1.00           |
| Heavy Bolter  | 5 / −1 / 17                           | 5 / 0 / 10           | ANTI-HORDE · SUSTAINED   | 0.65          | 0.90           |
| Flamer        | 4 / 0 / 4.5 (pierces)                 | –                    | ANTI-HORDE · SHORT RANGE | 0.85          | –              |
| Plasma Gun    | 7 / −2 / 50 (supercharge +1 S, +1 AP) | –                    | ANTI-ELITE · OVERCHARGE  | 0.80          | –              |
| Meltagun      | 9 / −4 / 300                          | –                    | ANTI-TANK · SHORT RANGE  | 0.75          | –              |
| Frag Grenades | –                                     | 4 / 0 / 110          | ANTI-HORDE · BLAST       | 0.90          | –              |

| Tyranid                | T   | Sv  | HP (wave 1, solo) |
| ---------------------- | --- | --- | ----------------- |
| Ripper                 | 2   | 6+  | 12                |
| Hormagaunt / Termagant | 3   | 5+  | 28 / 30           |
| Spore Mine             | 2   | –   | 20                |
| Genestealer            | 4   | 4+  | 60                |
| Biovore                | 5   | 4+  | 90                |
| Ravener                | 5   | 4+  | 150               |
| Tyranid Warrior        | 5   | 4+  | 220               |
| Carnifex               | 9   | 2+  | 1000              |

Resulting matrix (single target, seconds to kill / share of damage that goes through; from
`npx tsx scripts/profile-table.ts`):

|             | Bolt Rifle   | Heavy Bolter | Flamer       | Plasma        | Melta         | Frag         |
| ----------- | ------------ | ------------ | ------------ | ------------- | ------------- | ------------ |
| Gaunts      | 0.3 s / 83 % | 0.2 s / 83 % | 0.4 s / 67 % | 0.2 s / 125 % | 0.1 s / 125 % | 0.6 s / 67 % |
| Genestealer | 1.1 s / 50 % | 0.5 s / 67 % | 1.5 s / 38 % | 0.5 s / 83 %  | 0.2 s / 125 % | 2.2 s / 38 % |
| Warrior     | 6.0 s / 33 % | 2.3 s / 50 % | 8.5 s / 25 % | 1.9 s / 83 %  | 0.9 s / 100 % | 12 s / 25 %  |
| Carnifex    | 108 s / 8 %  | 35 s / 17 %  | 231 s / 4 %  | 29 s / 25 %   | 6.6 s / 63 %  | 327 s / 4 %  |

The flamer, heavy bolter and frags win against **crowds** (pierce / blast hit many gaunts at once);
the plasma gun owns elites; only the melta (or a very long plasma burst) kills a Carnifex quickly.
`roles` is free text from `WeaponRole` in `data/types.ts`; the HUD shows `ROLE_SHORT` /
`ROLE_COLOR` from `data/profile.ts`.

## Tune difficulty

Tuning lives in `packages/shared/src/data/director.ts`:

- `teamScaling`: per-squad-size tables (8 entries each, index = marines − 1; validation fails if
  one is missing):
  - `budget`: wave threat multiplier (more Tyranids); `pace`: spawn-rate multiplier;
  - `maxAlive`: alive-cap multiplier; `children`: spawned-children cap multiplier;
  - `hp`: Tyranid HP multiplier (on top of `hpScalePerWave`);
  - `elite`: spawn-weight multiplier for enemies with `threat ≥ eliteThreat` (more Warriors,
    Raveners, Carnifexes for big squads).

  Current values (tuned so 1-8 marines survive within ±25 % of solo in `npm run sim`):

  | Marines  | 1    | 2    | 3    | 4   | 5    | 6    | 7    | 8     |
  | -------- | ---- | ---- | ---- | --- | ---- | ---- | ---- | ----- |
  | budget   | 0.85 | 2.0  | 3.3  | 4.5 | 6.0  | 7.0  | 7.5  | 7.9   |
  | pace     | 0.85 | 2.3  | 4.22 | 6.3 | 9.0  | 11.2 | 12.9 | 14.54 |
  | maxAlive | 1    | 1.9  | 2.9  | 3.9 | 4.9  | 5.7  | 6.3  | 6.8   |
  | hp       | 1    | 1.15 | 1.3  | 1.4 | 1.55 | 1.7  | 1.75 | 1.75  |
  | elite    | 1    | 1.5  | 1.9  | 2.3 | 2.7  | 3.1  | 3.4  | 3.8   |

- `waves.budget`: each wave's total threat, `(base + perWave · (wave − 1))^exponent · teamScaling.budget`.
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

Measure with `npm run sim -- --seeds=48 --max=900` (all sizes, ~1 min). The bot picks the owned
weapon with the best `sustainedDps` against its target, so it exercises the profiles too.

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

## Add a map (harder scenario)

Maps live in `packages/shared/src/maps/`. A `MapDef` bundles the playfield (`arena`), where the
squad deploys (`playerSpawn`) and the whole spawn `director` (waves, squad-size scaling,
breaches, drops, bosses, wave table). The original game is `WAVE_MAP` (id `wave`, `maps/wave.ts`),
which just wraps `DIRECTOR` and `ARENA`, so tune the live game in `data/director.ts` as before.

1. Create `maps/<id>.ts`, usually derived from the wave map:
   ```ts
   export const WAVE_HARD = defineMap(WAVE_MAP, {
     id: 'wave_hard', name: 'Hive Siege II', tier: 2,
     director: { waves: { hpScalePerWave: 0.09 }, bosses: { firstWave: 2 } },
   });
   ```
   Director sections merge one level deep; arrays (`spawnPoints`, `waveTable`, per-team-size
   tables) replace. If you change `arena`, also set `playerSpawn` and `spawnPoints` inside it.
2. Append it to `MAPS` in `maps/index.ts` (tier order). `content.test.ts`/`maps.test.ts`
   validate every registered map.
3. Play it: `createWorld(players, seed, content, '<id>')` or `new HostSession({ ..., mapId })`.

Not wired yet (needed before a map picker ships): the map id is not sent to clients (wire
`start` message; add it as an optional field defaulting to `wave` so protocol 5 stays
compatible), client prediction clamps to the wave arena, and leaderboards don't key on the map
(runs on another map should get their own board, e.g. `boards/<version>` → `<version>-<mapId>`,
plus a `map` doc field). `sim-baseline.json` (simDeterminism.test.ts) pins the wave map's
behaviour; regenerate it with `UPDATE_SIM_BASELINE=1` only for an intended gameplay change.
