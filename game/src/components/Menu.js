import { createButton, createHeading, createPanel, createSettingsPanel, createText, showPanel } from '../ui.js';

const CREDITS = [
  'Flower Single by Quaternius (CC0) via Poly Pizza',
  'Armabee Evolved by Quaternius (Public Domain) via Poly Pizza',
  'Small House by Jarlan Perez (CC-BY 3.0) via Poly Pizza',
  'Tode the Frog from the JetBrains Academy course "Build a Game with an AI Coding Agent"',
];

let overlay = null;
let panels = null;
let current = 'main';

// Main menu over the garden: Play, How to Play, Settings, and a small Credits link.
// Play asks for the mode and calls onPlay('single') or onPlay('coop').
export function createMenu({ onPlay }) {
  overlay = document.createElement('div');
  overlay.className = 'menu-overlay';
  overlay.hidden = true;

  const back = () => show('main');

  panels = {
    main: createPanel(
      createHeading('Tode: Last Bloom', 'h1'),
      createText('Protect the last flower of the garden.', 'menu-tagline'),
      createButton('Play', () => show('mode')),
      createButton('How to Play', () => show('howToPlay')),
      createButton('Settings', () => show('settings')),
      createButton('Credits', () => show('credits'), 'menu-link'),
    ),
    mode: createPanel(
      createHeading('Choose mode'),
      createButton('Single Player', () => onPlay('single')),
      createButton('Two Player Co-op', () => onPlay('coop')),
      createButton('Back', back),
    ),
    howToPlay: createPanel(
      createHeading('How to Play'),
      createText(
        'Bees are coming for the magical flower in the middle of the garden. Keep it alive for two minutes to win.',
      ),
      createControls(),
      createText(
        'Every bee touching the flower bites it. The flower has 20 HP, and you have 3 lives (shared by both players ' +
          'in co-op); each touch from a bee costs a life. A new, stronger wave of bees arrives every 30 seconds.',
      ),
      createText('Some keyboards cannot register many keys at once, so a few key combinations may not work together.', 'menu-note'),
      createButton('Back', back),
    ),
    settings: createSettingsPanel(back),
    credits: createPanel(
      createHeading('Credits'),
      ...CREDITS.map((line) => createText(line, 'menu-credit')),
      createButton('Back', back),
    ),
  };

  overlay.append(...Object.values(panels));
  document.body.appendChild(overlay);
}

function createControls() {
  const list = document.createElement('dl');
  list.className = 'menu-controls';
  for (const [keys, action] of [
    ['Arrow keys', 'Hop (Player 1)'],
    ['Space', 'Attack the bees around Tode (Player 1)'],
    ['E', 'Bloom Pulse: push bees away from the flower (Player 1)'],
    ['W A S D', 'Hop (Player 2, co-op)'],
    ['F', 'Attack (Player 2, co-op)'],
    ['Q', 'Bloom Pulse (Player 2, co-op)'],
    ['Esc', 'Pause'],
  ]) {
    const term = document.createElement('dt');
    term.textContent = keys;
    const description = document.createElement('dd');
    description.textContent = action;
    list.append(term, description);
  }
  return list;
}

function show(name) {
  current = name;
  showPanel(panels, name);
}

export function showMenu() {
  overlay.hidden = false;
  show('main');
}

export function hideMenu() {
  overlay.hidden = true;
}

// Escape: goes back from a sub-screen to the main menu. Returns true if it did.
export function menuBack() {
  if (current === 'main') return false;
  show('main');
  return true;
}
