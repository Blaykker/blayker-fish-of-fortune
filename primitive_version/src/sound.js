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
function getCtx() {
  if (!SOUND.enabled) return null;
  if (!ctx) {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    ctx = new AC();
  }
  // Browsers suspend the context until a user gesture — resume opportunistically.
  if (ctx.state === 'suspended') ctx.resume();
  return ctx;
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
  const vol = gain * SOUND.masterVolume;
  amp.gain.setValueAtTime(0.0001, t0);
  amp.gain.exponentialRampToValueAtTime(Math.max(vol, 0.0001), t0 + 0.008);
  amp.gain.exponentialRampToValueAtTime(0.0001, t0 + duration);

  osc.connect(amp);
  amp.connect(c.destination);
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
  const vol = gain * SOUND.masterVolume;
  amp.gain.setValueAtTime(vol, t0);
  amp.gain.exponentialRampToValueAtTime(0.0001, t0 + duration);

  src.connect(filter);
  filter.connect(amp);
  amp.connect(c.destination);
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
  /** A pig firing a shot. */
  shoot() {
    tone({ freq: 950, endFreq: 500, duration: 0.05, type: 'sawtooth', gain: 0.14 });
  },
  /** A shot landing on a pillar. */
  hit() {
    noiseBurst({ duration: 0.06, filterFreq: 2500, gain: 0.22 });
  },
  /** A pillar being destroyed (collapse animation kicking off). */
  pillarDestroy() {
    tone({ freq: 260, endFreq: 60, duration: 0.22, type: 'triangle', gain: 0.25 });
    noiseBurst({ duration: 0.12, filterFreq: 800, gain: 0.18, delay: 0.02 });
  },
  /** A pig disappearing after running out of ammo. */
  pigDespawn() {
    tone({ freq: 500, endFreq: 900, duration: 0.12, type: 'sine', gain: 0.16 });
  },
  /** A pig reaching the end of the belt and dropping into the hole. */
  pigFall() {
    tone({ freq: 400, endFreq: 60, duration: 0.3, type: 'sine', gain: 0.2 });
  },
};
