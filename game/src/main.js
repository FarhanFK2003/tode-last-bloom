import * as THREE from 'three';
import './style.css';
import { createPlayer, updatePlayer } from './components/Player.js';
import { createEnemy, updateEnemy } from './components/Enemy.js';
import { createCamera } from './components/Camera.js';
import { createRenderer } from './components/Renderer.js';

const MAP_SIZE = 500;
const SPAWN_POINTS = [
  new THREE.Vector2(-MAP_SIZE / 2, -MAP_SIZE / 2),
  new THREE.Vector2(MAP_SIZE / 2, -MAP_SIZE / 2),
  new THREE.Vector2(MAP_SIZE / 2, MAP_SIZE / 2),
  new THREE.Vector2(-MAP_SIZE / 2, MAP_SIZE / 2),
];
const SPAWN_DELAY = 3; // seconds
const MAX_DELTA = 0.1; // seconds; avoids huge jumps after the tab was hidden

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

const enemies = [];

function spawnEnemy(position) {
  const enemy = createEnemy(position);
  enemies.push(enemy);
  scene.add(enemy);
}

SPAWN_POINTS.forEach((point) => spawnEnemy(point));
let spawnTimer = 0;

const clock = new THREE.Clock();

renderer.setAnimationLoop(() => {
  // Read delta once per frame and share it with every system that needs it
  const delta = Math.min(clock.getDelta(), MAX_DELTA);

  updatePlayer(player, delta, enemies);

  spawnTimer += delta;
  if (spawnTimer >= SPAWN_DELAY) {
    spawnTimer -= SPAWN_DELAY;
    spawnEnemy(SPAWN_POINTS[Math.floor(Math.random() * SPAWN_POINTS.length)]);
  }

  for (const enemy of enemies) {
    updateEnemy(enemy, player, delta, enemies);
  }

  renderer.render(scene, camera);
});
