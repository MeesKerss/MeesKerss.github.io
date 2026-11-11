// DOM panels over the map. No game logic here.
const $ = (id) => document.getElementById(id);
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
export { esc };

export function hideLoading() { $('loading').hidden = true; }
export function showLoading(text = 'Loading…') { const l = $('loading'); l.textContent = text; l.hidden = false; }

// ── Prompt card ─────────────────────────────────────────
export function showPrompt({ name, triesLeft, index, total, packName, onQuit }) {
  const el = $('prompt');
  el.hidden = false;
  el.innerHTML = `
    <div class="prompt-top">
      <button class="icon-btn" data-quit aria-label="Quit">✕</button>
      <span class="prompt-pack">${esc(packName)}</span>
      <span class="prompt-count">${index + 1} / ${total}</span>
    </div>
    <div class="prompt-label">Find</div>
    <div class="prompt-name">${esc(name)}</div>
    <div class="pips">${[0, 1, 2].map((i) => `<span class="pip ${i < triesLeft ? 'on' : ''}"></span>`).join('')}</div>`;
  el.querySelector('[data-quit]').onclick = onQuit;
  el.classList.remove('pop');
  void el.offsetWidth;
  el.classList.add('pop');
}

export function setTries(triesLeft) {
  document.querySelectorAll('#prompt .pip').forEach((p, i) => p.classList.toggle('on', i < triesLeft));
  const el = $('prompt');
  el.classList.remove('shake');
  void el.offsetWidth;
  el.classList.add('shake');
}

export function showNext(onNext) {
  const el = $('prompt');
  let btn = el.querySelector('.next-btn');
  if (!btn) {
    btn = document.createElement('button');
    btn.className = 'next-btn';
    btn.textContent = 'Next →';
    el.appendChild(btn);
  }
  btn.onclick = onNext;
}

export function hidePrompt() { $('prompt').hidden = true; }

// ── Toast ───────────────────────────────────────────────
let toastTimer;
export function toast(text, kind = 'info', ms = 1600) {
  const el = $('toast');
  el.textContent = text;
  el.className = `toast show ${kind}`;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { el.className = 'toast'; }, ms);
}

// ── Streak chip ─────────────────────────────────────────
const MILESTONES = [5, 10, 25, 50];
export function setStreak(n) {
  const el = $('streak');
  el.hidden = n < 1;
  if (n < 1) return;
  const hot = MILESTONES.some((m) => n >= m);
  el.className = `streak${hot ? ' hot' : ''}`;
  el.textContent = `${n} in a row`;
  if (MILESTONES.includes(n)) {
    el.classList.remove('popbig');
    void el.offsetWidth;
    el.classList.add('popbig');
  }
}

// ── End screen ──────────────────────────────────────────
export function showEnd({ summary, packName, missedStops, isBest, onReplay, onBack, onShowStop }) {
  const el = $('end');
  el.hidden = false;
  const pct = Math.round(summary.accuracy * 100);
  el.innerHTML = `
    <div class="card end-card">
      <div class="end-pack">${esc(packName)}</div>
      <div class="end-score">${summary.score}<span>/ ${summary.maxScore}</span></div>
      ${isBest ? '<div class="end-best">New best</div>' : ''}
      <div class="end-stats">
        <div><b>${pct}%</b><span>first try</span></div>
        <div><b>${summary.bestStreak}</b><span>best streak</span></div>
        <div><b>${missedStops.length}</b><span>missed</span></div>
      </div>
      ${missedStops.length ? `<div class="end-missed-lbl">Missed — tap to see</div>
      <div class="end-missed">${missedStops.map((s) => `<button data-sid="${esc(s.id)}">${esc(s.name)}</button>`).join('')}</div>` : ''}
      <div class="end-actions">
        <button class="btn ghost" data-back>Packs</button>
        <button class="btn" data-replay>Play again</button>
      </div>
    </div>`;
  el.querySelector('[data-replay]').onclick = onReplay;
  el.querySelector('[data-back]').onclick = onBack;
  el.querySelectorAll('[data-sid]').forEach((b) => {
    b.onclick = () => { el.classList.add('peek'); onShowStop(b.dataset.sid); };
  });
  el.onclick = (e) => { if (e.target === el) el.classList.remove('peek'); };
}

export function hideEnd() { const el = $('end'); el.hidden = true; el.classList.remove('peek'); }
