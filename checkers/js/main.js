// --- Data & State ---
const COLORS = ['#d97706','#2563eb']; // Player 1 (bottom), Player 2 (top)
const DEFAULTS = ['Player 1','Player 2'];
const CROWN = `<svg viewBox="0 0 24 24"><path d="M3 18 L2 7 L7.5 11 L12 4 L16.5 11 L22 7 L21 18 Z" fill="rgba(255,255,255,.92)"/><rect x="3" y="19.2" width="18" height="2.2" rx="1.1" fill="rgba(255,255,255,.92)"/></svg>`;

let G;
function saveState() {
  if(G) localStorage.setItem('checkers_state', JSON.stringify(G));
}

// --- Rules Engine ---
// Player 0 starts at the bottom and moves up (towards row 0), player 1 moves down.
const RULES = {
  intl:    {size:10, rows:4, menBack:true,  flying:true,  maxCapture:true,  promoteEnds:false},
  english: {size:8,  rows:3, menBack:false, flying:false, maxCapture:false, promoteEnds:true}
};
const DIRS = [[-1,-1],[-1,1],[1,-1],[1,1]];
const fwd = p => p === 0 ? -1 : 1;
const promoRow = (p, N) => p === 0 ? 0 : N - 1;
const same = (a, b) => a && b && a[0] === b[0] && a[1] === b[1];

function initialBoard(rules) {
  const R = RULES[rules], N = R.size, b = [];
  let id = 0;
  for(let r=0; r<N; r++) {
    const row = [];
    for(let c=0; c<N; c++) {
      if((r + c) % 2 === 1 && r < R.rows) row.push({id: id++, p: 1, k: false});
      else if((r + c) % 2 === 1 && r >= N - R.rows) row.push({id: id++, p: 0, k: false});
      else row.push(null);
    }
    b.push(row);
  }
  return b;
}

// All complete capture sequences for the piece at (r0,c0).
// Captured pieces stay on the board until the move ends: they can't be jumped twice and they block.
function captureMoves(board, rules, r0, c0) {
  const R = RULES[rules], N = R.size, pc = board[r0][c0], out = [];
  const inside = (r, c) => r >= 0 && c >= 0 && r < N && c < N;
  const work = board.map(row => row.slice());
  work[r0][c0] = null;
  const enemy = (r, c) => work[r][c] && work[r][c].p !== pc.p;
  const taken = (caps, r, c) => caps.some(([a,b]) => a === r && b === c);

  function dfs(r, c, path, caps) {
    let extended = false;
    const dirs = pc.k || R.menBack ? DIRS : DIRS.filter(d => d[0] === fwd(pc.p));
    for(const [dr, dc] of dirs) {
      if(pc.k && R.flying) {
        let mr = r + dr, mc = c + dc;
        while(inside(mr, mc) && !work[mr][mc]) { mr += dr; mc += dc; }
        if(!inside(mr, mc) || !enemy(mr, mc) || taken(caps, mr, mc)) continue;
        let lr = mr + dr, lc = mc + dc;
        while(inside(lr, lc) && !work[lr][lc]) {
          extended = true;
          dfs(lr, lc, [...path, [lr, lc]], [...caps, [mr, mc]]);
          lr += dr; lc += dc;
        }
      } else {
        const mr = r + dr, mc = c + dc, lr = r + 2*dr, lc = c + 2*dc;
        if(!inside(lr, lc) || !enemy(mr, mc) || work[lr][lc] || taken(caps, mr, mc)) continue;
        extended = true;
        const np = [...path, [lr, lc]], nc = [...caps, [mr, mc]];
        // English: a man that reaches the far row is crowned and the move ends
        if(!pc.k && R.promoteEnds && lr === promoRow(pc.p, N)) out.push({from: [r0, c0], path: np, caps: nc});
        else dfs(lr, lc, np, nc);
      }
    }
    if(!extended && caps.length) out.push({from: [r0, c0], path, caps});
  }
  dfs(r0, c0, [], []);
  return out;
}

function simpleMoves(board, rules, r0, c0) {
  const R = RULES[rules], N = R.size, pc = board[r0][c0], out = [];
  const inside = (r, c) => r >= 0 && c >= 0 && r < N && c < N;
  const dirs = pc.k ? DIRS : DIRS.filter(d => d[0] === fwd(pc.p));
  for(const [dr, dc] of dirs) {
    let r = r0 + dr, c = c0 + dc;
    while(inside(r, c) && !board[r][c]) {
      out.push({from: [r0, c0], path: [[r, c]], caps: []});
      if(!(pc.k && R.flying)) break;
      r += dr; c += dc;
    }
  }
  return out;
}

