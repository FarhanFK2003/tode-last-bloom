// All of the game's sound, generated in code with the browser's Web Audio API: no audio files, no libraries.
//
//   music notes → track bus → duck (pause) → music volume ─┐
//   sound effects ───────────────────────── sfx volume ────┼→ master (mute) → compressor → speakers
//
// Volumes and mute come from Settings.js and apply immediately. Browsers only allow audio after the player
// has interacted with the page, so the audio context is created on the first click or key press; until then
// every call quietly does nothing (requested music starts at that moment).
// The timers below only schedule audio. They never touch gameplay timing or state.

import { getSettings, onSettingsChange } from './Settings.js';

const RAMP_TIME = 0.05; // seconds for volume changes, so they never click
const DUCK_TIME = 0.3; // seconds to lower or restore the music for pause
const MUSIC_FADE = 0.6; // seconds to fade between tracks
// Music level while paused: about -16 dB, which sounds roughly 30 % as loud
const DUCKED_LEVEL = 0.15;
// Player 2's own action sounds are two semitones higher
const PLAYER_TWO_PITCH = 2 ** (2 / 12);
// No more than this many sound effects at once, whatever is happening
const MAX_VOICES = 16;

// Music scheduling: notes are queued a little ahead of time, checked every 25 ms
const SCHEDULE_INTERVAL = 25; // milliseconds
const SCHEDULE_AHEAD = 0.12; // seconds

let context = null;
let masterGain = null;
let musicGain = null;
let duckGain = null;
let sfxGain = null;
let noiseBuffer = null;
let unlocked = false;
let ducked = false;

let requestedTrack = null; // the music the game currently wants ('menu', 'game' or null)
let music = null; // the playing track: { name, track, bus, step, nextTime, timer }
let jingleBus = null; // the victory or defeat tune, so it can be cut off when play continues

const lastPlayed = new Map(); // rate limiting: sound (and player) -> time it last played
let voices = []; // sound effects still ringing: { name, end }

// A slider value (0–100) to a gain. Squaring makes the slider feel even; 0 is silence, 100 is full level.
function volumeToGain(percent) {
  return (percent / 100) ** 2;
}

function midiToFrequency(note) {
  return 440 * 2 ** ((note - 69) / 12);
}

// Moves a gain smoothly to a new value
function rampGain(node, value, duration = RAMP_TIME) {
  const now = context.currentTime;
  node.gain.cancelScheduledValues(now);
  node.gain.setValueAtTime(node.gain.value, now);
  node.gain.linearRampToValueAtTime(value, now + duration);
}

function applySettings(settings) {
  if (!context) return;
  rampGain(musicGain, volumeToGain(settings.musicVolume));
  rampGain(sfxGain, volumeToGain(settings.sfxVolume));
  // Mute only silences the master: the chosen volumes stay as they are
  rampGain(masterGain, settings.muted ? 0 : 1);
}

// Creates the audio context and its fixed routing, once. Returns false if the browser has no Web Audio.
function createContext() {
  if (context) return true;
  const AudioContextClass = window.AudioContext || window.webkitAudioContext;
  if (!AudioContextClass) return false;

  try {
    context = new AudioContextClass();
    masterGain = context.createGain();
    musicGain = context.createGain();
    duckGain = context.createGain();
    sfxGain = context.createGain();
    // Gently evens out moments when many sounds overlap, so they can't clip
    const compressor = context.createDynamicsCompressor();

    duckGain.gain.value = ducked ? DUCKED_LEVEL : 1;
    duckGain.connect(musicGain);
    musicGain.connect(masterGain);
    sfxGain.connect(masterGain);
    masterGain.connect(compressor);
    compressor.connect(context.destination);

    noiseBuffer = createNoiseBuffer();
    const settings = getSettings();
    musicGain.gain.value = volumeToGain(settings.musicVolume);
    sfxGain.gain.value = volumeToGain(settings.sfxVolume);
    masterGain.gain.value = settings.muted ? 0 : 1;
    return true;
  } catch (error) {
    console.warn('Audio is unavailable; the game continues without sound.', error);
    context = null;
    return false;
  }
}

// Half a second of white noise, reused by every whoosh
function createNoiseBuffer() {
  const buffer = context.createBuffer(1, Math.floor(context.sampleRate * 0.5), context.sampleRate);
  const samples = buffer.getChannelData(0);
  for (let i = 0; i < samples.length; i++) samples[i] = Math.random() * 2 - 1;
  return buffer;
}

