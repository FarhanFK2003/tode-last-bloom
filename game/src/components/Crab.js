import * as THREE from 'three';
import { blocksMove, hitsObstacle, isMoveBlocked } from '../collision.js';
import { updateKnockback } from './Enemy.js';

// The Sand Crab ignores the flower and hunts the nearest player. It moves in short sideways scuttles along
// the map's axes (like Tode's hops), and before every scuttle it stops and raises its claws for WARNING_TIME,
// so players can see it coming. Its shell takes two hits: the first cracks it and stuns it, harmless, for
// STUN_TIME; the second defeats it. Running into a player costs a life, under the usual invulnerability rules.
// A crab made with target 'flower' (the Coast's) hunts the flower instead: it always faces the flower, scuttles
// towards it and, once there, bites it once every BITE_INTERVAL while it stays in reach. It never costs a life:
// it is harmless to touch (players still bump into it) and running into a player only stops its scuttle.
// For now the crab is built from simple shapes (no model).

const RADIUS = 11; // collision radius, about the size of a bee
const WARNING_TIME = 0.6; // seconds with raised claws before each scuttle
const SCUTTLE_DISTANCE = 40; // units per scuttle
const SCUTTLE_SPEED = 90; // units per second, before difficulty scaling
const REST_TIME = 0.3; // seconds of rest after each scuttle
const STUN_TIME = 1.5; // seconds stunned (harmless and still) after the first hit
const MAX_HEALTH = 2;
const LOOKAHEAD = 15; // how far ahead a scuttle direction is checked for obstacles before choosing it
const BITE_INTERVAL = 1; // a flower-hunting crab's seconds between bites (1 HP each), like a bee's
const BITE_REACH = 8; // how far beyond touching the flower a flower-hunting crab can still bite it
const SNAP_SPEED = 14; // radians per second of claw snapping while biting

const CLAW_RAISED = -0.9; // claw pivot turn during the warning (negative lifts the claws, which point -Y, upward)
const BOB_SPEED = 30; // radians per second of body wobble while scuttling

// Shapes and materials are made once and shared by every crab; they are never disposed
let shared = null;

function getShared() {
  if (shared) return shared;
  const material = (color) => new THREE.MeshStandardMaterial({ color, flatShading: true });
  shared = {
    shell: new THREE.SphereGeometry(1, 10, 6),
    claw: new THREE.SphereGeometry(1, 8, 5),
    leg: new THREE.CylinderGeometry(0.8, 0.8, 7, 5),
    eye: new THREE.SphereGeometry(1.4, 8, 6),
    pupil: new THREE.SphereGeometry(0.7, 6, 4),
    red: material('#E8452C'),
    cracked: material('#F5A37A'), // paler shell once cracked
    white: material('#FFFFFF'),
    black: material('#1A1A1A'),
  };
  return shared;
}

export function isCrab(enemy) {
  return enemy.userData.type === 'crab';
}

// A crab at `position`, facing -Y (like the bee); its sideways direction is local X.
// target: 'players' (hunts the nearest player) or 'flower' (hunts and bites the flower; see the top of this file)
export function createCrab(position, { target = 'players' } = {}) {
  const parts = getShared();
  const crab = new THREE.Group();
  crab.position.set(position.x, position.y, 0);

  const body = new THREE.Group(); // wobbles while scuttling
  crab.add(body);

  const shell = new THREE.Mesh(parts.shell, parts.red);
  shell.scale.set(10, 8, 5);
  shell.position.z = 6;
  body.add(shell);

  // Claws in front, on pivots so they can be raised
  const claws = [-1, 1].map((side) => {
    const pivot = new THREE.Group();
    pivot.position.set(side * 7, -6, 6);
    const claw = new THREE.Mesh(parts.claw, parts.red);
    claw.scale.set(3.2, 4, 2.4);
    claw.position.set(side * 1.5, -3, 0);
    pivot.add(claw);
    body.add(pivot);
    return pivot;
  });

  // Three short legs on each side
  for (const side of [-1, 1]) {
    for (let i = 0; i < 3; i++) {
      const leg = new THREE.Mesh(parts.leg, parts.red);
      leg.rotation.z = Math.PI / 2 + side * 0.35;
      leg.position.set(side * 10, -3 + i * 3.5, 2.5);
      body.add(leg);
    }
  }

  // Eyes on short stalks
  for (const side of [-1, 1]) {
    const eye = new THREE.Mesh(parts.eye, parts.white);
    eye.position.set(side * 3, -5, 12);
    const pupil = new THREE.Mesh(parts.pupil, parts.black);
    pupil.position.set(0, -1, 0.3);
    eye.add(pupil);
    body.add(eye);
  }

  crab.userData = {
    type: 'crab',
    target,
    // A flower-hunting crab is always safe to touch (see isHarmless in Enemy.js)
    harmless: target === 'flower',
    biteTimer: 0,
    collisionRadius: RADIUS,
    health: MAX_HEALTH,
    stunTime: 0,
    // 'rest' -> 'warn' -> 'scuttle' -> 'rest' ...; it starts with a short rest after appearing
    phase: 'rest',
    phaseTime: REST_TIME,
    direction: new THREE.Vector2(),
    distanceLeft: 0,
    age: 0,
    shell,
    body,
    claws,
  };
  return crab;
}

