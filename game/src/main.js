import * as THREE from 'three';
import './style.css';
import {
  PLAYER_LIVES,
  PLAYER_START,
  createPlayer,
  getPlayerLives,
  hitPlayer,
  resetPlayer,
  showPlayerModel,
  updatePlayer,
} from './components/Player.js';
import { createEnemy, updateEnemy } from './components/Enemy.js';
import { createAttack, resetAttack, updateAttack } from './components/Attack.js';
import { createScore, getScore, resetScore, updateScore } from './components/Score.js';
import { createGameOver, hideGameOver, showGameOver } from './components/GameOver.js';
import { createMap } from './components/Map.js';
import { createHouses } from './components/House.js';
import {
  FLOWER_MAX_HEALTH,
  createFlower,
  damageFlower,
  getFlowerHealth,
  resetFlower,
  updateFlower,
} from './components/Flower.js';
import { createHud, updateHud } from './components/Hud.js';
import { createPulse, getPulseCooldown, resetPulse, updatePulse, updatePulseVisual } from './components/Pulse.js';
import { createCamera } from './components/Camera.js';
import { createRenderer } from './components/Renderer.js';

const MAP_SIZE = 500;
const TILE_SIZE = 20;
const SPAWN_POINTS = [
  new THREE.Vector2(-MAP_SIZE / 2, -MAP_SIZE / 2),
  new THREE.Vector2(MAP_SIZE / 2, -MAP_SIZE / 2),
  new THREE.Vector2(MAP_SIZE / 2, MAP_SIZE / 2),
  new THREE.Vector2(-MAP_SIZE / 2, MAP_SIZE / 2),
];
// Bee waves by elapsed survival time: how often a bee spawns, and how many may be active at once
const WAVES = [
  { start: 0, spawnInterval: 3.0, maxActive: 8 },
  { start: 30, spawnInterval: 2.2, maxActive: 12 },
  { start: 60, spawnInterval: 1.6, maxActive: 16 },
  { start: 90, spawnInterval: 1.1, maxActive: 20 },
];
const MAX_DELTA = 0.1; // seconds; avoids huge jumps after the tab was hidden

const DIFFICULTY_GROWTH_RATE = 0.005; // difficulty gained per score point
const MAX_DIFFICULTY = 2; // enemies reach x3, the player x2
const PLAYER_SCALING_RATIO = 0.5; // player parameters grow at half the enemy rate

const SURVIVAL_TIME = 120; // seconds Tode must protect the flower to win

// End-screen text for each way a game can end
const OUTCOMES = {
  won: { title: 'THE FLOWER BLOOMED', message: 'You protected it for 2 minutes', victory: true },
  flower: { title: 'DEFEAT', message: 'The flower wilted', victory: false },
  caught: { title: 'DEFEAT', message: 'Tode was caught', victory: false },
};

const scene = new THREE.Scene();

const ambientLight = new THREE.AmbientLight(0xffffff, 1.5);
scene.add(ambientLight);

const directionalLight = new THREE.DirectionalLight(0xffffff, 1.5);
directionalLight.position.set(-100, -100, 200);
scene.add(directionalLight);

const renderer = createRenderer();
const camera = createCamera();

const map = createMap(MAP_SIZE, TILE_SIZE);
scene.add(map);

const flower = createFlower();
scene.add(flower);

const player = createPlayer();
player.add(camera);
scene.add(player);

// Houses keep clear of the flower (origin), Tode's start, his current spot, and the enemy spawn corners
const houses = createHouses(map, MAP_SIZE, [
  new THREE.Vector2(0, 0),
  PLAYER_START,
  player.position,
  ...SPAWN_POINTS,
]);

createAttack(player);
createPulse(flower);
createScore();
createGameOver();
createHud(PLAYER_LIVES);

const enemies = [];

function spawnEnemy(position) {
  const enemy = createEnemy(position);
  enemies.push(enemy);
  scene.add(enemy);
}

// Each bee copy has its own skeletons (its geometry and materials are shared with the loaded template),
// and the renderer gives every skeleton a small GPU texture, so free those when a bee goes away
function disposeEnemy(enemy) {
  const skeletons = new Set();
  enemy.traverse((object) => {
    if (object.isSkinnedMesh) skeletons.add(object.skeleton);
  });
  for (const skeleton of skeletons) {
    skeleton.dispose();
  }
}

function removeEnemy(enemy) {
  scene.remove(enemy);
  disposeEnemy(enemy);
  enemies.splice(enemies.indexOf(enemy), 1);
}

SPAWN_POINTS.forEach((point) => spawnEnemy(point));
let spawnTimer = 0;

let timeLeft = SURVIVAL_TIME;
let gameOver = false;
let resetRequested = false;

