import * as THREE from 'three';

// The Pond: a lily-pad lagoon in a sheltered wetland, built entirely from simple shapes (no models).
//
//   - A large lagoon on the west side runs from inside the map out past its edge. Its muddy shore is its
//     collision boundary: the water's footprints are exactly the shore's outline. Water is marked
//     userData.water, so it blocks players and walking enemies but flying bees cross it.
//   - A few fallen logs and mossy stones on the meadow are obstacles with footprints matching their shape.
//   - Beyond the map: darker marsh ground, tall reeds and willows to the north and west (the direction the
//     camera faces), and only low reeds to the south and east, so nothing tall stands between camera and play.
//
// Everything is built once with the world and kept for the page session; it is never disposed.
//
// Gentle animation (ripples on the lagoon, bobbing lily pads, swaying reeds) is advanced only by update(delta),
// which the game calls while a level is being played, so it stops when paused or on an end screen; reset()
// puts it back to its starting state. It is purely visual: nothing here affects collision or gameplay.

// Minimum distance between an obstacle's footprint and a protected point; only checked, to warn while developing
const CLEARANCE = 40;

// The lagoon's outline: a main basin with a northern inlet, both running out past the west edge (x = -250).
// Each rectangle is a footprint; together they are exactly the shore's outer edge.
const LAGOON = [
  { minX: -330, maxX: -115, minY: -30, maxY: 100 },
  { minX: -330, maxX: -165, minY: 100, maxY: 150 },
];
// The same outline as a polygon (counter-clockwise), and the water inside it, SHORE_WIDTH in from the edge
const SHORE_OUTLINE = [
  [-330, -30],
  [-115, -30],
  [-115, 100],
  [-165, 100],
  [-165, 150],
  [-330, 150],
];
const SHORE_WIDTH = 6;
const WATER_OUTLINE = [
  [-330, -24],
  [-121, -24],
  [-121, 94],
  [-171, 94],
  [-171, 144],
  [-330, 144],
];
const SHORE_CORNER = 4; // corner rounding: small on the shore, so it stays within its footprint
const WATER_CORNER = 12;

// Heights above the ground, far enough apart that they never flicker against each other
const SHORE_Z = 0.4;
const WATER_Z = 0.8;
const PAD_Z = 1.1;
const MARSH_Z = -1;
const MARSH_SIZE = 4000;

const COLORS = {
  shore: '#7A6A4F',
  water: '#2C8C99',
  waterRim: '#5CC2C2',
  pad: '#4FAE5C',
  blossom: '#FFE3D6',
  blossomCenter: '#F6C453',
  marsh: '#4D7F6E',
  reed: '#6E9E4F',
  cattail: '#7A4E2D',
  bark: '#8A6A48',
  logEnd: '#C9A77C',
  stone: '#8C9A8A',
  willowTrunk: '#6B5236',
  willowLeaves: '#7FA35A',
};

// Lily pads floating on the water ({ x, y, size, turn, blossom })
const LILY_PADS = [
  { x: -150, y: 20, size: 9, turn: 0.4, blossom: true },
  { x: -175, y: 60, size: 7, turn: 2.1 },
  { x: -200, y: 5, size: 11, turn: 4.0 },
  { x: -140, y: 75, size: 6, turn: 1.2 },
  { x: -225, y: 70, size: 8, turn: 5.3, blossom: true },
  { x: -205, y: 125, size: 7, turn: 3.0 },
  { x: -235, y: 30, size: 6, turn: 0.9 },
  { x: -185, y: -10, size: 6, turn: 2.6 },
  { x: -280, y: 90, size: 10, turn: 1.7, blossom: true },
  { x: -300, y: 10, size: 8, turn: 3.6 },
];

// Obstacles on the meadow, clear of the flower's area, the pickup ring (90 from the centre), the starts,
// the bees' diagonal routes and the crab spawn points. Logs lie along an axis, so their footprint is exact.
const LOGS = [
  { x: 60, y: 175, length: 60, along: 'x' },
  { x: 185, y: -70, length: 50, along: 'y' },
  { x: -60, y: -190, length: 56, along: 'x' },
];
const LOG_RADIUS = 6;
const STONES = [
  { x: 150, y: 60, size: 14 },
  { x: -110, y: 205, size: 13 },
];
const STONE_HEIGHT = 0.6; // stones are flattened to this fraction of their width
const STONE_FOOTPRINT = 0.85; // a round stone's rectangle, trimmed so its corners stay close to the stone

