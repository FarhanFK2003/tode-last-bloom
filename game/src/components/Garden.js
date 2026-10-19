import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { createHouses } from './House.js';
import { createButterfly, createRabbit, loadButterfly, loadRabbit } from './Wildlife.js';

// The Garden's features. Its three randomly placed houses (exactly as before) are the only obstacles; everything
// else is scenery, never added to the obstacle list, so everything walks and flies through it:
//   - inside the map, a static dressing of grass tufts and small wildflower clusters gathered in natural-looking
//     patches in the outer meadow
//   - beyond the map edge, a textured meadow backdrop, distant trees to the north and west, clumps of edge grass,
//     a two-layer border of bushes and low grass along the edge, and a wooden beehive outside each bee corner
//   - wildlife (see Wildlife.js): three butterflies looping over wildflower patches and three white rabbits
//     hopping just outside the edge. They move only through update(delta) and go back to their start on reset().
//
// Layout is deterministic (fixed seeds), so it is the same on every run. The houses move with every page load,
// so the dressing (and the butterflies above it) is placed once the houses have been placed, skipping anything
// near a house; if the house model fails to load, it is placed without that check. All of it is built once with
// the world.

const SEED = 31;
const PATCHES = 18; // patch centres
const TUFTS_PER_PATCH = 8; // up to 144 grass tufts
const CLUSTERS_PER_PATCH = 2; // up to 36 wildflower clusters
const FLOWERS_PER_CLUSTER = 4; // up to 144 flowers
const PATCH_SPREAD = 24; // how far a patch's tufts and clusters scatter from its centre
const CLUSTER_SPREAD = 4; // how far a cluster's flowers scatter from its own centre
const PATCH_SPACING = 50; // minimum distance between patch centres
const MAX_PATCH_ATTEMPTS = 500;

// Where nothing may go (all world units). Every tuft and every flower is checked against all of these.
const FLOWER_CLEARANCE = 110; // the flower, its sandy clearing, both player starts and the pickup ring with its reach
// The corner paths are painted up to about 14 units either side of the diagonals (half their width plus their
// wave); decorations stay this much further out than that
const PATH_EDGE = 14;
const PATH_CLEARANCE = 20;
const CORNER_CLEARANCE = 60; // the bee spawn corners at (+-250, +-250)
const EDGE_LIMIT = 240; // inside the map
const HOUSE_CLEARANCE = 8; // from any house footprint
const PATCH_MIN_RADIUS = 130; // patch centres sit in the outer meadow, leaving the middle calm

// Sizes: everything stays well below the pickup icons (about 12 high) and below Tode
const TUFT_HEIGHT = 4;
const STEM_HEIGHT = [3.5, 5.5];
const HEAD_RADIUS = 1.1;

const TUFT_COLORS = ['#6E9C52', '#5E8A46', '#7FAE5E'];
const FLOWER_COLORS = ['#F2D25C', '#FFFFFF', '#B9A3E3', '#F7A8C4']; // buttercup, white, lavender, soft pink
const STEM_COLOR = '#5E8A46';

// Meadow beyond the map: one large flat plane just below the ground, so the world doesn't end at the map's
// square edge. Like the ground it ignores lighting. Its texture is one small seamless tile, repeated: a deeper
// meadow green with soft, low-contrast drifts, faint speckles and a very few tiny flower dots, at about the same
// detail as the playable ground (2 world units per pixel), so it reads as the same meadow further away.
const BACKDROP_SIZE = 4000;
const BACKDROP_Z = -1; // far enough below the ground (z = 0) that the two never flicker against each other
const BACKDROP_COLOR = '#7FA862';
const BACKDROP_TILE_PIXELS = 512; // one tile covers 1024 world units, so the 4000-unit plane repeats it about 4 times
const BACKDROP_UNITS_PER_PIXEL = 2;
const BACKDROP_SEED = 47;
const BACKDROP_DRIFTS = 34; // soft lighter and darker patches per tile
const BACKDROP_SPECKLES = 900;
const BACKDROP_FLOWER_DOTS = 40; // per tile: very occasional
const BACKDROP_DRIFT_COLORS = ['#8BB86C', '#739C57']; // lighter, darker
const BACKDROP_SPECKLE_COLOR = '#6A944F';
const BACKDROP_DOT_COLORS = ['#F2D25C', '#FFFFFF', '#B9A3E3'];

