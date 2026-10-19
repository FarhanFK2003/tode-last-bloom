// Lives and the invulnerability window after a hit. The lives belong to the team rather than to one player;
// the invulnerability window belongs to the player who was hit. The rules are the original single-player ones:
// 3 lives, and 1.5 s after a hit during which contact with that player is free. In co-op the team shares one pool
// of COOP_MAX_LIVES: a hit to either player costs one life from it, and only that player becomes invulnerable.

export const MAX_LIVES = 3;
export const COOP_MAX_LIVES = 6;
const INVULNERABILITY_TIME = 1.5; // seconds after a hit during which bees can't cost another life

let maxLives = MAX_LIVES; // the current mode's full pool: MAX_LIVES, or COOP_MAX_LIVES in co-op
let lives = MAX_LIVES;
const invulnerableTimes = new Map(); // each player (its group) -> seconds left of its invulnerability window

// Counts every player's invulnerability window down; called once per frame, before any hit can happen
export function updateLives(delta) {
  for (const [player, time] of invulnerableTimes) {
    if (time - delta > 0) invulnerableTimes.set(player, time - delta);
    else invulnerableTimes.delete(player);
  }
}

// Costs the team one life when `player` is hit, unless that player is still invulnerable from its own previous
// hit; the player hit then becomes invulnerable. Returns the lives left.
export function hitPlayer(player) {
  if (getInvulnerableTime(player) > 0) return lives;
  lives -= 1;
  invulnerableTimes.set(player, INVULNERABILITY_TIME);
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

// Seconds left of `player`'s invulnerability window (0 when it can be hit)
export function getInvulnerableTime(player) {
  return invulnerableTimes.get(player) ?? 0;
}

// A new run starts with the mode's full pool; restarting a level gives back the lives it began with
export function resetLives(count = maxLives) {
  lives = count;
  invulnerableTimes.clear();
}
