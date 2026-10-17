import { createButton } from '../ui.js';

let element = null;
let title = null;
let message = null;
let restartButton = null;

export function createGameOver({ onRestart, onMainMenu }) {
  element = document.createElement('div');
  element.className = 'game-over';
  element.hidden = true;

  title = document.createElement('h1');
  message = document.createElement('p');
  message.className = 'message';
  const hint = document.createElement('p');
  hint.textContent = 'Press SPACE to Restart';

  const buttons = document.createElement('div');
  buttons.className = 'game-over-buttons';
  restartButton = createButton('Restart', onRestart);
  buttons.append(restartButton, createButton('Main Menu', onMainMenu));

  element.append(title, message, hint, buttons);
  document.body.appendChild(element);
}

// Shows the end screen for one outcome; `victory` switches to the victory styling
export function showGameOver(outcome) {
  title.textContent = outcome.title;
  message.textContent = outcome.message;
  element.classList.toggle('victory', outcome.victory);
  element.hidden = false;
  restartButton.focus();
}

export function hideGameOver() {
  element.hidden = true;
  element.classList.remove('victory');
}