// An attack hit. Returns 'defeated' on the second hit, otherwise 'cracked' (the crab is stunned)
export function hitCrab(crab) {
  const state = crab.userData;
  state.health -= 1;
  if (state.health <= 0) return 'defeated';

  state.stunTime = STUN_TIME;
  state.phase = 'rest';
  state.phaseTime = REST_TIME;
  state.shell.material = getShared().cracked;
  return 'cracked';
}

// Picks the scuttle direction toward the target: along the longer axis first, then the shorter one, then
// sideways in either direction, skipping any that runs straight into an obstacle or past the map edge
function chooseDirection(crab, target, houses, bounds) {
  const dx = target.position.x - crab.position.x;
  const dy = target.position.y - crab.position.y;
  const alongX = [Math.sign(dx) || 1, 0];
  const alongY = [0, Math.sign(dy) || 1];
  const [primary, secondary] = Math.abs(dx) >= Math.abs(dy) ? [alongX, alongY] : [alongY, alongX];
  const backwards = [
    [-secondary[0], -secondary[1]],
    [-primary[0], -primary[1]],
  ];

  for (const [x, y] of [primary, secondary, ...backwards]) {
    if (x === 0 && y === 0) continue;
    const aheadX = crab.position.x + x * LOOKAHEAD;
    const aheadY = crab.position.y + y * LOOKAHEAD;
    if (Math.abs(aheadX) > bounds - RADIUS || Math.abs(aheadY) > bounds - RADIUS) continue;
    if (hitsObstacle(crab, aheadX, aheadY, houses)) continue;
    return [x, y];
  }
  return null;
}

function nearestPlayer(crab, players) {
  let nearest = null;
  let nearestDistance = Infinity;
  for (const player of players) {
    const distance = Math.hypot(player.position.x - crab.position.x, player.position.y - crab.position.y);
    if (distance < nearestDistance) {
      nearestDistance = distance;
      nearest = player;
    }
  }
  return nearest;
}

function setPhase(state, phase, time) {
  state.phase = phase;
  state.phaseTime = time;
}

// Turns the crab to face the flower (it faces -Y locally, like the bee)
function faceFlower(crab, flower) {
  const dx = flower.position.x - crab.position.x;
  const dy = flower.position.y - crab.position.y;
  if (dx !== 0 || dy !== 0) crab.rotation.z = Math.atan2(dx, -dy);
}

// Whether the crab is close enough to the flower to bite it
function inBiteReach(crab, flower) {
  const distance = Math.hypot(flower.position.x - crab.position.x, flower.position.y - crab.position.y);
  return distance <= RADIUS + (flower.userData.collisionRadius ?? 0) + BITE_REACH;
}

// Starts biting the flower: the first bite comes after a full BITE_INTERVAL
function startBiting(state) {
  state.biteTimer = 0;
  setPhase(state, 'bite', Infinity);
}

