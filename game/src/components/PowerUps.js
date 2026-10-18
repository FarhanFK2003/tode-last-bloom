import * as THREE from 'three';

// Pickups that appear around the flower during a run, and the effects they give:
//   shield: the flower takes no bite damage for SHIELD_TIME seconds (whole team)
//   boost:  the player who collects it hops BOOST_MULTIPLIER times faster for BOOST_TIME seconds
//   petal:  restores one shared life (only spawns, and can only be collected, while a life is missing)
// Everything here is updated from the gameplay update only, so pausing or ending the game freezes it.

const FIRST_SPAWN = 15; // seconds into a run before the first pickup
const SPAWN_INTERVAL = 20; // seconds between pickups
const RETRY_DELAY = 1; // seconds before trying again when no spot is free
const MAX_PICKUPS = 2; // on the ground at once
const PICKUP_LIFETIME = 12; // seconds before an uncollected pickup disappears
const PICKUP_BLINK_TIME = 3; // it blinks for its last seconds
const PICKUP_RADIUS = 8; // collection reach, added to the player's collision radius
const SPAWN_CLEARANCE = 12; // extra free space required around a new pickup

// Candidate spots: a ring around the flower, between the axes so none sits on Tode's start or the bees' paths
// from the corners. The ring is kept small so pickups are usually on screen in single player.
const RING_RADIUS = 90;
const CANDIDATES = Array.from({ length: 8 }, (_, index) => {
  const angle = Math.PI / 8 + (index * Math.PI) / 4;
  return new THREE.Vector2(Math.cos(angle) * RING_RADIUS, Math.sin(angle) * RING_RADIUS);
});
const VISIBLE_FRAME = 0.85; // a spot counts as on screen when it projects inside this part of the view

export const SHIELD_TIME = 8; // seconds
const SHIELD_WARNING_TIME = 2; // the dome flickers for its last seconds
export const BOOST_TIME = 6; // seconds
const BOOST_MULTIPLIER = 1.5;

const BLINK_RATE = 8; // visibility toggles per second for blinking pickups and the fading shield
const BOB_HEIGHT = 2;
const BOB_SPEED = 3; // radians per second
const SPIN_SPEED = 1.5; // radians per second
const ICON_Z = 12;

// Shield dome: a soft translucent half sphere over the flower
const DOME_COLOR = 0xffd6ec;
const DOME_OPACITY = 0.28;
const DOME_MARGIN = 10; // beyond the flower's collision radius
const DOME_FALLBACK_RADIUS = 25; // if the flower model hasn't loaded yet

// Geometry and materials are created once and shared by every pickup; they are never disposed,
// so removing a pickup only takes its group out of the scene
const SHARED = {};

function createShared() {
  const standard = (color) =>
    new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 0.25, flatShading: true });
  const ground = (color) =>
    new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.35, depthWrite: false });

  SHARED.ground = new THREE.CircleGeometry(PICKUP_RADIUS + 3, 24);
  SHARED.types = {
    shield: {
      parts: [{ geometry: new THREE.OctahedronGeometry(6), material: standard(0x7ec8ff) }],
      groundMaterial: ground(0x7ec8ff),
    },
    // A golden nectar drop: a ball with a cone tip
    boost: {
      parts: [
        { geometry: new THREE.SphereGeometry(4.5, 10, 8), material: standard(0xffc93c) },
        { geometry: new THREE.ConeGeometry(3.6, 6, 10), material: standard(0xffc93c), z: 5 },
      ],
      groundMaterial: ground(0xffc93c),
    },
    // A pink petal gem in a pale ring
    petal: {
      parts: [
        { geometry: new THREE.DodecahedronGeometry(5), material: standard(0xff8fb8) },
        { geometry: new THREE.TorusGeometry(7.5, 0.9, 6, 20), material: standard(0xffd1e3), torus: true },
      ],
      groundMaterial: ground(0xff8fb8),
    },
  };
}

