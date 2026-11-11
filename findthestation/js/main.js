// App controller: wires data, map, engine and UI. States: globe → place → play → end.
import { loadPlaces, loadPlace, packGraph } from './data.js';
import * as M from './mapview.js';
import * as L from './layers.js';
import * as ui from './ui.js';
import { createRun, currentTarget, guess, advance, summary, MAX_TRIES } from './engine.js';
import { nearestStop } from './hit.js';
import { sfx, unlockAudio, isMuted, setMuted } from './sound.js';
import {
  loadProgress, saveProgress, recordRun, isUnlocked, canHardMode,
  saveResume, getResume, clearResume, RESUME_MIN_STOPS, placeMasteryFromProgress,
} from './progress.js';

const app = {
  state: 'boot', map: null, places: [], place: null, data: null,
  pack: null, run: null, graph: null, hard: false,
  busy: false, timer: null, lastPointer: 'mouse',
  progress: loadProgress(),
};
globalThis.__fts = app; // debugging/automation handle

const hintText = (h) => (h.kind === 'hops'
  ? `${h.value} stop${h.value === 1 ? '' : 's'} away`
  : `${h.value.toFixed(1)} km away`);

const isMobile = () => innerWidth < 640;
function setState(s) {
  app.state = s;
  document.body.dataset.state = s;
  document.body.classList.toggle('playing', s === 'play' || s === 'end');
}

// Padding that keeps the map content clear of the panel (desktop: left card, mobile: bottom sheet).
function placePadding() {
  if (isMobile()) return { top: 70, bottom: Math.round(innerHeight * 0.5), left: 24, right: 24 };
  return { top: 60, bottom: 60, left: 420, right: 60 };
}
function playPadding() {
  return isMobile() ? { top: 170, bottom: 60, left: 24, right: 24 } : { top: 150, bottom: 50, left: 40, right: 40 };
}

function masteryById() {
  return Object.fromEntries(app.places.map((p) => [p.id, placeMasteryFromProgress(app.progress, p.id, p.stopCount)]));
}

// ── Globe ───────────────────────────────────────────────
async function goGlobe() {
  clearTimeout(app.timer);
  M.cancelFlight();
  app.run = null;
  L.clearPack(app.map);
  ui.hidePrompt(); ui.hideEnd(); ui.setStreak(0);
  setState('globe');
  ui.showPlaceMenu({
    places: app.places, masteryById: masteryById(), ringHtml: M.ringHtml,
    onSelect: (p) => goPlace(p), onHover: M.highlightPlaceMarker,
  });
  if (app.place) sfx.whoosh(2.2);
  await M.showGlobe(app.map);
}

// ── Place / pack picker ─────────────────────────────────
const MENU_DELAY_MS = 700; // the pack menu slides in while the camera is still arriving

async function goPlace(place, { fly = true } = {}) {
  const from = app.state === 'place' && app.place && app.place.id !== place.id ? app.place : null;
  app.place = place;
  setState('place');
  L.clearPack(app.map);
  ui.hidePrompt(); ui.hideEnd(); ui.setStreak(0);
  const dataP = loadPlace(place.data);
  if (fly) {
    ui.hidePanel();
    sfx.whoosh(from ? 2.8 : 2.0);
    const flight = M.flyToPlace(app.map, place, { fromPlace: from, padding: placePadding() });
    await Promise.race([flight, new Promise((r) => setTimeout(r, MENU_DELAY_MS))]);
    if (app.place !== place || app.state !== 'place') return;
  }
  app.data = await dataP;
  renderPicker();
}

function renderPicker() {
  const { place, data, progress } = app;
  ui.showPackPicker({
    place, places: app.places, packs: data.packs, progress, ringHtml: M.ringHtml,
    isUnlocked: (p) => isUnlocked(p, progress),
    canHardMode: (p) => canHardMode(p.id, progress),
    resumeFor: (p) => getResume(progress, p.id, data.stopsById),
    onPreview: (p) => previewPack(p),
    onPlay: (p, opts) => startPack(place, p.id, opts),
    onBack: goGlobe,
    onSwitch: (p) => goPlace(p),
  });
}

function previewPack(pack) {
  M.cancelFlight();
  L.showPack(app.map, app.data, pack, { preview: true, mastered: app.progress.packs[pack.id]?.mastered || [] });
  app.map.fitBounds(L.packBounds(app.data, pack), { padding: placePadding(), duration: M.reducedMotion() ? 0 : 700, maxZoom: 14 });
}

// ── Play ────────────────────────────────────────────────
async function startPack(place, packId, { hard = false, resume = false } = {}) {
  app.place = place;
  app.data = await loadPlace(place.data);
  app.pack = app.data.packs.find((p) => p.id === packId);
  app.graph = packGraph(app.data, app.pack);
  let run = resume ? getResume(app.progress, packId, app.data.stopsById) : null;
  if (!resume) clearResume(app.progress, packId);
  if (run) {
    hard = !!run.hard;
    if (run.answered && !advance(run)) run = null;
  }
  app.run = run || Object.assign(createRun({ stops: app.pack.stops.map((id) => app.data.stopsById[id]) }), { hard });
  app.hard = hard;
  setState('play');
  M.cancelFlight();
  ui.hidePanel(); ui.hideEnd();
  L.showPack(app.map, app.data, app.pack, { hard });
  for (const id of app.run.wrongIds) L.setStopState(app.map, id, 'wrong'); // restore marks on a resumed station
  app.map.fitBounds(L.packBounds(app.data, app.pack), { padding: playPadding(), duration: M.reducedMotion() ? 0 : 900, maxZoom: 14.5 });
  ui.setStreak(app.run.streak);
  showCurrent();
}

