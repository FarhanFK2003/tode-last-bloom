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
import {
  MAX_LIVES,
  getInvulnerableTime,
  getLives,
  healTeam,
  hitTeam,
  resetLives,
  updateLives,
} from './components/Lives.js';
import { createEnemy, updateEnemy } from './components/Enemy.js';
import { createCrab, hitCrab, isCrab, updateCrab } from './components/Crab.js';
import {
  createInk,
  getInkSlow,
  isOctopus,
  resetInk,
  spawnOctopus,
  updateInk,
  updateOctopus,
} from './components/Octopus.js';
import { createAttack, requestAttack, resetAttack, updateAttack } from './components/Attack.js';
import { createScore, getScore, resetScore, updateScore } from './components/Score.js';
import { createGameOver, hideGameOver, showGameOver } from './components/GameOver.js';
import { createWorld } from './components/World.js';
import { LEVELS } from './levels.js';
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
import {
  activateBoost,
  activateShield,
  createBoost,
  createPowerUps,
  getBoostMultiplier,
  getShieldTime,
  resetBoost,
  resetPowerUps,
  updateBoost,
  updatePickups,
  updateShield,
} from './components/PowerUps.js';

const MAP_SIZE = 500;
const TILE_SIZE = 20;
const SPAWN_POINTS = [
  new THREE.Vector2(-MAP_SIZE / 2, -MAP_SIZE / 2),
  new THREE.Vector2(MAP_SIZE / 2, -MAP_SIZE / 2),
  new THREE.Vector2(MAP_SIZE / 2, MAP_SIZE / 2),
  new THREE.Vector2(-MAP_SIZE / 2, MAP_SIZE / 2),
];
// Sand Crabs come in from just inside the middle of each map edge, away from the bees' corners.
// A spot is only used while it is clear of obstacles, players and other enemies.
const CRAB_SPAWN_POINTS = [
  new THREE.Vector2(0, -MAP_SIZE / 2 + 25),
  new THREE.Vector2(MAP_SIZE / 2 - 25, 0),
  new THREE.Vector2(0, MAP_SIZE / 2 - 25),
  new THREE.Vector2(-MAP_SIZE / 2 + 25, 0),
];
const CRAB_SPAWN_CLEARANCE = { obstacle: 30, player: 80, enemy: 30 };
const CRAB_RETRY_DELAY = 1; // seconds before trying again when no spawn spot is free
const OCTOPUS_RETRY_DELAY = 1; // likewise for the Ink Octopus
const MAX_DELTA = 0.1; // seconds; avoids huge jumps after the tab was hidden

const DIFFICULTY_GROWTH_RATE = 0.005; // difficulty gained per score point earned in the current level
const MAX_DIFFICULTY = 2; // enemies reach x3, the player x2
const PLAYER_SCALING_RATIO = 0.5; // player parameters grow at half the enemy rate