// Capturing is mandatory. International: you must take the most pieces possible.
function legalMoves(board, rules, p) {
  const N = RULES[rules].size, caps = [], simple = [];
  for(let r=0; r<N; r++) for(let c=0; c<N; c++) {
    if(!board[r][c] || board[r][c].p !== p) continue;
    caps.push(...captureMoves(board, rules, r, c));
    simple.push(...simpleMoves(board, rules, r, c));
  }
  if(caps.length) {
    if(!RULES[rules].maxCapture) return caps;
    const max = Math.max(...caps.map(m => m.caps.length));
    return caps.filter(m => m.caps.length === max);
  }
  return simple;
}

// Promotion only counts where the move ends
function applyMove(board, rules, m) {
  const N = RULES[rules].size;
  const b = board.map(row => row.map(x => x && {...x}));
  const pc = b[m.from[0]][m.from[1]];
  b[m.from[0]][m.from[1]] = null;
  m.caps.forEach(([r, c]) => { b[r][c] = null; });
  const [r, c] = m.path[m.path.length - 1];
  if(!pc.k && r === promoRow(pc.p, N)) pc.k = true;
  b[r][c] = pc;
  return b;
}

const countPieces = (board, p) => board.flat().filter(x => x && x.p === p).length;

// --- UI State (not saved) ---
let LEGAL = [];     // legal moves for the player to move
let sel = null;     // [r,c] of the selected piece
let cands = [];     // legal moves still matching the squares tapped so far
let step = 0;       // how many landing squares of the move have been played
let busy = false;   // blocks input during animations
let pieceEls = {};  // piece id -> element, so pieces slide instead of re-rendering
let crowned = null; // id of a piece that was just crowned
const statusTimers = [null, null];

// --- Rendering ---
function buildBoard() {
  const N = RULES[G.rules].size;
  const boardEl = document.getElementById('board');
  boardEl.innerHTML = '';
  pieceEls = {};
  const bin = document.createElement('div');
  bin.className = 'bin';
  bin.style.gridTemplateColumns = `repeat(${N},1fr)`;
  bin.style.gridTemplateRows = `repeat(${N},1fr)`;
  for(let r=0; r<N; r++) {
    for(let c=0; c<N; c++) {
      const sq = document.createElement('div');
      sq.className = `sq ${(r + c) % 2 ? 'dk' : 'lt'}`;
      if((r + c) % 2) sq.addEventListener('click', () => tap(r, c));
      bin.appendChild(sq);
    }
  }
  const pcs = document.createElement('div');
  pcs.className = 'pcs';
  pcs.id = 'pcs';
  bin.appendChild(pcs);
  boardEl.appendChild(bin);
}

function render() {
  renderSquares();
  renderPieces();
  updatePanels();
}

function curPos() {
  return step === 0 ? sel : cands[0].path[step - 1];
}

function renderSquares() {
  const N = RULES[G.rules].size;
  const squares = document.querySelectorAll('#board .sq');
  squares.forEach(sq => sq.classList.remove('last', 'from', 'step', 'dest', 'can'));
  const at = ([r, c]) => squares[r * N + c];
  if(G.last && !sel) G.last.forEach(sq => at(sq).classList.add('last'));
  if(!sel && !G.over) LEGAL.forEach(m => at(m.from).classList.add('can'));
  if(sel) {
    at(sel).classList.add('from');
    cands.forEach(m => {
      if(step >= m.path.length) return; // move finished, about to commit
      at(m.path[step]).classList.add('step');
      at(m.path[m.path.length - 1]).classList.add('dest');
    });
  }
}

function renderPieces() {
  const N = RULES[G.rules].size;
  const layer = document.getElementById('pcs');
  const seen = new Set();
  const takenNow = sel && step > 0 ? cands[0].caps.slice(0, step) : [];
  for(let r=0; r<N; r++) for(let c=0; c<N; c++) {
    const pc = G.board[r][c];
    if(!pc) continue;
    seen.add(pc.id);
    let el = pieceEls[pc.id];
    if(!el) {
      el = document.createElement('div');
      el.innerHTML = `<div class="pc-in">${CROWN}</div>`;
      el.style.width = el.style.height = `${100 / N}%`;
      layer.appendChild(el);
      pieceEls[pc.id] = el;
    }
    const isSel = same(sel, [r, c]);
    const [pr, pcol] = isSel ? curPos() : [r, c];
    el.style.left = `${pcol / N * 100}%`;
    el.style.top = `${pr / N * 100}%`;
    el.className = `pc p${pc.p}${pc.k ? ' king' : ''}${isSel ? ' sel' : ''}${pc.id === crowned ? ' crowned' : ''}${takenNow.some(t => same(t, [r, c])) ? ' taken' : ''}`;
  }
  // Captured pieces shrink away
  Object.keys(pieceEls).forEach(id => {
    if(seen.has(+id)) return;
    const el = pieceEls[id];
    delete pieceEls[id];
    el.classList.add('gone');
    setTimeout(() => el.remove(), 320);
  });
}

