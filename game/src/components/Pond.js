import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

// The Pond's features on its grassy ground: a pond on a raised, square bank to the west of the flower,
// and spiky trees standing in pairs beside the bees' routes in from the corners.
// Both are obstacles. Their models load once, when the world is built; each obstacle is added to the
// returned array as soon as its model is ready (as the houses are), so if a model fails to load
// the Pond is played without it.

// The pond model is a square block of land with straight dirt sides, a grassy top, a sunken pool, rocks and a tree.
// Its whole square is its footprint, which matches its visible sides exactly.
// It sits off the bees' diagonal routes, with a wide grassy gap to the map edge so nobody gets boxed in.
const POND_PATH = '/models/Pond by jeremy - cYUMQWc-BOV.glb';
const POND_SCALE = 0.5; // about 100 x 100, with its tree reaching about 37 high
const POND_POSITION = { x: -160, y: 40 };

// Spiky trees: a narrow trunk under wide spikes. Their footprint covers whatever is below FOOTPRINT_HEIGHT,
// so it follows the spikes at Tode's height rather than just the trunk.
const SPIKES_PATH = '/models/Tree Spikes by Quaternius - YCCpJ6jvf4.glb';
const SPIKES_SCALE = 7; // about 31 high
const FOOTPRINT_HEIGHT = 15;
// Pairs beside each diagonal from a bee corner to the flower, leaving a gap the bees can fly through,
// plus one north of the flower. All are far outside the ring of pickup spots (90 from the centre).
const SPIKES = [
  { x: 110, y: 150, turn: 0 },
  { x: 150, y: 110, turn: 1 },
  { x: 150, y: -80, turn: 2 },
  { x: 80, y: -150, turn: 3 },
  { x: -150, y: -90, turn: 1 },
  { x: -90, y: -160, turn: 0 },
  { x: -70, y: 170, turn: 2 },
];

// Minimum distance between an obstacle's footprint and a protected point; only checked, to warn while developing
const CLEARANCE = 40;

const vertex = new THREE.Vector3();

export function createPond(group, mapSize, protectedPoints) {
  const obstacles = [];
  const loader = new GLTFLoader();

  const place = (obstacle) => {
    group.add(obstacle);
    obstacles.push(obstacle);
    const near = protectedPoints.some(
      (point) => obstacle.userData.footprint.distanceToPoint(new THREE.Vector2(point.x, point.y)) < CLEARANCE,
    );
    if (near) console.warn('A Pond obstacle is too close to a start, spawn or the flower', obstacle.position);
  };

  loader.load(
    POND_PATH,
    (gltf) => place(prepare(gltf.scene, POND_SCALE, POND_POSITION, 0, Infinity)),
    undefined,
    (error) => console.error(`Failed to load ${POND_PATH}`, error),
  );

  // The trees are copies of one loaded model and share its geometry, materials and texture
  loader.load(
    SPIKES_PATH,
    (gltf) => {
      for (const { x, y, turn } of SPIKES) {
        place(prepare(gltf.scene.clone(), SPIKES_SCALE, { x, y }, turn, FOOTPRINT_HEIGHT));
      }
    },
    undefined,
    (error) => console.error(`Failed to load ${SPIKES_PATH}`, error),
  );

  return obstacles;
}

// Stands a model up in the world (Z up), turned by `turn` quarter turns so its footprint stays a tight
// axis-aligned rectangle, scaled, resting on the ground at (x, y), with its footprint measured
function prepare(model, scale, { x, y }, turn, footprintHeight) {
  model.rotation.set(Math.PI / 2, (turn * Math.PI) / 2, 0);
  model.scale.setScalar(scale);
  model.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(model);
  model.position.set(x - (box.min.x + box.max.x) / 2, y - (box.min.y + box.max.y) / 2, -box.min.z);
  model.userData.footprint = computeFootprint(model, footprintHeight);
  return model;
}

// Rectangle on the ground (XY) plane covering the model's vertices up to `height` above the ground
function computeFootprint(model, height) {
  model.updateMatrixWorld(true);
  const footprint = new THREE.Box2();
  model.traverse((object) => {
    if (!object.isMesh) return;
    const count = object.geometry.attributes.position.count;
    for (let i = 0; i < count; i++) {
      object.getVertexPosition(i, vertex).applyMatrix4(object.matrixWorld);
      if (vertex.z <= height) footprint.expandByPoint(new THREE.Vector2(vertex.x, vertex.y));
    }
  });
  return footprint;
}
