// The flower bar turns yellow at or below half health, and red below a quarter
const WARNING_RATIO = 0.5;
const DANGER_RATIO = 0.25;

let healthRow = null;
let healthFill = null;
let healthValue = null;
let livesRow = null;
let lifePips = [];
let timer = null;
let waveLabel = null;
let levelLabel = null;
let panel = null;
let effectsRow = null;
// Effect chips, made once: the team's Bloom Shield, and one Nectar Boost per player
let shieldChip = null;
const boostChips = [];
let bossPanel = null;
let bossFill = null;
let bossName = null;
let bossValue = null;
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
  shield: null,
  boosts: [],
  anyEffect: null,
  pulsesHidden: null,
  bossHealth: null,
  bossValue: null,
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

  // One heart per life, made once; filled or empty is only a class (see updateHud)
  livesRow = createRow('Lives');
  livesRow.classList.add('lives-row');
  lifePips = Array.from({ length: maxLives }, () => {
    const pip = document.createElement('span');
    pip.className = 'life-pip';
    pip.textContent = '\u2665';
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

  // Active power-ups as small chips with their seconds left: a blue Shield chip (the Shield protects the whole
  // team, so it has no player badge) and a gold Boost chip per player (with a P1/P2 badge in co-op).
  // The row is hidden when no effect is active.
  effectsRow = createRow('Effects');
  const effectsValue = document.createElement('span');
  effectsValue.className = 'effects-value';
  shieldChip = createChip('shield');
  boostChips.push(createChip('boost', 1), createChip('boost', 2));
  effectsValue.append(shieldChip.chip, ...boostChips.map(({ chip }) => chip));
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
  // Header: the name on the left, 'current / max' on the right
  const bossHeader = document.createElement('div');
  bossHeader.className = 'boss-header';
  bossName = document.createElement('span');
  bossName.className = 'boss-name';
  bossValue = document.createElement('span');
  bossValue.className = 'boss-value';
  bossHeader.append(bossName, bossValue);
  const bossBar = document.createElement('div');
  bossBar.className = 'boss-bar';
  bossFill = document.createElement('div');
  bossFill.className = 'boss-fill';
  bossBar.append(bossFill);
  bossPanel.append(bossHeader, bossBar);

  bossBanner = document.createElement('div');
  bossBanner.className = 'boss-banner';
  bossBanner.hidden = true;

  document.body.append(panel, timerBox, bossPanel, bossBanner);
}

// One effect chip: an icon (a small shield shape, or a sparkle for Boost), an optional player badge and the
// seconds left. Starts hidden.
function createChip(type, player = null) {
  const chip = document.createElement('span');
  chip.className = `effect-chip effect-${type}`;
  chip.hidden = true;
  const icon = document.createElement('span');
  icon.className = `effect-icon effect-icon-${type}`;
  if (type === 'boost') icon.textContent = '\u2726';
  const owner = document.createElement('span');
  owner.className = `effect-owner p${player ?? 1}`;
  owner.textContent = player ? `P${player}` : '';
  owner.hidden = true;
  const time = document.createElement('span');
  time.className = 'effect-time';
  chip.append(icon, owner, time);
  return { chip, owner, time };
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

// boss: { name, health (0 to 1), current and max (its actual health), banner (0 to 1: how visible the intro
// banner is) }, or null when there is none.
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

  // The actual health as 'current / max'; left out (rather than guessed) if those values aren't given
  const known = boss && Number.isFinite(boss.current) && Number.isFinite(boss.max);
  const value = known ? `${boss.current} / ${boss.max}` : '';
  if (value !== shown.bossValue) {
    shown.bossValue = value;
    bossValue.textContent = value;
    bossValue.hidden = value === '';
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
  shown.shield = null;
  shown.boosts = [];
  shown.anyEffect = null;
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
    // A gentle warning tint on the row while the team is down to its last life
    livesRow.classList.toggle('last-life', lives === 1);
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

  // Effect chips: seconds left rounded up, as before. Each chip is only touched when its own value changes.
  const shield = shieldTime > 0 ? Math.ceil(shieldTime) : 0;
  if (shield !== shown.shield) {
    shown.shield = shield;
    shieldChip.chip.hidden = shield === 0;
    if (shield > 0) shieldChip.time.textContent = `${shield}s`;
  }

  // One Boost chip per active player; the P1/P2 badges only show in co-op (more than one player)
  const coop = boostTimes.length > 1;
  boostChips.forEach(({ chip, owner, time }, index) => {
    const seconds = boostTimes[index] > 0 ? Math.ceil(boostTimes[index]) : 0;
    const key = `${seconds}:${coop}`;
    if (key === shown.boosts[index]) return;
    shown.boosts[index] = key;
    chip.hidden = seconds === 0;
    owner.hidden = !coop;
    if (seconds > 0) time.textContent = `${seconds}s`;
  });

  const anyEffect = shield > 0 || boostTimes.some((boost) => boost > 0);
  if (anyEffect !== shown.anyEffect) {
    shown.anyEffect = anyEffect;
    effectsRow.hidden = !anyEffect;
  }
}
