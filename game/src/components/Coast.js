import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

// The Coast's features around its sandy ground: the sea and shoreline beyond the map edge, a lighthouse
// on its rock out in the sea, and a fixed arrangement of rocks and palm trees to hop around.
// The sea, shoreline and lighthouse are scenery outside the map, which the Coast's map edge keeps players inside,
// so they never block anything. Rocks and palms are obstacles with a rectangular footprint like the houses.
// A single dolphin swims back and forth in the sea off the north edge, now and then leaping out of the water; it is
// scenery too, moved only by update(delta), which the game calls while the level is played, and put back at
// the start of its loop by reset().

// Shoreline: flat layers under the edge of the map, each a little lower so they never fight for depth
const SEA_SIZE = 4000;
const SHORE = [
  { margin: 6, z: -1, color: '#F4FBFF' }, // a thin line of foam
  { margin: 50, z: -2, color: '#5FD3E0' }, // shallow water
  { margin: SEA_SIZE, z: -3, color: '#2E9FD8' }, // the open sea, to the horizon
];

// The lighthouse stands on its rock in the sea just past the north-west corner (the direction the camera faces).
// At this scale everything that shows above the water stays at least 270 out on both axes, well outside the
// 500 x 500 map; only the hidden underwater base of its rock reaches under the map's corner, below the ground.
const LIGHTHOUSE_PATH = '/models/Lighthouse scene by Poly by Google - 1O6BWfUB6ta.glb';
const LIGHTHOUSE_SCALE = 5.25;
const LIGHTHOUSE_POSITION = new THREE.Vector2(-300, 300);
// Raised so its wooden jetty and the foot of its stairs stand above the shallows (z = -2) instead of being hidden
// under them; only the deepest posts and the broad underwater base of its rock stay below the surface
const LIGHTHOUSE_LIFT = 3;
// The model comes with its own patch of sea: a square slab under the rock, with white wave strokes painted on top,
// which would show through the Coast's water once raised. Both are left out when it loads: the slab is every
// triangle whose corners all lie at the corners of the model's footprint, and the waves are every triangle drawn
// from their own small area of the model's texture (no other part of it uses that area).
const LIGHTHOUSE_WAVE_UV = { u: [0.411, 0.418], v: [0.403, 0.501] };

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

// The dolphin. The model (no animation clips) is about 15 long, modelled mid-leap with its nose a little up;
// it is levelled, scaled and redrawn with a smaller texture once when loaded (the file itself is unchanged).
const DOLPHIN_PATH = '/models/Dolphin by Poly by Google - 4Gkg2wLGJ_p.glb';
const DOLPHIN_SCALE = 3; // about 45 long
const DOLPHIN_LEVEL = 0.29; // radians that bring its body level
const DOLPHIN_TEXTURE_SIZE = 256; // its texture is 2048 x 2048, far more than this distant animal needs
const DOLPHIN_SEED = 17;
// Its route: back and forth along the north edge, in the open sea just beyond the shallows (which end 300 out),
// on a long, flat loop: east along its near side, west along its far side, turning smoothly at each end. That
// keeps it in view whenever the play is in the north half, at least 285 out (the map ends at 250) and well east
// of the lighthouse (whose visible part ends at x = -271).
const ROUTE_CENTRE = new THREE.Vector2(20, 330);
const ROUTE_HALF_LENGTH = 190; // east and west of the centre: x from -170 to 210
const ROUTE_HALF_WIDTH = 20; // north and south of it: y from 310 to 350
const ROUTE_SAMPLES = 720; // points along the loop, joined by straight steps of about 1.2 units
const SWIM_SPEED = 40; // units per second, under water or leaping
const LEAP_GAP = [4, 8]; // seconds under water between leaps
const LEAP_TIME = 2.6; // seconds from leaving the water to diving back in
const LEAP_HEIGHT = 15; // the body's centre at the top of a leap, above the water
const LEAP_DEPTH = 18; // the body's centre at the start and end of a leap, below the water (deep enough to hide)
const WATER_LEVEL = -2; // the shallow water's surface; the open sea is just below it
// A ring of foam spreads and fades where the dolphin's nose breaks the surface on the way up, and where it
// meets the surface again diving back in
const SPLASH_TIME = 1.2;
const SPLASH_RADIUS = [3, 20];
const SPLASH_OPACITY = 0.6;
const SPLASH_LIFT = 0.1; // just above the water it lies on, so the two never flicker
// The nose tip in the dolphin's own frame (it faces -Y), used until the model has loaded and its real tip is known
const DEFAULT_NOSE = new THREE.Vector3(0, -22, 0);

