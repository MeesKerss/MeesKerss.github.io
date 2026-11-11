import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRun, currentTarget, guess, advance, summary } from '../js/engine.js';
import { buildGraph } from '../js/graph.js';

const st = (id, name, lon, lat) => ({ id, name: name ?? id.toUpperCase(), lon, lat });
const stops = [st('a', 'A', 4.90, 52.37), st('b', 'B', 4.91, 52.37), st('c', 'C', 4.92, 52.37), st('f', 'F', 4.95, 52.40)];
const stopsById = Object.fromEntries(stops.map((s) => [s.id, s]));
const graph = buildGraph([{ edges: [['a', 'b'], ['b', 'c']] }]);
const ctx = { stopsById, graph };
const seeded = (seed = 1) => () => ((seed = (seed * 16807) % 2147483647) / 2147483647);

test('3/2/1 points then reveal', () => {
  const run = createRun({ stops, order: ['c', 'a', 'b'] });
  assert.equal(currentTarget(run, stopsById).id, 'c');
  assert.deepEqual([guess(run, 'c', ctx).outcome, run.score], ['correct', 3]);
  advance(run);
  assert.equal(guess(run, 'b', ctx).outcome, 'wrong');
  const r = guess(run, 'a', ctx);
  assert.deepEqual([r.outcome, r.points, run.score], ['correct', 2, 5]);
  advance(run);
  guess(run, 'a', ctx); guess(run, 'c', ctx);
  const last = guess(run, 'f', ctx);
  assert.deepEqual([last.outcome, last.points, run.score], ['reveal', 0, 5]);
  assert.equal(advance(run), false);
});

test('hint uses hops when connected, km when not', () => {
  const run = createRun({ stops, order: ['c'] });
  assert.deepEqual(guess(run, 'a', ctx).hint, { kind: 'hops', value: 2 });
  const r = guess(run, 'f', ctx);
  assert.equal(r.hint.kind, 'km');
  assert.ok(r.hint.value > 2 && r.hint.value < 5, String(r.hint.value));
  assert.equal(Math.round(r.hint.value * 10), r.hint.value * 10);
  assert.equal(r.clickedName, 'F');
});

test('same-name stop counts as correct', () => {
  const twins = [st('k', 'Kerkstraat', 4.88, 52.36), st('k2', 'Kerkstraat', 4.88, 52.39)];
  const byId = Object.fromEntries(twins.map((s) => [s.id, s]));
  const run = createRun({ stops: twins, order: ['k', 'k2'] });
  assert.equal(guess(run, 'k2', { stopsById: byId, graph }).outcome, 'correct');
});

test('every stop asked exactly once', () => {
  const run = createRun({ stops, rng: seeded(7) });
  const asked = [];
  do { asked.push(currentTarget(run, stopsById).id); } while (advance(run));
  assert.deepEqual(asked.slice().sort(), ['a', 'b', 'c', 'f']);
  assert.equal(currentTarget(run, stopsById), null);
});

test('summary accuracy counts first-try only, streak tracks first-try hits', () => {
  const run = createRun({ stops: stops.slice(0, 3), order: ['a', 'b', 'c'] });
  guess(run, 'a', ctx); advance(run);
  assert.equal(run.streak, 1);
  guess(run, 'a', ctx); guess(run, 'b', ctx); advance(run);
  assert.equal(run.streak, 0);
  guess(run, 'a', ctx); guess(run, 'a', ctx); guess(run, 'a', ctx); advance(run);
  const s = summary(run);
  assert.deepEqual(s, { score: 5, maxScore: 9, accuracy: 1 / 3, bestStreak: 1, missed: ['c'] });
});

test('guess after reveal or finish is ignored', () => {
  const run = createRun({ stops: [stops[0]], order: ['a'] });
  guess(run, 'b', ctx); guess(run, 'b', ctx); guess(run, 'b', ctx);
  assert.equal(guess(run, 'a', ctx), null);
  assert.equal(run.score, 0);
});