// The first click or key press unlocks audio; the listeners remove themselves once audio is running
function unlock() {
  if (!createContext()) {
    removeUnlockListeners();
    return;
  }
  if (!unlocked) {
    unlocked = true;
    startMusic(requestedTrack);
  }
  context
    .resume()
    .then(() => {
      if (context.state === 'running') removeUnlockListeners();
    })
    .catch(() => {
      // Still blocked: the next click or key press tries again
    });
}

function removeUnlockListeners() {
  window.removeEventListener('pointerdown', unlock, true);
  window.removeEventListener('keydown', unlock, true);
}

// The browser stops the game loop in a hidden tab but not audio, so audio is paused too
function handleVisibilityChange() {
  if (!context || !unlocked) return;
  if (document.hidden) {
    stopScheduler();
    context.suspend().catch(() => {});
  } else {
    context
      .resume()
      .then(startScheduler)
      .catch(() => {});
  }
}

export function initAudio() {
  window.addEventListener('pointerdown', unlock, true);
  window.addEventListener('keydown', unlock, true);
  document.addEventListener('visibilitychange', handleVisibilityChange);
  onSettingsChange(applySettings);
}

// ---------------------------------------------------------------------------------------------------------------
// Music: two short, looping pentatonic tunes (soft plucked melody over a gentle bass), generated note by note

const TRACKS = {
  menu: {
    stepTime: 60 / 76 / 2, // eighth notes at 76 BPM
    melodyVolume: 0.07,
    bassVolume: 0.06,
    melody: [
      76, null, 79, null, 81, null, 79, 76,
      74, null, 76, null, 72, null, null, null,
      76, null, 79, null, 84, null, 81, 79,
      81, null, 79, 76, 74, null, 72, null,
    ],
    bass: [48, 55, 45, 52, 41, 48, 43, 50], // one note every four steps
  },
  game: {
    stepTime: 60 / 100 / 2, // eighth notes at 100 BPM
    melodyVolume: 0.06,
    bassVolume: 0.06,
    melody: [
      72, 76, 79, 76, 81, 79, 76, 74,
      72, 74, 76, 79, 76, 74, 72, null,
      79, 81, 84, 81, 79, 76, 74, 76,
      79, 76, 74, 72, 74, null, 72, null,
    ],
    bass: [48, 55, 45, 52, 41, 48, 43, 50],
  },
};

function playNote(output, note, time, duration, type, volume) {
  const oscillator = context.createOscillator();
  const gain = context.createGain();
  oscillator.type = type;
  oscillator.frequency.value = midiToFrequency(note);
  gain.gain.setValueAtTime(0.0001, time);
  gain.gain.exponentialRampToValueAtTime(volume, time + 0.02);
  gain.gain.exponentialRampToValueAtTime(0.0001, time + duration);
  oscillator.connect(gain).connect(output);
  oscillator.start(time);
  oscillator.stop(time + duration + 0.05);
  oscillator.onended = () => {
    oscillator.disconnect();
    gain.disconnect();
  };
}

// Queues every note that falls within the next SCHEDULE_AHEAD seconds
function scheduleMusic() {
  if (!music) return;
  const { track } = music;
  while (music.nextTime < context.currentTime + SCHEDULE_AHEAD) {
    const { step, nextTime } = music;
    const note = track.melody[step];
    if (note !== null) playNote(music.bus, note, nextTime, track.stepTime * 1.6, 'triangle', track.melodyVolume);
    if (step % 4 === 0) playNote(music.bus, track.bass[step / 4], nextTime, track.stepTime * 4, 'sine', track.bassVolume);
    music.nextTime += track.stepTime;
    music.step = (step + 1) % track.melody.length;
  }
}

function startScheduler() {
  if (!music || music.timer !== null || document.hidden) return;
  // Never try to catch up on time that has passed (e.g. while the tab was hidden)
  music.nextTime = Math.max(music.nextTime, context.currentTime + 0.05);
  music.timer = setInterval(scheduleMusic, SCHEDULE_INTERVAL);
  scheduleMusic();
}

function stopScheduler() {
  if (!music || music.timer === null) return;
  clearInterval(music.timer);
  music.timer = null;
}

// Fades a bus out and disconnects it once it is silent
function fadeOutBus(bus, duration) {
  rampGain(bus, 0, duration);
  setTimeout(() => bus.disconnect(), (duration + 0.2) * 1000);
}