// Beach and sea details along the south, east and west sides (the north has its lighthouse and dolphin). There is
// no sand beyond the map: past its edge lie the foam line (250 to 256 out, z = -1) and the shallows (to 300 out,
// z = -2). So shells, starfish and pebbles lie in small clusters on the foam line, a rowing boat floats in the
// east shallows and a sea turtle swims in the south ones.
// All of it is scenery, never obstacles; everything stays outside the map and at least 60 from the corners.
// Small things are drawn as one instanced mesh per shape; the boat and the turtle each move gently.
const FOAM_Z = -1; // the foam line's surface
const SHALLOWS_Z = -2; // the shallows' surface
const DECOR_SEED = 29;
const FOAM_EDGES = [250, 256]; // the foam line's inner edge (the map's edge) and outer edge, out from the centre
// Where on the foam line a small thing of this radius may lie: its centre far enough out that, however it is
// turned, it stays 0.6 clear of the map, and far enough in that it stays on the foam. Something too wide for
// the foam line lies just clear of the map, reaching out over the edge of the shallows.
const foamBand = (radius) => {
  const inner = FOAM_EDGES[0] + 0.6 + radius;
  return [inner, Math.max(inner, FOAM_EDGES[1] + 0.4 - radius)];
};
// Clusters of small things: the side, the point along it (x for south, y for east and west), how far they spread
// along it, and how many of each
const DECOR_CLUSTERS = [
  { side: 'south', along: -95, spread: 22, shells: 4, starfish: 1, pebbles: 0 },
  { side: 'south', along: 28, spread: 24, shells: 3, starfish: 2, pebbles: 0 },
  { side: 'south', along: 135, spread: 14, shells: 3, starfish: 0, pebbles: 2 },
  { side: 'east', along: -108, spread: 16, shells: 3, starfish: 1, pebbles: 0 },
  { side: 'east', along: -22, spread: 15, shells: 2, starfish: 1, pebbles: 0 },
  { side: 'east', along: 95, spread: 14, shells: 3, starfish: 0, pebbles: 0 },
  { side: 'west', along: 128, spread: 16, shells: 3, starfish: 1, pebbles: 0 },
  { side: 'west', along: 38, spread: 18, shells: 2, starfish: 0, pebbles: 6 },
  { side: 'west', along: -12, spread: 16, shells: 4, starfish: 0, pebbles: 0 },
  { side: 'west', along: -82, spread: 17, shells: 2, starfish: 2, pebbles: 0 },
  { side: 'west', along: -150, spread: 16, shells: 1, starfish: 0, pebbles: 5 },
  { side: 'west', along: -178, spread: 8, shells: 2, starfish: 0, pebbles: 0 },
];
// Shells (1.7x their first size), starfish (about 2.1x) and pebbles (1.6x), large enough to read from the play
// camera
const SHELL_SIZE = [1.5, 2.4]; // radius
const STARFISH_SIZE = [4.2, 5.5]; // radius to an arm's tip
const PEBBLE_SIZE = [0.8, 1.6];
const SHELL_COLORS = ['#F6E7D8', '#F2C9B8', '#E9B48F', '#FBEFE3', '#D9A383'];
const STARFISH_COLORS = ['#E8794A', '#F08C5A', '#D9603F', '#F2A65A'];
const PEBBLE_COLORS = ['#A39684', '#8F8576', '#B5AA98'];
// The rowing boat, floating in the east shallows along the shore, rocking very slightly
const BOAT_POSITION = new THREE.Vector2(281, -70);
const BOAT_TURN = 0.12; // radians off lying along the shore
// draught: how deep it sits in the water, enough to stay in it as it rocks while most of its hull shows above
const BOAT = { length: 28, width: 10, height: 4, draught: 0.7 };
const BOAT_SCALE = 1.8; // the whole boat is drawn this much larger: about 50 long and 18 wide
const BOAT_BOB = { height: 0.25, roll: 0.03, pitch: 0.015, speed: 1.6 }; // speed in radians per second
const BOAT_COLORS = { hull: '#3F7FB5', inside: '#8B6A45', seat: '#A9845A', oar: '#C49A6C' };
// The sea turtle, swimming a slow, small loop in the south shallows, paddling as it goes
const TURTLE_LOOP = { x: -40, y: -279, halfLength: 26, halfWidth: 5, seconds: 24 };
const TURTLE_LIFT = -0.3; // its shell's base, just under the water, so its flippers lie on the surface
const TURTLE_PADDLE = { speed: 3, sweep: 0.45 }; // radians per second, and how far the flippers swing
const TURTLE_COLORS = { shell: '#5E7D3A', skin: '#8FA86A' };
const MAX_STEP = 0.1; // seconds; a longer frame is treated as this long

