// Progress, unlocks, mastery and resume. Storage is optional: every access is guarded.
export const STORAGE_KEY = 'fts:v1';
export const RESUME_MIN_STOPS = 50;

const empty = () => ({ packs: {}, resume: {} });
const defaultStorage = () => {
  try { return globalThis.localStorage; } catch { return undefined; }
};

export function loadProgress(storage = defaultStorage()) {
  try {
    const raw = storage?.getItem(STORAGE_KEY);
    if (!raw) return empty();
    const data = JSON.parse(raw);
    if (!data || typeof data !== 'object' || Array.isArray(data)) return empty();
    return {
      packs: data.packs && typeof data.packs === 'object' ? data.packs : {},
      resume: data.resume && typeof data.resume === 'object' ? data.resume : {},
    };
  } catch {
    return empty();
  }
}

export function saveProgress(progress, storage = defaultStorage()) {
  try { storage?.setItem(STORAGE_KEY, JSON.stringify(progress)); } catch { /* storage unavailable */ }
}

export function recordRun(progress, packId, summary, firstTryIds) {
  const prev = progress.packs[packId] || { bestScore: 0, bestAccuracy: 0, bestStreak: 0, completed: 0, mastered: [] };
  progress.packs[packId] = {
    bestScore: Math.max(prev.bestScore, summary.score),
    bestAccuracy: Math.max(prev.bestAccuracy, summary.accuracy),
    bestStreak: Math.max(prev.bestStreak, summary.bestStreak),
    completed: prev.completed + 1,
    mastered: [...new Set([...prev.mastered, ...firstTryIds])],
  };
  return progress;
}

export function isUnlocked(pack, progress) {
  const u = pack.unlock || { type: 'open' };
  if (u.type !== 'accuracy') return true;
  const passed = u.of.filter((id) => (progress.packs[id]?.bestAccuracy ?? 0) >= u.min).length;
  return passed >= u.count;
}

export function canHardMode(packId, progress) {
  return (progress.packs[packId]?.completed ?? 0) >= 1;
}

export function placeMastery(progress, packs, stopCount) {
  if (!stopCount) return 0;
  const ids = new Set();
  for (const p of packs) for (const id of progress.packs[p.id]?.mastered || []) ids.add(id);
  return Math.min(1, ids.size / stopCount);
}

export function saveResume(progress, packId, run) {
  progress.resume[packId] = JSON.parse(JSON.stringify(run));
}

export function getResume(progress, packId, stopsById) {
  const run = progress.resume[packId];
  if (!run) return null;
  if (!Array.isArray(run.order) || run.order.some((id) => !stopsById[id])) {
    delete progress.resume[packId];
    return null;
  }
  return run;
}

export function clearResume(progress, packId) {
  delete progress.resume[packId];
}

// Same as placeMastery, but derived only from saved progress (pack ids are "<place>/<pack>").
export function placeMasteryFromProgress(progress, placeId, stopCount) {
  if (!stopCount) return 0;
  const ids = new Set();
  for (const [packId, st] of Object.entries(progress.packs)) {
    if (packId.startsWith(`${placeId}/`)) for (const id of st.mastered || []) ids.add(id);
  }
  return Math.min(1, ids.size / stopCount);
}
