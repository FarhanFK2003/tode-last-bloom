import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

// The Coast's features around its sandy ground: the sea and shoreline beyond the map edge, a lighthouse
// on its rock out in the sea, and a fixed arrangement of rocks and palm trees to hop around.
// The sea, shoreline and lighthouse are scenery outside the map, which the Coast's map edge keeps players inside,
// so they never block anything. Rocks and palms are obstacles with a rectangular footprint like the houses.

// Shoreline: flat layers under the edge of the map, each a little lower so they never fight for depth
const SEA_SIZE = 4000;
const SHORE = [
  { margin: 6, z: -1, color: '#F4FBFF' }, // a thin line of foam
  { margin: 50, z: -2, color: '#5FD3E0' }, // shallow water
  { margin: SEA_SIZE, z: -3, color: '#2E9FD8' }, // the open sea, to the horizon
];

// The lighthouse stands on its rock in the sea just past the north-west corner (the direction the camera faces).
// Its rock is about 24 units wide in the model, so at this scale it stays outside the 500 x 500 map.
const LIGHTHOUSE_PATH = '/models/Lighthouse scene by Poly by Google - 1O6BWfUB6ta.glb';
const LIGHTHOUSE_SCALE = 3.5;
const LIGHTHOUSE_POSITION = new THREE.Vector2(-300, 300);

// Obstacles at fixed spots, all well away from the flower and its ring of pickup spots (90 from the centre),
// the player starts and the bee spawn corners, with open lanes between them
const ROCKS = [
  { x: -175, y: 55, size: 20 },
  { x: 165, y: 70, size: 24 },
  { x: 40, y: -185, size: 16 },
  { x: -60, y: 175, size: 18 },
];
const PALMS = [
  { x: -140, y: -120 },
  { x: 125, y: -135 },
  { x: 150, y: 175 },
  { x: -150, y: 135 },
];

const ROCK_COLOR = '#A9A39A';
const ROCK_HEIGHT = 0.6; // rocks are flattened to this fraction of their width
// A rock is round but its footprint is a rectangle; trimming the rectangle a little keeps its corners
// from blocking far outside the rock, while its sides still meet the rock's edge
const ROCK_FOOTPRINT = 0.85;

const TRUNK_COLOR = '#A0703C';
const FROND_COLOR = '#3DAA4F';
const COCONUT_COLOR = '#6B4423';
const TRUNK_HEIGHT = 34;
const TRUNK_RADIUS = 3.5; // at the base; only the trunk blocks, the leaves are high above the players
const FRONDS = 6;

// Minimum distance between an obstacle's footprint and a protected point; only checked, to warn while developing
const CLEARANCE = 40;

export function createCoast(group, mapSize, protectedPoints) {
  addShoreline(group, mapSize);
  addLighthouse(group);

  const obstacles = [
    ...ROCKS.map((rock) => createRock(rock)),
    ...PALMS.map((palm) => createPalm(palm)),
  ];
  for (const obstacle of obstacles) {
    group.add(obstacle);
    const near = protectedPoints.some(
      (point) => obstacle.userData.footprint.distanceToPoint(new THREE.Vector2(point.x, point.y)) < CLEARANCE,
    );
    if (near) console.warn('A Coast obstacle is too close to a start, spawn or the flower', obstacle.position);
  }
  return obstacles;
}

function addShoreline(group, mapSize) {
  for (const { margin, z, color } of SHORE) {
    const size = margin === SEA_SIZE ? SEA_SIZE : mapSize + margin * 2;
    const layer = new THREE.Mesh(new THREE.PlaneGeometry(size, size), new THREE.MeshBasicMaterial({ color }));
    layer.position.z = z;
    group.add(layer);
  }
}

