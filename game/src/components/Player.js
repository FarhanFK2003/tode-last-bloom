import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

const MODEL_PATH = '/models/tode.glb';
const MODEL_SCALE = 20;

const MOVE_SPEED = 3; // hops per second
const JUMP_DISTANCE = 20;
const JUMP_HEIGHT = 8;

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
  start: new THREE.Vector2(),
};

let model = null;
let modelGroundZ = 0;

export function createPlayer(onLoad) {
  const player = new THREE.Group();
  player.position.set(0, 0, 0);

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

      player.add(model);
      onLoad?.();
    },
    undefined,
    (error) => console.error(`Failed to load ${MODEL_PATH}`, error),
  );

  window.addEventListener('keydown', (event) => {
    if (!(event.key in DIRECTIONS)) return;
    event.preventDefault();
    if (event.repeat) return;
    inputQueue.push(DIRECTIONS[event.key]);
  });

  return player;
}

export function updatePlayer(player, delta) {
  if (movement.done && inputQueue.length > 0) {
    movement.direction = inputQueue.shift();
    movement.progress = 0;
    movement.done = false;
    movement.start.set(player.position.x, player.position.y);

    // The model faces -Y by default; rotation.y turns it around the world Z axis
    if (model) {
      model.rotation.y = Math.atan2(movement.direction.x, -movement.direction.y);
    }
  }

  if (movement.done) return;

  movement.progress = Math.min(movement.progress + MOVE_SPEED * delta, 1);
  const distance = JUMP_DISTANCE * movement.progress;
  player.position.x = movement.start.x + movement.direction.x * distance;
  player.position.y = movement.start.y + movement.direction.y * distance;

  // Hop the model, not the group, so the attached camera stays steady
  if (model) {
    model.position.z = modelGroundZ + Math.sin(movement.progress * Math.PI) * JUMP_HEIGHT;
  }

  if (movement.progress === 1) {
    movement.done = true;
  }
}
