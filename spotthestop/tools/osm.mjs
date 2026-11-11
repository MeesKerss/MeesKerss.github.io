// Pure transform: Overpass elements (route relations from `out geom` + member node/way tags) -> { stops, lines }.
import { haversineKm, simplifyLine, roundCoord, pointInPolygon } from '../js/geo.js';

const MODE_MAP = { subway: 'subway', tram: 'tram', light_rail: 'tram', bus: 'bus', ferry: 'ferry', train: 'train' };
const STOP_ROLE = /^stop(_entry_only|_exit_only)?$/;
const PLATFORM_ROLE = /^platform(_entry_only|_exit_only)?$/;

export function slugify(s) {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
}

export function cleanName(raw, stripPrefixes = [], aliases = {}, { stationWords = false, stripSuffixes = [] } = {}) {
  let name = String(raw).trim().replace(/\s+/g, ' ')
    .replace(/\s*[–—]\s*/g, ' - ') // en/em dash -> " - "
    .replace(/[‘’]/g, "'");
  for (const p of stripPrefixes) {
    for (const sep of [', ', ' ']) {
      if (name.startsWith(p + sep) && name.length > p.length + sep.length) {
        name = name.slice(p.length + sep.length).trim();
        break;
      }
    }
  }
  for (const suf of stripSuffixes) {
    if (name.endsWith(' ' + suf) && name.length > suf.length + 1) { name = name.slice(0, -suf.length - 1).trim(); break; }
  }
  if (stationWords) {
    const m = name.match(/^Station (.+)$/) || name.match(/^([A-Z][a-z]{2,})station$/);
    if (m) name = m[1];
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
  const { modes, stripPrefixes = [], aliases = {}, mergeMeters = 300, tolerance = 0.00005, stationWords = false, stripSuffixes = [], nameTags = ['name'] } = opts;
  const tags = new Map();
  const nameOf = (m) => { const t = tags.get(`${m.type}/${m.ref}`); return t && nameTags.map((k) => t[k]).find(Boolean); };
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
    if (!stopMembers.some((m) => nameOf(m))) {
      stopMembers = members.filter((m) => PLATFORM_ROLE.test(m.role || ''));
    }
    const seq = [];
    for (const m of stopMembers) {
      const raw = nameOf(m);
      const pt = memberPoint(m);
      if (!raw || !pt) continue;
      const c = clusterFor(cleanName(raw, stripPrefixes, aliases, { stationWords, stripSuffixes }), pt, mode);
      if (seq[seq.length - 1] !== c) seq.push(c);
    }
    // No ref: key by the route name without its direction part ("Bakerloo line: A → B" -> "Bakerloo line").
    const ref = rel.tags.ref || (rel.tags.name ? rel.tags.name.split(':')[0].trim() : String(rel.id));
    const id = `${mode}-${slugify(ref)}`;
    if (!lineMap.has(id)) {
      lineMap.set(id, { id, ref, mode, colour: rel.tags.colour || '#111', name: rel.tags.name || ref, ways: new Map(), stops: new Set(), pairs: [] });
    }
    const line = lineMap.get(id);
    if (!line.colour || line.colour === '#111') line.colour = rel.tags.colour || line.colour;
    for (const m of members) {
      if (m.type === 'way' && m.geometry && !line.ways.has(m.ref)) {
        const pts = m.geometry.filter(Boolean).map((p) => [p.lon, p.lat]);
        if (pts.length >= 2) line.ways.set(m.ref, pts);
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
    return { id: l.id, ref: l.ref, mode: l.mode, colour: l.colour, name: l.name, coords: chainLines([...l.ways.values()]).map((c) => simplifyLine(c, tolerance).map((p) => roundCoord(p))), stops: [...l.stops].map((c) => c.id), edges };
  });

  return { stops, lines };
}

// Boundary relation (from `out geom`) -> MultiPolygon coordinates [[outer, ...holes], ...].
const same = (a, b) => a[0] === b[0] && a[1] === b[1];
function stitch(parts) {
  const rings = [];
  const pool = parts.map((p) => p.slice());
  while (pool.length) {
    let ring = pool.shift();
    let grew = true;
    while (!same(ring[0], ring.at(-1)) && grew) {
      grew = false;
      for (let i = 0; i < pool.length; i++) {
        const p = pool[i];
        const end = ring.at(-1);
        if (same(p[0], end)) ring = ring.concat(p.slice(1));
        else if (same(p.at(-1), end)) ring = ring.concat(p.slice(0, -1).reverse());
        else if (same(p.at(-1), ring[0])) ring = p.concat(ring.slice(1));
        else if (same(p[0], ring[0])) ring = p.slice().reverse().concat(ring.slice(1));
        else continue;
        pool.splice(i, 1);
        grew = true;
        break;
      }
    }
    if (ring.length >= 4 && same(ring[0], ring.at(-1))) rings.push(ring);
  }
  return rings;
}

export function relationPolygons(rel) {
  const get = (role) => (rel.members || [])
    .filter((m) => m.type === 'way' && m.role === role && m.geometry)
    .map((m) => m.geometry.filter(Boolean).map((p) => [p.lon, p.lat]))
    .filter((pts) => pts.length >= 2);
  const outers = stitch(get('outer'));
  const inners = stitch(get('inner'));
  const polys = outers.map((o) => [o]);
  for (const inner of inners) {
    const host = polys.find((p) => pointInPolygon(inner[0], [p[0]]));
    if (host) host.push(inner);
  }
  return polys;
}

// Join polyline pieces that share endpoints into longer chains (direction-agnostic).
export function chainLines(parts) {
  const key = (p) => `${p[0]},${p[1]}`;
  const used = new Uint8Array(parts.length);
  const index = new Map();
  parts.forEach((p, i) => {
    for (const k of [key(p[0]), key(p.at(-1))]) {
      if (!index.has(k)) index.set(k, []);
      index.get(k).push(i);
    }
  });
  const take = (pt) => {
    for (const i of index.get(key(pt)) || []) if (!used[i]) { used[i] = 1; return parts[i]; }
    return null;
  };
  const chains = [];
  for (let i = 0; i < parts.length; i++) {
    if (used[i]) continue;
    used[i] = 1;
    let chain = parts[i].slice();
    for (let p; (p = take(chain.at(-1))); ) chain = chain.concat(same(p[0], chain.at(-1)) ? p.slice(1) : p.slice(0, -1).reverse());
    for (let p; (p = take(chain[0])); ) chain = (same(p.at(-1), chain[0]) ? p.slice(0, -1) : p.slice(1).reverse()).concat(chain);
    chains.push(chain);
  }
  return chains;
}

// Stations sharing a name (NYC has seven "86th Street"s) get their lines appended, MTA-style: "86th Street (4/5/6)".
export function disambiguateNames(net) {
  const count = new Map();
  for (const s of net.stops) count.set(s.name, (count.get(s.name) || 0) + 1);
  const refs = new Map();
  for (const l of net.lines) {
    const r = String(l.ref).replace(/[<>]/g, '');
    for (const id of l.stops) (refs.get(id) || refs.set(id, new Set()).get(id)).add(r);
  }
  const order = (a, b) => a.localeCompare(b, 'en', { numeric: true });
  for (const s of net.stops) {
    if (count.get(s.name) > 1 && refs.get(s.id)?.size) s.name = `${s.name} (${[...refs.get(s.id)].sort(order).join('/')})`;
  }
  return net;
}
