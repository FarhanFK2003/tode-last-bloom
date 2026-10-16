import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { clone as cloneSkinned } from 'three/addons/utils/SkeletonUtils.js';
import { blocksMove, computeCollisionRadius, isMoveBlocked } from '../collision.js';

const MODEL_PATH = '/models/enemy.glb';
const MODEL_SCALE = 5;
const ENEMY_SPEED = 30; // units per second

// The model is loaded once and every enemy gets its own copy of it
let modelPromise = null;
let collisionRadius = 0;

function loadModel() {
  if (!modelPromise) {
    modelPromise = new GLTFLoader().loadAsync(MODEL_PATH).then((gltf) => {
      const model = gltf.scene;
      model.rotation.x = Math.PI / 2;
      model.scale.setScalar(MODEL_SCALE);

      // Lift the model so its lowest point rests on the ground (z = 0),
      // and centre its footprint on the origin, which the enemy group rotates around
      model.updateMatrixWorld(true);
      const box = new THREE.Box3().setFromObject(model);
      const center = box.getCenter(new THREE.Vector3());
      model.position.x -= center.x;
      model.position.y -= center.y;
      model.position.z -= box.min.z;

      collisionRadius = computeCollisionRadius(model);
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
    .then((model) => {
      enemy.userData.collisionRadius = collisionRadius;
      enemy.add(cloneSkinned(model));
    })
    .catch((error) => console.error(`Failed to load ${MODEL_PATH}`, error));

  return enemy;
}

const toTarget = new THREE.Vector2();

export function updateEnemy(enemy, player, delta, enemies) {
  toTarget.set(player.position.x - enemy.position.x, player.position.y - enemy.position.y);
  const distance = toTarget.length();
  if (distance === 0) return;

  // The model faces -Y by default; rotate the group around the world Z axis
  enemy.rotation.z = Math.atan2(toTarget.x, -toTarget.y);

  // Never step further than the remaining distance, so enemies don't overshoot
  const step = Math.min(ENEMY_SPEED * delta, distance);
  const nextX = enemy.position.x + (toTarget.x / distance) * step;
  const nextY = enemy.position.y + (toTarget.y / distance) * step;

  // A blocked enemy stays where it is this frame
  if (isMoveBlocked(enemy, nextX, nextY, enemies) || blocksMove(enemy, nextX, nextY, player)) return;

  enemy.position.x = nextX;
  enemy.position.y = nextY;
}