// Natural scenery beyond the map (all outside it, never obstacles), built once with a fixed seed:
//   - sparse groups of round low-poly trees, only north and west of the map. The camera looks north-west from
//     the south-east, so anything there stands behind the action and can never hide it.
//   - irregular clumps of taller grass just outside the edge: taller north and west, low south and east (where
//     they're between the camera and the play).
// Three instanced meshes in all: tree trunks, tree canopies and the edge grass.
const SCENERY_SEED = 59;
const HALF_MAP = 250;
const TREE_GROUPS = 8;
const TREES_PER_GROUP = [2, 5];
const TREE_GROUP_SPACING = 150; // between group centres
const TREE_SPREAD = 50; // how far a group's trees scatter from its centre
const TREE_SPACING = 26; // between neighbouring trees, so canopies only just touch
const TREE_NEAREST = 290; // no tree closer to the map than this (the edge is at 250)
const TREE_FARTHEST = 600;
const TRUNK_HEIGHT = [14, 22];
const TRUNK_RADIUS = [2.5, 3.5];
const CANOPY_BALLS = [2, 3];
const CANOPY_RADIUS = [9, 15];
const TRUNK_COLOR = '#7A5C3E';
const CANOPY_COLORS = ['#6E9C52', '#5E8A46', '#7A9F5C', '#668F4B'];
const EDGE_CLUMPS = 22;
const TUFTS_PER_CLUMP = [4, 7];
const EDGE_OFFSET = [8, 32]; // how far outside the edge a clump sits
const EDGE_TUFT_SIZE = { behind: [2.2, 3.2], front: [1.2, 1.7] }; // north / west, and south / east (x 4 high)
const EDGE_TUFT_COLORS = ['#6E9C52', '#5E8A46', '#7FAE5E', '#668F4B'];
const PLAYABLE_LIMIT = 255; // nothing of this scenery is placed inside +-255

// Wildlife (see Wildlife.js): three butterflies over the outer wildflower patches, and three white rabbits hopping
// just outside the south, east and north edges. Decorative only; never obstacles.
const BUTTERFLIES = 3;
const BUTTERFLY_MIN_RADIUS = 140; // from the flower: their loops (about 14 wide) stay well outside the pickup ring
const BUTTERFLY_LIMIT = 220; // inside the map, so their loops stay over the meadow
const BUTTERFLY_SPACING = 150; // between their loop centres
const BUTTERFLY_HOUSE_CLEARANCE = 24; // their loops stay clear of the houses
// Each rabbit hops back and forth along a stretch of one side, on a line `out` (or RABBIT_OUT) from the centre. The
// stretches stay well clear of the corners, where the bees arrive. The line is moved further out if needed, so no
// part of a rabbit ever comes closer to the playable edge than RABBIT_EDGE_GAP, however it turns, squashes or tilts.
// South and east are on the camera's side, where the low border keeps them in view; the south and east rabbits hop
// just beyond the low bushes, clear of them and of the grass tufts. The north rabbit has the one stretch of the
// north border with nothing tall in front of it: only the low first-layer bushes, with the taller shrubs from 268
// out behind it, as a backdrop.
const RABBITS = [
  { side: 'south', from: -170, to: -86, out: 268, seed: 83 },
  { side: 'east', from: -138, to: -58, out: 268, seed: 89 },
  { side: 'north', from: -42, to: -16, out: 265, seed: 97 },
];
const RABBIT_OUT = 266;
const RABBIT_EDGE_GAP = 6;

// Beehives: one small wooden hive just outside each corner, where the bees arrive, its round entrance facing the
// middle of the map. Scenery only, never obstacles: bees still appear at the corners themselves, at least 15
// units clear of the hive, and fly inward, away from it. All four are one instanced mesh, built once and never
// animated.
const HIVE_OUT = 20; // the hive's centre is this far beyond its corner along each axis
const HIVE_SCALE = 2.5; // every hive is drawn this much larger than the HIVE sizes below (so 25 high)
const HIVE = {
  base: { size: [10, 10, 1.2], color: '#8A5A2B' },
  lower: { size: [8.4, 8.4, 3.2], color: '#D9A441' },
  upper: { size: [8, 8, 3], color: '#E2B455' },
  roof: { length: 9.6, width: 10, height: 2.6, color: '#A8692E' }, // a gable, its ridge running front to back
  entrance: { radius: 0.9, height: 2.4, color: '#3B2614' }, // height of its centre above the ground
  board: { size: [1, 3, 0.3], color: '#8A5A2B' }, // the landing board under the entrance
};

