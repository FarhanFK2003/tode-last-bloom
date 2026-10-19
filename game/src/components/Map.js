import * as THREE from 'three';

// Meadow ground: soft irregular patches over a base colour, painted at this many canvas pixels per side
const MEADOW_RESOLUTION = 128;
const MEADOW_PATCHES = 45;
const MEADOW_SPECKLES = 500;

// Garden ground: painted at one canvas pixel per GARDEN_UNITS_PER_PIXEL world units, so a 20-unit hop tile is a
// whole number of pixels. All sizes below are in world units.
const GARDEN_UNITS_PER_PIXEL = 2;
const GARDEN_PATCHES = 70; // soft lighter and darker drifts of grass
const GARDEN_SPECKLES = 1400;
const GARDEN_FLOWER_SPECKS = 90; // tiny warm dots, like far-off buttercups, kept off the paths and clearing
const GARDEN_CLEARING_RADIUS = 72; // solid sandy clearing around the flower (the pickup ring is at 90)
const GARDEN_CLEARING_FADE = 12; // its edge softens into the grass over this distance
const GARDEN_CLEARING_RING = 58; // a faint stone-ring line inside the clearing
const GARDEN_PATH_WIDTH = 16;
const GARDEN_PATH_WAVE = 6; // the paths meander a little either side of the diagonals
const GARDEN_GRID_ALPHA = 0.035; // alternate hop tiles are this much darker: a hint of the grid, not a checkerboard

// Coast ground: painted like the Garden's, one canvas pixel per COAST_UNITS_PER_PIXEL world units. Sizes in world
// units unless marked as pixels.
const COAST_UNITS_PER_PIXEL = 2;
const COAST_SEED = 37;
const COAST_DRIFTS = 60; // soft lighter and darker drifts of sand
const COAST_RIPPLES = 240; // short wind-ripple streaks
const COAST_RIPPLE_ANGLE = 0.5; // radians: the wind lays them all roughly the same way
const COAST_SHELLS = 70; // tiny pale shell dots
const COAST_PEBBLES = 110; // tiny grey pebble dots
const COAST_DAMP_WIDTH = 22; // darker damp sand along the edge, meeting the foam beyond it
const COAST_DAMP_WAVE = 7; // the damp band's inner edge wanders in and out by up to this
const COAST_DAMP_STRENGTH = 0.55; // how dark it gets right at the edge (0: dry, 1: the damp colour)
const COAST_GRID_ALPHA = 0.025; // an even fainter hint of the hop grid than the Garden's

// The ground, given by the level:
//   'checker': a checkerboard of two alternating colours ([dark, light]), one tile per tileSize
//   'meadow':  a base colour with irregular lighter patches and darker speckles ([base, patch, speckle])
//   'garden':  the Garden's meadow: grass with soft lighter and darker drifts, a sandy clearing around the
//              flower, four meandering paths to the corners and a faint hint of the hop grid
//              ([grass, light grass, dark grass, speckle, path, clearing, flower speck])
//   'coast':   the Coast's beach: sand with soft drifts, wind ripples, a few tiny shells and pebbles, darker damp
//              sand along the edge and a faint hint of the hop grid
//              ([sand, light sand, dark sand, damp sand, shell, pebble])
export function createMap(size, tileSize, colors, pattern = 'checker') {
  const map = new THREE.Group();
  let canvas;
  if (pattern === 'meadow') canvas = paintMeadow(colors);
  else if (pattern === 'garden') canvas = paintGarden(size, tileSize, colors);
  else if (pattern === 'coast') canvas = paintCoast(size, tileSize, colors);
  else canvas = paintChecker(Math.round(size / tileSize), colors);

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.magFilter = THREE.NearestFilter;
  texture.minFilter = THREE.NearestFilter;
  texture.generateMipmaps = false;

  // PlaneGeometry already lies in the XY (ground) plane, centred on the origin at z = 0.
  // MeshBasicMaterial ignores lighting, so the tiles keep their exact colours.
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(size, size), new THREE.MeshBasicMaterial({ map: texture }));
  map.add(floor);

  return map;
}

