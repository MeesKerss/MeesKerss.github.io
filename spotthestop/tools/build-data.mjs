// CLI: node spotthestop/tools/build-data.mjs <place> [--fresh]
// Pulls OSM data via Overpass, writes spotthestop/data/<place>/{stops,lines,packs}.json and upserts data/places.json.
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { overpass } from './overpass.mjs';
import { buildNetwork, relationPolygons, disambiguateNames } from './osm.mjs';
import { buildPacks } from './packs.mjs';
import { pointInMultiPolygon } from '../js/geo.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const DATA = join(HERE, '..', 'data');
const placeId = process.argv[2];
const fresh = process.argv.includes('--fresh');
if (!placeId) { console.error('usage: build-data.mjs <place> [--fresh]'); process.exit(1); }
const cfg = JSON.parse(await readFile(join(HERE, 'configs', `${placeId}.json`), 'utf8'));
const MODES = ['subway', 'tram', 'bus', 'ferry', 'train'];
// Menu order on the globe.
const ORDER = ['amsterdam', 'rotterdam', 'netherlands', 'berlin', 'hamburg', 'munich', 'frankfurt', 'nuremberg', 'paris', 'london', 'madrid', 'vienna', 'brussels', 'prague', 'stockholm', 'lisbon', 'budapest', 'new-york', 'tokyo'];
const isTourist = (t) => t.historic || t['railway:preserved'] || t.tourism || /^(tourist|tourism|heritage)$/.test(t.service || '');

async function fetchGeoJSON(url, cacheKey) {
  const file = join(HERE, '.cache', `${cacheKey}.geojson`);
  try { if (!fresh) return JSON.parse(await readFile(file, 'utf8')).features; } catch { /* miss */ }
  const res = await fetch(url, { headers: { 'User-Agent': 'spotthestop-data-builder' } });
  if (!res.ok) throw new Error(`${url} -> ${res.status}`);
  const text = await res.text();
  await mkdir(join(HERE, '.cache'), { recursive: true });
  await writeFile(file, text);
  return JSON.parse(text).features;
}

function ringCentroid(ring) {
  const n = ring.length - 1 || 1;
  return [ring.slice(0, n).reduce((s, p) => s + p[0], 0) / n, ring.slice(0, n).reduce((s, p) => s + p[1], 0) / n];
}

async function buildCity() {
  const bb = cfg.bbox.join(',');
  let boundary = null;
  if (cfg.boundary) {
    const bsel = `rel["boundary"="administrative"]["admin_level"="${cfg.boundary.admin_level}"]["name"="${cfg.boundary.name}"]`;
    const bEls = await overpass(`[out:json][timeout:120];${bsel}(${bb});out geom;`, `${placeId}-boundary`, { fresh });
    boundary = relationPolygons(bEls.find((e) => e.type === 'relation'));
  }

  const areas = {};
  if (cfg.areasGeoJSON) {
    for (const f of await fetchGeoJSON(cfg.areasGeoJSON.url, `${placeId}-areas`)) {
      if (f.properties.eindGeldigheid) continue;
      const polys = f.geometry.type === 'Polygon' ? [f.geometry.coordinates] : f.geometry.coordinates;
      const raw = f.properties[cfg.areasGeoJSON.nameProp];
      const name = cfg.areaMerge?.[raw] ?? raw;
      areas[name] = (areas[name] || []).concat(polys);
    }
    console.log(`  areas: ${Object.keys(areas).join(', ')}`);
  }

  const selectors = cfg.routes.map((r) => r.replaceAll('{{bbox}}', bb) + ';').join('');
  const routeQ = `[out:json][timeout:300];(${selectors})->.r;.r out geom(${bb});node(r.r);out tags;way(r.r)["public_transport"="platform"];out tags;`;
  const els = (await overpass(routeQ, `${placeId}-routes`, { fresh })).filter((e) => e.type !== 'relation' || !isTourist(e.tags || {}));
  const net = buildNetwork(els, {
    modes: MODES, stripPrefixes: cfg.stripPrefixes || [], stripSuffixes: cfg.stripSuffixes || [], aliases: cfg.aliases || {},
    nameTags: cfg.nameTags || ['name'], stationWords: !!cfg.stationWords, mergeMeters: cfg.mergeMeters ?? 300, tolerance: cfg.tolerance ?? 0.00004,
  });
  if (cfg.disambiguate) disambiguateNames(net);

  if (boundary) {
    // Stop inclusion: inside the boundary, or a metro/tram stop on a line that enters the city.
    const inside = new Set(net.stops.filter((s) => pointInMultiPolygon([s.lon, s.lat], boundary)).map((s) => s.id));
    const enteringRail = new Set();
    for (const l of net.lines) if ((l.mode === 'subway' || l.mode === 'tram') && l.stops.some((id) => inside.has(id))) l.stops.forEach((id) => enteringRail.add(`${l.mode}|${id}`));
    for (const s of net.stops) {
      if (!inside.has(s.id)) s.modes = s.modes.filter((m) => enteringRail.has(`${m}|${s.id}`));
    }
  }
  return { net, areas };
}