// Scenery beyond the map edge (x/y = +-250): reed beds and willows. Tall ones only north and west.
const WILLOWS = [
  { x: -300, y: 265 },
  { x: -70, y: 305 },
  { x: 190, y: 290 },
  { x: -330, y: -120 },
];
const REED_BEDS = [
  // north edge, tall
  { minX: -330, maxX: 330, minY: 262, maxY: 320, count: 150, height: [18, 30] },
  // west edge beyond the lagoon and south of it, tall
  { minX: -340, maxX: -262, minY: -330, maxY: -40, count: 60, height: [18, 28] },
  { minX: -340, maxX: -262, minY: 160, maxY: 262, count: 30, height: [18, 28] },
  // the lagoon's own shore corners, inside its footprint
  { minX: -128, maxX: -116, minY: -29, maxY: -18, count: 8, height: [10, 16] },
  { minX: -128, maxX: -116, minY: 88, maxY: 99, count: 8, height: [10, 16] },
  { minX: -178, maxX: -166, minY: 138, maxY: 149, count: 8, height: [10, 16] },
  // south and east edges, low so they never hide the play
  { minX: -250, maxX: 300, minY: -300, maxY: -262, count: 70, height: [5, 8] },
  { minX: 262, maxX: 300, minY: -250, maxY: 262, count: 60, height: [5, 8] },
];
const CATTAIL_SHARE = 0.25; // fraction of reeds topped with a cattail

// Ripples: a few rings that grow and fade on the water, one at a time per ring, at spots well inside the water
const RIPPLE_COUNT = 4;
const RIPPLE_TIME = 3; // seconds from appearing to vanishing
const RIPPLE_START_RADIUS = 3;
const RIPPLE_END_RADIUS = 18; // every spot below is at least this far inside the water's edge
const RIPPLE_OPACITY = 0.45;
const RIPPLE_GAP = [0.5, 2.5]; // seconds of calm before a ring ripples again
const RIPPLE_Z = WATER_Z + 0.1; // on the water, under the lily pads
const RIPPLE_SPOTS = [
  [-150, 40],
  [-195, 25],
  [-230, 80],
  [-180, -5],
  [-210, 120],
  [-140, 70],
  [-260, 40],
  [-290, 110],
];

// Lily pads turn a little back and forth and rise and fall very slightly
const PAD_WOBBLE = 0.08; // radians
const PAD_RISE = 0.2; // units
// Reeds lean with the breeze: their tips move up to REED_SWAY units, slowly, each a little out of step
const REED_SWAY = 1.6;
const REED_SWAY_SPEED = 1.2; // radians per second

// Small seeded random numbers, so the scenery is the same every time the page loads
function createRandom(seed) {
  let state = seed;
  return () => {
    state = (state * 1664525 + 1013904223) % 4294967296;
    return state / 4294967296;
  };
}

// Returns the Pond's obstacles, plus update(delta) and reset() for its gentle animation
export function createPond(group, mapSize, protectedPoints) {
  const random = createRandom(7);
  const material = (color) => new THREE.MeshStandardMaterial({ color, flatShading: true });
  const flat = (color) => new THREE.MeshBasicMaterial({ color });

  addMarsh(group, flat(COLORS.marsh));
  const obstacles = addLagoon(group, flat);
  const pads = addLilyPads(group, material);
  const swayTime = addReeds(group, material, random);
  const ripples = addRipples(group);
  addWillows(group, material);
  obstacles.push(...LOGS.map((log) => createLog(log, material)));
  obstacles.push(...STONES.map((stone) => createStone(stone, material)));
  for (const obstacle of obstacles) {
    group.add(obstacle);
    const near = protectedPoints.some(
      (point) => obstacle.userData.footprint.distanceToPoint(new THREE.Vector2(point.x, point.y)) < CLEARANCE,
    );
    if (near) console.warn('A Pond obstacle is too close to a start, spawn or the flower', obstacle.position);
  }

  // The animation's own clock, so it only moves while the game advances it
  let time = 0;
  const rippleRandom = createRandom(3);

  const update = (delta) => {
    time += delta;
    swayTime.value = time;
    for (const pad of pads) posePad(pad, time);
    for (const ripple of ripples) updateRipple(ripple, delta, rippleRandom);
  };

  const reset = () => {
    time = 0;
    swayTime.value = 0;
    for (const pad of pads) posePad(pad, 0);
    ripples.forEach((ripple, index) => startRipple(ripple, index));
  };

  reset();
  return { obstacles, update, reset };
}