// One canvas pixel per tile, stretched over the floor without smoothing
function paintChecker(tileCount, [darkColor, lightColor]) {
  const canvas = document.createElement('canvas');
  canvas.width = tileCount;
  canvas.height = tileCount;
  const context = canvas.getContext('2d');
  for (let row = 0; row < tileCount; row++) {
    for (let column = 0; column < tileCount; column++) {
      context.fillStyle = (row + column) % 2 === 0 ? darkColor : lightColor;
      context.fillRect(column, row, 1, 1);
    }
  }
  return canvas;
}

// Seeded random numbers, so a painted ground is the same on every load
function createRandom(seed) {
  let state = seed;
  return () => {
    state = (state * 1664525 + 1013904223) % 4294967296;
    return state / 4294967296;
  };
}

// The Garden's meadow. The canvas covers the map exactly: world (x, y) is canvas pixel
// ((x + half) / scale, (half - y) / scale).
// Paths and the clearing are painted here, so they are only colour on the ground: nothing to bump into.
function paintGarden(size, tileSize, [grass, lightGrass, darkGrass, speckle, path, clearing, flowerSpeck]) {
  const scale = GARDEN_UNITS_PER_PIXEL;
  const pixels = Math.round(size / scale);
  const half = size / 2;
  const toPixel = (units) => units / scale;
  const centre = pixels / 2;
  const canvas = document.createElement('canvas');
  canvas.width = pixels;
  canvas.height = pixels;
  const context = canvas.getContext('2d');
  const random = createRandom(23);

  context.fillStyle = grass;
  context.fillRect(0, 0, pixels, pixels);

  // Soft drifts of lighter and darker grass: low-opacity clusters of round blobs
  for (let i = 0; i < GARDEN_PATCHES; i++) {
    context.fillStyle = i % 3 === 0 ? darkGrass : lightGrass;
    context.globalAlpha = 0.35 + random() * 0.25;
    const x = random() * pixels;
    const y = random() * pixels;
    for (let blob = 0; blob < 5; blob++) {
      context.beginPath();
      context.arc(x + (random() - 0.5) * 18, y + (random() - 0.5) * 18, 3 + random() * 7, 0, Math.PI * 2);
      context.fill();
    }
  }

  context.globalAlpha = 0.6;
  context.fillStyle = speckle;
  for (let i = 0; i < GARDEN_SPECKLES; i++) {
    context.fillRect(Math.floor(random() * pixels), Math.floor(random() * pixels), 1, 1);
  }

  // Four paths from the clearing to the corners where bees arrive: a soft wide band under a narrower one,
  // with a gentle sideways wave so they don't look ruled
  context.lineCap = 'round';
  context.lineJoin = 'round';
  context.strokeStyle = path;
  for (const [cornerX, cornerY] of [
    [-1, -1],
    [1, -1],
    [1, 1],
    [-1, 1],
  ]) {
    const points = [];
    const startLength = GARDEN_CLEARING_RADIUS - 4;
    const endLength = half * Math.SQRT2;
    for (let length = startLength; length <= endLength; length += 10) {
      const along = length / Math.SQRT2;
      const wave = Math.sin(length / 45 + cornerX * 1.3 + cornerY * 0.7) * GARDEN_PATH_WAVE;
      // Sideways is perpendicular to the diagonal
      const x = cornerX * along + (-cornerY / Math.SQRT2) * wave;
      const y = cornerY * along + (cornerX / Math.SQRT2) * wave;
      points.push([centre + toPixel(x), centre - toPixel(y)]);
    }
    for (const [width, alpha] of [
      [GARDEN_PATH_WIDTH * 1.6, 0.25],
      [GARDEN_PATH_WIDTH, 0.55],
    ]) {
      context.globalAlpha = alpha;
      context.lineWidth = toPixel(width);
      context.beginPath();
      points.forEach(([x, y], index) => (index === 0 ? context.moveTo(x, y) : context.lineTo(x, y)));
      context.stroke();
    }
  }

  // The sandy clearing around the flower: solid in the middle, softening into the grass at its edge
  context.globalAlpha = 1;
  const inner = toPixel(GARDEN_CLEARING_RADIUS);
  const outer = toPixel(GARDEN_CLEARING_RADIUS + GARDEN_CLEARING_FADE);
  const fade = context.createRadialGradient(centre, centre, inner * 0.8, centre, centre, outer);
  fade.addColorStop(0, clearing);
  fade.addColorStop(1, `${clearing}00`);
  context.fillStyle = fade;
  context.beginPath();
  context.arc(centre, centre, outer, 0, Math.PI * 2);
  context.fill();
  context.fillStyle = clearing;
  context.beginPath();
  context.arc(centre, centre, inner * 0.8, 0, Math.PI * 2);
  context.fill();

  // A faint stone-ring line inside the clearing, framing the flower
  context.globalAlpha = 0.3;
  context.strokeStyle = path;
  context.lineWidth = toPixel(3);
  context.beginPath();
  context.arc(centre, centre, toPixel(GARDEN_CLEARING_RING), 0, Math.PI * 2);
  context.stroke();

  // Tiny warm flower specks out in the grass, away from the clearing and the paths
  context.globalAlpha = 0.85;
  context.fillStyle = flowerSpeck;
  let placed = 0;
  while (placed < GARDEN_FLOWER_SPECKS) {
    const x = (random() - 0.5) * size;
    const y = (random() - 0.5) * size;
    const nearDiagonal = Math.abs(Math.abs(x) - Math.abs(y)) / Math.SQRT2 < GARDEN_PATH_WIDTH * 1.5;
    if (Math.hypot(x, y) < GARDEN_CLEARING_RADIUS + 30 || nearDiagonal) continue;
    context.fillRect(Math.floor(centre + toPixel(x)), Math.floor(centre - toPixel(y)), 1, 1);
    placed += 1;
  }

  // A faint hint of the 20-unit hop grid: alternate tiles very slightly darker, over everything
  context.globalAlpha = GARDEN_GRID_ALPHA;
  context.fillStyle = '#000000';
  const tile = toPixel(tileSize);
  const tiles = Math.round(size / tileSize);
  for (let row = 0; row < tiles; row++) {
    for (let column = 0; column < tiles; column++) {
      if ((row + column) % 2 === 0) context.fillRect(column * tile, row * tile, tile, tile);
    }
  }

  context.globalAlpha = 1;
  return canvas;
}

