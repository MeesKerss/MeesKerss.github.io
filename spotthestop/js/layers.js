// Pack layers on the map: grey route lines + identical stop dots, coloured only by game state.
const ml = () => globalThis.maplibregl;

export const COLORS = {
  ink: '#111', paper: '#f0ede8', line: '#9a968f', lineFocus: '#6f6b64',
  correct: '#16a34a', wrong: '#dc2626', reveal: '#d97706', found: '#86d6a0',
};

const SRC_L = 'fts-lines';
const SRC_S = 'fts-stops';
let tagTimers = [];
let pulse = null;

export function showPack(map, placeData, pack, { hard = false, mastered = [], preview = false } = {}) {
  clearPack(map);
  const focus = new Set(pack.focusLines || []);
  const lineFeatures = pack.lines.map((id) => placeData.linesById[id]).filter(Boolean).map((l) => ({
    type: 'Feature',
    properties: { lid: l.id, colour: l.colour || COLORS.ink, focus: focus.size === 0 || focus.has(l.id) },
    geometry: { type: 'MultiLineString', coordinates: l.coords },
  }));
  const masteredSet = new Set(mastered);
  const stopFeatures = pack.stops.map((id) => placeData.stopsById[id]).filter(Boolean).map((s) => ({
    type: 'Feature',
    properties: { sid: s.id, mastered: masteredSet.has(s.id) },
    geometry: { type: 'Point', coordinates: [s.lon, s.lat] },
  }));

  map.addSource(SRC_L, { type: 'geojson', data: { type: 'FeatureCollection', features: lineFeatures }, promoteId: 'lid' });
  map.addSource(SRC_S, { type: 'geojson', data: { type: 'FeatureCollection', features: stopFeatures }, promoteId: 'sid' });

  const hl = ['boolean', ['feature-state', 'hl'], false];
  map.addLayer({
    id: SRC_L, type: 'line', source: SRC_L,
    layout: { 'line-join': 'round', 'line-cap': 'round', visibility: hard ? 'none' : 'visible' },
    paint: {
      'line-color': ['case', hl, ['get', 'colour'], ['get', 'focus'], preview ? ['get', 'colour'] : focus.size ? COLORS.lineFocus : COLORS.line, COLORS.line],
      'line-width': ['interpolate', ['linear'], ['zoom'], 6, ['case', hl, 2.5, 1], 12, ['case', hl, 5, ['get', 'focus'], 2.5, 1.5], 16, ['case', hl, 7, 4]],
      'line-opacity': ['case', hl, 1, ['get', 'focus'], 0.9, 0.3],
    },
  });

  const state = ['coalesce', ['feature-state', 'state'], 'idle'];
  map.addLayer({
    id: SRC_S, type: 'circle', source: SRC_S,
    paint: {
      'circle-radius': ['interpolate', ['linear'], ['zoom'], 6, 2.5, 9, 3.5, 11, 4, 15, 7],
      'circle-color': ['match', state,
        'wrong', COLORS.wrong, 'correct', COLORS.correct, 'reveal', COLORS.reveal, 'found', COLORS.found,
        ['case', ['get', 'mastered'], COLORS.ink, '#ffffff']],
      'circle-stroke-color': ['match', state, 'wrong', COLORS.wrong, 'correct', COLORS.correct, 'reveal', COLORS.reveal, 'found', COLORS.correct, COLORS.ink],
      'circle-stroke-width': ['interpolate', ['linear'], ['zoom'], 6, 1, 12, 1.6],
    },
  });
}

export function clearPack(map) {
  clearTags();
  removePulse();
  for (const id of [SRC_S, SRC_L]) {
    if (map.getLayer(id)) map.removeLayer(id);
    if (map.getSource(id)) map.removeSource(id);
  }
}

export function setStopState(map, id, state) {
  if (map.getSource(SRC_S)) map.setFeatureState({ source: SRC_S, id }, { state });
}

export function resetStopStates(map) {
  if (map.getSource(SRC_S)) map.removeFeatureState({ source: SRC_S });
  if (map.getSource(SRC_L)) map.removeFeatureState({ source: SRC_L });
  removePulse();
}

export function highlightLinesThrough(map, placeData, pack, stopId) {
  if (!map.getSource(SRC_L)) return;
  if (map.getLayer(SRC_L)) map.setLayoutProperty(SRC_L, 'visibility', 'visible');
  for (const lid of pack.lines) {
    if (placeData.linesById[lid]?.stops.includes(stopId)) map.setFeatureState({ source: SRC_L, id: lid }, { hl: true });
  }
}

export function setLinesVisible(map, visible) {
  if (map.getLayer(SRC_L)) map.setLayoutProperty(SRC_L, 'visibility', visible ? 'visible' : 'none');
}

// Screen points of the pack's stops that are currently in view.
export function visibleStopPoints(map, placeData, pack) {
  const { width, height } = map.getContainer().getBoundingClientRect();
  const pts = [];
  for (const id of pack.stops) {
    const s = placeData.stopsById[id];
    if (!s) continue;
    const p = map.project([s.lon, s.lat]);
    if (p.x >= -30 && p.y >= -30 && p.x <= width + 30 && p.y <= height + 30) pts.push({ id, x: p.x, y: p.y });
  }
  return pts;
}

export function showTag(map, stop, text, kind, ms = 1500) {
  const popup = new (ml().Popup)({ closeButton: false, closeOnClick: false, className: `fts-tag fts-tag-${kind}`, offset: 12, maxWidth: '260px' })
    .setLngLat([stop.lon, stop.lat]).setText(text).addTo(map);
  if (ms) tagTimers.push(setTimeout(() => popup.remove(), ms));
  tagTimers.push({ popup });
  return popup;
}

export function clearTags() {
  for (const t of tagTimers) {
    if (t && t.popup) t.popup.remove();
    else clearTimeout(t);
  }
  tagTimers = [];
}

export function showPulse(map, stop) {
  removePulse();
  const el = document.createElement('div');
  el.className = 'fts-pulse';
  pulse = new (ml().Marker)({ element: el }).setLngLat([stop.lon, stop.lat]).addTo(map);
}

function removePulse() {
  if (pulse) { pulse.remove(); pulse = null; }
}

export function packBounds(placeData, pack) {
  let w = 180, s = 90, e = -180, n = -90;
  for (const id of pack.stops) {
    const p = placeData.stopsById[id];
    if (!p) continue;
    w = Math.min(w, p.lon); e = Math.max(e, p.lon); s = Math.min(s, p.lat); n = Math.max(n, p.lat);
  }
  return [[w, s], [e, n]];
}
