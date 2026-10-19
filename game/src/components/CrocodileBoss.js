import * as THREE from 'three';
import { hitsObstacle, slideAlongObstacle } from '../collision.js';

// Snapjaw, the lagoon's crocodile boss: a chunky, friendly-looking low-poly crocodile built from simple shapes
// (no model), with a hinged jaw and a segmented tail. It faces along its local +X.
//
// The fight, as a sequence of phases:
//   intro   rises out of the lagoon, roars, its name is shown (harmless)
//   emerge  walks east out of the water onto the meadow (harmless; the water doesn't stop it here only)
//   chase   turns toward and follows the nearest player, around water, logs, stones and the map edge
//   warn    stops and shows a strip on the ground where it will charge (about 1 s)
//   charge  rushes along the strip; a player it runs into loses a shared life
//   dizzy   after a charge it is dazed: harmless, and the only time attacks hurt it (longer if it hit something)
//   recover shakes itself off (harmless, armoured), then chases again
//   defeated reels, retreats to the lagoon and dives under the water (or, if the lagoon is too far or the way
//           is blocked, settles down and shrinks away where it is); then 'gone', and the game shows the victory
//           screen
// Outside the dizzy window its armour turns every attack away. Everything advances only through updateBoss(),
// which the game calls while the level is being played, so it all freezes when paused or on an end screen.
//
// The boss isn't in the enemies list: bees, the Bloom Pulse and pickups never act on it by accident. The game
// gives its body (getBossCollider) to the players' movement and attacks explicitly.

export const BOSS_NAME = 'Snapjaw';

// Body shape for collision: a circle for moving and for players hopping into it, and a line from tail to snout
// (with BODY_HALF_WIDTH on either side) for whether a player is touched
const COLLIDER_RADIUS = 32;
const SPINE_BACK = 35; // from the body's centre, backward along its heading
const SPINE_FRONT = 55; // forward to the snout
const BODY_HALF_WIDTH = 18;

const LAGOON_SPOT = { x: -180, y: 35 }; // where it waits under the water, facing east
const EMERGE_SPOT = { x: -50, y: 35 }; // where it climbs out to, clear of the water and the player starts
const SUNK_Z = -26; // fully under the water

const HEALTH = { single: 10, coop: 16 }; // hits to defeat it, by game mode
const INTRO_TIME = 3; // seconds
const RISE_TIME = 1.6;
const ROAR_TIME = [1.6, 2.6]; // the jaw opens wide in this part of the intro
const BANNER_FADE = [0.3, 0.6, 2.6, 3.0]; // the name fades in, holds and fades out over these intro times

const EMERGE_SPEED = 40; // units per second
const CHASE_SPEED = 45; // a little slower than a hopping Tode
const TURN_SPEED = 2.5; // radians per second while chasing
const WARN_TURN_SPEED = 8; // turning to line up with the charge during the warning
const CHASE_BEFORE_CHARGE = 1.5; // seconds of chasing before it may charge
const CHARGE_RANGE = 230; // it only charges at a player within this distance
const WARN_TIME = 1.0;
const CHARGE_SPEED = 260;
const CHARGE_LENGTH = 220;
const STRIP_WIDTH = 40;
const DIZZY_TIME = 2.5;
const DIZZY_CRASH_TIME = 3.5; // when the charge ended against water, a log, a stone or the map edge
const RECOVER_TIME = 0.6;

// Defeat, in steps (fight.deathStep):
//   reel     a short recoil with its jaw open, still on the ground
//   retreat  walks to the lagoon's east shore, around logs and stones
//   wade     walks west into the water until its whole body is over it (the water hides its legs first)
//   sink     dives: its body goes under, head and tail lifting last; ripples and bubbles
//   settle   the fallback: crouches belly-down and shrinks away, never below the ground
// Its body is only lowered once it is entirely over the water; on land it is only squashed or shrunk toward
// its feet, so it never passes through the ground.
const REEL_TIME = 0.4;
const REEL_RECOIL = 30; // units per second backward while reeling
const SHORE_X = -115; // the lagoon's east shore (see LAGOON in Pond.js)
const SHORE_Y = [10, 60]; // the stretch of that shore with water wide and deep enough behind it for its body
const RETREAT_SPEED = 100;
const RETREAT_TURN_SPEED = 6;
const RETREAT_MAX_DISTANCE = 150; // farther than this, it settles where it is instead
const RETREAT_MAX_TIME = 2.2; // a retreat that takes longer than this (blocked) ends in settling
const WADE_TO_X = -220; // its centre here, facing west, puts its whole body over the water
const WADE_SPEED = 110;
const SINK_TIME = 1.5;
const SETTLE_TIME = 1.6;
const SETTLE_CROUCH = 0.55; // height it squashes to before shrinking away
const FLASH_TIME = 0.15;

