// --- Data & State ---
const COLORS = ['#d97706','#2563eb']; // White player, Black player
const DEFAULTS = ['Player 1','Player 2'];
const SIDES = ['w','b'];
const FILES = 'abcdefgh';
const VALUES = {P:1, N:3, B:3, R:5, Q:9, K:0};
const START = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR';

let G;
function saveState() {
  if(G) localStorage.setItem('chess_state', JSON.stringify(G));
}

// UI-only state (not saved)
let sel = null;     // selected square
let locked = false; // blocks input while the game-over delay runs
let promoMoves = null;

// --- Rules ---
// Board is 64 squares, index = row*8 + col, row 0 is rank 8 (black's back rank).
// Pieces are strings like 'wP' or 'bK', empty squares are null.
const opp = c => c === 'w' ? 'b' : 'w';
const on = (r, c) => r >= 0 && r < 8 && c >= 0 && c < 8;
const KNIGHT = [[1,2],[2,1],[2,-1],[1,-2],[-1,-2],[-2,-1],[-2,1],[-1,2]];
const KING   = [[1,0],[1,1],[0,1],[-1,1],[-1,0],[-1,-1],[0,-1],[1,-1]];
const ORTHO  = [[1,0],[-1,0],[0,1],[0,-1]];
const DIAG   = [[1,1],[1,-1],[-1,1],[-1,-1]];

