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

// ── Metro-only capitals and cities without districts ──
const metroNet = (nStations, refs) => {
  const stops = Array.from({ length: nStations }, (_, i) => ({ id: `s${i}`, name: `S${i}`, lon: i * 0.01, lat: 0, modes: ['subway'] }));
  const per = Math.ceil(nStations / refs.length);
  const lines = refs.map((ref, k) => ({ id: `subway-${ref.toLowerCase().replace(/\s+/g, '-')}`, ref, mode: 'subway',
    stops: stops.slice(k * per, (k + 1) * per).map((s) => s.id), edges: [] }));
  return { stops, lines };
};

test('big metro gets line packs and a locked all-stations pack', () => {
  const packs = buildPacks('paris', metroNet(150, ['1', '2', '3bis', '4', '5']), {}, { kind: 'city', unlockMin: 0.7, minLineStops: 5 });
  const lineIds = packs.filter((p) => p.kind === 'line').map((p) => p.id);
  assert.deepEqual(lineIds, ['paris/metro-1', 'paris/metro-2', 'paris/metro-3bis', 'paris/metro-4', 'paris/metro-5']);
  assert.equal(packs.find((p) => p.id === 'paris/metro-3bis').name, 'Line 3bis');
  assert.deepEqual(packs.find((p) => p.id === 'paris/metro').unlock, { type: 'accuracy', min: 0.7, of: lineIds, count: 3 });
});

test('line names that are already words are kept', () => {
  const packs = buildPacks('london', metroNet(120, ['Bakerloo line', 'Victoria line', 'U1']), {}, { kind: 'city', unlockMin: 0.7 });
  assert.deepEqual(packs.filter((p) => p.kind === 'line').map((p) => p.name), ['Bakerloo line', 'U1', 'Victoria line']);
});

test('small metro has no line packs and stays open', () => {
  const packs = buildPacks('lisbon', metroNet(40, ['Azul', 'Verde']), {}, { kind: 'city', unlockMin: 0.7 });
  assert.deepEqual(packs.map((p) => p.id), ['lisbon/metro']);
  assert.deepEqual(packs[0].unlock, { type: 'open' });
});

test('metro-only city gets no Everything pack', () => {
  const packs = buildPacks('vienna', metroNet(100, ['U1', 'U2', 'U3']), {}, { kind: 'city', unlockMin: 0.7 });
  assert.equal(packs.find((p) => p.id.endsWith('/everything')), undefined);
});

test('bus-all without districts unlocks via bus lines', () => {
  const n = { stops: [s('a', 1, 1, ['bus']), s('b', 2, 1, ['bus']), s('c', 3, 1, ['bus'])],
    lines: [{ id: 'bus-1', ref: '1', mode: 'bus', stops: ['a', 'b'], edges: [] }, { id: 'bus-2', ref: '2', mode: 'bus', stops: ['b', 'c'], edges: [] }] };
  const packs = buildPacks('rotterdam', n, {}, { kind: 'city', unlockMin: 0.7 });
  assert.deepEqual(packs.find((p) => p.id === 'rotterdam/bus-all').unlock, { type: 'accuracy', min: 0.7, of: ['rotterdam/bus-1', 'rotterdam/bus-2'], count: 2 });
});

test('single-letter refs read "Line A"; config lineNames override', () => {
  const packs = buildPacks('tokyo', metroNet(120, ['A', 'G', 'M']), {}, { kind: 'city', unlockMin: 0.7, lineNames: { G: 'Ginza Line' } });
  assert.deepEqual(packs.filter((p) => p.kind === 'line').map((p) => p.name), ['Line A', 'Ginza Line', 'Line M']);
});