// Getting unstuck: if it barely moves for STUCK_TIME while chasing, it walks DETOUR_TIME in the clearest of
// eight directions (preferring ones toward its target), then chases again
const STUCK_TIME = 2;
const STUCK_DISTANCE = 10;
const DETOUR_TIME = 1.5;
const DETOUR_LOOKAHEAD = 60;

const JAW_ROAR = 0.55;
const JAW_WARN = 0.45;
const JAW_CLACK = 0.25;
const CLACK_INTERVAL = 4;
const CLACK_TIME = 0.35;

const COLORS = {
  body: '#5DBB63',
  belly: '#C8E6A0',
  bumps: '#3E8E4A',
  mouth: '#E57373',
  white: '#FFFFFF',
  black: '#1A1A1A',
  star: '#FFE066',
  strip: '#FF6B3D',
  bubble: '#E8FBFF',
  ripple: '#5CC2C2',
};
const ARMOUR_FLASH = new THREE.Color('#FFFFFF');
const HURT_FLASH = new THREE.Color('#FF3030');

let scene = null;
let boss = null; // the built crocodile and its effect meshes
let active = false;

// The fight's state (reset by resetBoss)
let touchedPlayers = []; // the players of the latest 'hitPlayer' event (see checkContact)
const fight = {
  phase: 'intro',
  phaseTime: 0, // seconds in the current phase
  time: 0, // seconds since the intro began, for the idle animation
  health: 0,
  maxHealth: 1,
  heading: 0, // radians; 0 faces +X (east)
  chargeDirection: new THREE.Vector2(),
  chargeLeft: 0,
  dizzyTime: 0,
  stuckTime: 0,
  stuckFrom: new THREE.Vector2(),
  detour: new THREE.Vector2(),
  flashTime: 0,
  flashColor: ARMOUR_FLASH,
  roared: false,
  deathStep: 'reel',
  deathTime: 0, // seconds in the current death step
  retreatTarget: new THREE.Vector2(),
};