// Returns the Coast's obstacles, plus update(delta) and reset() for the dolphin, the boat and the turtle
export function createCoast(group, mapSize, protectedPoints) {
  addShoreline(group, mapSize);
  addLighthouse(group);
  const dolphin = addDolphin(group, mapSize);
  addBeachDetails(group);
  const boat = addBoat(group);
  const turtle = addTurtle(group);
  const update = (delta) => {
    dolphin.update(delta);
    const step = Number.isFinite(delta) ? Math.min(Math.max(delta, 0), MAX_STEP) : 0;
    boat.update(step);
    turtle.update(step);
  };
  const reset = () => {
    dolphin.reset();
    boat.reset();
    turtle.reset();
  };

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
  return { obstacles, update, reset };
}

// A point `out` from the centre on a side, `along` it (x for south, y for east and west)
function onSide(side, along, out) {
  if (side === 'south') return { x: along, y: -out };
  if (side === 'east') return { x: out, y: along };
  return { x: -out, y: along }; // west
}

// Merges coloured parts into one shape (some shapes share vertices between faces and some don't, so all are
// first given separate vertices per face)
function mergeParts(parts) {
  return mergeGeometries(parts.map((part) => (part.index ? part.toNonIndexed() : part)));
}

// Gives every vertex of a shape one colour, so differently coloured parts can be merged into one shape
function paint(geometry, hex) {
  const color = new THREE.Color(hex);
  const colors = new Float32Array(geometry.attributes.position.count * 3);
  for (let i = 0; i < colors.length; i += 3) color.toArray(colors, i);
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  return geometry;
}

// A flat, five-armed starfish of radius 1, lying on its origin
function createStarfishGeometry() {
  const shape = new THREE.Shape();
  for (let i = 0; i < 10; i++) {
    const angle = (i / 10) * Math.PI * 2 + Math.PI / 2;
    const radius = i % 2 === 0 ? 1 : 0.42;
    const x = Math.cos(angle) * radius;
    const y = Math.sin(angle) * radius;
    if (i === 0) shape.moveTo(x, y);
    else shape.lineTo(x, y);
  }
  shape.closePath();
  const geometry = new THREE.ExtrudeGeometry(shape, {
    depth: 0.2,
    bevelEnabled: true,
    bevelThickness: 0.1,
    bevelSize: 0.08,
    bevelSegments: 1,
  });
  geometry.translate(0, 0, 0.1); // its underside on the ground
  return geometry;
}

