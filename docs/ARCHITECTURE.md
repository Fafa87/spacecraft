# Architecture

## Goals

1. **Content as data.** Weapons, enemies and the spawn director are plain typed tables. Systems
   read them through `ContentRegistry`, which validates them on load and in tests.
2. **One simulation, many hosts.** The simulation in `@sms/shared/sim` is pure, deterministic
   TypeScript, with no DOM, Node or network code. The same code runs in a browser host, the
   dedicated WS host, tests, the balance sim, and (later) replay verification.
3. **Transport is a detail.** Sessions talk through the `Link` interface (`send`, `onMessage`,
   `onClose`, `close`). Adding a transport means writing one Link class.
4. **Assets are generated, and replaceable.** Every sprite and sound has a procedural default
   plus an override hook, and the content data names assets by key only.

## Packages

```
@sms/shared ──► used by everyone (source-only package; consumers compile it)
  data/       WeaponDef / EnemyDef / DirectorConfig tables + ContentRegistry (lookups, validate())
  sim/        World state + systems, stepped by stepWorld(world, dt):
                players.ts      movement (inputs) / downed, revive, bleed-out, game over
                weapons.ts      fire, reload, switch, unlocks over time
                projectiles.ts  swept-segment collision (no tunnelling), pierce, explosions
                enemies.ts      melee / ranged / kamikaze behaviours, separation via SpatialHash
                director.ts     threat budget ↑ over time, wave table, surges, weapon crates
                combat.ts       damage, armor, knockback, explosions, kill credit
                pickups.ts      medkits and weapon crates
              snapshot.ts      compact per-tick snapshot (arrays for enemies/projectiles)
  session/    HostSession (lobby → playing → over, 30 Hz fixed step with catch-up, input queues,
              snapshots, result submit); ClientSession (join/start/input, events); Scheduler
  net/        protocol.ts (ClientMessage / HostMessage), codec (JSON today), Link + LocalLink pair
  highscore/  RunResult types + validateRunResult (shared by client and server)
  assets/     manifest types + referencedAssetKeys(content) for coverage checks

@sms/server
  app.ts               buildApp(): Fastify + CORS + /api/health, /api/config, highscore routes
  server.ts            startServer(config): repo + app + optional WS host + PeerJS, close()
  highscores/          HighscoreRepository interface; memory / json / sqlite (sql.js) implementations;
                       routes.ts (GET/POST), rateLimiter.ts
  gamehost/            WsGameHost: rooms of HostSessions over WebSocket links (/ws?create=1 | ?room=CODE)
  peer/                bundled PeerJS signaling server

@sms/client
  app/App.ts           screens and flow (menu → lobby → game → game over), connection setup
  net/                 PeerLink (PeerJS DataConnection), WsLink, connection.ts (host/join/solo factories)
  game/                GameClient (render loop, input → ClientSession), prediction, interpolation, fx
  input/               InputSource abstraction → ContinuousIntent {move, aim, fire} + ActionIntent
                       {slot, cycle, reload}; KeyboardMouseInput (the PC controls), TouchInput (twin
                       floating VirtualSticks + buttons), InputManager (merges both, picks aim from the
                       active device), device.ts (touch/kbm auto-detect → body.touch-mode),
                       joystick.ts (pure stick/deadzone math). Sim and protocol are unchanged:
                       intents become the same PlayerInput {mx, my, aim, fire, …}.
  render/              Renderer (Canvas2D, atlas sprites), camera, HUD, particles, visuals mapping
  audio/               AudioEngine (WebAudio graph: buses → compressor → master, music ducking,
                       variants, sustained loops) and mixer.ts (pure: volumes, spatialize,
                       voice stealing, variant picking)
  game/enemyAudio.ts   snapshot-driven creature sound: swarm bed by nearby count, Carnifex
                       steps, skitter/burrow, synapse drone, hisses, landings, plasma heat whine
  highscores/          HighscoreStore interface: Http + Local (localStorage) + Fallback composition
  ui/                  DOM screens (menu, lobby with join QR, quick-join for ?join=CODE), leaderboard
                       tables, qr.ts (client-side QR via `qrcode`), styles (responsive + safe areas)
  net/joinUrl.ts       build/parse the shareable join link (respects BASE_URL, keeps ?ws / ?api)

@sms/tools
  sprites/             SpriteDef { key, w, h, frames, prompt, draw(ctx, frame, rng) }
  atlas/pack.ts        shelf packer
  audio/dsp.ts         DSP toolkit (oscillators, noise, biquads, shaping, compressor, reverb)
  audio/synth.ts       renders a Recipe's layers + post chain into variants / seamless loops
  audio/recipes.ts     every SFX as data; music.ts (sequencer); audioPreview.ts (showcase mix)
  generate.ts          builds atlas + wavs + manifest + preview, applies overrides, checks coverage
```

