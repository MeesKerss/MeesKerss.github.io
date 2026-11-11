import { test } from 'node:test';
import assert from 'node:assert/strict';
import { haversineKm, pointInPolygon, pointInMultiPolygon, simplifyLine, roundCoord } from '../js/geo.js';

test('haversine Amsterdam CS -> Utrecht CS ≈ 34km', () => {
  const d = haversineKm([4.9003, 52.3789], [5.1100, 52.0894]);
  assert.ok(d > 33 && d < 36, String(d));
});
test('pointInPolygon square and hole', () => {
  const sq = [[[0,0],[10,0],[10,10],[0,10],[0,0]], [[4,4],[6,4],[6,6],[4,6],[4,4]]];
  assert.equal(pointInPolygon([1,1], sq), true);
  assert.equal(pointInPolygon([5,5], sq), false);
  assert.equal(pointInPolygon([11,5], sq), false);
});
test('pointInMultiPolygon checks every polygon', () => {
  const polys = [[[[0,0],[1,0],[1,1],[0,1],[0,0]]], [[[5,5],[6,5],[6,6],[5,6],[5,5]]]];
  assert.equal(pointInMultiPolygon([5.5,5.5], polys), true);
  assert.equal(pointInMultiPolygon([3,3], polys), false);
});
test('simplifyLine drops collinear points, keeps ends', () => {
  assert.deepEqual(simplifyLine([[0,0],[1,0.00001],[2,0]], 0.001), [[0,0],[2,0]]);
  assert.deepEqual(simplifyLine([[0,0],[1,1],[2,0]], 0.001), [[0,0],[1,1],[2,0]]);
});
test('roundCoord rounds to 5 decimals', () => {
  assert.deepEqual(roundCoord([4.123456789, 52.987654321]), [4.12346, 52.98765]);
});
