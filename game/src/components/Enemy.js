import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { clone as cloneSkinned } from 'three/addons/utils/SkeletonUtils.js';
import { blocksMove, computeCollisionRadius, hitsObstacle, isMoveBlocked } from '../collision.js';

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

// Returns true when the enemy's next step runs into the player (or it already sits on the player).
// speedScale multiplies ENEMY_SPEED as difficulty increases.
export function updateEnemy(enemy, player, delta, enemies, houses, speedScale) {
  toTarget.set(player.position.x - enemy.position.x, player.position.y - enemy.position.y);
  const distance = toTarget.length();
  if (distance === 0) return true;

  // The model faces -Y by default; rotate the group around the world Z axis
  enemy.rotation.z = Math.atan2(toTarget.x, -toTarget.y);

  // Never step further than the remaining distance, so enemies don't overshoot
  const step = Math.min(ENEMY_SPEED * speedScale * delta, distance);
  const stepX = (toTarget.x / distance) * step;
  const stepY = (toTarget.y / distance) * step;

  // Try the direct step first; if a house is in the way, slide along its wall one axis at a time
  const candidates = [
    [stepX, stepY],
    [Math.sign(stepX) * step, 0],
    [0, Math.sign(stepY) * step],
  ];

  for (const [dx, dy] of candidates) {
    if (dx === 0 && dy === 0) continue;
    const nextX = enemy.position.x + dx;
    const nextY = enemy.position.y + dy;
    if (hitsObstacle(enemy, nextX, nextY, houses)) continue;

    // Running into the player is reported first, so Game Over takes priority over blocking
    if (blocksMove(enemy, nextX, nextY, player)) return true;

    // A blocked enemy stays where it is this frame
    if (isMoveBlocked(enemy, nextX, nextY, enemies)) return false;

    enemy.position.x = nextX;
    enemy.position.y = nextY;
    return false;
  }

  return false;
}
