// --- Data & State ---
const COLORS = ['#d97706','#2563eb']; // Player 1, Player 2
const DEFAULTS = ['Player 1','Player 2'];
const LETTERS = 'ABCDEFGHIJ';
const SHIPS = {
  carrier:    {name:'Carrier',    len:5},
  battleship: {name:'Battleship', len:4},
  cruiser:    {name:'Cruiser',    len:3},
  submarine:  {name:'Submarine',  len:3},
  destroyer:  {name:'Destroyer',  len:2}
};
const FLEETS = {
  8:  ['battleship','cruiser','submarine','destroyer'],
  10: ['carrier','battleship','cruiser','submarine','destroyer']
};

let G;
function saveState() {
  if(G) localStorage.setItem('battleships_state', JSON.stringify(G));
}

// UI-only state (not saved)
let sel = null;      // index of ship being placed
let vert = false;    // placement orientation
let hover = null;    // [r,c] under the mouse, for the ghost preview
let locked = false;  // blocks input during shot animations
let lastShot = null; // key of the newest marker, gets the pop/ripple animation
const canHover = window.matchMedia('(hover: hover)').matches; // ghost preview only with a real mouse

// --- Audio (game specific) ---
// Shared sounds (sndClick, sndScore, sndWin, sndError, sndImpact) come from audio.js
function sndSplash() {
  if(!actx) return;
  const dur = 0.45, now = actx.currentTime;
  const buffer = actx.createBuffer(1, actx.sampleRate * dur, actx.sampleRate);
  const data = buffer.getChannelData(0);
  for(let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
  const noise = actx.createBufferSource(); noise.buffer = buffer;
  const filter = actx.createBiquadFilter(); filter.type = 'lowpass';
  filter.frequency.setValueAtTime(1800, now);
  filter.frequency.exponentialRampToValueAtTime(200, now + dur);
  const gain = actx.createGain();
  gain.gain.setValueAtTime(0.001, now);
  gain.gain.linearRampToValueAtTime(0.06, now + 0.03);
  gain.gain.exponentialRampToValueAtTime(0.001, now + dur);
  noise.connect(filter); filter.connect(gain); gain.connect(actx.destination);
  noise.start(now);
}
function sndBoom() {
  if(!actx) return;
  const osc = actx.createOscillator(), gain = actx.createGain(), now = actx.currentTime;
  osc.frequency.setValueAtTime(120, now);
  osc.frequency.exponentialRampToValueAtTime(35, now + 0.3);
  gain.gain.setValueAtTime(0.18, now);
  gain.gain.exponentialRampToValueAtTime(0.001, now + 0.3);
  osc.connect(gain); gain.connect(actx.destination);
  osc.start(now); osc.stop(now + 0.3);
  sndImpact(3);
}

// --- Ship Graphics ---
// Top-down silhouettes drawn horizontally, bow pointing right.
// viewBox is len*100 wide and 100 high, so one cell = 100 units.
function shipSVG(type, color) {
  const W = SHIPS[type].len * 100;
  const dark = 'rgba(0,0,0,.26)', light = 'rgba(255,255,255,.92)', soft = 'rgba(255,255,255,.35)';
  const turret = (x, dir=1) => `<line x1="${x}" y1="50" x2="${x + dir*28}" y2="50" stroke="${dark}" stroke-width="6" stroke-linecap="round"/><circle cx="${x}" cy="50" r="13" fill="${dark}"/>`;
  const bridge = (x, w) => `<rect x="${x}" y="35" width="${w}" height="30" rx="7" fill="${light}"/><rect x="${x + w - 14}" y="41" width="6" height="18" rx="3" fill="${dark}"/>`;
  const funnel = x => `<circle cx="${x}" cy="50" r="10" fill="${dark}"/><circle cx="${x}" cy="50" r="4.5" fill="rgba(0,0,0,.3)"/>`;
  let body = '';

  if(type === 'submarine') {
    body = `<rect x="10" y="30" width="${W-20}" height="40" rx="20" fill="${color}"/>
      <rect x="18" y="37" width="${W-36}" height="12" rx="6" fill="rgba(255,255,255,.14)"/>
      <line x1="38" y1="50" x2="${W/2-46}" y2="50" stroke="${soft}" stroke-width="3" stroke-dasharray="1 12" stroke-linecap="round"/>
      <line x1="${W/2+46}" y1="50" x2="${W-38}" y2="50" stroke="${soft}" stroke-width="3" stroke-dasharray="1 12" stroke-linecap="round"/>
      <rect x="${W/2-30}" y="39" width="60" height="22" rx="11" fill="${dark}"/>
      <circle cx="${W/2+12}" cy="50" r="4" fill="${light}"/>`;
  } else {
    body = `<path d="M18 22 H${W-80} C${W-36} 22 ${W-10} 38 ${W-4} 50 C${W-10} 62 ${W-36} 78 ${W-80} 78 H18 Q8 78 8 68 V32 Q8 22 18 22 Z" fill="${color}"/>
      <path d="M22 30 H${W-84} C${W-50} 30 ${W-30} 40 ${W-22} 50 H22 Z" fill="rgba(255,255,255,.14)"/>`;
    if(type === 'carrier') {
      body += `<line x1="36" y1="50" x2="${W-100}" y2="50" stroke="${light}" stroke-width="3" stroke-dasharray="18 14" stroke-linecap="round"/>
        <line x1="36" y1="36" x2="${W-120}" y2="36" stroke="${soft}" stroke-width="2"/>
        <line x1="36" y1="64" x2="${W-120}" y2="64" stroke="${soft}" stroke-width="2"/>
        <rect x="${W*0.56}" y="14" width="64" height="18" rx="5" fill="${dark}"/>
        <rect x="${W*0.56+8}" y="18" width="20" height="10" rx="3" fill="${light}"/>
        <path d="M70 66 l14 -8 l14 8 l-14 -3 Z M130 66 l14 -8 l14 8 l-14 -3 Z" fill="${light}"/>`;
    }
    if(type === 'battleship') body += turret(70, -1) + bridge(140, 70) + funnel(240) + turret(285) + turret(335);
    if(type === 'cruiser')    body += turret(60, -1) + bridge(100, 58) + funnel(185) + turret(232);
    if(type === 'destroyer')  body += bridge(36, 50) + turret(124);
  }
  return `<svg viewBox="0 0 ${W} 100" xmlns="http://www.w3.org/2000/svg">${body}</svg>`;
}

const HIT_SVG = `<svg viewBox="0 0 40 40"><path d="M20 2 L24 13 L35 8 L29 18 L38 23 L27 25 L30 37 L20 29 L10 37 L13 25 L2 23 L11 18 L5 8 L16 13 Z" fill="#dc2626"/><circle cx="20" cy="21" r="6" fill="#fbbf24"/></svg>`;

// --- Board Geometry ---
const key = (r, c) => `${r},${c}`;
const coord = (r, c) => `${LETTERS[c]}${r+1}`;
const shipName = s => SHIPS[s.type].name;

function cellsOf(s) {
  const out = [];
  for(let i=0; i<SHIPS[s.type].len; i++) out.push(s.v ? [s.r+i, s.c] : [s.r, s.c+i]);
  return out;
}

// Ships never overlap. Unless G.touch is on, they may not touch either, not even diagonally
function canPlace(fleet, type, r, c, v) {
  const len = SHIPS[type].len, N = G.size, reach = G.touch ? 0 : 1;
  if(r < 0 || c < 0 || (v ? r+len > N : c+len > N)) return false;
  const blocked = new Set();
  fleet.forEach(s => {
    if(s.r === null) return;
    cellsOf(s).forEach(([a,b]) => {
      for(let dr=-reach; dr<=reach; dr++) for(let dc=-reach; dc<=reach; dc++) blocked.add(key(a+dr, b+dc));
    });
  });
  return cellsOf({type, r, c, v}).every(([a,b]) => !blocked.has(key(a,b)));
}

function randomFleet(p) {
  const N = G.size, rand = () => Math.floor(Math.random() * N);
  for(let attempt=0; attempt<100; attempt++) {
    const fleet = G.fleets[p].map(s => ({type: s.type, r: null, c: null, v: false}));
    const ok = fleet.every(s => {
      for(let t=0; t<300; t++) {
        const v = Math.random() < 0.5, r = rand(), c = rand();
        if(canPlace(fleet, s.type, r, c, v)) { s.r = r; s.c = c; s.v = v; return true; }
      }
      return false;
    });
    if(ok) { G.fleets[p] = fleet; return; }
  }
}

function shipAt(fleet, r, c) {
  return fleet.find(s => s.r !== null && cellsOf(s).some(([a,b]) => a === r && b === c));
}
function hitsOn(owner, s) {
  return cellsOf(s).filter(([a,b]) => G.shots[1-owner][key(a,b)] === 'hit').length;
}
const isSunk = (owner, s) => hitsOn(owner, s) === SHIPS[s.type].len;
const afloat = owner => G.fleets[owner].filter(s => !isSunk(owner, s)).length;

// --- Rendering Helpers ---
function buildGrid(boardEl) {
  const N = G.size;
  boardEl.innerHTML = '';
  const grid = document.createElement('div');
  grid.className = 'grid';
  grid.style.gridTemplateColumns = `repeat(${N},1fr)`;
  grid.style.gridTemplateRows = `repeat(${N},1fr)`;
  for(let r=0; r<N; r++) {
    for(let c=0; c<N; c++) {
      const cell = document.createElement('div');
      cell.className = 'cell';
      cell.dataset.r = r; cell.dataset.c = c;
      grid.appendChild(cell);
    }
  }
  boardEl.appendChild(grid);
  return grid;
}

function shipEl(s, color, extra='') {
  const N = G.size, len = SHIPS[s.type].len;
  const el = document.createElement('div');
  el.className = `ship ${extra}`;
  el.style.left = `${s.c / N * 100}%`;
  el.style.top = `${s.r / N * 100}%`;
  el.style.width = `${len / N * 100}%`;
  el.style.height = `${100 / N}%`;
  if(s.v) {
    // Rotate around the centre of the first cell so the ship runs downward
    el.style.transformOrigin = `${50 / len}% 50%`;
    el.style.transform = 'rotate(90deg)';
  }
  el.innerHTML = shipSVG(s.type, color);
  return el;
}

function addMarker(grid, r, c, type) {
  const cell = grid.children[r * G.size + c];
  const mk = document.createElement('div');
  mk.className = `mk mk-${type}${key(r,c) === lastShot ? ' new' : ''}`;
  if(type === 'hit') mk.innerHTML = HIT_SVG;
  cell.appendChild(mk);
  cell.classList.add('shot');
}

function buildLabels() {
  const N = G.size;
  document.getElementById('main-cols').innerHTML = [...LETTERS.slice(0, N)].map(l => `<span>${l}</span>`).join('');
  document.getElementById('main-rows').innerHTML = Array.from({length: N}, (_, i) => `<span>${i+1}</span>`).join('');
}

function miniShip(type, color, unit) {
  return shipSVG(type, color).replace('<svg ', `<svg style="width:${SHIPS[type].len * unit}px" `);
}

// --- Game Logic ---
function newGame(names, size, rule, touch) {
  G = {
    names,
    size,
    rule,
    touch,
    phase: 'place',
    turn: 0,
    round: 1,
    fleets: names.map(() => FLEETS[size].map(type => ({type, r: null, c: null, v: false}))),
    shots: [{}, {}],          // shots[p] = cells player p fired at: 'hit' | 'miss' | 'clear'
    stats: [{shots: 0, hits: 0}, {shots: 0, hits: 0}],
    news: [[], []],           // what happened to player p since their last turn
    passing: true,
    endPending: false
  };
  saveState();
  showPass();
}

function render() {
  updateUI();
  if(G.phase === 'place') renderPlace();
  else renderBattle();
}

function updateUI() {
  const hPlayer = document.getElementById('h-player');
  hPlayer.textContent = G.names[G.turn];
  hPlayer.style.color = COLORS[G.turn];
  document.getElementById('h-round').textContent = G.phase === 'place' ? 'Placing fleet' : `Round ${G.round}`;

  const strip = document.getElementById('score-strip');
  strip.innerHTML = '';
  G.names.forEach((name, i) => {
    const el = document.createElement('div');
    el.className = `p-score ${i === G.turn ? 'active' : ''}`;
    if(i === G.turn) el.style.borderColor = COLORS[i];
    el.innerHTML = `
      <div style="display:flex;align-items:center;min-width:0;flex:1">
        <div class="p-dot" style="background:${COLORS[i]}"></div>
        <span class="p-name">${name}</span>
      </div>
      <span class="p-val" style="color:${COLORS[i]}">${afloat(i)}<small>/${G.fleets[i].length}</small></span>
    `;
    strip.appendChild(el);
  });
}

let notifTimer;
function showNotif(msg, color) {
  clearTimeout(notifTimer);
  const notifEl = document.getElementById('notif');
  document.getElementById('n-dot').style.background = color || 'transparent';
  document.getElementById('n-dot').style.display = color ? 'block' : 'none';
  document.getElementById('n-txt').textContent = msg;
  notifEl.classList.add('on');
  notifTimer = setTimeout(() => notifEl.classList.remove('on'), 1800);
}

function shake(el) {
  el.classList.remove('shake');
  void el.offsetWidth;
  el.classList.add('shake');
}

// --- Hand-off ---
function showPass() {
  document.getElementById('own-sec').classList.remove('peek');
  const p = G.turn, o = 1 - p;
  const nameEl = document.getElementById('pass-name');
  nameEl.textContent = G.names[p];
  nameEl.style.color = COLORS[p];
  document.getElementById('pass-sub').textContent = G.phase === 'place'
    ? `Place your fleet. ${G.names[o]}, no peeking!`
    : `Your turn to fire. ${G.names[o]}, look away!`;
  document.getElementById('pass-news').innerHTML = G.news[p].join('<br>');
  document.getElementById('pass').classList.add('on');
}

document.getElementById('pass-btn').addEventListener('click', () => {
  initAudio();
  sndClick();
  G.passing = false;
  G.news[G.turn] = [];
  saveState();
  sel = G.fleets[G.turn].findIndex(s => s.r === null);
  if(sel < 0) sel = null;
  vert = false; hover = null; lastShot = null; locked = false;
  render();
  document.getElementById('pass').classList.remove('on');
});

// --- Placement Phase ---
function renderPlace() {
  const p = G.turn, fleet = G.fleets[p];
  document.getElementById('main-lbl').innerHTML = `<div class="ndot" style="background:${COLORS[p]}"></div>Place your fleet`;
  document.getElementById('main-wrap').classList.add('placing');
  document.getElementById('place-ctrl').style.display = 'flex';
  document.getElementById('own-sec').style.display = 'none';
  buildLabels();

  const boardEl = document.getElementById('main-board');
  boardEl.className = 'board';
  const grid = buildGrid(boardEl);
  fleet.forEach(s => { if(s.r !== null) grid.appendChild(shipEl(s, COLORS[p])); });

  [...grid.children].forEach(cell => {
    const r = +cell.dataset.r, c = +cell.dataset.c;
    cell.addEventListener('click', () => placeTap(r, c));
    cell.addEventListener('mouseenter', () => { hover = [r, c]; drawGhost(); });
  });
  grid.addEventListener('mouseleave', () => { hover = null; drawGhost(); });
  drawGhost();

  // Ship chips
  const chips = document.getElementById('chips');
  chips.innerHTML = '';
  fleet.forEach((s, i) => {
    const b = document.createElement('button');
    b.className = `chip${i === sel ? ' on' : ''}${s.r !== null ? ' placed' : ''}`;
    b.innerHTML = `${miniShip(s.type, COLORS[p], 12)}<span>${shipName(s)}</span>`;
    b.addEventListener('click', () => {
      initAudio();
      if(s.r !== null) { vert = s.v; s.r = s.c = null; saveState(); }
      sel = i;
      sndClick();
      renderPlace();
    });
    chips.appendChild(b);
  });

  document.getElementById('btn-done').disabled = fleet.some(s => s.r === null);
}

// Clamp the origin so a tap near the edge still fits the ship on the board
function placeOrigin(r, c) {
  const len = SHIPS[G.fleets[G.turn][sel].type].len;
  return vert ? [Math.min(r, G.size - len), c] : [r, Math.min(c, G.size - len)];
}

function drawGhost() {
  const grid = document.querySelector('#main-board .grid');
  if(!grid) return;
  grid.querySelectorAll('.ghost').forEach(g => g.remove());
  if(sel === null || !hover || !canHover || G.phase !== 'place') return;
  const fleet = G.fleets[G.turn], s = fleet[sel];
  const [r, c] = placeOrigin(...hover);
  const ok = canPlace(fleet, s.type, r, c, vert);
  grid.appendChild(shipEl({type: s.type, r, c, v: vert}, COLORS[G.turn], `ghost${ok ? '' : ' bad'}`));
}

function placeTap(r, c) {
  initAudio();
  const fleet = G.fleets[G.turn];

  // Tapping a placed ship picks it back up
  const picked = shipAt(fleet, r, c);
  if(picked) {
    sel = fleet.indexOf(picked);
    vert = picked.v;
    picked.r = picked.c = null;
    sndClick();
    saveState();
    renderPlace();
    return;
  }
  if(sel === null) return;

  const s = fleet[sel];
  const [pr, pc] = placeOrigin(r, c);
  if(!canPlace(fleet, s.type, pr, pc, vert)) {
    sndError();
    shake(document.getElementById('main-board'));
    showNotif(G.touch ? "Ships can't overlap" : "Ships can't overlap or touch");
    return;
  }
  s.r = pr; s.c = pc; s.v = vert;
  sel = fleet.findIndex(x => x.r === null);
  if(sel < 0) sel = null;
  sndClick();
  saveState();
  renderPlace();
}

document.getElementById('btn-rotate').addEventListener('click', () => {
  initAudio();
  if(sel === null) { showNotif('Tap a ship to pick it up'); return; }
  vert = !vert;
  sndClick();
  drawGhost();
});

document.getElementById('btn-random').addEventListener('click', () => {
  initAudio();
  randomFleet(G.turn);
  sel = null;
  sndImpact(1);
  saveState();
  renderPlace();
});

document.getElementById('btn-done').addEventListener('click', () => {
  if(G.fleets[G.turn].some(s => s.r === null)) return;
  sndScore();
  if(G.turn === 0) {
    G.turn = 1;
  } else {
    G.phase = 'battle';
    G.turn = 0;
  }
  G.passing = true;
  saveState();
  showPass();
});

// --- Battle Phase ---
function renderBattle() {
  const p = G.turn, o = 1 - p;
  document.getElementById('main-lbl').innerHTML = `<div class="ndot" style="background:${COLORS[o]}"></div>${G.names[o]}'s waters`;
  document.getElementById('main-wrap').classList.remove('placing');
  document.getElementById('place-ctrl').style.display = 'none';
  document.getElementById('own-sec').style.display = 'flex';
  buildLabels();

  // Target board: my shots on the opponent, plus their sunk ships
  const boardEl = document.getElementById('main-board');
  boardEl.className = `board target${locked ? ' locked' : ''}`;
  const grid = buildGrid(boardEl);
  G.fleets[o].forEach(s => { if(isSunk(o, s)) grid.appendChild(shipEl(s, COLORS[o], 'sunk')); });
  Object.entries(G.shots[p]).forEach(([k, type]) => addMarker(grid, ...k.split(',').map(Number), type));
  [...grid.children].forEach(cell => {
    if(cell.classList.contains('cell')) cell.addEventListener('click', () => fire(+cell.dataset.r, +cell.dataset.c));
  });

  // Own board: my fleet and the opponent's shots on it
  const ownGrid = buildGrid(document.getElementById('own-board'));
  G.fleets[p].forEach(s => ownGrid.appendChild(shipEl(s, COLORS[p])));
  Object.entries(G.shots[o]).forEach(([k, type]) => { if(type !== 'clear') addMarker(ownGrid, ...k.split(',').map(Number), type); });

  const list = document.getElementById('fleet-list');
  list.innerHTML = G.fleets[p].map(s => `
    <div class="fl-row${isSunk(p, s) ? ' sunk' : ''}">
      ${miniShip(s.type, COLORS[p], 11)}
      <span class="fl-name">${shipName(s)}</span>
      <span class="fl-hits">${hitsOn(p, s)}/${SHIPS[s.type].len}</span>
    </div>
  `).join('');
}

// --- Hold to peek at your own fleet ---
// Your fleet stays covered during battle so the other player can't glance at the phone.
const ownSec = document.getElementById('own-sec');
const peekCover = document.getElementById('peek-cover');
const setPeek = on => ownSec.classList.toggle('peek', on);
peekCover.addEventListener('pointerdown', e => {
  e.preventDefault();
  peekCover.setPointerCapture?.(e.pointerId);
  setPeek(true);
});
['pointerup', 'pointercancel', 'lostpointercapture'].forEach(ev => peekCover.addEventListener(ev, () => setPeek(false)));
peekCover.addEventListener('contextmenu', e => e.preventDefault());
peekCover.addEventListener('keydown', e => { if(e.key === ' ' || e.key === 'Enter') { e.preventDefault(); setPeek(true); } });
peekCover.addEventListener('keyup', () => setPeek(false));
peekCover.addEventListener('blur', () => setPeek(false));
window.addEventListener('blur', () => setPeek(false));

function fire(r, c) {
  if(locked || G.passing || G.phase !== 'battle') return;
  const p = G.turn, o = 1 - p, k = key(r, c);
  if(G.shots[p][k]) return;
  initAudio();
  locked = true;
  lastShot = k;
  G.stats[p].shots++;

  const ship = shipAt(G.fleets[o], r, c);
  let msg, sunk = false;
  if(!ship) {
    G.shots[p][k] = 'miss';
    G.news[o].push(`${G.names[p]} fired at ${coord(r,c)}: miss`);
    msg = `${coord(r,c)}: Miss`;
    sndSplash();
  } else {
    G.shots[p][k] = 'hit';
    G.stats[p].hits++;
    sndBoom();
    if(isSunk(o, ship)) {
      sunk = true;
      // When ships can't touch, the water around a sunk ship is known to be empty
      if(!G.touch) cellsOf(ship).forEach(([a,b]) => {
        for(let dr=-1; dr<=1; dr++) for(let dc=-1; dc<=1; dc++) {
          const nr = a+dr, nc = b+dc;
          if(nr >= 0 && nc >= 0 && nr < G.size && nc < G.size && !G.shots[p][key(nr,nc)]) G.shots[p][key(nr,nc)] = 'clear';
        }
      });
      G.news[o].push(`${G.names[p]} sank your ${shipName(ship)} at ${coord(r,c)}`);
      msg = `Sunk their ${shipName(ship)}!`;
    } else {
      G.news[o].push(`${G.names[p]} hit your ${shipName(ship)} at ${coord(r,c)}`);
      msg = `${coord(r,c)}: Hit!`;
    }
  }

  const won = afloat(o) === 0;
  const keepTurn = ship && G.rule === 'again' && !won;
  if(won) G.phase = 'over';
  else if(!keepTurn) G.endPending = true;
  saveState();

  render();
  if(ship) shake(document.getElementById('main-board'));
  if(sunk) setTimeout(() => sndScore(), 250);

  if(won) {
    showNotif(msg, COLORS[p]);
    setTimeout(() => { sndWin(); showGameOver(); }, 1400);
  } else if(keepTurn) {
    showNotif(`${msg} Fire again`, COLORS[p]);
    setTimeout(() => { locked = false; document.getElementById('main-board').classList.remove('locked'); }, 450);
  } else {
    showNotif(msg, COLORS[p]);
    setTimeout(endTurn, 1500);
  }
}

function endTurn() {
  G.endPending = false;
  G.turn = 1 - G.turn;
  if(G.turn === 0) G.round++;
  G.passing = true;
  locked = false;
  saveState();
  showPass();
}

// --- Game Over ---
function showGameOver() {
  const winner = G.fleets.findIndex((_, i) => afloat(1 - i) === 0);
  const order = [winner, 1 - winner];
  const card = document.getElementById('over-card');
  card.innerHTML = order.map((i, rank) => `
    <div class="over-row${rank === 0 ? ' win' : ''}">
      <span class="over-med">${rank === 0 ? '🥇' : '🥈'}</span>
      <div class="over-dot" style="background:${COLORS[i]}"></div>
      <span class="over-name">${G.names[i]}</span>
      <span class="over-score">${G.stats[i].hits}/${G.stats[i].shots} hits</span>
    </div>
  `).join('');
  document.getElementById('over').classList.add('on');
}

// --- Setup & Init ---
let curSize = 10;
let curRule = 'again';
let curTouch = false;
document.querySelectorAll('#grid-btns .cnt').forEach(b => {
  b.addEventListener('click', () => {
    document.querySelectorAll('#grid-btns .cnt').forEach(x => x.classList.remove('on'));
    b.classList.add('on');
    curSize = +b.dataset.s;
  });
});
document.querySelectorAll('#rule-btns .cnt').forEach(b => {
  b.addEventListener('click', () => {
    document.querySelectorAll('#rule-btns .cnt').forEach(x => x.classList.remove('on'));
    b.classList.add('on');
    curRule = b.dataset.r;
  });
});
document.querySelectorAll('#touch-btns .cnt').forEach(b => {
  b.addEventListener('click', () => {
    document.querySelectorAll('#touch-btns .cnt').forEach(x => x.classList.remove('on'));
    b.classList.add('on');
    curTouch = b.dataset.t === 'yes';
  });
});

function buildSetup() {
  const globalPlayers = JSON.parse(localStorage.getItem('mkers_players') || '[]');
  const nlist = document.getElementById('name-list');
  nlist.innerHTML = '';
  for(let i=0; i<2; i++) {
    const row = document.createElement('div'); row.className = 'nrow';
    const dot = document.createElement('div'); dot.className = 'ndot'; dot.style.background = COLORS[i];
    const inp = document.createElement('input'); inp.className = 'ninp';
    inp.type = 'text';
    inp.value = globalPlayers[i] || DEFAULTS[i];
    inp.placeholder = DEFAULTS[i];
    row.appendChild(dot); row.appendChild(inp);
    nlist.appendChild(row);
  }
}

document.getElementById('start-btn').addEventListener('click', () => {
  const inputs = document.querySelectorAll('.ninp');
  const names = [...inputs].map((inp, i) => inp.value.trim() || DEFAULTS[i]);

  const globalPlayers = JSON.parse(localStorage.getItem('mkers_players') || '[]');
  for(let i=0; i<names.length; i++) globalPlayers[i] = names[i];
  localStorage.setItem('mkers_players', JSON.stringify(globalPlayers));

  initAudio();
  sndClick();
  document.getElementById('setup').style.display = 'none';
  document.getElementById('app').style.display = 'flex';
  newGame(names, curSize, curRule, curTouch);
});

document.getElementById('btn-restart').addEventListener('click', () => {
  localStorage.removeItem('battleships_state');
  location.reload();
});
document.getElementById('btn-play-again').addEventListener('click', () => {
  localStorage.removeItem('battleships_state');
  location.reload();
});

function initApp() {
  const saved = localStorage.getItem('battleships_state');
  if(saved) {
    try {
      G = JSON.parse(saved);
      document.getElementById('setup').style.display = 'none';
      document.getElementById('app').style.display = 'flex';
      if(G.phase === 'over') {
        render();
        showGameOver();
      } else if(G.endPending) {
        endTurn();
      } else {
        // Always hide the boards after a reload, someone else might be holding the phone
        G.passing = true;
        showPass();
      }
    } catch(e) {
      buildSetup();
    }
  } else {
    buildSetup();
  }
}

initApp();