// Builds the crocodile once; it is added to the scene only on the boss level. Its shapes and materials belong
// to it for the whole session and are never disposed.
export function createCrocodileBoss(gameScene) {
  scene = gameScene;
  const box = new THREE.BoxGeometry(1, 1, 1);
  const cone = new THREE.ConeGeometry(1, 1, 4);
  const sphere = new THREE.SphereGeometry(1, 8, 6);
  const material = (color) => new THREE.MeshStandardMaterial({ color, flatShading: true });
  const materials = Object.fromEntries(Object.entries(COLORS).map(([name, color]) => [name, material(color)]));

  const part = (geometry, materialName, [sx, sy, sz], [x, y, z], parent) => {
    const mesh = new THREE.Mesh(geometry, materials[materialName]);
    mesh.scale.set(sx, sy, sz);
    mesh.position.set(x, y, z);
    parent.add(mesh);
    return mesh;
  };

  // The group is the boss's position and heading on the ground; `body` holds every part, so it can breathe,
  // rise, flip and sink as one
  const group = new THREE.Group();
  group.userData.collisionRadius = COLLIDER_RADIUS;
  const body = new THREE.Group();
  group.add(body);

  part(box, 'body', [60, 34, 16], [0, 0, 11], body);
  part(box, 'belly', [56, 30, 6], [0, 0, 3.5], body);
  for (const x of [-20, 20]) {
    for (const y of [-19, 19]) part(box, 'body', [10, 8, 10], [x, y, 4], body);
  }
  for (let i = 0; i < 5; i++) {
    for (const y of [-7, 7]) {
      const bump = part(cone, 'bumps', [3.5, 6, 3.5], [-22 + i * 11, y, 21], body);
      bump.rotation.x = Math.PI / 2; // cones point along their local Y: turn them up
    }
  }

  // The jaws hinge at the back of the head; the upper jaw carries the eyes, nostrils and top teeth
  const upperJaw = new THREE.Group();
  upperJaw.position.set(26, 0, 13);
  body.add(upperJaw);
  part(box, 'body', [34, 22, 8], [17, 0, 3], upperJaw);
  part(box, 'mouth', [30, 18, 1], [16, 0, -1.2], upperJaw);
  for (const y of [-6, 6]) {
    part(sphere, 'body', [4.5, 4.5, 4.5], [4, y, 8], upperJaw);
    part(sphere, 'white', [3, 3, 3], [5.5, y, 10], upperJaw);
    part(sphere, 'black', [1.6, 1.6, 1.6], [7.8, y, 11], upperJaw);
    part(sphere, 'black', [1, 1, 1], [32, y * 0.5, 7], upperJaw);
  }
  for (let i = 0; i < 4; i++) {
    for (const y of [-9, 9]) {
      const tooth = part(cone, 'white', [1.4, 3, 1.4], [12 + i * 6, y, -2.5], upperJaw);
      tooth.rotation.x = -Math.PI / 2; // pointing down
    }
  }
  const lowerJaw = new THREE.Group();
  lowerJaw.position.set(26, 0, 7);
  body.add(lowerJaw);
  part(box, 'belly', [30, 19, 5], [15, 0, -1], lowerJaw);
  part(box, 'mouth', [27, 16, 1], [14, 0, 1.6], lowerJaw);

  // The tail: four segments, each hinged to the one before, getting smaller toward the tip
  const tail = [];
  let parent = body;
  let hingeX = -30;
  for (const [length, width, height] of [
    [18, 24, 13],
    [16, 18, 10],
    [15, 13, 8],
    [14, 8, 6],
  ]) {
    const segment = new THREE.Group();
    segment.position.set(hingeX, 0, parent === body ? 10 : 0);
    parent.add(segment);
    part(box, 'body', [length, width, height], [-length / 2, 0, 0], segment);
    const bump = part(cone, 'bumps', [2.5, 4.5, 2.5], [-length / 2, 0, height / 2 + 2], segment);
    bump.rotation.x = Math.PI / 2;
    tail.push(segment);
    parent = segment;
    hingeX = -length;
  }

  // Dizzy stars circling above its head
  const stars = new THREE.Group();
  stars.position.set(30, 0, 34);
  const starGeometry = new THREE.OctahedronGeometry(2.5);
  for (let i = 0; i < 3; i++) {
    const star = new THREE.Mesh(starGeometry, materials.star);
    const angle = (i / 3) * Math.PI * 2;
    star.position.set(Math.cos(angle) * 9, Math.sin(angle) * 9, 0);
    stars.add(star);
  }
  body.add(stars);

  // The charge warning: a strip on the ground, in the scene (not on the moving boss)
  const strip = new THREE.Mesh(
    new THREE.PlaneGeometry(1, 1),
    new THREE.MeshBasicMaterial({ color: COLORS.strip, transparent: true, opacity: 0.4, depthWrite: false }),
  );
  strip.position.z = 0.5;

  // Bubbles rising where it sinks when defeated
  const bubbleGeometry = new THREE.SphereGeometry(1, 6, 4);
  const bubbleMaterial = new THREE.MeshBasicMaterial({ color: COLORS.bubble, transparent: true, opacity: 0.8 });
  const bubbles = Array.from({ length: 6 }, (_, index) => {
    const bubble = new THREE.Mesh(bubbleGeometry, bubbleMaterial);
    bubble.userData.offset = new THREE.Vector2(Math.cos(index * 2.4) * 20, Math.sin(index * 2.4) * 14);
    bubble.userData.delay = index * 0.25;
    return bubble;
  });

  // Ripples where it dives in; each fades on its own, so each has its own material. Like everything else here
  // they belong to the boss for the whole session and are never disposed.
  const rippleGeometry = new THREE.RingGeometry(0.85, 1, 24);
  const ripples = Array.from({ length: 3 }, (_, index) => {
    const ripple = new THREE.Mesh(
      rippleGeometry,
      new THREE.MeshBasicMaterial({ color: COLORS.ripple, transparent: true, opacity: 0, depthWrite: false }),
    );
    ripple.userData.delay = index * 0.45;
    return ripple;
  });

  boss = { group, body, upperJaw, lowerJaw, tail, stars, strip, bubbles, ripples, flashMaterial: materials.body };
}

// The boss's body for players' movement and attacks while it is in the level, otherwise null.
// Its userData.harmless tells whether touching it is safe right now (see isHarmless in Enemy.js).
export function getBossCollider() {
  return active ? boss.group : null;
}

