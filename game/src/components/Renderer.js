import * as THREE from 'three';

export function createRenderer() {
  const canvas = document.querySelector('canvas.game');
  const renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true });
  renderer.setPixelRatio(window.devicePixelRatio);
  renderer.setSize(window.innerWidth, window.innerHeight);

  // Keep filling the window when it is resized
  window.addEventListener('resize', () => renderer.setSize(window.innerWidth, window.innerHeight));

  return renderer;
}
