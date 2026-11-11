// Small synthesized sound set (Web Audio, no files). Quiet by design, same spirit as /shared/js/audio.js.
const KEY = 'fts:muted';
const PENTA = [523.25, 587.33, 659.25, 783.99, 880, 1046.5, 1174.66, 1318.51, 1567.98, 1760, 2093];

// Correct-answer pitch climbs one pentatonic step per streak, so a hot run sounds like it.
export function correctPitch(streak) {
  return PENTA[Math.max(0, Math.min(streak, PENTA.length - 1))];
}

const defaultStorage = () => {
  try { return globalThis.localStorage; } catch { return undefined; }
};
export function loadMuted(storage = defaultStorage()) {
  try { return storage?.getItem(KEY) === '1'; } catch { return false; }
}
export function saveMuted(muted, storage = defaultStorage()) {
  try { storage?.setItem(KEY, muted ? '1' : '0'); } catch { /* storage unavailable */ }
}

let ctx = null;
let muted = loadMuted();

export const isMuted = () => muted;
export function setMuted(m) {
  muted = m;
  saveMuted(m);
}

// Browsers only allow audio after a user gesture: call this from the first pointerdown.
export function unlockAudio() {
  try {
    if (!ctx) ctx = new (globalThis.AudioContext || globalThis.webkitAudioContext)();
    if (ctx.state === 'suspended') ctx.resume();
  } catch { ctx = null; }
}

const ready = () => ctx && !muted && ctx.state === 'running';

function tone(freq, { at = 0, dur = 0.15, type = 'sine', gain = 0.05, to = null } = {}) {
  const t = ctx.currentTime + at;
  const osc = ctx.createOscillator();
  const g = ctx.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, t);
  if (to) osc.frequency.exponentialRampToValueAtTime(to, t + dur);
  g.gain.setValueAtTime(0, t);
  g.gain.linearRampToValueAtTime(gain, t + 0.01);
  g.gain.exponentialRampToValueAtTime(0.0008, t + dur);
  osc.connect(g).connect(ctx.destination);
  osc.start(t);
  osc.stop(t + dur + 0.02);
}

export const sfx = {
  correct(streak = 0) {
    if (!ready()) return;
    const f = correctPitch(streak);
    tone(f, { dur: 0.12, gain: 0.045 });
    tone(f * 1.5, { at: 0.07, dur: 0.18, gain: 0.035 });
  },
  wrong() {
    if (!ready()) return;
    tone(190, { dur: 0.16, type: 'triangle', gain: 0.07, to: 120 });
  },
  reveal() {
    if (!ready()) return;
    [783.99, 659.25, 523.25].forEach((f, i) => tone(f, { at: i * 0.09, dur: 0.22, type: 'triangle', gain: 0.04 }));
  },
  milestone() {
    if (!ready()) return;
    [523.25, 659.25, 783.99, 1046.5].forEach((f, i) => tone(f, { at: i * 0.07, dur: 0.25, gain: 0.04 }));
  },
  finish(accuracy = 0) {
    if (!ready()) return;
    const notes = accuracy >= 0.7 ? [523.25, 659.25, 783.99, 1046.5, 1318.51] : [392, 523.25, 659.25];
    notes.forEach((f, i) => tone(f, { at: i * 0.1, dur: 0.35, gain: 0.04 }));
  },
  whoosh(dur = 1.2) {
    if (!ready()) return;
    const len = Math.floor(ctx.sampleRate * dur);
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
    const src = ctx.createBufferSource();
    src.buffer = buf;
    const filter = ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.Q.value = 0.8;
    const t = ctx.currentTime;
    filter.frequency.setValueAtTime(300, t);
    filter.frequency.exponentialRampToValueAtTime(1400, t + dur * 0.45);
    filter.frequency.exponentialRampToValueAtTime(250, t + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(0.035, t + dur * 0.4);
    g.gain.linearRampToValueAtTime(0, t + dur);
    src.connect(filter).connect(g).connect(ctx.destination);
    src.start(t);
  },
  tap() {
    if (!ready()) return;
    tone(900, { dur: 0.04, gain: 0.025, to: 650 });
  },
};