// The Garden's border: a natural hedgerow around the playable edge (+-250), in two layers. Scenery only, never
// obstacles; built once with a fixed seed, never animated.
//   Layer 1, all four sides: low bushes right on the edge, in clusters with small irregular gaps, hiding the hard
//     seam between the meadow and the backdrop. A ball may reach a little way over the edge, but never more than
//     BUSH_MAX_OVERLAP into the meadow.
//   Layer 2, north and west (behind the action from the camera): taller shrubs behind the first layer, leading
//     back to the tree line. South and east (between the camera and the play) get no tall layer: the gaps in the
//     first layer are filled with low grass instead, so those sides look full without hiding anything.
// The corners stay clear, where the bees arrive.
const BUSH_SEED = 71;
const BUSH_SIDE_END = HALF_MAP - 40; // the border runs along each side up to 40 short of the corners
const BUSH_MAX_OVERLAP = 4.5; // the furthest any bush ball reaches into the meadow, past the edge
const BUSH_SQUASH = [0.7, 1]; // balls are a little flattened, by varying amounts
const BUSH_COLORS = ['#5E8A46', '#668F4B', '#6E9C52', '#577F42'];
const SEAM = {
  out: [251, 257], // ball centres, distance from the map centre on their side
  width: [18, 30], // how long a cluster runs along the side
  gap: [4, 12], // open space between clusters
  balls: [3, 5],
  radius: [3, 4.5],
  top: [3, 5], // height of the top of each ball
};
const DEPTH = {
  out: [260, 285],
  width: [25, 40],
  gap: [0, 15],
  balls: [3, 5],
  radius: [5, 9],
  top: [9, 18],
};
const CLUSTER_SHIFT = 3; // each cluster is moved in or out by up to this, so the band isn't a straight line
const FILL_TUFTS = [2, 4]; // low grass tufts filling each gap in the first layer, south and east
const FILL_OUT = [253, 262];
const FILL_SIZE = [1, 1.5]; // x the tuft's 4 units of height: at most about 6 high
const FILL_COLORS = ['#6E9C52', '#5E8A46', '#7FAE5E', '#668F4B'];

// Small seeded random numbers, so the layout is the same on every run
function createRandom(seed) {
  let state = seed;
  return () => {
    state = (state * 1664525 + 1013904223) % 4294967296;
    return state / 4294967296;
  };
}

// Returns the houses' obstacle list exactly as createHouses gives it, plus update and reset for the wildlife
export function createGarden(group, mapSize, protectedPoints) {
  addBackdrop(group);
  addBackdropScenery(group);
  addBorderBushes(group);
  addBeehives(group);
  const layout = planLayout();
  const butterflies = []; // filled once the houses are placed and the model has loaded
  let dressed = false;
  // Runs once, when the houses are placed (or failed to load)
  const dress = (houses) => {
    if (dressed) return;
    dressed = true;
    addDressing(group, layout, houses);
    // Butterflies loop over wildflower patches, chosen once the houses are known so they stay clear of them
    const anchors = chooseButterflyAnchors(layout, houses);
    loadButterfly().then((template) => {
      if (!template) return;
      anchors.forEach((anchor, index) => {
        const butterfly = createButterfly(template, anchor, index * 2.1);
        butterflies.push(butterfly);
        group.add(butterfly.object);
      });
    });
  };
  const obstacles = createHouses(group, mapSize, protectedPoints, dress);

  // The rabbits, each on its own stretch of the border
  const rabbits = []; // filled once the model has loaded
  loadRabbit().then((template) => {
    if (!template) return;
    const nearest = HALF_MAP + RABBIT_EDGE_GAP + template.reach;
    const place = (side, along, out) => {
      if (side === 'south') return { x: along, y: -out };
      if (side === 'east') return { x: out, y: along };
      return { x: along, y: out }; // north
    };
    for (const { side, from, to, out = RABBIT_OUT, seed } of RABBITS) {
      const line = Math.max(out, nearest);
      const rabbit = createRabbit(template, place(side, from, line), place(side, to, line), seed);
      rabbits.push(rabbit);
      group.add(rabbit.object);
    }
  });

  // Wildlife moves only while the Garden is being played (the game calls update then), and restarts its paths
  // on reset
  const update = (delta) => {
    for (const butterfly of butterflies) butterfly.update(delta);
    for (const rabbit of rabbits) rabbit.update(delta);
  };
  const reset = () => {
    for (const butterfly of butterflies) butterfly.reset();
    for (const rabbit of rabbits) rabbit.reset();
  };
  return { obstacles, update, reset };
}

// Loop centres for the butterflies: wildflowers from the dressing plan that are well out in the meadow, clear of
// the houses, paths and corners, and far apart from each other. The plan is fixed, so the choice only changes
// with where the houses landed.
function chooseButterflyAnchors(layout, houses) {
  const anchors = [];
  for (const flower of layout.flowers) {
    if (anchors.length >= BUTTERFLIES) break;
    if (Math.hypot(flower.x, flower.y) < BUTTERFLY_MIN_RADIUS) continue;
    if (Math.abs(flower.x) > BUTTERFLY_LIMIT || Math.abs(flower.y) > BUTTERFLY_LIMIT) continue;
    if (!isClear(flower.x, flower.y, BUTTERFLY_HOUSE_CLEARANCE, houses)) continue;
    if (anchors.some((anchor) => Math.hypot(anchor.x - flower.x, anchor.y - flower.y) < BUTTERFLY_SPACING)) continue;
    anchors.push({ x: flower.x, y: flower.y });
  }
  return anchors;
}

