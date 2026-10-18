import { createMap } from './Map.js';
import { createHouses } from './House.js';
import { createCoast } from './Coast.js';
import { createPond } from './Pond.js';

// What a level can place on and around its ground. Each places its objects under the world group and returns
// the array of obstacles straight away (houses and the Pond's obstacles join it once their models have loaded);
// every obstacle has a rectangular userData.footprint. Scenery that never blocks (such as the Coast's sea)
// isn't in the array.
const FEATURES = {
  houses: createHouses,
  coast: createCoast,
  pond: createPond,
};

// Builds one level's world: its ground with its obstacles on it, as one group for the caller to add to the scene.
// protectedPoints ({ x, y }) are spots obstacles must stay clear of (the flower, starts, enemy spawns).
//
// A world is built once and kept for the page session, so its layout stays the same between runs and its
// models are loaded only once; it is never disposed. (Houses are copies of one loaded model sharing its geometry
// and materials, so they must never be disposed one by one.)
export function createWorld(level, { mapSize, tileSize, protectedPoints }) {
  const group = createMap(mapSize, tileSize, level.groundColors);
  const obstacles = FEATURES[level.features](group, mapSize, protectedPoints);
  return { group, obstacles };
}
