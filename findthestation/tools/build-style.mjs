// CLI: node findthestation/tools/build-style.mjs — regenerates style/basemap.json (label-free, paper palette, globe).
import { writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const OUT = join(dirname(fileURLToPath(import.meta.url)), '..', 'style', 'basemap.json');
const src = await (await fetch('https://tiles.openfreemap.org/styles/positron')).json();

const P = {
  paper: '#f0ede8', water: '#c9d6dc', green: '#e3e6d6', road: '#ffffff', casing: '#dedad3',
  rail: '#c4bfb6', building: '#e8e4dd', boundary: '#cfcac2', residential: '#ece8e2',
};

const rules = [
  [/^background$/, { 'background-color': P.paper }],
  [/^water$/, { 'fill-color': P.water }],
  [/^waterway/, { 'line-color': P.water }],
  [/^(park|landcover_wood)$/, { 'fill-color': P.green, 'fill-opacity': 1 }],
  [/^landcover_(ice|glacier)/, { 'fill-color': '#f7f6f3' }],
  [/^landuse_residential$/, { 'fill-color': P.residential, 'fill-opacity': 0.6 }],
  [/^building$/, { 'fill-color': P.building, 'fill-outline-color': P.building, 'fill-opacity': 0.6 }],
  [/casing$/, { 'line-color': P.casing }],
  [/^(highway|tunnel|road|aeroway-(taxiway|runway$))/, { 'line-color': P.road }],
  [/^(aeroway-area|road_area)/, { 'fill-color': P.road }],
  [/^railway/, { 'line-color': P.rail }],
  [/^boundary/, { 'line-color': P.boundary }],
];

const layers = [];
for (const layer of src.layers) {
  if (layer.type === 'symbol' || layer.source === 'ne2_shaded') continue;
  const l = structuredClone(layer);
  for (const [re, paint] of rules) {
    if (!re.test(l.id)) continue;
    const prefix = l.type + '-';
    l.paint = { ...(l.paint || {}) };
    for (const [k, v] of Object.entries(paint)) if (k.startsWith(prefix)) l.paint[k] = v;
    break;
  }
  if (/^railway.*dashline$/.test(l.id)) l.paint['line-dasharray'] = [2, 2];
  layers.push(l);
}

const style = {
  version: 8,
  name: 'findthestation-paper',
  projection: { type: 'globe' },
  sky: { 'sky-color': P.paper, 'horizon-color': P.paper, 'fog-color': P.paper, 'atmosphere-blend': ['interpolate', ['linear'], ['zoom'], 0, 0.6, 5, 0] },
  sources: { openmaptiles: src.sources.openmaptiles },
  layers,
};
await writeFile(OUT, JSON.stringify(style, null, 2));
console.log(`wrote ${layers.length} layers to style/basemap.json`);
