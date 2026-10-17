import * as THREE from 'three';

const FOV = 30;
const NEAR = 0.1;
const FAR = 9000;

// The camera always looks at its focus point on the ground from this offset; zoom scales the distance
const OFFSET = new THREE.Vector3(300, -300, 300);

// Co-op framing: players are kept inside this fraction of the screen's half-size, zooming out at most MAX_ZOOM
const SAFE_FRAME = 0.85;
const MAX_ZOOM = 3;
const FRAMING_STEPS = 16;
const PLAYER_TOP = 21; // a player's height at the top of a hop (model height plus hop arc)

export function createCamera() {
  const camera = new THREE.PerspectiveCamera(FOV, window.innerWidth / window.innerHeight, NEAR, FAR);
  camera.position.copy(OFFSET);
  camera.up.set(0, 0, 1);
  camera.lookAt(0, 0, 0);

  // Match the window's shape when it is resized, so the scene isn't stretched
  window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
  });

  return camera;
}

// Places the camera above a focus point on the ground. With zoom 1 and the focus on a player, this is
// exactly where the camera was when it was attached to that player.
export function placeCamera(camera, focusX, focusY, zoom = 1) {
  camera.position.set(focusX + OFFSET.x * zoom, focusY + OFFSET.y * zoom, OFFSET.z * zoom);
  camera.lookAt(focusX, focusY, 0);
}

const probe = new THREE.PerspectiveCamera();
const point = new THREE.Vector3();

// Whether every player (footprint edges, on the ground and at the top of a hop) projects inside the safe frame
function playersFit(focusX, focusY, zoom, players) {
  placeCamera(probe, focusX, focusY, zoom);
  probe.updateMatrixWorld();

  for (const player of players) {
    const radius = player.userData.collisionRadius ?? 0;
    for (const [dx, dy] of [[radius, 0], [-radius, 0], [0, radius], [0, -radius]]) {
      for (const z of [0, PLAYER_TOP]) {
        point.set(player.position.x + dx, player.position.y + dy, z).project(probe);
        if (Math.abs(point.x) > SAFE_FRAME || Math.abs(point.y) > SAFE_FRAME) return false;
      }
    }
  }
  return true;
}

// The smallest zoom (from 1 to MAX_ZOOM) that keeps all players on screen, using the camera's real projection,
// so it holds for any window shape and any direction the players are spread in
export function getFramingZoom(camera, focusX, focusY, players) {
  probe.copy(camera);
  if (playersFit(focusX, focusY, 1, players)) return 1;
  if (!playersFit(focusX, focusY, MAX_ZOOM, players)) return MAX_ZOOM;

  let low = 1;
  let high = MAX_ZOOM;
  for (let step = 0; step < FRAMING_STEPS; step++) {
    const middle = (low + high) / 2;
    if (playersFit(focusX, focusY, middle, players)) high = middle;
    else low = middle;
  }
  return high;
}
