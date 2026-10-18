import { createButton, createHeading, createPanel, createSettingsPanel, showPanel } from '../ui.js';

let overlay = null;
let panels = null;
let current = 'main';

export function createPauseMenu({ onResume, onRestart, onMainMenu }) {
  overlay = document.createElement('div');
  overlay.className = 'menu-overlay pause-overlay';
  overlay.hidden = true;

  panels = {
    main: createPanel(
      createHeading('Paused'),
      createButton('Resume', onResume),
      createButton('Restart Level', onRestart),
      createButton('Settings', () => show('settings')),
      createButton('Main Menu', onMainMenu),
    ),
    settings: createSettingsPanel(() => show('main')),
  };

  overlay.append(...Object.values(panels));
  document.body.appendChild(overlay);
}

function show(name) {
  current = name;
  showPanel(panels, name);
}

export function showPauseMenu() {
  overlay.hidden = false;
  show('main');
}

export function hidePauseMenu() {
  overlay.hidden = true;
}

// Escape: goes back from the settings screen to the pause screen. Returns true if it did.
export function pauseMenuBack() {
  if (current === 'main') return false;
  show('main');
  return true;
}
