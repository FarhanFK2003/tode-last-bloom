import * as THREE from 'three';
import './style.css';
import { createPlayer, updatePlayer } from './components/Player.js';
import { createCamera } from './components/Camera.js';
import { createRenderer } from './components/Renderer.js';

const scene = new THREE.Scene();

const ambientLight = new THREE.AmbientLight(0xffffff, 1.5);
scene.add(ambientLight);

const directionalLight = new THREE.DirectionalLight(0xffffff, 1.5);
directionalLight.position.set(-100, -100, 200);
scene.add(directionalLight);

const renderer = createRenderer();
const camera = createCamera();

const player = createPlayer();
player.add(camera);
scene.add(player);

const clock = new THREE.Clock();

renderer.setAnimationLoop(() => {
  // Read delta once per frame and share it with every system that needs it
  const delta = clock.getDelta();

  updatePlayer(player, delta);

  renderer.render(scene, camera);
});
