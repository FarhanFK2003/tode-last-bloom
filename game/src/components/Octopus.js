import * as THREE from 'three';
import { blocksMove, hitsObstacle, isMoveBlocked } from '../collision.js';
import { updateKnockback } from './Enemy.js';

// The Ink Octopus is a ranged threat to the flower. It drifts in from a free spot near the map edge, stops
// STOP_DISTANCE from the flower (outside the Bloom Pulse's reach) and lobs ink at it. Every lob shows a shrinking
// ring on the ground for INK_FLIGHT_TIME before it lands; the impact costs the flower 1 HP (unless the Bloom Shield
// is up) and leaves a puddle that slows players' hops for PUDDLE_TIME. Touching the octopus never hurts; one
// attack defeats it. For now it is built from simple shapes (no model).
//
// Everything here (movement, lob timers, flying ink, puddles) only advances when the gameplay update calls it,
// so pausing or ending the game freezes it, and resetInk() clears it with the level.

const RADIUS = 12; // collision radius
const SPEED = 25; // units per second while approaching, before difficulty scaling
export const STOP_DISTANCE = 130; // from the flower's centre; the Bloom Pulse reaches 100
const FIRST_LOB_DELAY = 2; // seconds in position before the first lob
const LOB_INTERVAL = 4; // seconds from one lob to the next (not scaled by difficulty)
const INK_FLIGHT_TIME = 1.2; // seconds the warning ring shows before the ink lands
const INK_ARC_HEIGHT = 40;
const PUDDLE_RADIUS = 18;
const PUDDLE_TIME = 5; // seconds
const PUDDLE_SHRINK_TIME = 0.6; // the puddle shrinks away over its last moments
export const INK_SLOW = 0.6; // hop speed multiplier while standing in a puddle
const RING_START_SCALE = 2; // the warning ring shrinks from twice the puddle's size down to it

// Spawn spots: a ring near the map edge. A spot is only used when its straight path in to the stopping point
// is clear of obstacles, and it is away from players and other enemies.
const SPAWN_DISTANCE = 225;
const SPAWN_SPOTS = 16;
const PATH_CLEARANCE = 6; // extra space kept between the path and obstacles
const PLAYER_CLEARANCE = 80;
const ENEMY_CLEARANCE = 30;

const INK_Z = 0.35; // just above the pulse ring, so puddles and warnings sit on the ground

let scene = null;
let shared = null;
let flights = []; // ink in the air: { owner, from, to, timeLeft, blob, ring }
let puddles = []; // { mesh, timeLeft, x, y }

function getShared() {
  if (shared) return shared;
  const standard = (color) => new THREE.MeshStandardMaterial({ color, flatShading: true });
  const flat = (color, opacity) =>
    new THREE.MeshBasicMaterial({ color, transparent: true, opacity, depthWrite: false, side: THREE.DoubleSide });
  shared = {
    head: new THREE.SphereGeometry(1, 12, 8),
    tentacle: new THREE.ConeGeometry(1, 1, 6),
    eye: new THREE.SphereGeometry(2.2, 8, 6),
    pupil: new THREE.SphereGeometry(1.1, 6, 4),
    blob: new THREE.IcosahedronGeometry(4),
    ring: new THREE.RingGeometry(PUDDLE_RADIUS - 2.5, PUDDLE_RADIUS, 32),
    puddle: new THREE.CircleGeometry(PUDDLE_RADIUS, 20),
    purple: standard('#9B6BD6'),
    white: standard('#FFFFFF'),
    black: standard('#1A1A1A'),
    ink: standard('#2B2140'),
    warning: flat('#5B2A86', 0.85),
    puddleMaterial: flat('#2B2140', 0.75),
  };
  return shared;
}

// Called once at start-up: flying ink, warnings and puddles are added to the scene
export function createInk(gameScene) {
  scene = gameScene;
}

export function isOctopus(enemy) {
  return enemy.userData.type === 'octopus';
}

