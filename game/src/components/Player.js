import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { blocksMove, computeCollisionRadius, hitsObstacle, isMoveBlocked } from '../collision.js';

const MODEL_PATH = '/models/tode.glb';
const MODEL_SCALE = 20;

// Tode starts in front of the flower, which stands at the origin
export const PLAYER_START = new THREE.Vector2(0, -50);

const MOVE_SPEED = 3; // hops per second
const JUMP_DISTANCE = 20;
const JUMP_HEIGHT = 8;

const BLINK_RATE = 10; // visibility toggles per second while invulnerable

// Hop directions along the world axes (the ground is the XY plane)
const DIRECTIONS = {
  up: new THREE.Vector2(0, 1),
  down: new THREE.Vector2(0, -1),
  left: new THREE.Vector2(-1, 0),
  right: new THREE.Vector2(1, 0),
};

// The model is loaded and prepared once; every player gets its own copy of it.
// Tode's model has no skeleton, so a plain clone is safe; copies share its geometry, material and texture.
let templatePromise = null;

function loadTemplate() {
  if (!templatePromise) {
    templatePromise = new GLTFLoader().loadAsync(MODEL_PATH).then((gltf) => {
      const model = gltf.scene;
      model.rotation.x = Math.PI / 2;
      model.scale.setScalar(MODEL_SCALE);

      // Lift the model so its lowest point rests on the ground (z = 0)
      const box = new THREE.Box3().setFromObject(model);
      model.position.z -= box.min.z;

      return { model, collisionRadius: computeCollisionRadius(model) };
    });
  }
  return templatePromise;
}

// A player is a Group (moved on the ground) holding its own copy of the model.
// Everything that belongs to one player lives in player.userData.state.
export function createPlayer(start) {
  const player = new THREE.Group();
  player.position.set(start.x, start.y, 0);
  player.userData.state = {
    start: start.clone(),
    inputQueue: [],
    movement: {
      direction: null,
      progress: 0,
      done: true,
      blocked: false,
      start: new THREE.Vector2(),
    },
    model: null,
    modelGroundZ: 0,
  };

  loadTemplate()
    .then((template) => {
      const model = template.model.clone();
      player.userData.state.model = model;
      player.userData.state.modelGroundZ = model.position.z;
      player.userData.collisionRadius = template.collisionRadius;
      player.add(model);
    })
    .catch((error) => console.error(`Failed to load ${MODEL_PATH}`, error));

  return player;
}

// Queues one hop ('up', 'down', 'left' or 'right') for this player.
// Called by the central input handling, only while the game is being played.
export function queueHop(player, direction) {
  if (direction in DIRECTIONS) player.userData.state.inputQueue.push(DIRECTIONS[direction]);
}

// Returns true when this player's next position runs into an enemy. The flower and houses only block the hop.
// speedScale multiplies MOVE_SPEED as difficulty increases; invulnerableTime (from Lives.js) drives the blinking.
export function updatePlayer(player, delta, enemies, flower, houses, speedScale, invulnerableTime) {
  const { inputQueue, movement, model } = player.userData.state;

  // Blink the model, not the group, so the attached camera and attack circle stay visible
  if (model) {
    model.visible = invulnerableTime === 0 || Math.floor(invulnerableTime * BLINK_RATE) % 2 === 0;
  }

  if (movement.done && inputQueue.length > 0) {
    movement.direction = inputQueue.shift();
    movement.progress = 0;
    movement.done = false;
    movement.blocked = false;
    movement.start.set(player.position.x, player.position.y);

    // The model faces -Y by default; rotation.y turns it around the world Z axis
    if (model) {
      model.rotation.y = Math.atan2(movement.direction.x, -movement.direction.y);
    }
  }

  if (movement.done) return false;

  movement.progress = Math.min(movement.progress + MOVE_SPEED * speedScale * delta, 1);
  let touchedEnemy = false;

  // Once a hop bumps into an enemy, it stops moving forward but still finishes its arc
  if (!movement.blocked) {
    const distance = JUMP_DISTANCE * movement.progress;
    const nextX = movement.start.x + movement.direction.x * distance;
    const nextY = movement.start.y + movement.direction.y * distance;

    if (isMoveBlocked(player, nextX, nextY, enemies)) {
      movement.blocked = true;
      // Every bee blocks the hop, but one being pushed back by the bloom pulse is harmless
      touchedEnemy = enemies.some(
        (enemy) => !(enemy.userData.knockbackTime > 0) && blocksMove(player, nextX, nextY, enemy),
      );
    } else if (blocksMove(player, nextX, nextY, flower) || hitsObstacle(player, nextX, nextY, houses)) {
      // The flower and houses stop the hop but never cost a life
      movement.blocked = true;
    } else {
      player.position.x = nextX;
      player.position.y = nextY;
    }
  }

  // Hop the model, not the group, so the attached camera stays steady
  if (model) {
    model.position.z = player.userData.state.modelGroundZ + Math.sin(movement.progress * Math.PI) * JUMP_HEIGHT;
  }

  if (movement.progress === 1) {
    movement.done = true;
  }

  return touchedEnemy;
}

// Makes the model visible even if the game froze while it was blinking
export function showPlayerModel(player) {
  const { model } = player.userData.state;
  if (model) model.visible = true;
}

export function resetPlayer(player) {
  const state = player.userData.state;
  state.inputQueue.length = 0;
  state.movement.direction = null;
  state.movement.progress = 0;
  state.movement.done = true;
  state.movement.blocked = false;

  player.position.set(state.start.x, state.start.y, 0);
  player.visible = true;

  if (state.model) {
    state.model.position.z = state.modelGroundZ;
    state.model.rotation.y = 0;
    state.model.visible = true;
  }
}
