let element = null;
let shownText = '';

export function createHud() {
  element = document.createElement('div');
  element.className = 'hud';
  document.body.appendChild(element);
}

export function updateHud(flowerHealth, flowerMaxHealth, lives) {
  const text = `Flower ${flowerHealth}/${flowerMaxHealth} · Lives ${lives}`;
  // Only touch the page when the text actually changes
  if (text === shownText) return;
  shownText = text;
  element.textContent = text;
}