// Returns 'player' when a scuttle runs into a player, 'warn' on the frame the claws go up (for the sound),
// and null otherwise. context: { flower, players, enemies, houses, bounds (the map's half-size), speedScale }.
export function updateCrab(crab, delta, context) {
  const state = crab.userData;
  const { flower, players, enemies, houses, bounds, speedScale } = context;
  state.age += delta;
  const huntsFlower = state.target === 'flower';
  // A flower-hunting crab faces the flower whatever it is doing
  if (huntsFlower) faceFlower(crab, flower);

  // Bloom Pulse pushes it away from the flower like a bee; it is harmless meanwhile
  if (updateKnockback(crab, flower, delta, { players, enemies, houses })) {
    setPhase(state, 'rest', REST_TIME);
    animate(state, 0, false);
    return null;
  }

  // Stunned after the first hit: still and harmless
  if (state.stunTime > 0) {
    state.stunTime = Math.max(state.stunTime - delta, 0);
    animate(state, 0, false);
    return null;
  }

  state.phaseTime -= delta;
  let result = null;

  if (state.phase === 'rest' && state.phaseTime <= 0) {
    if (huntsFlower && inBiteReach(crab, flower)) {
      startBiting(state);
    } else {
      const target = huntsFlower ? flower : nearestPlayer(crab, players);
      const direction = target && chooseDirection(crab, target, houses, bounds);
      if (direction) {
        state.direction.set(direction[0], direction[1]);
        // A player-hunting crab turns sideways to the scuttle (it faces -Y locally and walks along its local X);
        // a flower-hunting one keeps facing the flower and scuttles towards it
        if (!huntsFlower) crab.rotation.z = Math.atan2(direction[1], direction[0]);
        setPhase(state, 'warn', WARNING_TIME);
        result = 'warn';
      } else {
        setPhase(state, 'rest', REST_TIME);
      }
    }
  } else if (state.phase === 'warn' && state.phaseTime <= 0) {
    state.distanceLeft = SCUTTLE_DISTANCE;
    setPhase(state, 'scuttle', Infinity);
  } else if (state.phase === 'scuttle') {
    result = scuttle(crab, delta, { flower, players, enemies, houses, bounds, speedScale });
  } else if (state.phase === 'bite') {
    // Biting the flower: one bite for every full BITE_INTERVAL in reach; out of reach, it rests and comes back
    if (!inBiteReach(crab, flower)) {
      setPhase(state, 'rest', REST_TIME);
    } else {
      state.biteTimer += delta;
      if (state.biteTimer >= BITE_INTERVAL) {
        state.biteTimer -= BITE_INTERVAL;
        result = 'bite';
      }
    }
  }

  // Claws: raised for the warning, snapping open and shut while biting, lowered otherwise
  let clawAngle = 0;
  if (state.phase === 'warn') clawAngle = CLAW_RAISED;
  if (state.phase === 'bite') clawAngle = CLAW_RAISED * (0.55 + 0.45 * Math.abs(Math.sin(state.age * SNAP_SPEED)));
  animate(state, clawAngle, state.phase === 'scuttle');
  return result;
}

// One frame of a scuttle. It ends after SCUTTLE_DISTANCE, or early when something is in the way.
function scuttle(crab, delta, { flower, players, enemies, houses, bounds, speedScale }) {
  const state = crab.userData;
  const step = Math.min(SCUTTLE_SPEED * speedScale * delta, state.distanceLeft);
  const nextX = crab.position.x + state.direction.x * step;
  const nextY = crab.position.y + state.direction.y * step;
  state.distanceLeft -= step;

  const stop = () => setPhase(state, 'rest', REST_TIME);
  const huntsFlower = state.target === 'flower';
  const reachedFlower = blocksMove(crab, nextX, nextY, flower);
  // A flower-hunting crab that reaches the flower starts biting it
  if (huntsFlower && reachedFlower) {
    startBiting(state);
    return null;
  }
  const outside = Math.abs(nextX) > bounds - RADIUS || Math.abs(nextY) > bounds - RADIUS;
  if (outside || hitsObstacle(crab, nextX, nextY, houses) || reachedFlower) {
    stop();
    return null;
  }
  // A player-hunting crab running into a player costs a life, then rests before turning toward its target
  // again. A flower-hunting crab is only stopped by the player, which costs nothing.
  if (players.some((player) => blocksMove(crab, nextX, nextY, player))) {
    stop();
    return huntsFlower ? null : 'player';
  }
  // Another enemy in the way: wait this frame, still scuttling
  if (isMoveBlocked(crab, nextX, nextY, enemies)) return null;

  crab.position.x = nextX;
  crab.position.y = nextY;
  if (state.distanceLeft <= 0) stop();
  return null;
}

// Claws lift to `clawAngle`; the body wobbles while scuttling
function animate(state, clawAngle, scuttling) {
  for (const [index, claw] of state.claws.entries()) {
    claw.rotation.x += (clawAngle - claw.rotation.x) * 0.4;
    claw.rotation.y = (index === 0 ? -1 : 1) * claw.rotation.x * 0.3;
  }
  state.body.position.z = scuttling ? Math.abs(Math.sin(state.age * BOB_SPEED)) * 1.5 : 0;
  state.body.rotation.y = scuttling ? Math.sin(state.age * BOB_SPEED) * 0.08 : 0;
}
