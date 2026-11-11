import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spinSpeed } from '../js/spin.js';

test('globe spins at full speed when zoomed out', () => {
  assert.equal(spinSpeed(1.2), 0.6);
  assert.equal(spinSpeed(2.4), 0.6);
});
test('spin fades out as you zoom in and stops past zoom 3.5', () => {
  const mid = spinSpeed(3);
  assert.ok(mid > 0 && mid < 0.6, String(mid));
  assert.equal(spinSpeed(3.5), 0);
  assert.equal(spinSpeed(6), 0);
});
