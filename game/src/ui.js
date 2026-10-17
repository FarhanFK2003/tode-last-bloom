// Small helpers shared by the menu screens (main menu, pause menu and end screen)

import { getSettings, onSettingsChange, updateSettings } from './components/Settings.js';

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

// Shows one panel of a menu and hides the others, focusing its first control for keyboard players
export function showPanel(panels, name) {
  for (const [panelName, panel] of Object.entries(panels)) {
    panel.hidden = panelName !== name;
  }
  panels[name].querySelector('button, input')?.focus();
}

// Settings screen, used by both the main menu and the pause menu. Each copy listens for changes,
// so both always show the same values.
export function createSettingsPanel(onBack) {
  const music = createVolumeSlider('Music', (value) => updateSettings({ musicVolume: value }));
  const sfx = createVolumeSlider('Sound effects', (value) => updateSettings({ sfxVolume: value }));

  const muteLabel = document.createElement('label');
  muteLabel.className = 'settings-mute';
  const muteBox = document.createElement('input');
  muteBox.type = 'checkbox';
  muteBox.addEventListener('change', () => updateSettings({ muted: muteBox.checked }));
  muteLabel.append(muteBox, 'Mute all sound');

  const controls = document.createElement('div');
  controls.className = 'settings-controls';
  controls.append(music.row, sfx.row, muteLabel);

  const show = (settings) => {
    music.set(settings.musicVolume);
    sfx.set(settings.sfxVolume);
    muteBox.checked = settings.muted;
    // Muted keeps the chosen volumes; the sliders are only dimmed
    controls.classList.toggle('muted', settings.muted);
  };
  show(getSettings());
  onSettingsChange(show);

  return createPanel(
    createHeading('Settings'),
    controls,
    createText('Audio coming soon: these preferences are saved for when music and sound effects arrive.', 'menu-note'),
    createButton('Back', onBack),
  );
}

// A labelled 0–100 % slider. set() updates it without reporting a change.
function createVolumeSlider(label, onChange) {
  const row = document.createElement('label');
  row.className = 'settings-row';

  const name = document.createElement('span');
  name.className = 'settings-name';
  name.textContent = label;

  const slider = document.createElement('input');
  slider.type = 'range';
  slider.min = '0';
  slider.max = '100';
  slider.step = '1';

  const value = document.createElement('span');
  value.className = 'settings-value';

  slider.addEventListener('input', () => onChange(Number(slider.value)));
  row.append(name, slider, value);

  return {
    row,
    set(volume) {
      slider.value = String(volume);
      value.textContent = `${volume}%`;
    },
  };
}
