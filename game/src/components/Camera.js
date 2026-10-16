import * as THREE from 'three';

const FOV = 30;
const NEAR = 0.1;
const FAR = 9000;

export function createCamera() {
  const camera = new THREE.PerspectiveCamera(FOV, window.innerWidth / window.innerHeight, NEAR, FAR);
  camera.position.set(300, -300, 300);
  camera.up.set(0, 0, 1);
  camera.lookAt(0, 0, 0);

  return camera;
}
