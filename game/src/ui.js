// Small helpers shared by the menu screens (main menu, pause menu and end screen)

export function createButton(label, onClick, className = 'menu-button') {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = className;
  button.textContent = label;
  button.addEventListener('click', onClick);
  return button;
}

// A menu panel: one screen of a menu, shown one at a time
export function createPanel(...children) {
  const panel = document.createElement('div');
  panel.className = 'menu-panel';
  panel.append(...children);
  return panel;
}

export function createHeading(text, level = 'h2') {
  const heading = document.createElement(level);
  heading.textContent = text;
  return heading;
}

export function createText(text, className = '') {
  const paragraph = document.createElement('p');
  paragraph.className = className;
  paragraph.textContent = text;
  return paragraph;
}

// Shows one panel of a menu and hides the others, focusing its first button for keyboard players
export function showPanel(panels, name) {
  for (const [panelName, panel] of Object.entries(panels)) {
    panel.hidden = panelName !== name;
  }
  panels[name].querySelector('button')?.focus();
}

// Settings screen, used by both the main menu and the pause menu
export function createSettingsPanel(onBack) {
  return createPanel(
    createHeading('Settings'),
    createText('Music and sound effect settings are coming soon.', 'menu-note'),
    createButton('Back', onBack),
  );
}