async function buildRail() {
  const nl = `area["ISO3166-1"="NL"]["admin_level"="2"]->.nl;`;
  const pEls = await overpass(`[out:json][timeout:300];${nl}rel(area.nl)["boundary"="administrative"]["admin_level"="4"];out geom;`, `${placeId}-provinces`, { fresh });
  const areas = {};
  for (const rel of pEls.filter((e) => e.type === 'relation' && cfg.provinces.includes(e.tags?.name))) areas[rel.tags.name] = relationPolygons(rel);
  console.log(`  provinces: ${Object.keys(areas).length}`);
  const allPolys = Object.values(areas).flat();

  const routeQ = `[out:json][timeout:600];${nl}rel["type"="route"]["route"="train"](area.nl)->.r;.r out geom;node(r.r);out tags;way(r.r)["public_transport"="platform"];out tags;`;
  const els = (await overpass(routeQ, `${placeId}-routes`, { fresh })).filter((e) => e.type !== 'relation' || !isTourist(e.tags || {}));
  const net = buildNetwork(els, { modes: ['train'], stripPrefixes: cfg.stripPrefixes, aliases: cfg.aliases, nameTags: cfg.nameTags || ['name'], stationWords: !!cfg.stationWords, mergeMeters: cfg.mergeMeters, tolerance: cfg.tolerance });
  for (const s of net.stops) if (!pointInMultiPolygon([s.lon, s.lat], allPolys)) s.modes = [];

  // Intercity: stops served by long-distance relations.
  const excl = cfg.intercityExcludeName ? new RegExp(cfg.intercityExcludeName) : null;
  const icRels = els.filter((e) => e.type === 'relation'
    && ((cfg.intercityServices || ['long_distance']).includes(e.tags?.service) || /intercity/i.test(e.tags?.name || ''))
    && !(excl && excl.test(e.tags?.name || ''))
    && (!cfg.intercityOperators || new RegExp(cfg.intercityOperators).test(e.tags?.operator || '')));
  const icNet = buildNetwork(icRels.concat(els.filter((e) => e.type !== 'relation')), { modes: ['train'], stripPrefixes: cfg.stripPrefixes, aliases: cfg.aliases, nameTags: cfg.nameTags || ['name'], stationWords: !!cfg.stationWords, mergeMeters: cfg.mergeMeters, tolerance: cfg.tolerance });
  // OSM route data has a few known gaps/errors; config lists correct them by station name.
  const icNames = new Set(icNet.stops.map((s) => s.name).concat(cfg.intercityIncludeStations || []));
  for (const n of cfg.intercityExcludeStations || []) icNames.delete(n);
  const missing = (cfg.intercityIncludeStations || []).filter((n) => !net.stops.some((s) => s.name === n));
  if (missing.length) console.warn(`  intercityIncludeStations not found: ${missing.join(', ')}`);
  return { net, areas, intercityStops: net.stops.filter((s) => icNames.has(s.name)).map((s) => s.id) };
}

const built = cfg.kind === 'rail' ? await buildRail() : await buildCity();
const { net, areas } = built;

// Drop stops with no remaining modes; prune line stops/edges to kept stops of the line's mode.
const stops = net.stops.filter((s) => s.modes.length);
const keep = new Map(stops.map((s) => [s.id, s]));
const okFor = (id, mode) => keep.get(id)?.modes.includes(mode);
const lines = net.lines.map((l) => ({
  ...l,
  stops: l.stops.filter((id) => okFor(id, l.mode)),
  edges: l.edges.filter(([a, b]) => okFor(a, l.mode) && okFor(b, l.mode)),
})).filter((l) => l.stops.length);

const packs = buildPacks(placeId, { stops, lines }, areas, { kind: cfg.kind, unlockMin: cfg.unlockMin ?? 0.7, minLineStops: cfg.minLineStops ?? 5, intercityStops: built.intercityStops, lineNames: cfg.lineNames });

const out = join(DATA, placeId);
await mkdir(out, { recursive: true });
const sizes = {};
for (const [name, body] of Object.entries({ stops: { stops }, lines: { lines }, packs: { packs } })) {
  const text = JSON.stringify(body);
  sizes[name] = `${(text.length / 1024).toFixed(0)} KB`;
  await writeFile(join(out, `${name}.json`), text);
}

const lons = stops.map((s) => s.lon);
const lats = stops.map((s) => s.lat);
const placesFile = join(DATA, 'places.json');
let places = { places: [] };
try { places = JSON.parse(await readFile(placesFile, 'utf8')); } catch { /* new */ }
const entry = { id: placeId, name: cfg.name, center: cfg.center, zoom: cfg.zoom,
  bounds: [[Math.min(...lons), Math.min(...lats)], [Math.max(...lons), Math.max(...lats)]], data: placeId, stopCount: stops.length, region: cfg.region || 'Other' };
places.places = places.places.filter((p) => p.id !== placeId).concat(entry)
  .sort((a, b) => (ORDER.indexOf(a.id) + 1 || 99) - (ORDER.indexOf(b.id) + 1 || 99));
await writeFile(placesFile, JSON.stringify(places, null, 2));

const byMode = Object.fromEntries(MODES.map((m) => [m, stops.filter((s) => s.modes.includes(m)).length]));
console.log(`${placeId}: ${stops.length} stops`, byMode, `${lines.length} lines`, sizes);
for (const p of packs) console.log(`  ${p.id.padEnd(36)} ${String(p.stops.length).padStart(5)} stops  ${p.lines.length} lines  ${p.unlock.type}`);
