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
import { createHud, setHudMode, updateHud } from './components/Hud.js';
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
import { createCamera, getFramingZoom, placeCamera } from './components/Camera.js';
import { createRenderer } from './components/Renderer.js';
import { initAudio, playSound, setMusic, setMusicDucked } from './components/Audio.js';

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
const COOP_CAUGHT = { ...OUTCOMES.caught, message: 'The Todes were caught' };

// Two-player co-op: starting spots either side of the single-player start, Player 2's look and attack colour,
// and how quickly the camera eases its zoom (seconds)
const COOP_STARTS = [new THREE.Vector2(-30, -50), new THREE.Vector2(30, -50)];
const PLAYER_TWO_TINT = 0x40e0d0;
const PLAYER_TWO_TINT_STRENGTH = 0.6;
const PLAYER_TWO_ATTACK_COLOR = 0x40e0d0;
const CAMERA_ZOOM_SMOOTHING = 0.25;

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
function createPlayerSlot(start, { tint, tintStrength, attackColor } = {}) {
  const player = createPlayer(start, { tint, tintStrength });
  // pulseCooling remembers whether the pulse was cooling down last frame, for the "ready" chime
  return { player, attack: createAttack(player, attackColor), pulse: createPulseAbility(), pulseCooling: false };
}

// Both players are created once, when the game loads. Player 2 only joins the scene in co-op.
const playerOne = createPlayerSlot(PLAYER_START);
const playerTwo = createPlayerSlot(COOP_STARTS[1], {
  tint: PLAYER_TWO_TINT,
  tintStrength: PLAYER_TWO_TINT_STRENGTH,
  attackColor: PLAYER_TWO_ATTACK_COLOR,
});
const allPlayers = [playerOne, playerTwo];
scene.add(playerOne.player);

// 'single' | 'coop'. activePlayers are the slots in play; activeGroups is what collision and bee contact use.
let gameMode = 'single';
let activePlayers = [playerOne];
let activeGroups = [playerOne.player];

function setGameMode(mode) {
  gameMode = mode;
  activePlayers = mode === 'coop' ? allPlayers : [playerOne];
  activeGroups = activePlayers.map((slot) => slot.player);
  // Player 2 is only in the scene in co-op, so in single player it is never drawn, collided with or updated
  if (mode === 'coop') scene.add(playerTwo.player);
  else scene.remove(playerTwo.player);
  setHudMode(mode);
}

function startPositions() {
  return gameMode === 'coop' ? COOP_STARTS : [PLAYER_START];
}

// The camera looks at the players' midpoint. In single player that is Player 1 at zoom 1: exactly the view
// it had when it was attached to Player 1. In co-op it zooms out just enough to keep both players on screen.
let cameraZoom = 1;

function updateCamera(delta, snap) {
  const focusX = activeGroups.reduce((sum, player) => sum + player.position.x, 0) / activeGroups.length;
  const focusY = activeGroups.reduce((sum, player) => sum + player.position.y, 0) / activeGroups.length;
  const targetZoom = gameMode === 'coop' ? getFramingZoom(camera, focusX, focusY, activeGroups) : 1;

  if (snap || gameMode !== 'coop') {
    cameraZoom = targetZoom;
  } else {
    cameraZoom += (targetZoom - cameraZoom) * (1 - Math.exp(-delta / CAMERA_ZOOM_SMOOTHING));
  }
  placeCamera(camera, focusX, focusY, cameraZoom);
}

// Houses keep clear of the flower (origin), Tode's start, his current spot, and the enemy spawn corners
const houses = createHouses(map, MAP_SIZE, [
  new THREE.Vector2(0, 0),
  PLAYER_START,
  playerOne.player.position,
  ...SPAWN_POINTS,
]);

createScore();
// Restart keeps the current mode (the buttons pass a click event, so it isn't forwarded)
createGameOver({ onRestart: () => startGame(), onMainMenu: returnToMenu });
createHud(MAX_LIVES);
createPauseMenu({ onResume: resume, onRestart: () => startGame(), onMainMenu: returnToMenu });
createMenu({ onPlay: (mode) => startGame(mode) });

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
    // Player 2: only acts in co-op
    KeyW: () => gameMode === 'coop' && queueHop(playerTwo.player, 'up'),
    KeyS: () => gameMode === 'coop' && queueHop(playerTwo.player, 'down'),
    KeyA: () => gameMode === 'coop' && queueHop(playerTwo.player, 'left'),
    KeyD: () => gameMode === 'coop' && queueHop(playerTwo.player, 'right'),
    KeyF: () => gameMode === 'coop' && requestAttack(playerTwo.attack),
    KeyQ: () => gameMode === 'coop' && requestPulse(playerTwo.pulse),
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
  setMusicDucked(true);
  showPauseMenu();
}

// Continues exactly where the game was paused: nothing gameplay-related ran in the meantime
function resume() {
  hidePauseMenu();
  blurFocusedButton();
  setMusicDucked(false);
  setGameState('playing');
}

