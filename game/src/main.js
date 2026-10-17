import * as THREE from 'three';
import './style.css';
import {
  PLAYER_START,
  createPlayer,
  queueHop,
  resetPlayer,
  showPlayerModel,
  updatePlayer,
} from './components/Player.js';
import { MAX_LIVES, getInvulnerableTime, getLives, hitTeam, resetLives, updateLives } from './components/Lives.js';
import { createEnemy, updateEnemy } from './components/Enemy.js';
import { createAttack, requestAttack, resetAttack, updateAttack } from './components/Attack.js';
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
import {
  createPulse,
  createPulseAbility,
  getPulseCooldown,
  requestPulse,
  resetPulse,
  resetPulseRing,
  updatePulse,
  updatePulseVisual,
} from './components/Pulse.js';
import { createInput, setGameplayEnabled } from './components/Input.js';
import { createMenu, hideMenu, menuBack, showMenu } from './components/Menu.js';
import { createPauseMenu, hidePauseMenu, pauseMenuBack, showPauseMenu } from './components/PauseMenu.js';
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

// The shared pulse ring around the flower; each player's pulse ability is created with the player
createPulse(flower);

// Everything one player owns: Tode's group (position, model, movement), its attack and its pulse ability
function createPlayerSlot(start) {
  const player = createPlayer(start);
  scene.add(player);
  return { player, attack: createAttack(player), pulse: createPulseAbility() };
}

// The active players. Only one for now; playerGroups is what collision and bee contact checks use.
const players = [createPlayerSlot(PLAYER_START)];
const playerGroups = players.map((slot) => slot.player);
const playerOne = players[0];

// The camera follows Player 1, as before
playerOne.player.add(camera);

// Houses keep clear of the flower (origin), Tode's start, his current spot, and the enemy spawn corners
const houses = createHouses(map, MAP_SIZE, [
  new THREE.Vector2(0, 0),
  PLAYER_START,
  playerOne.player.position,
  ...SPAWN_POINTS,
]);

createScore();
createGameOver({ onRestart: startGame, onMainMenu: returnToMenu });
createHud(MAX_LIVES);
createPauseMenu({ onResume: resume, onRestart: startGame, onMainMenu: returnToMenu });
createMenu({ onPlay: startGame });

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

let spawnTimer = 0;
let timeLeft = SURVIVAL_TIME;

// 'menu' | 'playing' | 'paused' | 'victory' | 'defeat'. The game opens on the main menu, with the
// garden shown and no bees; a run only starts from startGame().
let gameState = 'menu';

function setGameState(state) {
  gameState = state;
  // Gameplay keys only act while playing, so nothing pressed in a menu or while paused carries over
  setGameplayEnabled(state === 'playing');
  // Lets the stylesheet hide the HUD on the main menu
  document.body.dataset.state = state;
}

// A focused menu button would otherwise react to Space or Enter during play
function blurFocusedButton() {
  if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
}

createInput({
  gameplay: {
    ArrowUp: () => queueHop(playerOne.player, 'up'),
    ArrowDown: () => queueHop(playerOne.player, 'down'),
    ArrowLeft: () => queueHop(playerOne.player, 'left'),
    ArrowRight: () => queueHop(playerOne.player, 'right'),
    Space: () => requestAttack(playerOne.attack),
    KeyE: () => requestPulse(playerOne.pulse),
  },
  ui: {
    Escape: handleEscape,
    // On the end screens Space restarts, unless a button has focus: the button then handles the press itself
    Space: (event) => {
      const ended = gameState === 'victory' || gameState === 'defeat';
      if (ended && !(event.target instanceof HTMLButtonElement)) startGame();
    },
  },
});

function handleEscape() {
  if (gameState === 'playing') {
    pause();
  } else if (gameState === 'paused') {
    if (!pauseMenuBack()) resume();
  } else if (gameState === 'menu') {
    menuBack();
  }
}

function pause() {
  setGameState('paused');
  showPauseMenu();
}

// Continues exactly where the game was paused: nothing gameplay-related ran in the meantime
function resume() {
  hidePauseMenu();
  blurFocusedButton();
  setGameState('playing');
}

setGameState('menu');
showMenu();

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

