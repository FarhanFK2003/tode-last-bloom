let element = null;

export function createGameOver() {
  element = document.createElement('div');
  element.className = 'game-over';
  element.hidden = true;

  const title = document.createElement('h1');
  title.textContent = 'GAME OVER';
  const hint = document.createElement('p');
  hint.textContent = 'Press SPACE to Restart';

  element.append(title, hint);
  document.body.appendChild(element);
}

export function showGameOver() {
  element.hidden = false;
}

export function hideGameOver() {
  element.hidden = true;
}