function parseBoard(fen) {
  const b = [];
  for(const ch of fen.replace(/\//g, '')) {
    if(/\d/.test(ch)) for(let i=0; i<+ch; i++) b.push(null);
    else b.push((ch === ch.toUpperCase() ? 'w' : 'b') + ch.toUpperCase());
  }
  return b;
}

function startPos() {
  return {board: parseBoard(START), turn: 'w', castle: 'KQkq', ep: null, half: 0, full: 1};
}

function attacked(b, sq, by) {
  const r = sq >> 3, c = sq & 7;
  // A white pawn attacks upward (towards row 0), so it sits one row below the square
  const pr = by === 'w' ? r + 1 : r - 1;
  for(const dc of [-1, 1]) if(on(pr, c+dc) && b[pr*8 + c+dc] === by + 'P') return true;
  for(const [dr, dc] of KNIGHT) if(on(r+dr, c+dc) && b[(r+dr)*8 + c+dc] === by + 'N') return true;
  for(const [dr, dc] of KING) if(on(r+dr, c+dc) && b[(r+dr)*8 + c+dc] === by + 'K') return true;
  const slide = (dirs, types) => dirs.some(([dr, dc]) => {
    let nr = r + dr, nc = c + dc;
    while(on(nr, nc)) {
      const p = b[nr*8 + nc];
      if(p) return p[0] === by && types.includes(p[1]);
      nr += dr; nc += dc;
    }
    return false;
  });
  return slide(ORTHO, 'RQ') || slide(DIAG, 'BQ');
}

const kingSq = (b, color) => b.indexOf(color + 'K');
const inCheck = (S, color) => attacked(S.board, kingSq(S.board, color), opp(color));

function pseudoMoves(S) {
  const b = S.board, me = S.turn, them = opp(me), moves = [];
  const add = (from, to, extra={}) => {
    const p = b[from];
    if(p[1] === 'P' && (to >> 3 === 0 || to >> 3 === 7)) {
      for(const promo of 'QRBN') moves.push({from, to, promo, ...extra});
    } else moves.push({from, to, ...extra});
  };

  for(let sq=0; sq<64; sq++) {
    const p = b[sq];
    if(!p || p[0] !== me) continue;
    const r = sq >> 3, c = sq & 7, t = p[1];

    if(t === 'P') {
      const dir = me === 'w' ? -1 : 1, home = me === 'w' ? 6 : 1;
      if(on(r+dir, c) && !b[(r+dir)*8 + c]) {
        add(sq, (r+dir)*8 + c);
        if(r === home && !b[(r+2*dir)*8 + c]) add(sq, (r+2*dir)*8 + c);
      }
      for(const dc of [-1, 1]) {
        if(!on(r+dir, c+dc)) continue;
        const to = (r+dir)*8 + c+dc;
        if(b[to] && b[to][0] === them) add(sq, to);
        else if(to === S.ep) add(sq, to, {ep: true});
      }
    } else if(t === 'N' || t === 'K') {
      for(const [dr, dc] of t === 'N' ? KNIGHT : KING) {
        if(!on(r+dr, c+dc)) continue;
        const to = (r+dr)*8 + c+dc;
        if(!b[to] || b[to][0] === them) add(sq, to);
      }
    } else {
      const dirs = t === 'R' ? ORTHO : t === 'B' ? DIAG : [...ORTHO, ...DIAG];
      for(const [dr, dc] of dirs) {
        let nr = r + dr, nc = c + dc;
        while(on(nr, nc)) {
          const to = nr*8 + nc;
          if(b[to]) { if(b[to][0] === them) add(sq, to); break; }
          add(sq, to);
          nr += dr; nc += dc;
        }
      }
    }
  }

  // Castling: rights left, path empty, rook home, king not in, through or into check
  const castles = me === 'w'
    ? [['K', 60, 62, 63, [61,62], [60,61,62]], ['Q', 60, 58, 56, [59,58,57], [60,59,58]]]
    : [['k', 4, 6, 7, [5,6], [4,5,6]], ['q', 4, 2, 0, [3,2,1], [4,3,2]]];
  for(const [right, k, to, rook, empty, safe] of castles) {
    if(S.castle.includes(right) && b[k] === me + 'K' && b[rook] === me + 'R'
      && empty.every(s => !b[s]) && safe.every(s => !attacked(b, s, them))) {
      moves.push({from: k, to, castle: right});
    }
  }
  return moves;
}

const ROOK_HOP = {K: [63, 61], Q: [56, 59], k: [7, 5], q: [0, 3]};
const CORNER = {63: 'K', 56: 'Q', 7: 'k', 0: 'q'};

function applyMove(S, m) {
  const b = S.board.slice(), p = b[m.from], me = p[0];
  let captured = b[m.to];
  b[m.to] = m.promo ? me + m.promo : p;
  b[m.from] = null;
  if(m.ep) {
    const capSq = m.to + (me === 'w' ? 8 : -8);
    captured = b[capSq];
    b[capSq] = null;
  }
  if(m.castle) {
    const [rf, rt] = ROOK_HOP[m.castle];
    b[rt] = b[rf]; b[rf] = null;
  }
  let castle = S.castle;
  if(p[1] === 'K') castle = castle.replace(me === 'w' ? /[KQ]/g : /[kq]/g, '');
  for(const s of [m.from, m.to]) if(CORNER[s]) castle = castle.replace(CORNER[s], '');
  return {
    board: b,
    turn: opp(me),
    castle,
    ep: p[1] === 'P' && Math.abs(m.to - m.from) === 16 ? (m.from + m.to) / 2 : null,
    half: p[1] === 'P' || captured ? 0 : S.half + 1,
    full: S.full + (me === 'b' ? 1 : 0),
    captured
  };
}

function legalMoves(S) {
  return pseudoMoves(S).filter(m => !inCheck(applyMove(S, m), S.turn));
}

// Only count en passant in the key when it's actually playable
function posKey(S) {
  const ep = S.ep !== null && legalMoves(S).some(m => m.ep) ? S.ep : '-';
  return S.board.map(p => p || '-').join('') + S.turn + S.castle + ep;
}

function insufficient(b) {
  const pcs = b.map((p, i) => p && p[1] !== 'K' ? {p, i} : null).filter(Boolean);
  if(!pcs.length) return true;
  if(pcs.length === 1 && 'BN'.includes(pcs[0].p[1])) return true;
  // Only bishops left, all on the same square color
  const shade = i => ((i >> 3) + (i & 7)) % 2;
  return pcs.every(x => x.p[1] === 'B' && shade(x.i) === shade(pcs[0].i));
}

function material(b, color) {
  return b.reduce((a, p) => a + (p && p[0] === color ? VALUES[p[1]] : 0), 0);
}

// --- Piece Graphics ---
// Flat silhouettes on a 100x100 grid. Body shapes first, base on top.
const PIECE_BODY = {
  P: `<path d="M38 78 C40 64 44 54 46 47 H54 C56 54 60 64 62 78 Z"/><rect x="38" y="41" width="24" height="7" rx="3.5"/><circle cx="50" cy="30" r="12"/>`,
  R: `<path d="M33 78 L35 40 H65 L67 78 Z"/><path d="M28 20 H38 V28 H45 V20 H55 V28 H62 V20 H72 V40 H28 Z"/>`,
  B: `<path d="M38 78 L43 58 H57 L62 78 Z"/><path d="M50 18 C64 30 66 46 57 58 H43 C34 46 36 30 50 18 Z"/><circle cx="50" cy="13" r="5"/>`,
  N: `<path d="M32 78 C32 64 38 56 46 49 C40 50 33 53 27 51 C22 47 23 40 29 36 C37 30 43 23 47 17 L50 11 L56 18 C70 24 76 42 71 78 Z"/>`,
  Q: `<path d="M30 70 L22 32 L38 52 L50 24 L62 52 L78 32 L70 70 Z"/><circle cx="22" cy="30" r="5"/><circle cx="50" cy="20" r="5"/><circle cx="78" cy="30" r="5"/><rect x="30" y="68" width="40" height="10" rx="3"/>`,
  K: `<rect x="46" y="9" width="8" height="26" rx="2"/><rect x="39" y="16" width="22" height="8" rx="2"/><path d="M30 70 C22 52 30 40 50 42 C70 40 78 52 70 70 Z"/><rect x="30" y="68" width="40" height="10" rx="3"/>`
};
const PIECE_DETAIL = {
  P: '',
  R: `<line x1="36" y1="47" x2="64" y2="47"/>`,
  B: `<path d="M56 32 L47 43"/>`,
  N: `<circle cx="46" cy="29" r="1.5"/><path d="M58 23 C66 34 68 52 66 68"/>`,
  Q: `<line x1="34" y1="62" x2="66" y2="62"/>`,
  K: `<line x1="34" y1="58" x2="66" y2="58"/>`
};

function pieceSVG(p) {
  const white = p[0] === 'w';
  const fill = white ? '#faf9f6' : '#232326';
  const detail = white ? '#111' : 'rgba(255,255,255,.55)';
  return `<svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">
    <g fill="${fill}" stroke="#111" stroke-width="3" stroke-linejoin="round">${PIECE_BODY[p[1]]}<rect x="22" y="78" width="56" height="10" rx="4"/></g>
    <g fill="none" stroke="${detail}" stroke-width="3" stroke-linecap="round">${PIECE_DETAIL[p[1]]}</g>
  </svg>`;
}

// --- Audio (game specific) ---
// Shared sounds (sndClick, sndScore, sndWin, sndError) come from audio.js
function sndMove() {
  if(!actx) return;
  const osc = actx.createOscillator(), gain = actx.createGain(), now = actx.currentTime;
  osc.frequency.setValueAtTime(320, now);
  osc.frequency.exponentialRampToValueAtTime(140, now + 0.06);
  gain.gain.setValueAtTime(0.12, now);
  gain.gain.exponentialRampToValueAtTime(0.001, now + 0.07);
  osc.connect(gain); gain.connect(actx.destination);
  osc.start(now); osc.stop(now + 0.07);
}
function sndCheck() {
  if(!actx) return;
  [660, 880].forEach((f, i) => {
    const osc = actx.createOscillator(), gain = actx.createGain(), t = actx.currentTime + i*0.09;
    osc.frequency.value = f;
    gain.gain.setValueAtTime(0, t);
    gain.gain.linearRampToValueAtTime(0.05, t + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.12);
    osc.connect(gain); gain.connect(actx.destination);
    osc.start(t); osc.stop(t + 0.12);
  });
}

// --- Game Logic ---
function newGame(names, layout) {
  G = {
    names,
    layout,                 // 'f2f' (phone flat between players) or 'side' (both behind one screen)
    pos: startPos(),
    last: null,
    caps: {w: [], b: []},   // piece types captured BY each side
    hist: [],
    over: null,
    undo: []
  };
  G.hist.push(posKey(G.pos));
  saveState();
  applyLayout();
  render();
}

// Face to face turns Black's pieces, panel and pickers toward the player across the table
function applyLayout() {
  document.body.classList.toggle('f2f', G.layout === 'f2f');
}

function snapshot() {
  return JSON.stringify({pos: G.pos, last: G.last, caps: G.caps, hist: G.hist});
}

function makeMove(m) {
  const me = G.pos.turn;
  G.undo.push(snapshot());
  if(G.undo.length > 30) G.undo.shift();

  const next = applyMove(G.pos, m);
  const captured = next.captured;
  delete next.captured;
  if(captured) G.caps[me].push(captured[1]);
  G.pos = next;
  G.last = {from: m.from, to: m.to};
  G.hist.push(posKey(next));
  sel = null;

  const anim = [[m.from, m.to]];
  if(m.castle) anim.push(ROOK_HOP[m.castle]);

  checkEnd();
  saveState();
  render(anim);

  const check = inCheck(G.pos, G.pos.turn);
  if(captured) sndScore(); else sndMove();
  if(check && !G.over) {
    sndCheck();
    flashStatus(G.pos.turn);
    // The top bar would be upside down for one player face to face, so the panels carry it there
    if(G.layout !== 'f2f') showNotif(`Check! ${G.names[SIDES.indexOf(G.pos.turn)]} to move`, COLORS[SIDES.indexOf(G.pos.turn)]);
  }

  if(G.over) {
    locked = true;
    setTimeout(() => { if(G.over.winner) sndWin(); showGameOver(); locked = false; }, 1200);
  }
}

function checkEnd() {
  const S = G.pos, me = opp(S.turn);
  if(!legalMoves(S).length) {
    G.over = inCheck(S, S.turn) ? {type: 'mate', winner: me} : {type: 'stalemate'};
  } else if(insufficient(S.board)) {
    G.over = {type: 'material'};
  } else if(S.half >= 100) {
    G.over = {type: 'fifty'};
  } else if(G.hist.filter(k => k === G.hist[G.hist.length - 1]).length >= 3) {
    G.over = {type: 'repetition'};
  }
}

function tap(sq) {
  if(locked || G.over) return;
  initAudio();
  const p = G.pos.board[sq], me = G.pos.turn;

  if(sel !== null) {
    const ms = legalMoves(G.pos).filter(m => m.from === sel && m.to === sq);
    if(ms.length > 1) { showPromo(ms); return; }
    if(ms.length === 1) { makeMove(ms[0]); return; }
  }
  if(p && p[0] === me) {
    sel = sel === sq ? null : sq;
    sndClick();
  } else if(p && sel === null) {
    sndError();
  } else {
    sel = null;
  }
  render();
}

// --- Rendering ---
function render(anim) {
  renderPanels();
  const S = G.pos, boardEl = document.getElementById('board');
  boardEl.innerHTML = '';
  const legal = sel !== null ? legalMoves(S).filter(m => m.from === sel) : [];
  const checkSq = inCheck(S, S.turn) ? kingSq(S.board, S.turn) : -1;

  for(let sq=0; sq<64; sq++) {
    const r = sq >> 3, c = sq & 7;
    const el = document.createElement('div');
    el.className = `sq ${(r + c) % 2 ? 'dark' : 'light'}`;
    if(G.last && (sq === G.last.from || sq === G.last.to)) el.classList.add('last');
    if(sq === sel) el.classList.add('sel');
    if(S.board[sq] && S.board[sq][0] === S.turn && !G.over) el.classList.add('mine');
    if(sq === checkSq) el.classList.add('check');
    const target = legal.find(m => m.to === sq);
    if(target) el.classList.add(S.board[sq] || target.ep ? 'cap' : 'move');
    if(c === 0) el.innerHTML += `<span class="lbl lbl-r">${8 - r}</span>`;
    if(r === 7) el.innerHTML += `<span class="lbl lbl-f">${FILES[c]}</span>`;
    el.addEventListener('click', () => tap(sq));
    boardEl.appendChild(el);
  }

  const layer = document.createElement('div');
  layer.className = 'pieces';
  S.board.forEach((p, sq) => {
    if(!p) return;
    const pc = document.createElement('div');
    pc.className = `pc ${p[0]}`;
    pc.style.left = `${(sq & 7) * 12.5}%`;
    pc.style.top = `${(sq >> 3) * 12.5}%`;
    pc.dataset.sq = sq;
    pc.innerHTML = pieceSVG(p);
    layer.appendChild(pc);
  });
  boardEl.appendChild(layer);

  // Slide moved pieces in from where they came from
  (anim || []).forEach(([from, to]) => {
    const pc = layer.querySelector(`[data-sq="${to}"]`);
    if(!pc) return;
    const dx = ((from & 7) - (to & 7)) * 100, dy = ((from >> 3) - (to >> 3)) * 100;
    pc.classList.add('moving');
    pc.animate([
      {transform: `translate(${dx}%,${dy}%)`},
      {transform: 'translate(0,0)'}
    ], {duration: 240, easing: 'cubic-bezier(.32,.72,0,1)'}).onfinish = () => pc.classList.remove('moving');
  });

  document.getElementById('btn-undo').style.opacity = G.undo.length && !G.over ? '' : '.3';
}

function renderPanels() {
  const S = G.pos, check = inCheck(S, S.turn);
  SIDES.forEach((side, i) => {
    const panel = document.getElementById(`panel-${i}`);
    const active = S.turn === side && !G.over;
    panel.classList.toggle('active', active);
    panel.style.borderColor = active ? COLORS[i] : 'transparent';

    let status = '';
    if(active) status = check ? `<span class="pn-status check">Check!</span>` : `<span class="pn-status" style="color:${COLORS[i]}">Your turn</span>`;

    const caps = [...G.caps[side]].sort((a, b) => VALUES[b] - VALUES[a]);
    const adv = material(S.board, side) - material(S.board, opp(side));
    panel.innerHTML = `
      <div class="pn-top">
        <div class="p-dot" style="background:${COLORS[i]}"></div>
        <span class="pn-name">${G.names[i]}</span>
        ${status}
      </div>
      <div class="pn-bot">
        <div class="caps">${caps.map(t => `<span>${pieceSVG(opp(side) + t)}</span>`).join('') || `<span class="pn-empty" style="width:auto">${side === 'w' ? 'White' : 'Black'}</span>`}</div>
        ${adv > 0 ? `<span class="adv">+${adv}</span>` : ''}
      </div>
    `;
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

function flashStatus(side) {
  const st = document.querySelector(`#panel-${SIDES.indexOf(side)} .pn-status`);
  if(st) st.classList.add('flash');
}

// --- Promotion ---
function showPromo(ms) {
  promoMoves = ms;
  const me = G.pos.turn;
  const row = document.getElementById('promo-row');
  row.innerHTML = '';
  'QRBN'.split('').forEach(t => {
    const b = document.createElement('button');
    b.innerHTML = pieceSVG(me + t).replace('<svg ', '<svg style="transform:none" ');
    b.addEventListener('click', e => {
      e.stopPropagation();
      document.getElementById('promo').classList.remove('on');
      makeMove(promoMoves.find(m => m.promo === t));
      promoMoves = null;
    });
    row.appendChild(b);
  });
  document.getElementById('promo-box').classList.toggle('flip', me === 'b');
  document.getElementById('promo').classList.add('on');
}

document.getElementById('promo').addEventListener('click', e => {
  if(e.target.id !== 'promo') return;
  document.getElementById('promo').classList.remove('on');
  promoMoves = null;
});

// --- Game Over ---
const DRAW_REASON = {
  stalemate: 'Stalemate',
  material: 'Insufficient material',
  fifty: '50-move rule',
  repetition: 'Threefold repetition'
};

function showGameOver() {
  const o = G.over, card = document.getElementById('over-card');
  let title, sub;
  if(o.type === 'mate') {
    const w = SIDES.indexOf(o.winner);
    title = 'Checkmate';
    sub = `${G.names[w]} wins`;
    card.innerHTML = [w, 1 - w].map((i, rank) => `
      <div class="over-row${rank === 0 ? ' win' : ''}">
        <span class="over-med">${rank === 0 ? '🥇' : '🥈'}</span>
        <div class="over-dot" style="background:${COLORS[i]}"></div>
        <span class="over-name">${G.names[i]}</span>
        <span class="over-score">${rank === 0 ? '1' : '0'}</span>
      </div>
    `).join('');
  } else {
    title = o.type === 'stalemate' ? 'Stalemate' : 'Draw';
    sub = DRAW_REASON[o.type];
    card.innerHTML = [0, 1].map(i => `
      <div class="over-row">
        <span class="over-med">🤝</span>
        <div class="over-dot" style="background:${COLORS[i]}"></div>
        <span class="over-name">${G.names[i]}</span>
        <span class="over-score">½</span>
      </div>
    `).join('');
  }
  document.getElementById('over-title').textContent = title;
  document.getElementById('over-title-top').textContent = title;
  document.getElementById('over-sub').textContent = sub;
  document.getElementById('over-sub-top').textContent = sub;
  document.getElementById('over').classList.add('on');
}

// --- Setup & Init ---
// Phones and tablets default to face to face, mouse screens to same side
let curLayout = window.matchMedia('(pointer: coarse)').matches ? 'f2f' : 'side';
const LAYOUT_HINT = {
  f2f: 'Lay the phone flat between you. White sits at the bottom, Black across the table.',
  side: 'Both players sit behind the screen. White plays from the bottom.'
};
function syncLayoutBtns() {
  document.querySelectorAll('#layout-btns .cnt').forEach(x => x.classList.toggle('on', x.dataset.l === curLayout));
  document.getElementById('layout-hint').textContent = LAYOUT_HINT[curLayout];
}
document.querySelectorAll('#layout-btns .cnt').forEach(b => {
  b.addEventListener('click', () => {
    curLayout = b.dataset.l;
    syncLayoutBtns();
  });
});

function buildSetup() {
  syncLayoutBtns();
  const globalPlayers = JSON.parse(localStorage.getItem('mkers_players') || '[]');
  const nlist = document.getElementById('name-list');
  nlist.innerHTML = '';
  for(let i=0; i<2; i++) {
    const row = document.createElement('div'); row.className = 'nrow';
    const dot = document.createElement('div'); dot.className = 'ndot'; dot.style.background = COLORS[i];
    const inp = document.createElement('input'); inp.className = 'ninp';
    inp.type = 'text';
    inp.value = globalPlayers[i] || DEFAULTS[i];
    inp.placeholder = i ? 'Black' : 'White';
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
  newGame(names, curLayout);
});

document.getElementById('btn-undo').addEventListener('click', () => {
  if(locked || G.over || !G.undo.length) return;
  initAudio();
  Object.assign(G, JSON.parse(G.undo.pop()));
  sel = null;
  sndClick();
  saveState();
  render();
});

document.getElementById('btn-restart').addEventListener('click', () => {
  localStorage.removeItem('chess_state');
  location.reload();
});
document.getElementById('btn-play-again').addEventListener('click', () => {
  localStorage.removeItem('chess_state');
  location.reload();
});

function initApp() {
  const saved = localStorage.getItem('chess_state');
  if(saved) {
    try {
      G = JSON.parse(saved);
      document.getElementById('setup').style.display = 'none';
      document.getElementById('app').style.display = 'flex';
      if(!G.layout) G.layout = curLayout;
      applyLayout();
      render();
      if(G.over) showGameOver();
    } catch(e) {
      buildSetup();
    }
  } else {
    buildSetup();
  }
}

initApp();
