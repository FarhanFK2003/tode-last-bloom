const SCORE_PER_SECOND = 0.1; // 1 point for every 10 seconds survived
const SCORE_PER_KILL = 10;

let score = 0;
let displayedScore = null;
let element = null;

export function createScore() {
  element = document.createElement('div');
  element.className = 'score';
  document.body.appendChild(element);
  render();
}

// Survival time comes from the shared frame delta, so the game's single Clock is read only once per frame
export function updateScore(delta, kills) {
  score += delta * SCORE_PER_SECOND + kills * SCORE_PER_KILL;
  render();
}

export function resetScore() {
  score = 0;
  render();
}

function render() {
  const roundedScore = Math.floor(score);
  // The score grows a little every frame; only touch the page when the shown number changes
  if (roundedScore === displayedScore) return;
  displayedScore = roundedScore;
  element.textContent = `Score: ${roundedScore}`;
}
