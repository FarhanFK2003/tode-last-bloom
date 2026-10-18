import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { clone as cloneSkinned } from 'three/addons/utils/SkeletonUtils.js';
import { blocksMove, computeCollisionRadius, hitsObstacle, isMoveBlocked, slideAlongObstacle } from '../collision.js';

const MODEL_PATH = '/models/enemy.glb';
const MODEL_SCALE = 5;
const ENEMY_SPEED = 30; // units per second

// Flight animation (visual only): each bee plays the model's own Flying_Idle clip, switching to Fast_Flying while
// the bloom pulse pushes it back, and its model bobs gently above the ground. The bee's group, which all
// movement and collision use, never leaves the ground.
const IDLE_CLIP = 'Flying_Idle';
const FAST_CLIP = 'Fast_Flying';
const CLIP_FADE = 0.15; // seconds to blend between the two
const HOVER_LIFT = 2; // units the model floats above its resting height, on average
const HOVER_BOB = 1.2; // units up and down around that
const HOVER_SPEED = 3; // radians per second
const GOLDEN_RATIO = 0.618034; // spreads the bees' starting phases evenly without repeating patterns

// The model is loaded once and every enemy gets its own copy of it
let modelPromise = null;
let collisionRadius = 0;
let clips = { idle: null, fast: null }; // found once in the loaded file
let beesMade = 0; // gives each new bee its own, deterministic animation phase

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
      // The clip names carry the rig's prefix ('CharacterArmature|Flying_Idle'); fall back to the first clip
      const named = (name) => gltf.animations.find((clip) => clip.name.endsWith(name)) ?? null;
      clips = { idle: named(IDLE_CLIP) ?? gltf.animations[0] ?? null, fast: named(FAST_CLIP) };
      return model;
    });
  }
  return modelPromise;
}

export function createEnemy(position) {
  const enemy = new THREE.Group();
  enemy.position.set(position.x, position.y, 0);

  // Each bee starts its flapping and bobbing at its own point, so nearby bees don't move in step
  const phase = (beesMade * GOLDEN_RATIO) % 1;
  beesMade += 1;

  // The model is skinned, so it must be cloned with SkeletonUtils to get its own skeleton
  loadModel()
    .then((model) => {
      enemy.userData.collisionRadius = collisionRadius;
      const copy = cloneSkinned(model);
      enemy.add(copy);
      enemy.userData.flight = createFlight(copy, phase);
    })
    .catch((error) => console.error(`Failed to load ${MODEL_PATH}`, error));

  return enemy;
}

// This bee's own animation mixer and actions, and its hover bob
function createFlight(model, phase) {
  const flight = { model, restZ: model.position.z, bobTime: phase * ((Math.PI * 2) / HOVER_SPEED) };
  if (!clips.idle) return flight;
  flight.mixer = new THREE.AnimationMixer(model);
  flight.idle = flight.mixer.clipAction(clips.idle);
  flight.idle.time = phase * clips.idle.duration;
  flight.idle.play();
  flight.fast = clips.fast ? flight.mixer.clipAction(clips.fast) : null;
  flight.fasting = false;
  return flight;
}

// Advances a bee's flapping and bobbing; called from updateEnemy, so it stops whenever the game isn't playing
function animateFlight(enemy, delta) {
  const flight = enemy.userData.flight;
  if (!flight) return;

  // Faster wings while the bloom pulse pushes it back, then back to its idle flight
  const pushed = enemy.userData.knockbackTime > 0;
  if (flight.fast && pushed !== flight.fasting) {
    flight.fasting = pushed;
    const [from, to] = pushed ? [flight.idle, flight.fast] : [flight.fast, flight.idle];
    to.reset().play();
    from.crossFadeTo(to, CLIP_FADE, false);
  }
  flight.mixer?.update(delta);

  flight.bobTime += delta;
  flight.model.position.z = flight.restZ + HOVER_LIFT + Math.sin(flight.bobTime * HOVER_SPEED) * HOVER_BOB;
}

// Stops a bee's animation and lets go of its cached clip data; called when the bee is removed for good.
// Safe for any enemy: the others have no flight animation.
export function releaseEnemyAnimation(enemy) {
  const flight = enemy.userData.flight;
  if (!flight?.mixer) return;
  flight.mixer.stopAllAction();
  flight.mixer.uncacheRoot(flight.model);
  enemy.userData.flight = null;
}

const BITE_INTERVAL = 1; // seconds of continuous contact with the flower per 1 HP bite
const KNOCKBACK_SPEED = 140; // units per second while pushed back by the bloom pulse

const toTarget = new THREE.Vector2();

// Whether touching this enemy is harmless right now: always for an enemy marked harmless (the octopus),
// while it is pushed back by the bloom pulse, or while stunned (a crab after its first hit)
export function isHarmless(enemy) {
  return enemy.userData.harmless === true || enemy.userData.knockbackTime > 0 || enemy.userData.stunTime > 0;
}

