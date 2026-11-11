// One MapLibre map for globe and city. `maplibregl` is the global from the CDN script.
const ml = () => globalThis.maplibregl;

export const reducedMotion = () => {
  try { return matchMedia('(prefers-reduced-motion: reduce)').matches; } catch { return false; }
};

export function createMap(container) {
  const map = new (ml().Map)({
    container,
    style: 'style/basemap.json',
    center: [4.9, 50],
    zoom: 1.6,
    attributionControl: false,
    renderWorldCopies: false,
    dragRotate: false,
    pitchWithRotate: false,
    maxPitch: 0,
  });
  map.touchZoomRotate.disableRotation();
  map.addControl(new (ml().AttributionControl)({ compact: true }), 'bottom-right');
  return new Promise((resolve) => map.once('load', () => resolve(map)));
}