// The Coast's beach. Like the Garden's, the canvas covers the map exactly, one pixel per COAST_UNITS_PER_PIXEL
// world units, and everything is only colour on the ground.
function paintCoast(size, tileSize, [sand, lightSand, darkSand, damp, shell, pebble]) {
  const scale = COAST_UNITS_PER_PIXEL;
  const pixels = Math.round(size / scale);
  const canvas = document.createElement('canvas');
  canvas.width = pixels;
  canvas.height = pixels;
  const context = canvas.getContext('2d');
  const random = createRandom(COAST_SEED);

  context.fillStyle = sand;
  context.fillRect(0, 0, pixels, pixels);

  // Soft drifts of lighter and darker sand: low-opacity clusters of round blobs
  for (let i = 0; i < COAST_DRIFTS; i++) {
    context.fillStyle = i % 2 === 0 ? lightSand : darkSand;
    context.globalAlpha = 0.25 + random() * 0.2;
    const x = random() * pixels;
    const y = random() * pixels;
    for (let blob = 0; blob < 5; blob++) {
      context.beginPath();
      context.arc(x + (random() - 0.5) * 24, y + (random() - 0.5) * 24, 4 + random() * 8, 0, Math.PI * 2);
      context.fill();
    }
  }

  // Wind ripples: short, gently bent, faint streaks, all running roughly the same way
  context.strokeStyle = darkSand;
  context.lineWidth = 1;
  context.lineCap = 'round';
  for (let i = 0; i < COAST_RIPPLES; i++) {
    context.globalAlpha = 0.12 + random() * 0.12;
    const x = random() * pixels;
    const y = random() * pixels;
    const half = 3 + random() * 5; // pixels
    const angle = COAST_RIPPLE_ANGLE + (random() - 0.5) * 0.4;
    const bend = (random() - 0.5) * 3;
    const dx = Math.cos(angle) * half;
    const dy = Math.sin(angle) * half;
    context.beginPath();
    context.moveTo(x - dx, y - dy);
    context.quadraticCurveTo(x - Math.sin(angle) * bend, y + Math.cos(angle) * bend, x + dx, y + dy);
    context.stroke();
  }

  // A few tiny shells and pebbles
  for (const [count, color, alpha] of [
    [COAST_SHELLS, shell, 0.9],
    [COAST_PEBBLES, pebble, 0.7],
  ]) {
    context.globalAlpha = alpha;
    context.fillStyle = color;
    for (let i = 0; i < count; i++) {
      context.fillRect(Math.floor(random() * pixels), Math.floor(random() * pixels), 1, 1);
    }
  }
  context.globalAlpha = 1;

  // Damp sand along the edge, meeting the foam: each pixel is darkened towards the damp colour by how close it is
  // to its nearest edges. Each side's band wanders in and out on its own, and where two sides meet at a corner
  // the darker of the two is kept, so the corners join without a seam.
  const image = context.getImageData(0, 0, pixels, pixels);
  const data = image.data;
  // The damp colour's red, green and blue as canvas values (0-255), read straight from its '#RRGGBB' hex
  const dampRGB = [0, 1, 2].map((c) => parseInt(damp.slice(1 + c * 2, 3 + c * 2), 16));
  const bandWidth = (along, side) =>
    COAST_DAMP_WIDTH + Math.sin(along / 37 + side * 1.7) * COAST_DAMP_WAVE + Math.sin(along / 13 + side) * 2;
  for (let row = 0; row < pixels; row++) {
    for (let column = 0; column < pixels; column++) {
      const x = (column + 0.5) * scale; // world units from the left and top edges of the map
      const y = (row + 0.5) * scale;
      const near = Math.max(
        1 - x / bandWidth(y, 0),
        1 - (size - x) / bandWidth(y, 1),
        1 - y / bandWidth(x, 2),
        1 - (size - y) / bandWidth(x, 3),
      );
      if (near <= 0) continue;
      const amount = near * near * COAST_DAMP_STRENGTH;
      const index = (row * pixels + column) * 4;
      for (let c = 0; c < 3; c++) data[index + c] += (dampRGB[c] - data[index + c]) * amount;
    }
  }
  context.putImageData(image, 0, 0);

  // A very faint hint of the 20-unit hop grid: alternate tiles very slightly darker, over everything
  context.globalAlpha = COAST_GRID_ALPHA;
  context.fillStyle = '#000000';
  const tile = tileSize / scale;
  const tiles = Math.round(size / tileSize);
  for (let row = 0; row < tiles; row++) {
    for (let column = 0; column < tiles; column++) {
      if ((row + column) % 2 === 0) context.fillRect(column * tile, row * tile, tile, tile);
    }
  }
  context.globalAlpha = 1;
  return canvas;
}