// On the boss level the crocodile is placed sunk in the lagoon, at full health, ready for its intro;
// on any other level it is removed. Every effect (strip, stars, bubbles, flash) is cleared.
export function resetBoss(onBossLevel, mode) {
  active = onBossLevel;
  Object.assign(fight, {
    phase: 'intro',
    phaseTime: 0,
    time: 0,
    health: HEALTH[mode] ?? HEALTH.single,
    maxHealth: HEALTH[mode] ?? HEALTH.single,
    heading: 0,
    chargeLeft: 0,
    dizzyTime: 0,
    stuckTime: 0,
    flashTime: 0,
    roared: false,
    deathStep: 'reel',
    deathTime: 0,
  });
  const { group, body, strip, bubbles, ripples, tail } = boss;
  group.position.set(LAGOON_SPOT.x, LAGOON_SPOT.y, 0);
  group.rotation.set(0, 0, 0);
  body.position.z = SUNK_Z;
  body.rotation.set(0, 0, 0);
  body.scale.set(1, 1, 1);
  for (const segment of tail) segment.rotation.y = 0;
  group.userData.harmless = true;
  boss.flashMaterial.emissive.setRGB(0, 0, 0);
  scene.remove(strip, ...bubbles, ...ripples);
  pose();
  if (onBossLevel) scene.add(group);
  else scene.remove(group);
}

// An attack reached the boss. Returns 'damaged' or 'defeated' during its dizzy window, 'armoured' when its
// armour turns the hit away, or 'ignored' while it can't be fought (rising, emerging, already defeated).
export function hitBoss() {
  if (!active || ['intro', 'emerge', 'defeated', 'gone'].includes(fight.phase)) return 'ignored';
  if (fight.phase !== 'dizzy') {
    flash(ARMOUR_FLASH);
    return 'armoured';
  }
  fight.health -= 1;
  flash(HURT_FLASH);
  if (fight.health > 0) return 'damaged';
  // From here on it can't move, hunt, attack or be hit again (every later hit is 'ignored')
  setPhase('defeated');
  fight.deathStep = 'reel';
  fight.deathTime = 0;
  boss.body.position.z = 0;
  scene.remove(boss.strip);
  return 'defeated';
}

function flash(color) {
  fight.flashTime = FLASH_TIME;
  fight.flashColor = color;
}

function setPhase(phase) {
  fight.phase = phase;
  fight.phaseTime = 0;
}

// Advances the fight. context: { players (active player groups), obstacles, bounds (the map's half-size) }.
// Returns the events of this frame, in order, for the game to act on:
//   'roar' (intro), 'warn' (a charge is coming), 'charge', 'crash' (the charge hit something),
//   'hitPlayer' (a player is touched while it is dangerous: the game decides whether a life is lost),
//   'gone' (the defeat sequence is over: the level is won)
export function updateBoss(delta, context) {
  const events = [];
  if (!active) return events;
  fight.time += delta;
  fight.phaseTime += delta;
  fight.flashTime = Math.max(fight.flashTime - delta, 0);

  switch (fight.phase) {
    case 'intro':
      updateIntro(events);
      break;
    case 'emerge':
      updateEmerge(delta);
      break;
    case 'chase':
      updateChase(delta, context, events);
      break;
    case 'detour':
      updateDetour(delta, context, events);
      break;
    case 'warn':
      updateWarn(delta, context, events);
      break;
    case 'charge':
      updateCharge(delta, context, events);
      break;
    case 'dizzy':
      if (fight.phaseTime >= fight.dizzyTime) setPhase('recover');
      break;
    case 'recover':
      if (fight.phaseTime >= RECOVER_TIME) startChase();
      break;
    case 'defeated':
      updateDefeat(delta, context, events);
      break;
    default:
      break;
  }

  // Touching it is harmless unless it is chasing, warning or charging
  boss.group.userData.harmless = !['chase', 'detour', 'warn', 'charge'].includes(fight.phase);
  boss.group.rotation.z = fight.heading;
  pose();
  return events;
}

function updateIntro(events) {
  const rise = Math.min(fight.phaseTime / RISE_TIME, 1);
  boss.body.position.z = SUNK_Z * (1 - rise) ** 2;
  if (!fight.roared && fight.phaseTime >= ROAR_TIME[0]) {
    fight.roared = true;
    events.push('roar');
  }
  if (fight.phaseTime >= INTRO_TIME) setPhase('emerge');
}

// Straight out of the water to the meadow. Only here does the boss ignore the water: it starts inside the
// lagoon's footprint, where the normal obstacle rules would never let it move.
function updateEmerge(delta) {
  const { position } = boss.group;
  const toX = EMERGE_SPOT.x - position.x;
  const toY = EMERGE_SPOT.y - position.y;
  const distance = Math.hypot(toX, toY);
  const step = Math.min(EMERGE_SPEED * delta, distance);
  if (distance > 0) {
    position.x += (toX / distance) * step;
    position.y += (toY / distance) * step;
  }
  if (distance - step <= 0.5) startChase();
}

