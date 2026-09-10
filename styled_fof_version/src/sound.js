// Placeholder SFX — every "sound" here is a tiny procedurally-generated
// blip built straight from the Web Audio API (an oscillator or a short
// burst of filtered noise with a quick volume envelope). None of this is
// meant to be final audio — it's just enough of a hook on every core
// interaction (click, tile enter, pig land, shoot, hit, destroy, despawn,
// fall) so the base game is already "covered" and swapping in real SFX
// later is just replacing the body of each function below with an actual
// sample playback call.
import { SOUND } from './config.js';

let ctx = null;
// A real BUS MIX instead of every voice connecting straight to the
// destination. Three gain nodes — master, music, sfx — so the two families
// can be balanced against each other, and so ducking the effects under a
// fanfare is one setValueAtTime rather than a change to every call site.
let masterBus = null;
let musicBus = null;
let sfxBus = null;

function getCtx() {
  if (!SOUND.enabled) return null;
  if (!ctx) {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    ctx = new AC();
    masterBus = ctx.createGain();
    masterBus.gain.value = SOUND.masterVolume;
    masterBus.connect(ctx.destination);
    musicBus = ctx.createGain();
    musicBus.gain.value = SOUND.musicVolume;
    musicBus.connect(masterBus);
    sfxBus = ctx.createGain();
    sfxBus.gain.value = SOUND.sfxVolume;
    sfxBus.connect(masterBus);
  }
  // Browsers suspend the context until a user gesture — resume opportunistically.
  if (ctx.state === 'suspended') ctx.resume();
  return ctx;
}

/* VOICE LIMITING.
 *
 * Five riders firing several times a second put a dozen overlapping shot
 * blips into the same few milliseconds, and Web Audio simply SUMS them —
 * so the shot was not "a bit loud", it was N times loud, and it got louder
 * the better the player was doing. Clamping the master volume would fix
 * the peak by making every other sound quieter, which is the wrong trade.
 *
 * Instead each cue can declare a minimum spacing and a cap on how many of
 * it may sound at once. A shot that arrives inside the window is DROPPED,
 * not queued: the player cannot hear the difference between eight
 * simultaneous shots and three, so the extra five are only headroom being
 * spent. This is the same reasoning a game audio engine's voice stealing
 * uses, in about ten lines.
 */
const voiceState = new Map();
function canPlay(key, minGapMs, maxConcurrent = 3) {
  const c = getCtx();
  if (!c) return false;
  const now = c.currentTime * 1000;
  let st = voiceState.get(key);
  if (!st) { st = { last: -1e9, recent: [] }; voiceState.set(key, st); }
  if (now - st.last < minGapMs) return false;
  // Window of "still audible" starts, so a burst is measured rather than
  // guessed at.
  st.recent = st.recent.filter((t) => now - t < 120);
  if (st.recent.length >= maxConcurrent) return false;
  st.last = now;
  st.recent.push(now);
  return true;
}

/** A single tone with a quick exponential decay envelope. */
function tone({ freq = 440, endFreq = null, duration = 0.12, type = 'sine', gain = 0.3, delay = 0 }) {
  const c = getCtx();
  if (!c) return;
  const t0 = c.currentTime + delay;
  const osc = c.createOscillator();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, t0);
  if (endFreq !== null) osc.frequency.exponentialRampToValueAtTime(Math.max(endFreq, 1), t0 + duration);

  const amp = c.createGain();
  const vol = gain;
  amp.gain.setValueAtTime(0.0001, t0);
  amp.gain.exponentialRampToValueAtTime(Math.max(vol, 0.0001), t0 + 0.008);
  amp.gain.exponentialRampToValueAtTime(0.0001, t0 + duration);

  osc.connect(amp);
  amp.connect(sfxBus);
  osc.start(t0);
  osc.stop(t0 + duration + 0.02);
}

/** A short burst of filtered white noise — good for "impact"/"thud" SFX. */
function noiseBurst({ duration = 0.15, filterFreq = 1200, gain = 0.35, delay = 0 }) {
  const c = getCtx();
  if (!c) return;
  const t0 = c.currentTime + delay;
  const bufferSize = Math.max(1, Math.floor(c.sampleRate * duration));
  const buffer = c.createBuffer(1, bufferSize, c.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < bufferSize; i++) data[i] = Math.random() * 2 - 1;

  const src = c.createBufferSource();
  src.buffer = buffer;

  const filter = c.createBiquadFilter();
  filter.type = 'lowpass';
  filter.frequency.setValueAtTime(filterFreq, t0);

  const amp = c.createGain();
  const vol = gain;
  amp.gain.setValueAtTime(vol, t0);
  amp.gain.exponentialRampToValueAtTime(0.0001, t0 + duration);

  src.connect(filter);
  filter.connect(amp);
  amp.connect(sfxBus);
  src.start(t0);
  src.stop(t0 + duration + 0.02);
}