// The meadow beyond the map edge; scenery only, never an obstacle. Built once, with the world.
function addBackdrop(group) {
  const texture = new THREE.CanvasTexture(paintBackdropTile());
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  const repeats = BACKDROP_SIZE / (BACKDROP_TILE_PIXELS * BACKDROP_UNITS_PER_PIXEL);
  texture.repeat.set(repeats, repeats);
  // Smooth filtering with mipmaps: the backdrop is mostly seen far away and at a low angle, where it must not
  // shimmer (texture defaults: linear filtering, mipmaps generated)

  const backdrop = new THREE.Mesh(
    new THREE.PlaneGeometry(BACKDROP_SIZE, BACKDROP_SIZE),
    new THREE.MeshBasicMaterial({ map: texture }),
  );
  backdrop.position.z = BACKDROP_Z;
  group.add(backdrop);
}

// One seamless tile of distant meadow. Every drift is also drawn shifted by a whole tile wherever it crosses an
// edge, so the repeats join without seams.
function paintBackdropTile() {
  const size = BACKDROP_TILE_PIXELS;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const context = canvas.getContext('2d');
  const random = createRandom(BACKDROP_SEED);

  context.fillStyle = BACKDROP_COLOR;
  context.fillRect(0, 0, size, size);

  // Draws a round blob, wrapped around the tile's edges
  const blob = (x, y, radius) => {
    for (const offsetX of [-size, 0, size]) {
      for (const offsetY of [-size, 0, size]) {
        const cx = x + offsetX;
        const cy = y + offsetY;
        if (cx + radius < 0 || cx - radius > size || cy + radius < 0 || cy - radius > size) continue;
        context.beginPath();
        context.arc(cx, cy, radius, 0, Math.PI * 2);
        context.fill();
      }
    }
  };

  // Large, soft, low-contrast drifts of lighter and darker grass
  for (let i = 0; i < BACKDROP_DRIFTS; i++) {
    context.fillStyle = BACKDROP_DRIFT_COLORS[i % 2];
    context.globalAlpha = 0.18 + random() * 0.14;
    const x = random() * size;
    const y = random() * size;
    for (let part = 0; part < 6; part++) {
      blob(x + (random() - 0.5) * 60, y + (random() - 0.5) * 60, 12 + random() * 22);
    }
  }

  // Faint speckles of distant grass
  context.globalAlpha = 0.35;
  context.fillStyle = BACKDROP_SPECKLE_COLOR;
  for (let i = 0; i < BACKDROP_SPECKLES; i++) {
    context.fillRect(Math.floor(random() * size), Math.floor(random() * size), 1, 1);
  }

  // A very few tiny flower dots
  context.globalAlpha = 0.6;
  for (let i = 0; i < BACKDROP_FLOWER_DOTS; i++) {
    context.fillStyle = BACKDROP_DOT_COLORS[i % BACKDROP_DOT_COLORS.length];
    context.fillRect(Math.floor(random() * size), Math.floor(random() * size), 1, 1);
  }

  context.globalAlpha = 1;
  return canvas;
}

