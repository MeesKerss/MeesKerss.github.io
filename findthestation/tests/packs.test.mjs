import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildPacks } from '../tools/packs.mjs';

const s = (id, lon, lat, modes) => ({ id, name: id, lon, lat, modes });
const net = {
  stops: [
    s('a', 1, 1, ['tram']), s('b', 2, 1, ['tram', 'bus']), s('c', 8, 8, ['tram']),
    s('m', 1.5, 1.5, ['subway']), s('t', 2, 2, ['train']),
  ],
  lines: [
    { id: 'tram-1', ref: '1', mode: 'tram', stops: ['a', 'b'], edges: [['a', 'b']] },
    { id: 'tram-2', ref: '2', mode: 'tram', stops: ['b', 'c'], edges: [['b', 'c']] },
    { id: 'bus-9', ref: '9', mode: 'bus', stops: ['b'], edges: [] },
    { id: 'subway-50', ref: '50', mode: 'subway', stops: ['m'], edges: [] },
    { id: 'train-x', ref: 'x', mode: 'train', stops: ['t'], edges: [] },
  ],
};
const sq = (x0, y0, x1, y1) => [[[[x0, y0], [x1, y0], [x1, y1], [x0, y1], [x0, y0]]]];
const areas = { West: sq(0, 0, 5, 5), Oost: sq(10, 10, 20, 20) };
const cfg = { kind: 'city', unlockMin: 0.7 };

test('per-line tram packs, tram-all locked by 3-of rule', () => {
  const packs = buildPacks('amsterdam', net, areas, cfg);
  const all = packs.find((p) => p.id === 'amsterdam/tram-all');
  assert.deepEqual(all.unlock, { type: 'accuracy', min: 0.7, of: ['amsterdam/tram-1', 'amsterdam/tram-2'], count: 2 });
  assert.deepEqual(all.stops.sort(), ['a', 'b', 'c']);
  const t1 = packs.find((p) => p.id === 'amsterdam/tram-1');
  assert.deepEqual(t1.focusLines, ['tram-1']);
  assert.deepEqual(t1.unlock, { type: 'open' });
  assert.deepEqual(t1.lines.sort(), ['tram-1', 'tram-2']);
});

test('bus area pack contains only stops inside that area', () => {
  const packs = buildPacks('amsterdam', net, areas, cfg);
  assert.deepEqual(packs.find((p) => p.id === 'amsterdam/bus-area-west').stops, ['b']);
});

test('no empty packs are emitted', () => {
  const packs = buildPacks('amsterdam', net, areas, cfg);
  assert.equal(packs.find((p) => p.id === 'amsterdam/bus-area-oost'), undefined);
  assert.equal(packs.find((p) => p.id === 'amsterdam/ferry'), undefined);
});

test('everything pack requires metro, tram-all and train', () => {
  const packs = buildPacks('amsterdam', net, areas, cfg);
  const e = packs.find((p) => p.id === 'amsterdam/everything');
  assert.equal(e.stops.length, 5);
  assert.deepEqual(e.unlock, { type: 'accuracy', min: 0.7, of: ['amsterdam/metro', 'amsterdam/tram-all', 'amsterdam/train'], count: 3 });
});

test('rail kind: intercity, provinces, all', () => {
  const rail = { stops: [s('x', 1, 1, ['train']), s('y', 12, 12, ['train'])],
    lines: [{ id: 'train-ic', mode: 'train', stops: ['x', 'y'], edges: [['x', 'y']] }] };
  const packs = buildPacks('netherlands', rail, { 'Noord-Holland': sq(0, 0, 5, 5), Utrecht: sq(10, 10, 20, 20) },
    { kind: 'rail', unlockMin: 0.7, intercityStops: ['x'] });
  assert.deepEqual(packs.map((p) => p.id), ['netherlands/intercity', 'netherlands/province-noord-holland', 'netherlands/province-utrecht', 'netherlands/all']);
  assert.deepEqual(packs.at(-1).unlock, { type: 'accuracy', min: 0.7, of: ['netherlands/intercity'], count: 1 });
  assert.equal(packs[1].name, 'Noord-Holland');
});

test('line packs below minLineStops are skipped', () => {
  const packs = buildPacks('amsterdam', net, areas, { ...cfg, minLineStops: 3 });
  assert.equal(packs.find((p) => p.id === 'amsterdam/tram-1'), undefined);
  assert.ok(packs.find((p) => p.id === 'amsterdam/tram-all'));
});
