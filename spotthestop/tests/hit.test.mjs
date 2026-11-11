import { test } from 'node:test';
import assert from 'node:assert/strict';
import { nearestStop } from '../js/hit.js';

test('nearestStop picks the closest centre among stacked dots', () => {
  const pts = [{ id: 'tram', x: 100, y: 100 }, { id: 'metro', x: 104, y: 100 }, { id: 'train', x: 110, y: 100 }];
  assert.equal(nearestStop(pts, { x: 105, y: 101 }, 22), 'metro');
  assert.equal(nearestStop(pts, { x: 200, y: 200 }, 22), null);
  assert.equal(nearestStop([], { x: 0, y: 0 }, 22), null);
  assert.equal(nearestStop(pts, { x: 122, y: 100 }, 12), 'train');
});
