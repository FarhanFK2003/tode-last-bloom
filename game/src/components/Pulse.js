import * as THREE from 'three';

const PULSE_RADIUS = 100; // bees whose centre is this close to the flower are pushed back
const PULSE_COOLDOWN = 15; // seconds
const KNOCKBACK_TIME = 0.5; // seconds a bee is pushed back for (its speed is set in Enemy.js)

// Ring that expands from the flower to PULSE_RADIUS and fades out
const RING_DURATION = 0.4; // seconds
const RING_WIDTH = 6;
const RING_OPACITY = 0.7;
const RING_COLOR = 0xff8fb8;
const RING_Z = 0.3; // just above the attack circle

// The ring belongs to the flower and is shared; each player's pulse ability has its own request and cooldown
let ringTimeLeft = 0;
let ring = null;

// The pulse comes from the flower and can be triggered from anywhere while the game is playing.
// Creates the shared ring once.
export function createPulse(flower) {
  ring = new THREE.Mesh(
    new THREE.RingGeometry(PULSE_RADIUS - RING_WIDTH, PULSE_RADIUS, 64),
    new THREE.MeshBasicMaterial({ color: RING_COLOR, transparent: true, opacity: 0, depthWrite: false }),
  );
  // RingGeometry already lies in the XY (ground) plane, centred on the flower
  ring.position.z = RING_Z;
  ring.visible = false;
  flower.add(ring);
}

// One player's pulse ability. fired is true for the frame it actually goes off.
export function createPulseAbility() {
  return { requested: false, fired: false, cooldown: 0 };
}

// Called by the central input handling, only while the game is being played
export function requestPulse(ability) {
  ability.requested = true;
}

// Gameplay part: only runs while playing. A press during the cooldown is ignored, not saved for later.
export function updatePulse(ability, delta, enemies, flower) {
  ability.cooldown = Math.max(ability.cooldown - delta, 0);
  ability.fired = false;

  if (ability.requested && ability.cooldown === 0) {
    for (const enemy of enemies) {
      const distance = Math.hypot(enemy.position.x - flower.position.x, enemy.position.y - flower.position.y);
      if (distance <= PULSE_RADIUS) {
        enemy.userData.knockbackTime = KNOCKBACK_TIME;
      }
    }
    ability.cooldown = PULSE_COOLDOWN;
    ringTimeLeft = RING_DURATION;
    ability.fired = true;
  }
  ability.requested = false;
}

// Visual part: runs every frame, so a ring that is already expanding finishes after the game ends
export function updatePulseVisual(delta) {
  ringTimeLeft = Math.max(ringTimeLeft - delta, 0);
  ring.visible = ringTimeLeft > 0;
  if (!ring.visible) return;

  const progress = 1 - ringTimeLeft / RING_DURATION; // 0 at the pulse, 1 at full size
  const size = Math.max(progress, 0.05);
  ring.scale.set(size, size, 1);
  ring.material.opacity = RING_OPACITY * (1 - progress);
}

export function getPulseCooldown(ability) {
  return ability.cooldown;
}

// Resets one player's ability only; other players' abilities and the shared ring are untouched
export function resetPulse(ability) {
  ability.requested = false;
  ability.fired = false;
  ability.cooldown = 0;
}

// Hides the shared ring around the flower; called once when a run is reset
export function resetPulseRing() {
  ringTimeLeft = 0;
  ring.visible = false;
  ring.material.opacity = 0;
}
