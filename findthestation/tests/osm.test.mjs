import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildNetwork, cleanName, slugify } from '../tools/osm.mjs';

const node = (id, name, lat, lon) => ({ type: 'node', id, lat, lon, tags: { name } });
const stopM = (ref, lat, lon, role = 'stop') => ({ type: 'node', ref, role, lat, lon });
const wayM = (ref, pts) => ({ type: 'way', ref, role: '', geometry: pts.map(([lon, lat]) => ({ lat, lon })) });

// Metro 52, both directions. Southbound uses stop nodes ~120m from the northbound ones.
const fixture = [
  node(1, 'Noord', 52.4011, 4.9310), node(2, 'Noorderpark', 52.3900, 4.9200), node(3, 'Centraal Station', 52.3780, 4.9000),
  node(11, 'Noord', 52.4000, 4.9310), node(12, 'Noorderpark', 52.3889, 4.9200), node(13, 'Centraal Station', 52.3769, 4.9000),
  { type: 'relation', id: 100, tags: { route: 'subway', ref: '52', colour: '#00ADEF' }, members: [
    stopM(1, 52.4011, 4.9310), stopM(2, 52.3900, 4.9200), stopM(3, 52.3780, 4.9000),
    wayM(50, [[4.9310, 52.4011], [4.9255, 52.39555], [4.9200, 52.3900], [4.9000, 52.3780]]) ] },
  { type: 'relation', id: 101, tags: { route: 'subway', ref: '52', colour: '#00ADEF' }, members: [
    stopM(13, 52.3769, 4.9000), stopM(12, 52.3889, 4.9200), stopM(11, 52.4000, 4.9310),
    wayM(51, [[4.9000, 52.3769], [4.9310, 52.4000]]) ] },
];
const opts = { modes: ['subway', 'tram', 'bus', 'ferry', 'train'], stripPrefixes: ['Amsterdam'], aliases: {}, mergeMeters: 300, tolerance: 0.00005 };

test('merges both directions into one line and one stop per name', () => {
  const { stops, lines } = buildNetwork(fixture, opts);
  assert.equal(lines.length, 1);
  assert.equal(lines[0].id, 'subway-52');
  assert.equal(lines[0].colour, '#00ADEF');
  assert.deepEqual(stops.map((s) => s.id).sort(), ['centraal-station', 'noord', 'noorderpark']);
  assert.equal(lines[0].edges.length, 2);
  assert.deepEqual(stops.find((s) => s.id === 'noord').modes, ['subway']);
  assert.equal(lines[0].coords.length, 2);
});

test('same name far apart stays separate', () => {
  const els = [
    node(1, 'Kerkstraat', 52.36, 4.88), node(2, 'Kerkstraat', 52.39, 4.88), node(3, 'Dam', 52.373, 4.893),
    { type: 'relation', id: 9, tags: { route: 'bus', ref: '1' }, members: [stopM(1, 52.36, 4.88), stopM(3, 52.373, 4.893)] },
    { type: 'relation', id: 10, tags: { route: 'bus', ref: '2' }, members: [stopM(2, 52.39, 4.88), stopM(3, 52.373, 4.893)] },
  ];
  const { stops } = buildNetwork(els, opts);
  assert.deepEqual(stops.map((s) => s.id).sort(), ['dam', 'kerkstraat', 'kerkstraat-2']);
});

test('ignores modes not requested and maps light_rail to tram', () => {
  const els = [node(1, 'A', 52.3, 4.9), node(2, 'B', 52.31, 4.9),
    { type: 'relation', id: 1, tags: { route: 'light_rail', ref: '25' }, members: [stopM(1, 52.3, 4.9), stopM(2, 52.31, 4.9)] },
    { type: 'relation', id: 2, tags: { route: 'train', ref: 'x' }, members: [stopM(1, 52.3, 4.9), stopM(2, 52.31, 4.9)] }];
  const { lines } = buildNetwork(els, { ...opts, modes: ['tram'] });
  assert.deepEqual(lines.map((l) => l.id), ['tram-25']);
});