function turnStatus(p) {
  if(G.over) return '';
  if(p !== G.turn) return 'Waiting…';
  if(LEGAL.length && LEGAL[0].caps.length) {
    const n = LEGAL[0].caps.length;
    return RULES[G.rules].maxCapture && n > 1 ? `Must capture ${n}!` : 'Must capture!';
  }
  return 'Your turn';
}

function updatePanels() {
  [0, 1].forEach(p => {
    const el = document.getElementById(`panel-${p}`);
    el.style.setProperty('--pc', COLORS[p]);
    el.classList.toggle('active', !G.over && p === G.turn);
    if(!el.firstChild) {
      el.innerHTML = `
        <div class="pp-dot"></div>
        <div class="pp-info">
          <span class="pp-name"></span>
          <span class="pp-status"></span>
        </div>
        <div class="pp-count"><span class="pp-val"></span><span class="pp-lbl">pieces</span></div>
      `;
    }
    el.querySelector('.pp-name').textContent = G.names[p];
    el.querySelector('.pp-val').textContent = countPieces(G.board, p);
    if(!statusTimers[p]) {
      const st = el.querySelector('.pp-status');
      st.textContent = turnStatus(p);
      st.classList.remove('warn');
    }
  });
}

// Messages go to the player's own panel, so they read the right way up
function flashStatus(p, msg) {
  const st = document.querySelector(`#panel-${p} .pp-status`);
  clearTimeout(statusTimers[p]);
  st.textContent = msg;
  st.classList.add('warn');
  st.classList.remove('flash');
  void st.offsetWidth;
  st.classList.add('flash');
  statusTimers[p] = setTimeout(() => {
    statusTimers[p] = null;
    updatePanels();
  }, 1800);
}

function pulseMustCapture() {
  const froms = new Set(LEGAL.map(m => m.from.join(',')));
  froms.forEach(f => {
    const [r, c] = f.split(',').map(Number);
    const el = pieceEls[G.board[r][c].id];
    el.classList.remove('must');
    void el.offsetWidth;
    el.classList.add('must');
    setTimeout(() => el.classList.remove('must'), 950);
  });
}

// --- Input ---
function deselect() {
  sel = null; cands = []; step = 0;
}

function tap(r, c) {
  if(G.over || busy) return;
  initAudio();
  if(sel && step > 0) { handleStep(r, c); return; }

  const pc = G.board[r][c];
  if(pc && pc.p === G.turn) {
    if(same(sel, [r, c])) { deselect(); render(); return; }
    const ms = LEGAL.filter(m => same(m.from, [r, c]));
    if(!ms.length) {
      sndError();
      if(LEGAL.length && LEGAL[0].caps.length) {
        flashStatus(G.turn, RULES[G.rules].maxCapture ? 'Take the most pieces!' : 'You must capture!');
        pulseMustCapture();
      } else {
        flashStatus(G.turn, "That piece can't move");
      }
      return;
    }
    sel = [r, c]; cands = ms; step = 0;
    sndClick();
    render();
    return;
  }
  if(sel) handleStep(r, c);
}

function handleStep(r, c) {
  // Tapping the next landing square plays one jump
  const next = cands.filter(m => same(m.path[step], [r, c]));
  if(next.length) { cands = next; advance(); return; }

  // Tapping a final square plays the whole move, if the route there is unambiguous
  const fin = cands.filter(m => same(m.path[m.path.length - 1], [r, c]));
  if(fin.length) {
    if(new Set(fin.map(m => JSON.stringify(m.path))).size === 1) { cands = [fin[0]]; playRest(); }
    else { sndError(); flashStatus(G.turn, 'Several routes, tap each jump'); }
    return;
  }

  if(step > 0) {
    // Mid-capture: tapping the moving piece undoes the jumps so far
    if(same(curPos(), [r, c])) { deselect(); sndClick(); render(); }
    else sndError();
    return;
  }
  deselect();
  render();
}

function stepSound() {
  if(cands[0].caps.length) sndScore(); else sndClick();
}