function createOctopusModel() {
  const parts = getShared();
  const octopus = new THREE.Group();
  const body = new THREE.Group(); // bobs gently
  octopus.add(body);

  const head = new THREE.Mesh(parts.head, parts.purple);
  head.scale.set(10, 10, 11);
  head.position.z = 14;
  body.add(head);

  // Eight short tentacles spread around the base
  const tentacles = [];
  for (let i = 0; i < 8; i++) {
    const angle = (i / 8) * Math.PI * 2;
    const tentacle = new THREE.Mesh(parts.tentacle, parts.purple);
    tentacle.scale.set(2.6, 12, 2.6);
    tentacle.position.set(Math.cos(angle) * 8, Math.sin(angle) * 8, 3);
    // Cones point along their local Y: lay each one down, pointing outward
    tentacle.rotation.set(0, 0, angle - Math.PI / 2);
    body.add(tentacle);
    tentacles.push(tentacle);
  }

  for (const side of [-1, 1]) {
    const eye = new THREE.Mesh(parts.eye, parts.white);
    eye.position.set(side * 4, -8.5, 16);
    const pupil = new THREE.Mesh(parts.pupil, parts.black);
    pupil.position.set(0, -1.4, 0);
    eye.add(pupil);
    body.add(eye);
  }

  return { octopus, body, tentacles };
}

// Picks a free spawn spot (see SPAWN_SPOTS) and returns a new octopus there, or null if none is free.
// context: { flower, players, enemies, houses }
export function spawnOctopus(context) {
  const { flower, players, enemies, houses } = context;
  const free = [];
  for (let i = 0; i < SPAWN_SPOTS; i++) {
    const angle = (i / SPAWN_SPOTS) * Math.PI * 2;
    const spot = new THREE.Vector2(
      flower.position.x + Math.cos(angle) * SPAWN_DISTANCE,
      flower.position.y + Math.sin(angle) * SPAWN_DISTANCE,
    );
    const nearPlayer = players.some(
      (player) => Math.hypot(player.position.x - spot.x, player.position.y - spot.y) < PLAYER_CLEARANCE,
    );
    const nearEnemy = enemies.some(
      (enemy) => Math.hypot(enemy.position.x - spot.x, enemy.position.y - spot.y) < ENEMY_CLEARANCE,
    );
    if (!nearPlayer && !nearEnemy && isPathClear(spot, angle, flower, houses)) free.push({ spot, angle });
  }
  if (free.length === 0) return null;

  const { spot } = free[Math.floor(Math.random() * free.length)];
  const { octopus, body, tentacles } = createOctopusModel();
  octopus.position.set(spot.x, spot.y, 0);
  octopus.userData = {
    type: 'octopus',
    collisionRadius: RADIUS,
    harmless: true, // touching it never costs a life (see isHarmless in Enemy.js)
    lobTimer: FIRST_LOB_DELAY,
    age: Math.random() * 10,
    body,
    tentacles,
  };
  return octopus;
}

// Whether the straight path from `spot` in to the stopping point stays clear of every obstacle
function isPathClear(spot, angle, flower, houses) {
  const reach = RADIUS + PATH_CLEARANCE;
  const point = new THREE.Vector2();
  for (let distance = SPAWN_DISTANCE; distance >= STOP_DISTANCE; distance -= 5) {
    point.set(flower.position.x + Math.cos(angle) * distance, flower.position.y + Math.sin(angle) * distance);
    if (houses.some((house) => house.userData.footprint.distanceToPoint(point) < reach)) return false;
  }
  return true;
}

// Moves the octopus in to its stopping point, then lobs ink at the flower every LOB_INTERVAL.
// Returns 'lob' on the frame it throws (for the sound), otherwise null. It never hurts players directly.
// context: { flower, players, enemies, houses, speedScale }
export function updateOctopus(octopus, delta, context) {
  const state = octopus.userData;
  const { flower, players, enemies, houses, speedScale } = context;
  state.age += delta;
  animate(state);

  // Only reachable if it is ever pushed inside the Bloom Pulse's radius: pushed away, and no lobbing meanwhile
  if (updateKnockback(octopus, flower, delta, { players, enemies, houses })) return null;

  const toFlowerX = flower.position.x - octopus.position.x;
  const toFlowerY = flower.position.y - octopus.position.y;
  const distance = Math.hypot(toFlowerX, toFlowerY);
  if (distance === 0) return null;
  octopus.rotation.z = Math.atan2(toFlowerX, -toFlowerY); // face the flower (the model faces -Y)

  // Still on its way in: step toward the flower, waiting whenever something is in the way
  if (distance > STOP_DISTANCE) {
    const step = Math.min(SPEED * speedScale * delta, distance - STOP_DISTANCE);
    const nextX = octopus.position.x + (toFlowerX / distance) * step;
    const nextY = octopus.position.y + (toFlowerY / distance) * step;
    const blocked =
      hitsObstacle(octopus, nextX, nextY, houses) ||
      players.some((player) => blocksMove(octopus, nextX, nextY, player)) ||
      isMoveBlocked(octopus, nextX, nextY, enemies);
    if (!blocked) {
      octopus.position.x = nextX;
      octopus.position.y = nextY;
    }
    return null;
  }

  // In position: count down to the next lob
  state.lobTimer -= delta;
  if (state.lobTimer > 0) return null;
  state.lobTimer = LOB_INTERVAL;
  launchInk(octopus, flower, toFlowerX / distance, toFlowerY / distance);
  return 'lob';
}

