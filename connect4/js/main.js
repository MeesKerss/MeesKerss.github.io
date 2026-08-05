let G = {
  board: [], // 7 cols x 6 rows
  names: ["Player 1", "Player 2"],
  turn: 0,
  locked: false,
  over: false
};

function saveState() {
  localStorage.setItem('c4_state', JSON.stringify(G));
}

const COLORS = ['#d97706', '#2563eb']; // Amber, Blue
const COLS = 7;
const ROWS = 6;

// Elements
const boardEl = document.getElementById('board');
const setupEl = document.getElementById('setup');
const appEl = document.getElementById('app');
const overEl = document.getElementById('over');
const notifEl = document.getElementById('notif');
const hPlayer = document.getElementById('h-player');

// --- Audio ---
let actx;
function initAudio() {
  if(!actx) actx = new (window.AudioContext||window.webkitAudioContext)();
  if(actx.state === 'suspended') actx.resume();
}

function sndClick() {
  if(!actx) return;
  const osc = actx.createOscillator();
  const gain = actx.createGain();
  osc.type = 'sine';
  osc.frequency.setValueAtTime(800, actx.currentTime);
  osc.frequency.exponentialRampToValueAtTime(600, actx.currentTime + 0.04);
  gain.gain.setValueAtTime(0.05, actx.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.001, actx.currentTime + 0.04);
  osc.connect(gain); gain.connect(actx.destination);
  osc.start(); osc.stop(actx.currentTime + 0.04);
}

function sndDrop() {
  if(!actx) return;
  const osc = actx.createOscillator();
  const gain = actx.createGain();
  osc.type = 'sine';
  osc.frequency.setValueAtTime(150, actx.currentTime);
  osc.frequency.exponentialRampToValueAtTime(40, actx.currentTime + 0.08);
  gain.gain.setValueAtTime(0.1, actx.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.001, actx.currentTime + 0.08);
  osc.connect(gain); gain.connect(actx.destination);
  osc.start(); osc.stop(actx.currentTime + 0.08);
}

function sndWin() {
  if(!actx) return;
  const freqs = [392, 493.88, 587.33, 783.99]; // G chord
  freqs.forEach((f, i) => {
    const osc = actx.createOscillator();
    const gain = actx.createGain();
    osc.frequency.value = f;
    gain.gain.setValueAtTime(0, actx.currentTime + i*0.08);
    gain.gain.linearRampToValueAtTime(0.05, actx.currentTime + i*0.08 + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.001, actx.currentTime + i*0.08 + 0.3);
    osc.connect(gain); gain.connect(actx.destination);
    osc.start(actx.currentTime + i*0.08);
    osc.stop(actx.currentTime + i*0.08 + 0.3);
  });
}

// --- Setup ---
function buildSetup() {
  const globalPlayers = JSON.parse(localStorage.getItem('mkers_players') || '[]');
  const nlist = document.getElementById('name-list');
  nlist.innerHTML = '';
  for(let i=0; i<2; i++) {
    const row = document.createElement('div'); row.className = 'nrow';
    const dot = document.createElement('div'); dot.className = 'ndot'; dot.style.background = COLORS[i];
    const inp = document.createElement('input'); inp.className = 'ninp';
    inp.type = 'text'; 
    inp.value = globalPlayers[i] || G.names[i];
    inp.placeholder = `Player ${i+1}`;
    row.appendChild(dot); row.appendChild(inp);
    nlist.appendChild(row);
  }
}

document.getElementById('start-btn').addEventListener('click', () => {
  const inputs = document.querySelectorAll('.ninp');
  G.names = [...inputs].map((inp, i) => inp.value.trim() || `Player ${i+1}`);
  
  const globalPlayers = JSON.parse(localStorage.getItem('mkers_players') || '[]');
  for(let i=0; i<2; i++) globalPlayers[i] = G.names[i];
  localStorage.setItem('mkers_players', JSON.stringify(globalPlayers));

  initAudio();
  sndClick();
  setupEl.style.display = 'none';
  appEl.style.display = 'flex';
  newGame();
});

// --- Game Logic & UI ---
function newGame() {
  G.board = Array.from({length: COLS}, () => []);
  G.turn = 0;
  G.locked = false;
  G.over = false;
  saveState();
  renderBoard();
}

function renderBoard() {
  boardEl.innerHTML = '';
  for(let c=0; c<COLS; c++) {
    const col = document.createElement('div');
    col.className = 'col';
    col.dataset.c = c;
    for(let r=0; r<ROWS; r++) {
      const slot = document.createElement('div');
      slot.className = 'slot';
      if(G.board[c] && G.board[c][r] !== undefined) {
        slot.style.background = COLORS[G.board[c][r]];
      }
      col.appendChild(slot);
    }
    col.addEventListener('click', () => handleTap(c));
    boardEl.appendChild(col);
  }
  updateUI();
  if(!G.over) {
    showNotif(`${G.names[G.turn]}'s turn`, COLORS[G.turn]);
  }
}

