import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

// Ambient wildlife: purely decorative animals. They never take part in gameplay (no collision, obstacles,
// damage or score). The models have no animation clips, so any motion is done here in code.
// Each model is loaded once and prepared as a template; every animal is a clone with its own transforms, sharing
// the template's geometry and materials (which nothing here changes per animal).

const BUTTERFLY_PATH = '/models/Butterfly by Poly by Google - e9NAQQrCbLu.glb';
const RABBIT_PATH = '/models/Rabbit by Poly by Google - dyeBDJxhDwP.glb';

// Sizes, from the models' measured dimensions: the butterfly is 16.3 wide (wingspan) and 12.4 high, so 0.4 gives a
// wingspan of about 6.5; the rabbit is 234 high and 263 long, so 0.035 makes it about 8 high and 9 long
const BUTTERFLY_SCALE = 0.4;
const RABBIT_SCALE = 0.035;

// The butterfly's texture is 2048 x 2048, far more than a creature a few pixels wide needs. It is redrawn once at
// this size when loaded (the file itself is unchanged), which cuts its graphics memory from about 21 MB to under 1 MB.
const BUTTERFLY_TEXTURE_SIZE = 256;

// Butterfly flight
const FLAP_SPEED = 16; // radians per second (about 2.5 beats a second)
const FLAP_CLOSE = 0.45; // the wings narrow by up to this fraction of their span at each beat
const LOOP_SPEED = 0.45; // radians per second along the looping path
const LOOP_RADIUS = [14, 9]; // the loop's half-width and half-depth (a gentle figure of eight)
const FLIGHT_HEIGHT = 10; // average height above the ground
const FLIGHT_BOB = 2; // up and down around it
const MAX_STEP = 0.1; // seconds; a longer frame is treated as this long

// Rabbit movement. The model is one solid piece (no legs or ears of its own, no clips), so it moves as a whole:
// it rests, breathing, then hops a few times along its path, turning round at the ends. All changes of shape are
// small and start and end at the rabbit's normal shape, so one movement flows into the next without a jump.
const RABBIT_IDLE = [1.5, 4]; // seconds resting between bursts of hops
const RABBIT_HOPS = [2, 4]; // hops per burst
const HOP_LENGTH = [6, 8];
const HOP_TIME = 0.32; // seconds in the air
const HOP_HEIGHT = 2.5;
const CROUCH_TIME = 0.1; // the dip before the first hop of a burst
const LAND_TIME = 0.14; // the dip after each landing
const TURN_TIME = 0.35;
const BREATH = 0.02; // height change while breathing
const BREATH_PERIOD = 1.4; // seconds
const BREATH_FADE = 0.4; // seconds for breathing to ease in and out around each rest
const CROUCH = 0.1; // how much lower a crouch or landing makes it
const STRETCH = 0.06; // how much taller it stretches in the air
const SQUASH_WIDEN = 0.5; // it widens by this share of what it loses in height (and the other way round)
const HOP_TILT = 0.14; // radians (about 8 degrees) nose down at the top of a hop
const RABBIT_IDLE_STATE = 0;
const RABBIT_TURN_STATE = 1;
const RABBIT_CROUCH_STATE = 2;
const RABBIT_AIR_STATE = 3;
const RABBIT_LAND_STATE = 4;

const cache = new Map();

// Loads and prepares a model once; every later call gets the same promise. Resolves to null if it fails to load,
// so a missing animal is simply skipped.
function loadTemplate(path, prepare) {
  if (!cache.has(path)) {
    cache.set(
      path,
      new GLTFLoader()
        .loadAsync(path)
        .then((gltf) => prepare(gltf.scene))
        .catch((error) => {
          console.error(`Failed to load ${path}; that animal is left out`, error);
          return null;
        }),
    );
  }
  return cache.get(path);
}

// Stands a model up (its Y is up; the game's Z is up), scales it, and centres it on its origin across the ground.
// lift: 'base' puts its lowest point at the origin (to stand on something); 'keep' leaves its height as modelled.
// upright: the model is already Z-up, so it isn't turned.
function standUp(model, scale, lift, upright = false) {
  if (!upright) model.rotation.x = Math.PI / 2;
  model.scale.setScalar(scale);
  model.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(model);
  model.position.x -= (box.min.x + box.max.x) / 2;
  model.position.y -= (box.min.y + box.max.y) / 2;
  if (lift === 'base') model.position.z -= box.min.z;
  const root = new THREE.Group();
  root.add(model);
  return root;
}