## Game loop and networking

```
 client tab(s)                                      host (browser tab / WS server / LocalLink)
 ┌──────────────────────────┐   input {seq,mx,my,aim,fire…}   ┌───────────────────────────────┐
 │ Input → ClientSession ───┼────────────────────────────────►│ HostSession                   │
 │ Predictor (own marine)   │                                 │  queue inputs per player      │
 │ SnapshotBuffer (others)  │◄────────────────────────────────┼─ every tick: apply 1 input,   │
 │ Renderer / Audio / HUD   │   snapshot {tick, ack, players, │   stepWorld(dt=1/30),         │
 └──────────────────────────┘   enemies, projectiles, events} │   buildSnapshot → broadcast   │
                                                              │  world.over → RunResult →     │
                                                              │   submitResult() → 'submitted'│
                                                              └───────────────────────────────┘
```

- Each input frame is exactly one tick of movement. The host keeps a short queue per player
  (max 12) so jitter does not drop or double inputs, and acknowledges the last applied `seq` in
  each snapshot.
- **Prediction:** the client applies its input immediately with `stepPlayerMovement`. On each
  snapshot it resets to the authoritative position and replays pending inputs. Corrections under
  120 px become a decaying visual offset; anything larger snaps.
- **Interpolation:** remote entities render at `serverTime - 2.5 ticks` from a SnapshotBuffer
  whose clock offset adapts quickly to early packets and slowly to late ones.
- **Events** (`shot`, `hit`, `kill`, `explode`, `down`, `revive`, `unlock`, `surge`, …) ride in
  snapshots and drive SFX and particles on every client, so FX never need extra messages.
- **Solo** uses the same path over an in-memory LocalLink pair, so there is exactly one
  code path to test.

### Transports

| Mode                | Host runs in | Link                             | Notes                                                                     |
| ------------------- | ------------ | -------------------------------- | ------------------------------------------------------------------------- |
| Solo                | own tab      | LocalLink                        | zero latency                                                              |
| P2P co-op (default) | host's tab   | PeerJS DataConnection (reliable) | signaling via bundled PeerJS server; needs WebRTC (STUN; TURN on roadmap) |
| Dedicated (`?ws=1`) | Node server  | WebSocket                        | server submits scores itself, so this is the path to verified scores      |

## Highscores

```
HostSession ──RunResult──► submitResult()
   browser host:  FallbackHighscoreStore ─► FirestoreHighscoreStore ─► Firestore REST (:commit / :runQuery)
                                      ├─(or)─► HttpHighscoreStore ─► POST /api/highscores
                                      └─(offline)─► LocalHighscoreStore (localStorage, flushed later)
   WS host:       repo.add() directly
server: routes.ts ─► RateLimiter ─► validateRunResult ─► HighscoreRepository (sqlite | json | memory)
```

Tables are keyed by `teamSize` (1-4), ordered by `survivalMs DESC, submittedAt ASC`. `runId`
makes submits idempotent. See the README for the anti-cheat roadmap.

The remote store is picked in `client/src/highscores/index.ts`. Firestore is used when
`VITE_FIREBASE_*` is set (the Pages build), then the HTTP server, then local only. Firestore
security rules are generated from `shared/src/highscore/{limits,names}.ts` by `npm run rules`, so
client validation and server-side enforcement can't drift. A test fails if `firestore.rules` is
stale. Permanent rejections (4xx) are kept in local scores and not retried. Network errors are
queued and retried.

Leaderboards are **per game version (major.minor)**. Firestore writes go to
`boards/{major.minor}/highscores/{runId}` (`leaderboardBoard(GAME_VERSION)` in shared), and the
local fallback uses `sms.highscores.board-<major.minor>`. The frozen v0.1.0 build keeps the
legacy top-level `highscores` collection. Because all boards share the collection id, one
composite index serves every board.