// Bloom Pulse pushback, shared by every enemy type: while knockbackTime lasts, the enemy moves straight away
// from the flower, harmless and unable to bite. Returns true if the enemy was pushed back this frame.
export function updateKnockback(enemy, flower, delta, { players, enemies, houses }) {
  if (!(enemy.userData.knockbackTime > 0)) return false;
  enemy.userData.knockbackTime = Math.max(enemy.userData.knockbackTime - delta, 0);
  enemy.userData.biteTimer = 0;

  const awayX = enemy.position.x - flower.position.x;
  const awayY = enemy.position.y - flower.position.y;
  const distance = Math.hypot(awayX, awayY);
  if (distance === 0) return true;
  const pushStep = KNOCKBACK_SPEED * delta;
  knockBack(enemy, (awayX / distance) * pushStep, (awayY / distance) * pushStep, pushStep, {
    flower,
    players,
    enemies,
    houses,
  });
  return true;
}

// Moves the enemy toward the flower. Returns 'player' when its next step runs into any of the players,
// 'bite' when it lands a bite on the flower, and null otherwise.
// speedScale multiplies ENEMY_SPEED as difficulty increases.
export function updateEnemy(enemy, flower, players, delta, enemies, houses, speedScale) {
  animateFlight(enemy, delta);

  toTarget.set(flower.position.x - enemy.position.x, flower.position.y - enemy.position.y);
  const distance = toTarget.length();
  if (distance === 0) return null;

  // The model faces -Y by default; rotate the group around the world Z axis
  enemy.rotation.z = Math.atan2(toTarget.x, -toTarget.y);

  // Pushed back by the bloom pulse: move away from the flower (still facing it), harmless and unable to bite
  if (updateKnockback(enemy, flower, delta, { players, enemies, houses })) return null;

  // Never step further than the remaining distance, so enemies don't overshoot
  const step = Math.min(ENEMY_SPEED * speedScale * delta, distance);
  const stepX = (toTarget.x / distance) * step;
  const stepY = (toTarget.y / distance) * step;

  for (const [dx, dy] of stepCandidates(enemy, stepX, stepY, step, houses)) {
    if (dx === 0 && dy === 0) continue;
    const nextX = enemy.position.x + dx;
    const nextY = enemy.position.y + dy;
    if (hitsObstacle(enemy, nextX, nextY, houses)) continue;

    // Running into a player is reported first, so it takes priority over everything else
    if (players.some((player) => blocksMove(enemy, nextX, nextY, player))) {
      enemy.userData.biteTimer = 0;
      return 'player';
    }

    // An enemy that reaches the flower stays there and bites it
    if (blocksMove(enemy, nextX, nextY, flower)) return bite(enemy, delta);

    enemy.userData.biteTimer = 0;

    // A blocked enemy stays where it is this frame
    if (isMoveBlocked(enemy, nextX, nextY, enemies)) return null;

    enemy.position.x = nextX;
    enemy.position.y = nextY;
    return null;
  }

  enemy.userData.biteTimer = 0;
  return null;
}

// Steps to try, in order: the direct step first. If a house is in the way, slide along its surface
// (which also curves around corners), then fall back to sliding one axis at a time.
function stepCandidates(enemy, stepX, stepY, step, houses) {
  const candidates = [[stepX, stepY]];
  if (hitsObstacle(enemy, enemy.position.x + stepX, enemy.position.y + stepY, houses)) {
    const slide = slideAlongObstacle(enemy, stepX, stepY, houses);
    if (slide) candidates.push([slide.x * step, slide.y * step]);
  }
  candidates.push([Math.sign(stepX) * step, 0], [0, Math.sign(stepY) * step]);
  return candidates;
}

// One pushback step, with the same collision rules as normal movement, except that touching a player
// only blocks the bee (it never costs a life) and the bee never bites
function knockBack(enemy, stepX, stepY, step, { flower, players, enemies, houses }) {
  for (const [dx, dy] of stepCandidates(enemy, stepX, stepY, step, houses)) {
    if (dx === 0 && dy === 0) continue;
    const nextX = enemy.position.x + dx;
    const nextY = enemy.position.y + dy;
    if (hitsObstacle(enemy, nextX, nextY, houses)) continue;

    // Blocked by a player, the flower or another bee: stay where it is this frame
    if (isMoveBlocked(enemy, nextX, nextY, players) || blocksMove(enemy, nextX, nextY, flower)) return;
    if (isMoveBlocked(enemy, nextX, nextY, enemies)) return;

    enemy.position.x = nextX;
    enemy.position.y = nextY;
    return;
  }
}

// One bite for every full second of continuous contact; losing contact resets the timer
function bite(enemy, delta) {
  enemy.userData.biteTimer = (enemy.userData.biteTimer ?? 0) + delta;
  if (enemy.userData.biteTimer < BITE_INTERVAL) return null;

  enemy.userData.biteTimer -= BITE_INTERVAL;
  return 'bite';
}
