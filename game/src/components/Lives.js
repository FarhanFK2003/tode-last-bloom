// Lives and the invulnerability window after a hit. These belong to the team rather than to one player.
// The rules are the original single-player ones: 3 lives, and 1.5 s after a hit during which contact is free.

export const MAX_LIVES = 3;
const INVULNERABILITY_TIME = 1.5; // seconds after a hit during which bees can't cost another life

let lives = MAX_LIVES;
let invulnerableTime = 0;

// Counts the invulnerability window down; called once per frame, before any hit can happen
export function updateLives(delta) {
  invulnerableTime = Math.max(invulnerableTime - delta, 0);
}

// Costs one life unless the team is still invulnerable from the previous hit. Returns the lives left.
export function hitTeam() {
  if (invulnerableTime > 0) return lives;
  lives -= 1;
  invulnerableTime = INVULNERABILITY_TIME;
  return lives;
}

// Petal Burst: restores one life, never above MAX_LIVES. Returns whether a life was restored.
// The invulnerability window is left as it is.
export function healTeam() {
  if (lives >= MAX_LIVES) return false;
  lives += 1;
  return true;
}

export function getLives() {
  return lives;
}

export function getInvulnerableTime() {
  return invulnerableTime;
}

export function resetLives() {
  lives = MAX_LIVES;
  invulnerableTime = 0;
}