## Hive Siege (40k) systems

- **Chapters.** `ContentRegistry.chapters` comes from `data/chapters.ts`. The lobby stores a
  chapter index per member: `join {chapter?}` requests one, `chapter {id}` switches, and the host
  keeps them unique and falls back to the first free one. The index travels in `LobbyPlayer.chapter`
  and `PlayerSnap.c` and selects the `marine_<id>` sprites, the HUD colour and the badge.
- **Heat weapons.** `WeaponDef.heat` (plasma) is simulated in `sim/systems/weapons.ts`.
  `Player.heat[weaponId]` cools every tick. Past `superchargeAt` shots are supercharged (`shot.s = 1`);
  at `max` the weapon overheats: it vents (`Player.venting`), the marine takes self-damage and
  the `overheat` event fires. Snapshots carry `ht` and `vt` for the HUD heat bar.
- **Enemy traits.** These are composable on any behaviour in `sim/systems/enemies.ts`:
  - `charge`: an idle → wind-up → dash state machine. The `charge` event fires when the
    wind-up starts and `leap` when the dash starts.
  - `burrow`: spawns underground and untargetable, moves faster, and erupts within
    `emergeDistance` with the `emerge` event.
  - `synapse`: each tick, buffs the speed and damage of non-synapse Tyranids in its radius.
  - `explode`: fuse and death bursts, for spore mines.

  Each state is a bit in `EnemySnap[6]` (`ENEMY_FLAG`), so the client can animate wind-ups,
  dust trails and synapse halos without extra messages. The leap telegraph is drawn on the body
  (`Renderer.windupPose`): the Hormagaunt crouches, pulls back, trembles and kicks dust with
  glowing eyes; the Carnifex rears up, sways, paws the deck and roars. The dash stretches the
  sprite with ghost trails, and landing throws dust (and plays `dust_land` / a step).

- **Boss waves.** `director.bosses` spawns the boss on surge `firstSurge` and every `everySurge`
  after it. The count depends on team size and grows by `extraPerAppearance`. The `boss` event drives
  the horn and the banner.
- **Presentation** is client-only and data-keyed: `render/visuals.ts` (`WEAPON_VISUALS`,
  `ENEMY_VISUALS`, `PROJECTILE_VISUALS`), `game/fx.ts` (muzzle flashes, ichor, decals, distance-
  attenuated screen shake, sounds per event) and `render/hud.ts` (the brass-and-parchment HUD).
- **Names** are data: `withNames(preset)` returns a registry with the display names replaced and
  ids untouched (`?names=`).
- **Versioned site.** `scripts/deploy-pages.ts` publishes the latest build at the root and frozen
  `/vX.Y.Z/` builds next to `versions.json`. `ui/versions.ts` derives the site root from
  `BASE_URL`.

## Extension points (where to start)

| Want to…                               | Touch                                                                                          |
| -------------------------------------- | ---------------------------------------------------------------------------------------------- |
| add a weapon / enemy / tune waves      | `shared/src/data/*.ts` (+ sprite & sound in `tools/`) — see ADDING_CONTENT.md                  |
| add a new enemy _behaviour_            | `EnemyBehavior` in `data/types.ts` + a case in `sim/systems/enemies.ts`                        |
| add a new system (e.g. perks, turrets) | new file in `sim/systems/`, call it from `sim/simulation.ts`, add fields to `World` + snapshot |
| change the wire format                 | `net/codec.ts` (binary/delta), bump `PROTOCOL_VERSION`                                         |
| add a transport                        | implement `Link` (see `client/src/net/PeerLink.ts`, `server/src/gamehost/wsLink.ts`)           |
| change highscore storage               | implement `HighscoreRepository`, register in `createRepository.ts`                             |
| replace procedural art/audio           | drop files in `tools/assets-src/overrides/…` (see ART_PIPELINE.md)                             |
| add a chapter / rename everything      | `data/chapters.ts` / `NAME_PRESETS` in `data/naming.ts`                                        |
| balance                                | `npm run sim`, then edit `data/director.ts` / `data/weapons.ts`                                |
