# Tode: Last Bloom

A small 3D browser game built with [Three.js](https://threejs.org/) and [Vite](https://vite.dev/), extending the
Tode the Frog project from the JetBrains Academy course "Build a Game with an AI Coding Agent".

A magical flower grows at the centre of the garden. Bees spawn at the corners of the map and fly straight for it,
in four waves that grow more intense. Protect the flower for two minutes: keep the bees off it, and don't get
caught yourself.

## How to play

| Key | Action |
|---|---|
| Arrow keys | Hop one tile in that direction. Presses are queued and played in order; holding a key gives one hop. |
| Space | Attack while playing (1 s base cooldown). Restart after the game ends. |

- **Objective:** survive until the timer reaches `0:00` while the flower still has health and Tode has at least
  one life.
- **The flower** starts with 20 HP. Every bee pressed against it bites once per full second of continuous contact,
  for 1 HP. A bee that loses contact starts its bite timer again.
- **Tode** has 3 lives. Any contact with a bee, whether Tode hops into it or it flies into him, costs one life.
  He then blinks for 1.5 s, during which further contact costs nothing. Bees stay solid the whole time.
- **Waves:** every 30 seconds a new [bee wave](#bee-waves) begins, spawning bees more often and allowing more of
  them at once.
- **Victory:** `THE FLOWER BLOOMED` when the 120-second timer runs out. Tode stays on screen and the final score
  is kept.
- **Defeat:** `DEFEAT / The flower wilted` when the flower reaches 0 HP, or `DEFEAT / Tode was caught` when he
  loses his last life. Tode is hidden.
- **The flower shows its state:** it flashes red and flinches on every bite, wilts toward brown as it loses
  health, and glows more warmly the longer you hold out (see [Flower appearance](#flower-appearance)).
- When the game ends, everything freezes and the HUD keeps its final values. Press Space to play again.

### HUD

- **Top left:** the flower health bar with its value (for example `20/20`), and one pip per life, filled for each
  life Tode has left. The bar is green above 50 %, yellow at or below 50 %, and red below 25 %.
- **Top centre:** `Score: N`.
- **Top right:** the survival timer, `m:ss`, counting down from `2:00`, with the current wave (`Wave N/4`) below it.
  When the game ends, both keep their final values: `Wave 4/4` after a victory, the wave reached after a defeat.

## Running

Run these from the `game/` directory:

```bash
npm run dev      # start the Vite dev server
npm run build    # production build into game/dist/ (ignored by Git)
npm run preview  # serve the production build
```

Dependencies (`three`, `vite`) are declared in `game/package.json`. In this repository they are installed in the
root `node_modules/`, which is where the scripts resolve them from; run `npm install` here if they are missing.

Repository rules (`AGENTS.md`, `.junie/guidelines.md`): make changes in `game/` only, and don't look for or run tests.

## Architecture

`src/main.js` is the conductor. It creates the scene and lights, owns the enemy list, the bee waves and spawning,
difficulty, the survival timer and the game state, and runs the single animation loop. Each file in `src/components/` builds one
part of the game and is wired together by `main.js`; components do not import each other.

| File | Responsibility | Exports |
|---|---|---|
| `src/main.js` | Scene, lights, constants, enemy list, bee waves and spawning, difficulty, timer, outcomes, reset, animation loop | — |
| `src/collision.js` | Collision radius from model vertices; circle-vs-circle and circle-vs-rectangle move checks; sliding around obstacles | `COLLISION_DISTANCE`, `computeCollisionRadius`, `blocksMove`, `isMoveBlocked`, `hitsObstacle`, `slideAlongObstacle` |
| `components/Renderer.js` | `WebGLRenderer` on `canvas.game` (transparent, antialiased, window-sized) | `createRenderer` |
| `components/Camera.js` | Perspective camera, Z-up, looking at the origin | `createCamera` |
| `components/Flower.js` | Flower model at the origin, its health, and its hit flash, wilt and bloom | `FLOWER_MAX_HEALTH`, `createFlower`, `damageFlower`, `getFlowerHealth`, `updateFlower`, `resetFlower` |
| `components/Player.js` | Tode model, arrow-key queue, hop movement, player collision, lives and invulnerability | `PLAYER_START`, `PLAYER_LIVES`, `createPlayer`, `updatePlayer`, `hitPlayer`, `getPlayerLives`, `showPlayerModel`, `resetPlayer` |
| `components/Enemy.js` | Bee model (loaded once, cloned per bee), flying to the flower, biting, enemy collision | `createEnemy`, `updateEnemy` |
| `components/Attack.js` | Space input, cooldown, fading yellow circle, hit test | `createAttack`, `updateAttack`, `resetAttack` |
| `components/Score.js` | Score value and `div.score` display | `createScore`, `updateScore`, `getScore`, `resetScore` |
| `components/Hud.js` | Flower health bar, life pips, timer and wave | `createHud`, `updateHud` |
| `components/GameOver.js` | `div.game-over` end screen, with a victory style | `createGameOver`, `showGameOver`, `hideGameOver` |
| `components/Map.js` | Checkerboard floor (one plane with a canvas texture) | `createMap` |
| `components/House.js` | House model, placement and ground footprints | `createHouses` |
| `src/style.css` | Page reset, score, HUD and end-screen styling | — |

Models are loaded asynchronously from `public/models/` (`tode.glb`, `enemy.glb`, `small_house.glb`,
`flower_single.glb`). Each `create…` function returns its object immediately and adds the model when it arrives,
so the game runs while models load.

## Frame loop

`renderer.setAnimationLoop` runs once per display frame:

1. **Time:** `delta = min(clock.getDelta(), MAX_DELTA)`. This is the only clock read; every system, including the
   survival timer, receives this `delta`. Do not call `getDelta()` or `getElapsedTime()` anywhere else: both reset
   the clock and would shrink `delta`. The browser pauses the loop in a hidden tab, so no time passes there.
2. **Game ended:** nothing updates. A Space press (registered only in this state) runs `resetGame()`.
3. **Playing:** `updateGame(delta)` runs, in this order:
   1. Difficulty factors from the raw score (see [Difficulty](#difficulty)).
   2. `updatePlayer` starts the next queued hop or advances the current one, and counts down invulnerability.
      It returns `true` if Tode runs into a bee, and `main.js` calls `hitPlayer()`.
   3. `updateAttack` returns the bees hit by an attack this frame; `main.js` removes them from the scene and the list.
   4. `updateScore` adds survival time and kill points.
   5. Spawning for the current [bee wave](#bee-waves): while fewer bees are active than the wave's cap, the spawn
      timer accumulates `delta` and spawns a bee at a random corner when it reaches the wave's spawn interval.
   6. `updateEnemy` for each bee. It returns `'player'` if the bee runs into Tode (→ `hitPlayer()`), `'bite'` when
      it lands a bite on the flower (→ `damageFlower(1)`), or `null`.
   7. The survival timer counts down by `delta`.

   `updateGame` returns the outcome that ends the game, or `null`. A defeat returns as soon as it happens and
   skips the rest of the frame: `'caught'` when `hitPlayer()` leaves 0 lives, `'flower'` when `damageFlower(1)`
   leaves 0 HP. Victory (`'won'`) is checked last, when the timer reaches 0, so a defeat in the same frame wins.
   `triggerGameOver(outcome)` freezes the game, shows that outcome's end screen, and hides Tode on defeat (on
   victory it keeps him visible and stops his blinking).
4. **Flower appearance:** `updateFlower(delta, progress)` runs every frame, including after the game ends. It is
   visual only, so a hit flash can finish and the final wilt or bloom stays on the end screen.
5. **HUD:** `updateHud` runs every frame, including after the game ends, and only rewrites the page when a shown
   value changes.
6. **Render:** `renderer.render(scene, camera)` runs every frame, including after the game ends.

## Coordinate system and camera

- **Z is up.** The ground is the XY plane at `z = 0`. Models are rotated `Math.PI / 2` around X and lifted with
  their bounding box so their lowest point sits on the ground.
- The flower stands at the origin. Tode starts at `PLAYER_START = (0, -50)`, in front of it.
- The camera is a child of the player group, at `(300, -300, 300)` relative to Tode with `camera.up = (0, 0, 1)`,
  so it follows him automatically.
- Tode is a `Group` (moved on X/Y) holding the model. The **model** is turned to face the hop direction
  (`rotation.y`, which spins around world Z after the X rotation), raised for the hop arc
  (`sin(progress · π) · JUMP_HEIGHT`), and blinked while invulnerable. The group never rotates or rises, so the
  camera and the attack circle stay steady.
- Arrow keys move along world axes; because of the camera angle, hops look diagonal on screen.
- Bees rotate their whole group around Z to face the flower. Model forward is assumed to be −Y after the X rotation.

## Collision

All collision is 2D on the ground plane and is checked before a move is applied: an object only moves if its
next position is valid.

- **Characters and the flower are circles.** `computeCollisionRadius` measures the farthest model vertex from the
  group origin in XY, once at load (skinned bee vertices include their pose). The bee model is shifted so its
  footprint is centred on the group it rotates around. Two circles collide when the distance between centres is
  less than `radiusA + radiusB + COLLISION_DISTANCE`.
- **Houses are rectangles.** Each house stores a `Box2` footprint in world coordinates, built from its vertices up
  to `FOOTPRINT_HEIGHT`, so the walls and base count but the roof overhang and chimney smoke do not. Houses only
  turn in quarter turns, so the rectangle stays axis-aligned. A character hits a house when its circle comes
  within its radius (plus `COLLISION_DISTANCE`) of the rectangle.
- **Overlap rule:** if two objects already overlap, a move that increases their separation is allowed, so they can
  come apart. Any move that creates a new collision or makes an overlap worse is blocked. The rule is applied
  per pair.

| Situation | Result |
|---|---|
| Tode's hop runs into a bee | Costs a life (unless invulnerable); forward motion stops for the rest of that hop |
| A bee's step runs into Tode (Tode moving or not) | Costs a life (unless invulnerable); the bee stops touching, not inside |
| A bee's step reaches the flower | The bee stays touching it and bites once per full second of contact |
| Tode's hop runs into the flower or a house | Forward motion stops for the rest of that hop; the jump arc still finishes. No damage. |
| A bee's step runs into another bee | The bee stays put this frame and still faces the flower |
| A bee's step runs into a house | It slides along the house instead (see below) |

Contact with Tode is checked before anything else, so a bee touching both Tode and the flower counts as touching
Tode. Houses never cost lives or health.

**Getting around houses.** A bee first tries its direct step toward the flower. If a house blocks it,
`slideAlongObstacle` finds the closest point of that house and returns the direction along its surface (at right
angles to the line from that point) that best follows the bee's intended direction. At a flat wall this slides
along the wall; at a corner it curves around the corner, so bees no longer get stuck on house corners. If that is
also blocked, the bee falls back to the same step along X only, then Y only.

## Attack and score

- Space sets a request flag; the attack happens in the loop if the cooldown is 0. Presses during the cooldown are
  discarded, not queued.
- A bee is hit when `distance ≤ attackRadius + bee collision radius` (the circle touches its footprint). This
  includes bees biting the flower.
- The circle is a child of the player group at `z = ATTACK_VISUAL_Z`. It is shown at 0.6 opacity, fades to 0 over
  `ATTACK_VISUAL_DURATION`, and is scaled to the current attack radius.
- Score = survival time × `SCORE_PER_SECOND` + kills × `SCORE_PER_KILL`. Kills are counted from the bees returned
  by `updateAttack`, not from enemy removal. The display shows `Score: N`, rounded down, and is only rewritten when
  that whole number changes.

## Flower appearance

The flower model has two materials, `Leaves` and `Flowers` (the heads). When the model loads, `Flower.js` stores
each material's original colour and glow (emissive), and every frame `updateFlower` rebuilds the look from those
originals, so the effects never build up and can always be undone exactly.

| Effect | Trigger | What you see |
|---|---|---|
| **Hit flash** | Every bite (`damageFlower`) | Both materials glow red and the model squashes to 90 % of its height, both easing back over `FLASH_DURATION` (0.25 s) |
| **Wilt** | Lost health (`1 − health / 20`) | Both materials tint from their texture colours toward `WILT_COLOR` (`#8a7a5a`), and the model settles to `WILT_HEIGHT` (85 %) at 0 HP |
| **Bloom** | Elapsed survival time (`0` at the start → `1` at victory) | The heads take on a warm pink glow (`BLOOM_COLOR`), up to `BLOOM_STRENGTH` |

- The red flash is applied last, on top of the wilt tint and the bloom, so bites stay visible at any health or time.
- The squash and the wilt sag multiply, so a hit still flinches a wilted flower. Only the model's height changes;
  its lift is scaled with it so the base stays on the ground, and the flower group and its collision circle are
  untouched, so bees and Tode collide with it exactly as before.
- When the game ends, the inputs freeze: after a flower defeat it stays fully wilted, after a victory it keeps its
  full bloom.
- `resetFlower()` restores 20 HP, clears the flash and puts back the stored colours, glow and size, so a restarted
  game starts with the original flower.

## Bee waves

The round is split into four waves by elapsed time (`SURVIVAL_TIME − timeLeft`). The wave is worked out from the
survival timer every time it is needed, so there is no separate wave counter that could drift out of sync, and
restarting the timer also restarts the waves.

| Wave | Elapsed time | Timer shows | Spawn interval | Max active bees |
|---|---|---|---|---|
| 1 | 0–30 s | `2:00`–`1:31` | 3.0 s | 8 |
| 2 | 30–60 s | `1:30`–`1:01` | 2.2 s | 12 |
| 3 | 60–90 s | `1:00`–`0:31` | 1.6 s | 16 |
| 4 | 90–120 s | `0:30`–`0:00` | 1.1 s | 20 |

- The game starts with one bee at each corner (4 bees), in wave 1.
- **Spawn interval:** the spawn timer accumulates the shared `delta`. Each time it reaches the current wave's
  interval, one bee spawns at a random corner and the interval is subtracted, keeping the rhythm.
- **Cap:** while the number of active bees is at the wave's maximum, the spawn timer pauses. It resumes when an
  attack frees a slot, continuing from where it stopped, so removing several bees at once doesn't release a burst.
- **Wave changes** only change the interval and cap from then on. Because each interval is shorter than the one
  before, a leftover timer can cause at most one spawn in the changing frame, after which the normal rhythm
  continues.
- When the game ends, the waves freeze with the timer: a defeat keeps the wave it happened in, and a victory shows
  `Wave 4/4`.

The waves alone decide how often bees spawn; the spawn interval is **not** scaled by the score-based difficulty
below. Score-based difficulty still makes bees faster and Tode stronger.

## Difficulty

Recalculated every frame from the raw score, and applied on top of the current wave:

```js
difficulty  = min(score × DIFFICULTY_GROWTH_RATE, MAX_DIFFICULTY)
enemyScale  = 1 + difficulty                          // 1 → 3
playerScale = 1 + difficulty × PLAYER_SCALING_RATIO   // 1 → 2
```

| Parameter | Formula | Start → ceiling (score ≥ 400) |
|---|---|---|
| Bee speed | `ENEMY_SPEED × enemyScale` | 30 → 90 units/s |
| Hop speed | `MOVE_SPEED × playerScale` | 3 → 6 hops/s |
| Attack cooldown | `ATTACK_COOLDOWN / playerScale` (set when an attack fires) | 1 s → 0.5 s |
| Attack radius | `ATTACK_RADIUS × playerScale` | 30 → 60 |

Survival alone earns 12 points in a full 120-second game, so difficulty rises mainly through kills. Spawning is
controlled by the [bee waves](#bee-waves) instead.

## Constants

| Constant | Value | File | Meaning |
|---|---|---|---|
| `MAX_DELTA` | `0.1` s | `main.js` | Cap on one frame's time step |
| `MAP_SIZE` | `500` | `main.js` | Floor width and depth, centred on the origin |
| `TILE_SIZE` | `20` | `main.js` | Checkerboard tile size (one hop) |
| `SPAWN_POINTS` | `(±250, ±250)` | `main.js` | The four map corners |
| `WAVES` | see [Bee waves](#bee-waves) | `main.js` | Start time, spawn interval and active-bee cap of each wave |
| `DIFFICULTY_GROWTH_RATE` | `0.005` | `main.js` | Difficulty per score point |
| `MAX_DIFFICULTY` | `2` | `main.js` | Difficulty ceiling |
| `PLAYER_SCALING_RATIO` | `0.5` | `main.js` | Player scaling relative to enemies |
| `SURVIVAL_TIME` | `120` s | `main.js` | Time to survive for victory |
| `FLOWER_MAX_HEALTH` | `20` | `Flower.js` | Flower health |
| `FLASH_DURATION` / `FLASH_HEIGHT` | `0.25` s / `0.9` | `Flower.js` | Hit flash length, and the model's height at the moment of a hit |
| `FLASH_COLOR` | `#ff2020` | `Flower.js` | Hit flash glow |
| `WILT_COLOR` / `WILT_HEIGHT` | `#8a7a5a` / `0.85` | `Flower.js` | Tint and height at 0 HP |
| `BLOOM_COLOR` / `BLOOM_STRENGTH` | `#ff8fb8` / `0.35` | `Flower.js` | Glow on the heads at victory |
| `PLAYER_START` | `(0, -50)` | `Player.js` | Tode's start and restart position |
| `PLAYER_LIVES` | `3` | `Player.js` | Tode's lives |
| `INVULNERABILITY_TIME` | `1.5` s | `Player.js` | Time after a hit during which contact costs nothing |
| `BLINK_RATE` | `10` per s | `Player.js` | Model visibility toggles while invulnerable |
| `MOVE_SPEED` | `3` hops/s | `Player.js` | Base hop speed |
| `JUMP_DISTANCE` | `20` | `Player.js` | Hop length |
| `JUMP_HEIGHT` | `8` | `Player.js` | Hop arc height |
| `ENEMY_SPEED` | `30` units/s | `Enemy.js` | Base bee speed |
| `BITE_INTERVAL` | `1` s | `Enemy.js` | Continuous contact needed per 1 HP bite |
| `ATTACK_COOLDOWN` | `1` s | `Attack.js` | Base time between attacks |
| `ATTACK_RADIUS` | `30` | `Attack.js` | Base attack reach |
| `ATTACK_VISUAL_DURATION` | `0.25` s | `Attack.js` | Circle fade time |
| `ATTACK_VISUAL_Z` | `0.25` | `Attack.js` | Circle height above the ground |
| `SCORE_PER_SECOND` | `0.1` | `Score.js` | Survival points per second |
| `SCORE_PER_KILL` | `10` | `Score.js` | Points per bee defeated |
| `WARNING_RATIO` / `DANGER_RATIO` | `0.5` / `0.25` | `Hud.js` | Flower bar turns yellow at or below / red below these fractions |
| `COLLISION_DISTANCE` | `0` | `collision.js` | Extra gap between footprints (negative allows overlap) |
| `HOUSE_COUNT` | `3` | `House.js` | Houses placed |
| `CLEARANCE` | `90` | `House.js` | Minimum distance from a house's footprint centre to another house or a protected point |
| `MAX_PLACEMENT_ATTEMPTS` | `100` | `House.js` | Random positions tried per house |
| `FOOTPRINT_HEIGHT` | `15` | `House.js` | Vertices up to this height form a house's ground footprint |

Model scales: Tode `20`, bee `5`, house `65`, flower `15`.

## Houses

`createHouses` loads the model once and places `HOUSE_COUNT` clones. Each gets a random quarter-turn around its
vertical axis, is grounded, and has its footprint measured from the final rotated and scaled model. A random
position is accepted only if the footprint lies inside the map and its centre is at least `CLEARANCE` from the
flower (origin), Tode's start, Tode's position at load time, each spawn corner, and every house already placed.
After `MAX_PLACEMENT_ATTEMPTS` failures the house is skipped with a `console.warn`. Houses are added to the map group.

## Restart

Pressing Space after any outcome runs `resetGame()`, which:

- removes every bee, respawns one at each corner, and sets the spawn timer to 0;
- sets the survival timer back to `SURVIVAL_TIME`, which also returns the game to wave 1;
- calls `resetPlayer` (start position, 3 lives, no invulnerability, visible model, empty input queue, idle
  movement), `resetFlower` (20 HP and its original look), `resetAttack` (clears any pending press, cooldown and circle) and `resetScore`
  (0, so difficulty returns to baseline on the next frame);
- hides the end screen and removes its victory style.

The Space press that restarts the game does not also attack: attacks only run while playing, and `resetAttack`
clears the request that press made. Houses keep their positions until the page is reloaded.

## Known limitations

Current behaviour by design:

- The camera follows Tode, so the flower is off-screen when he is far from it; the HUD shows its health.
- No map edges: Tode can hop past the floor.
- Houses can hide Tode when they are between him and the camera.
- Houses only change on page reload, not on restart.
- The victory message names 2 minutes; it does not change automatically if `SURVIVAL_TIME` does.
- Difficulty stops increasing at a score of 400.
- The window size is read only at startup; resizing the browser stretches the view until reload.
- Bees are shown in a fixed pose (the model's animations are not played). The flower model has no animations or
  separate petals, so its reactions are whole-model tints, glow and height changes.
- Collision is flat: Tode cannot hop over bees.

Possible edge cases, not observed in testing:

- A bee whose direct, surface-slide, X-only and Y-only steps are all blocked by houses waits until its path changes.
- Before the house model loads (typically under a second), there is nothing to collide with; before the flower
  model loads, its collision radius is 0.
- A house is skipped if no valid position is found within 100 attempts.
- At very high speeds combined with a very slow frame, a single step could exceed the gap between objects.
  Within the current difficulty ceiling, the largest step (90 units/s × 0.1 s = 9) is well below a character's size.

## Credits

- Flower Single by Quaternius (CC0) via Poly Pizza: https://poly.pizza/m/GvfHo0roi3
- Armabee Evolved (`enemy.glb`) by Quaternius (Public Domain) via Poly Pizza: https://poly.pizza/m/GcttdvsqsQ
- Small House (`small_house.glb`) by Jarlan Perez (CC-BY 3.0) via Poly Pizza: https://poly.pizza/m/053kskrV4U_
- Tode the Frog (`tode.glb`) is provided by the JetBrains Academy course.