// Scenery only. If the model can't be loaded the Coast is simply played without it.
function addLighthouse(group) {
  new GLTFLoader().load(
    LIGHTHOUSE_PATH,
    (gltf) => {
      const model = gltf.scene;
      model.rotation.x = Math.PI / 2;
      model.scale.setScalar(LIGHTHOUSE_SCALE);
      // The rock's lower part sits below the sea, so the lighthouse rises out of the water
      model.position.set(LIGHTHOUSE_POSITION.x, LIGHTHOUSE_POSITION.y, 0);
      group.add(model);
    },
    undefined,
    (error) => console.error(`Failed to load ${LIGHTHOUSE_PATH}`, error),
  );
}

// The footprint of an obstacle: its ground-level bounding rectangle, optionally trimmed towards its centre
function setFootprint(obstacle, part, scale = 1) {
  obstacle.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(part);
  const footprint = new THREE.Box2(new THREE.Vector2(box.min.x, box.min.y), new THREE.Vector2(box.max.x, box.max.y));
  const center = footprint.getCenter(new THREE.Vector2());
  const halfSize = footprint.getSize(new THREE.Vector2()).multiplyScalar(scale / 2);
  obstacle.userData.footprint = new THREE.Box2(center.clone().sub(halfSize), center.clone().add(halfSize));
}

// A low-poly boulder resting on the sand
function createRock({ x, y, size }) {
  const rock = new THREE.Group();
  rock.position.set(x, y, 0);
  const mesh = new THREE.Mesh(
    new THREE.DodecahedronGeometry(1),
    new THREE.MeshStandardMaterial({ color: ROCK_COLOR, flatShading: true }),
  );
  mesh.scale.set(size, size * 0.9, size * ROCK_HEIGHT);
  mesh.rotation.z = (x + y) * 0.01; // a different turn for each rock
  mesh.position.z = size * ROCK_HEIGHT * 0.6; // mostly above the sand, its base slightly sunk in
  rock.add(mesh);
  setFootprint(rock, mesh, ROCK_FOOTPRINT);
  return rock;
}

// A palm tree: a tapering trunk with a crown of leaves and a few coconuts
function createPalm({ x, y }) {
  const palm = new THREE.Group();
  palm.position.set(x, y, 0);

  const trunk = new THREE.Mesh(
    new THREE.CylinderGeometry(TRUNK_RADIUS * 0.6, TRUNK_RADIUS, TRUNK_HEIGHT, 6),
    new THREE.MeshStandardMaterial({ color: TRUNK_COLOR, flatShading: true }),
  );
  trunk.rotation.x = Math.PI / 2; // the cylinder stands along its local Y; turn it up the world Z axis
  trunk.position.z = TRUNK_HEIGHT / 2;
  palm.add(trunk);

  const frondMaterial = new THREE.MeshStandardMaterial({ color: FROND_COLOR, flatShading: true });
  const frondGeometry = new THREE.BoxGeometry(18, 5, 1);
  frondGeometry.translate(9, 0, 0); // pivot at the leaf's base, so it fans out from the top of the trunk
  for (let i = 0; i < FRONDS; i++) {
    const frond = new THREE.Mesh(frondGeometry, frondMaterial);
    frond.position.z = TRUNK_HEIGHT;
    frond.rotation.set(0, 0.35, (i / FRONDS) * Math.PI * 2, 'ZYX'); // spread around, drooping a little
    palm.add(frond);
  }

  const coconutMaterial = new THREE.MeshStandardMaterial({ color: COCONUT_COLOR, flatShading: true });
  const coconutGeometry = new THREE.IcosahedronGeometry(2);
  for (let i = 0; i < 3; i++) {
    const coconut = new THREE.Mesh(coconutGeometry, coconutMaterial);
    const angle = (i / 3) * Math.PI * 2;
    coconut.position.set(Math.cos(angle) * 2.5, Math.sin(angle) * 2.5, TRUNK_HEIGHT - 2);
    palm.add(coconut);
  }

  // Only the trunk's base blocks movement
  palm.userData.footprint = new THREE.Box2(
    new THREE.Vector2(x - TRUNK_RADIUS, y - TRUNK_RADIUS),
    new THREE.Vector2(x + TRUNK_RADIUS, y + TRUNK_RADIUS),
  );
  return palm;
}
