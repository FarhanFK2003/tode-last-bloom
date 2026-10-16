import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { clone as cloneSkinned } from 'three/addons/utils/SkeletonUtils.js';

const MODEL_PATH = '/models/enemy.glb';
const MODEL_SCALE = 5;
const ENEMY_SPEED = 30; // units per second

// The model is loaded once and every enemy gets its own copy of it
let modelPromise = null;

function loadModel() {
  if (!modelPromise) {
    modelPromise = new GLTFLoader().loadAsync(MODEL_PATH).then((gltf) => {
      const model = gltf.scene;
      model.rotation.x = Math.PI / 2;
      model.scale.setScalar(MODEL_SCALE);

      // Lift the model so its lowest point rests on the ground (z = 0)
      model.updateMatrixWorld(true);
      const box = new THREE.Box3().setFromObject(model);
      model.position.z -= box.min.z;

      return model;
    });
  }
  return modelPromise;
}

export function createEnemy(position) {
  const enemy = new THREE.Group();
  enemy.position.set(position.x, position.y, 0);

  // The model is skinned, so it must be cloned with SkeletonUtils to get its own skeleton
  loadModel()
    .then((model) => enemy.add(cloneSkinned(model)))
    .catch((error) => console.error(`Failed to load ${MODEL_PATH}`, error));

  return enemy;
}

const toTarget = new THREE.Vector2();

export function updateEnemy(enemy, target, delta) {
  toTarget.set(target.x - enemy.position.x, target.y - enemy.position.y);
  const distance = toTarget.length();
  if (distance === 0) return;

  // Never step further than the remaining distance, so enemies don't overshoot
  const step = Math.min(ENEMY_SPEED * delta, distance);
  enemy.position.x += (toTarget.x / distance) * step;
  enemy.position.y += (toTarget.y / distance) * step;

  // The model faces -Y by default; rotate the group around the world Z axis
  enemy.rotation.z = Math.atan2(toTarget.x, -toTarget.y);
}
