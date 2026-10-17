import * as THREE from 'three';

const ATTACK_COOLDOWN = 1; // seconds
const ATTACK_RADIUS = 30;
const ATTACK_VISUAL_DURATION = 0.25; // seconds
const ATTACK_VISUAL_OPACITY = 0.6;
const ATTACK_VISUAL_Z = 0.25;
const ATTACK_COLOR = 0xffff00;

let attackRequested = false;
let cooldown = 0;
let visualTimeLeft = 0;
let circle = null;

export function createAttack(player) {
  circle = new THREE.Mesh(
    new THREE.CircleGeometry(ATTACK_RADIUS, 48),
    new THREE.MeshBasicMaterial({ color: ATTACK_COLOR, transparent: true, opacity: 0, depthWrite: false }),
  );
  // CircleGeometry already lies in the XY (ground) plane. Only the player's model hops,
  // never the group, so the circle follows Tode horizontally and stays at this height.
  circle.position.z = ATTACK_VISUAL_Z;
  circle.visible = false;
  player.add(circle);
}

// Called by the central input handling, only while the game is being played
export function requestAttack() {
  attackRequested = true;
}

// Returns the enemies defeated this frame; the caller removes them from the scene and the array.
// scale grows the attack radius and shortens the cooldown as difficulty increases.
export function updateAttack(player, enemies, delta, scale) {
  cooldown = Math.max(cooldown - delta, 0);
  visualTimeLeft = Math.max(visualTimeLeft - delta, 0);

  const radius = ATTACK_RADIUS * scale;
  const defeated = [];

  // Presses during the cooldown are ignored, not saved for later
  if (attackRequested && cooldown === 0) {
    for (const enemy of enemies) {
      const distance = Math.hypot(enemy.position.x - player.position.x, enemy.position.y - player.position.y);
      // An enemy is hit when its collision footprint touches the attack area
      if (distance <= radius + (enemy.userData.collisionRadius ?? 0)) {
        defeated.push(enemy);
      }
    }
    cooldown = ATTACK_COOLDOWN / scale;
    visualTimeLeft = ATTACK_VISUAL_DURATION;
  }
  attackRequested = false;

  // The geometry is built at ATTACK_RADIUS; scale it in the ground plane to match the current reach
  circle.scale.set(scale, scale, 1);

  // Fade the circle out over its display time, then hide it
  circle.visible = visualTimeLeft > 0;
  circle.material.opacity = ATTACK_VISUAL_OPACITY * (visualTimeLeft / ATTACK_VISUAL_DURATION);

  return defeated;
}

export function resetAttack() {
  attackRequested = false;
  cooldown = 0;
  visualTimeLeft = 0;
  circle.visible = false;
  circle.material.opacity = 0;
}
