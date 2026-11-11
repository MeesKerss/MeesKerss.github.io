import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadProgress, saveProgress, recordRun, isUnlocked, canHardMode, placeMastery, saveResume, getResume, clearResume, RESUME_MIN_STOPS } from '../js/progress.js';

const fakeStorage = (init = {}) => {
  const m = new Map(Object.entries(init));
  return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), _m: m };
};
const empty = () => ({ packs: {}, resume: {} });

test('loadProgress survives throwing and corrupt storage', () => {
  const throwing = { getItem() { throw new Error('blocked'); }, setItem() { throw new Error('blocked'); } };
  assert.deepEqual(loadProgress(throwing), empty());
  assert.deepEqual(loadProgress(fakeStorage({ 'fts:v1': '{not json' })), empty());
  assert.deepEqual(loadProgress(fakeStorage({ 'fts:v1': '[1,2]' })), empty());
  assert.deepEqual(loadProgress(undefined), empty());
  assert.doesNotThrow(() => saveProgress(empty(), throwing));
});

test('save then load round-trips', () => {
  const s = fakeStorage();
  const p = recordRun(empty(), 'ams/metro', { score: 90, accuracy: 0.8, bestStreak: 6 }, ['a', 'b']);
  saveProgress(p, s);
  assert.deepEqual(loadProgress(s).packs['ams/metro'], { bestScore: 90, bestAccuracy: 0.8, bestStreak: 6, completed: 1, mastered: ['a', 'b'] });
});

test('recordRun keeps bests and unions mastered', () => {
  let p = recordRun(empty(), 'x', { score: 10, accuracy: 0.9, bestStreak: 2 }, ['a']);
  p = recordRun(p, 'x', { score: 5, accuracy: 0.5, bestStreak: 4 }, ['a', 'b']);
  assert.deepEqual(p.packs.x, { bestScore: 10, bestAccuracy: 0.9, bestStreak: 4, completed: 2, mastered: ['a', 'b'] });
});

test('unlock: 3 of tram lines at >=70%', () => {
  const pack = { unlock: { type: 'accuracy', min: 0.7, of: ['t1', 't2', 't3', 't4'], count: 3 } };
  let p = empty();
  assert.equal(isUnlocked({ unlock: { type: 'open' } }, p), true);
  p = recordRun(p, 't1', { score: 1, accuracy: 0.8, bestStreak: 0 }, []);
  p = recordRun(p, 't2', { score: 1, accuracy: 0.8, bestStreak: 0 }, []);
  p = recordRun(p, 't3', { score: 1, accuracy: 0.69, bestStreak: 0 }, []);
  assert.equal(isUnlocked(pack, p), false);
  p = recordRun(p, 't4', { score: 1, accuracy: 0.7, bestStreak: 0 }, []);
  assert.equal(isUnlocked(pack, p), true);
});

test('hard mode needs one completion', () => {
  const p = recordRun(empty(), 'x', { score: 0, accuracy: 0, bestStreak: 0 }, []);
  assert.equal(canHardMode('x', p), true);
  assert.equal(canHardMode('y', p), false);
});

test('mastery is unique across packs', () => {
  let p = recordRun(empty(), 'p1', { score: 0, accuracy: 0, bestStreak: 0 }, ['a', 'b']);
  p = recordRun(p, 'p2', { score: 0, accuracy: 0, bestStreak: 0 }, ['b', 'c']);
  assert.equal(placeMastery(p, [{ id: 'p1' }, { id: 'p2' }, { id: 'p3' }], 10), 0.3);
  assert.equal(placeMastery(p, [], 0), 0);
});

test('stale resume is discarded', () => {
  const p = empty();
  const run = { order: ['a', 'gone'], index: 1, score: 3 };
  saveResume(p, 'x', run);
  assert.equal(getResume(p, 'x', { a: {} }), null);
  assert.equal(p.resume.x, undefined);
  saveResume(p, 'x', { order: ['a'], index: 0 });
  assert.deepEqual(getResume(p, 'x', { a: {} }).order, ['a']);
  clearResume(p, 'x');
  assert.equal(getResume(p, 'x', { a: {} }), null);
  assert.equal(RESUME_MIN_STOPS, 50);
});
