let G = {
  names: [],
  scores: [],
  turn: 0,
  board: [], // { id, symbol, flipped, matched }
  firstPick: null,
  locked: false,
  over: false
};

const COLORS = ['#d97706', '#2563eb', '#16a34a', '#dc2626'];
const SYMBOLS = ['🍎','🍌','🍉','🍇','🍓','🍒','🍍','🥝'];

function saveState() {
  if(G) localStorage.setItem('memory_state', JSON.stringify(G));
}



// --- Setup ---
function buildSetup(numPlayers) {
  const globalPlayers = JSON.parse(localStorage.getItem('mkers_players') || '[]');
  const nlist = document.getElementById('name-list');
  nlist.innerHTML = '';
  for(let i=0; i<numPlayers; i++) {
    const row = document.createElement('div'); row.className = 'nrow';
    const dot = document.createElement('div'); dot.className = 'ndot'; dot.style.background = COLORS[i];
    const inp = document.createElement('input'); inp.className = 'ninp';
    inp.type = 'text'; 
    inp.value = globalPlayers[i] || `Player ${i+1}`;
    inp.placeholder = `Player ${i+1}`;
    row.appendChild(dot); row.appendChild(inp);
    nlist.appendChild(row);
  }
}

document.querySelectorAll('.cnt').forEach(b => {
  b.addEventListener('click', () => {
    document.querySelectorAll('.cnt').forEach(x => x.classList.remove('on'));
    b.classList.add('on');
    buildSetup(+b.dataset.n);
  });
});

document.getElementById('start-btn').addEventListener('click', () => {
  const inputs = document.querySelectorAll('.ninp');
  const names = [...inputs].map((inp, i) => inp.value.trim() || `Player ${i+1}`);
  
  const globalPlayers = JSON.parse(localStorage.getItem('mkers_players') || '[]');
  for(let i=0; i<names.length; i++) globalPlayers[i] = names[i];
  localStorage.setItem('mkers_players', JSON.stringify(globalPlayers));

  initAudio();
  sndClick();
  document.getElementById('setup').style.display = 'none';
  document.getElementById('app').style.display = 'flex';
  newGame(names);
});

// --- Game Logic ---
function newGame(names) {
  const deck = [...SYMBOLS, ...SYMBOLS].sort(() => Math.random() - 0.5);
  
  G = {
    names,
    scores: names.map(() => 0),
    turn: 0,
    board: deck.map((sym, i) => ({ id: i, symbol: sym, flipped: false, matched: false })),
    firstPick: null,
    locked: false,
    over: false
  };
  saveState();
  renderBoard();
}

function renderBoard() {
  const boardEl = document.getElementById('board');
  boardEl.innerHTML = '';
  G.board.forEach((card, i) => {
    const el = document.createElement('div');
    el.className = `card ${card.flipped ? 'flipped' : ''} ${card.matched ? 'matched' : ''}`;
    el.dataset.id = i;
    el.innerHTML = `
      <div class="card-face card-back"></div>
      <div class="card-face card-front">${card.symbol}</div>
    `;
    el.addEventListener('click', () => flipCard(i, el));
    boardEl.appendChild(el);
  });
  updateUI();
  if(!G.over) showNotif(`${G.names[G.turn]}'s turn`, COLORS[G.turn]);
}

function updateUI() {
  document.getElementById('h-player').textContent = G.names[G.turn];
  document.getElementById('h-player').style.color = COLORS[G.turn];
  
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
      <span class="p-val" style="color:${COLORS[i]}">${G.scores[i]}</span>
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

function flipCard(idx, el) {
  initAudio();
  if(G.locked || G.board[idx].flipped || G.board[idx].matched) return;
  
  sndClick();
  G.board[idx].flipped = true;
  el.classList.add('flipped');
  
  if(G.firstPick === null) {
    G.firstPick = idx;
    saveState();
  } else {
    // Second pick
    const p1 = G.firstPick;
    const p2 = idx;
    const match = G.board[p1].symbol === G.board[p2].symbol;
    
    if(match) {
      sndScore();
      G.board[p1].matched = true;
      G.board[p2].matched = true;
      G.scores[G.turn]++;
      G.firstPick = null;
      
      const done = G.board.every(c => c.matched);
      if(done) G.over = true;
      saveState();
      updateUI();
      
      G.locked = true;
      setTimeout(() => {
        document.querySelector(`[data-id="${p1}"]`).classList.add('matched');
        document.querySelector(`[data-id="${p2}"]`).classList.add('matched');
        if(done) {
          sndWin();
          showGameOver();
        }
        G.locked = false;
      }, 600);
      
    } else {
      // Miss
      G.board[p1].flipped = false;
      G.board[p2].flipped = false;
      G.turn = (G.turn + 1) % G.names.length;
      G.firstPick = null;
      saveState(); // Saved face-down and next turn for anti-cheat
      
      G.locked = true;
      setTimeout(() => {
        document.querySelector(`[data-id="${p1}"]`).classList.remove('flipped');
        document.querySelector(`[data-id="${p2}"]`).classList.remove('flipped');
        updateUI();
        showNotif(`${G.names[G.turn]}'s turn`, COLORS[G.turn]);
        G.locked = false;
      }, 1000);
    }
  }
}

function showGameOver() {
  const max = Math.max(...G.scores);
  const winners = G.names.map((n, i) => G.scores[i] === max ? i : -1).filter(i => i !== -1);
  
  const card = document.getElementById('over-card');
  card.innerHTML = winners.map(w => `
    <div class="over-row win">
      <span class="over-med">🥇</span>
      <div class="over-dot" style="background:${COLORS[w]}"></div>
      <span class="over-name">${G.names[w]}</span>
      <span class="over-score">${G.scores[w]} pairs</span>
    </div>
  `).join('');
  
  document.getElementById('over').classList.add('on');
}

document.getElementById('btn-restart').addEventListener('click', () => {
  localStorage.removeItem('memory_state');
  location.reload();
});

function initApp() {
  const saved = localStorage.getItem('memory_state');
  if(saved) {
    try {
      G = JSON.parse(saved);
      document.getElementById('setup').style.display = 'none';
      document.getElementById('app').style.display = 'flex';
      
      // If we loaded mid-timeout (locked), unlock it and apply the visual state instantly
      G.locked = false;
      G.firstPick = null; // Should be null anyway if saved correctly
      
      renderBoard();
      if(G.over) showGameOver();
    } catch(e) {
      buildSetup(2);
    }
  } else {
    buildSetup(2);
  }
}

initApp();