// Shells, starfish and pebbles: placed once with a fixed seed, never animated. Three instanced meshes.
function addBeachDetails(group) {
  const random = createRandom(DECOR_SEED);
  const between = ([low, high]) => low + random() * (high - low);
  const pick = (list) => list[Math.floor(random() * list.length)];
  const placed = []; // { x, y, radius } of everything so far, so nothing overlaps

  // A free spot in a cluster for something of this radius, or null if none was found
  const findSpot = (cluster, radius, band) => {
    for (let tries = 0; tries < 30; tries++) {
      const { x, y } = onSide(cluster.side, cluster.along + (random() * 2 - 1) * cluster.spread, between(band));
      if (placed.every((other) => Math.hypot(other.x - x, other.y - y) > other.radius + radius + 0.4)) {
        placed.push({ x, y, radius });
        return { x, y };
      }
    }
    return null;
  };

  const shells = [];
  const starfish = [];
  const pebbles = [];
  for (const cluster of DECOR_CLUSTERS) {
    for (let i = 0; i < cluster.starfish; i++) {
      const size = between(STARFISH_SIZE);
      // Its bevelled edge reaches a little past its arms' tips, so it is spaced and kept clear by that
      const spot = findSpot(cluster, size * 1.1, foamBand(size * 1.1));
      if (spot) starfish.push({ ...spot, size, turn: random() * Math.PI * 2, color: pick(STARFISH_COLORS) });
    }
    for (let i = 0; i < cluster.shells; i++) {
      const size = between(SHELL_SIZE);
      const spot = findSpot(cluster, size, foamBand(size));
      if (spot) shells.push({ ...spot, size, turn: random() * Math.PI * 2, color: pick(SHELL_COLORS) });
    }
    for (let i = 0; i < cluster.pebbles; i++) {
      const size = between(PEBBLE_SIZE);
      const spot = findSpot(cluster, size, foamBand(size));
      if (spot) pebbles.push({ ...spot, size, turn: random() * Math.PI * 2, color: pick(PEBBLE_COLORS) });
    }
  }

  // The shapes, each standing on its origin
  const shellGeometry = new THREE.SphereGeometry(1, 8, 4, 0, Math.PI * 2, 0, Math.PI / 2); // a low dome
  shellGeometry.rotateX(Math.PI / 2);
  shellGeometry.scale(1, 0.85, 0.45);
  const pebbleGeometry = new THREE.IcosahedronGeometry(1, 0);
  pebbleGeometry.scale(1, 0.8, 0.45);
  pebbleGeometry.translate(0, 0, 0.3);

  const matrix = new THREE.Matrix4();
  const position = new THREE.Vector3();
  const rotation = new THREE.Quaternion();
  const scale = new THREE.Vector3();
  const color = new THREE.Color();
  const up = new THREE.Vector3(0, 0, 1);
  const instanced = (geometry, items, place) => {
    const mesh = new THREE.InstancedMesh(
      geometry,
      new THREE.MeshStandardMaterial({ color: '#FFFFFF', flatShading: true }),
      Math.max(items.length, 1),
    );
    mesh.count = items.length;
    items.forEach((item, index) => {
      place(item);
      mesh.setMatrixAt(index, matrix.compose(position, rotation, scale));
      mesh.setColorAt(index, color.set(item.color));
    });
    // Spread around the whole map: never cull it as one object
    mesh.frustumCulled = false;
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    group.add(mesh);
  };
  const lying = (item, z, size) => {
    position.set(item.x, item.y, z);
    rotation.setFromAxisAngle(up, item.turn);
    scale.setScalar(size);
  };
  instanced(shellGeometry, shells, (item) => lying(item, FOAM_Z, item.size));
  instanced(createStarfishGeometry(), starfish, (item) => lying(item, FOAM_Z, item.size));
  instanced(pebbleGeometry, pebbles, (item) => lying(item, FOAM_Z, item.size));
}

