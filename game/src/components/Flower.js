import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { computeCollisionRadius } from '../collision.js';

// The collision circle still comes from the original flower model, measured exactly as before, so bites,
// bumps, pickups and the shield dome are unchanged. That model is only measured, never shown.
const MODEL_PATH = '/models/flower_single.glb';
const MODEL_SCALE = 15;
export const FLOWER_MAX_HEALTH = 20;

// Hit flash: a red glow and a quick squash, fading out over FLASH_DURATION. The petals and centre glow most;
// the stem and leaves only a little, so the flower stays readable rather than a solid red shape.
const FLASH_DURATION = 0.25; // seconds
const FLASH_COLOR = new THREE.Color(0xff2020);
const FLASH_HEIGHT = 0.9; // height (fraction) at the moment of a hit
const FLASH_HEAD = 0.6;
const FLASH_STEM = 0.25;

// Wilting: colour and height the flower reaches at 0 HP; the head also nods and the petals droop
const WILT_COLOR = new THREE.Color(0x8a7a5a);
const WILT_HEIGHT = 0.85;
const WILT_NOD = 0.35; // radians the head tips forward
const WILT_DROOP = 0.45; // radians the petals fall

// Bloom: warm glow on the petals and centre, reaching full strength when the survival timer runs out,
// with the petals opening a little wider
const BLOOM_COLOR = new THREE.Color(0xff8fb8);
const BLOOM_STRENGTH = 0.35;
const BLOOM_OPEN = 0.15; // radians

// Idle motion: slow breathing of the head, a gentle sway and the petals stirring, each petal out of step
const BREATH_SPEED = 1.6; // radians per second
const BREATH_SIZE = 0.025;
const SWAY_SPEED = 0.9;
const SWAY_ANGLE = 0.03;
const PETAL_SPEED = 2;
const PETAL_STIR = 0.04;

// The shape, in world units (z is up). The visual flower is about 40 tall with a head about 26 across,
// standing on its own origin at the ground; its collision is the separate, unchanged circle above.
const STEM_HEIGHT = 28;
const HEAD_TILT = 0.12; // the head faces slightly toward the camera's side (south-east)
const PETAL_RINGS = [
  // count, length, width, lift (radians above flat), colour
  { count: 8, length: 12, width: 6, lift: 0.25, color: '#EE6F9E' },
  { count: 7, length: 9.5, width: 5.2, lift: 0.6, color: '#FF95BC' },
  { count: 6, length: 6.5, width: 4, lift: 1.0, color: '#FFC7DA' },
];
const LEAVES = [
  // height on the stem, direction (radians around the stem), length, colour
  { z: 7, turn: 0.4, length: 13, color: '#5FA84A' },
  { z: 11, turn: 2.6, length: 11, color: '#6DB356' },
  { z: 15, turn: 4.4, length: 9, color: '#5FA84A' },
];
const CENTER_DOTS = 8;

let health = FLOWER_MAX_HEALTH;
let flashTimer = 0;
let idleTime = 0;

let flowerParts = null; // { plant, head, petals: [{ pivot, lift, phase }] }
// Each material with its original colour and glow, so they can always be restored exactly.
// isHead: the petals and centre (they bloom and flash strongly); the stem and leaves don't bloom.
const materials = [];

// The flower stands at the centre of the map; bees attack it and Tode defends it
export function createFlower() {
  const flower = new THREE.Group();
  flower.position.set(0, 0, 0);

  flowerParts = buildFlower();
  flower.add(flowerParts.plant);
  applyAppearance(0, 0, 0);

  new GLTFLoader().load(
    MODEL_PATH,
    (gltf) => {
      const model = gltf.scene;
      model.rotation.x = Math.PI / 2;
      model.scale.setScalar(MODEL_SCALE);
      // Measured at full size, exactly as before; only the circle is kept, the model itself is not used
      flower.userData.collisionRadius = computeCollisionRadius(model);
    },
    undefined,
    (error) => console.error(`Failed to load ${MODEL_PATH}`, error),
  );

  return flower;
}

function addMaterial(color, isHead) {
  const material = new THREE.MeshStandardMaterial({ color, roughness: 0.75 });
  materials.push({ material, isHead, color: material.color.clone(), emissive: material.emissive.clone() });
  return material;
}