// Darker marsh ground all around, below the map, so the map no longer floats in empty space
function addMarsh(group, marshMaterial) {
  const marsh = new THREE.Mesh(new THREE.PlaneGeometry(MARSH_SIZE, MARSH_SIZE), marshMaterial);
  marsh.position.z = MARSH_Z;
  group.add(marsh);
}

// A flat shape from a polygon outline, with every corner rounded by `radius`
function roundedShape(points, radius) {
  const shape = new THREE.Shape();
  points.forEach(([x, y], index) => {
    const [prevX, prevY] = points[(index + points.length - 1) % points.length];
    const [nextX, nextY] = points[(index + 1) % points.length];
    const toPrev = new THREE.Vector2(prevX - x, prevY - y).normalize().multiplyScalar(radius);
    const toNext = new THREE.Vector2(nextX - x, nextY - y).normalize().multiplyScalar(radius);
    if (index === 0) shape.moveTo(x + toPrev.x, y + toPrev.y);
    else shape.lineTo(x + toPrev.x, y + toPrev.y);
    shape.quadraticCurveTo(x, y, x + toNext.x, y + toNext.y);
  });
  shape.closePath();
  return shape;
}

// The muddy shore, the water inside it with a lighter rim, and the water's footprints (returned).
// The water obstacles are invisible groups carrying the footprints; the shore and water meshes are scenery.
function addLagoon(group, flat) {
  const shoreShape = roundedShape(SHORE_OUTLINE, SHORE_CORNER);
  const shore = new THREE.Mesh(new THREE.ShapeGeometry(shoreShape), flat(COLORS.shore));
  shore.position.z = SHORE_Z;
  const waterShape = roundedShape(WATER_OUTLINE, WATER_CORNER);
  const water = new THREE.Mesh(new THREE.ShapeGeometry(waterShape), flat(COLORS.water));
  water.position.z = WATER_Z;
  // A thin lighter line just inside the water's edge
  const rim = new THREE.Line(
    new THREE.BufferGeometry().setFromPoints(waterShape.getPoints(8)),
    new THREE.LineBasicMaterial({ color: COLORS.waterRim }),
  );
  rim.position.z = WATER_Z + 0.05;
  group.add(shore, water, rim);

  return LAGOON.map(({ minX, maxX, minY, maxY }) => {
    const area = new THREE.Group();
    area.position.set((minX + maxX) / 2, (minY + maxY) / 2, 0);
    area.userData.footprint = new THREE.Box2(new THREE.Vector2(minX, minY), new THREE.Vector2(maxX, maxY));
    area.userData.water = true;
    return area;
  });
}

// Round pads with a notch, some carrying a cream blossom
function addLilyPads(group, material) {
  const padGeometry = new THREE.CircleGeometry(1, 14, 0.35, Math.PI * 2 - 0.7);
  const padMaterial = material(COLORS.pad);
  const blossomGeometry = new THREE.ConeGeometry(1, 1.2, 6);
  const blossomMaterial = material(COLORS.blossom);
  const centerGeometry = new THREE.SphereGeometry(0.7, 6, 4);
  const centerMaterial = material(COLORS.blossomCenter);

  return LILY_PADS.map(({ x, y, size, turn, blossom }, index) => {
    const pad = new THREE.Mesh(padGeometry, padMaterial);
    pad.scale.setScalar(size);
    pad.position.set(x, y, PAD_Z);
    pad.rotation.z = turn;
    group.add(pad);
    // Each pad moves a little out of step with the others
    const entry = { pad, flower: null, turn, phase: index * 1.7 };
    if (!blossom) return entry;

    // Petals as an upturned cone, with a golden centre
    const flower = new THREE.Group();
    flower.position.set(x + size * 0.2, y, PAD_Z);
    const petals = new THREE.Mesh(blossomGeometry, blossomMaterial);
    petals.scale.set(3.2, 3.2, 3.2);
    petals.rotation.x = -Math.PI / 2; // tip down, opening upward
    petals.position.z = 2;
    const center = new THREE.Mesh(centerGeometry, centerMaterial);
    center.position.z = 3.6;
    flower.add(petals, center);
    group.add(flower);
    entry.flower = flower;
    return entry;
  });
}

// One lily pad (and its blossom) at animation time `time`
function posePad({ pad, flower, turn, phase }, time) {
  pad.rotation.z = turn + Math.sin(time * 0.6 + phase) * PAD_WOBBLE;
  const rise = (Math.sin(time * 1.1 + phase) + 1) * 0.5 * PAD_RISE;
  pad.position.z = PAD_Z + rise;
  if (flower) flower.position.z = PAD_Z + rise;
}