// The two-layer border (see SEAM, DEPTH and FILL above): walks along each side placing clusters of overlapping
// bush balls, records the gaps between the first layer's clusters on the south and east sides and fills them
// with low grass. Everything is drawn as two instanced meshes: bush balls and grass tufts.
function addBorderBushes(group) {
  const random = createRandom(BUSH_SEED);
  const between = ([low, high]) => low + random() * (high - low);
  const pickColor = (list) => list[Math.floor(random() * list.length)];
  const balls = [];
  const tufts = [];

  // Each side: whether it is behind the action, and how to turn (along, out) into (x, y)
  const sides = [
    { behind: true, place: (along, out) => [along, out] }, // north
    { behind: true, place: (along, out) => [-out, along] }, // west
    { behind: false, place: (along, out) => [along, -out] }, // south
    { behind: false, place: (along, out) => [out, along] }, // east
  ];

  // One cluster of balls running from `start` along the side for `width`; returns where it ends
  const addCluster = (place, layer, start) => {
    const width = between(layer.width);
    const count = Math.round(between(layer.balls));
    const shift = (random() * 2 - 1) * CLUSTER_SHIFT;
    const clusterColor = pickColor(BUSH_COLORS);
    for (let i = 0; i < count; i++) {
      const radius = between(layer.radius) * (i === 0 ? 1 : 0.85);
      const squash = between(BUSH_SQUASH);
      const top = between(layer.top);
      // Never further into the meadow than BUSH_MAX_OVERLAP: the ball's inner edge stays outside 250 - overlap
      const out = Math.max(between(layer.out) + shift, HALF_MAP - BUSH_MAX_OVERLAP + radius);
      const along = start + ((i + random() * 0.6) / count) * width;
      const [x, y] = place(along, out);
      balls.push({
        x,
        y,
        // Sits so its top is at `top`; a ball taller than that is simply partly sunk into the ground
        z: Math.max(top - radius * squash, -radius * squash * 0.4),
        radius,
        squash,
        color: random() < 0.7 ? clusterColor : pickColor(BUSH_COLORS),
      });
    }
    return start + width;
  };

  for (const { behind, place } of sides) {
    // Layer 1: low bushes on the edge; on the south and east, the gaps between them get low grass
    let along = -BUSH_SIDE_END + between([0, SEAM.gap[1]]);
    while (along < BUSH_SIDE_END) {
      const end = addCluster(place, SEAM, along);
      const gap = between(SEAM.gap);
      if (!behind) {
        const count = Math.round(between(FILL_TUFTS));
        for (let i = 0; i < count; i++) {
          const [x, y] = place(end + random() * gap, between(FILL_OUT));
          tufts.push({ x, y, size: between(FILL_SIZE), turn: random() * Math.PI * 2, color: pickColor(FILL_COLORS) });
        }
      }
      along = end + gap;
    }

    // Layer 2: taller shrubs behind the first layer, north and west only
    if (behind) {
      along = -BUSH_SIDE_END + between([0, DEPTH.gap[1]]);
      while (along < BUSH_SIDE_END) {
        along = addCluster(place, DEPTH, along) + between(DEPTH.gap);
      }
    }
  }

  const material = (color) => new THREE.MeshStandardMaterial({ color, flatShading: true });
  const matrix = new THREE.Matrix4();
  const position = new THREE.Vector3();
  const rotation = new THREE.Quaternion();
  const scale = new THREE.Vector3();
  const color = new THREE.Color();
  const up = new THREE.Vector3(0, 0, 1);

  const bushes = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(1, 1), material('#FFFFFF'), balls.length);
  balls.forEach(({ x, y, z, radius, squash, color: ballColor }, index) => {
    matrix.compose(position.set(x, y, z), rotation.identity(), scale.set(radius, radius, radius * squash));
    bushes.setMatrixAt(index, matrix);
    bushes.setColorAt(index, color.set(ballColor));
  });

  const grass = new THREE.InstancedMesh(createTuftGeometry(), material('#FFFFFF'), Math.max(tufts.length, 1));
  grass.count = tufts.length;
  tufts.forEach(({ x, y, size, turn, color: tuftColor }, index) => {
    matrix.compose(position.set(x, y, 0), rotation.setFromAxisAngle(up, turn), scale.setScalar(size));
    grass.setMatrixAt(index, matrix);
    grass.setColorAt(index, color.set(tuftColor));
  });

  for (const mesh of [bushes, grass]) {
    // Spread around the whole map: never cull them as one object
    mesh.frustumCulled = false;
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    group.add(mesh);
  }
}

// The four corner beehives (see HIVE above): one shape, drawn four times by an instanced mesh, each turned so its
// entrance faces the middle of the map
function addBeehives(group) {
  // [side x, side y, how far beyond the corner]. The south-east hive stands between the camera and its corner, so
  // it sits 12 further out: far enough that it never hides a newly arrived bee, and clear of a grass tuft in the
  // border just west of it.
  const corners = [
    [-1, -1, HIVE_OUT],
    [1, -1, HIVE_OUT + 12],
    [1, 1, HIVE_OUT],
    [-1, 1, HIVE_OUT],
  ];
  const hives = new THREE.InstancedMesh(
    createBeehiveGeometry(),
    new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true }),
    corners.length,
  );
  const matrix = new THREE.Matrix4();
  const position = new THREE.Vector3();
  const rotation = new THREE.Quaternion();
  const scale = new THREE.Vector3().setScalar(HIVE_SCALE);
  const up = new THREE.Vector3(0, 0, 1);
  corners.forEach(([sideX, sideY, out], index) => {
    const x = sideX * (HALF_MAP + out);
    const y = sideY * (HALF_MAP + out);
    rotation.setFromAxisAngle(up, Math.atan2(-y, -x)); // the entrance is on the shape's +X side
    hives.setMatrixAt(index, matrix.compose(position.set(x, y, 0), rotation, scale));
  });
  // Spread around the whole map: never cull them as one object
  hives.frustumCulled = false;
  hives.instanceMatrix.needsUpdate = true;
  group.add(hives);
}

