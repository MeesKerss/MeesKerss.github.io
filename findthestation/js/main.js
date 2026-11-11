// App controller: wires data, map, engine and UI.
import { loadPlaces, loadPlace, packGraph } from './data.js';
import { createMap, reducedMotion } from './mapview.js';
import * as L from './layers.js';
import * as ui from './ui.js';
import { createRun, currentTarget, guess, advance, summary, MAX_TRIES } from './engine.js';
import { nearestStop } from './hit.js';

const app = {
  map: null, places: [], place: null, data: null,
  pack: null, run: null, graph: null, hard: false,
  busy: false, timer: null, lastPointer: 'mouse',
};

globalThis.__fts = app; // debugging/automation handle

const hintText = (h) => (h.kind === 'hops'
  ? `${h.value} stop${h.value === 1 ? '' : 's'} away`
  : `${h.value.toFixed(1)} km away`);

// ── Play ────────────────────────────────────────────────
export async function startPack(place, packId, { hard = false, run = null } = {}) {
  app.place = place;
  app.data = await loadPlace(place.data);
  app.pack = app.data.packs.find((p) => p.id === packId);
  app.graph = packGraph(app.data, app.pack);
  app.hard = hard;
  app.run = run || createRun({ stops: app.pack.stops.map((id) => app.data.stopsById[id]) });
  ui.hideEnd();
  L.showPack(app.map, app.data, app.pack, { hard });
  app.map.fitBounds(L.packBounds(app.data, app.pack), { padding: fitPadding(), duration: reducedMotion() ? 0 : 900, maxZoom: 14.5 });
  ui.setStreak(app.run.streak);
  showCurrent();
}

function fitPadding() {
  const mobile = innerWidth < 640;
  return { top: mobile ? 170 : 150, bottom: mobile ? 60 : 50, left: 30, right: 30 };
}

function showCurrent() {
  const t = currentTarget(app.run, app.data.stopsById);
  app.busy = false;
  ui.showPrompt({
    name: t.name, triesLeft: MAX_TRIES - app.run.tries, index: app.run.index, total: app.run.order.length,
    packName: app.pack.name, onQuit: quitPack,
  });
}

function onMapClick(e) {
  if (!app.run || app.busy || app.run.answered) return;
  const radius = app.lastPointer === 'mouse' ? 14 : 22;
  const id = nearestStop(L.visibleStopPoints(app.map, app.data, app.pack), e.point, radius);
  if (!id) return;
  const target = currentTarget(app.run, app.data.stopsById);
  const res = guess(app.run, id, { stopsById: app.data.stopsById, graph: app.graph });
  if (!res) return;
  const clicked = app.data.stopsById[id];
  onAnswered(res, clicked, target);
}

function onAnswered(res, clicked, target) {
  if (res.outcome === 'correct') {
    L.setStopState(app.map, clicked.id, 'correct');
    L.showTag(app.map, clicked, clicked.name, 'correct', 1100);
    ui.toast(`+${res.points}`, 'good', 900);
    ui.setStreak(app.run.streak);
    app.busy = true;
    app.timer = setTimeout(next, 950);
    return;
  }
  L.setStopState(app.map, clicked.id, 'wrong');
  L.showTag(app.map, clicked, `That's ${clicked.name}`, 'wrong', 1500);
  ui.setTries(MAX_TRIES - app.run.tries);
  ui.setStreak(app.run.streak);
  if (res.outcome === 'wrong') {
    ui.toast(hintText(res.hint), 'hint', 1800);
    return;
  }
  // Reveal
  L.setStopState(app.map, target.id, 'reveal');
  L.showPulse(app.map, target);
  L.highlightLinesThrough(app.map, app.data, app.pack, target.id);
  L.showTag(app.map, target, target.name, 'reveal', 0);
  ui.toast('Here it is', 'reveal', 1500);
  ui.showNext(next);
  app.timer = setTimeout(next, 2600);
}

function next() {
  clearTimeout(app.timer);
  if (!app.run) return;
  L.clearTags();
  L.resetStopStates(app.map);
  if (!app.hard) L.setLinesVisible(app.map, true);
  else L.setLinesVisible(app.map, false);
  if (advance(app.run)) showCurrent();
  else finishPack();
}

function finishPack() {
  const s = summary(app.run);
  ui.hidePrompt();
  ui.setStreak(0);
  const pack = app.pack;
  const run = app.run;
  app.run = null;
  ui.showEnd({
    summary: s, packName: pack.name, isBest: false,
    missedStops: s.missed.map((id) => app.data.stopsById[id]),
    onReplay: () => startPack(app.place, pack.id, { hard: app.hard }),
    onBack: () => { ui.hideEnd(); onLeavePack(); },
    onShowStop: (id) => {
      const stop = app.data.stopsById[id];
      L.clearTags();
      L.resetStopStates(app.map);
      L.setStopState(app.map, id, 'reveal');
      L.showTag(app.map, stop, stop.name, 'reveal', 0);
      app.map.easeTo({ center: [stop.lon, stop.lat], zoom: Math.max(app.map.getZoom(), 13), duration: reducedMotion() ? 0 : 600 });
    },
  });
  return { s, run };
}

function quitPack() {
  clearTimeout(app.timer);
  app.run = null;
  ui.hidePrompt();
  ui.setStreak(0);
  L.clearPack(app.map);
  onLeavePack();
}

// Replaced by the place screen in a later step.
let onLeavePack = () => startPack(app.place, app.pack.id);

// ── Boot ────────────────────────────────────────────────
async function boot() {
  const map = await createMap('map');
  app.map = map;
  map.getContainer().addEventListener('pointerdown', (e) => { app.lastPointer = e.pointerType || 'mouse'; }, true);
  map.on('click', onMapClick);
  app.places = await loadPlaces();
  ui.hideLoading();
  const ams = app.places.find((p) => p.id === 'amsterdam');
  await startPack(ams, 'amsterdam/metro');
}

boot().catch((err) => {
  console.error(err);
  ui.showLoading('Something went wrong loading the map.');
});
