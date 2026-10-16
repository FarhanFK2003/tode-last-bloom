import * as THREE from 'three';
import './style.css';
import { createPlayer, resetPlayer, updatePlayer } from './components/Player.js';
import { createEnemy, updateEnemy } from './components/Enemy.js';
import { createAttack, resetAttack, updateAttack } from './components/Attack.js';
import { createScore, resetScore, updateScore } from './components/Score.js';
import { createGameOver, hideGameOver, showGameOver } from './components/GameOver.js';
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

createAttack(player);
createScore();
createGameOver();

const enemies = [];

function spawnEnemy(position) {
  const enemy = createEnemy(position);
  enemies.push(enemy);
  scene.add(enemy);
}

function removeEnemy(enemy) {
  scene.remove(enemy);
  enemies.splice(enemies.indexOf(enemy), 1);
}

SPAWN_POINTS.forEach((point) => spawnEnemy(point));
let spawnTimer = 0;

let gameOver = false;
let resetRequested = false;

// Space attacks while playing (handled in Attack.js); after Game Over it restarts the game.
// The reset itself runs in the animation loop, which also clears the attack this press requested.
window.addEventListener('keydown', (event) => {
  if (event.code !== 'Space' || event.repeat || !gameOver) return;
  resetRequested = true;
});

function triggerGameOver() {
  gameOver = true;
  player.visible = false;
  showGameOver();
}

function resetGame() {
  for (const enemy of enemies) {
    scene.remove(enemy);
  }
  enemies.length = 0;
  SPAWN_POINTS.forEach((point) => spawnEnemy(point));
  spawnTimer = 0;

  resetPlayer(player);
  resetAttack();
  resetScore();
  hideGameOver();

  gameOver = false;
  resetRequested = false;
}

// Returns true as soon as Tode and an enemy run into each other;
// Game Over then takes priority over everything else in the frame
function updateGame(delta) {
  if (updatePlayer(player, delta, enemies)) return true;

  // Remove defeated enemies after collecting them, so the array isn't changed while it's iterated
  const defeated = updateAttack(player, enemies, delta);
  for (const enemy of defeated) {
    removeEnemy(enemy);
  }

  // Only enemies defeated by the attack earn kill points
  updateScore(delta, defeated.length);

  spawnTimer += delta;
  if (spawnTimer >= SPAWN_DELAY) {
    spawnTimer -= SPAWN_DELAY;
    spawnEnemy(SPAWN_POINTS[Math.floor(Math.random() * SPAWN_POINTS.length)]);
  }

  for (const enemy of enemies) {
    if (updateEnemy(enemy, player, delta, enemies)) return true;
  }

  return false;
}

const clock = new THREE.Clock();

renderer.setAnimationLoop(() => {
  // Read delta once per frame and share it with every system that needs it
  const delta = Math.min(clock.getDelta(), MAX_DELTA);

  // While the game is over, nothing updates, but the frozen scene keeps rendering
  if (gameOver) {
    if (resetRequested) resetGame();
  } else if (updateGame(delta)) {
    triggerGameOver();
  }

  renderer.render(scene, camera);
});