function updateUI() {
  hPlayer.textContent = G.names[G.turn];
  hPlayer.style.color = COLORS[G.turn];
}

let notifTimer;
function showNotif(msg, color) {
  clearTimeout(notifTimer);
  document.getElementById('n-dot').style.background = color || 'transparent';
  document.getElementById('n-dot').style.display = color ? 'block' : 'none';
  document.getElementById('n-txt').textContent = msg;
  notifEl.classList.add('on');
  notifTimer = setTimeout(() => notifEl.classList.remove('on'), 1800);
}

function handleTap(c) {
  initAudio();
  if(G.locked) return;
  const colArr = G.board[c];
  if(colArr.length >= ROWS) return; // Full
  
  const r = colArr.length;
  G.locked = true;
  colArr.push(G.turn); // Logical drop
  
  // Visual drop
  const colEl = boardEl.children[c];
  const slotEl = colEl.children[r]; // Because of column-reverse, child 0 is bottom
  
  const disc = document.createElement('div');
  disc.className = 'falling-disc';
  disc.style.background = COLORS[G.turn];
  
  // Calculate drop distance
  // Wait, append disc to slotEl so its final position is naturally 0,0
  slotEl.style.position = 'relative';
  disc.style.inset = '0';
  slotEl.appendChild(disc);
  
  const boardRect = boardEl.getBoundingClientRect();
  const slotRect = slotEl.getBoundingClientRect();
  const dist = slotRect.top - boardRect.top + 60; // Start slightly above board
  
  const anim = disc.animate([
    { transform: `translateY(-${dist}px)`, offset: 0 },
    { transform: `translateY(0)`, offset: 0.7, easing: 'ease-out' },
    { transform: `translateY(-12px)`, offset: 0.85, easing: 'ease-in-out' },
    { transform: `translateY(0)`, offset: 1 }
  ], { duration: 380, fill: 'forwards' });
  
  anim.onfinish = () => {
    sndDrop();
    disc.remove();
    slotEl.style.background = COLORS[G.turn];
    slotEl.style.position = '';
    
    checkPostDrop(c, r);
  };
}

function checkPostDrop(c, r) {
  const winSeq = checkWin(c, r, G.turn);
  if(winSeq) {
    sndWin();
    G.over = true;
    saveState();
    // Highlight win
    winSeq.forEach(({c: wc, r: wr}) => {
      boardEl.children[wc].children[wr].classList.add('win');
    });
    setTimeout(() => showGameOver(G.names[G.turn], COLORS[G.turn]), 800);
  } else if(checkTie()) {
    G.over = true;
    saveState();
    setTimeout(() => showGameOver("Tie Game", "#999"), 800);
  } else {
    G.turn = 1 - G.turn;
    saveState();
    updateUI();
    showNotif(`${G.names[G.turn]}'s turn`, COLORS[G.turn]);
    G.locked = false;
  }
}

function checkWin(c, r, p) {
  const dirs = [
    [[1,0], [-1,0]], // Horiz
    [[0,1], [0,-1]], // Vert
    [[1,1], [-1,-1]], // Diag /
    [[1,-1], [-1,1]]  // Diag \
  ];
  
  for(let dir of dirs) {
    let seq = [{c, r}];
    for(let d of dir) {
      let nc = c + d[0], nr = r + d[1];
      while(nc >= 0 && nc < COLS && nr >= 0 && nr < ROWS && G.board[nc][nr] === p) {
        seq.push({c: nc, r: nr});
        nc += d[0]; nr += d[1];
      }
    }
    if(seq.length >= 4) return seq;
  }
  return null;
}

function checkTie() {
  for(let c=0; c<COLS; c++) {
    if(G.board[c].length < ROWS) return false;
  }
  return true;
}

function showGameOver(winnerName, color) {
  const card = document.getElementById('over-card');
  card.innerHTML = `
    <div class="over-row win">
      <span class="over-med">🥇</span>
      <div class="over-dot" style="background:${color}"></div>
      <span class="over-name">${winnerName}</span>
    </div>
  `;
  overEl.classList.add('on');
}

document.getElementById('btn-restart').addEventListener('click', () => {
  localStorage.removeItem('c4_state');
  location.reload();
});

function initApp() {
  const saved = localStorage.getItem('c4_state');
  if(saved) {
    try {
      G = JSON.parse(saved);
      setupEl.style.display = 'none';
      appEl.style.display = 'flex';
      renderBoard();
      
      if(G.over) {
        let isTie = true;
        for(let c=0; c<COLS; c++) {
          if(G.board[c].length < ROWS) { isTie = false; break; }
        }
        showGameOver(isTie ? "Tie Game" : G.names[G.turn], isTie ? "#999" : COLORS[G.turn]);
      }
    } catch(e) {
      buildSetup();
    }
  } else {
    buildSetup();
  }
}

initApp();
