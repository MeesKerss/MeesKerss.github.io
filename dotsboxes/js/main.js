let G = {
  names: [],
  scores: [],
  turn: 0,
  size: 5,
  hLines: [],
  vLines: [],
  boxes: [],
  chain: 0,
  over: false
};

const COLORS = ['#d97706', '#2563eb', '#16a34a', '#dc2626'];

function saveState() {
  if(G) localStorage.setItem('dots_state', JSON.stringify(G));
}



// --- Setup ---
let curSize = 5;
document.querySelectorAll('#grid-btns .cnt').forEach(b => {
  b.addEventListener('click', () => {
    document.querySelectorAll('#grid-btns .cnt').forEach(x => x.classList.remove('on'));
    b.classList.add('on');
    curSize = +b.dataset.s;
  });
});

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

document.querySelectorAll('#player-btns .cnt').forEach(b => {
  b.addEventListener('click', () => {
    document.querySelectorAll('#player-btns .cnt').forEach(x => x.classList.remove('on'));
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
  newGame(names, curSize);
});

// --- Game Logic ---
function newGame(names, size) {
  G = {
    names,
    scores: names.map(() => 0),
    turn: 0,
    size,
    hLines: Array.from({length: size}, () => Array(size-1).fill(null)),
    vLines: Array.from({length: size-1}, () => Array(size).fill(null)),
    boxes: Array.from({length: size-1}, () => Array(size-1).fill(null)),
    chain: 0,
    over: false
  };
  saveState();
  renderBoard();
}

function renderBoard() {
  const boardEl = document.getElementById('board');
  const S = G.size;
  boardEl.innerHTML = '';
  
  // Create grid template: e.g. repeat(4, 24px 1fr) 24px
  boardEl.style.gridTemplateColumns = `repeat(${S - 1}, 24px 1fr) 24px`;
  boardEl.style.gridTemplateRows = `repeat(${S - 1}, 24px 1fr) 24px`;
  
  for(let r=0; r < 2*S - 1; r++) {
    for(let c=0; c < 2*S - 1; c++) {
      const el = document.createElement('div');
      
      if(r%2===0 && c%2===0) {
        // Dot
        el.className = 'dot';
      } else if(r%2===0 && c%2!==0) {
        // Horiz Line
        el.className = 'line-h';
        const hr = Math.floor(r/2), hc = Math.floor(c/2);
        el.dataset.type = 'h'; el.dataset.r = hr; el.dataset.c = hc;
        if(G.hLines[hr][hc] !== null) {
          el.classList.add('on');
          el.style.setProperty('--line-color', COLORS[G.hLines[hr][hc] === true ? 0 : G.hLines[hr][hc]]);
        }
        el.addEventListener('click', () => clickLine('h', hr, hc, el));
      } else if(r%2!==0 && c%2===0) {
        // Vert Line
        el.className = 'line-v';
        const vr = Math.floor(r/2), vc = Math.floor(c/2);
        el.dataset.type = 'v'; el.dataset.r = vr; el.dataset.c = vc;
        if(G.vLines[vr][vc] !== null) {
          el.classList.add('on');
          el.style.setProperty('--line-color', COLORS[G.vLines[vr][vc] === true ? 0 : G.vLines[vr][vc]]);
        }
        el.addEventListener('click', () => clickLine('v', vr, vc, el));
      } else {
        // Box
        el.className = 'box';
        const br = Math.floor(r/2), bc = Math.floor(c/2);
        el.id = `box-${br}-${bc}`;
        const owner = G.boxes[br][bc];
        if(owner !== null) {
          el.style.background = COLORS[owner];
        }
        const tag = document.createElement('div');
        tag.className = 'chain-tag';
        tag.id = `tag-${br}-${bc}`;
        el.appendChild(tag);
      }
      
      boardEl.appendChild(el);
    }
  }
  
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

function clickLine(type, r, c, el) {
  initAudio();
  if(G.over) return;
  
  if(type === 'h' && G.hLines[r][c] !== null) return;
  if(type === 'v' && G.vLines[r][c] !== null) return;
  
  sndClick();
  el.classList.add('on');
  el.style.setProperty('--line-color', COLORS[G.turn]);
  
  if(type === 'h') G.hLines[r][c] = G.turn;
  else G.vLines[r][c] = G.turn;
  
  // Check completed boxes
  let boxesCompleted = [];
  
  const check = (br, bc) => {
    if(br<0 || br>=G.size-1 || bc<0 || bc>=G.size-1) return false;
    if(G.boxes[br][bc] !== null) return false;
    
    if(G.hLines[br][bc] !== null && G.hLines[br+1][bc] !== null && G.vLines[br][bc] !== null && G.vLines[br][bc+1] !== null) {
      return true;
    }
    return false;
  };
  
  if(type === 'h') {
    if(check(r-1, c)) boxesCompleted.push([r-1, c]);
    if(check(r, c)) boxesCompleted.push([r, c]);
  } else {
    if(check(r, c-1)) boxesCompleted.push([r, c-1]);
    if(check(r, c)) boxesCompleted.push([r, c]);
  }
  
  if(boxesCompleted.length > 0) {
    sndScore();
    boxesCompleted.forEach(([br, bc]) => {
      G.boxes[br][bc] = G.turn;
      G.scores[G.turn]++;
      G.chain++;
      
      const boxEl = document.getElementById(`box-${br}-${bc}`);
      boxEl.style.background = COLORS[G.turn];
      
      if(G.chain > 1) {
        const tag = document.getElementById(`tag-${br}-${bc}`);
        tag.textContent = `x${G.chain}`;
        tag.classList.add('show');
        setTimeout(() => tag.classList.remove('show'), 800);
      }
    });
    
    // Check if game over
    let totalBoxes = (G.size - 1) * (G.size - 1);
    let filledBoxes = G.scores.reduce((a,b)=>a+b, 0);
    
    if(filledBoxes >= totalBoxes) {
      G.over = true;
      saveState();
      updateUI();
      sndWin();
      showGameOver();
      return;
    }
  } else {
    // No box completed, next turn
    G.turn = (G.turn + 1) % G.names.length;
    G.chain = 0;
    showNotif(`${G.names[G.turn]}'s turn`, COLORS[G.turn]);
  }
  
  saveState();
  updateUI();
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
      <span class="over-score">${G.scores[w]}</span>
    </div>
  `).join('');
  
  document.getElementById('over').classList.add('on');
}

document.getElementById('btn-restart').addEventListener('click', () => {
  localStorage.removeItem('dots_state');
  location.reload();
});

function initApp() {
  const saved = localStorage.getItem('dots_state');
  if(saved) {
    try {
      G = JSON.parse(saved);
      document.getElementById('setup').style.display = 'none';
      document.getElementById('app').style.display = 'flex';
      
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