// Built once from a few shared shapes: a tapered stem, three leaves, three rings of petals and a golden centre
function buildFlower() {
  const plant = new THREE.Group(); // its origin is on the ground, so scaling its height keeps the base down
  const sphere = new THREE.SphereGeometry(1, 16, 10);

  const stemMaterial = addMaterial('#5E9F4A', false);
  const stem = new THREE.Mesh(new THREE.CylinderGeometry(1.1, 2, STEM_HEIGHT, 10), stemMaterial);
  stem.rotation.x = Math.PI / 2; // cylinders stand along their local Y: turn it up the world Z axis
  stem.position.z = STEM_HEIGHT / 2;
  plant.add(stem);

  // Leaves: flattened ellipsoids reaching out from the stem and curving up a little
  const leafMaterials = new Map();
  for (const { z, turn, length, color } of LEAVES) {
    if (!leafMaterials.has(color)) leafMaterials.set(color, addMaterial(color, false));
    const pivot = new THREE.Group();
    pivot.position.z = z;
    pivot.rotation.z = turn;
    const leaf = new THREE.Mesh(sphere, leafMaterials.get(color));
    leaf.scale.set(length / 2, length / 5, 0.6);
    leaf.position.x = length / 2;
    leaf.rotation.y = -0.45; // tip raised
    pivot.add(leaf);
    plant.add(pivot);
  }

  // The head sits on top of the stem, tipped slightly toward the camera
  const head = new THREE.Group();
  head.position.z = STEM_HEIGHT;
  // (a positive X turn tips its face south, a positive Y turn tips it east)
  head.rotation.x = HEAD_TILT;
  head.rotation.y = HEAD_TILT;
  plant.add(head);

  // Petals: each is a flattened ellipsoid whose base sits at the centre, on a pivot that turns it around the
  // head and lifts it; the rings are offset so the petals overlap
  const petalGeometry = sphere.clone();
  petalGeometry.translate(1, 0, 0); // base at the origin, reaching along +X
  const petals = [];
  PETAL_RINGS.forEach(({ count, length, width, lift, color }, ring) => {
    const material = addMaterial(color, true);
    for (let i = 0; i < count; i++) {
      const pivot = new THREE.Group();
      pivot.rotation.order = 'ZYX';
      pivot.rotation.z = ((i + ring * 0.5) / count) * Math.PI * 2;
      const petal = new THREE.Mesh(petalGeometry, material);
      petal.scale.set(length / 2, width / 2, 0.9);
      petal.position.z = ring * 0.6;
      pivot.add(petal);
      head.add(pivot);
      petals.push({ pivot, lift, phase: ring * 1.3 + i * 0.9 });
    }
  });

  // The golden centre with a ring of small darker seeds
  const centerMaterial = addMaterial('#F6C443', true);
  const center = new THREE.Mesh(sphere, centerMaterial);
  center.scale.set(4.6, 4.6, 2.8);
  center.position.z = 2.4;
  head.add(center);
  const seedMaterial = addMaterial('#D99A2B', true);
  const seedGeometry = new THREE.SphereGeometry(0.6, 6, 4);
  for (let i = 0; i < CENTER_DOTS; i++) {
    const angle = (i / CENTER_DOTS) * Math.PI * 2;
    const seed = new THREE.Mesh(seedGeometry, seedMaterial);
    seed.position.set(Math.cos(angle) * 2.6, Math.sin(angle) * 2.6, 4.6);
    head.add(seed);
  }

  return { plant, head, petals };
}

// Returns the health left after the damage
export function damageFlower(amount) {
  health = Math.max(health - amount, 0);
  flashTimer = FLASH_DURATION;
  return health;
}

export function getFlowerHealth() {
  return health;
}

// Visual only: runs every frame while playing and on the end screens (not while paused or on the menu),
// so a flash can finish and the final wilt or bloom stays on screen. progress goes from 0 (start) to 1 (victory).
export function updateFlower(delta, progress) {
  flashTimer = Math.max(flashTimer - delta, 0);
  idleTime += delta;
  applyAppearance(1 - health / FLOWER_MAX_HEALTH, THREE.MathUtils.clamp(progress, 0, 1), flashTimer / FLASH_DURATION);
}

// wilt, bloom and flash each go from 0 (none) to 1 (full); idleTime drives the gentle idle motion
function applyAppearance(wilt, bloom, flash) {
  const { plant, head, petals } = flowerParts;

  // Height: a lasting sag from wilting, times the brief squash of a hit. The plant stands on its own origin at
  // the ground, so only its height is scaled.
  const height = THREE.MathUtils.lerp(1, WILT_HEIGHT, wilt) * THREE.MathUtils.lerp(1, FLASH_HEIGHT, flash);
  plant.scale.set(1, 1, height);

  // The head breathes and sways, and nods forward as the flower wilts
  const breath = 1 + Math.sin(idleTime * BREATH_SPEED) * BREATH_SIZE;
  head.scale.setScalar(breath);
  head.rotation.x = HEAD_TILT + wilt * WILT_NOD + Math.sin(idleTime * SWAY_SPEED) * SWAY_ANGLE;
  head.rotation.y = HEAD_TILT + Math.sin(idleTime * SWAY_SPEED * 0.7 + 1) * SWAY_ANGLE;

  // Petals: lifted to their ring's angle, opening a little with the bloom, drooping with the wilt, and stirring
  // (rotating about Y turns +X toward -Z, so a negative angle lifts a petal)
  for (const { pivot, lift, phase } of petals) {
    const stir = Math.sin(idleTime * PETAL_SPEED + phase) * PETAL_STIR;
    pivot.rotation.y = -(lift - bloom * BLOOM_OPEN - wilt * WILT_DROOP + stir);
  }

  for (const entry of materials) {
    // Health tint on the colour
    entry.material.color.copy(entry.color).lerp(WILT_COLOR, wilt);

    // Glow: the bloom on the petals and centre, with the red hit flash drawn over everything
    entry.material.emissive.copy(entry.emissive);
    if (entry.isHead) {
      entry.material.emissive.lerp(BLOOM_COLOR, bloom * BLOOM_STRENGTH);
    }
    entry.material.emissive.lerp(FLASH_COLOR, flash * (entry.isHead ? FLASH_HEAD : FLASH_STEM));
  }
}

export function resetFlower() {
  health = FLOWER_MAX_HEALTH;
  flashTimer = 0;
  idleTime = 0;
  // Back to exactly the original colours, glow, size and pose
  applyAppearance(0, 0, 0);
}