function showCurrent() {
  const t = currentTarget(app.run, app.data.stopsById);
  app.busy = false;
  ui.showPrompt({
    name: t.name, triesLeft: MAX_TRIES - app.run.tries, index: app.run.index, total: app.run.order.length,
    packName: app.pack.name + (app.hard ? ' · Hard' : ''), onQuit: quitPack,
  });
}

function onMapClick(e) {
  if (app.state === 'end') { ui.unpeekEnd(); return; } // tapping the map brings the result card back
  if (app.state !== 'play' || !app.run || app.busy || app.run.answered) return;
  const radius = app.lastPointer === 'mouse' ? 14 : 22;
  const id = nearestStop(L.visibleStopPoints(app.map, app.data, app.pack), e.point, radius);
  if (!id) return;
  const target = currentTarget(app.run, app.data.stopsById);
  const res = guess(app.run, id, { stopsById: app.data.stopsById, graph: app.graph });
  if (!res) return;
  onAnswered(res, app.data.stopsById[id], target);
  if (app.run.answered) persistResume();
}

function persistResume() {
  if (app.pack.stops.length > RESUME_MIN_STOPS && app.run) {
    saveResume(app.progress, app.pack.id, app.run);
    saveProgress(app.progress);
  }
}

function onAnswered(res, clicked, target) {
  if (res.outcome === 'correct') {
    if (ui.MILESTONES.includes(app.run.streak)) sfx.milestone();
    else sfx.correct(Math.max(0, app.run.streak - 1));
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
    sfx.wrong();
    ui.toast(hintText(res.hint), 'hint', 1800);
    return;
  }
  sfx.reveal();
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
  if (app.state !== 'play' || !app.run) return;
  L.clearTags();
  L.resetStopStates(app.map);
  L.setLinesVisible(app.map, !app.hard);
  if (advance(app.run)) showCurrent();
  else finishPack();
}

async function finishPack() {
  const s = summary(app.run);
  const pack = app.pack;
  const prevBest = app.progress.packs[pack.id]?.bestScore ?? -1;
  const firstTry = app.run.results.filter((r) => r.points === 3).map((r) => r.id);
  recordRun(app.progress, pack.id, s, firstTry);
  clearResume(app.progress, pack.id);
  saveProgress(app.progress);
  const mastery = masteryById();
  for (const [id, m] of Object.entries(mastery)) M.updatePlaceMarker(id, m);

  app.run = null;
  sfx.finish(s.accuracy);
  setState('end');
  ui.hidePrompt();
  ui.setStreak(0);
  ui.showEnd({
    summary: s, packName: pack.name, isBest: prevBest >= 0 && s.score > prevBest,
    missedStops: s.missed.map((id) => app.data.stopsById[id]),
    onReplay: () => startPack(app.place, pack.id, { hard: app.hard }),
    onBack: () => goPlace(app.place, { fly: false }).then(() => previewPack(pack)),
    onShowStop: (id) => {
      const stop = app.data.stopsById[id];
      L.clearTags();
      L.resetStopStates(app.map);
      L.setStopState(app.map, id, 'reveal');
      L.showTag(app.map, stop, stop.name, 'reveal', 0);
      app.map.easeTo({ center: [stop.lon, stop.lat], zoom: Math.max(app.map.getZoom(), 13), duration: M.reducedMotion() ? 0 : 600 });
    },
  });
}

function quitPack() {
  clearTimeout(app.timer);
  persistResume();
  const pack = app.pack;
  app.run = null;
  ui.hidePrompt();
  ui.setStreak(0);
  goPlace(app.place, { fly: false }).then(() => previewPack(pack));
}

// ── Boot ────────────────────────────────────────────────
async function boot() {
  const map = await M.createMap('map');
  app.map = map;
  map.getContainer().addEventListener('pointerdown', (e) => { app.lastPointer = e.pointerType || 'mouse'; }, true);
  map.on('click', onMapClick);
  document.addEventListener('pointerdown', unlockAudio, true);
  ui.bindSoundButton(isMuted(), (muted) => { setMuted(muted); if (!muted) { unlockAudio(); sfx.tap(); } });
  app.places = await loadPlaces();
  M.addPlaceMarkers(map, app.places, masteryById(), (p) => {
    if (app.state === 'globe' || app.state === 'place') goPlace(p);
  });
  M.bindSpinPause(map, () => app.state === 'globe');
  ui.hideLoading();
  await goGlobe();
}

boot().catch((err) => {
  console.error(err);
  ui.showLoading('Something went wrong loading the map.');
});
