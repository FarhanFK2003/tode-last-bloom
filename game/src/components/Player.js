import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { blocksMove, computeCollisionRadius, hitsObstacle, isMoveBlocked } from '../collision.js';
import { isHarmless } from './Enemy.js';

const MODEL_PATH = '/models/tode.glb';
const MODEL_SCALE = 20;

// Tode starts in front of the flower, which stands at the origin
export const PLAYER_START = new THREE.Vector2(0, -50);

const MOVE_SPEED = 3; // hops per second
const JUMP_DISTANCE = 20;
const JUMP_HEIGHT = 8;

const BLINK_RATE = 10; // visibility toggles per second while invulnerable

// Visual animation of the model only (the group, which movement and collision use, is never scaled):
// the model's local Y is the world's up axis, so scale.y is Tode's height and scale.x / scale.z its width.
// A hop stretches Tode a little in the air and squashes it briefly on landing; when still, it breathes;
// an attack makes it pop. Every effect eases in and out, so the scale never jumps.
const HOP_STRETCH = 0.08; // taller by this fraction at the top of a hop (and a little thinner)
const LAND_TIME = 0.14; // seconds of the landing squash
const LAND_SQUASH = 0.12; // shorter by this fraction at its deepest (and a little wider)
const BREATH_SPEED = 2.2; // radians per second
const BREATH_SIZE = 0.03;
const BREATH_EASE = 6; // how quickly breathing fades in when Tode stops and out when it hops (per second)
const POP_TIME = 0.18; // seconds of the attack pop
const POP_SIZE = 0.1;

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

const WHITE = new THREE.Color(0xffffff);

