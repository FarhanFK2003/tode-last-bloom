import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { computeCollisionRadius } from '../collision.js';

const MODEL_PATH = '/models/flower_single.glb';
const MODEL_SCALE = 15;
export const FLOWER_MAX_HEALTH = 20;

// Hit flash: a red glow and a quick squash of the model, fading out over FLASH_DURATION
const FLASH_DURATION = 0.25; // seconds
const FLASH_COLOR = new THREE.Color(0xff2020);
const FLASH_HEIGHT = 0.9; // model height (fraction) at the moment of a hit

// Wilting: colour and height the flower reaches at 0 HP
const WILT_COLOR = new THREE.Color(0x8a7a5a);
const WILT_HEIGHT = 0.85;

// Bloom: warm glow on the flower heads, reaching full strength when the survival timer runs out
const BLOOM_COLOR = new THREE.Color(0xff8fb8);
const BLOOM_STRENGTH = 0.35;
const HEADS_MATERIAL = 'Flowers'; // the model's other material, 'Leaves', doesn't bloom

let health = FLOWER_MAX_HEALTH;
let flashTimer = 0;

let model = null;
let groundOffset = 0; // lift that puts the full-height model's lowest point on the ground
// Each material with the values it was loaded with, so they can always be restored exactly
let materials = [];

// The flower stands at the centre of the map; bees attack it and Tode defends it
export function createFlower() {
  const flower = new THREE.Group();
  flower.position.set(0, 0, 0);

  new GLTFLoader().load(
    MODEL_PATH,
    (gltf) => {
      model = gltf.scene;
      model.rotation.x = Math.PI / 2;
      model.scale.setScalar(MODEL_SCALE);

      // Lift the model so its lowest point rests on the ground (z = 0)
      model.updateMatrixWorld(true);
      const box = new THREE.Box3().setFromObject(model);
      groundOffset = -box.min.z;
      model.position.z = groundOffset;

      // Measured at full size; the visual squash and wilt below never change the collision circle
      flower.userData.collisionRadius = computeCollisionRadius(model);

      const seen = new Set();
      model.traverse((object) => {
        if (!object.isMesh || seen.has(object.material)) return;
        seen.add(object.material);
        materials.push({
          material: object.material,
          isHead: object.material.name === HEADS_MATERIAL,
          color: object.material.color.clone(),
          emissive: object.material.emissive.clone(),
        });
      });

      flower.add(model);
    },
    undefined,
    (error) => console.error(`Failed to load ${MODEL_PATH}`, error),
  );

  return flower;
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

// Visual only: runs every frame, including after the game ends, so a flash can finish
// and the final wilt or bloom stays on screen. progress goes from 0 (start) to 1 (victory).
export function updateFlower(delta, progress) {
  flashTimer = Math.max(flashTimer - delta, 0);
  applyAppearance(1 - health / FLOWER_MAX_HEALTH, THREE.MathUtils.clamp(progress, 0, 1), flashTimer / FLASH_DURATION);
}

// wilt, bloom and flash each go from 0 (none) to 1 (full)
function applyAppearance(wilt, bloom, flash) {
  if (!model) return;

  // Height: a lasting sag from wilting, times the brief squash of a hit. Only the model's
  // local Y (the world's up axis after its rotation) is scaled, and the lift is scaled to
  // match so the base stays on the ground.
  const height = THREE.MathUtils.lerp(1, WILT_HEIGHT, wilt) * THREE.MathUtils.lerp(1, FLASH_HEIGHT, flash);
  model.scale.set(MODEL_SCALE, MODEL_SCALE * height, MODEL_SCALE);
  model.position.z = groundOffset * height;

  for (const entry of materials) {
    // Health tint on the textured colour
    entry.material.color.copy(entry.color).lerp(WILT_COLOR, wilt);

    // Glow: the bloom on the heads, with the red hit flash drawn over it
    entry.material.emissive.copy(entry.emissive);
    if (entry.isHead) {
      entry.material.emissive.lerp(BLOOM_COLOR, bloom * BLOOM_STRENGTH);
    }
    entry.material.emissive.lerp(FLASH_COLOR, flash);
  }
}

export function resetFlower() {
  health = FLOWER_MAX_HEALTH;
  flashTimer = 0;
  // Back to exactly the loaded colours, glow and size
  applyAppearance(0, 0, 0);
}