// Space attacks while playing (handled in Attack.js); after Game Over it restarts the game.
// The reset itself runs in the animation loop, which also clears the attack this press requested.
window.addEventListener('keydown', (event) => {
  if (event.code !== 'Space' || event.repeat || !gameOver) return;
  resetRequested = true;
});

// The current wave follows from the survival timer, so it can never drift out of sync with it.
// Once time has run out (victory), it stays on the last wave.
function getWaveIndex() {
  const elapsed = SURVIVAL_TIME - timeLeft;
  let index = 0;
  while (index + 1 < WAVES.length && elapsed >= WAVES[index + 1].start) {
    index += 1;
  }
  return index;
}

function triggerGameOver(outcome) {
  gameOver = true;
  if (outcome === 'won') {
    // Tode stays on screen for the victory, without being left mid-blink
    showPlayerModel();
  } else {
    player.visible = false;
  }
  showGameOver(OUTCOMES[outcome]);
}

function resetGame() {
  for (const enemy of enemies) {
    scene.remove(enemy);
    disposeEnemy(enemy);
  }
  enemies.length = 0;
  SPAWN_POINTS.forEach((point) => spawnEnemy(point));
  spawnTimer = 0;
  timeLeft = SURVIVAL_TIME;

  resetPlayer(player);
  resetFlower();
  resetAttack();
  resetPulse();
  resetScore();
  hideGameOver();

  gameOver = false;
  resetRequested = false;
}

// Returns the outcome that ends the game this frame ('caught', 'flower' or 'won'), or null to keep playing.
// A defeat ends the frame as soon as it happens; victory is checked last, so a defeat in the same frame wins.
function updateGame(delta) {
  // Difficulty grows linearly with the score; enemy parameters scale faster than the player's
  const difficulty = Math.min(getScore() * DIFFICULTY_GROWTH_RATE, MAX_DIFFICULTY);
  const enemyScale = 1 + difficulty;
  const playerScale = 1 + difficulty * PLAYER_SCALING_RATIO;

  // Running into a bee costs a life (hitPlayer ignores hits while Tode is invulnerable)
  if (updatePlayer(player, delta, enemies, flower, houses, playerScale) && hitPlayer() === 0) return 'caught';

  // Remove defeated enemies after collecting them, so the array isn't changed while it's iterated
  const defeated = updateAttack(player, enemies, delta, playerScale);
  for (const enemy of defeated) {
    removeEnemy(enemy);
  }

  // Only enemies defeated by the attack earn kill points
  updateScore(delta, defeated.length);

  // Spawning follows the current wave, independent of the score. The timer accumulates the shared delta,
  // but pauses while the wave's cap of active bees is reached, so freeing several slots can't release a burst
  const wave = WAVES[getWaveIndex()];
  if (enemies.length < wave.maxActive) {
    spawnTimer += delta;
    if (spawnTimer >= wave.spawnInterval) {
      spawnTimer -= wave.spawnInterval;
      spawnEnemy(SPAWN_POINTS[Math.floor(Math.random() * SPAWN_POINTS.length)]);
    }
  }

  // The bloom pulse marks bees near the flower for pushback before they move this frame
  updatePulse(delta, enemies, flower);

  for (const enemy of enemies) {
    const result = updateEnemy(enemy, flower, player, delta, enemies, houses, enemyScale);
    if (result === 'player' && hitPlayer() === 0) return 'caught';
    if (result === 'bite' && damageFlower(1) === 0) return 'flower';
  }

  // The survival timer only runs while playing, so it stops as soon as the game ends
  timeLeft = Math.max(timeLeft - delta, 0);
  if (timeLeft === 0) return 'won';

  return null;
}

const clock = new THREE.Clock();

renderer.setAnimationLoop(() => {
  // Read delta once per frame and share it with every system that needs it
  const delta = Math.min(clock.getDelta(), MAX_DELTA);

  // While the game is over, nothing updates, but the frozen scene keeps rendering
  if (gameOver) {
    if (resetRequested) resetGame();
  } else {
    const outcome = updateGame(delta);
    if (outcome) triggerGameOver(outcome);
  }

  // The flower's look (hit flash, wilt, bloom) is visual only, so it also updates after the game ends
  updateFlower(delta, (SURVIVAL_TIME - timeLeft) / SURVIVAL_TIME);
  // Likewise, a pulse ring that is already expanding finishes after the game ends
  updatePulseVisual(delta);

  // Runs while frozen too, so the end screen keeps the final values
  updateHud({
    flowerHealth: getFlowerHealth(),
    flowerMaxHealth: FLOWER_MAX_HEALTH,
    lives: getPlayerLives(),
    timeLeft,
    wave: getWaveIndex() + 1,
    waveCount: WAVES.length,
    pulseCooldown: getPulseCooldown(),
  });

  renderer.render(scene, camera);
});