function endGame(outcome) {
  setGameState(outcome === 'won' ? 'victory' : 'defeat');
  for (const { player } of players) {
    if (outcome === 'won') {
      // Tode stays on screen for the victory, without being left mid-blink
      showPlayerModel(player);
    } else {
      player.visible = false;
    }
  }
  showGameOver(OUTCOMES[outcome]);
}

// Clears everything a run changes, back to the calm garden: no bees, full flower, Tode at the start.
// The scene, map, houses and models themselves are created once and kept.
function resetRun() {
  for (const enemy of enemies) {
    scene.remove(enemy);
    disposeEnemy(enemy);
  }
  enemies.length = 0;
  spawnTimer = 0;
  timeLeft = SURVIVAL_TIME;

  for (const slot of players) {
    resetPlayer(slot.player);
    resetAttack(slot.attack);
    resetPulse(slot.pulse);
  }
  resetPulseRing();
  resetLives();
  resetFlower();
  resetScore();
  hideGameOver();
}

// Starts a fresh run: from the main menu, the pause menu or an end screen
function startGame() {
  resetRun();
  SPAWN_POINTS.forEach((point) => spawnEnemy(point));
  hideMenu();
  hidePauseMenu();
  blurFocusedButton();
  setGameState('playing');
}

function returnToMenu() {
  resetRun();
  hidePauseMenu();
  setGameState('menu');
  showMenu();
}

// Returns the outcome that ends the game this frame ('caught', 'flower' or 'won'), or null to keep playing.
// A defeat ends the frame as soon as it happens; victory is checked last, so a defeat in the same frame wins.
function updateGame(delta) {
  // Difficulty grows linearly with the score; enemy parameters scale faster than the player's
  const difficulty = Math.min(getScore() * DIFFICULTY_GROWTH_RATE, MAX_DIFFICULTY);
  const enemyScale = 1 + difficulty;
  const playerScale = 1 + difficulty * PLAYER_SCALING_RATIO;

  // The invulnerability window counts down first, before any hit this frame (as it always has)
  updateLives(delta);

  // Running into a bee costs a life (hitTeam ignores hits during the invulnerability window)
  for (const { player } of players) {
    const touchedEnemy = updatePlayer(player, delta, enemies, flower, houses, playerScale, getInvulnerableTime());
    if (touchedEnemy && hitTeam() === 0) return 'caught';
  }

  // Collect every attack's defeated bees in a set, so a bee is never removed or scored twice,
  // then remove them after collecting, so the array isn't changed while it's iterated
  const defeated = new Set();
  for (const { attack } of players) {
    for (const enemy of updateAttack(attack, enemies, delta, playerScale)) defeated.add(enemy);
  }
  for (const enemy of defeated) {
    removeEnemy(enemy);
  }

  // Only enemies defeated by an attack earn kill points
  updateScore(delta, defeated.size);

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
  for (const { pulse } of players) {
    updatePulse(pulse, delta, enemies, flower);
  }

  for (const enemy of enemies) {
    const result = updateEnemy(enemy, flower, playerGroups, delta, enemies, houses, enemyScale);
    if (result === 'player' && hitTeam() === 0) return 'caught';
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

  // Gameplay only runs while playing. In every other state the scene is frozen but keeps rendering.
  // The clock is still read every frame, so resuming never sees a large delta.
  if (gameState === 'playing') {
    const outcome = updateGame(delta);
    if (outcome) endGame(outcome);
  }

  // Visual-only updates also run on the end screens, so a hit flash or pulse ring can finish and the final
  // wilt or bloom stays on screen. They stay frozen while paused and on the main menu.
  if (gameState === 'playing' || gameState === 'victory' || gameState === 'defeat') {
    updateFlower(delta, (SURVIVAL_TIME - timeLeft) / SURVIVAL_TIME);
    updatePulseVisual(delta);
  }

  // Runs while frozen too, so the end screen keeps the final values
  updateHud({
    flowerHealth: getFlowerHealth(),
    flowerMaxHealth: FLOWER_MAX_HEALTH,
    lives: getLives(),
    timeLeft,
    wave: getWaveIndex() + 1,
    waveCount: WAVES.length,
    pulseCooldown: getPulseCooldown(playerOne.pulse),
  });

  renderer.render(scene, camera);
});