// Redraws a texture smaller on a canvas, keeping its colour space, wrapping and orientation
function shrinkTexture(texture, size) {
  const image = texture?.image;
  if (!image || !(image.width > size)) return texture;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  canvas.getContext('2d').drawImage(image, 0, 0, size, size);
  const smaller = new THREE.CanvasTexture(canvas);
  smaller.colorSpace = texture.colorSpace;
  smaller.flipY = texture.flipY;
  smaller.wrapS = texture.wrapS;
  smaller.wrapT = texture.wrapT;
  texture.dispose();
  return smaller;
}

function prepareButterfly(scene) {
  scene.traverse((object) => {
    if (object.isMesh && object.material.map) {
      object.material.map = shrinkTexture(object.material.map, BUTTERFLY_TEXTURE_SIZE);
    }
  });
  // The wings: the one part far wider than all the others (both wings are a single part)
  const parts = [];
  scene.traverse((object) => {
    if (object.isMesh) {
      object.geometry.computeBoundingBox();
      const box = object.geometry.boundingBox;
      parts.push({ object, width: box.max.x - box.min.x });
    }
  });
  parts.sort((a, b) => b.width - a.width);
  const wingsAreSeparate = parts.length > 1 && parts[0].width > parts[1].width * 3;
  const wingIndex = wingsAreSeparate ? meshIndex(scene, parts[0].object) : -1;
  return { root: standUp(scene, BUTTERFLY_SCALE, 'keep'), wingIndex };
}

// The rabbit is modelled Z-up, facing -X: it is turned round to face +X (so its heading is simply its direction
// of travel), scaled, and set with its feet on the origin. reach is the furthest any part of it can get across
// the ground from its origin, whichever way it faces and however it is squashed or tilted, so a path can keep the
// whole rabbit clear of something.
function prepareRabbit(scene) {
  scene.rotation.z = Math.PI;
  const root = standUp(scene, RABBIT_SCALE, 'base', true);
  const size = new THREE.Box3().setFromObject(root).getSize(new THREE.Vector3());
  const widest = 1 + CROUCH * SQUASH_WIDEN;
  const reach = Math.hypot(size.x, size.y) / 2 * widest + size.z * (1 + STRETCH) * Math.sin(HOP_TILT);
  return { root, size, reach };
}

// The position of a mesh in traversal order, so the same part can be found again in a clone
function meshIndex(scene, target) {
  let index = -1;
  let count = 0;
  scene.traverse((object) => {
    if (!object.isMesh) return;
    if (object === target) index = count;
    count += 1;
  });
  return index;
}

function meshAt(root, index) {
  let found = null;
  let count = 0;
  root.traverse((object) => {
    if (!object.isMesh) return;
    if (count === index) found = object;
    count += 1;
  });
  return found;
}

export function loadButterfly() {
  return loadTemplate(BUTTERFLY_PATH, prepareButterfly);
}

export function loadRabbit() {
  return loadTemplate(RABBIT_PATH, prepareRabbit);
}

// A butterfly fluttering in a gentle figure of eight around (x, y), bobbing and turning to face where it flies.
// phase spreads several butterflies through their loops. Returns { object, update(delta), reset() }.
export function createButterfly(template, { x, y }, phase) {
  const object = template.root.clone();
  const wings = template.wingIndex >= 0 ? meshAt(object, template.wingIndex) : null;
  const startTime = phase;
  let time = startTime;

  const pose = () => {
    const angle = time * LOOP_SPEED;
    const posX = x + Math.sin(angle) * LOOP_RADIUS[0];
    const posY = y + Math.sin(angle * 2) * LOOP_RADIUS[1];
    object.position.set(posX, posY, FLIGHT_HEIGHT + Math.sin(time * 1.3 + phase) * FLIGHT_BOB);
    // Face the direction of travel: the path's own slope (the model faces -Y once stood up)
    const velocityX = Math.cos(angle) * LOOP_RADIUS[0];
    const velocityY = Math.cos(angle * 2) * 2 * LOOP_RADIUS[1];
    object.rotation.z = Math.atan2(velocityY, velocityX) + Math.PI / 2;
    // Wings close and open across their span; the body is never squashed
    if (wings) wings.scale.x = 1 - FLAP_CLOSE * (0.5 + 0.5 * Math.sin(time * FLAP_SPEED + phase));
  };

  pose();
  return {
    object,
    update(delta) {
      time += Number.isFinite(delta) ? Math.min(Math.max(delta, 0), MAX_STEP) : 0;
      pose();
    },
    reset() {
      time = startTime;
      pose();
    },
  };
}

