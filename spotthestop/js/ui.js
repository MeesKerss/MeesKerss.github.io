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
export const MILESTONES = [5, 10, 25, 50];
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

export function unpeekEnd() { $('end').classList.remove('peek'); }

export function hideEnd() { const el = $('end'); el.hidden = true; el.classList.remove('peek'); }

// ── Panel: place menu (globe) ───────────────────────────
const panel = () => $('panel');
export const MODE_COLORS = { subway: '#2563eb', tram: '#7c3aed', bus: '#0891b2', ferry: '#0d9488', train: '#d97706', all: '#111' };

export function showPlaceMenu({ places, masteryById, ringHtml, onSelect, onHover }) {
  const el = panel();
  el.hidden = false;
  el.className = 'panel panel-globe';
  el.innerHTML = `
    <div class="panel-head">
      <h1 class="title">Spot the Stop</h1>
      <p class="sub">Every station is a dot. No names. Where is it?</p>
    </div>
    <div class="place-list">
      ${places.map((p, i) => `${i === 0 || places[i - 1].region !== p.region ? `<div class="region-head">${esc(p.region || '')}</div>` : ''}
        <button class="place-row" data-id="${esc(p.id)}">
          ${ringHtml(masteryById[p.id] || 0)}
          <span class="place-name">${esc(p.name)}</span>
          <span class="place-meta">${p.stopCount} stops · ${Math.round((masteryById[p.id] || 0) * 100)}%</span>
          <span class="chev">→</span>
        </button>`).join('')}
    </div>`;
  el.querySelectorAll('.place-row').forEach((b) => {
    const place = places.find((p) => p.id === b.dataset.id);
    b.onclick = () => onSelect(place);
    b.onmouseenter = () => onHover(place.id, true);
    b.onmouseleave = () => onHover(place.id, false);
  });
}

export function hidePanel() { panel().hidden = true; }

// ── Panel: pack picker (place) ──────────────────────────
function lockText(pack, packsById) {
  const u = pack.unlock;
  const of = u.of.map((id) => packsById[id]).filter(Boolean);
  const pct = Math.round(u.min * 100);
  if (of.length && of.every((p) => p.kind === 'line')) return `${pct}% on ${u.count} ${of[0].group.toLowerCase()} lines`;
  if (of.length && of.every((p) => p.kind === 'area')) return `${pct}% on ${u.count} areas`;
  const names = of.map((p) => p.name);
  return u.count >= names.length ? `${pct}% on ${names.join(', ')}` : `${pct}% on ${u.count} of ${names.join(', ')}`;
}