function startChase() {
  setPhase('chase');
  fight.stuckTime = 0;
  fight.stuckFrom.set(boss.group.position.x, boss.group.position.y);
}

function nearestPlayer(players) {
  let nearest = null;
  let nearestDistance = Infinity;
  for (const player of players) {
    const distance = Math.hypot(player.position.x - boss.group.position.x, player.position.y - boss.group.position.y);
    if (distance < nearestDistance) {
      nearestDistance = distance;
      nearest = player;
    }
  }
  return { target: nearest, distance: nearestDistance };
}

// Turns `heading` toward `goal` by at most `maxTurn`, the short way round
function turnToward(goal, maxTurn) {
  const difference = Math.atan2(Math.sin(goal - fight.heading), Math.cos(goal - fight.heading));
  fight.heading += Math.max(-maxTurn, Math.min(maxTurn, difference));
}

function isOutside(x, y, bounds) {
  const limit = bounds - COLLIDER_RADIUS;
  return Math.abs(x) > limit || Math.abs(y) > limit;
}

// Tries to step (dx, dy), sliding along an obstacle it runs into. Returns whether it moved.
function tryMove(dx, dy, { obstacles, bounds }) {
  const { position } = boss.group;
  const step = Math.hypot(dx, dy);
  const candidates = [[dx, dy]];
  if (hitsObstacle(boss.group, position.x + dx, position.y + dy, obstacles)) {
    const slide = slideAlongObstacle(boss.group, dx, dy, obstacles);
    if (slide) candidates.push([slide.x * step, slide.y * step]);
  }
  for (const [x, y] of candidates) {
    const nextX = position.x + x;
    const nextY = position.y + y;
    if (isOutside(nextX, nextY, bounds) || hitsObstacle(boss.group, nextX, nextY, obstacles)) continue;
    position.x = nextX;
    position.y = nextY;
    return true;
  }
  return false;
}

function updateChase(delta, context, events) {
  const { target, distance } = nearestPlayer(context.players);
  if (!target) return;
  const toX = target.position.x - boss.group.position.x;
  const toY = target.position.y - boss.group.position.y;
  turnToward(Math.atan2(toY, toX), TURN_SPEED * delta);

  const step = CHASE_SPEED * delta;
  tryMove(Math.cos(fight.heading) * step, Math.sin(fight.heading) * step, context);
  checkContact(context.players, events);

  // A charge, once it has chased for a moment and the target is in range
  if (fight.phaseTime >= CHASE_BEFORE_CHARGE && distance <= CHARGE_RANGE && distance > 0) {
    fight.chargeDirection.set(toX / distance, toY / distance);
    setPhase('warn');
    showStrip();
    events.push('warn');
    return;
  }

  // Barely moved for a while: take a detour
  fight.stuckTime += delta;
  if (fight.stuckTime >= STUCK_TIME) {
    const moved = fight.stuckFrom.distanceTo(new THREE.Vector2(boss.group.position.x, boss.group.position.y));
    if (moved < STUCK_DISTANCE) startDetour(toX, toY, context);
    fight.stuckTime = 0;
    fight.stuckFrom.set(boss.group.position.x, boss.group.position.y);
  }
}

// Picks the clearest of eight directions, preferring those toward the target; without any, heads for the centre
function startDetour(toX, toY, { obstacles, bounds }) {
  const { position } = boss.group;
  const length = Math.hypot(toX, toY) || 1;
  let best = null;
  let bestScore = -Infinity;
  for (let i = 0; i < 8; i++) {
    const angle = (i / 8) * Math.PI * 2;
    const x = Math.cos(angle);
    const y = Math.sin(angle);
    const aheadX = position.x + x * DETOUR_LOOKAHEAD;
    const aheadY = position.y + y * DETOUR_LOOKAHEAD;
    if (isOutside(aheadX, aheadY, bounds) || hitsObstacle(boss.group, aheadX, aheadY, obstacles)) continue;
    // Straight at the target has just failed, so a way partly toward it (about 60 degrees off) scores best
    const score = -Math.abs((x * toX + y * toY) / length - 0.5);
    if (score > bestScore) {
      bestScore = score;
      best = [x, y];
    }
  }
  if (best) fight.detour.set(best[0], best[1]);
  else fight.detour.set(-position.x, -position.y).normalize();
  setPhase('detour');
}

function updateDetour(delta, context, events) {
  turnToward(Math.atan2(fight.detour.y, fight.detour.x), TURN_SPEED * 2 * delta);
  const step = CHASE_SPEED * delta;
  tryMove(fight.detour.x * step, fight.detour.y * step, context);
  checkContact(context.players, events);
  if (fight.phaseTime >= DETOUR_TIME) startChase();
}

