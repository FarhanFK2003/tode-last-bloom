const SCORE_PER_SECOND = 0.1; // 1 point for every 10 seconds survived
const SCORE_PER_KILL = 10;

let score = 0;
let displayedScore = null;
let valueElement = null;

// A small 'SCORE' caption and the number, made once; only the number is rewritten when it changes
export function createScore() {
  const element = document.createElement('div');
  element.className = 'score';
  const caption = document.createElement('span');
  caption.className = 'score-caption';
  caption.textContent = 'Score';
  valueElement = document.createElement('span');
  valueElement.className = 'score-value';
  element.append(caption, valueElement);
  document.body.appendChild(element);
  render();
}

// Survival time comes from the shared frame delta, so the game's single Clock is read only once per frame
export function updateScore(delta, kills) {
  score += delta * SCORE_PER_SECOND + kills * SCORE_PER_KILL;
  render();
}

// The raw (unrounded) score, so difficulty can grow smoothly
export function getScore() {
  return score;
}

// A new run starts at 0; restarting a level gives back the score it began with
export function resetScore(value = 0) {
  score = value;
  render();
}

function render() {
  const roundedScore = Math.floor(score);
  // The score grows a little every frame; only touch the page when the shown number changes
  if (roundedScore === displayedScore) return;
  displayedScore = roundedScore;
  valueElement.textContent = String(roundedScore);
}