let scene = null;
let dome = null;
let pickups = []; // { type, group, icon, timeLeft, age }
let spawnTimer = FIRST_SPAWN;
let shieldTime = 0;

export function createPowerUps(gameScene, flower) {
  scene = gameScene;
  createShared();

  // The dome's geometry is a unit half sphere, scaled to the flower when the shield starts
  dome = new THREE.Mesh(
    new THREE.SphereGeometry(1, 24, 12, 0, Math.PI * 2, 0, Math.PI / 2),
    new THREE.MeshBasicMaterial({
      color: DOME_COLOR,
      transparent: true,
      opacity: DOME_OPACITY,
      depthWrite: false,
      side: THREE.DoubleSide,
    }),
  );
  dome.rotation.x = Math.PI / 2; // its pole points up the world Z axis
  dome.visible = false;
  flower.add(dome);
}

function createPickupGroup(type) {
  const { parts, groundMaterial } = SHARED.types[type];
  const group = new THREE.Group();

  const disc = new THREE.Mesh(SHARED.ground, groundMaterial);
  disc.position.z = 0.2;
  group.add(disc);

  const icon = new THREE.Group();
  icon.position.z = ICON_Z;
  for (const part of parts) {
    const mesh = new THREE.Mesh(part.geometry, part.material);
    if (part.z) {
      // Cone geometry points along its local Y; turn it to point up the world Z axis
      mesh.rotation.x = Math.PI / 2;
      mesh.position.z = part.z;
    }
    if (part.torus) mesh.rotation.x = Math.PI / 2; // stand the ring up so it is seen from the camera
    icon.add(mesh);
  }
  group.add(icon);
  return { group, icon };
}

// Whether a new pickup at `spot` would be clear of the houses, flower, players, bees and other pickups
function isSpotFree(spot, { houses, flower, players, enemies }) {
  const reach = PICKUP_RADIUS + SPAWN_CLEARANCE;
  const tooClose = (object) =>
    Math.hypot(object.position.x - spot.x, object.position.y - spot.y) < reach + (object.userData.collisionRadius ?? 0);

  if (houses.some((house) => house.userData.footprint.distanceToPoint(spot) < reach)) return false;
  if (tooClose(flower) || players.some(tooClose) || enemies.some(tooClose)) return false;
  return !pickups.some(
    (pickup) => Math.hypot(pickup.group.position.x - spot.x, pickup.group.position.y - spot.y) < 2 * reach,
  );
}

const projected = new THREE.Vector3();

function isOnScreen(spot, camera) {
  camera.updateMatrixWorld();
  projected.set(spot.x, spot.y, ICON_Z).project(camera);
  return Math.abs(projected.x) < VISIBLE_FRAME && Math.abs(projected.y) < VISIBLE_FRAME;
}

// Picks a random free spot, preferring ones currently on screen. Returns null if none is free.
function chooseSpot(context) {
  const free = CANDIDATES.filter((spot) => isSpotFree(spot, context));
  const visible = free.filter((spot) => isOnScreen(spot, context.camera));
  const choices = visible.length > 0 ? visible : free;
  return choices.length > 0 ? choices[Math.floor(Math.random() * choices.length)] : null;
}

// Boost always; Shield unless the level leaves it out (the boss arena); Petal only while a life is missing
function chooseType(canHeal, allowShield) {
  const types = allowShield ? ['shield', 'boost'] : ['boost'];
  if (canHeal && !pickups.some((pickup) => pickup.type === 'petal')) types.push('petal');
  return types[Math.floor(Math.random() * types.length)];
}

function removePickup(pickup) {
  scene.remove(pickup.group);
  pickups.splice(pickups.indexOf(pickup), 1);
}

function trySpawn(context) {
  if (pickups.length >= MAX_PICKUPS) return SPAWN_INTERVAL;
  const spot = chooseSpot(context);
  if (!spot) return RETRY_DELAY;

  const type = chooseType(context.canHeal(), context.allowShield);
  const { group, icon } = createPickupGroup(type);
  group.position.set(spot.x, spot.y, 0);
  scene.add(group);
  pickups.push({ type, group, icon, timeLeft: PICKUP_LIFETIME, age: 0 });
  return SPAWN_INTERVAL;
}