test('uses platforms when a relation has no stop members', () => {
  const els = [node(1, 'A', 52.3, 4.9), node(2, 'B', 52.31, 4.9),
    { type: 'relation', id: 1, tags: { route: 'tram', ref: '5' }, members: [stopM(1, 52.3, 4.9, 'platform'), stopM(2, 52.31, 4.9, 'platform_exit_only')] }];
  const { stops, lines } = buildNetwork(els, opts);
  assert.equal(stops.length, 2);
  assert.deepEqual(lines[0].edges, [['a', 'b']]);
});

test('cleanName strips prefix and applies alias', () => {
  assert.equal(cleanName('Amsterdam, Dam', ['Amsterdam'], {}), 'Dam');
  assert.equal(cleanName('Amsterdam Amstel', ['Amsterdam'], {}), 'Amstel');
  assert.equal(cleanName('Amsterdamsestraatweg', ['Amsterdam'], {}), 'Amsterdamsestraatweg');
  assert.equal(cleanName('Amsterdam Centraal', [], { 'Amsterdam Centraal': 'Centraal Station' }), 'Centraal Station');
});

test('slugify removes accents and punctuation', () => {
  assert.equal(slugify("Kon. Wilhelminaplein / Café 't Hoekje"), 'kon-wilhelminaplein-cafe-t-hoekje');
});

import { relationPolygons } from '../tools/osm.mjs';
const w = (role, pts) => ({ type: 'way', role, geometry: pts.map(([lon, lat]) => ({ lon, lat })) });
test('relationPolygons stitches split outer ways and attaches holes', () => {
  const rel = { type: 'relation', members: [
    w('outer', [[0, 0], [10, 0], [10, 10]]),
    w('outer', [[0, 0], [0, 10], [10, 10]]), // reversed direction piece
    w('inner', [[4, 4], [6, 4], [6, 6], [4, 6], [4, 4]]),
    w('outer', [[20, 20], [21, 20], [21, 21], [20, 20]]),
  ] };
  const polys = relationPolygons(rel);
  assert.equal(polys.length, 2);
  const big = polys.find((p) => p[0].some(([x]) => x === 10));
  assert.equal(big.length, 2);
  assert.equal(big[0].length, 5);
  assert.deepEqual(big[0][0], big[0].at(-1));
});

test('cleanName stationWords strips "Station X" and glued "Xstation"', () => {
  const o = { stationWords: true };
  assert.equal(cleanName('Station Gein', [], {}, o), 'Gein');
  assert.equal(cleanName('Amstelstation', [], {}, o), 'Amstel');
  assert.equal(cleanName('Station Zuid WTC-zijde', [], { 'Zuid WTC-zijde': 'Zuid' }, o), 'Zuid');
  assert.equal(cleanName('Centraal Station', [], {}, o), 'Centraal Station');
  assert.equal(cleanName('Station', [], {}, o), 'Station');
  assert.equal(cleanName('Station Gein', [], {}), 'Station Gein');
});

import { chainLines } from '../tools/osm.mjs';
test('chainLines joins touching pieces in any direction', () => {
  const chains = chainLines([[[0, 0], [1, 0]], [[2, 0], [1, 0]], [[2, 0], [3, 0]], [[9, 9], [10, 10]]]);
  assert.equal(chains.length, 2);
  const long = chains.find((c) => c.length === 4);
  assert.ok(long);
  const xs = long.map((p) => p[0]);
  assert.ok(JSON.stringify(xs) === '[0,1,2,3]' || JSON.stringify(xs) === '[3,2,1,0]');
});
test('buildNetwork emits one chained polyline for contiguous ways', () => {
  const els = [node(1, 'A', 52.3, 4.9), node(2, 'B', 52.31, 4.9),
    { type: 'relation', id: 1, tags: { route: 'tram', ref: '5' }, members: [stopM(1, 52.3, 4.9), stopM(2, 52.31, 4.9),
      wayM(1, [[4.9, 52.3], [4.9, 52.305]]), wayM(2, [[4.9, 52.305], [4.9, 52.31]])] }];
  const { lines } = buildNetwork(els, opts);
  assert.equal(lines[0].coords.length, 1);
  assert.deepEqual(lines[0].coords[0], [[4.9, 52.3], [4.9, 52.31]]);
});