// A rabbit that rests and hops back and forth along the straight path from `start` to `end` ({ x, y }). Its origin
// never goes past either end, so its body reaches at most template.reach beyond the path. seed fixes its own
// sequence of rests and hops, so each rabbit has its own timing, the same on every run.
// Returns { object, update(delta), reset() }.
export function createRabbit(template, start, end, seed) {
  const object = template.root.clone();
  // Yaw last, so the nose-down tilt is always about the rabbit's own sideways axis
  object.rotation.order = 'ZYX';
  const length = Math.hypot(end.x - start.x, end.y - start.y);
  const directionX = (end.x - start.x) / length;
  const directionY = (end.y - start.y) / length;
  const forwardYaw = Math.atan2(directionY, directionX);

  let randomState = seed;
  const random = () => {
    randomState = (randomState * 1664525 + 1013904223) % 4294967296;
    return randomState / 4294967296;
  };
  const between = ([low, high]) => low + random() * (high - low);

  // State: which movement, how far into it, how long it lasts; where it is along the path and which way it faces
  let state;
  let elapsed;
  let duration;
  let along;
  let heading; // +1 toward end, -1 toward start
  let yaw;
  let turnFrom;
  let hopFrom;
  let hopTo;
  let hopsLeft;

  const room = () => (heading > 0 ? length - along : along);
  const begin = (next, time) => {
    state = next;
    elapsed = 0;
    duration = time;
  };
  const rest = () => begin(RABBIT_IDLE_STATE, between(RABBIT_IDLE));
  const hop = () => {
    hopFrom = along;
    hopTo = along + heading * Math.min(between(HOP_LENGTH), room());
    hopsLeft -= 1;
    begin(RABBIT_AIR_STATE, HOP_TIME);
  };

  // Moves on to the next movement when the current one is finished
  const advance = () => {
    if (state === RABBIT_IDLE_STATE) {
      hopsLeft = Math.round(between(RABBIT_HOPS));
      if (room() < HOP_LENGTH[0]) {
        // At an end of the path: turn round first
        turnFrom = yaw;
        heading = -heading;
        begin(RABBIT_TURN_STATE, TURN_TIME);
      } else {
        begin(RABBIT_CROUCH_STATE, CROUCH_TIME);
      }
    } else if (state === RABBIT_TURN_STATE) {
      yaw = turnFrom + Math.PI;
      begin(RABBIT_CROUCH_STATE, CROUCH_TIME);
    } else if (state === RABBIT_CROUCH_STATE) {
      hop();
    } else if (state === RABBIT_AIR_STATE) {
      along = hopTo;
      begin(RABBIT_LAND_STATE, LAND_TIME);
    } else if (hopsLeft > 0 && room() >= HOP_LENGTH[0]) {
      hop();
    } else {
      rest();
    }
  };

  const pose = () => {
    const progress = elapsed / duration;
    const dip = Math.sin(progress * Math.PI); // 0 at the start and end of a movement, 1 in the middle
    let position = along;
    let lift = 0;
    let height = 1; // the rabbit's height scale
    let tilt = 0;
    let facing = yaw;
    if (state === RABBIT_IDLE_STATE) {
      const fade = Math.min(1, elapsed / BREATH_FADE, (duration - elapsed) / BREATH_FADE);
      height = 1 + BREATH * fade * Math.sin((elapsed / BREATH_PERIOD) * Math.PI * 2);
    } else if (state === RABBIT_TURN_STATE) {
      facing = turnFrom + Math.PI * progress * progress * (3 - 2 * progress);
    } else if (state === RABBIT_AIR_STATE) {
      position = hopFrom + (hopTo - hopFrom) * progress;
      lift = HOP_HEIGHT * 4 * progress * (1 - progress);
      height = 1 + STRETCH * dip;
      tilt = HOP_TILT * dip;
    } else {
      // Crouch before a hop, or landing: a quick dip down and back
      height = 1 - CROUCH * dip;
    }
    // Breathing swells it a little all round; a crouch or landing spreads it as it flattens
    const width = state === RABBIT_IDLE_STATE ? 1 + (height - 1) * SQUASH_WIDEN : 1 + (1 - height) * SQUASH_WIDEN;
    object.position.set(start.x + directionX * position, start.y + directionY * position, lift);
    object.rotation.set(0, tilt, facing);
    object.scale.set(width, width, height);
  };

  const reset = () => {
    randomState = seed;
    along = length * between([0.2, 0.8]);
    heading = random() < 0.5 ? 1 : -1;
    yaw = forwardYaw + (heading > 0 ? 0 : Math.PI);
    hopsLeft = 0;
    rest();
    pose();
  };

  reset();
  return {
    object,
    update(delta) {
      let step = Number.isFinite(delta) ? Math.min(Math.max(delta, 0), MAX_STEP) : 0;
      // A frame can finish one movement and start the next
      while (step > 0) {
        const left = duration - elapsed;
        if (step < left) {
          elapsed += step;
          step = 0;
        } else {
          step -= left;
          elapsed = duration;
          advance();
        }
      }
      pose();
    },
    reset,
  };
}
