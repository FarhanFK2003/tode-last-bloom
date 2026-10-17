import * as THREE from 'three';

const ATTACK_COOLDOWN = 1; // seconds
const ATTACK_RADIUS = 30;
const ATTACK_VISUAL_DURATION = 0.25; // seconds
const ATTACK_VISUAL_OPACITY = 0.6;
const ATTACK_VISUAL_Z = 0.25;
const ATTACK_COLOR = 0xffff00;

// Each player has its own attack: its own request, cooldown and circle (in its own colour)
export function createAttack(player, color = ATTACK_COLOR) {
  const circle = new THREE.Mesh(
    new THREE.CircleGeometry(ATTACK_RADIUS, 48),
    new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0, depthWrite: false }),
  );
  // CircleGeometry already lies in the XY (ground) plane. Only the player's model hops,
  // never the group, so the circle follows Tode horizontally and stays at this height.
  circle.position.z = ATTACK_VISUAL_Z;
  circle.visible = false;
  player.add(circle);

  // fired is true for the frame the attack actually goes off (not when a press hits the cooldown)
  return { player, requested: false, fired: false, cooldown: 0, visualTimeLeft: 0, circle };
}

// Called by the central input handling, only while the game is being played
export function requestAttack(attack) {
  attack.requested = true;
}

// Returns the enemies this attack defeated this frame; the caller removes them from the scene and the array.
// scale grows the attack radius and shortens the cooldown as difficulty increases.
export function updateAttack(attack, enemies, delta, scale) {
  attack.cooldown = Math.max(attack.cooldown - delta, 0);
  attack.visualTimeLeft = Math.max(attack.visualTimeLeft - delta, 0);

  const { player, circle } = attack;
  const radius = ATTACK_RADIUS * scale;
  const defeated = [];
  attack.fired = false;

  // Presses during the cooldown are ignored, not saved for later
  if (attack.requested && attack.cooldown === 0) {
    for (const enemy of enemies) {
      const distance = Math.hypot(enemy.position.x - player.position.x, enemy.position.y - player.position.y);
      // An enemy is hit when its collision footprint touches the attack area
      if (distance <= radius + (enemy.userData.collisionRadius ?? 0)) {
        defeated.push(enemy);
      }
    }
    attack.cooldown = ATTACK_COOLDOWN / scale;
    attack.visualTimeLeft = ATTACK_VISUAL_DURATION;
    attack.fired = true;
  }
  attack.requested = false;

  // The geometry is built at ATTACK_RADIUS; scale it in the ground plane to match the current reach
  circle.scale.set(scale, scale, 1);

  // Fade the circle out over its display time, then hide it
  circle.visible = attack.visualTimeLeft > 0;
  circle.material.opacity = ATTACK_VISUAL_OPACITY * (attack.visualTimeLeft / ATTACK_VISUAL_DURATION);

  return defeated;
}

export function resetAttack(attack) {
  attack.requested = false;
  attack.fired = false;
  attack.cooldown = 0;
  attack.visualTimeLeft = 0;
  attack.circle.visible = false;
  attack.circle.material.opacity = 0;
}