export function showPackPicker({ place, places, packs, progress, ringHtml, isUnlocked, canHardMode, resumeFor, onPreview, onPlay, onBack, onSwitch }) {
  const el = panel();
  el.hidden = false;
  el.className = 'panel panel-place';
  const packsById = Object.fromEntries(packs.map((p) => [p.id, p]));
  const idx = places.findIndex((p) => p.id === place.id);
  const groups = [];
  for (const p of packs) {
    let g = groups.find((x) => x.name === p.group);
    if (!g) groups.push((g = { name: p.group, mode: p.mode, packs: [] }));
    g.packs.push(p);
  }

  const row = (p) => {
    const st = progress.packs[p.id];
    const unlocked = isUnlocked(p);
    const mastery = st ? (st.mastered.filter((id) => p.stops.includes(id)).length / p.stops.length) : 0;
    const meta = unlocked
      ? `${p.stops.length} stops${st ? ` · best ${st.bestScore} · ${Math.round(st.bestAccuracy * 100)}%` : ''}`
      : `🔒 ${esc(lockText(p, packsById))}`;
    return `<div class="pack ${unlocked ? '' : 'locked'}" data-id="${esc(p.id)}">
      <button class="pack-row" ${unlocked ? '' : 'aria-disabled="true"'}>
        <span class="pack-ring">${ringHtml(mastery)}</span>
        <span class="pack-text"><span class="pack-name">${esc(p.name)}</span><span class="pack-meta">${meta}</span></span>
      </button>
      <div class="pack-actions"></div>
    </div>`;
  };

  el.innerHTML = `
    <div class="place-header" data-swipe>
      <button class="back" data-back>← Globe</button>
      <div class="place-switch">
        <button class="icon-btn" data-prev aria-label="Previous place" ${places.length < 2 ? 'hidden' : ''}>‹</button>
        <h2>${esc(place.name)}</h2>
        <button class="icon-btn" data-next aria-label="Next place" ${places.length < 2 ? 'hidden' : ''}>›</button>
      </div>
    </div>
    <div class="pack-list">
      ${groups.map((g) => {
        const lines = g.packs.filter((p) => p.kind === 'line');
        const rest = g.packs.filter((p) => p.kind !== 'line');
        return `<section class="group">
          <div class="group-head"><span class="chip" style="--c:${MODE_COLORS[g.mode] || '#111'}">${esc(g.name)}</span></div>
          ${rest.filter((p) => !/-all$|^.*\/everything$/.test(p.id)).map(row).join('')}
          ${lines.length ? `<details class="lines" ${groups.length === 1 ? 'open' : ''}><summary>Lines (${lines.length})</summary>${lines.map(row).join('')}</details>` : ''}
          ${rest.filter((p) => /-all$|^.*\/everything$/.test(p.id)).map(row).join('')}
        </section>`;
      }).join('')}
    </div>`;

  el.querySelector('[data-back]').onclick = onBack;
  el.querySelector('[data-prev]').onclick = () => onSwitch(places[(idx - 1 + places.length) % places.length]);
  el.querySelector('[data-next]').onclick = () => onSwitch(places[(idx + 1) % places.length]);
  bindSwipe(el.querySelector('[data-swipe]'), (dir) => onSwitch(places[(idx + dir + places.length) % places.length]));

  let selected = null;
  el.querySelectorAll('.pack').forEach((node) => {
    const p = packsById[node.dataset.id];
    const btn = node.querySelector('.pack-row');
    btn.onmouseenter = () => { if (!selected && matchMedia('(hover: hover)').matches) onPreview(p); };
    btn.onclick = () => {
      if (selected === node) { node.classList.remove('open'); selected = null; return; }
      el.querySelectorAll('.pack.open').forEach((n) => n.classList.remove('open'));
      selected = node;
      node.classList.add('open');
      onPreview(p);
      if (!isUnlocked(p)) { node.querySelector('.pack-actions').innerHTML = '<p class="locked-note">Locked — keep playing the smaller packs.</p>'; return; }
      const resume = resumeFor(p);
      const hardOk = canHardMode(p);
      const actions = node.querySelector('.pack-actions');
      actions.innerHTML = `
        ${hardOk ? '<label class="hard"><input type="checkbox" data-hard> Hard mode <span>no lines</span></label>' : ''}
        <div class="pack-btns">
          ${resume ? `<button class="btn ghost" data-continue>Continue ${resume.index + 1}/${resume.order.length}</button>` : ''}
          <button class="btn" data-play>${resume ? 'Restart' : 'Play'}</button>
        </div>`;
      const hard = () => !!actions.querySelector('[data-hard]')?.checked;
      actions.querySelector('[data-play]').onclick = () => onPlay(p, { hard: hard(), resume: false });
      const c = actions.querySelector('[data-continue]');
      if (c) c.onclick = () => onPlay(p, { hard: !!resume.hard, resume: true });
      node.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    };
  });
}

function bindSwipe(node, onSwipe) {
  let x0 = null;
  let y0 = null;
  node.addEventListener('pointerdown', (e) => { x0 = e.clientX; y0 = e.clientY; });
  node.addEventListener('pointerup', (e) => {
    if (x0 == null) return;
    const dx = e.clientX - x0;
    const dy = e.clientY - y0;
    x0 = null;
    if (Math.abs(dx) > 60 && Math.abs(dx) > Math.abs(dy) * 1.5) onSwipe(dx < 0 ? 1 : -1);
  });
  node.addEventListener('pointercancel', () => { x0 = null; });
}

// ── Sound toggle ────────────────────────────────────────
const SPEAKER_ON = '<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path d="M4 9h4l5-4v14l-5-4H4z" fill="currentColor"/><path d="M16 8.5a5 5 0 0 1 0 7M18.5 6a8.5 8.5 0 0 1 0 12" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>';
const SPEAKER_OFF = '<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path d="M4 9h4l5-4v14l-5-4H4z" fill="currentColor"/><path d="M16.5 9.5l5 5M21.5 9.5l-5 5" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>';
export function bindSoundButton(muted, onChange) {
  const btn = $('sound');
  let m = muted;
  const paint = () => {
    btn.innerHTML = m ? SPEAKER_OFF : SPEAKER_ON;
    btn.setAttribute('aria-label', m ? 'Turn sound on' : 'Turn sound off');
    btn.classList.toggle('off', m);
  };
  paint();
  btn.onclick = () => { m = !m; paint(); onChange(m); };
}
