// One MapLibre map for globe and city. `maplibregl` is the global from the CDN script.
import { spinSpeed } from './spin.js';
const ml = () => globalThis.maplibregl;

export const reducedMotion = () => {
  try { return matchMedia('(prefers-reduced-motion: reduce)').matches; } catch { return false; }
};

export function createMap(container) {
  const map = new (ml().Map)({
    container,
    style: 'style/basemap.json',
    center: [-8, 42],
    zoom: innerWidth < 640 ? 1.2 : 1.8,
    attributionControl: false,
    renderWorldCopies: false,
    dragRotate: false,
    pitchWithRotate: false,
    maxPitch: 0,
  });
  map.touchZoomRotate.disableRotation();
  map.doubleClickZoom.disable(); // quick successive guesses must not zoom the map
  map.addControl(new (ml().AttributionControl)({ compact: true }), 'bottom-right');
  return new Promise((resolve) => map.once('load', () => resolve(map)));
}

// ── Globe + flights ─────────────────────────────────────
let spin = { on: false, raf: 0, last: 0, idleTimer: 0, gen: 0 };

function spinFrame(map, t) {
  if (!spin.on) return;
  const speed = spinSpeed(map.getZoom());
  if (spin.last && speed > 0 && !map.isMoving()) {
    const c = map.getCenter();
    map.jumpTo({ center: [c.lng + (speed * (t - spin.last)) / 1000, c.lat] });
  }
  spin.last = t;
  spin.raf = requestAnimationFrame((tt) => spinFrame(map, tt));
}

export function startSpin(map) {
  if (reducedMotion() || spin.on) return;
  spin.on = true;
  spin.last = 0;
  spin.raf = requestAnimationFrame((t) => spinFrame(map, t));
}

export function stopSpin() {
  spin.gen++; // cancels any spin that is still waiting to start
  spin.on = false;
  cancelAnimationFrame(spin.raf);
  clearTimeout(spin.idleTimer);
}

// Pause spinning while the user drags the globe; resume after a quiet moment if still on the globe.
export function bindSpinPause(map, isGlobe) {
  const pause = () => {
    if (!isGlobe()) return;
    stopSpin();
    spin.idleTimer = setTimeout(() => { if (isGlobe()) startSpin(map); }, 4000);
  };
  for (const ev of ['mousedown', 'touchstart', 'wheel']) map.getCanvasContainer().addEventListener(ev, pause, { passive: true });
}

const once = (map, ev) => new Promise((r) => map.once(ev, r));

async function fadeJump(map, camera) {
  const el = map.getContainer();
  el.classList.add('fade');
  await new Promise((r) => setTimeout(r, 250));
  map.jumpTo(camera);
  el.classList.remove('fade');
}

export async function showGlobe(map) {
  stopSpin();
  const gen = spin.gen;
  const cam = { center: [map.getCenter().lng, 42], zoom: innerWidth < 640 ? 1.5 : 2.4 };
  if (reducedMotion()) await fadeJump(map, cam);
  else {
    map.flyTo({ ...cam, duration: 2200, curve: 1.4, essential: true });
    await once(map, 'moveend');
  }
  if (gen === spin.gen) startSpin(map);
}

export function placeCamera(map, place, padding) {
  const cam = map.cameraForBounds(place.bounds, { padding }) || { center: place.center, zoom: place.zoom };
  return { center: cam.center, zoom: Math.min(cam.zoom, 15) };
}

// Each new flight (or cancelFlight) bumps the generation, so an older multi-stage flight stops early.
let flightGen = 0;
export function cancelFlight() { flightGen++; }

export async function flyToPlace(map, place, { fromPlace = null, padding } = {}) {
  stopSpin();
  const gen = ++flightGen;
  const target = placeCamera(map, place, padding);
  if (reducedMotion()) return fadeJump(map, target);
  if (fromPlace) {
    const a = fromPlace.center;
    const b = place.center;
    const mid = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
    const z = Math.max(1.5, Math.min(map.getZoom(), target.zoom) - 3);
    map.flyTo({ center: mid, zoom: z, duration: 1000, curve: 1.2, essential: true });
    await once(map, 'moveend');
    if (gen !== flightGen) return;
    map.flyTo({ ...target, duration: 1400, curve: 1.4, essential: true });
  } else {
    map.flyTo({ ...target, duration: 2000, curve: 1.6, essential: true });
  }
  await once(map, 'moveend');
}

// ── Place markers (progress rings) ──────────────────────
const markers = new Map();
const RING_R = 11;
const RING_C = 2 * Math.PI * RING_R;

function ringSvg(mastery) {
  const off = RING_C * (1 - Math.max(0, Math.min(1, mastery)));
  return `<svg class="ring" viewBox="0 0 28 28" width="28" height="28" aria-hidden="true">
    <circle cx="14" cy="14" r="${RING_R}" fill="none" stroke="#dedad3" stroke-width="3"/>
    <circle cx="14" cy="14" r="${RING_R}" fill="none" stroke="#111" stroke-width="3" stroke-linecap="round"
      stroke-dasharray="${RING_C.toFixed(2)}" stroke-dashoffset="${off.toFixed(2)}" transform="rotate(-90 14 14)"/>
    <circle cx="14" cy="14" r="4.5" fill="#111"/></svg>`;
}

export function addPlaceMarkers(map, places, masteryById, onSelect) {
  for (const p of places) {
    // MapLibre positions the wrapper with a transform; the inner chip owns hover effects.
    const wrap = document.createElement('div');
    wrap.className = 'place-marker-wrap';
    const el = document.createElement('button');
    el.className = `place-marker anchor-${p.markerAnchor || 'bottom'}`;
    el.setAttribute('aria-label', p.name);
    el.innerHTML = `${ringSvg(masteryById[p.id] || 0)}<span></span>`;
    el.querySelector('span').textContent = p.name;
    el.addEventListener('click', (e) => { e.stopPropagation(); onSelect(p); });
    wrap.appendChild(el);
    const m = new (ml().Marker)({ element: wrap, anchor: p.markerAnchor || 'bottom' }).setLngLat(p.center).addTo(map);
    markers.set(p.id, { m, el });
  }
}

export function updatePlaceMarker(id, mastery) {
  const k = markers.get(id);
  if (k) k.el.querySelector('.ring').outerHTML = ringSvg(mastery);
}

export function highlightPlaceMarker(id, on) {
  markers.get(id)?.el.classList.toggle('hover', on);
}

export function ringHtml(mastery) { return ringSvg(mastery); }
