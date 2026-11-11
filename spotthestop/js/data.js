// Static data loading (memoized). Paths are relative to /spotthestop/.
import { buildGraph } from './graph.js';

const cache = new Map();
const getJSON = async (url) => {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${url}: ${res.status}`);
  return res.json();
};

export async function loadPlaces() {
  if (!cache.has('places')) cache.set('places', getJSON('data/places.json').then((d) => d.places));
  return cache.get('places');
}

export async function loadPlace(dataId) {
  if (!cache.has(dataId)) {
    cache.set(dataId, Promise.all([
      getJSON(`data/${dataId}/stops.json`),
      getJSON(`data/${dataId}/lines.json`),
      getJSON(`data/${dataId}/packs.json`),
    ]).then(([s, l, p]) => {
      const stopsById = Object.fromEntries(s.stops.map((x) => [x.id, x]));
      const linesById = Object.fromEntries(l.lines.map((x) => [x.id, x]));
      return { stops: s.stops, lines: l.lines, packs: p.packs, stopsById, linesById };
    }));
  }
  return cache.get(dataId);
}

// Hop graph restricted to the pack's own lines.
export function packGraph(placeData, pack) {
  return buildGraph(pack.lines.map((id) => placeData.linesById[id]).filter(Boolean));
}