function stopMusic() {
  if (!music) return;
  stopScheduler();
  fadeOutBus(music.bus, MUSIC_FADE);
  music = null;
}

// Starts a track from its beginning on a fresh bus, fading it in
function startMusic(name) {
  stopMusic();
  if (!name || !context || !unlocked) return;

  const bus = context.createGain();
  bus.gain.value = 0;
  bus.connect(duckGain);
  rampGain(bus, 1, MUSIC_FADE);
  music = { name, track: TRACKS[name], bus, step: 0, nextTime: context.currentTime + 0.05, timer: null };
  startScheduler();
}

function stopJingle() {
  if (!jingleBus) return;
  fadeOutBus(jingleBus, 0.15);
  jingleBus = null;
}

// 'menu', 'game' or null (silence). Asking for the track that is already playing does nothing,
// unless restart is set, which starts it again from the beginning. Any ending tune is cut off.
export function setMusic(name, { restart = false } = {}) {
  stopJingle();
  if (name === requestedTrack && !restart) return;
  requestedTrack = name;
  if (unlocked) startMusic(name);
}

// Lowers the music while paused (button clicks stay at full level), or restores it
export function setMusicDucked(enabled) {
  ducked = enabled;
  if (context) rampGain(duckGain, enabled ? DUCKED_LEVEL : 1, DUCK_TIME);
}

// ---------------------------------------------------------------------------------------------------------------
// Sound effects: short, soft tones shaped in real time

function tone(output, { time, from, to = from, duration, volume, type = 'sine', attack = 0.005 }) {
  const oscillator = context.createOscillator();
  const gain = context.createGain();
  oscillator.type = type;
  oscillator.frequency.setValueAtTime(from, time);
  if (to !== from) oscillator.frequency.exponentialRampToValueAtTime(to, time + duration);
  gain.gain.setValueAtTime(0.0001, time);
  gain.gain.exponentialRampToValueAtTime(volume, time + attack);
  gain.gain.exponentialRampToValueAtTime(0.0001, time + duration);
  oscillator.connect(gain).connect(output);
  oscillator.start(time);
  oscillator.stop(time + duration + 0.02);
  oscillator.onended = () => {
    oscillator.disconnect();
    gain.disconnect();
  };
}

// A short, filtered puff of noise: the "whoosh" of an attack
function whoosh(output, { time, frequency, duration, volume }) {
  const source = context.createBufferSource();
  const filter = context.createBiquadFilter();
  const gain = context.createGain();
  source.buffer = noiseBuffer;
  filter.type = 'bandpass';
  filter.frequency.value = frequency;
  filter.Q.value = 1.2;
  gain.gain.setValueAtTime(0.0001, time);
  gain.gain.exponentialRampToValueAtTime(volume, time + 0.02);
  gain.gain.exponentialRampToValueAtTime(0.0001, time + duration);
  source.connect(filter).connect(gain).connect(output);
  source.start(time);
  source.stop(time + duration + 0.02);
  source.onended = () => {
    source.disconnect();
    filter.disconnect();
    gain.disconnect();
  };
}

function notes(output, time, list, { spacing, duration, volume, type = 'triangle' }) {
  list.forEach((note, index) => {
    tone(output, { time: time + index * spacing, from: midiToFrequency(note), duration, volume, type });
  });
}