export const sfx = {
  /** Clicking/picking a pig in the queue. */
  click() {
    tone({ freq: 720, endFreq: 880, duration: 0.06, type: 'square', gain: 0.18 });
  },
  /** The fiche/tile pushing out of the stack onto the belt. */
  tileEnter() {
    tone({ freq: 200, endFreq: 140, duration: 0.14, type: 'triangle', gain: 0.22 });
  },
  /** The pig landing on top of the tile once it reaches the belt. */
  pigLand() {
    noiseBurst({ duration: 0.08, filterFreq: 500, gain: 0.2 });
    tone({ freq: 150, endFreq: 90, duration: 0.1, type: 'sine', gain: 0.15, delay: 0.01 });
  },
  /** A pig firing a shot. The most frequent cue in the game by an order of
   * magnitude, so it is the one that has to be limited hardest. */
  shoot() {
    if (!canPlay('shoot', 55, 2)) return;
    tone({ freq: 950, endFreq: 500, duration: 0.05, type: 'sawtooth', gain: 0.075 });
  },
  /** A shot landing on a pillar. */
  hit() {
    if (!canPlay('hit', 45, 3)) return;
    noiseBurst({ duration: 0.06, filterFreq: 2500, gain: 0.12 });
  },
  /** A pillar being destroyed (collapse animation kicking off). */
  pillarDestroy() {
    if (!canPlay('destroy', 45, 3)) return;
    tone({ freq: 260, endFreq: 60, duration: 0.22, type: 'triangle', gain: 0.15 });
    noiseBurst({ duration: 0.12, filterFreq: 800, gain: 0.1, delay: 0.02 });
  },
  /** A pig disappearing after running out of ammo. */
  pigDespawn() {
    tone({ freq: 500, endFreq: 900, duration: 0.12, type: 'sine', gain: 0.16 });
  },
  /** A pig reaching the end of the belt and dropping into the hole. */
  pigFall() {
    tone({ freq: 400, endFreq: 60, duration: 0.3, type: 'sine', gain: 0.2 });
  },

  /** A boost DROPPING onto the board — a rising two-note sparkle.
   *
   * Deliberately the only RISING interval in the whole set. Every other
   * cue here falls in pitch (destroy, fall, land), because they are all
   * things ending; a boost appearing is the one event that is a gain, and
   * pitch direction is the fastest way for a player to tell the two apart
   * without listening for timbre. */
  boostDrop() {
    tone({ freq: 660, endFreq: 990, duration: 0.1, type: 'triangle', gain: 0.2 });
    tone({ freq: 990, endFreq: 1320, duration: 0.14, type: 'triangle', gain: 0.16, delay: 0.08 });
  },

  /** Spending a boost — a short bright zap, distinct from picking one up. */
  boostUse() {
    tone({ freq: 1200, endFreq: 420, duration: 0.16, type: 'sawtooth', gain: 0.16 });
    noiseBurst({ duration: 0.1, filterFreq: 3200, gain: 0.14 });
  },

  /** Something hitting the water. Noise through a rising then falling
   * filter, which is what a splash actually is — a broadband burst whose
   * bright content dies away as the droplets lose energy. A pitched tone
   * would read as a bloop, not as water. */
  splash(strength = 1) {
    if (!canPlay('splash', 60, 3)) return;
    noiseBurst({ duration: 0.16 * strength, filterFreq: 3200, gain: 0.16 * strength });
    noiseBurst({ duration: 0.3 * strength, filterFreq: 900, gain: 0.1 * strength, delay: 0.04 });
    tone({ freq: 320, endFreq: 120, duration: 0.14, type: 'sine', gain: 0.07 * strength, delay: 0.02 });
  },

  /** One tick of a number counting up on the win screen. */
  countTick() {
    tone({ freq: 880, endFreq: 880, duration: 0.03, type: 'square', gain: 0.05 });
  },

  /** A coin landing on the win screen tally. */
  coin() {
    tone({ freq: 1050, duration: 0.06, type: 'square', gain: 0.1 });
    tone({ freq: 1560, duration: 0.09, type: 'square', gain: 0.09, delay: 0.05 });
  },

  /** A star being awarded — pitched UP per star, so three stars read as an
   * ascending fanfare rather than the same sound three times. */
  star(index) {
    const base = 660 * Math.pow(1.26, index); // ~a major third apart
    tone({ freq: base, endFreq: base * 1.5, duration: 0.28, type: 'triangle', gain: 0.22 });
    tone({ freq: base * 2, duration: 0.3, type: 'sine', gain: 0.1, delay: 0.03 });
  },
};

