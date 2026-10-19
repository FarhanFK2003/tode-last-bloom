# Tode: Last Bloom (technical guide)

A small 3D browser game built with [Three.js](https://threejs.org/) and [Vite](https://vite.dev/). It grew out of
the Tode the Frog project from the JetBrains Academy course "Build a Game with an AI Coding Agent"; see the
[root README](../README.md) for the project overview, and the [Credits](#credits) below for third-party assets.

This file is the technical guide: how to run the game, how it plays, and how the code is put together. Every number
below is taken from the code; where a value lives in a constant, the constant and its file are named.

## Running

**Prerequisites:** [Node.js](https://nodejs.org/) 20.19+ or 22.12+ (the range Vite 7 requires) and npm, and a
modern desktop browser with WebGL and a keyboard.

The game's scripts are in `game/package.json`. Its dependencies (`three`, `vite`) are also declared in the root
`package.json`, and in this repository they are installed in the root `node_modules/`, which is where the scripts
resolve them from. So install from the repository root, then run the scripts from `game/`:

```bash
npm install          # once, from the repository root
cd game
npm run dev          # Vite dev server; open the local URL it prints
npm run build        # production build into game/dist/ (ignored by Git)
npm run preview      # serve the production build
```

The models are loaded at run time from `game/public/models/`. If one fails to load, the game logs one console error
and carries on without it (for scenery and wildlife), so a missing file never stops a level from starting.

Repository rules (`AGENTS.md`, `.junie/guidelines.md`): make changes in `game/` only, and don't look for or run
tests. Features are checked by playing the game in the browser.

## How to play

A magical flower grows at the centre of each level. Enemies come for it; keep it alive until the level's timer runs
out, without losing all your lives, then face Snapjaw the crocodile in the final level.

### Levels

A run plays the four levels in order (`levels.js`). Completing a level shows `LEVEL COMPLETE` with a **Continue**
button; the score and lives carry over. Completing the last level shows `THE FLOWER BLOOMED`.

| # | Level | Time | Enemies |
|---|---|---|---|
| 1 | Garden | 60 s | Bees only: 4 at the start, then in 4 waves (see [Waves and schedules](#waves-and-schedules)) |
| 2 | Coast | 75 s | Sand Crabs only, which go for the flower |
| 3 | Pond | 90 s | Bees, Sand Crabs that hunt the players, and the Ink Octopus |
| 4 | Lagoon Boss | No timer | Snapjaw the crocodile; won by defeating it |

### Single player and co-op

The main menu's **Play** asks for **Single Player** or **Two Player Co-op** (two players on one keyboard).

- **Lives:** 3 in single player; in co-op the team shares one pool of **6** (`MAX_LIVES`, `COOP_MAX_LIVES` in
  `Lives.js`). A hit to either player costs one life from it. The game is lost when the pool is empty.
- **Invulnerability:** after a hit, only the player who was hit blinks and is safe from further hits for 1.5 s
  (`INVULNERABILITY_TIME`); the other player can still be hit.
- **Player 2** is orange (its skin, attack circle and HUD labels) and starts beside Player 1 (`COOP_STARTS` in
  `main.js`). Players block each other's hops.
- **Camera:** in co-op it frames both players, zooming out (up to 3x, `MAX_ZOOM` in `Camera.js`) to keep them on
  screen.

### Controls

| Action | Player 1 | Player 2 (co-op) |
|---|---|---|
| Hop one tile | Arrow keys | W A S D |
| Attack | Space | F |
| Bloom Pulse | M | E |
| Pause / back | Esc | Esc |

- Hops are queued and played in order; holding a key gives one hop. Gameplay keys only act while playing.
- On the end screens, Space presses the main button (Continue, Restart Level or Play Again).
- Keys **1** to **4** jump straight to that level from any screen except the main menu (a developer shortcut),
  using the current checkpoint's score and lives.
- Some keyboards cannot register many keys at once, so a few key combinations may not work together in co-op.

### The flower

- The flower has 20 HP (`FLOWER_MAX_HEALTH` in `Flower.js`). Anything biting it costs 1 HP per full second of
  contact; Ink Octopus ink costs 1 HP per blob.
- It flashes red on every hit, wilts toward brown as it loses health, and glows more warmly as the level goes on.
- It is built from simple shapes in code. Its collision size is still measured from the `flower_single.glb` model,
  which is loaded for that and never shown.
- It reaches 0 HP: `DEFEAT / The flower wilted`.

### Enemies

- **Bees** (`Enemy.js`) appear at the four map corners and fly straight for the flower at 30 units/s
  (`ENEMY_SPEED`), scaled by difficulty. They fly over water. A bee touching a player costs that player's team a
  life; one attack defeats a bee.
- **Sand Crabs** (`Crab.js`) appear just inside the middle of a map edge. They move in sideways scuttles of 40 units
  along the map's axes, raising their claws for 0.6 s before each one. Their shell takes two hits: the first cracks
  it and stuns the crab for 1.5 s (harmless), the second defeats it.
  - **On the Coast** they go for the flower and face it, bite it once per second while in reach, and never cost a
    life (players can still bump into them).
  - **On the Pond** they hunt the nearest player and cost a life on contact, while turning to face the flower.
    Because they still scuttle along the map's axes toward the player, a Pond crab can move sideways or backwards
    relative to the way it faces.
- **Ink Octopus** (`Octopus.js`, Pond only) drifts in from near the map edge and stops 130 units from the flower,
  just outside the Bloom Pulse's reach (`STOP_DISTANCE`). Every 4 s it lobs ink: a shrinking ring marks the spot
  for 1.2 s, the ink costs the flower 1 HP (unless the Bloom Shield is up) and leaves a puddle that slows hops to
  60 % for 5 s. Touching it never hurts; one attack defeats it.
- **Snapjaw** (`CrocodileBoss.js`, Lagoon Boss): rises out of the lagoon, chases the nearest player, and when a
  player is within 230 units it shows a strip on the ground for 1 s and charges along it. A player it runs into, or
  who hops into it while it is dangerous, loses a life. After a charge it is dizzy for 2.5 s (3.5 s if it crashed
  into something), and only then do attacks hurt it; each hit removes 1 HP. It has **10 HP in single player and 16
  in co-op** (`HEALTH`). In the arena there is no flower and no Bloom Pulse, and the Bloom Shield protects the
  players instead.

### Attack, Bloom Pulse and pickups

- **Attack:** defeats or damages every enemy touching the circle around the player (radius 30, `ATTACK_RADIUS` in
  `Attack.js`), with a 1 s cooldown. Both scale with difficulty.
- **Bloom Pulse:** pushes every enemy within 100 units of the flower straight away from it for 0.5 s; pushed
  enemies are harmless and can't bite (`Pulse.js`). It doesn't defeat anything. Each player has their own 15 s
  cooldown.
- **Pickups** (`PowerUps.js`) appear on a ring 90 units around the flower: the first 15 s into a level, then every
  20 s, at most 2 on the ground, each lasting 12 s (blinking for the last 3):
  - **Bloom Shield:** the flower takes no damage for 8 s (in the boss arena it protects the players instead, so it
    isn't offered there).
  - **Nectar Boost:** the player who collects it hops 1.5x faster for 6 s.
  - **Petal:** restores one shared life; only appears, and can only be collected, while a life is missing.

### Score and endings

- Score: 10 points per enemy defeated by an attack (a cracked crab shell earns nothing; Snapjaw counts as one), plus
  0.1 point per second survived (`Score.js`).
- Losing every life: `DEFEAT / Tode was caught` (`The Todes were caught` in co-op).
- The defeat screen offers **Restart Level**, which replays the level from the score and lives it began with.

### HUD

- **Top left:** the flower's health bar and value (hidden in the boss arena), one heart per life (3 in single player,
  6 in co-op), one Bloom Pulse row per player (`Pulse [M]`, or `P1 Pulse [M]` and `P2 Pulse [E]` in co-op) showing
  `Ready` or its cooldown, and chips for active Shield and Boost effects.
- **Top centre:** the score.
- **Top right:** the level, the timer (`m:ss`, hidden on the boss level) and the bee wave (`Wave N/4`, hidden on
  levels without bee waves). On the boss level, Snapjaw's health bar.

### Menus and settings

- **Main menu:** Play, How to Play, Settings and Credits.
- **Pause (Esc):** Resume, Restart Level, Settings and Main Menu. Everything in the game freezes while paused.
- **Settings:** music and sound-effect volumes and a mute switch, saved in the browser's `localStorage`
  (`tode-last-bloom:settings`, `Settings.js`).
- **Audio:** the music and sound effects are generated in code with the Web Audio API (`Audio.js`); there are no
  audio files. Player 2's sounds are pitched slightly higher.

## Waves and schedules

All of this lives in `levels.js`. A bee wave (`waves`) runs from its `start` (seconds into the level) until the next
one: one bee spawns every `spawnInterval` seconds at a random corner while fewer than `maxActive` bees are flying.
Levels with bee waves also start with one bee at each corner.

| Level | Bee waves: start / interval / cap |
|---|---|
| Garden | 0 s / 3.0 s / 8 · 15 s / 2.2 s / 12 · 30 s / 1.6 s / 16 · 45 s / 1.1 s / 20 |
| Pond | 0 s / 2.25 s / 11 · 22 s / 1.65 s / 15 · 45 s / 1.2 s / 19 · 67 s / 0.83 s / 23 |

Crabs (`crabs`) follow their own schedule, at most one new crab per frame and never above the cap:

| Level | Crabs |
|---|---|
| Coast | From 0 s: one every 7 s, at most 2 (3 in co-op) · from 25 s: every 5 s, 3 (4) · from 50 s: every 3.5 s, 5 (6) |
| Pond | First at 15 s, then one every 20 s, at most 2 (2 in co-op) |

The Ink Octopus (`octopus`, Pond only): the first at 30 s, then another every 25 s while fewer than 1 is active.
When no spawn spot is free (too close to a player, an enemy or an obstacle), crabs and octopuses try again after 1 s.

## Difficulty

Difficulty starts at each level's `startDifficulty` (Garden 0, Coast 0.3, Pond and Lagoon Boss 0.6) and grows by
0.005 per point scored in that level, up to 2 (`DIFFICULTY_GROWTH_RATE`, `MAX_DIFFICULTY` in `main.js`).

- Enemy speeds are multiplied by `1 + difficulty` (up to 3x).
- Player hop speed and attack radius are multiplied by `1 + difficulty / 2` (up to 2x), and the attack cooldown is
  divided by it.
- Spawning follows the level timer only, never the score.

## Architecture

`src/main.js` is the conductor. It creates the scene, lights, players and worlds, owns the enemy list, spawning,
difficulty, lives and the game state, and runs the single animation loop. `src/levels.js` describes the four levels.
Each file in `src/components/` builds one part of the game. Most only talk to `main.js`; a few share helpers (for
example, the Garden uses the houses and wildlife, and crabs share the bees' Bloom Pulse pushback).

| File | Responsibility |
|---|---|
| `levels.js` | The levels in order: world, ground, light, features, map edge, duration, waves and enemy schedules |
| `components/World.js` | Builds each level's world once (ground plus its features) and keeps it for the page session |
| `components/Map.js` | The painted ground textures (Garden meadow, Coast sand, Pond meadow) |
| `components/Garden.js` | Garden houses (via `House.js`), meadow dressing, backdrop, border, beehives and wildlife |
| `components/House.js` | The three randomly placed houses, the Garden's only obstacles |
| `components/Wildlife.js` | Garden butterflies and rabbits |
| `components/Coast.js` | Coast sea and shoreline, lighthouse, dolphin, rocks and palms (obstacles), beach details, boat and turtle |
| `components/Pond.js` | Pond lagoon (water), logs and stones (obstacles), reeds, lily pads and ripples |
| `components/Player.js` | Tode: loading, hopping, collisions, poses, and Player 2's orange skin |
| `components/Attack.js` | The attack circle and its cooldown |
| `components/Pulse.js` | The Bloom Pulse ability and its ring |
| `components/Flower.js` | The flower, its health and its hit flash, wilt and bloom |
| `components/Lives.js` | The shared lives and each player's invulnerability window |
| `components/Enemy.js` | Bees, their flight animation, bites, and the Bloom Pulse pushback shared by enemies |
| `components/Crab.js` | Sand Crabs (Coast flower-hunters and Pond player-hunters) |
| `components/Octopus.js` | The Ink Octopus, its ink and puddles |
| `components/CrocodileBoss.js` | Snapjaw and its fight |
| `components/PowerUps.js` | Pickups and the Shield and Boost effects |
| `components/Camera.js` | The camera and its co-op framing zoom |
| `components/Renderer.js` | The WebGL renderer |
| `components/Hud.js`, `Score.js` | The in-game HUD and the score |
| `components/Menu.js`, `PauseMenu.js`, `GameOver.js` | The main menu (with How to Play and Credits), the pause menu and the end screens |
| `ui.js` | Shared menu building blocks, including the Settings panel |
| `components/Settings.js` | Saved settings |
| `components/Audio.js` | Procedural music and sound effects |
| `components/Input.js` | The single keyboard listener |
| `collision.js` | Collision radii and footprints, and the movement checks |

### Frame loop

Each frame, `main.js` reads the frame time once (capped at 0.1 s, `MAX_DELTA`) and, only while playing, runs
`updateGame`, in this order:

1. Invulnerability windows and power-up effects count down.
2. Players hop; a hop into a dangerous enemy costs a life.
3. Pickups are collected.
4. Attacks hit enemies; defeated enemies are removed and scored.
5. Bees, crabs and octopuses spawn according to the level's schedules.
6. Bloom Pulses push nearby enemies back.
7. Enemies move: bee and crab bites on the flower, enemies running into players, octopus lobs.
8. Snapjaw's fight advances (boss level only).
9. Ink lands.
10. The level timer counts down; reaching 0 completes the level.

A defeat ends the frame as soon as it happens, so a loss and a timeout in the same frame count as a loss. Outside
`updateGame`, the world's scenery animation also only runs while playing; the flower's and Bloom Pulse's visuals
keep running on the end screens; then the camera, HUD and render update every frame. Pausing or ending a level
freezes the game.

### Coordinates and camera

- Three.js scene with **Z up**; the ground is the XY plane at z = 0. Models made Y-up are turned upright when loaded.
- The map is 500 x 500 units centred on the origin (`MAP_SIZE`), with the flower at the origin. A hop moves one
  20-unit tile (`TILE_SIZE`, `JUMP_DISTANCE`) at 3 hops per second (`MOVE_SPEED`).
- The map edge blocks the players on every level.
- The camera looks at the players from an offset of (300, -300, 300) with a 30-degree field of view (`Camera.js`),
  so scenery north and west of the map stands behind the action.

### Collision

- Players, enemies and the flower are circles; obstacles (houses, rocks, palms, logs, stones, water) have
  rectangular footprints (`collision.js`).
- A move is blocked if it would bring two circles into contact; moving apart is always allowed. Players block each
  other.
- Bees slide around obstacles and fly over water. Walkers (players, crabs, octopuses, Snapjaw) are blocked by water.
- Scenery outside the map and decorations never block anything.

### Restart and progression

- **Restart Level** (pause menu or defeat screen) and keys **1** to **4** replay a level from its checkpoint: the
  score and lives it began with.
- **Continue** saves the current score and lives as the next level's checkpoint.
- **Play Again** (after the final victory) and **Main Menu** start a new run from level 1 with a score of 0 and full
  lives for the chosen mode.
- Each level resets everything it changes: enemies, ink, pickups, effects, the flower, the players and the scenery
  animation. Worlds themselves are built once and kept, so the Garden's houses stay where they are until the page is
  reloaded.

## Known limitations

- Pond crabs face the flower but scuttle toward players along the map's axes, so they can move sideways or backwards
  relative to the way they face.
- On the Coast, the largest starfish are wider than the foam line and reach slightly over the shallows, sitting just
  above the water there.
- The Garden's houses are placed randomly on every page load, so the Garden's layout changes between visits.
- Keyboard only; there is no touch or gamepad support. Two players on one keyboard may hit key-rollover limits.
- The developer level shortcuts (keys 1 to 4) are available in every build.
- `npm run build` warns that the main bundle is larger than 500 kB; the game loads it as a single bundle.

## Credits

### Course material

- The original project, Tode the Frog, comes from the JetBrains Academy course "Build a Game with an AI Coding Agent"
  ([course repository](https://github.com/jetbrains-academy/game-course)), distributed under the MIT License; see
  [`LICENSE`](../LICENSE) (Copyright (c) 2025 JetBrains Academy).
- `tode.glb` (Tode the Frog) and the favicon `tode.svg` are provided by the course.

### Third-party models

All from [Poly Pizza](https://poly.pizza/). The files in `game/public/models/` are unmodified; the changes listed
are made by the game in memory when it loads them.

| Model (file) | Creator | Licence | Source | Changes made when loaded |
|---|---|---|---|---|
| Flower Single (`flower_single.glb`) | Quaternius | Public domain ([CC0 1.0](https://creativecommons.org/publicdomain/zero/1.0/)) | [poly.pizza/m/GvfHo0roi3](https://poly.pizza/m/GvfHo0roi3) | Only measured for the flower's collision size; never shown |
| Armabee Evolved (`enemy.glb`) | Quaternius | Public domain ([CC0 1.0](https://creativecommons.org/publicdomain/zero/1.0/)) | [poly.pizza/m/GcttdvsqsQ](https://poly.pizza/m/GcttdvsqsQ) | Scaled and placed; its own flying animations are played |
| Small House (`small_house.glb`) | Jarlan Perez | [CC BY 3.0](https://creativecommons.org/licenses/by/3.0/) | [poly.pizza/m/053kskrV4U_](https://poly.pizza/m/053kskrV4U_) | Scaled and placed |
| Butterfly (`Butterfly by Poly by Google - e9NAQQrCbLu.glb`) | Poly by Google | [CC BY 3.0](https://creativecommons.org/licenses/by/3.0/) | [poly.pizza/m/e9NAQQrCbLu](https://poly.pizza/m/e9NAQQrCbLu) | Scaled; texture drawn at a smaller size; wings animated |
| Rabbit (`Rabbit by Poly by Google - dyeBDJxhDwP.glb`) | Poly by Google | [CC BY 3.0](https://creativecommons.org/licenses/by/3.0/) | [poly.pizza/m/dyeBDJxhDwP](https://poly.pizza/m/dyeBDJxhDwP) | Scaled and animated |
| Lighthouse scene (`Lighthouse scene by Poly by Google - 1O6BWfUB6ta.glb`) | Poly by Google | [CC BY 3.0](https://creativecommons.org/licenses/by/3.0/) | [poly.pizza/m/1O6BWfUB6ta](https://poly.pizza/m/1O6BWfUB6ta) | Scaled and raised; the model's own patch of sea (a slab and wave strokes) is left out |
| Dolphin (`Dolphin by Poly by Google - 4Gkg2wLGJ_p.glb`) | Poly by Google | [CC BY 3.0](https://creativecommons.org/licenses/by/3.0/) | [poly.pizza/m/4Gkg2wLGJ_p](https://poly.pizza/m/4Gkg2wLGJ_p) | Scaled and levelled; texture drawn at a smaller size; animated |

Player 2's orange look is a recoloured copy of `tode.glb`'s texture, made in memory; the file is unchanged.

### Libraries

[Three.js](https://threejs.org/) and [Vite](https://vite.dev/) (both MIT licensed), installed from npm.

## AI assistance

This project used two AI tools: **Claude Code** by Anthropic for coding and documentation assistance, and
**ChatGPT** by OpenAI for planning and roadmap development. No other AI tools were used. The author directed the
work, reviewed the changes and tested the game in the browser. (The same disclosure is in the
[root README](../README.md#ai-assistance).)
