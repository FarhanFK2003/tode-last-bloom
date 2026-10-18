import { createButton, createHeading, createPanel, createSettingsPanel, createText, showPanel } from '../ui.js';

let overlay = null;
let panels = null;
let current = 'main';

export function createPauseMenu({ onResume, onRestart, onMainMenu }) {
  overlay = document.createElement('div');
  overlay.className = 'menu-overlay pause-overlay';
  overlay.hidden = true;

  // The same buttons, handlers and order as always; the classes only style them (see .pause-overlay in style.css):
  // Resume is the main action, Restart Level and Settings are secondary, Main Menu is set a little apart
  const actions = document.createElement('div');
  actions.className = 'pause-actions';
  const buttons = [
    [createButton('Resume', onResume), 'pause-primary'],
    [createButton('Restart Level', onRestart), 'pause-secondary'],
    [createButton('Settings', () => show('settings')), 'pause-secondary'],
    [createButton('Main Menu', onMainMenu), 'pause-quiet'],
  ];
  for (const [button, style] of buttons) {
    button.classList.add(style);
    actions.append(button);
  }

  const main = createPanel(createHeading('Paused'), createText('Take a breather', 'pause-subtitle'), actions);
  main.classList.add('pause-panel');

  panels = {
    main,
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
