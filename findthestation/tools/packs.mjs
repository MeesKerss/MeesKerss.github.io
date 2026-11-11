// Pure: network + area polygons -> pack definitions (spec §4).
import { pointInMultiPolygon } from '../js/geo.js';
import { slugify } from './osm.mjs';

const naturalRef = (a, b) => String(a.ref).localeCompare(String(b.ref), 'en', { numeric: true });

export function buildPacks(placeId, network, areas, config) {
  const min = config.unlockMin ?? 0.7;
  const { stops, lines } = network;
  const stopById = new Map(stops.map((s) => [s.id, s]));
  const pid = (slug) => `${placeId}/${slug}`;
  const open = { type: 'open' };
  const accuracy = (of, count) => ({ type: 'accuracy', min, of, count: Math.min(count, of.length) });

  const linesFor = (stopIds, modes) => {
    const set = new Set(stopIds);
    return lines.filter((l) => modes.includes(l.mode) && l.stops.some((id) => set.has(id))).map((l) => l.id);
  };
  const stopsOfMode = (mode) => stops.filter((s) => s.modes.includes(mode)).map((s) => s.id);
  const inArea = (ids, polys) => ids.filter((id) => {
    const s = stopById.get(id);
    return pointInMultiPolygon([s.lon, s.lat], polys);
  });

  const packs = [];
  const add = (p) => {
    if (p.stops.length === 0) return null;
    packs.push(p);
    return p;
  };
  const mk = (slug, name, mode, group, stopIds, unlock, extra = {}) =>
    add({ id: pid(slug), name, mode, group, stops: stopIds, lines: linesFor(stopIds, mode === 'all' ? ['subway', 'tram', 'bus', 'ferry', 'train'] : [mode]), unlock, ...extra });

  if (config.kind === 'rail') {
    const all = stopsOfMode('train');
    const ic = mk('intercity', 'Intercity stations', 'train', 'Intercity', all.filter((id) => (config.intercityStops || []).includes(id)), open);
    for (const name of Object.keys(areas).sort()) {
      mk(`province-${slugify(name)}`, name, 'train', 'Provinces', inArea(all, areas[name]), open);
    }
    mk('all', 'All stations', 'train', 'All', all, ic ? accuracy([ic.id], 1) : open);
    return packs;
  }

  // City
  const minLine = config.minLineStops ?? 1;
  const metro = mk('metro', 'All metro stations', 'subway', 'Metro', stopsOfMode('subway'), open);

  const tramLines = lines.filter((l) => l.mode === 'tram').sort(naturalRef);
  const tramPacks = tramLines.filter((l) => l.stops.length >= minLine).map((l) => mk(`tram-${slugify(l.ref)}`, `Tram ${l.ref}`, 'tram', 'Tram', l.stops.slice(), open, { focusLines: [l.id], kind: 'line' })).filter(Boolean);
  const tramAll = mk('tram-all', 'All tram stops', 'tram', 'Tram', stopsOfMode('tram'), accuracy(tramPacks.map((p) => p.id), 3));

  const busAll = stopsOfMode('bus');
  const busLines = lines.filter((l) => l.mode === 'bus').sort(naturalRef);
  busLines.filter((l) => l.stops.length >= minLine).forEach((l) => mk(`bus-${slugify(l.ref)}`, `Bus ${l.ref}`, 'bus', 'Bus', l.stops.slice(), open, { focusLines: [l.id], kind: 'line' }));
  const areaPacks = Object.keys(areas).sort()
    .map((name) => mk(`bus-area-${slugify(name)}`, `Bus · ${name}`, 'bus', 'Bus', inArea(busAll, areas[name]), open, { kind: 'area' }))
    .filter(Boolean);
  mk('bus-all', 'All bus stops', 'bus', 'Bus', busAll, accuracy(areaPacks.map((p) => p.id), 3));

  mk('ferry', 'All ferry stops', 'ferry', 'Ferry', stopsOfMode('ferry'), open);
  const train = mk('train', 'Train stations', 'train', 'Train', stopsOfMode('train'), open);

  const req = [metro, tramAll, train].filter(Boolean).map((p) => p.id);
  mk('everything', 'Everything', 'all', 'Everything', stops.map((s) => s.id), accuracy(req, req.length));
  return packs;
}