function showStrip() {
  const { strip } = boss;
  const length = CHARGE_LENGTH + SPINE_FRONT;
  const { x, y } = fight.chargeDirection;
  strip.scale.set(length, STRIP_WIDTH, 1);
  strip.rotation.z = Math.atan2(y, x);
  strip.position.x = boss.group.position.x + x * (length / 2);
  strip.position.y = boss.group.position.y + y * (length / 2);
  strip.material.opacity = 0.4;
  scene.add(strip);
}

function updateWarn(delta, context, events) {
  turnToward(Math.atan2(fight.chargeDirection.y, fight.chargeDirection.x), WARN_TURN_SPEED * delta);
  boss.strip.material.opacity = 0.3 + 0.2 * Math.abs(Math.sin(fight.phaseTime * 10));
  checkContact(context.players, events);
  if (fight.phaseTime >= WARN_TIME) {
    fight.heading = Math.atan2(fight.chargeDirection.y, fight.chargeDirection.x);
    fight.chargeLeft = CHARGE_LENGTH;
    setPhase('charge');
    events.push('charge');
  }
}

// Along the strip until its end, or until water, a log, a stone or the map edge stops it (a longer daze)
function updateCharge(delta, context, events) {
  const { position } = boss.group;
  const step = Math.min(CHARGE_SPEED * delta, fight.chargeLeft);
  const nextX = position.x + fight.chargeDirection.x * step;
  const nextY = position.y + fight.chargeDirection.y * step;
  checkContact(context.players, events);

  // The snout leads the charge, so it is checked as well as the body
  const snoutX = nextX + fight.chargeDirection.x * SPINE_FRONT;
  const snoutY = nextY + fight.chargeDirection.y * SPINE_FRONT;
  const snout = new THREE.Vector2(snoutX, snoutY);
  const snoutBlocked =
    Math.abs(snoutX) > context.bounds ||
    Math.abs(snoutY) > context.bounds ||
    context.obstacles.some((obstacle) => obstacle.userData.footprint.containsPoint(snout));
  const bodyBlocked =
    isOutside(nextX, nextY, context.bounds) || hitsObstacle(boss.group, nextX, nextY, context.obstacles);
  if (snoutBlocked || bodyBlocked) {
    startDizzy(DIZZY_CRASH_TIME);
    events.push('crash');
    return;
  }
  position.x = nextX;
  position.y = nextY;
  fight.chargeLeft -= step;
  checkContact(context.players, events);
  if (fight.chargeLeft <= 0) startDizzy(DIZZY_TIME);
}

function startDizzy(time) {
  fight.dizzyTime = time;
  setPhase('dizzy');
  scene.remove(boss.strip);
}

// A player within its body (the line from tail to snout, BODY_HALF_WIDTH either side) is touched.
// Several touches in one frame are one event; the players touched are kept for getTouchedPlayers, and each
// player's own invulnerability stops repeated losses.
function checkContact(players, events) {
  if (events.includes('hitPlayer')) return;
  const { x, y } = boss.group.position;
  const dirX = Math.cos(fight.heading);
  const dirY = Math.sin(fight.heading);
  const touched = players.filter((player) => {
    const relX = player.position.x - x;
    const relY = player.position.y - y;
    const along = Math.max(-SPINE_BACK, Math.min(SPINE_FRONT, relX * dirX + relY * dirY));
    const distance = Math.hypot(relX - dirX * along, relY - dirY * along);
    return distance < BODY_HALF_WIDTH + (player.userData.collisionRadius ?? 0);
  });
  if (touched.length > 0) {
    touchedPlayers = touched;
    events.push('hitPlayer');
  }
}

// The players touched in this frame's 'hitPlayer' event
export function getTouchedPlayers() {
  return touchedPlayers;
}

function setDeathStep(step) {
  fight.deathStep = step;
  fight.deathTime = 0;
}

// Where it heads for when defeated: the nearest point of the shore stretch it can dive from, with its body
// standing just clear of the water
function shoreTarget() {
  const y = Math.max(SHORE_Y[0], Math.min(SHORE_Y[1], boss.group.position.y));
  return new THREE.Vector2(SHORE_X + COLLIDER_RADIUS + 4, y);
}