// The ink lands just in front of the flower on the octopus's side, so the puddle is where defenders stand
function launchInk(octopus, flower, dirX, dirY) {
  const parts = getShared();
  const landing = (flower.userData.collisionRadius ?? 15) + PUDDLE_RADIUS * 0.5;
  const to = new THREE.Vector2(flower.position.x - dirX * landing, flower.position.y - dirY * landing);

  const ring = new THREE.Mesh(parts.ring, parts.warning);
  ring.position.set(to.x, to.y, INK_Z);
  ring.scale.setScalar(RING_START_SCALE);
  const blob = new THREE.Mesh(parts.blob, parts.ink);
  blob.position.set(octopus.position.x, octopus.position.y, 20);
  scene.add(ring, blob);

  flights.push({
    owner: octopus,
    from: new THREE.Vector2(octopus.position.x, octopus.position.y),
    to,
    timeLeft: INK_FLIGHT_TIME,
    ring,
    blob,
  });
}

// Advances flying ink and puddles. Returns how many ink blobs landed this frame (each one is 1 flower damage
// unless the Bloom Shield blocks it). Ink still in the air is cancelled when its octopus has been defeated
// (it is no longer in `enemies`) or is being pushed back, so it can't hurt the flower meanwhile.
export function updateInk(delta, enemies) {
  let impacts = 0;

  for (const flight of [...flights]) {
    if (!enemies.includes(flight.owner) || flight.owner.userData.knockbackTime > 0) {
      removeFlight(flight);
      continue;
    }

    flight.timeLeft -= delta;
    if (flight.timeLeft <= 0) {
      removeFlight(flight);
      addPuddle(flight.to);
      impacts += 1;
      continue;
    }

    // The warning ring shrinks to the puddle's size; the blob arcs from the octopus to the landing spot
    const progress = 1 - flight.timeLeft / INK_FLIGHT_TIME;
    flight.ring.scale.setScalar(RING_START_SCALE + (1 - RING_START_SCALE) * progress);
    flight.blob.position.set(
      flight.from.x + (flight.to.x - flight.from.x) * progress,
      flight.from.y + (flight.to.y - flight.from.y) * progress,
      20 * (1 - progress) + Math.sin(progress * Math.PI) * INK_ARC_HEIGHT,
    );
  }

  for (const puddle of [...puddles]) {
    puddle.timeLeft -= delta;
    if (puddle.timeLeft <= 0) {
      scene.remove(puddle.mesh);
      puddles.splice(puddles.indexOf(puddle), 1);
      continue;
    }
    puddle.mesh.scale.setScalar(Math.min(puddle.timeLeft / PUDDLE_SHRINK_TIME, 1));
  }

  return impacts;
}

function removeFlight(flight) {
  scene.remove(flight.ring, flight.blob);
  flights.splice(flights.indexOf(flight), 1);
}

function addPuddle(at) {
  const mesh = new THREE.Mesh(getShared().puddle, getShared().puddleMaterial);
  mesh.position.set(at.x, at.y, INK_Z);
  scene.add(mesh);
  puddles.push({ mesh, timeLeft: PUDDLE_TIME, x: at.x, y: at.y });
}

// Hop speed multiplier for a player: INK_SLOW while their centre is in any puddle, otherwise 1.
// Puddles don't add up: standing in two is the same as standing in one.
export function getInkSlow(player) {
  const inInk = puddles.some(
    (puddle) => Math.hypot(player.position.x - puddle.x, player.position.y - puddle.y) < PUDDLE_RADIUS,
  );
  return inInk ? INK_SLOW : 1;
}

// Clears all flying ink, warnings and puddles (the octopuses themselves are cleared with the other enemies)
export function resetInk() {
  for (const flight of [...flights]) removeFlight(flight);
  for (const puddle of puddles) scene.remove(puddle.mesh);
  puddles = [];
  flights = [];
}

function animate(state) {
  state.body.position.z = Math.sin(state.age * 2) * 1.2;
  // Tentacles gently stretch and curl back in turn
  state.tentacles.forEach((tentacle, index) => {
    tentacle.scale.y = 12 + Math.sin(state.age * 3 + index) * 1.5;
  });
}
