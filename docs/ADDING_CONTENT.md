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
     slot: 6,                     // number key + HUD order (must be unique, 1..9)
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
     sfx: { fire: 'shoot_autocannon', reload: 'reload' },
     sprites: { icon: 'icon_autocannon', pickup: 'crate_autocannon' },
   },
   ```

2. **Sprites:** add `icon_autocannon`, `crate_autocannon` and `proj_shell` to
   `tools/src/sprites/items.ts`. Each one is a `SpriteDef` with a `draw(ctx, frame, rng)` using
   the helpers in `sprites/draw.ts`. Copying an existing icon, crate and projectile is the
   fastest route. Fill in `prompt` as well (an art brief for later).
3. **Sound:** add an `SfxDef` with key `shoot_autocannon` to `tools/src/audio/sfxPresets.ts`.
   Layer sfxr params (wave, baseFreq, freqRamp, envelope, …) and tweak them while listening in
   `preview.html`.
4. **Client visuals (optional):** `packages/client/src/render/visuals.ts` has
   `PROJECTILE_VISUALS` keyed by projectile kind (colour, glow, trail). Unknown kinds use
   `DEFAULT_PROJECTILE_VISUAL`.
5. `npm run assets && npm test`. ContentRegistry validation catches duplicate slots and ids and
   bad numbers.

## Add an enemy

1. **Data:** append an `EnemyDef` to `packages/shared/src/data/enemies.ts`:

   ```ts
   {
     id: 'lictor',
     name: 'Stalker',
     hp: 120, armor: 2, speed: 210, accel: 6, radius: 22, mass: 2,
     behavior: 'melee',           // 'melee' | 'ranged' (needs `ranged`) | 'kamikaze' (needs `explode`)
     contactDamage: 18, contactCooldown: 0.8,
     threat: 6,                   // director cost; higher = rarer, groups smaller
     medkitDropChance: 0.08,
     sprite: 'enemy_lictor',
     sfx: { death: 'enemy_die_big', attack: 'enemy_bite' },
     decal: 'blood',              // 'blood' | 'acid'
   },
   ```

2. **When it spawns:** give it a weight in one or more `waveTable` entries in
   `packages/shared/src/data/director.ts`:
   `{ fromSec: 180, weights: { swarmer: 10, brute: 2, spitter: 2, burster: 2, lictor: 1 } }`.
3. **Sprite:** add `enemy_lictor` to `tools/src/sprites/characters.ts`. Face +X, with N frames
   of the walk cycle; the renderer cycles the frames and rotates the sprite to the heading.
4. **New behaviour?** Add it to `EnemyBehavior` in `data/types.ts`, implement it in
   `sim/systems/enemies.ts`, and add a validation rule in `ContentRegistry.validate()`.
5. `npm run assets && npm test`, then `npm run sim` to check the difficulty curve.

## Tune difficulty

Tuning lives in `packages/shared/src/data/director.ts`:

- `budget`: threat points per second, `(base + perMinute · minutes^exponent) · teamScale`.
- `teamScale`: the multiplier for 1-4 marines.
- `maxAlive`: the alive cap.
- `hpScalePerMinute`: enemy HP growth.
- `surge`: periodic big waves.
- `crates`: weapon crate timing.

Measure with `npm run sim -- --bot=kite --seeds=8 --sizes=1,2,4`.

## Add or replace a sound or music track

- **Procedural SFX:** add an `SfxDef` to `tools/src/audio/sfxPresets.ts`. Game-event sounds the
  client always uses are listed in `CORE_SOUNDS` (`shared/src/assets/keys.ts`).
- **Procedural music:** add a `SongSpec` to `tools/src/audio/music.ts`:
  `{ key, style: 'battle'|'menu'|'tension', bpm, bars, root, scale, progression, seed, volume }`.
  Tracks the client plays are listed in `CORE_MUSIC`.
- **Hand-made or AI-made audio:** drop `tools/assets-src/overrides/sfx/<key>.wav` or
  `.../music/<key>.wav`. It is copied as-is, and the manifest marks it `source: "override"`.

## Replace a sprite with real art

Put `tools/assets-src/overrides/sprites/<key>.png` there: a horizontal strip with `frames`
frames, at any resolution (it is scaled to the frame size). Keep the facing convention (+X) and
the anchor, then rerun `npm run assets`. The `prompt` field of each SpriteDef is the text to give
an image model or an artist.
