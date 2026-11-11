// Pure transform: Overpass elements (route relations from `out geom` + member node/way tags) -> { stops, lines }.
import { haversineKm, simplifyLine, roundCoord } from '../js/geo.js';

const MODE_MAP = { subway: 'subway', tram: 'tram', light_rail: 'tram', bus: 'bus', ferry: 'ferry', train: 'train' };
const STOP_ROLE = /^stop(_entry_only|_exit_only)?$/;
const PLATFORM_ROLE = /^platform(_entry_only|_exit_only)?$/;

export function slugify(s) {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
}

export function cleanName(raw, stripPrefixes = [], aliases = {}) {
  let name = String(raw).trim().replace(/\s+/g, ' ');
  for (const p of stripPrefixes) {
    for (const sep of [', ', ' ']) {
      if (name.startsWith(p + sep) && name.length > p.length + sep.length) {
        name = name.slice(p.length + sep.length).trim();
        break;
      }
    }
  }
  return aliases[name] ?? name;
}

function memberPoint(m) {
  if (m.type === 'node' && m.lat != null) return [m.lon, m.lat];
  if (m.geometry && m.geometry.length) {
    const pts = m.geometry.filter(Boolean);
    const lon = pts.reduce((s, p) => s + p.lon, 0) / pts.length;
    const lat = pts.reduce((s, p) => s + p.lat, 0) / pts.length;
    return [lon, lat];
  }
  return null;
}

export function buildNetwork(elements, opts) {
  const { modes, stripPrefixes = [], aliases = {}, mergeMeters = 300, tolerance = 0.00005 } = opts;
  const tags = new Map();
  for (const el of elements) if (el.type !== 'relation' && el.tags) tags.set(`${el.type}/${el.id}`, el.tags);

  const clusters = []; // { name, first:[lon,lat], sumLon, sumLat, n, modes:Set }
  const byName = new Map();
  const clusterFor = (name, pt, mode) => {
    const list = byName.get(name) || [];
    let c = list.find((k) => haversineKm(k.first, pt) * 1000 <= mergeMeters);
    if (!c) {
      c = { name, first: pt, sumLon: 0, sumLat: 0, n: 0, modes: new Set() };
      list.push(c);
      byName.set(name, list);
      clusters.push(c);
    }
    c.sumLon += pt[0]; c.sumLat += pt[1]; c.n++; c.modes.add(mode);
    return c;
  };

  const lineMap = new Map();
  for (const rel of elements) {
    if (rel.type !== 'relation' || !rel.tags) continue;
    const mode = MODE_MAP[rel.tags.route];
    if (!mode || !modes.includes(mode)) continue;
    const members = rel.members || [];
    let stopMembers = members.filter((m) => STOP_ROLE.test(m.role || ''));
    if (!stopMembers.some((m) => tags.get(`${m.type}/${m.ref}`)?.name)) {
      stopMembers = members.filter((m) => PLATFORM_ROLE.test(m.role || ''));
    }
    const seq = [];
    for (const m of stopMembers) {
      const raw = tags.get(`${m.type}/${m.ref}`)?.name;
      const pt = memberPoint(m);
      if (!raw || !pt) continue;
      const c = clusterFor(cleanName(raw, stripPrefixes, aliases), pt, mode);
      if (seq[seq.length - 1] !== c) seq.push(c);
    }
    const ref = rel.tags.ref || rel.tags.name || String(rel.id);
    const id = `${mode}-${slugify(ref)}`;
    if (!lineMap.has(id)) {
      lineMap.set(id, { id, ref, mode, colour: rel.tags.colour || '#111', name: rel.tags.name || ref, ways: new Map(), stops: new Set(), pairs: [] });
    }
    const line = lineMap.get(id);
    if (!line.colour || line.colour === '#111') line.colour = rel.tags.colour || line.colour;
    for (const m of members) {
      if (m.type === 'way' && m.geometry && !line.ways.has(m.ref)) {
        const pts = m.geometry.filter(Boolean).map((p) => [p.lon, p.lat]);
        if (pts.length >= 2) line.ways.set(m.ref, simplifyLine(pts, tolerance).map((c) => roundCoord(c)));
      }
    }
    seq.forEach((c, i) => {
      line.stops.add(c);
      if (i > 0) line.pairs.push([seq[i - 1], c]);
    });
  }

  // Assign ids in creation order.
  const used = new Map();
  for (const c of clusters) {
    const base = slugify(c.name) || 'stop';
    const n = (used.get(base) || 0) + 1;
    used.set(base, n);
    c.id = n === 1 ? base : `${base}-${n}`;
  }

  const stops = clusters.map((c) => ({
    id: c.id, name: c.name,
    lat: Math.round((c.sumLat / c.n) * 1e5) / 1e5,
    lon: Math.round((c.sumLon / c.n) * 1e5) / 1e5,
    modes: [...c.modes],
  }));

  const lines = [...lineMap.values()].map((l) => {
    const seen = new Set();
    const edges = [];
    for (const [a, b] of l.pairs) {
      if (a === b) continue;
      const [x, y] = [a.id, b.id].sort();
      const k = `${x}|${y}`;
      if (seen.has(k)) continue;
      seen.add(k);
      edges.push([a.id, b.id]);
    }
    return { id: l.id, ref: l.ref, mode: l.mode, colour: l.colour, name: l.name, coords: [...l.ways.values()], stops: [...l.stops].map((c) => c.id), edges };
  });

  return { stops, lines };
}