// One beehive, standing on the origin with its entrance facing +X: a base, two stacked boxes, a gable roof, a dark
// round entrance low on the front and a landing board under it. Each part carries its own colour in its vertices,
// so the whole hive is one shape with one material.
function createBeehiveGeometry() {
  const color = new THREE.Color();
  const paint = (geometry, hex) => {
    color.set(hex);
    const count = geometry.attributes.position.count;
    const colors = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) color.toArray(colors, i * 3);
    geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    return geometry;
  };
  // A box of the given size, its bottom at `bottom`, its centre at `front` along X
  const box = ({ size: [width, depth, height], color: hex }, bottom, front = 0) => {
    const geometry = new THREE.BoxGeometry(width, depth, height);
    geometry.translate(front, 0, bottom + height / 2);
    return paint(geometry, hex);
  };

  const { base, lower, upper, roof, entrance, board } = HIVE;
  const lowerBottom = base.size[2];
  const upperBottom = lowerBottom + lower.size[2];
  const roofBottom = upperBottom + upper.size[2];

  // The roof: a three-sided cylinder is a triangular prism. Its axis is turned from Y to X, so the ridge runs front
  // to back with a gable at each end, and it is scaled to the roof's size with its eaves at the top of the boxes.
  const gable = new THREE.CylinderGeometry(1, 1, 1, 3);
  gable.rotateZ(-Math.PI / 2);
  gable.scale(roof.length, roof.width / Math.sqrt(3), roof.height / 1.5);
  gable.translate(0, 0, roofBottom + roof.height / 3);

  // The entrance: a thin dark disc standing a little proud of the lower box's front, so it never flickers into it
  const hole = new THREE.CylinderGeometry(entrance.radius, entrance.radius, 0.3, 8);
  hole.rotateZ(-Math.PI / 2);
  hole.translate(lower.size[0] / 2 + 0.05, 0, entrance.height);

  return mergeGeometries([
    box(base, 0),
    box(lower, lowerBottom),
    box(upper, upperBottom),
    paint(gable, roof.color),
    paint(hole, entrance.color),
    box(board, lowerBottom, lower.size[0] / 2 + board.size[0] / 2),
  ]);
}

// Whether (x, y) is outside the playable square (with a little margin), where the backdrop scenery belongs
function isOutsidePlayable(x, y) {
  return Math.abs(x) > PLAYABLE_LIMIT || Math.abs(y) > PLAYABLE_LIMIT;
}

// Distant trees and edge grass, placed once with a fixed seed (see the constants above)
function addBackdropScenery(group) {
  const random = createRandom(SCENERY_SEED);
  const between = ([low, high]) => low + random() * (high - low);
  const pick = (list) => list[Math.floor(random() * list.length)];

  // Tree group centres in the band north of the map or the band west of it, never in rows: random positions
  // with a minimum spacing, so the gaps between groups vary
  const centres = [];
  for (let attempt = 0; attempt < 400 && centres.length < TREE_GROUPS; attempt++) {
    const north = random() < 0.5;
    const along = (random() * 2 - 1) * TREE_FARTHEST;
    const out = between([TREE_NEAREST + TREE_SPREAD * 0.5, TREE_FARTHEST]);
    const x = north ? along : -out;
    const y = north ? out : along;
    if (centres.some((centre) => Math.hypot(centre.x - x, centre.y - y) < TREE_GROUP_SPACING)) continue;
    centres.push({ x, y });
  }

  // Trees around each centre: kept north or west of the map, not too close to it, and apart from each other
  const trees = [];
  for (const centre of centres) {
    const count = Math.round(between(TREES_PER_GROUP));
    for (let i = 0, tries = 0; i < count && tries < 40; tries++) {
      const angle = random() * Math.PI * 2;
      const distance = Math.sqrt(random()) * TREE_SPREAD;
      const x = centre.x + Math.cos(angle) * distance;
      const y = centre.y + Math.sin(angle) * distance;
      const behind = y > TREE_NEAREST || x < -TREE_NEAREST;
      if (!behind || trees.some((tree) => Math.hypot(tree.x - x, tree.y - y) < TREE_SPACING)) continue;
      trees.push({ x, y, trunk: between(TRUNK_HEIGHT), radius: between(TRUNK_RADIUS) });
      i += 1;
    }
  }

  // Each tree's canopy: 2 or 3 balls around the top of its trunk, in one of the muted greens
  const balls = [];
  for (const tree of trees) {
    const count = Math.round(between(CANOPY_BALLS));
    const green = pick(CANOPY_COLORS);
    for (let i = 0; i < count; i++) {
      const radius = between(CANOPY_RADIUS) * (i === 0 ? 1 : 0.75);
      const angle = random() * Math.PI * 2;
      const offset = i === 0 ? 0 : radius * 0.55;
      balls.push({
        x: tree.x + Math.cos(angle) * offset,
        y: tree.y + Math.sin(angle) * offset,
        z: tree.trunk + radius * (i === 0 ? 0.6 : 0.4),
        radius,
        color: random() < 0.8 ? green : pick(CANOPY_COLORS),
      });
    }
  }

  // Edge grass clumps on random sides at random points along them, just outside the edge, with uneven gaps
  const tufts = [];
  for (let c = 0; c < EDGE_CLUMPS; c++) {
    const side = Math.floor(random() * 4); // 0 north, 1 west, 2 south, 3 east
    const along = (random() * 2 - 1) * (HALF_MAP + 20);
    const out = HALF_MAP + between(EDGE_OFFSET);
    const cx = [along, -out, along, out][side];
    const cy = [out, along, -out, along][side];
    const behind = side < 2;
    const count = Math.round(between(TUFTS_PER_CLUMP));
    for (let i = 0; i < count; i++) {
      const x = cx + (random() - 0.5) * 18;
      const y = cy + (random() - 0.5) * 18;
      const size = between(behind ? EDGE_TUFT_SIZE.behind : EDGE_TUFT_SIZE.front);
      const turn = random() * Math.PI * 2;
      const color = pick(EDGE_TUFT_COLORS);
      if (isOutsidePlayable(x, y)) tufts.push({ x, y, size, turn, color });
    }
  }

  const material = (color) => new THREE.MeshStandardMaterial({ color, flatShading: true });
  const matrix = new THREE.Matrix4();
  const position = new THREE.Vector3();
  const rotation = new THREE.Quaternion();
  const scale = new THREE.Vector3();
  const color = new THREE.Color();
  const up = new THREE.Vector3(0, 0, 1);

  // Trunks: a tapered six-sided cylinder standing on its base
  const trunkGeometry = new THREE.CylinderGeometry(0.7, 1, 1, 6);
  trunkGeometry.translate(0, 0.5, 0);
  trunkGeometry.rotateX(Math.PI / 2);
  const trunks = new THREE.InstancedMesh(trunkGeometry, material(TRUNK_COLOR), trees.length);
  trees.forEach(({ x, y, trunk, radius }, index) => {
    matrix.compose(position.set(x, y, 0), rotation.identity(), scale.set(radius, radius, trunk));
    trunks.setMatrixAt(index, matrix);
  });

  // Canopies: low-poly balls, coloured per ball
  const canopies = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(1, 1), material('#FFFFFF'), balls.length);
  balls.forEach(({ x, y, z, radius, color: ballColor }, index) => {
    canopies.setMatrixAt(index, matrix.compose(position.set(x, y, z), rotation.identity(), scale.setScalar(radius)));
    canopies.setColorAt(index, color.set(ballColor));
  });

  // Edge grass: the same tuft shape as the meadow dressing, scaled up, coloured per tuft
  const edgeGrass = new THREE.InstancedMesh(createTuftGeometry(), material('#FFFFFF'), tufts.length);
  tufts.forEach(({ x, y, size, turn, color: tuftColor }, index) => {
    rotation.setFromAxisAngle(up, turn);
    edgeGrass.setMatrixAt(index, matrix.compose(position.set(x, y, 0), rotation, scale.setScalar(size)));
    edgeGrass.setColorAt(index, color.set(tuftColor));
  });

  for (const mesh of [trunks, canopies, edgeGrass]) {
    // Spread far around the map: never cull them as one object
    mesh.frustumCulled = false;
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    group.add(mesh);
  }
}

