import { test } from 'node:test';
import assert from 'node:assert/strict';
import { correctPitch, loadMuted, saveMuted } from '../js/sound.js';

test('correct chime climbs a pentatonic step per streak, capped', () => {
  assert.equal(correctPitch(0), 523.25);           // C5
  assert.equal(correctPitch(1), 587.33);           // D5
  assert.equal(correctPitch(5), 1046.5);           // C6, one octave up
  assert.equal(correctPitch(50), correctPitch(10)); // capped
  assert.ok(correctPitch(10) > correctPitch(9));
});

test('mute preference survives reloads and broken storage', () => {
  const m = new Map();
  const s = { getItem: (k) => m.get(k) ?? null, setItem: (k, v) => m.set(k, v) };
  assert.equal(loadMuted(s), false);
  saveMuted(true, s);
  assert.equal(loadMuted(s), true);
  const broken = { getItem() { throw new Error('x'); }, setItem() { throw new Error('x'); } };
  assert.equal(loadMuted(broken), false);
  assert.doesNotThrow(() => saveMuted(true, broken));
});