// A small rowing boat floating along the east shore: a blue hull, pointed at both ends and narrower at the bottom,
// its wooden inside, two seats and a pair of oars, merged into one shape. It rocks very slightly on the water.
function addBoat(group) {
  const { length, width, height, draught } = BOAT;
  // The hull's outline from above: pointed at the bow and stern
  const outline = new THREE.Shape();
  const steps = 12;
  for (let i = 0; i <= steps * 2; i++) {
    const t = i <= steps ? i / steps : 2 - i / steps; // along the boat, there and back
    const side = i <= steps ? 1 : -1;
    const x = (t - 0.5) * length;
    const y = side * (width / 2) * Math.pow(Math.max(1 - (2 * x / length) ** 2, 0), 0.6);
    if (i === 0) outline.moveTo(x, y);
    else outline.lineTo(x, y);
  }
  const hull = new THREE.ExtrudeGeometry(outline, { depth: height, bevelEnabled: false });
  // Narrower at the bottom than at the top, like a real hull
  const vertices = hull.attributes.position;
  for (let i = 0; i < vertices.count; i++) {
    const bottom = 1 - vertices.getZ(i) / height;
    vertices.setX(i, vertices.getX(i) * (1 - 0.1 * bottom));
    vertices.setY(i, vertices.getY(i) * (1 - 0.45 * bottom));
  }
  hull.computeVertexNormals();
  // The inside, seen from above: the same outline a little smaller, just over the top of the hull
  const inside = new THREE.ShapeGeometry(outline);
  inside.scale(0.86, 0.78, 1);
  inside.translate(0, 0, height + 0.02);
  const seat = (x) => {
    const geometry = new THREE.BoxGeometry(1.6, width * 0.7, 0.4);
    geometry.translate(x, 0, height - 0.3);
    return paint(geometry, BOAT_COLORS.seat);
  };
  const oar = (y, turn) => {
    const geometry = new THREE.BoxGeometry(length * 0.6, 0.5, 0.3);
    geometry.rotateZ(turn);
    geometry.translate(-1, y, height + 0.15);
    return paint(geometry, BOAT_COLORS.oar);
  };
  const shape = mergeParts([
    paint(hull, BOAT_COLORS.hull),
    paint(inside, BOAT_COLORS.inside),
    seat(-5),
    seat(5),
    oar(1.2, 0.08),
    oar(-1.4, -0.06),
  ]);
  const boat = new THREE.Mesh(shape, new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true }));
  boat.rotation.order = 'ZYX'; // turned to lie along the shore last, so it rolls and pitches about its own axes
  boat.scale.setScalar(BOAT_SCALE); // the whole boat at once, so all its parts keep their proportions
  group.add(boat);

  let time = 0;
  const pose = () => {
    const wave = time * BOAT_BOB.speed;
    const z = SHALLOWS_Z - draught * BOAT_SCALE + Math.sin(wave) * BOAT_BOB.height;
    boat.position.set(BOAT_POSITION.x, BOAT_POSITION.y, z);
    // It lies along the shore (the east side runs along Y), rolling and pitching a little out of step
    const roll = Math.sin(wave * 0.8 + 1) * BOAT_BOB.roll;
    boat.rotation.set(roll, Math.sin(wave * 0.6) * BOAT_BOB.pitch, Math.PI / 2 + BOAT_TURN);
  };
  pose();
  return {
    update(step) {
      time += step;
      pose();
    },
    reset() {
      time = 0;
      pose();
    },
  };
}

// A sea turtle: a domed shell and a head merged into one shape, and four flippers that paddle as it swims a slow
// loop through the south shallows, its shell just breaking the surface
function addTurtle(group) {
  const shell = new THREE.SphereGeometry(1, 10, 5, 0, Math.PI * 2, 0, Math.PI / 2);
  shell.rotateX(Math.PI / 2); // a dome
  shell.scale(8, 6.5, 3);
  const head = new THREE.SphereGeometry(1, 8, 6);
  head.scale(2.3, 1.8, 1.5);
  head.translate(9.2, 0, 1.3);
  const body = new THREE.Mesh(
    mergeParts([paint(shell, TURTLE_COLORS.shell), paint(head, TURTLE_COLORS.skin)]),
    new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true }),
  );
  const turtle = new THREE.Group();
  turtle.add(body);

  // One flipper shape, reaching out along +Y from its shoulder; the left-hand ones are turned half round about X
  const flipperGeometry = new THREE.SphereGeometry(1, 6, 4);
  flipperGeometry.scale(1.6, 3.6, 0.35);
  flipperGeometry.translate(0, 3.2, 0);
  const flipperMaterial = new THREE.MeshStandardMaterial({ color: TURTLE_COLORS.skin, flatShading: true });
  const flippers = [
    { x: 4.5, y: 4, size: 1, side: 1, back: 0.5 }, // front right
    { x: 4.5, y: -4, size: 1, side: -1, back: 0.5 },
    { x: -5, y: 3.2, size: 0.6, side: 1, back: 1.2 }, // back right, swept further back
    { x: -5, y: -3.2, size: 0.6, side: -1, back: 1.2 },
  ].map((spec) => {
    const flipper = new THREE.Mesh(flipperGeometry, flipperMaterial);
    flipper.position.set(spec.x, spec.y, 0.4);
    flipper.scale.setScalar(spec.size);
    turtle.add(flipper);
    return { flipper, ...spec };
  });
  group.add(turtle);

  let time = 0;
  const pose = () => {
    const angle = (time / TURTLE_LOOP.seconds) * Math.PI * 2;
    // Round its loop anticlockwise, facing the way it swims (its head is towards +X)
    turtle.position.set(
      TURTLE_LOOP.x + Math.cos(angle) * TURTLE_LOOP.halfLength,
      TURTLE_LOOP.y + Math.sin(angle) * TURTLE_LOOP.halfWidth,
      SHALLOWS_Z + TURTLE_LIFT + Math.sin(time * 1.3) * 0.15,
    );
    turtle.rotation.z = Math.atan2(Math.cos(angle) * TURTLE_LOOP.halfWidth, -Math.sin(angle) * TURTLE_LOOP.halfLength);
    // Front flippers sweep together, back ones in the opposite rhythm, each swept back from its shoulder. A
    // positive turn about Z swings a right-hand flipper's tip backwards (towards -X); the left-hand ones are the
    // same shape turned half round about X, which mirrors that, so both sides use the same turn.
    const paddle = Math.sin(time * TURTLE_PADDLE.speed) * TURTLE_PADDLE.sweep;
    for (const { flipper, side, back, size } of flippers) {
      const swing = size === 1 ? paddle : -paddle * 0.6;
      flipper.rotation.set(side < 0 ? Math.PI : 0, 0, back + swing);
    }
  };
  pose();
  return {
    update(step) {
      time += step;
      pose();
    },
    reset() {
      time = 0;
      pose();
    },
  };
}