/* ============================================================
 * MUSIC
 * ------------------------------------------------------------
 * Two tracks, streamed through <audio> elements rather than decoded into
 * AudioBuffers: the gameplay loop is 4.5MB, and decodeAudioData would hold
 * the whole thing uncompressed in memory (minutes of stereo float32 is
 * tens of megabytes) and block while it decoded. An <audio> element
 * streams it, and MediaElementSource still routes it through the same bus
 * as everything else, so it is mixed and ducked like any other voice.
 *
 * Playback cannot start before a user gesture — every browser blocks it —
 * so start() is called from the first tap and is a no-op after that.
 */
const tracks = {};
let currentTrack = null;

function ensureTrack(name, url, loop) {
  if (tracks[name]) return tracks[name];
  const el = new Audio(url);
  el.loop = loop;
  el.preload = 'auto';
  el.crossOrigin = 'anonymous';
  const c = getCtx();
  let node = null;
  if (c) {
    node = c.createMediaElementSource(el);
    const gain = c.createGain();
    gain.gain.value = 1;
    node.connect(gain);
    gain.connect(musicBus);
    tracks[name] = { el, gain };
  } else {
    // No Web Audio at all: fall back to the element's own volume, so the
    // music still plays rather than the whole feature disappearing.
    el.volume = SOUND.musicVolume * SOUND.masterVolume;
    tracks[name] = { el, gain: null };
  }
  return tracks[name];
}

/** Fade a track's gain over `seconds`, using the audio clock rather than
 * setTimeout — a JS timer fade stutters under load, and this one is
 * sample-accurate and costs nothing per frame. */
function fadeTrack(track, to, seconds) {
  const c = getCtx();
  if (!c || !track.gain) {
    if (track.el) track.el.volume = to * SOUND.musicVolume * SOUND.masterVolume;
    return;
  }
  const now = c.currentTime;
  track.gain.gain.cancelScheduledValues(now);
  track.gain.gain.setValueAtTime(Math.max(track.gain.gain.value, 0.0001), now);
  track.gain.gain.linearRampToValueAtTime(Math.max(to, 0.0001), now + seconds);
}

export const music = {
  /** Start (or resume) the gameplay loop. Safe to call on every tap. */
  playGameplay() {
    if (!SOUND.enabled) return;
    const t = ensureTrack('gameplay', SOUND.gameplayTrack, true);
    if (currentTrack === t && !t.el.paused) return;
    if (currentTrack && currentTrack !== t) fadeTrack(currentTrack, 0, 0.6);
    currentTrack = t;
    fadeTrack(t, 1, 1.2);
    // play() rejects when no gesture has happened yet; that is expected on
    // the first call and not an error worth surfacing.
    t.el.play().catch(() => {});
  },

  /** Swap to the victory fanfare: the loop ducks out, the fanfare comes in
   * over the top, and the fanfare does NOT loop. */
  playVictory() {
    if (!SOUND.enabled) return;
    const gameplay = tracks.gameplay;
    if (gameplay) fadeTrack(gameplay, 0, 0.35);
    const t = ensureTrack('victory', SOUND.victoryTrack, false);
    t.el.currentTime = 0;
    fadeTrack(t, 1, 0.15);
    t.el.play().catch(() => {});
  },

  /** Back to gameplay after a replay — stops the fanfare first so the two
   * never overlap on a fast restart. */
  restoreGameplay() {
    const v = tracks.victory;
    if (v) { v.el.pause(); v.el.currentTime = 0; }
    const g = tracks.gameplay;
    if (g) { fadeTrack(g, 1, 0.8); g.el.play().catch(() => {}); }
  },

  setMasterVolume(v) {
    SOUND.masterVolume = v;
    if (masterBus) masterBus.gain.value = v;
  },
  setMusicVolume(v) {
    SOUND.musicVolume = v;
    if (musicBus) musicBus.gain.value = v;
  },
  setSfxVolume(v) {
    SOUND.sfxVolume = v;
    if (sfxBus) sfxBus.gain.value = v;
  },
  muted: false,
  toggleMute() {
    this.muted = !this.muted;
    if (masterBus) masterBus.gain.value = this.muted ? 0 : SOUND.masterVolume;
    return this.muted;
  },
};
