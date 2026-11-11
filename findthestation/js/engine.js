// Pure round state machine (spec §3.3). A run asks every stop once; 3 tries per stop; 3/2/1 points.
import { hopDistance } from './graph.js';
import { haversineKm } from './geo.js';

export const MAX_TRIES = 3;
const POINTS = [3, 2, 1];

function shuffle(ids, rng) {
  const a = ids.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export function createRun({ stops, order, rng = Math.random }) {
  return {
    order: order ? order.slice() : shuffle(stops.map((s) => s.id), rng),
    index: 0, tries: 0, answered: false,
    score: 0, streak: 0, bestStreak: 0,
    results: [], wrongIds: [],
  };
}

export function currentTarget(run, stopsById) {
  return run.index < run.order.length ? stopsById[run.order[run.index]] : null;
}

export function guess(run, clickedId, { stopsById, graph }) {
  const target = currentTarget(run, stopsById);
  const clicked = stopsById[clickedId];
  if (!target || !clicked || run.answered) return null;

  if (clicked.name === target.name) {
    const points = POINTS[run.tries];
    run.score += points;
    run.streak = run.tries === 0 ? run.streak + 1 : 0;
    run.bestStreak = Math.max(run.bestStreak, run.streak);
    run.results.push({ id: target.id, points, tries: run.tries + 1 });
    run.answered = true;
    return { outcome: 'correct', points, clickedName: clicked.name };
  }

  run.tries++;
  if (!run.wrongIds.includes(clickedId)) run.wrongIds.push(clickedId);
  const hops = graph ? hopDistance(graph, clickedId, target.id) : null;
  const hint = hops != null
    ? { kind: 'hops', value: hops }
    : { kind: 'km', value: Math.round(haversineKm([clicked.lon, clicked.lat], [target.lon, target.lat]) * 10) / 10 };

  if (run.tries >= MAX_TRIES) {
    run.streak = 0;
    run.results.push({ id: target.id, points: 0, tries: run.tries });
    run.answered = true;
    return { outcome: 'reveal', points: 0, hint, clickedName: clicked.name };
  }
  return { outcome: 'wrong', points: 0, hint, clickedName: clicked.name };
}

export function advance(run) {
  run.index++;
  run.tries = 0;
  run.answered = false;
  run.wrongIds = [];
  return run.index < run.order.length;
}

export function summary(run) {
  const firstTry = run.results.filter((r) => r.points === POINTS[0]).length;
  return {
    score: run.score,
    maxScore: run.order.length * POINTS[0],
    accuracy: run.order.length ? firstTry / run.order.length : 0,
    bestStreak: run.bestStreak,
    missed: run.results.filter((r) => r.points === 0).map((r) => r.id),
  };
}
