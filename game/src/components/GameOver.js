import { createButton } from '../ui.js';

// The end screen's main button depends on how the level ended:
//   restartLevel: after a defeat, play the same level again
//   newRun:       after the final victory, start a new run from the first level
//   continue:     after completing a level that isn't the last, go on to the next one
const ACTIONS = {
  restartLevel: { label: 'Restart Level', hint: 'Press SPACE to Restart Level' },
  newRun: { label: 'Play Again', hint: 'Press SPACE to Play Again' },
  continue: { label: 'Continue', hint: 'Press SPACE to Continue' },
};

let element = null;
let title = null;
let message = null;
let hint = null;
let primaryButton = null;
let handlers = null;
let action = null;

// One end screen, created once and reused for every ending
export function createGameOver({ onRestartLevel, onNewRun, onContinue, onMainMenu }) {
  handlers = { restartLevel: onRestartLevel, newRun: onNewRun, continue: onContinue };

  element = document.createElement('div');
  element.className = 'game-over';
  element.hidden = true;

  title = document.createElement('h1');
  message = document.createElement('p');
  message.className = 'message';
  hint = document.createElement('p');

  const buttons = document.createElement('div');
  buttons.className = 'game-over-buttons';
  primaryButton = createButton('', () => handlers[action]());
  buttons.append(primaryButton, createButton('Main Menu', onMainMenu));

  element.append(title, message, hint, buttons);
  document.body.appendChild(element);
}

// Shows the end screen for one outcome: { title, message, victory, action }.
// `victory` switches to the victory styling; `action` picks the main button (see ACTIONS).
export function showGameOver(outcome) {
  action = outcome.action;
  title.textContent = outcome.title;
  message.textContent = outcome.message;
  hint.textContent = ACTIONS[action].hint;
  primaryButton.textContent = ACTIONS[action].label;
  element.classList.toggle('victory', outcome.victory);
  element.hidden = false;
  primaryButton.focus();
}

export function hideGameOver() {
  element.hidden = true;
  element.classList.remove('victory');
}
