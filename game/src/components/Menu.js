import { createButton, createHeading, createPanel, createSettingsPanel, createText, showPanel } from '../ui.js';

const CREDITS = [
  'Flower Single by Quaternius (CC0) via Poly Pizza',
  'Armabee Evolved by Quaternius (Public Domain) via Poly Pizza',
  'Small House by Jarlan Perez (CC-BY 3.0) via Poly Pizza',
  'Butterfly by Poly by Google (CC-BY 3.0) via Poly Pizza',
  'Rabbit by Poly by Google (CC-BY 3.0) via Poly Pizza',
  'Lighthouse scene by Poly by Google (CC-BY 3.0) via Poly Pizza',
  'Dolphin by Poly by Google (CC-BY 3.0) via Poly Pizza',
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
      createText('Protect the magical flower from waves of enemies. Survive each level and defeat Snapjaw!'),
      createLevels(),
      createControls(),
      createText('Solo: 3 lives · Co-op: 6 shared lives'),
      createText('Collect pickups, defeat enemies, and score points!'),
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
  // The two text-heavy screens are wider, so their content fits without scrolling (see .menu-panel-wide)
  panels.howToPlay.classList.add('menu-panel-wide');
  panels.credits.classList.add('menu-panel-wide');

  overlay.append(...Object.values(panels));
  document.body.appendChild(overlay);
}

// The four levels and what comes for the flower in each
function createLevels() {
  return createTermList([
    ['Garden · 60 s', 'Dodge the bees!'],
    ['Coast · 75 s', 'Stop crabs from reaching the flower.'],
    ['Pond · 90 s', 'Fight bees, chasing crabs, and the ink-lobbing octopus.'],
    ['Lagoon', 'No timer! Strike Snapjaw when it is dizzy after a charge.'],
  ]);
}

function createControls() {
  return createTermList([
    ['Arrow keys', 'Move (Player 1)'],
    ['Space', 'Attack (Player 1)'],
    ['M', 'Bloom Pulse (Player 1)'],
    ['W A S D', 'Move (Player 2, co-op)'],
    ['F', 'Attack (Player 2, co-op)'],
    ['E', 'Bloom Pulse (Player 2, co-op)'],
    ['Esc', 'Pause'],
  ]);
}

// A two-column list of [term, description] rows, styled like the controls list
function createTermList(rows) {
  const list = document.createElement('dl');
  list.className = 'menu-controls';
  for (const [term, text] of rows) {
    const title = document.createElement('dt');
    title.textContent = term;
    const description = document.createElement('dd');
    description.textContent = text;
    list.append(title, description);
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
