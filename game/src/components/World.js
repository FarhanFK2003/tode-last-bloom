import { createMap } from './Map.js';
import { createHouses } from './House.js';
import { createCoast } from './Coast.js';
import { createPond } from './Pond.js';

// What a level can place on and around its ground. Each places its objects under the world group and returns
// the array of obstacles straight away (houses join it once their model has loaded); every obstacle has a
// rectangular userData.footprint. Scenery that never blocks (such as the Coast's sea) isn't in the array.
const FEATURES = {
  houses: createHouses,
  coast: createCoast,
  pond: createPond,
};
// (Obstacles marked userData.water, such as the Pond's lagoon, block walkers but not flying bees: see main.js.)

// Builds one level's world: its ground with its obstacles on it, as one group for the caller to add to the scene,
// plus update(delta) and reset() for scenery animation (doing nothing for levels without any).
// protectedPoints ({ x, y }) are spots obstacles must stay clear of (the flower, starts, enemy spawns).
//
// A world is built once and kept for the page session, so its layout stays the same between runs and its
// models are loaded only once; it is never disposed. (Houses are copies of one loaded model sharing its geometry
// and materials, so they must never be disposed one by one.)
export function createWorld(level, { mapSize, tileSize, protectedPoints }) {
  const group = createMap(mapSize, tileSize, level.groundColors, level.groundPattern);
  // A feature set returns its obstacles, or { obstacles, update, reset } when its scenery is animated
  const built = FEATURES[level.features](group, mapSize, protectedPoints);
  const { obstacles, update = () => {}, reset = () => {} } = Array.isArray(built) ? { obstacles: built } : built;
  return { group, obstacles, update, reset };
}
