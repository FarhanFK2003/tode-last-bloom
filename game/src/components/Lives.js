// Lives and the invulnerability window after a hit. These belong to the team rather than to one player.
// The rules are the original single-player ones: 3 lives, and 1.5 s after a hit during which contact is free.
// In co-op the team shares one pool of COOP_MAX_LIVES: a hit to either player costs one life from it.

export const MAX_LIVES = 3;
export const COOP_MAX_LIVES = 6;
const INVULNERABILITY_TIME = 1.5; // seconds after a hit during which bees can't cost another life

let maxLives = MAX_LIVES; // the current mode's full pool: MAX_LIVES, or COOP_MAX_LIVES in co-op
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

// Petal Burst: restores one life, never above the current mode's full pool. Returns whether a life was restored.
// The invulnerability window is left as it is.
export function healTeam() {
  if (lives >= maxLives) return false;
  lives += 1;
  return true;
}

export function getLives() {
  return lives;
}

// The current mode's full pool of lives
export function getMaxLives() {
  return maxLives;
}

// Sets the full pool for the mode being played (a new run then starts with it; see resetLives)
export function setMaxLives(count) {
  maxLives = count;
}

export function getInvulnerableTime() {
  return invulnerableTime;
}

// A new run starts with the mode's full pool; restarting a level gives back the lives it began with
export function resetLives(count = maxLives) {
  lives = count;
  invulnerableTime = 0;
}
