# Tode the Frog

A small 3D browser survival game built with [Three.js](https://threejs.org/) and [Vite](https://vite.dev/).
Bees spawn at the corners of the map and chase Tode. Defeat them, survive as long as you can, and avoid being touched.

## Controls

| Key | Action |
|---|---|
| Arrow keys | Hop one tile in that direction. Presses are queued and played in order; holding a key gives one hop. |
| Space | Attack while playing (1 s base cooldown). Restart after Game Over. |

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

`src/main.js` is the conductor. It creates the scene and lights, owns the enemy list, spawning, difficulty and game
state, and runs the single animation loop. Each file in `src/components/` builds one part of the game and is wired
together by `main.js`; components do not import each other.

| File | Responsibility | Exports |
|---|---|---|
| `src/main.js` | Scene, lights, constants, enemy list and spawning, difficulty, Game Over/reset, animation loop | — |
| `src/collision.js` | Collision radius from model vertices; circle-vs-circle and circle-vs-rectangle move checks | `COLLISION_DISTANCE`, `computeCollisionRadius`, `blocksMove`, `isMoveBlocked`, `hitsObstacle` |
| `components/Renderer.js` | `WebGLRenderer` on `canvas.game` (transparent, antialiased, window-sized) | `createRenderer` |
| `components/Camera.js` | Perspective camera, Z-up, looking at the origin | `createCamera` |
| `components/Player.js` | Tode model, arrow-key queue, hop movement, player collision | `createPlayer`, `updatePlayer`, `resetPlayer` |
| `components/Enemy.js` | Bee model (loaded once, cloned per bee), chasing, enemy collision | `createEnemy`, `updateEnemy` |
| `components/Attack.js` | Space input, cooldown, fading yellow circle, hit test | `createAttack`, `updateAttack`, `resetAttack` |
| `components/Score.js` | Score value and `div.score` display | `createScore`, `updateScore`, `getScore`, `resetScore` |
| `components/GameOver.js` | `div.game-over` overlay | `createGameOver`, `showGameOver`, `hideGameOver` |
| `components/Map.js` | Checkerboard floor (one plane with a canvas texture) | `createMap` |
| `components/House.js` | House model, placement and ground footprints | `createHouses` |
| `src/style.css` | Page reset, score and Game Over styling | — |

Models are loaded asynchronously from `public/models/` (`tode.glb`, `enemy.glb`, `small_house.glb`). Each
`create…` function returns its object immediately and adds the model when it arrives, so the game runs while models load.

## Frame loop

`renderer.setAnimationLoop` runs once per display frame:

1. **Time:** `delta = min(clock.getDelta(), MAX_DELTA)`. This is the only clock read; every system receives this
   `delta`. Do not call `getDelta()` or `getElapsedTime()` anywhere else: both reset the clock and would shrink `delta`.
2. **Game Over:** if the game is over, nothing updates. A Space press (registered only in this state) runs
   `resetGame()`.
3. **Playing:** `updateGame(delta)` runs, in this order:
   1. Difficulty factors from the raw score (see [Difficulty](#difficulty)).
   2. `updatePlayer` starts the next queued hop or advances the current one. Returns `true` if Tode runs into a bee.
   3. `updateAttack` returns the bees hit by an attack this frame; `main.js` removes them from the scene and the list.
   4. `updateScore` adds survival time and kill points.
   5. The spawn timer accumulates `delta` and spawns a bee at a random corner when it reaches the spawn delay.
   6. `updateEnemy` for each bee. Returns `true` if the bee runs into Tode.

   As soon as the player or any bee reports contact, `updateGame` returns `true` and `triggerGameOver()` hides Tode
   and shows the overlay. The rest of that frame's updates are skipped.
4. **Render:** `renderer.render(scene, camera)` runs every frame, including while the game is over.

## Coordinate system and camera

- **Z is up.** The ground is the XY plane at `z = 0`. Models are rotated `Math.PI / 2` around X and lifted with
  their bounding box so their lowest point sits on the ground.
- The camera is a child of the player group, at `(300, -300, 300)` relative to Tode with `camera.up = (0, 0, 1)`,
  so it follows him automatically.
- Tode is a `Group` (moved on X/Y) holding the model. The **model** is turned to face the hop direction
  (`rotation.y`, which spins around world Z after the X rotation) and raised for the hop arc
  (`sin(progress · π) · JUMP_HEIGHT`). The group never rotates or rises, so the camera stays steady.
- Arrow keys move along world axes; because of the camera angle, hops look diagonal on screen.
- Bees rotate their whole group around Z to face Tode. Model forward is assumed to be −Y after the X rotation.

## Collision

All collision is 2D on the ground plane and is checked before a move is applied: an object only moves if its
next position is valid.

- **Characters are circles.** `computeCollisionRadius` measures the farthest model vertex from the group origin
  in XY, once at load (skinned bee vertices include their pose). The bee model is shifted so its footprint is
  centred on the group it rotates around. Two characters collide when the distance between centres is less than
  `radiusA + radiusB + COLLISION_DISTANCE`.
- **Houses are rectangles.** Each house stores a `Box2` footprint in world coordinates, built from its vertices up
  to `FOOTPRINT_HEIGHT`, so the walls and base count but the roof overhang and chimney smoke do not. Houses only
  turn in quarter turns, so the rectangle stays axis-aligned. A character hits a house when its circle comes
  within its radius (plus `COLLISION_DISTANCE`) of the rectangle.
- **Overlap rule:** if two objects already overlap, a move that increases their separation is allowed, so they can
  come apart. Any move that creates a new collision or makes an overlap worse is blocked. The rule is applied
  per pair.

| Situation | Result |
|---|---|
| Tode's hop runs into a bee | Game Over |
| A bee's step runs into Tode (Tode moving or not) | Game Over; the bee stops touching, not inside |
| Tode's hop runs into a house | Forward motion stops for the rest of that hop; the jump arc still finishes. No Game Over. |
| A bee's step runs into another bee | The bee stays put this frame and still faces Tode |
| A bee's step runs into a house | It tries the same step along X only, then Y only, to slide along the wall |

Game Over is checked before blocking: the step that would touch the other character is the trigger. Houses never
take part in the contact check.

## Attack and score

- Space sets a request flag; the attack happens in the loop if the cooldown is 0. Presses during the cooldown are
  discarded, not queued.
- A bee is hit when `distance ≤ attackRadius + bee collision radius` (the circle touches its footprint).
- The circle is a child of the player group at `z = ATTACK_VISUAL_Z`. It is shown at 0.6 opacity, fades to 0 over
  `ATTACK_VISUAL_DURATION`, and is scaled to the current attack radius.
- Score = survival time × `SCORE_PER_SECOND` + kills × `SCORE_PER_KILL`. Kills are counted from the bees returned
  by `updateAttack`, not from enemy removal. The display shows `Score: N`, rounded down, and is only rewritten when
  that whole number changes.

## Difficulty

Recalculated every frame from the raw score:

```js
difficulty  = min(score × DIFFICULTY_GROWTH_RATE, MAX_DIFFICULTY)
enemyScale  = 1 + difficulty                          // 1 → 3
playerScale = 1 + difficulty × PLAYER_SCALING_RATIO   // 1 → 2
```

| Parameter | Formula | Start → ceiling (score ≥ 400) |
|---|---|---|
| Spawn delay | `SPAWN_DELAY / enemyScale` | 3 s → 1 s |
| Bee speed | `ENEMY_SPEED × enemyScale` | 30 → 90 units/s |
| Hop speed | `MOVE_SPEED × playerScale` | 3 → 6 hops/s |
| Attack cooldown | `ATTACK_COOLDOWN / playerScale` (set when an attack fires) | 1 s → 0.5 s |
| Attack radius | `ATTACK_RADIUS × playerScale` | 30 → 60 |

## Constants

| Constant | Value | File | Meaning |
|---|---|---|---|
| `MAX_DELTA` | `0.1` s | `main.js` | Cap on one frame's time step |
| `MAP_SIZE` | `500` | `main.js` | Floor width and depth, centred on the origin |
| `TILE_SIZE` | `20` | `main.js` | Checkerboard tile size (one hop) |
| `SPAWN_POINTS` | `(±250, ±250)` | `main.js` | The four map corners |
| `SPAWN_DELAY` | `3` s | `main.js` | Base time between spawns |
| `DIFFICULTY_GROWTH_RATE` | `0.005` | `main.js` | Difficulty per score point |
| `MAX_DIFFICULTY` | `2` | `main.js` | Difficulty ceiling |
| `PLAYER_SCALING_RATIO` | `0.5` | `main.js` | Player scaling relative to enemies |
| `MOVE_SPEED` | `3` hops/s | `Player.js` | Base hop speed |
| `JUMP_DISTANCE` | `20` | `Player.js` | Hop length |
| `JUMP_HEIGHT` | `8` | `Player.js` | Hop arc height |
| `ENEMY_SPEED` | `30` units/s | `Enemy.js` | Base bee speed |
| `ATTACK_COOLDOWN` | `1` s | `Attack.js` | Base time between attacks |
| `ATTACK_RADIUS` | `30` | `Attack.js` | Base attack reach |
| `ATTACK_VISUAL_DURATION` | `0.25` s | `Attack.js` | Circle fade time |
| `ATTACK_VISUAL_Z` | `0.25` | `Attack.js` | Circle height above the ground |
| `SCORE_PER_SECOND` | `0.1` | `Score.js` | Survival points per second |
| `SCORE_PER_KILL` | `10` | `Score.js` | Points per bee defeated |
| `COLLISION_DISTANCE` | `0` | `collision.js` | Extra gap between footprints (negative allows overlap) |
| `HOUSE_COUNT` | `3` | `House.js` | Houses placed |
| `CLEARANCE` | `90` | `House.js` | Minimum distance from a house's footprint centre to another house or a protected point |
| `MAX_PLACEMENT_ATTEMPTS` | `100` | `House.js` | Random positions tried per house |
| `FOOTPRINT_HEIGHT` | `15` | `House.js` | Vertices up to this height form a house's ground footprint |

Model scales: Tode `20`, bee `5`, house `65`.

## Houses

`createHouses` loads the model once and places `HOUSE_COUNT` clones. Each gets a random quarter-turn around its
vertical axis, is grounded, and has its footprint measured from the final rotated and scaled model. A random
position is accepted only if the footprint lies inside the map and its centre is at least `CLEARANCE` from Tode's
start, Tode's position at load time, each spawn corner, and every house already placed. After
`MAX_PLACEMENT_ATTEMPTS` failures the house is skipped with a `console.warn`. Houses are added to the map group.

## Reset

`resetGame()` removes every bee and respawns one at each corner, sets the spawn timer to 0, and calls
`resetPlayer` (origin, empty input queue, idle movement, model grounded and visible), `resetAttack` (clears any
pending press, cooldown and circle) and `resetScore` (0, so difficulty returns to baseline on the next frame).
It then hides the overlay. Houses keep their positions until the page is reloaded.

## Known limitations

Current behaviour by design:

- No map edges: Tode can hop past the floor.
- Houses can hide Tode when they are between him and the camera.
- Houses only change on page reload, not on reset.
- Difficulty stops increasing at a score of 400.
- The window size is read only at startup; resizing the browser stretches the view until reload.
- Bees are shown in a fixed pose (the model's animations are not played).
- Collision is flat: Tode cannot hop over bees.

Possible edge cases, not observed in testing:

- A bee whose direct, X-only and Y-only steps are all blocked by houses waits until its path changes.
- Before the house model loads (typically under a second), there is nothing to collide with.
- A house is skipped if no valid position is found within 100 attempts.
- At very high speeds combined with a very slow frame, a single step could exceed the gap between objects.
  Within the current difficulty ceiling, the largest step (90 units/s × 0.1 s = 9) is well below a character's size.