// Audio starts with the first click or key press (browsers require it); the menu music begins then
initAudio();
setGameMode('single');
setGameState('menu');
setMusic('menu');
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
  for (const { player } of activePlayers) {
    if (outcome === 'won') {
      // Tode stays on screen for the victory, without being left mid-blink
      showPlayerModel(player);
    } else {
      player.visible = false;
    }
  }
  // The game music fades out and one ending tune plays instead
  setMusic(null);
  playSound(outcome === 'won' ? 'victory' : 'defeat');
  showGameOver(outcome === 'caught' && gameMode === 'coop' ? COOP_CAUGHT : OUTCOMES[outcome]);
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

  // Every player is reset, active or not, so nothing queued or cooling down carries into the next run.
  // Player 2's spot only matters in co-op; in single player it is out of the scene.
  const starts = startPositions();
  allPlayers.forEach((slot, index) => {
    resetPlayer(slot.player, starts[index] ?? COOP_STARTS[index]);
    resetAttack(slot.attack);
    resetPulse(slot.pulse);
    slot.pulseCooling = false;
  });
  resetPulseRing();
  resetLives();
  resetFlower();
  resetScore();
  hideGameOver();
  updateCamera(0, true);
}

// Starts a fresh run in the given mode (from the mode menu), or in the current mode (Restart)
function startGame(mode = gameMode) {
  setGameMode(mode);
  resetRun();
  SPAWN_POINTS.forEach((point) => spawnEnemy(point));
  hideMenu();
  hidePauseMenu();
  blurFocusedButton();
  // The game music always starts from its beginning, also on Restart
  setMusicDucked(false);
  setMusic('game', { restart: true });
  playSound('start');
  setGameState('playing');
}

// The menu always shows the single-player garden; the mode is chosen again when Play is pressed
function returnToMenu() {
  setGameMode('single');
  resetRun();
  hidePauseMenu();
  setGameState('menu');
  setMusicDucked(false);
  setMusic('menu');
  showMenu();
}

// Player 2's own action sounds are pitched slightly higher
function soundPlayer(slot) {
  return slot === playerTwo ? 2 : 1;
}

// Costs the team a life (unless invulnerable) and returns the lives left; the sound only plays on a real loss
function damageTeam() {
  const before = getLives();
  const lives = hitTeam();
  if (lives < before) playSound('hurt');
  return lives;
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

  // Running into a bee costs a shared life (hitTeam ignores hits during the team's invulnerability window).
  // Players block each other; in co-op the map edge also blocks them.
  const bounds = gameMode === 'coop' ? MAP_SIZE / 2 : null;
  for (const slot of activePlayers) {
    const { player } = slot;
    const touchedEnemy = updatePlayer(
      player,
      delta,
      enemies,
      flower,
      houses,
      playerScale,
      getInvulnerableTime(),
      activeGroups,
      bounds,
    );
    if (player.userData.state.hopStarted) playSound('hop', { player: soundPlayer(slot) });
    if (touchedEnemy && damageTeam() === 0) return 'caught';
  }

  // Collect every attack's defeated bees in a set, so a bee is never removed or scored twice,
  // then remove them after collecting, so the array isn't changed while it's iterated
  const defeated = new Set();
  for (const slot of activePlayers) {
    for (const enemy of updateAttack(slot.attack, enemies, delta, playerScale)) defeated.add(enemy);
    if (slot.attack.fired) playSound('attack', { player: soundPlayer(slot) });
  }
  for (const enemy of defeated) {
    removeEnemy(enemy);
  }
  // One pop for all the bees defeated this frame
  if (defeated.size > 0) playSound('pop', { count: defeated.size });

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
  // Both players pulsing in the same frame makes a single pulse sound. When a player's pulse
  // comes off cooldown, a short chime plays once for that player.
  let pulsed = false;
  for (const slot of activePlayers) {
    updatePulse(slot.pulse, delta, enemies, flower);
    if (slot.pulse.fired) pulsed = true;
    const cooling = getPulseCooldown(slot.pulse) > 0;
    if (slot.pulseCooling && !cooling) playSound('pulseReady', { player: soundPlayer(slot) });
    slot.pulseCooling = cooling;
  }
  if (pulsed) playSound('pulse');

  for (const enemy of enemies) {
    const result = updateEnemy(enemy, flower, activeGroups, delta, enemies, houses, enemyScale);
    if (result === 'player' && damageTeam() === 0) return 'caught';
    if (result === 'bite') {
      playSound('bite');
      if (damageFlower(1) === 0) return 'flower';
    }
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

  // The camera follows the players; its co-op zoom only eases while playing, so it stays still when paused
  updateCamera(gameState === 'playing' ? delta : 0, false);

  // Runs while frozen too, so the end screen keeps the final values
  updateHud({
    flowerHealth: getFlowerHealth(),
    flowerMaxHealth: FLOWER_MAX_HEALTH,
    lives: getLives(),
    timeLeft,
    wave: getWaveIndex() + 1,
    waveCount: WAVES.length,
    pulseCooldowns: activePlayers.map((slot) => getPulseCooldown(slot.pulse)),
  });

  renderer.render(scene, camera);
});