// Patches are clusters of overlapping round blobs; the same seed gives the same meadow on every load
function paintMeadow([baseColor, patchColor, speckleColor]) {
  const canvas = document.createElement('canvas');
  canvas.width = MEADOW_RESOLUTION;
  canvas.height = MEADOW_RESOLUTION;
  const context = canvas.getContext('2d');
  let seed = 11;
  const random = () => {
    seed = (seed * 1664525 + 1013904223) % 4294967296;
    return seed / 4294967296;
  };

  context.fillStyle = baseColor;
  context.fillRect(0, 0, MEADOW_RESOLUTION, MEADOW_RESOLUTION);

  context.fillStyle = patchColor;
  for (let i = 0; i < MEADOW_PATCHES; i++) {
    const x = random() * MEADOW_RESOLUTION;
    const y = random() * MEADOW_RESOLUTION;
    for (let blob = 0; blob < 4; blob++) {
      context.beginPath();
      context.arc(x + (random() - 0.5) * 10, y + (random() - 0.5) * 10, 2 + random() * 5, 0, Math.PI * 2);
      context.fill();
    }
  }

  context.fillStyle = speckleColor;
  for (let i = 0; i < MEADOW_SPECKLES; i++) {
    context.fillRect(Math.floor(random() * MEADOW_RESOLUTION), Math.floor(random() * MEADOW_RESOLUTION), 1, 1);
  }
  return canvas;
}
