import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

const MODEL_PATH = '/models/small_house.glb';
const MODEL_SCALE = 65;
const HOUSE_COUNT = 3;
// Minimum distance from a house's footprint centre to another house's centre or to a protected point
const CLEARANCE = 90;
const MAX_PLACEMENT_ATTEMPTS = 100;
// Only vertices up to this height form the ground footprint, so the roof overhang and chimney smoke don't block movement
const FOOTPRINT_HEIGHT = 15;

const vertex = new THREE.Vector3();

// Returns the houses array straight away; it's filled once the model has loaded.
// protectedPoints ({ x, y }) are spots houses must stay clear of, such as the player's start and enemy spawns.
export function createHouses(mapGroup, mapSize, protectedPoints) {
  const houses = [];

  new GLTFLoader().load(
    MODEL_PATH,
    (gltf) => {
      for (let i = 0; i < HOUSE_COUNT; i++) {
        const house = prepareHouse(gltf.scene);
        if (placeHouse(house, mapSize, protectedPoints, houses)) {
          mapGroup.add(house);
          houses.push(house);
        } else {
          console.warn(`No free spot found for a house after ${MAX_PLACEMENT_ATTEMPTS} attempts; skipping it`);
        }
      }
    },
    undefined,
    (error) => console.error(`Failed to load ${MODEL_PATH}`, error),
  );

  return houses;
}

function prepareHouse(source) {
  const house = source.clone();
  house.rotation.x = Math.PI / 2;
  house.rotation.y = Math.floor(Math.random() * 4) * (Math.PI / 2);
  house.scale.setScalar(MODEL_SCALE);

  // Sit the house exactly on the ground (z = 0)
  house.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(house);
  house.position.z -= box.min.z;

  // Footprint of the final rotated and scaled model, relative to the house's (x, y) position
  house.userData.footprint = computeFootprint(house);
  return house;
}

// Rectangle on the ground (XY) plane covering the model's vertices up to FOOTPRINT_HEIGHT.
// Houses only turn in quarter turns, so this rectangle stays aligned with the world axes.
function computeFootprint(house) {
  house.updateMatrixWorld(true);
  const footprint = new THREE.Box2();

  house.traverse((object) => {
    if (!object.isMesh) return;
    const count = object.geometry.attributes.position.count;
    for (let i = 0; i < count; i++) {
      object.getVertexPosition(i, vertex).applyMatrix4(object.matrixWorld);
      if (vertex.z <= FOOTPRINT_HEIGHT) {
        footprint.expandByPoint(new THREE.Vector2(vertex.x, vertex.y));
      }
    }
  });

  return footprint;
}

function placeHouse(house, mapSize, protectedPoints, houses) {
  const localFootprint = house.userData.footprint;
  const half = mapSize / 2;
  // Ranges that keep the whole footprint inside the map
  const minX = -half - localFootprint.min.x;
  const maxX = half - localFootprint.max.x;
  const minY = -half - localFootprint.min.y;
  const maxY = half - localFootprint.max.y;

  const center = new THREE.Vector2();
  const otherCenter = new THREE.Vector2();

  for (let attempt = 0; attempt < MAX_PLACEMENT_ATTEMPTS; attempt++) {
    const x = minX + Math.random() * (maxX - minX);
    const y = minY + Math.random() * (maxY - minY);
    const footprint = localFootprint.clone().translate(new THREE.Vector2(x, y));
    footprint.getCenter(center);

    const nearProtectedPoint = protectedPoints.some(
      (point) => Math.hypot(point.x - center.x, point.y - center.y) < CLEARANCE,
    );
    const nearOtherHouse = houses.some(
      (other) => other.userData.footprint.getCenter(otherCenter).distanceTo(center) < CLEARANCE,
    );
    if (nearProtectedPoint || nearOtherHouse) continue;

    house.position.x = x;
    house.position.y = y;
    house.userData.footprint = footprint; // now in world coordinates
    return true;
  }

  return false;
}