// The ripple pool: rings that are reused forever. Each has its own material because each fades on its own;
// these belong to the Pond's world and, like the rest of it, are never disposed.
function addRipples(group) {
  const geometry = new THREE.RingGeometry(0.85, 1, 24);
  return Array.from({ length: RIPPLE_COUNT }, () => {
    const mesh = new THREE.Mesh(
      geometry,
      new THREE.MeshBasicMaterial({ color: COLORS.waterRim, transparent: true, opacity: 0, depthWrite: false }),
    );
    mesh.position.z = RIPPLE_Z;
    mesh.visible = false;
    group.add(mesh);
    return { mesh, age: 0, spot: 0 };
  });
}

// Back to the calm start: rings wait their turn, one after another, at their own spots
function startRipple(ripple, index) {
  ripple.age = -index * (RIPPLE_TIME / RIPPLE_COUNT) - 0.5;
  ripple.spot = (index * 3) % RIPPLE_SPOTS.length;
  ripple.mesh.visible = false;
}

// A negative age is the calm before the ring appears; then it grows and fades over RIPPLE_TIME
function updateRipple(ripple, delta, random) {
  ripple.age += delta;
  if (ripple.age < 0) return;
  if (ripple.age >= RIPPLE_TIME) {
    ripple.age = -(RIPPLE_GAP[0] + random() * (RIPPLE_GAP[1] - RIPPLE_GAP[0]));
    ripple.spot = Math.floor(random() * RIPPLE_SPOTS.length);
    ripple.mesh.visible = false;
    return;
  }

  const progress = ripple.age / RIPPLE_TIME;
  const [x, y] = RIPPLE_SPOTS[ripple.spot];
  ripple.mesh.position.x = x;
  ripple.mesh.position.y = y;
  ripple.mesh.scale.setScalar(RIPPLE_START_RADIUS + (RIPPLE_END_RADIUS - RIPPLE_START_RADIUS) * progress);
  ripple.mesh.material.opacity = RIPPLE_OPACITY * (1 - progress);
  ripple.mesh.visible = true;
}

// Makes an instanced reed material lean with the breeze in its vertex shader, so every reed sways with no
// per-reed work: the tip moves most, the base not at all, and each reed's position puts it a little out of step.
// `follow` is 0 for the blades (bend along their height) or, for the cattail heads, how far up the blade they sit,
// so they move with it. swayTime is the shared { value } uniform that drives every reed.
function addSway(material, swayTime, follow) {
  material.onBeforeCompile = (shader) => {
    shader.uniforms.swayTime = swayTime;
    shader.uniforms.swayFollow = { value: follow };
    shader.vertexShader = `uniform float swayTime;\nuniform float swayFollow;\n${shader.vertexShader}`.replace(
      '#include <begin_vertex>',
      `#include <begin_vertex>
      #ifdef USE_INSTANCING
        float swayPhase = instanceMatrix[3].x * 0.05 + instanceMatrix[3].y * 0.07;
        float swayBend = swayFollow > 0.0 ? swayFollow : (position.y + 0.5) * (position.y + 0.5);
        transformed.x += sin(swayTime * ${REED_SWAY_SPEED.toFixed(2)} + swayPhase) * swayBend * ${REED_SWAY.toFixed(2)};
      #endif`,
    );
  };
}

// Reed beds as two instanced meshes (blades and cattail heads), so hundreds of reeds cost two draw calls
function addReeds(group, material, random) {
  const total = REED_BEDS.reduce((sum, bed) => sum + bed.count, 0);
  const bladeMaterial = material(COLORS.reed);
  const headMaterial = material(COLORS.cattail);
  // One time value drives the sway of every blade and head
  const swayTime = { value: 0 };
  addSway(bladeMaterial, swayTime, 0);
  // A head sits 85 % up its blade (0.35 along the cone's -0.5..0.5 height), where the bend is 0.85 squared;
  // its own instance is 1.1 times as wide, so its sideways movement is divided by that
  addSway(headMaterial, swayTime, (0.85 * 0.85) / 1.1);
  const blades = new THREE.InstancedMesh(new THREE.ConeGeometry(0.8, 1, 4), bladeMaterial, total);
  const heads = new THREE.InstancedMesh(new THREE.CylinderGeometry(1, 1, 1, 6), headMaterial, total);
  const matrix = new THREE.Matrix4();
  const position = new THREE.Vector3();
  const rotation = new THREE.Quaternion();
  const scale = new THREE.Vector3();
  const upright = new THREE.Euler();
  let headCount = 0;
  let index = 0;

  for (const bed of REED_BEDS) {
    for (let i = 0; i < bed.count; i++) {
      const x = bed.minX + random() * (bed.maxX - bed.minX);
      const y = bed.minY + random() * (bed.maxY - bed.minY);
      const height = bed.height[0] + random() * (bed.height[1] - bed.height[0]);
      // Cones stand along their local Y; turn them up the world Z axis, leaning a little
      upright.set(Math.PI / 2 + (random() - 0.5) * 0.3, 0, (random() - 0.5) * 0.3);
      rotation.setFromEuler(upright);
      position.set(x, y, height / 2);
      scale.set(1, height, 1);
      blades.setMatrixAt(index, matrix.compose(position, rotation, scale));
      index += 1;

      if (random() < CATTAIL_SHARE) {
        position.set(x, y, height * 0.85);
        scale.set(1.1, 4, 1.1);
        heads.setMatrixAt(headCount, matrix.compose(position, rotation, scale));
        headCount += 1;
      }
    }
  }
  heads.count = headCount;
  // The reeds are spread all around the map; never cull them as one object
  blades.frustumCulled = false;
  heads.frustumCulled = false;
  group.add(blades, heads);
  return swayTime;
}