// A player is a Group (moved on the ground) holding its own copy of the model.
// Everything that belongs to one player lives in player.userData.state.
// tint (optional) recolours this player's copy only: its material is cloned first, so the shared
// template, other players and the texture are untouched. tintStrength blends from white (0) to the tint (1).
export function createPlayer(start, { tint = null, tintStrength = 1 } = {}) {
  const player = new THREE.Group();
  player.position.set(start.x, start.y, 0);
  player.userData.state = {
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
    // Visual pose (see poseModel): hop height, landing squash and attack pop timers, breathing
    pose: { hopHeight: 0, landTime: 0, popTime: 0, breathTime: 0, breathWeight: 1 },
    // True for the one frame a hop starts moving (not when it is blocked straight away); used for its sound
    hopStarted: false,
  };

  loadTemplate()
    .then((template) => {
      const model = template.model.clone();
      if (tint !== null) {
        const color = WHITE.clone().lerp(new THREE.Color(tint), tintStrength);
        model.traverse((object) => {
          if (!object.isMesh) return;
          // The texture stays shared; only the colour it is multiplied by changes
          object.material = object.material.clone();
          object.material.color.copy(color);
        });
      }
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

// Whether a player centred at (x, y) would reach past the square map boundary (half-size `bounds`)
function isOutsideBounds(player, x, y, bounds) {
  const limit = bounds - (player.userData.collisionRadius ?? 0);
  return Math.abs(x) > limit || Math.abs(y) > limit;
}

// Returns true when this player's next position runs into an enemy. The flower (null where there is none, as in
// the boss arena), houses, other players
// and the map boundary only block the hop.
// speedScale multiplies MOVE_SPEED as difficulty increases; invulnerableTime (from Lives.js) drives the blinking.
// players are all active players (this one is skipped); bounds is the map's half-size, or null for no limit.
export function updatePlayer(player, delta, enemies, flower, houses, speedScale, invulnerableTime, players, bounds) {
  const state = player.userData.state;
  const { inputQueue, movement, model } = state;
  state.hopStarted = false;

  // Blink the model, not the group, so the attached camera and attack circle stay visible
  if (model) {
    model.visible = invulnerableTime === 0 || Math.floor(invulnerableTime * BLINK_RATE) % 2 === 0;
  }

  const startedThisFrame = movement.done && inputQueue.length > 0;
  if (startedThisFrame) {
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

  if (movement.done) {
    poseModel(state, delta);
    return false;
  }

  movement.progress = Math.min(movement.progress + MOVE_SPEED * speedScale * delta, 1);
  let touchedEnemy = false;

  // Once a hop bumps into an enemy, it stops moving forward but still finishes its arc
  if (!movement.blocked) {
    const distance = JUMP_DISTANCE * movement.progress;
    const nextX = movement.start.x + movement.direction.x * distance;
    const nextY = movement.start.y + movement.direction.y * distance;

    if (isMoveBlocked(player, nextX, nextY, enemies)) {
      movement.blocked = true;
      // Every enemy blocks the hop, but one pushed back by the bloom pulse or stunned is harmless
      touchedEnemy = enemies.some((enemy) => !isHarmless(enemy) && blocksMove(player, nextX, nextY, enemy));
    } else if (
      (flower !== null && blocksMove(player, nextX, nextY, flower)) ||
      hitsObstacle(player, nextX, nextY, houses) ||
      isMoveBlocked(player, nextX, nextY, players) ||
      (bounds !== null && isOutsideBounds(player, nextX, nextY, bounds))
    ) {
      // The flower, houses, other players and the map boundary stop the hop but never cost a life.
      // Players use the same overlap rule as everything else, so two overlapping players can always separate.
      movement.blocked = true;
    } else {
      player.position.x = nextX;
      player.position.y = nextY;
    }
  }

  // Hop the model, not the group, so the attached camera stays steady (applied in poseModel)
  state.pose.hopHeight = Math.sin(movement.progress * Math.PI) * JUMP_HEIGHT;

  if (movement.progress === 1) {
    movement.done = true;
    state.pose.hopHeight = 0;
    state.pose.landTime = LAND_TIME;
  }

  state.hopStarted = startedThisFrame && !movement.blocked;
  poseModel(state, delta);
  return touchedEnemy;
}

// An attack just fired: a quick visual pop (the attack itself is unchanged)
export function popPlayer(player) {
  player.userData.state.pose.popTime = POP_TIME;
}

// Applies the visual pose to the model: hop height, stretch in the air, landing squash, breathing and the
// attack pop. Only runs from updatePlayer, so it freezes whenever the game isn't playing.
function poseModel(state, delta) {
  const { model, movement, pose } = state;
  pose.landTime = Math.max(pose.landTime - delta, 0);
  pose.popTime = Math.max(pose.popTime - delta, 0);
  pose.breathTime += delta;
  const resting = movement.done && pose.landTime === 0;
  pose.breathWeight += ((resting ? 1 : 0) - pose.breathWeight) * Math.min(BREATH_EASE * delta, 1);
  if (!model) return;

  // Each effect rises and falls smoothly: a sine over its own span
  const stretch = movement.done ? 0 : Math.sin(movement.progress * Math.PI) * HOP_STRETCH;
  const squash = Math.sin((1 - pose.landTime / LAND_TIME) * Math.PI) * (pose.landTime > 0 ? LAND_SQUASH : 0);
  const breath = Math.sin(pose.breathTime * BREATH_SPEED) * BREATH_SIZE * pose.breathWeight;
  const pop = Math.sin((1 - pose.popTime / POP_TIME) * Math.PI) * (pose.popTime > 0 ? POP_SIZE : 0);

  const height = (1 + stretch) * (1 - squash) * (1 + breath) * (1 + pop);
  const width = (1 - stretch * 0.5) * (1 + squash * 0.5) * (1 - breath * 0.5) * (1 + pop);
  model.scale.set(MODEL_SCALE * width, MODEL_SCALE * height, MODEL_SCALE * width);
  // The model is lifted by modelGroundZ at full height; scaling its height scales that lift, so its feet stay
  // on the ground, and the hop height is added on top
  model.position.z = state.modelGroundZ * height + pose.hopHeight;
}

// Makes the model visible even if the game froze while it was blinking
export function showPlayerModel(player) {
  const { model } = player.userData.state;
  if (model) model.visible = true;
}

// Back to a fresh state at `start` (each game mode has its own starting positions)
export function resetPlayer(player, start) {
  const state = player.userData.state;
  state.inputQueue.length = 0;
  state.movement.direction = null;
  state.movement.progress = 0;
  state.movement.done = true;
  state.movement.blocked = false;
  state.hopStarted = false;
  Object.assign(state.pose, { hopHeight: 0, landTime: 0, popTime: 0, breathTime: 0, breathWeight: 1 });

  player.position.set(start.x, start.y, 0);
  player.visible = true;

  if (state.model) {
    state.model.position.z = state.modelGroundZ;
    state.model.scale.setScalar(MODEL_SCALE);
    state.model.rotation.y = 0;
    state.model.visible = true;
  }
}