// Small seeded random numbers, so the beach details are placed the same on every run
function createRandom(seed) {
  let state = seed;
  return () => {
    state = (state * 1664525 + 1013904223) % 4294967296;
    return state / 4294967296;
  };
}

// The dolphin's loop as evenly spaced points, with the distance along the loop to each; the last point is the
// first again
function buildRoute() {
  const xs = new Float32Array(ROUTE_SAMPLES + 1);
  const ys = new Float32Array(ROUTE_SAMPLES + 1);
  const lengths = new Float32Array(ROUTE_SAMPLES + 1);
  for (let i = 0; i <= ROUTE_SAMPLES; i++) {
    // A flat ellipse, swum anticlockwise from its west end: east along its near (south) side, back west along
    // its far side
    const angle = (i / ROUTE_SAMPLES) * Math.PI * 2;
    xs[i] = ROUTE_CENTRE.x - Math.cos(angle) * ROUTE_HALF_LENGTH;
    ys[i] = ROUTE_CENTRE.y - Math.sin(angle) * ROUTE_HALF_WIDTH;
    lengths[i] = i === 0 ? 0 : lengths[i - 1] + Math.hypot(xs[i] - xs[i - 1], ys[i] - ys[i - 1]);
  }
  return { xs, ys, lengths, total: lengths[ROUTE_SAMPLES] };
}

