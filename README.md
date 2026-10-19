# Tode: Last Bloom

A 3D browser game about a frog defending the last magical flower, built with [Three.js](https://threejs.org/) and
[Vite](https://vite.dev/).

**Play Online:** [Play Tode: Last Bloom](https://tode-last-bloom.vercel.app/)

Tode: Last Bloom is a personal entry for the JetBrains Academy **Build Your Game Challenge**. It started from the
Tode the Frog project in the JetBrains Academy course
[Build a Game with an AI Coding Agent](https://academy.jetbrains.com/course/30327) and extends it into a four-level
game with co-op play. This is not an official JetBrains repository; the original course project lives at
[jetbrains-academy/game-course](https://github.com/jetbrains-academy/game-course).

## The game

A magical flower grows at the centre of each level, and something is always coming for it. Hop around the map,
fight off the attackers, push them back with the flower's Bloom Pulse, and keep it alive until time runs out. Then
face Snapjaw, the crocodile of the lagoon.

| Level | Time | What comes for the flower |
|---|---|---|
| 1. Garden | 60 s | Waves of bees from the four corners |
| 2. Coast | 75 s | Sand Crabs that scuttle in and bite the flower |
| 3. Pond | 90 s | Bees, crabs that hunt the players, and an Ink Octopus that lobs ink from a distance |
| 4. Lagoon Boss | No timer | Snapjaw the crocodile: dodge its charges and strike while it's dizzy |

- **Single player or two-player co-op** on one keyboard. In co-op the team shares 6 lives (3 in single player), and
  Player 2 is an orange Tode.
- **Pickups:** Bloom Shield, Nectar Boost and Petals that restore a life.
- **Hand-built worlds:** a meadow garden with butterflies, rabbits and beehives; a beach with a lighthouse, a leaping
  dolphin, a rowing boat and a sea turtle; and a lily-pad pond.
- **Procedural music and sound effects**, with volume settings that are remembered.

## Controls

| Action | Player 1 | Player 2 (co-op) |
|---|---|---|
| Hop | Arrow keys | W A S D |
| Attack | Space | F |
| Bloom Pulse | M | E |
| Pause | Esc | Esc |

## Running it

You need [Node.js](https://nodejs.org/) 20.19+ or 22.12+ (required by Vite 7) and npm. The game's dependencies are
installed once, from the repository root; the game's scripts then run from `game/`.

```bash
npm install         # from the repository root
cd game
npm run dev         # development server: open the local URL that Vite prints
npm run build       # production build into game/dist/
npm run preview     # serve the production build
```

More detail is in the [technical guide](game/README.md#running).

## What's in this repository

- **`game/`** is the game itself. Its [technical guide](game/README.md) covers gameplay rules, every level's
  schedule, the architecture and the full credits.
- The other folders (`Introduction/`, `Skeleton/`, `Core_loop/`, `Visual/`, `Conclusion/`), the course metadata
  files and the test setup at the root are the JetBrains Academy course material. They are kept so the project still
  opens as the course in a JetBrains IDE and the original course content stays with the work built on it; the only
  changes to them are the course's own progress records.
- The `main` branch keeps the course-stage version of the game; `feature/last-bloom` has the full Tode: Last Bloom.

## What changed from the course project

In the course-stage game (on `main`), Tode hops around a single map with houses, bees chase him, an attack defeats
them, the score and difficulty rise over time, and one touch from a bee ends the game. Tode: Last Bloom adds:

- the flower to protect, lives, timed levels with bee waves, and the Bloom Pulse
- three more levels, each with its own world, enemies and pacing, ending in a boss fight
- Sand Crabs, the Ink Octopus and Snapjaw, alongside the bees
- local two-player co-op with a shared pool of lives and per-player invulnerability
- pickups, a HUD, a main menu, pause menu, settings, level progression and end screens
- animated characters, scenery and wildlife, and procedural music and sound effects

## Credits

- **Course:** the original Tode the Frog project, including the `tode.glb` model and the favicon, comes from the
  JetBrains Academy course "Build a Game with an AI Coding Agent".
- **3D models from [Poly Pizza](https://poly.pizza/):**
  - Flower Single and Armabee Evolved by Quaternius, in the public domain
    ([CC0 1.0](https://creativecommons.org/publicdomain/zero/1.0/)).
  - Small House by Jarlan Perez, and Butterfly, Rabbit, Lighthouse scene and Dolphin by Poly by Google, licensed
    under [CC BY 3.0](https://creativecommons.org/licenses/by/3.0/).

  Every model's source link, and the changes the game makes to it when loading it, are in the
  [technical guide's credits](game/README.md#credits).
- **Libraries:** [Three.js](https://threejs.org/) and [Vite](https://vite.dev/), both MIT licensed.

## AI assistance

The JetBrains Academy course is about building a game with AI coding agents, and this project used two AI tools:

- **Claude Code** by Anthropic: coding and documentation assistance.
- **ChatGPT** by OpenAI: planning and roadmap development.

No other AI tools were used. The author directed the work, reviewed the changes and tested the game in the browser.

## Licence

The course project this game is built on is distributed under the MIT License; see [`LICENSE`](LICENSE)
(Copyright (c) 2025 JetBrains Academy). The third-party models keep their own licences, listed in
[Credits](game/README.md#credits).