// minGap: shortest time between two plays (per player for perPlayer sounds); maxVoices: copies at once.
// play() schedules the sound and returns how long it rings.
const SOUNDS = {
  click: {
    minGap: 0.03,
    maxVoices: 2,
    play: ({ time, output }) => {
      tone(output, { time, from: 880, to: 660, duration: 0.07, volume: 0.1 });
      return 0.07;
    },
  },
  start: {
    minGap: 0.3,
    maxVoices: 1,
    play: ({ time, output }) => {
      notes(output, time, [72, 76, 79, 84], { spacing: 0.07, duration: 0.2, volume: 0.1 });
      return 0.42;
    },
  },
  hop: {
    perPlayer: true,
    minGap: 0.08,
    maxVoices: 2,
    play: ({ time, pitch, output }) => {
      tone(output, { time, from: 260 * pitch, to: 420 * pitch, duration: 0.09, volume: 0.045 });
      return 0.09;
    },
  },
  attack: {
    perPlayer: true,
    minGap: 0.05,
    maxVoices: 3,
    play: ({ time, pitch, output }) => {
      whoosh(output, { time, frequency: 1400 * pitch, duration: 0.14, volume: 0.1 });
      tone(output, { time, from: 520 * pitch, to: 260 * pitch, duration: 0.12, volume: 0.07, type: 'triangle' });
      return 0.14;
    },
  },
  pop: {
    minGap: 0.06,
    maxVoices: 3,
    // A little brighter when several bees are defeated in the same volley
    play: ({ time, count, output }) => {
      const volume = 0.09 + 0.02 * Math.min(count - 1, 3);
      tone(output, { time, from: 600, to: 1300, duration: 0.08, volume });
      tone(output, { time: time + 0.05, from: 1760, duration: 0.14, volume: 0.035, type: 'triangle' });
      return 0.19;
    },
  },
  bite: {
    minGap: 0.12,
    maxVoices: 2,
    play: ({ time, output }) => {
      tone(output, { time, from: 300, to: 220, duration: 0.05, volume: 0.08, type: 'triangle' });
      tone(output, { time: time + 0.06, from: 260, to: 190, duration: 0.05, volume: 0.07, type: 'triangle' });
      return 0.11;
    },
  },
  hurt: {
    minGap: 0.3,
    maxVoices: 1,
    play: ({ time, output }) => {
      tone(output, { time, from: 523, to: 262, duration: 0.35, volume: 0.13, type: 'triangle' });
      tone(output, { time: time + 0.05, from: 392, to: 196, duration: 0.35, volume: 0.06 });
      return 0.4;
    },
  },
  pulse: {
    minGap: 0.2,
    maxVoices: 1,
    play: ({ time, output }) => {
      tone(output, { time, from: 220, to: 880, duration: 0.45, volume: 0.1, attack: 0.03 });
      tone(output, { time: time + 0.15, from: 1319, duration: 0.5, volume: 0.035, type: 'triangle' });
      tone(output, { time: time + 0.25, from: 1760, duration: 0.5, volume: 0.025, type: 'triangle' });
      return 0.75;
    },
  },
  pulseReady: {
    perPlayer: true,
    minGap: 0.1,
    maxVoices: 2,
    play: ({ time, pitch, output }) => {
      tone(output, { time, from: 1047 * pitch, duration: 0.18, volume: 0.05 });
      tone(output, { time: time + 0.09, from: 1319 * pitch, duration: 0.25, volume: 0.05 });
      return 0.34;
    },
  },
  victory: {
    jingle: true,
    minGap: 1,
    maxVoices: 1,
    play: ({ time, output }) => {
      notes(output, time, [72, 76, 79, 84], { spacing: 0.12, duration: 0.3, volume: 0.1 });
      notes(output, time + 0.5, [72, 76, 79], { spacing: 0, duration: 0.9, volume: 0.05 });
      return 1.4;
    },
  },
  defeat: {
    jingle: true,
    minGap: 1,
    maxVoices: 1,
    play: ({ time, output }) => {
      notes(output, time, [79, 76, 72, 67], { spacing: 0.22, duration: 0.4, volume: 0.09 });
      return 1.1;
    },
  },
};

// Plays one sound effect. player 2 raises the pitch of that player's own action sounds;
// count tells the pop how many bees were defeated together.
export function playSound(name, { player = 1, count = 1 } = {}) {
  const sound = SOUNDS[name];
  if (!sound || !context || !unlocked || document.hidden) return;

  try {
    const now = context.currentTime;
    const key = sound.perPlayer ? `${name}:${player}` : name;
    if (now - (lastPlayed.get(key) ?? -Infinity) < sound.minGap) return;

    voices = voices.filter((voice) => voice.end > now);
    const sameSound = voices.filter((voice) => voice.name === name).length;
    if (sameSound >= sound.maxVoices || voices.length >= MAX_VOICES) return;

    let output = sfxGain;
    if (sound.jingle) {
      stopJingle();
      jingleBus = context.createGain();
      jingleBus.connect(sfxGain);
      output = jingleBus;
    }

    lastPlayed.set(key, now);
    const pitch = sound.perPlayer && player === 2 ? PLAYER_TWO_PITCH : 1;
    const duration = sound.play({ time: now, pitch, count, output });
    voices.push({ name, end: now + duration });
  } catch (error) {
    console.warn(`Could not play sound "${name}".`, error);
  }
}