// Whether the straight way to `target` is short enough and free of obstacles (other than at its very end)
function canRetreatTo(target, { obstacles, bounds }) {
  const { x, y } = boss.group.position;
  const distance = Math.hypot(target.x - x, target.y - y);
  if (distance > RETREAT_MAX_DISTANCE) return false;
  const point = new THREE.Vector2();
  // From a little ahead of it, so an obstacle it is already touching (say, after crashing into a log) doesn't count
  for (let travelled = 20; travelled < distance; travelled += 10) {
    point.set(x + ((target.x - x) / distance) * travelled, y + ((target.y - y) / distance) * travelled);
    if (isOutside(point.x, point.y, bounds)) return false;
    if (obstacles.some((obstacle) => obstacle.userData.footprint.distanceToPoint(point) < COLLIDER_RADIUS)) {
      return false;
    }
  }
  return true;
}

function updateDefeat(delta, context, events) {
  fight.deathTime += delta;
  const { position } = boss.group;

  switch (fight.deathStep) {
    case 'reel': {
      // A small recoil straight back, respecting obstacles and the map edge
      const step = REEL_RECOIL * delta;
      tryMove(-Math.cos(fight.heading) * step, -Math.sin(fight.heading) * step, context);
      if (fight.deathTime >= REEL_TIME) {
        const target = shoreTarget();
        if (canRetreatTo(target, context)) {
          fight.retreatTarget.copy(target);
          setDeathStep('retreat');
        } else {
          setDeathStep('settle');
        }
      }
      break;
    }
    case 'retreat': {
      const toX = fight.retreatTarget.x - position.x;
      const toY = fight.retreatTarget.y - position.y;
      const distance = Math.hypot(toX, toY);
      turnToward(Math.atan2(toY, toX), RETREAT_TURN_SPEED * delta);
      const step = Math.min(RETREAT_SPEED * delta, distance);
      if (distance > 0) tryMove((toX / distance) * step, (toY / distance) * step, context);
      if (distance - step <= 1) setDeathStep('wade');
      else if (fight.deathTime >= RETREAT_MAX_TIME) setDeathStep('settle');
      break;
    }
    case 'wade': {
      // Turn to face the water, then walk in. The lagoon would normally block it, so only here it is ignored.
      turnToward(Math.PI, RETREAT_TURN_SPEED * delta);
      const offWater = Math.PI - fight.heading;
      const facingWater = Math.abs(Math.atan2(Math.sin(offWater), Math.cos(offWater)));
      if (facingWater < 0.3) position.x = Math.max(position.x - WADE_SPEED * delta, WADE_TO_X);
      updateSplash(fight.deathTime, SHORE_X - 20, position.y);
      if (position.x <= WADE_TO_X) setDeathStep('sink');
      break;
    }
    case 'sink': {
      updateSplash(fight.deathTime, position.x, position.y);
      if (fight.deathTime >= SINK_TIME) finishDefeat(events);
      break;
    }
    case 'settle':
      if (fight.deathTime >= SETTLE_TIME) finishDefeat(events);
      break;
    default:
      break;
  }
}

// Ripples spreading from (x, y) on the water, and bubbles rising there while it dives
function updateSplash(time, x, y) {
  for (const ripple of boss.ripples) {
    const age = time - ripple.userData.delay;
    if (age < 0) continue;
    if (!ripple.parent) scene.add(ripple);
    const progress = (age % 1.4) / 1.4;
    ripple.position.set(x, y, 0.9); // just above the water's surface
    ripple.scale.setScalar(8 + progress * 30);
    ripple.material.opacity = 0.5 * (1 - progress);
  }
  if (fight.deathStep !== 'sink') return;
  for (const bubble of boss.bubbles) {
    const age = time - bubble.userData.delay;
    if (age < 0) continue;
    if (!bubble.parent) scene.add(bubble);
    const rise = (age % 1.2) / 1.2;
    bubble.position.set(x + bubble.userData.offset.x, y + bubble.userData.offset.y, 1 + rise * 14);
    bubble.scale.setScalar(1.5 + rise * 2);
  }
}

function finishDefeat(events) {
  setPhase('gone');
  scene.remove(...boss.bubbles, ...boss.ripples);
  events.push('gone');
}

