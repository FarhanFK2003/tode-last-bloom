import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { computeCollisionRadius } from '../collision.js';

const MODEL_PATH = '/models/flower_single.glb';
const MODEL_SCALE = 15;
export const FLOWER_MAX_HEALTH = 20;

let health = FLOWER_MAX_HEALTH;

// The flower stands at the centre of the map; bees attack it and Tode defends it
export function createFlower() {
  const flower = new THREE.Group();
  flower.position.set(0, 0, 0);

  new GLTFLoader().load(
    MODEL_PATH,
    (gltf) => {
      const model = gltf.scene;
      model.rotation.x = Math.PI / 2;
      model.scale.setScalar(MODEL_SCALE);

      // Lift the model so its lowest point rests on the ground (z = 0)
      model.updateMatrixWorld(true);
      const box = new THREE.Box3().setFromObject(model);
      model.position.z -= box.min.z;

      flower.userData.collisionRadius = computeCollisionRadius(model);
      flower.add(model);
    },
    undefined,
    (error) => console.error(`Failed to load ${MODEL_PATH}`, error),
  );

  return flower;
}

// Returns the health left after the damage
export function damageFlower(amount) {
  health = Math.max(health - amount, 0);
  return health;
}

export function getFlowerHealth() {
  return health;
}

export function resetFlower() {
  health = FLOWER_MAX_HEALTH;
}