// The dolphin and its two splash rings. It swims its loop out of sight under the water, and every few seconds
// leaps: rising nose-up out of the water in an arc and diving back in nose-down. It is drawn only during a leap.
// Returns update(delta) and reset(); if its model fails to load, the same motion runs with nothing to show.
function addDolphin(group, mapSize) {
  const route = buildRoute();
  const dolphin = new THREE.Group();
  dolphin.rotation.order = 'ZXY'; // turned to its heading last, so it pitches about its own sideways axis
  group.add(dolphin);
  const nose = DEFAULT_NOSE.clone(); // the nose tip in the dolphin's own frame
  new GLTFLoader().load(
    DOLPHIN_PATH,
    (gltf) => {
      const prepared = prepareDolphin(gltf.scene);
      nose.copy(prepared.nose);
      dolphin.add(prepared.model);
    },
    undefined,
    (error) => console.error(`Failed to load ${DOLPHIN_PATH}; the Coast is played without its dolphin`, error),
  );

  // The surface of the water at (x, y): the shallows near the map, the open sea beyond them (see SHORE)
  const shallowsEnd = mapSize / 2 + SHORE[1].margin;
  const waterAt = (x, y) => (Math.max(Math.abs(x), Math.abs(y)) <= shallowsEnd ? SHORE[1].z : SHORE[2].z);

  // Two foam rings, reused for every leap: one for leaving the water, one for diving back in. They lie flat on
  // the water wherever they are started, whatever the dolphin's pitch.
  const ringGeometry = new THREE.RingGeometry(0.75, 1, 24);
  const splashes = [0, 1].map(() => {
    const mesh = new THREE.Mesh(
      ringGeometry,
      new THREE.MeshBasicMaterial({ color: '#FFFFFF', transparent: true, opacity: 0, depthWrite: false }),
    );
    group.add(mesh);
    return { mesh, age: SPLASH_TIME };
  });
  const noseNow = new THREE.Vector3(); // where the nose is this frame and was last frame, in the world
  const noseBefore = new THREE.Vector3();
  let noseKnown = false; // whether noseBefore is from earlier in the current leap

  let randomState = DOLPHIN_SEED;
  const random = () => {
    randomState = (randomState * 1664525 + 1013904223) % 4294967296;
    return randomState / 4294967296;
  };
  const between = ([low, high]) => low + random() * (high - low);

  let distance = 0; // along the loop
  let segment = 0; // the step of the loop it is on
  let heading = 0;
  let untilLeap = 0; // seconds under water before the next leap
  let leapTime = -1; // seconds into the current leap, or -1 while under water
  let splashed = 0; // splash rings started during the current leap

  // Starts the next splash ring where the nose crossed the water this frame: the point between its last and
  // current positions at the water's height
  const startSplash = (water) => {
    const splash = splashes[splashed];
    splashed += 1;
    const share = (water - noseBefore.z) / (noseNow.z - noseBefore.z);
    const x = noseBefore.x + (noseNow.x - noseBefore.x) * share;
    const y = noseBefore.y + (noseNow.y - noseBefore.y) * share;
    splash.age = 0;
    splash.mesh.position.set(x, y, waterAt(x, y) + SPLASH_LIFT);
  };

  // During a leap, after the dolphin is posed: a splash when the nose first rises through the water, and
  // another when it next goes back down through it
  const checkSurface = () => {
    noseNow.copy(nose).applyEuler(dolphin.rotation).add(dolphin.position);
    const water = waterAt(noseNow.x, noseNow.y);
    if (noseKnown) {
      if (splashed === 0 && noseBefore.z < water && noseNow.z >= water) startSplash(water);
      else if (splashed === 1 && noseBefore.z >= water && noseNow.z < water) startSplash(water);
    }
    noseBefore.copy(noseNow);
    noseKnown = true;
  };

  const showSplashes = () => {
    for (const splash of splashes) {
      const progress = Math.min(splash.age / SPLASH_TIME, 1);
      splash.mesh.visible = progress < 1;
      splash.mesh.scale.setScalar(SPLASH_RADIUS[0] + (SPLASH_RADIUS[1] - SPLASH_RADIUS[0]) * progress);
      splash.mesh.material.opacity = SPLASH_OPACITY * (1 - progress);
    }
  };

  const pose = () => {
    // Where along the loop, between two of its points
    const step = route.lengths[segment + 1] - route.lengths[segment];
    const along = (distance - route.lengths[segment]) / step;
    const dx = route.xs[segment + 1] - route.xs[segment];
    const dy = route.ys[segment + 1] - route.ys[segment];
    heading = Math.atan2(dy, dx);

    // During a leap: an arc from LEAP_DEPTH below the water up to LEAP_HEIGHT above it and back, the body
    // following the arc's slope (nose up rising, nose down diving)
    const leap = leapTime < 0 ? 0 : leapTime / LEAP_TIME;
    const rise = LEAP_HEIGHT + LEAP_DEPTH;
    const climb = ((rise * Math.PI) / LEAP_TIME) * Math.cos(Math.PI * leap);
    dolphin.visible = leapTime >= 0;
    dolphin.position.set(
      route.xs[segment] + dx * along,
      route.ys[segment] + dy * along,
      WATER_LEVEL - LEAP_DEPTH + rise * Math.sin(Math.PI * leap),
    );
    // The model faces -Y: heading + PI / 2 turns it to face along the loop; a negative X turn lifts its nose
    dolphin.rotation.set(leapTime < 0 ? 0 : -Math.atan2(climb, SWIM_SPEED), 0, heading + Math.PI / 2);
  };

  const update = (delta) => {
    const step = Number.isFinite(delta) ? Math.min(Math.max(delta, 0), MAX_STEP) : 0;

    distance += SWIM_SPEED * step;
    if (distance >= route.total) {
      distance -= route.total;
      segment = 0;
    }
    while (segment < ROUTE_SAMPLES - 1 && route.lengths[segment + 1] < distance) segment += 1;

    if (leapTime < 0) {
      untilLeap -= step;
      if (untilLeap <= 0) {
        leapTime = 0;
        splashed = 0;
        noseKnown = false;
      }
    } else {
      leapTime += step;
      if (leapTime >= LEAP_TIME) {
        leapTime = -1;
        untilLeap = between(LEAP_GAP);
      }
    }
    for (const splash of splashes) splash.age += step;
    pose();
    if (leapTime >= 0) checkSurface();
    showSplashes();
  };

  // Back to the start of its loop and its first wait, with the same leaps as every other run
  const reset = () => {
    randomState = DOLPHIN_SEED;
    distance = 0;
    segment = 0;
    leapTime = -1;
    untilLeap = between(LEAP_GAP);
    splashed = 0;
    noseKnown = false;
    for (const splash of splashes) splash.age = SPLASH_TIME;
    pose();
    showSplashes();
  };

  reset();
  return { update, reset };
}