// Whether a decoration of the given radius at (x, y) keeps clear of everything it must avoid
function isClear(x, y, radius, houses) {
  if (Math.abs(x) > EDGE_LIMIT || Math.abs(y) > EDGE_LIMIT) return false;
  if (Math.hypot(x, y) < FLOWER_CLEARANCE) return false;
  // Distance from the nearer diagonal, where the corner paths run
  if (Math.abs(Math.abs(x) - Math.abs(y)) / Math.SQRT2 < PATH_EDGE + PATH_CLEARANCE) return false;
  if (Math.hypot(Math.abs(x) - 250, Math.abs(y) - 250) < CORNER_CLEARANCE) return false;
  const point = new THREE.Vector2(x, y);
  return !houses.some((house) => house.userData.footprint.distanceToPoint(point) < HOUSE_CLEARANCE + radius);
}

// The fixed plan: patch centres, then tufts and flower clusters scattered around each one. Houses aren't known
// yet, so everything here is only checked against the fixed zones; the house check comes when placing.
function planLayout() {
  const random = createRandom(SEED);
  const centres = [];
  for (let attempt = 0; attempt < MAX_PATCH_ATTEMPTS && centres.length < PATCHES; attempt++) {
    const x = (random() * 2 - 1) * EDGE_LIMIT;
    const y = (random() * 2 - 1) * EDGE_LIMIT;
    if (Math.hypot(x, y) < PATCH_MIN_RADIUS || !isClear(x, y, 0, [])) continue;
    if (centres.some((centre) => Math.hypot(centre.x - x, centre.y - y) < PATCH_SPACING)) continue;
    centres.push({ x, y });
  }

  // A point scattered around (x, y), denser near the middle
  const scatter = (x, y, spread) => {
    const angle = random() * Math.PI * 2;
    const distance = spread * Math.sqrt(random()) * 0.9;
    return { x: x + Math.cos(angle) * distance, y: y + Math.sin(angle) * distance };
  };

  const tufts = [];
  const flowers = [];
  for (const centre of centres) {
    for (let i = 0; i < TUFTS_PER_PATCH; i++) {
      tufts.push({
        ...scatter(centre.x, centre.y, PATCH_SPREAD),
        turn: random() * Math.PI * 2,
        size: 0.8 + random() * 0.45,
        color: TUFT_COLORS[Math.floor(random() * TUFT_COLORS.length)],
      });
    }
    for (let c = 0; c < CLUSTERS_PER_PATCH; c++) {
      const cluster = scatter(centre.x, centre.y, PATCH_SPREAD * 0.8);
      const color = FLOWER_COLORS[Math.floor(random() * FLOWER_COLORS.length)];
      for (let f = 0; f < FLOWERS_PER_CLUSTER; f++) {
        flowers.push({
          ...scatter(cluster.x, cluster.y, CLUSTER_SPREAD),
          height: STEM_HEIGHT[0] + random() * (STEM_HEIGHT[1] - STEM_HEIGHT[0]),
          // Mostly the cluster's colour, now and then a different one
          color: random() < 0.75 ? color : FLOWER_COLORS[Math.floor(random() * FLOWER_COLORS.length)],
        });
      }
    }
  }
  return { tufts, flowers };
}

