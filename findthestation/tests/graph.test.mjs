import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildGraph, hopDistance } from '../js/graph.js';

test('hopDistance counts stops along edges', () => {
  const g = buildGraph([{ edges: [['a','b'],['b','c']] }, { edges: [['c','d']] }]);
  assert.equal(hopDistance(g, 'a', 'd'), 3);
  assert.equal(hopDistance(g, 'd', 'a'), 3);
  assert.equal(hopDistance(g, 'a', 'a'), 0);
  assert.equal(hopDistance(g, 'a', 'zz'), null);
});