// End-screen text for each way a run can end. Completing a level that isn't the last shows the
// level-complete screen instead (see endGame). `action` picks the end screen's main button.
const OUTCOMES = {
  won: {
    title: 'THE FLOWER BLOOMED',
    message: 'You protected it through every level',
    victory: true,
    action: 'newRun',
  },
  flower: { title: 'DEFEAT', message: 'The flower wilted', victory: false, action: 'restartLevel' },
  caught: { title: 'DEFEAT', message: 'Tode was caught', victory: false, action: 'restartLevel' },
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

const flower = createFlower();
scene.add(flower);

// The shared pulse ring around the flower; each player's pulse ability is created with the player
createPulse(flower);

// Pickups around the flower and the Bloom Shield dome; each player's Nectar Boost is created with the player
createPowerUps(scene, flower);

// The Ink Octopus's flying ink, warning rings and puddles go straight into the scene
createInk(scene);

// Everything one player owns: Tode's group (position, model, movement), its attack, its pulse ability
// and its Nectar Boost
function createPlayerSlot(start, { tint, tintStrength, attackColor } = {}) {
  const player = createPlayer(start, { tint, tintStrength });
  return {
    player,
    attack: createAttack(player, attackColor),
    pulse: createPulseAbility(),
    boost: createBoost(),
    // Whether the pulse was cooling down last frame, for the "ready" chime
    pulseCooling: false,
  };
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

// Every level's world (ground and houses) is built once, when the game loads, and kept for the page session,
// so each level's house layout stays the same between runs. Only the current level's world is in the scene.
// Houses keep clear of the flower (origin), Tode's start, his current spot, and the enemy spawn corners.
const worlds = LEVELS.map((level) =>
  createWorld(level, {
    mapSize: MAP_SIZE,
    tileSize: TILE_SIZE,
    protectedPoints: [new THREE.Vector2(0, 0), PLAYER_START, playerOne.player.position, ...SPAWN_POINTS],
  }),
);

// The current level (an index into LEVELS) and the obstacles bees, players and pickups collide with in it
let levelIndex = 0;
let houses = worlds[0].obstacles;

function currentLevel() {
  return LEVELS[levelIndex];
}

function levelLabel(index) {
  return `Level ${index + 1} · ${LEVELS[index].name}`;
}

// Swaps in a level's world and sky. Nothing is created or disposed: the worlds were all built at load.
function enterLevel(index) {
  scene.remove(worlds[levelIndex].group);
  levelIndex = index;
  scene.add(worlds[index].group);
  houses = worlds[index].obstacles;
  const { background } = currentLevel();
  scene.background = background ? new THREE.Color(background) : null;
}

// The score and lives the current level began with, given back by Restart Level.
// Saved when a new run starts and when the next level is entered, never when a level is restarted.
let checkpoint = { score: 0, lives: MAX_LIVES };

createScore();
// Play Again keeps the current mode (the buttons pass a click event, so it isn't forwarded)
createGameOver({
  onRestartLevel: restartLevel,
  onNewRun: () => startGame(),
  onContinue: continueToNextLevel,
  onMainMenu: returnToMenu,
});
createHud(MAX_LIVES);
createPauseMenu({ onResume: resume, onRestart: restartLevel, onMainMenu: returnToMenu });
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

// Spawns a crab at a random free spot; returns false if none is free
function spawnCrab() {
  const distance = (object, point) => Math.hypot(object.position.x - point.x, object.position.y - point.y);
  const free = CRAB_SPAWN_POINTS.filter(
    (point) =>
      !houses.some((house) => house.userData.footprint.distanceToPoint(point) < CRAB_SPAWN_CLEARANCE.obstacle) &&
      !activeGroups.some((player) => distance(player, point) < CRAB_SPAWN_CLEARANCE.player) &&
      !enemies.some((enemy) => distance(enemy, point) < CRAB_SPAWN_CLEARANCE.enemy),
  );
  if (free.length === 0) return false;

  const crab = createCrab(free[Math.floor(Math.random() * free.length)]);
  enemies.push(crab);
  scene.add(crab);
  return true;
}

// Spawns an Ink Octopus at a free spot with a clear path in; returns false if there is none
function trySpawnOctopus() {
  const octopus = spawnOctopus({ flower, players: activeGroups, enemies, houses });
  if (!octopus) return false;
  enemies.push(octopus);
  scene.add(octopus);
  return true;
}

// Bees are the enemies without a type of their own
function isBee(enemy) {
  return !isCrab(enemy) && !isOctopus(enemy);
}

function removeEnemy(enemy) {
  scene.remove(enemy);
  disposeEnemy(enemy);
  enemies.splice(enemies.indexOf(enemy), 1);
}

let spawnTimer = 0;
let crabTimer = 0; // counts down to the next crab, following the level's crab schedule
let octopusTimer = 0; // likewise for the Ink Octopus
let timeLeft = LEVELS[0].duration;

// 'menu' | 'playing' | 'paused' | 'levelComplete' | 'victory' | 'defeat'. The game opens on the main menu,
// with the garden shown and no bees; a run only starts from startGame(). 'victory' is the final level's.
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
    // On the end screens Space does what the main button does, unless a button has focus:
    // the button then handles the press itself
    Space: (event) => {
      if (event.target instanceof HTMLButtonElement) return;
      if (gameState === 'levelComplete') continueToNextLevel();
      else if (gameState === 'defeat') restartLevel();
      else if (gameState === 'victory') startGame();
    },
    // Developer shortcuts: jump straight to a level (see jumpToLevel)
    Digit1: (event) => jumpToLevel(0, event),
    Digit2: (event) => jumpToLevel(1, event),
    Digit3: (event) => jumpToLevel(2, event),
    Numpad1: (event) => jumpToLevel(0, event),
    Numpad2: (event) => jumpToLevel(1, event),
    Numpad3: (event) => jumpToLevel(2, event),
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
enterLevel(0);
setGameMode('single');
setGameState('menu');
setMusic('menu');
showMenu();

// The current wave follows from the level timer, so it can never drift out of sync with it.
// Once time has run out (level complete), it stays on the last wave.
function getWaveIndex() {
  const { duration, waves } = currentLevel();
  const elapsed = duration - timeLeft;
  let index = 0;
  while (index + 1 < waves.length && elapsed >= waves[index + 1].start) {
    index += 1;
  }
  return index;
}

// Ends the current level. Winning any level but the last completes it; winning the last is the final victory.
function endGame(outcome) {
  const levelCleared = outcome === 'won' && levelIndex < LEVELS.length - 1;
  if (levelCleared) setGameState('levelComplete');
  else setGameState(outcome === 'won' ? 'victory' : 'defeat');
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
  if (levelCleared) {
    showGameOver({
      title: 'LEVEL COMPLETE',
      message: `${levelLabel(levelIndex)} is safe! Next: ${levelLabel(levelIndex + 1)}`,
      victory: true,
      action: 'continue',
    });
  } else {
    showGameOver(outcome === 'caught' && gameMode === 'coop' ? COOP_CAUGHT : OUTCOMES[outcome]);
  }
}

// Clears everything a level changes, back to the calm start of the current level: no bees, full flower,
// players at their starts, no pickups or effects, and the score and lives from the level's checkpoint.
// The scene, worlds, houses and models themselves are created once and kept.
function resetLevel() {
  for (const enemy of enemies) {
    scene.remove(enemy);
    disposeEnemy(enemy);
  }
  enemies.length = 0;
  spawnTimer = 0;
  crabTimer = currentLevel().crabs?.start ?? 0;
  octopusTimer = currentLevel().octopus?.start ?? 0;
  timeLeft = currentLevel().duration;

  // Every player is reset, active or not, so nothing queued or cooling down carries into the next run.
  // Player 2's spot only matters in co-op; in single player it is out of the scene.
  const starts = startPositions();
  allPlayers.forEach((slot, index) => {
    resetPlayer(slot.player, starts[index] ?? COOP_STARTS[index]);
    resetAttack(slot.attack);
    resetPulse(slot.pulse);
    resetBoost(slot.boost);
    slot.pulseCooling = false;
  });
  resetPulseRing();
  resetPowerUps();
  resetInk();
  resetLives(checkpoint.lives);
  resetFlower();
  resetScore(checkpoint.score);
  hideGameOver();
  updateCamera(0, true);
}

// Plays the current level from its checkpoint
function playLevel() {
  resetLevel();
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

// Starts a new run at the first level with score 0 and full lives, in the given mode (from the mode menu)
// or in the current mode (Play Again after the final victory)
function startGame(mode = gameMode) {
  setGameMode(mode);
  checkpoint = { score: 0, lives: MAX_LIVES };
  enterLevel(0);
  playLevel();
}

// Restart Level (defeat screen or pause menu): the same level again, from the score and lives it began with
function restartLevel() {
  if (gameState !== 'defeat' && gameState !== 'paused') return;
  playLevel();
}

// Continue (level-complete screen): the next level, keeping the score and lives so far.
// The game is playing again straight away, so a second click or Space press does nothing.
function continueToNextLevel() {
  if (gameState !== 'levelComplete') return;
  checkpoint = { score: getScore(), lives: getLives() };
  enterLevel(levelIndex + 1);
  playLevel();
}

// Developer shortcut (keys 1, 2, 3): plays the given level from a clean start, in the current mode, from any
// state except the main menu. It uses the current checkpoint, like Restart Level: the score and lives go back to
// what the current level began with, so a jump never adds or costs anything. Jumping to the current level
// restarts it. Ignored while typing in a field or with Ctrl, Alt or Meta held, so browser shortcuts still work.
function jumpToLevel(index, event) {
  if (gameState === 'menu' || index >= LEVELS.length) return;
  if (event.ctrlKey || event.altKey || event.metaKey) return;
  const target = event.target;
  const editable = ['INPUT', 'TEXTAREA', 'SELECT'];
  if (target instanceof HTMLElement && (target.isContentEditable || editable.includes(target.tagName))) return;

  event.preventDefault();
  enterLevel(index);
  playLevel();
}

// The menu always shows the single-player garden; the mode is chosen again when Play is pressed,
// and the run's progress is cleared
function returnToMenu() {
  setGameMode('single');
  checkpoint = { score: 0, lives: MAX_LIVES };
  enterLevel(0);
  resetLevel();
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

// Applies one collected pickup. A petal is only collected while a life is missing, so healTeam succeeds.
function applyPickup(type, slot) {
  if (type === 'shield') {
    activateShield(flower);
    playSound('pickupShield');
  } else if (type === 'boost') {
    activateBoost(slot.boost);
    playSound('pickupBoost', { player: soundPlayer(slot) });
  } else if (type === 'petal' && healTeam()) {
    playSound('pickupHeal');
  }
}

// Returns the outcome that ends the game this frame ('caught', 'flower' or 'won'), or null to keep playing.
// A defeat ends the frame as soon as it happens; victory is checked last, so a defeat in the same frame wins.
function updateGame(delta) {
  const level = currentLevel();

  // Difficulty starts at the level's own value and grows linearly with the score earned in this level
  // (the score carried in from earlier levels doesn't count again); enemy parameters scale faster than the player's
  const levelScore = getScore() - checkpoint.score;
  const difficulty = Math.min(level.startDifficulty + levelScore * DIFFICULTY_GROWTH_RATE, MAX_DIFFICULTY);
  const enemyScale = 1 + difficulty;
  const playerScale = 1 + difficulty * PLAYER_SCALING_RATIO;

  // The invulnerability window counts down first, before any hit this frame (as it always has)
  updateLives(delta);

  // Power-up effects count down here, inside the gameplay update, so pausing or ending the game freezes them
  if (updateShield(delta)) playSound('shieldDown');
  for (const slot of activePlayers) {
    updateBoost(slot.boost, delta);
  }

  // Running into a bee costs a shared life (hitTeam ignores hits during the team's invulnerability window).
  // Players block each other; the map edge blocks them in co-op and on levels with a map edge.
  const bounds = gameMode === 'coop' || level.mapEdge ? MAP_SIZE / 2 : null;
  for (const slot of activePlayers) {
    const { player } = slot;
    const touchedEnemy = updatePlayer(
      player,
      delta,
      enemies,
      flower,
      houses,
      // Nectar Boost (x1.5) and standing in ink (x0.6) only change hop speed. They are independent and
      // multiply (boost in ink: x0.9), and are worked out fresh every frame, so neither can build up or stick
      playerScale * getBoostMultiplier(slot.boost) * getInkSlow(player),
      getInvulnerableTime(),
      activeGroups,
      bounds,
    );
    if (player.userData.state.hopStarted) playSound('hop', { player: soundPlayer(slot) });
    if (touchedEnemy && damageTeam() === 0) return 'caught';
  }

  // Each pickup goes to the first player touching it, once, even when both players reach it together
  const collected = updatePickups(delta, {
    slots: activePlayers,
    houses,
    flower,
    enemies,
    camera,
    canHeal: () => getLives() < MAX_LIVES,
  });
  for (const { type, slot } of collected) {
    applyPickup(type, slot);
  }

  // Collect every attack's hits in a set, so an enemy is never hit twice in one frame (even by both players).
  // A bee is defeated by one hit; a crab's shell cracks on the first hit and the crab is defeated by the second.
  // Defeated enemies are removed after collecting, so the array isn't changed while it's iterated.
  const hits = new Set();
  for (const slot of activePlayers) {
    for (const enemy of updateAttack(slot.attack, enemies, delta, playerScale)) hits.add(enemy);
    if (slot.attack.fired) playSound('attack', { player: soundPlayer(slot) });
  }
  const defeated = [];
  let cracked = false;
  for (const enemy of hits) {
    if (isCrab(enemy) && hitCrab(enemy) === 'cracked') cracked = true;
    else defeated.push(enemy);
  }
  for (const enemy of defeated) {
    removeEnemy(enemy);
  }
  // One pop for all the enemies defeated this frame
  if (defeated.length > 0) playSound('pop', { count: defeated.length });
  if (cracked) playSound('shellCrack');

  // Only enemies defeated by an attack earn kill points (a cracked shell earns nothing)
  updateScore(delta, defeated.length);

  // Spawning follows the current wave, independent of the score. The timer accumulates the shared delta,
  // but pauses while the wave's cap of active bees is reached, so freeing several slots can't release a burst
  // Only bees count toward the wave's cap, so other enemies never take a bee's place
  const wave = level.waves[getWaveIndex()];
  if (enemies.filter(isBee).length < wave.maxActive) {
    spawnTimer += delta;
    if (spawnTimer >= wave.spawnInterval) {
      spawnTimer -= wave.spawnInterval;
      spawnEnemy(SPAWN_POINTS[Math.floor(Math.random() * SPAWN_POINTS.length)]);
    }
  }

  // Crabs follow the level's own schedule (none in the Garden), separate from the bee waves
  const { crabs } = level;
  if (crabs) crabTimer -= delta;
  if (crabs && crabTimer <= 0) {
    const cap = gameMode === 'coop' ? crabs.coopMax : crabs.max;
    if (enemies.filter(isCrab).length >= cap) crabTimer = crabs.interval;
    else crabTimer = spawnCrab() ? crabs.interval : CRAB_RETRY_DELAY;
  }

  // The Ink Octopus follows its own schedule too (only on the Pond)
  const { octopus } = level;
  if (octopus) octopusTimer -= delta;
  if (octopus && octopusTimer <= 0) {
    if (enemies.filter(isOctopus).length >= octopus.max) octopusTimer = octopus.interval;
    else octopusTimer = trySpawnOctopus() ? octopus.interval : OCTOPUS_RETRY_DELAY;
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

  const enemyContext = { flower, players: activeGroups, enemies, houses, speedScale: enemyScale };
  for (const enemy of enemies) {
    let result;
    if (isCrab(enemy)) result = updateCrab(enemy, delta, { ...enemyContext, bounds: MAP_SIZE / 2 });
    else if (isOctopus(enemy)) result = updateOctopus(enemy, delta, enemyContext);
    else result = updateEnemy(enemy, flower, activeGroups, delta, enemies, houses, enemyScale);
    if (result === 'warn') playSound('crabClack');
    if (result === 'lob') playSound('inkLob');
    if (result === 'player' && damageTeam() === 0) return 'caught';
    if (result === 'bite') {
      // The Bloom Shield turns every bite away: no damage and no hit flash
      if (getShieldTime() > 0) {
        playSound('shieldBlock');
        continue;
      }
      playSound('bite');
      if (damageFlower(1) === 0) return 'flower';
    }
  }

  // Ink that lands this frame: each blob costs the flower 1 HP, unless the Bloom Shield turns it away.
  // The splat and the puddle happen either way.
  const inkImpacts = updateInk(delta, enemies);
  for (let i = 0; i < inkImpacts; i++) {
    playSound('inkSplat');
    if (getShieldTime() > 0) {
      playSound('shieldBlock');
    } else if (damageFlower(1) === 0) {
      return 'flower';
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
  const ended = gameState === 'levelComplete' || gameState === 'victory' || gameState === 'defeat';
  if (gameState === 'playing' || ended) {
    const { duration } = currentLevel();
    updateFlower(delta, (duration - timeLeft) / duration);
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
    waveCount: currentLevel().waves.length,
    level: levelLabel(levelIndex),
    pulseCooldowns: activePlayers.map((slot) => getPulseCooldown(slot.pulse)),
    shieldTime: getShieldTime(),
    boostTimes: activePlayers.map((slot) => slot.boost.timeLeft),
  });

  renderer.render(scene, camera);
});
