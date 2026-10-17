// The flower bar turns yellow at or below half health, and red below a quarter
const WARNING_RATIO = 0.5;
const DANGER_RATIO = 0.25;

let healthFill = null;
let healthValue = null;
let lifePips = [];
let timer = null;
let waveLabel = null;
let pulseValue = null;

// Last values written to the page, so it is only touched when something changes
const shown = { flowerHealth: null, lives: null, seconds: null, wave: null, pulse: null };

// Top-left panel with the flower health bar and Tode's life pips, plus the timer and wave at the top right
export function createHud(maxLives) {
  const panel = document.createElement('div');
  panel.className = 'hud';

  const healthRow = createRow('Flower');
  const healthBar = document.createElement('div');
  healthBar.className = 'health-bar';
  healthFill = document.createElement('div');
  healthFill.className = 'health-fill';
  healthBar.append(healthFill);
  healthValue = document.createElement('span');
  healthRow.append(healthBar, healthValue);

  const livesRow = createRow('Lives');
  lifePips = Array.from({ length: maxLives }, () => {
    const pip = document.createElement('span');
    pip.className = 'life-pip';
    return pip;
  });
  livesRow.append(...lifePips);

  const pulseRow = createRow('Pulse [E]');
  pulseValue = document.createElement('span');
  pulseValue.className = 'pulse-value';
  pulseRow.append(pulseValue);

  panel.append(healthRow, livesRow, pulseRow);

  const timerBox = document.createElement('div');
  timerBox.className = 'timer-box';
  timer = document.createElement('div');
  timer.className = 'timer';
  waveLabel = document.createElement('div');
  waveLabel.className = 'wave';
  timerBox.append(timer, waveLabel);

  document.body.append(panel, timerBox);
}

function createRow(label) {
  const row = document.createElement('div');
  row.className = 'hud-row';
  const labelElement = document.createElement('span');
  labelElement.className = 'hud-label';
  labelElement.textContent = label;
  row.append(labelElement);
  return row;
}

export function updateHud({ flowerHealth, flowerMaxHealth, lives, timeLeft, wave, waveCount, pulseCooldown }) {
  if (flowerHealth !== shown.flowerHealth) {
    shown.flowerHealth = flowerHealth;
    const ratio = flowerHealth / flowerMaxHealth;
    healthFill.style.width = `${ratio * 100}%`;
    healthFill.classList.toggle('danger', ratio < DANGER_RATIO);
    healthFill.classList.toggle('warning', ratio >= DANGER_RATIO && ratio <= WARNING_RATIO);
    healthValue.textContent = `${flowerHealth}/${flowerMaxHealth}`;
  }

  if (lives !== shown.lives) {
    shown.lives = lives;
    lifePips.forEach((pip, index) => pip.classList.toggle('filled', index < lives));
  }

  // Round up, so the timer shows 2:00 at the start and 0:00 only when time has run out
  const seconds = Math.ceil(timeLeft);
  if (seconds !== shown.seconds) {
    shown.seconds = seconds;
    timer.textContent = `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
  }

  if (wave !== shown.wave) {
    shown.wave = wave;
    waveLabel.textContent = `Wave ${wave}/${waveCount}`;
  }

  // 'Ready', or the whole seconds left on the cooldown, rounded up
  const pulse = pulseCooldown > 0 ? `${Math.ceil(pulseCooldown)}s` : 'Ready';
  if (pulse !== shown.pulse) {
    shown.pulse = pulse;
    pulseValue.textContent = pulse;
    pulseValue.classList.toggle('ready', pulseCooldown === 0);
  }
}
