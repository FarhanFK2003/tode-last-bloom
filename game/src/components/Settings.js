// Player preferences (music volume, sound-effects volume, mute), kept in memory and saved to localStorage.
// Audio.js reads them at start-up and follows every change through onSettingsChange.

const STORAGE_KEY = 'tode-last-bloom:settings';
const STORAGE_VERSION = 1;

const DEFAULTS = Object.freeze({ musicVolume: 70, sfxVolume: 80, muted: false });

const listeners = new Set();
let settings = load();

// A whole number from 0 to 100; anything that isn't a finite number falls back to the default
function validVolume(value, fallback) {
  if (typeof value !== 'number' || !Number.isFinite(value)) return fallback;
  return Math.round(Math.min(Math.max(value, 0), 100));
}

// Keeps only known, valid values, so malformed or partial data can never break the game
function sanitize(data) {
  if (!data || typeof data !== 'object') return { ...DEFAULTS };
  return {
    musicVolume: validVolume(data.musicVolume, DEFAULTS.musicVolume),
    sfxVolume: validVolume(data.sfxVolume, DEFAULTS.sfxVolume),
    muted: typeof data.muted === 'boolean' ? data.muted : DEFAULTS.muted,
  };
}

// Storage can be missing, blocked or full; in every such case the game keeps working with in-memory settings
function load() {
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    return stored === null ? { ...DEFAULTS } : sanitize(JSON.parse(stored));
  } catch {
    return { ...DEFAULTS };
  }
}

function save() {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify({ version: STORAGE_VERSION, ...settings }));
  } catch {
    // Not saved, but the change still applies for this session
  }
}

export function getSettings() {
  return { ...settings };
}

// Applies and saves a partial change, e.g. { muted: true }. Muting leaves both volumes untouched,
// so unmuting brings back the levels chosen before.
export function updateSettings(changes) {
  settings = sanitize({ ...settings, ...changes });
  save();
  for (const listener of listeners) listener(getSettings());
}

// Lets every settings screen (main menu and pause menu) show the same values
export function onSettingsChange(listener) {
  listeners.add(listener);
}