function advance() {
  step++;
  stepSound();
  render();
  const done = cands.find(m => m.path.length === step);
  if(done) { busy = true; setTimeout(() => commit(done), 260); return; }
  if(new Set(cands.map(m => JSON.stringify(m.path))).size === 1) playRest();
}

function playRest() {
  busy = true;
  const m = cands[0];
  const go = () => {
    step++;
    stepSound();
    render();
    if(step < m.path.length) setTimeout(go, 280);
    else setTimeout(() => commit(m), 260);
  };
  go();
}

function commit(m) {
  const pc = G.board[m.from[0]][m.from[1]];
  const wasKing = pc.k;
  G.board = applyMove(G.board, G.rules, m);
  const end = m.path[m.path.length - 1];
  crowned = !wasKing && G.board[end[0]][end[1]].k ? pc.id : null;
  G.last = [m.from, end];
  G.quiet = wasKing && !m.caps.length ? G.quiet + 1 : 0;
  G.turn = 1 - G.turn;
  if(G.turn === 0) G.move++;
  deselect();
  LEGAL = legalMoves(G.board, G.rules, G.turn);
  if(!LEGAL.length) { G.over = true; G.result = 1 - G.turn; }
  else if(G.quiet >= 50) { G.over = true; G.result = 'draw'; } // 25 king moves each without a capture
  saveState();
  render();
  if(crowned !== null) sndScore();
  busy = false;
  if(G.over) setTimeout(() => { sndWin(); showGameOver(); }, 700);
}

// --- Game Logic ---
function newGame(names, rules, layout) {
  G = {
    names,
    rules,
    layout,
    board: initialBoard(rules),
    turn: 0,
    move: 1,
    quiet: 0,
    last: null,
    over: false,
    result: null
  };
  saveState();
  startBoard();
}

function startBoard() {
  document.body.classList.toggle('f2f', G.layout === 'f2f');
  deselect();
  busy = false;
  LEGAL = legalMoves(G.board, G.rules, G.turn);
  buildBoard();
  render();
}

// --- Game Over ---
function showGameOver() {
  const draw = G.result === 'draw';
  const order = draw ? [0, 1] : [G.result, 1 - G.result];
  const html = `
    <h2 class="over-title">${draw ? 'Draw' : 'Game Over'}</h2>
    <div class="over-card">
      ${order.map((p, rank) => `
        <div class="over-row${!draw && rank === 0 ? ' win' : ''}">
          <span class="over-med">${draw ? '🤝' : rank === 0 ? '🥇' : '🥈'}</span>
          <div class="over-dot" style="background:${COLORS[p]}"></div>
          <span class="over-name">${G.names[p]}</span>
          <span class="over-score">${countPieces(G.board, p)} left</span>
        </div>
      `).join('')}
    </div>
  `;
  document.getElementById('over-top').innerHTML = html;
  document.getElementById('over-bot').innerHTML = html;
  document.getElementById('over').classList.add('on');
}

// --- Setup & Init ---
let curRules = 'intl';
// Phones and tablets usually lie flat between the players, PCs have both players on one side
let curLayout = window.matchMedia('(pointer: coarse)').matches ? 'f2f' : 'same';
document.querySelectorAll('#layout-btns .cnt').forEach(b => {
  b.classList.toggle('on', b.dataset.l === curLayout);
  b.addEventListener('click', () => {
    document.querySelectorAll('#layout-btns .cnt').forEach(x => x.classList.remove('on'));
    b.classList.add('on');
    curLayout = b.dataset.l;
  });
});
document.querySelectorAll('#rule-btns .cnt').forEach(b => {
  b.addEventListener('click', () => {
    document.querySelectorAll('#rule-btns .cnt').forEach(x => x.classList.remove('on'));
    b.classList.add('on');
    curRules = b.dataset.r;
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
  newGame(names, curRules, curLayout);
});

document.getElementById('btn-restart').addEventListener('click', () => {
  localStorage.removeItem('checkers_state');
  location.reload();
});
document.getElementById('btn-play-again').addEventListener('click', () => {
  localStorage.removeItem('checkers_state');
  location.reload();
});

function initApp() {
  const saved = localStorage.getItem('checkers_state');
  if(saved) {
    try {
      G = JSON.parse(saved);
      document.getElementById('setup').style.display = 'none';
      document.getElementById('app').style.display = 'flex';
      startBoard();
      if(G.over) showGameOver();
    } catch(e) {
      buildSetup();
    }
  } else {
    buildSetup();
  }
}

initApp();