// The defeated poses: always grounded or, only in the dive, over the water
function poseDeath() {
  const { deathStep, deathTime, time } = fight;
  const { body, upperJaw, lowerJaw, tail } = boss;
  body.rotation.set(0, 0, 0);
  body.scale.set(1, 1, 1);
  let jaw = 0;
  let swishSpeed = 0;
  let swish = 0;
  let curl = 0;

  if (deathStep === 'reel') {
    const progress = Math.min(deathTime / REEL_TIME, 1);
    jaw = Math.sin(progress * Math.PI) * JAW_ROAR;
    body.position.z = Math.sin(progress * Math.PI) * 3; // a little jolt upward, never down
  } else if (deathStep === 'retreat' || deathStep === 'wade') {
    swishSpeed = 9;
    swish = 0.25;
    body.position.z = Math.abs(Math.sin(time * 9)) * 1; // a hurried waddle
  } else if (deathStep === 'sink') {
    // Body under first; head and tail lift so they go last
    const progress = Math.min(deathTime / SINK_TIME, 1);
    body.position.z = SUNK_Z * progress ** 1.5;
    jaw = 0.3 * progress;
    curl = 0.3 * progress;
  } else if (deathStep === 'settle') {
    // Crouches belly-down, then shrinks away toward its feet (its origin is on the ground)
    const crouch = Math.min(deathTime / 0.6, 1);
    const shrink = Math.max((deathTime - 0.6) / (SETTLE_TIME - 0.6), 0);
    const size = 1 - Math.min(shrink, 1);
    body.position.z = 0;
    body.scale.set(size, size, size * (1 - (1 - SETTLE_CROUCH) * crouch));
  }

  upperJaw.rotation.y = -jaw;
  lowerJaw.rotation.y = jaw * 0.35;
  tail.forEach((segment, index) => {
    segment.rotation.z = Math.sin(time * swishSpeed - index * 0.7) * swish;
    segment.rotation.y = curl; // positive lifts the tail (it points along -X)
  });
}

// Jaw, tail, breathing, stars and flash for the current phase
function pose() {
  const { phase, phaseTime, time } = fight;
  if (phase === 'defeated' || phase === 'gone') {
    if (phase === 'defeated') poseDeath();
    boss.stars.visible = false;
    const fading = fight.flashTime / FLASH_TIME;
    boss.flashMaterial.emissive.copy(fight.flashColor).multiplyScalar(fading * 0.6);
    return;
  }
  let jaw = 0;
  if (phase === 'intro' && phaseTime >= ROAR_TIME[0] && phaseTime < ROAR_TIME[1]) {
    jaw = Math.sin(((phaseTime - ROAR_TIME[0]) / (ROAR_TIME[1] - ROAR_TIME[0])) * Math.PI) * JAW_ROAR;
  } else if (phase === 'warn' || phase === 'charge') {
    jaw = JAW_WARN;
  } else if (phase !== 'intro' && phase !== 'dizzy' && phase !== 'defeated') {
    const sinceClack = time % CLACK_INTERVAL;
    if (sinceClack < CLACK_TIME) jaw = Math.sin((sinceClack / CLACK_TIME) * Math.PI) * JAW_CLACK;
  }
  // Rotating about Y turns +X toward -Z, so the upper jaw lifts with a negative angle
  boss.upperJaw.rotation.y = -jaw;
  boss.lowerJaw.rotation.y = jaw * 0.35;

  // The tail swishes, each segment a little behind the one before: harder when roaring or charging
  const hard = (phase === 'intro' && phaseTime >= ROAR_TIME[0]) || phase === 'charge' || phase === 'warn';
  const swish = hard ? 0.3 : 0.12;
  const speed = phase === 'charge' ? 8 : 2;
  boss.tail.forEach((segment, index) => {
    segment.rotation.z = Math.sin(time * speed - index * 0.7) * swish;
  });

  const breath = 1 + Math.sin(time * 1.5) * 0.02;
  boss.body.scale.set(1, breath, breath);

  boss.stars.visible = phase === 'dizzy';
  boss.stars.rotation.z = time * 4;

  const flashStrength = fight.flashTime / FLASH_TIME;
  boss.flashMaterial.emissive.copy(fight.flashColor).multiplyScalar(flashStrength * 0.6);
}

// What the HUD shows: name, health (0 to 1), its actual current and maximum health (read straight from the
// fight, for the 'current / max' figure), and how visible the intro banner is; null when there is no boss
export function getBossHud() {
  if (!active) return null;
  const [fadeInStart, fadeInEnd, fadeOutStart, fadeOutEnd] = BANNER_FADE;
  const t = fight.phase === 'intro' ? fight.phaseTime : Infinity;
  let banner = 0;
  if (t >= fadeInStart && t < fadeInEnd) banner = (t - fadeInStart) / (fadeInEnd - fadeInStart);
  else if (t >= fadeInEnd && t < fadeOutStart) banner = 1;
  else if (t >= fadeOutStart && t < fadeOutEnd) banner = 1 - (t - fadeOutStart) / (fadeOutEnd - fadeOutStart);
  return {
    name: BOSS_NAME,
    health: fight.health / fight.maxHealth,
    current: fight.health,
    max: fight.maxHealth,
    banner,
  };
}
