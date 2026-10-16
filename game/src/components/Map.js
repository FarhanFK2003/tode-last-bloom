import * as THREE from 'three';

const DARK_GREEN = '#228B22';
const LIGHT_GREEN = '#90EE90';

export function createMap(size, tileSize) {
  const map = new THREE.Group();
  const tileCount = Math.round(size / tileSize);

  // Paint one canvas pixel per tile, then stretch it over the floor without smoothing
  const canvas = document.createElement('canvas');
  canvas.width = tileCount;
  canvas.height = tileCount;
  const context = canvas.getContext('2d');
  for (let row = 0; row < tileCount; row++) {
    for (let column = 0; column < tileCount; column++) {
      context.fillStyle = (row + column) % 2 === 0 ? DARK_GREEN : LIGHT_GREEN;
      context.fillRect(column, row, 1, 1);
    }
  }

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