// Spawns, ages, animates and collects pickups. Returns what was collected this frame: [{ type, slot }].
// context: { slots (active player slots, in player order), houses, flower, enemies, camera, canHeal(),
// allowShield (false where Bloom Shield never appears) }.
// Each pickup goes to the first player touching it and is removed at once, so it is only ever collected once.
// A petal is left on the ground while the team already has every life.
export function updatePickups(delta, context) {
  const players = context.slots.map((slot) => slot.player);
  const collected = [];

  spawnTimer -= delta;
  if (spawnTimer <= 0) spawnTimer = trySpawn({ ...context, players });

  for (const pickup of [...pickups]) {
    pickup.timeLeft -= delta;
    if (pickup.timeLeft <= 0) {
      removePickup(pickup);
      continue;
    }

    const { group, icon } = pickup;
    const collector = context.slots.find(({ player }) => {
      const distance = Math.hypot(player.position.x - group.position.x, player.position.y - group.position.y);
      return distance < PICKUP_RADIUS + (player.userData.collisionRadius ?? 0);
    });
    const collectable =
      (pickup.type !== 'petal' || context.canHeal()) && (pickup.type !== 'shield' || context.allowShield);
    if (collector && collectable) {
      collected.push({ type: pickup.type, slot: collector });
      removePickup(pickup);
      continue;
    }

    pickup.age += delta;
    icon.position.z = ICON_Z + Math.sin(pickup.age * BOB_SPEED) * BOB_HEIGHT;
    icon.rotation.z = pickup.age * SPIN_SPEED;
    group.visible = pickup.timeLeft > PICKUP_BLINK_TIME || Math.floor(pickup.timeLeft * BLINK_RATE) % 2 === 0;
  }

  return collected;
}

// Bloom Shield: collecting it again restarts the full duration (it never adds up)
export function activateShield(flower) {
  shieldTime = SHIELD_TIME;
  const radius = (flower.userData.collisionRadius ?? DOME_FALLBACK_RADIUS - DOME_MARGIN) + DOME_MARGIN;
  dome.scale.setScalar(radius);
  dome.visible = true;
}

// Counts the shield down and animates the dome. Returns true on the frame the shield runs out.
export function updateShield(delta) {
  if (shieldTime === 0) return false;
  shieldTime = Math.max(shieldTime - delta, 0);

  const flicker = shieldTime > SHIELD_WARNING_TIME || Math.floor(shieldTime * BLINK_RATE) % 2 === 0;
  dome.visible = shieldTime > 0 && flicker;
  dome.material.opacity = DOME_OPACITY * (0.8 + 0.2 * Math.sin(shieldTime * 4));
  return shieldTime === 0;
}

export function getShieldTime() {
  return shieldTime;
}

// Nectar Boost: one per player. Collecting it again restarts the full duration; the speed multiplier is
// worked out from the timer each frame, so it can never stack.
export function createBoost() {
  return { timeLeft: 0 };
}

export function activateBoost(boost) {
  boost.timeLeft = BOOST_TIME;
}

export function updateBoost(boost, delta) {
  boost.timeLeft = Math.max(boost.timeLeft - delta, 0);
}

export function getBoostMultiplier(boost) {
  return boost.timeLeft > 0 ? BOOST_MULTIPLIER : 1;
}

export function resetBoost(boost) {
  boost.timeLeft = 0;
}

// Clears every pickup and the shield for a new run (each player's boost is reset with the player)
export function resetPowerUps() {
  for (const pickup of [...pickups]) removePickup(pickup);
  spawnTimer = FIRST_SPAWN;
  shieldTime = 0;
  dome.visible = false;
  dome.material.opacity = DOME_OPACITY;
}
