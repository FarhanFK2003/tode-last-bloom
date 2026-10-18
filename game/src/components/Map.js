import * as THREE from 'three';

// Meadow ground: soft irregular patches over a base colour, painted at this many canvas pixels per side
const MEADOW_RESOLUTION = 128;
const MEADOW_PATCHES = 45;
const MEADOW_SPECKLES = 500;

// The ground, given by the level:
//   'checker': a checkerboard of two alternating colours ([dark, light]), one tile per tileSize
//   'meadow':  a base colour with irregular lighter patches and darker speckles ([base, patch, speckle])
export function createMap(size, tileSize, colors, pattern = 'checker') {
  const map = new THREE.Group();
  const canvas = pattern === 'meadow' ? paintMeadow(colors) : paintChecker(Math.round(size / tileSize), colors);

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
