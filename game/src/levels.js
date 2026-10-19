// The game's levels, in play order. A run goes through them one after another; World.js builds each one's world.
//   name:            shown in the HUD and on the level-complete screen
//   world:           which world the level is played in. Levels with the same world share one built world
//                    (the Pond and the boss level); the world's look comes from the first level that names it.
//   groundColors:    the ground's colours: [dark, light] tiles for a checkerboard, [base, patch, speckle] for a meadow,
//                    [grass, light grass, dark grass, speckle, path, clearing, flower speck] for the Garden's ground
//   groundPattern:   'checker' (the default), 'meadow' (irregular moss patches) or 'garden' (the Garden's meadow
//                    with its clearing and paths; see Map.js)
//   background:      sky colour behind the world, or null to keep the page showing through
//   light:           optional { sun, ambient } light colours for this level; white when not given
//   features:        what the world places on and around its ground: obstacles and scenery (see World.js)
//   mapEdge:         whether the map edge also blocks the player in single player (co-op always has it)
//   duration:        seconds the flower must be protected to complete the level, or null for a level with no
//                    timer (the boss level, which isn't won by surviving)
//   startDifficulty: difficulty at the start of the level; the score earned in the level adds to it (see main.js)
//   waves:           bee waves by elapsed level time: how often a bee spawns, and how many may be active at once
//                    (an empty list for no bees, not even the four that usually start a level)
//   crabs:           Sand Crab schedule, separate from the bee waves, or null for none: the first appears `start`
//                    seconds into the level, then one every `interval` seconds while fewer than `max` are active
//                    (`coopMax` in co-op). Instead of one schedule it may give `phases` by elapsed level time, each
//                    { start, interval, max, coopMax } in effect from its start (the first crab comes at the first
//                    phase's start). `target`: 'players' (the default: crabs hunt the nearest player) or 'flower'
//                    (crabs go for the flower and bite it, and never cost a life; see Crab.js)
//   octopus:         Ink Octopus schedule, or null for none: `start` is when the first octopus appears (its first
//                    lob comes a little after it reaches its spot), then every `interval` seconds another appears
//                    if fewer than `max` are active (the same in co-op)
//   boss:            true on the boss level: Snapjaw the crocodile appears (see CrocodileBoss.js)

// The original waves, unchanged, used by the Garden
const GARDEN_WAVES = [
  { start: 0, spawnInterval: 3.0, maxActive: 8 },
  { start: 30, spawnInterval: 2.2, maxActive: 12 },
  { start: 60, spawnInterval: 1.6, maxActive: 16 },
  { start: 90, spawnInterval: 1.1, maxActive: 20 },
];

// The later levels follow the Garden's waves, wave by wave:
//   spawnInterval: the Garden's interval x 0.85 (Coast, about 15 % faster) or x 0.75 (Pond, 25 % faster),
//                  rounded to the nearest 0.01 s, with halves rounded up (1.1 x 0.85 = 0.935 -> 0.94)
//   maxActive:     the Garden's cap + 2 (Coast) or + 3 (Pond)
// (Not used while the Coast is crabs only; kept unchanged in case bees return there.)
const COAST_WAVES = [
  { start: 0, spawnInterval: 2.55, maxActive: 10 },
  { start: 30, spawnInterval: 1.87, maxActive: 14 },
  { start: 60, spawnInterval: 1.36, maxActive: 18 },
  { start: 90, spawnInterval: 0.94, maxActive: 22 },
];

const POND_WAVES = [
  { start: 0, spawnInterval: 2.25, maxActive: 11 },
  { start: 30, spawnInterval: 1.65, maxActive: 15 },
  { start: 60, spawnInterval: 1.2, maxActive: 19 },
  { start: 90, spawnInterval: 0.83, maxActive: 23 },
];

// The Pond's world and look, shared by the Pond and the boss level
const POND_WORLD = {
  world: 'pond',
  groundColors: ['#7BAE9B', '#93C4AE', '#5E9584'],
  groundPattern: 'meadow',
  background: '#3F6F60',
  light: { sun: '#FFE0B0', ambient: '#DDEBFF' },
  features: 'pond',
  mapEdge: true,
};

export const LEVELS = [
  {
    name: 'Garden',
    world: 'garden',
    // Warm meadow greens, sandy paths and clearing, and buttercup specks
    groundColors: ['#86B464', '#A2C97B', '#6E9C52', '#5E8A46', '#E3D3A0', '#EEE2BD', '#F2D25C'],
    groundPattern: 'garden',
    // A pale meadow green beyond the map edge, instead of the white page
    background: '#CFE3B5',
    // A gently warm sun and a soft, slightly warm ambient: close to white so Tode, bees and houses keep their colours
    light: { sun: '#FFF0D8', ambient: '#F7F5EC' },
    // Its houses (the only obstacles), plus scenery: meadow grass tufts and wildflower patches, a meadow backdrop
    // with distant trees, a bush and grass border, a beehive at each bee corner, butterflies and rabbits
    // (see Garden.js)
    features: 'garden',
    // The map edge keeps Tode on the meadow in single player too, as on the other levels
    mapEdge: true,
    duration: 120,
    startDifficulty: 0,
    waves: GARDEN_WAVES,
    crabs: null,
    octopus: null,
  },
  {
    name: 'Coast',
    world: 'coast',
    // Warm beach sand: sand, light and dark drifts, damp sand along the edge, shell and pebble dots
    groundColors: ['#EDD39C', '#F6E4BC', '#D9BC84', '#C9A673', '#FFF6EA', '#A39684'],
    groundPattern: 'coast',
    background: '#BFE6FF',
    features: 'coast',
    mapEdge: true,
    duration: 120,
    startDifficulty: 0.3,
    // Crabs only: no bees (not even the four starting ones). The crabs go for the flower, coming faster and in
    // greater numbers as the level goes on.
    waves: [],
    crabs: {
      target: 'flower',
      phases: [
        { start: 0, interval: 8, max: 2, coopMax: 3 },
        { start: 25, interval: 6, max: 3, coopMax: 4 },
        { start: 50, interval: 4.5, max: 4, coopMax: 5 },
      ],
    },
    octopus: null,
  },
  {
    name: 'Pond',
    ...POND_WORLD,
    duration: 120,
    startDifficulty: 0.6,
    waves: POND_WAVES,
    crabs: { start: 20, interval: 25, max: 2, coopMax: 2 },
    octopus: { start: 45, interval: 30, max: 1 },
  },
  // The boss fight, in the Pond's own world (shared, not rebuilt). No timer and no bees for now.
  {
    name: 'Lagoon Boss',
    ...POND_WORLD,
    duration: null,
    startDifficulty: 0.6,
    waves: [],
    crabs: null,
    octopus: null,
    boss: true,
  },
];