// Levels, scales and centres the loaded model on its origin, so it pitches about its middle, and gives it a
// smaller copy of its texture. Returns the model and its nose tip (its point furthest towards -Y), both in the
// frame of the group it will be added to.
function prepareDolphin(scene) {
  scene.traverse((object) => {
    if (object.isMesh && object.material.map) {
      object.material.map = shrinkTexture(object.material.map, DOLPHIN_TEXTURE_SIZE);
    }
  });
  // Its Y is up (the game's Z is up), its nose towards +Z: standing it up turns the nose towards -Y
  scene.rotation.x = Math.PI / 2 + DOLPHIN_LEVEL;
  scene.scale.setScalar(DOLPHIN_SCALE);
  scene.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(scene);
  scene.position.sub(box.getCenter(new THREE.Vector3()));

  scene.updateMatrixWorld(true);
  const nose = new THREE.Vector3(0, Infinity, 0);
  const vertex = new THREE.Vector3();
  scene.traverse((object) => {
    if (!object.isMesh) return;
    const positions = object.geometry.attributes.position;
    for (let i = 0; i < positions.count; i++) {
      vertex.fromBufferAttribute(positions, i).applyMatrix4(object.matrixWorld);
      if (vertex.y < nose.y) nose.copy(vertex);
    }
  });
  return { model: scene, nose: Number.isFinite(nose.y) ? nose : DEFAULT_NOSE.clone() };
}

// Redraws a texture smaller on a canvas, keeping its colour space, wrapping and orientation (as Wildlife.js does
// for the Garden's butterflies)
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
      removeModelSea(model);
      model.rotation.x = Math.PI / 2;
      model.scale.setScalar(LIGHTHOUSE_SCALE);
      // The rock's lower part sits below the sea, so the lighthouse rises out of the water
      model.position.set(LIGHTHOUSE_POSITION.x, LIGHTHOUSE_POSITION.y, LIGHTHOUSE_LIFT);
      group.add(model);
    },
    undefined,
    (error) => console.error(`Failed to load ${LIGHTHOUSE_PATH}`, error),
  );
}

// Leaves the lighthouse model's own sea (see LIGHTHOUSE_WAVE_UV) out of its shapes, keeping everything else
function removeModelSea(model) {
  model.traverse((object) => {
    if (!object.isMesh || !object.geometry.index || !object.geometry.attributes.uv) return;
    const geometry = object.geometry;
    const positions = geometry.attributes.position;
    const uvs = geometry.attributes.uv;
    const index = geometry.index;
    geometry.computeBoundingBox();
    const { min, max } = geometry.boundingBox;
    // The model's Y is up, so its footprint is X by Z
    const atCorner = (vertex) =>
      Math.min(positions.getX(vertex) - min.x, max.x - positions.getX(vertex)) < 0.001 * (max.x - min.x) &&
      Math.min(positions.getZ(vertex) - min.z, max.z - positions.getZ(vertex)) < 0.001 * (max.z - min.z);
    const isWave = (vertex) => {
      const u = uvs.getX(vertex);
      const v = uvs.getY(vertex);
      const { u: [uLow, uHigh], v: [vLow, vHigh] } = LIGHTHOUSE_WAVE_UV;
      return u >= uLow && u <= uHigh && v >= vLow && v <= vHigh;
    };
    const kept = [];
    for (let i = 0; i < index.count; i += 3) {
      const corners = [index.getX(i), index.getX(i + 1), index.getX(i + 2)];
      if (corners.every(atCorner) || corners.every(isWave)) continue;
      kept.push(...corners);
    }
    geometry.setIndex(kept);
  });
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
