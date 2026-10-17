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

export const PLAYER_LIVES = 3;
const INVULNERABILITY_TIME = 1.5; // seconds after a hit during which bees can't cost another life
const BLINK_RATE = 10; // visibility toggles per second while invulnerable

// Arrow keys move along the world axes (the ground is the XY plane)
const DIRECTIONS = {
  ArrowUp: new THREE.Vector2(0, 1),
  ArrowDown: new THREE.Vector2(0, -1),
  ArrowLeft: new THREE.Vector2(-1, 0),
  ArrowRight: new THREE.Vector2(1, 0),
};

const inputQueue = [];
const movement = {
  direction: null,
  progress: 0,
  done: true,
  blocked: false,
  start: new THREE.Vector2(),
};

let model = null;
let modelGroundZ = 0;

let lives = PLAYER_LIVES;
let invulnerableTime = 0;

export function createPlayer(onLoad) {
  const player = new THREE.Group();
  player.position.set(PLAYER_START.x, PLAYER_START.y, 0);

  new GLTFLoader().load(
    MODEL_PATH,
    (gltf) => {
      model = gltf.scene;
      model.rotation.x = Math.PI / 2;
      model.scale.setScalar(MODEL_SCALE);

      // Lift the model so its lowest point rests on the ground (z = 0)
      const box = new THREE.Box3().setFromObject(model);
      model.position.z -= box.min.z;
      modelGroundZ = model.position.z;

      player.userData.collisionRadius = computeCollisionRadius(model);
      player.add(model);
      onLoad?.();
    },
    undefined,
    (error) => console.error(`Failed to load ${MODEL_PATH}`, error),
  );

  return player;
}

// Queues one hop for an arrow key ('ArrowUp', 'ArrowDown', 'ArrowLeft' or 'ArrowRight').
// Called by the central input handling, only while the game is being played.
export function queueHop(arrowKey) {
  if (arrowKey in DIRECTIONS) inputQueue.push(DIRECTIONS[arrowKey]);
}

// Returns true when Tode's next position runs into an enemy. The flower and houses only block the hop.
// speedScale multiplies MOVE_SPEED as difficulty increases.
export function updatePlayer(player, delta, enemies, flower, houses, speedScale) {
  updateInvulnerability(delta);

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
    model.position.z = modelGroundZ + Math.sin(movement.progress * Math.PI) * JUMP_HEIGHT;
  }

  if (movement.progress === 1) {
    movement.done = true;
  }

  return touchedEnemy;
}

function updateInvulnerability(delta) {
  invulnerableTime = Math.max(invulnerableTime - delta, 0);

  // Blink the model, not the group, so the attached camera and attack circle stay visible
  if (model) {
    model.visible = invulnerableTime === 0 || Math.floor(invulnerableTime * BLINK_RATE) % 2 === 0;
  }
}

// Costs one life unless Tode is still invulnerable from the previous hit. Returns the lives left.
export function hitPlayer() {
  if (invulnerableTime > 0) return lives;
  lives -= 1;
  invulnerableTime = INVULNERABILITY_TIME;
  return lives;
}

export function getPlayerLives() {
  return lives;
}

// Makes the model visible even if the game froze while it was blinking
export function showPlayerModel() {
  if (model) model.visible = true;
}

export function resetPlayer(player) {
  inputQueue.length = 0;
  movement.direction = null;
  movement.progress = 0;
  movement.done = true;
  movement.blocked = false;

  lives = PLAYER_LIVES;
  invulnerableTime = 0;

  player.position.set(PLAYER_START.x, PLAYER_START.y, 0);
  player.visible = true;

  if (model) {
    model.position.z = modelGroundZ;
    model.rotation.y = 0;
    model.visible = true;
  }
}