// A tuft: four thin blades merged into one shape, standing on its origin
function createTuftGeometry() {
  const blades = [
    [0, 0, 1, 0, 0],
    [0.9, 0.3, 0.8, 0.25, 0.6],
    [-0.7, 0.6, 0.75, -0.2, 2.1],
    [0.1, -0.9, 0.85, 0.2, 4.0],
  ].map(([x, y, height, lean, turn]) => {
    const blade = new THREE.ConeGeometry(0.55, TUFT_HEIGHT * height, 4);
    blade.translate(0, (TUFT_HEIGHT * height) / 2, 0); // base at the origin
    blade.rotateX(Math.PI / 2); // cones point along their local Y: stand them up the world Z axis
    blade.rotateY(lean);
    blade.rotateZ(turn);
    blade.translate(x, y, 0);
    return blade;
  });
  return mergeGeometries(blades);
}

// Places the planned dressing: each tuft and flower is checked against everything (houses included) first,
// then it all goes into three instanced meshes (tufts, stems, heads), so the dressing costs three draw calls
function addDressing(group, layout, houses) {
  const tufts = layout.tufts.filter(({ x, y }) => isClear(x, y, 1.5, houses));
  const flowers = layout.flowers.filter(({ x, y }) => isClear(x, y, HEAD_RADIUS, houses));

  const material = (color) => new THREE.MeshStandardMaterial({ color, flatShading: true });
  const matrix = new THREE.Matrix4();
  const position = new THREE.Vector3();
  const rotation = new THREE.Quaternion();
  const scale = new THREE.Vector3();
  const color = new THREE.Color();
  const up = new THREE.Vector3(0, 0, 1);

  // Grass tufts, coloured per instance
  const tuftMesh = new THREE.InstancedMesh(createTuftGeometry(), material('#FFFFFF'), Math.max(tufts.length, 1));
  tuftMesh.count = tufts.length;
  tufts.forEach(({ x, y, turn, size, color: tuftColor }, index) => {
    rotation.setFromAxisAngle(up, turn);
    tuftMesh.setMatrixAt(index, matrix.compose(position.set(x, y, 0), rotation, scale.setScalar(size)));
    tuftMesh.setColorAt(index, color.set(tuftColor));
  });

  // Wildflowers: a thin stem and a small round head on top, the heads coloured per instance
  const stemGeometry = new THREE.CylinderGeometry(0.22, 0.3, 1, 4);
  stemGeometry.translate(0, 0.5, 0);
  stemGeometry.rotateX(Math.PI / 2); // base at the origin, standing up the world Z axis
  const stemMesh = new THREE.InstancedMesh(stemGeometry, material(STEM_COLOR), Math.max(flowers.length, 1));
  const headMesh = new THREE.InstancedMesh(
    new THREE.IcosahedronGeometry(HEAD_RADIUS),
    material('#FFFFFF'),
    Math.max(flowers.length, 1),
  );
  stemMesh.count = flowers.length;
  headMesh.count = flowers.length;
  rotation.identity();
  flowers.forEach(({ x, y, height, color: headColor }, index) => {
    stemMesh.setMatrixAt(index, matrix.compose(position.set(x, y, 0), rotation, scale.set(1, 1, height)));
    headMesh.setMatrixAt(index, matrix.compose(position.set(x, y, height), rotation, scale.setScalar(1)));
    headMesh.setColorAt(index, color.set(headColor));
  });

  for (const mesh of [tuftMesh, stemMesh, headMesh]) {
    // Spread over the whole meadow: never cull them as one object
    mesh.frustumCulled = false;
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    group.add(mesh);
  }
}
