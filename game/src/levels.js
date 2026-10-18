// The game's levels, in play order. A run goes through them one after another; World.js builds each one's world.
//   name:            shown in the HUD and on the level-complete screen
//   groundColors:    the two alternating tile colours of the checkerboard ground ([dark, light])
//   background:      sky colour behind the world, or null to keep the page showing through (the Garden, as before)
//   features:        what the world places on and around its ground: obstacles and scenery (see World.js)
//   mapEdge:         whether the map edge also blocks the player in single player (co-op always has it)
//   duration:        seconds the flower must be protected to complete the level
//   startDifficulty: difficulty at the start of the level; the score earned in the level adds to it (see main.js)
//   waves:           bee waves by elapsed level time: how often a bee spawns, and how many may be active at once
//   crabs:           Sand Crab schedule, separate from the bee waves, or null for none: the first appears `start`
//                    seconds into the level, then one every `interval` seconds while fewer than `max` are active
//                    (`coopMax` in co-op)
//   octopus:         Ink Octopus schedule, or null for none: `start` is when the first octopus appears (its first
//                    lob comes a little after it reaches its spot), then every `interval` seconds another appears
//                    if fewer than `max` are active (the same in co-op)

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

export const LEVELS = [
  {
    name: 'Garden',
    groundColors: ['#228B22', '#90EE90'],
    background: null,
    features: 'houses',
    mapEdge: false,
    duration: 120,
    startDifficulty: 0,
    waves: GARDEN_WAVES,
    crabs: null,
    octopus: null,
  },
  {
    name: 'Coast',
    groundColors: ['#E2B866', '#F6E2B0'],
    background: '#BFE6FF',
    features: 'coast',
    mapEdge: true,
    duration: 120,
    startDifficulty: 0.3,
    waves: COAST_WAVES,
    crabs: { start: 30, interval: 25, max: 1, coopMax: 2 },
    octopus: null,
  },
  {
    name: 'Pond',
    groundColors: ['#5E9E3E', '#A8D46F'],
    background: '#D6F0E6',
    features: 'pond',
    mapEdge: true,
    duration: 120,
    startDifficulty: 0.6,
    waves: POND_WAVES,
    crabs: { start: 20, interval: 25, max: 2, coopMax: 2 },
    octopus: { start: 45, interval: 30, max: 1 },
  },
];
