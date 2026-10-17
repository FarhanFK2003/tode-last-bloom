let element = null;
let title = null;
let message = null;

export function createGameOver() {
  element = document.createElement('div');
  element.className = 'game-over';
  element.hidden = true;

  title = document.createElement('h1');
  message = document.createElement('p');
  message.className = 'message';
  const hint = document.createElement('p');
  hint.textContent = 'Press SPACE to Restart';

  element.append(title, message, hint);
  document.body.appendChild(element);
}

// Shows the end screen for one outcome; `victory` switches to the victory styling
export function showGameOver(outcome) {
  title.textContent = outcome.title;
  message.textContent = outcome.message;
  element.classList.toggle('victory', outcome.victory);
  element.hidden = false;
}

export function hideGameOver() {
  element.hidden = true;
  element.classList.remove('victory');
}
