// The flower bar turns yellow at or below half health, and red below a quarter
const WARNING_RATIO = 0.5;
const DANGER_RATIO = 0.25;

let healthRow = null;
let healthFill = null;
let healthValue = null;
let lifePips = [];
let timer = null;
let waveLabel = null;
let levelLabel = null;
let panel = null;
let effectsRow = null;
let effectsValue = null;
let bossPanel = null;
let bossFill = null;
let bossName = null;
let bossBanner = null;
// One row per player's Bloom Pulse; the second is only shown in co-op
const pulseRows = [];
let pulseRowCount = 1; // how many pulse rows the current mode shows

// Last values written to the page, so it is only touched when something changes
const shown = {
  flowerHealth: null,
  lives: null,
  seconds: null,
  wave: null,
  level: null,
  pulses: [],
  effects: null,
  pulsesHidden: null,
  bossHealth: null,
  bossBanner: null,
};

const PULSE_LABELS = {
  single: ['Pulse [E]'],
  coop: ['P1 Pulse [E]', 'P2 Pulse [Q]'],
};

// Top-left panel with the flower health bar and Tode's life pips, plus the timer, wave and level at the top right
export function createHud(maxLives) {
  panel = document.createElement('div');
  panel.className = 'hud';

  healthRow = createRow('Flower');
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

  for (const playerClass of ['p1', 'p2']) {
    const row = createRow('');
    row.classList.add(`hud-${playerClass}`);
    const value = document.createElement('span');
    value.className = 'pulse-value';
    row.append(value);
    pulseRows.push({ row, label: row.firstChild, value });
  }

  // Active power-ups (Bloom Shield, Nectar Boost) with their seconds left; hidden when there are none
  effectsRow = createRow('Effects');
  effectsValue = document.createElement('span');
  effectsValue.className = 'effects-value';
  effectsRow.append(effectsValue);
  effectsRow.hidden = true;

  panel.append(healthRow, livesRow, ...pulseRows.map(({ row }) => row), effectsRow);
  setHudMode('single');

  const timerBox = document.createElement('div');
  timerBox.className = 'timer-box';
  timer = document.createElement('div');
  timer.className = 'timer';
  waveLabel = document.createElement('div');
  waveLabel.className = 'wave';
  levelLabel = document.createElement('div');
  levelLabel.className = 'level-label';
  timerBox.append(timer, waveLabel, levelLabel);

  // The boss's name and health bar under the score, and its big name banner during the intro; hidden until a boss
  bossPanel = document.createElement('div');
  bossPanel.className = 'boss-panel';
  bossPanel.hidden = true;
  bossName = document.createElement('div');
  bossName.className = 'boss-name';
  const bossBar = document.createElement('div');
  bossBar.className = 'boss-bar';
  bossFill = document.createElement('div');
  bossFill.className = 'boss-fill';
  bossBar.append(bossFill);
  bossPanel.append(bossName, bossBar);

  bossBanner = document.createElement('div');
  bossBanner.className = 'boss-banner';
  bossBanner.hidden = true;

  document.body.append(panel, timerBox, bossPanel, bossBanner);
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

// boss: { name, health (0 to 1), banner (0 to 1: how visible the intro banner is) }, or null when there is none.
// The banner's opacity is rounded to steps of 5 %, so the page is only touched when it visibly changes.
function updateBossHud(boss) {
  const health = boss ? boss.health : null;
  if (health !== shown.bossHealth) {
    shown.bossHealth = health;
    bossPanel.hidden = health === null;
    if (boss) {
      bossName.textContent = boss.name;
      bossBanner.textContent = boss.name;
      bossFill.style.width = `${health * 100}%`;
    }
  }

  const banner = boss ? Math.round(boss.banner * 20) / 20 : 0;
  if (banner !== shown.bossBanner) {
    shown.bossBanner = banner;
    bossBanner.hidden = banner === 0;
    bossBanner.style.opacity = String(banner);
  }
}

// 'single': one 'Pulse [E]' row, exactly as before. 'coop': coloured 'P1 Pulse [E]' and 'P2 Pulse [Q]' rows.
export function setHudMode(mode) {
  const labels = PULSE_LABELS[mode];
  pulseRowCount = labels.length;
  panel.classList.toggle('coop', mode === 'coop');
  pulseRows.forEach(({ row, label }, index) => {
    row.hidden = index >= labels.length;
    label.textContent = labels[index] ?? '';
  });
  shown.pulses = [];
  shown.pulsesHidden = null;
  shown.effects = null;
}

// pulseCooldowns and boostTimes: one value per active player, in player order.
// flowerHealth and pulseCooldowns are null where there is no flower (the boss arena), which hides their rows.
export function updateHud({
  flowerHealth,
  flowerMaxHealth,
  lives,
  timeLeft,
  wave,
  waveCount,
  level,
  pulseCooldowns,
  shieldTime,
  boostTimes,
  boss,
}) {
  if (flowerHealth !== shown.flowerHealth) {
    shown.flowerHealth = flowerHealth;
    healthRow.hidden = flowerHealth === null;
    if (flowerHealth !== null) {
      const ratio = flowerHealth / flowerMaxHealth;
      healthFill.style.width = `${ratio * 100}%`;
      healthFill.classList.toggle('danger', ratio < DANGER_RATIO);
      healthFill.classList.toggle('warning', ratio >= DANGER_RATIO && ratio <= WARNING_RATIO);
      healthValue.textContent = `${flowerHealth}/${flowerMaxHealth}`;
    }
  }

  if (lives !== shown.lives) {
    shown.lives = lives;
    lifePips.forEach((pip, index) => pip.classList.toggle('filled', index < lives));
  }

  // Round up, so the timer shows 2:00 at the start and 0:00 only when time has run out.
  // timeLeft is null on a level without a timer, which hides it.
  const seconds = timeLeft === null ? null : Math.ceil(timeLeft);
  if (seconds !== shown.seconds) {
    shown.seconds = seconds;
    timer.hidden = seconds === null;
    if (seconds !== null) timer.textContent = `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
  }

  // wave is null on a level without bee waves, which hides it
  if (wave !== shown.wave) {
    shown.wave = wave;
    waveLabel.hidden = wave === null;
    if (wave !== null) waveLabel.textContent = `Wave ${wave}/${waveCount}`;
  }

  updateBossHud(boss);

  // e.g. 'Level 2 · Coast'
  if (level !== shown.level) {
    shown.level = level;
    levelLabel.textContent = level;
  }

  const pulsesHidden = pulseCooldowns === null;
  if (pulsesHidden !== shown.pulsesHidden) {
    shown.pulsesHidden = pulsesHidden;
    pulseRows.forEach(({ row }, index) => {
      row.hidden = pulsesHidden || index >= pulseRowCount;
    });
    shown.pulses = [];
  }

  // 'Ready', or the whole seconds left on the cooldown, rounded up
  (pulseCooldowns ?? []).forEach((cooldown, index) => {
    const pulse = cooldown > 0 ? `${Math.ceil(cooldown)}s` : 'Ready';
    if (pulse === shown.pulses[index]) return;
    shown.pulses[index] = pulse;
    pulseRows[index].value.textContent = pulse;
    pulseRows[index].value.classList.toggle('ready', cooldown === 0);
  });

  // e.g. 'Shield 6s · Boost 3s', or 'P1 Boost 3s · P2 Boost 5s' in co-op; seconds rounded up
  const effects = [];
  if (shieldTime > 0) effects.push(`Shield ${Math.ceil(shieldTime)}s`);
  boostTimes.forEach((time, index) => {
    if (time > 0) effects.push(`${boostTimes.length > 1 ? `P${index + 1} ` : ''}Boost ${Math.ceil(time)}s`);
  });
  const text = effects.join(' · ');
  if (text !== shown.effects) {
    shown.effects = text;
    effectsValue.textContent = text;
    effectsRow.hidden = text === '';
  }
}