// Weeping willows: a trunk, a rounded crown and drooping strands hanging around it
function addWillows(group, material) {
  const trunkGeometry = new THREE.CylinderGeometry(3, 5, 30, 6);
  const crownGeometry = new THREE.SphereGeometry(1, 10, 6);
  const strandGeometry = new THREE.ConeGeometry(2.6, 22, 4);
  const trunkMaterial = material(COLORS.willowTrunk);
  const leafMaterial = material(COLORS.willowLeaves);

  for (const { x, y } of WILLOWS) {
    const willow = new THREE.Group();
    willow.position.set(x, y, 0);
    const trunk = new THREE.Mesh(trunkGeometry, trunkMaterial);
    trunk.rotation.x = Math.PI / 2;
    trunk.position.z = 15;
    const crown = new THREE.Mesh(crownGeometry, leafMaterial);
    crown.scale.set(26, 26, 14);
    crown.position.z = 36;
    willow.add(trunk, crown);
    for (let i = 0; i < 12; i++) {
      const angle = (i / 12) * Math.PI * 2;
      const strand = new THREE.Mesh(strandGeometry, leafMaterial);
      strand.rotation.x = -Math.PI / 2; // the cone points along its local Y: turn the tip to point down
      strand.position.set(Math.cos(angle) * 22, Math.sin(angle) * 22, 26);
      willow.add(strand);
    }
    group.add(willow);
  }
}

// A fallen log lying along x or y; seen from above it is exactly its rectangular footprint
function createLog({ x, y, length, along }, material) {
  const log = new THREE.Group();
  log.position.set(x, y, 0);
  const bark = material(COLORS.bark);
  const cut = material(COLORS.logEnd);
  // Cylinder groups: side, top cap, bottom cap
  const mesh = new THREE.Mesh(new THREE.CylinderGeometry(LOG_RADIUS, LOG_RADIUS, length, 8), [bark, cut, cut]);
  // The cylinder runs along its local Y: leave it along y, or turn it to run along x
  if (along === 'x') mesh.rotation.z = Math.PI / 2;
  mesh.position.z = LOG_RADIUS;
  log.add(mesh);

  const halfX = along === 'x' ? length / 2 : LOG_RADIUS;
  const halfY = along === 'x' ? LOG_RADIUS : length / 2;
  log.userData.footprint = new THREE.Box2(
    new THREE.Vector2(x - halfX, y - halfY),
    new THREE.Vector2(x + halfX, y + halfY),
  );
  return log;
}

// A mossy boulder resting on the meadow
function createStone({ x, y, size }, material) {
  const stone = new THREE.Group();
  stone.position.set(x, y, 0);
  const mesh = new THREE.Mesh(new THREE.DodecahedronGeometry(1), material(COLORS.stone));
  mesh.scale.set(size, size * 0.9, size * STONE_HEIGHT);
  mesh.rotation.z = (x + y) * 0.01;
  mesh.position.z = size * STONE_HEIGHT * 0.6;
  stone.add(mesh);

  stone.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(mesh);
  const center = new THREE.Vector2((box.min.x + box.max.x) / 2, (box.min.y + box.max.y) / 2);
  const extent = new THREE.Vector2(box.max.x - box.min.x, box.max.y - box.min.y);
  const half = extent.multiplyScalar(STONE_FOOTPRINT / 2);
  stone.userData.footprint = new THREE.Box2(center.clone().sub(half), center.clone().add(half));
  return stone;
}
