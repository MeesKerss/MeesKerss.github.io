// --- Data & State ---
const COLORS = ['#d97706','#2563eb']; // Player 1, Player 2
const DEFAULTS = ['Player 1','Player 2'];

let G;
function saveState() {
  if(G) localStorage.setItem('mancala_state', JSON.stringify(G));
}

// --- Audio ---
// Uses shared audio from audio.js (sndClick, sndScore, etc.)

// --- Game Logic ---
function newGame(names) {
  G = {
    players: names.map((n,i)=>({name:n, color:COLORS[i]})),
    turn: 0,
    board: [4,4,4,4,4,4, 0, 4,4,4,4,4,4, 0],
    animating: false
  };
  saveState();
  initBoard();
  updateUI();
}

// Pit ownership:
// P0: 0, 1, 2, 3, 4, 5. Store: 6
// P1: 7, 8, 9, 10, 11, 12. Store: 13
const P0_PITS = [0,1,2,3,4,5];
const P1_PITS = [7,8,9,10,11,12];

function isP0(idx) { return idx >= 0 && idx <= 5; }
function isP1(idx) { return idx >= 7 && idx <= 12; }
function getOpposite(idx) { return 12 - idx; } // 0->12, 1->11, 2->10, etc.

function initBoard() {
  for(let i=0; i<14; i++) {
    const el = document.getElementById(`stones-${i}`);
    el.innerHTML = '';
    for(let s=0; s<G.board[i]; s++) {
      addStaticStone(i);
    }
  }
}

function addStaticStone(idx, jx=null, jy=null) {
  const el = document.getElementById(`stones-${idx}`);
  if(!el) return;
  const stone = document.createElement('div');
  stone.className = 'stone';
  
  if(jx === null || jy === null) {
    const rect = el.getBoundingClientRect();
    const isStore = idx === 6 || idx === 13;
    // stores are taller, pits are circular
    const radX = isStore ? 15 : 15;
    const radY = isStore ? 30 : 15;
    
    const ang = Math.random() * Math.PI * 2;
    const d = Math.random();
    jx = Math.cos(ang) * d * radX;
    jy = Math.sin(ang) * d * radY;
  }
  
  stone.style.left = `calc(50% - 7px + ${jx}px)`;
  stone.style.top = `calc(50% - 7px + ${jy}px)`;
  
  // slightly randomize color for texture
  const lum = 30 + Math.random() * 30;
  stone.style.background = `rgb(${lum},${lum},${lum})`;
  
  el.appendChild(stone);
}

function updateUI() {
  if(G.animating) return;
  
  // Banners
  document.getElementById('name-0').textContent = G.players[0].name;
  document.getElementById('name-1').textContent = G.players[1].name;
  document.getElementById('dot-0').style.background = G.players[0].color;
  document.getElementById('dot-1').style.background = G.players[1].color;
  
  document.getElementById('banner-0').classList.toggle('active', G.turn === 0);
  document.getElementById('banner-1').classList.toggle('active', G.turn === 1);
  
  document.getElementById('h-player').textContent = G.players[G.turn].name + "'s turn";
  document.getElementById('h-player').style.color = G.players[G.turn].color;

  // Labels and interactiveness
  for(let i=0; i<14; i++) {
    const lbl = document.getElementById(`lbl-${i}`);
    if(lbl) lbl.textContent = G.board[i];
    
    const pit = document.getElementById(`pit-${i}`);
    if(pit && i !== 6 && i !== 13) {
      const isMine = (G.turn === 0 && isP0(i)) || (G.turn === 1 && isP1(i));
      if(isMine && G.board[i] > 0) {
        pit.classList.add('interactive');
      } else {
        pit.classList.remove('interactive');
      }
    }
  }
  
  checkWin();
}

async function animateDrop(fromIdx, toIdx) {
  const fromEl = document.getElementById(`stones-${fromIdx}`);
  const toEl = document.getElementById(`stones-${toIdx}`);
  
  const fromStone = fromEl.lastElementChild;
  if(!fromStone) return;
  const rectF = fromStone.getBoundingClientRect();
  fromEl.removeChild(fromStone);
  
  const fly = document.createElement('div');
  fly.className = 'stone';
  fly.style.left = rectF.left + 'px';
  fly.style.top = rectF.top + 'px';
  // retain color
  fly.style.background = fromStone.style.background;
  document.body.appendChild(fly);
  
  const rectT = toEl.getBoundingClientRect();
  const isStore = toIdx === 6 || toIdx === 13;
  const radX = isStore ? 15 : 15;
  const radY = isStore ? 30 : 15;
  
  const ang = Math.random() * Math.PI * 2;
  const d = Math.random();
  const jx = Math.cos(ang) * d * radX;
  const jy = Math.sin(ang) * d * radY;
  
  const tx = rectT.left + rectT.width/2 - 7 + jx;
  const ty = rectT.top + rectT.height/2 - 7 + jy;
  
  fly.getBoundingClientRect(); // force layout
  fly.style.left = tx + 'px';
  fly.style.top = ty + 'px';
  
  setTimeout(() => { if(window.sndClick) window.sndClick(); }, 200);
  
  await new Promise(r => setTimeout(r, 250));
  
  if(fly.parentNode) document.body.removeChild(fly);
  addStaticStone(toIdx, jx, jy);
  
  const pit = document.getElementById(`pit-${toIdx}`);
  pit.style.transform = 'scale(1.1)';
  setTimeout(() => { pit.style.transform = ''; }, 100);
  
  G.board[toIdx]++;
  const lbl = document.getElementById(`lbl-${toIdx}`);
  if(lbl) lbl.textContent = G.board[toIdx];
}

async function playTurn(idx) {
  if(G.animating || G.board[idx] === 0) return;
  if(G.turn === 0 && !isP0(idx)) return;
  if(G.turn === 1 && !isP1(idx)) return;
  
  if(window.initAudio) window.initAudio();
  
  G.animating = true;
  updateUI(); // remove interactive classes
  
  let stones = G.board[idx];
  G.board[idx] = 0;
  document.getElementById(`lbl-${idx}`).textContent = 0;
  
  let curr = idx;
  
  while(stones > 0) {
    curr = (curr + 1) % 14;
    // Skip opponent's store
    if(G.turn === 0 && curr === 13) curr = 0;
    if(G.turn === 1 && curr === 6) curr = 7;
    
    await animateDrop(idx, curr);
    stones--;
    
    // Optional delay between drops
    if(stones > 0) await new Promise(r => setTimeout(r, 100));
  }
  
  // Rule: Land in own store -> extra turn
  if((G.turn === 0 && curr === 6) || (G.turn === 1 && curr === 13)) {
    if(window.sndScore) window.sndScore();
    // G.turn remains the same
  } 
  // Rule: Land in own empty pit -> capture opposite
  else if(G.board[curr] === 1) { // 1 because we just dropped it there
    if((G.turn === 0 && isP0(curr)) || (G.turn === 1 && isP1(curr))) {
      const opp = getOpposite(curr);
      if(G.board[opp] > 0) {
        // Capture!
        const store = G.turn === 0 ? 6 : 13;
        const oppPit = document.getElementById(`pit-${opp}`);
        const currPit = document.getElementById(`pit-${curr}`);
        
        oppPit.classList.add('highlight');
        currPit.classList.add('highlight');
        if(window.sndScore) window.sndScore();
        await new Promise(r => setTimeout(r, 400));
        
        // Move captured stones
        const oppStones = G.board[opp];
        for(let s=0; s<oppStones; s++) {
          await animateDrop(opp, store);
        }
        // Move capturing stone
        await animateDrop(curr, store);
        
        oppPit.classList.remove('highlight');
        currPit.classList.remove('highlight');
      }
      G.turn = 1 - G.turn;
    } else {
      G.turn = 1 - G.turn;
    }
  } else {
    G.turn = 1 - G.turn;
  }
  
  G.animating = false;
  saveState();
  updateUI();
}

function checkWin() {
  const p0Sum = P0_PITS.reduce((a,i) => a + G.board[i], 0);
  const p1Sum = P1_PITS.reduce((a,i) => a + G.board[i], 0);
  
  if(p0Sum === 0 || p1Sum === 0) {
    // Sweep remaining stones
    if(p0Sum > 0) {
      G.board[6] += p0Sum;
      P0_PITS.forEach(i => G.board[i] = 0);
    }
    if(p1Sum > 0) {
      G.board[13] += p1Sum;
      P1_PITS.forEach(i => G.board[i] = 0);
    }
    initBoard();
    
    const p0Total = G.board[6];
    const p1Total = G.board[13];
    
    const results = [
      { name: G.players[0].name, color: G.players[0].color, t: p0Total },
      { name: G.players[1].name, color: G.players[1].color, t: p1Total }
    ].sort((a,b) => b.t - a.t);
    
    const MEDALS = ['🥇','🥈'];
    document.getElementById('over-card').innerHTML = results.map((r,i) => `
      <div class="over-row${i===0?' win':''}">
        <span class="over-med">${MEDALS[i]}</span>
        <div class="over-dot" style="background:${r.color}"></div>
        <span class="over-name">${r.name}</span>
        <span class="over-score">${r.t}</span>
      </div>`).join('');
      
    document.getElementById('over').classList.add('on');
    localStorage.removeItem('mancala_state');
  }
}

// --- Setup & Binding ---
function buildNames(n) {
  const globalPlayers = JSON.parse(localStorage.getItem('mkers_players') || '[]');
  const el=document.getElementById('name-list'); el.innerHTML='';
  for(let i=0;i<n;i++) {
    const row=document.createElement('div'); row.className='nrow';
    const dot=document.createElement('div'); dot.className='ndot'; dot.style.background=COLORS[i];
    const inp=document.createElement('input');
    inp.className='ninp'; inp.type='text'; inp.value=globalPlayers[i] || DEFAULTS[i];
    inp.placeholder=DEFAULTS[i]; inp.maxLength=16;
    row.appendChild(dot); row.appendChild(inp); el.appendChild(row);
  }
}
document.getElementById('start-btn').addEventListener('click',()=>{
  if(window.initAudio) window.initAudio();
  if(window.sndClick) window.sndClick();
  const names=[...document.querySelectorAll('.ninp')].map(i=>i.value.trim()||i.placeholder);
  const globalPlayers = JSON.parse(localStorage.getItem('mkers_players') || '[]');
  for(let i=0; i<names.length; i++) globalPlayers[i] = names[i];
  localStorage.setItem('mkers_players', JSON.stringify(globalPlayers));

  newGame(names);
  document.getElementById('setup').style.display='none';
  const app=document.getElementById('app'); app.style.display='flex';
});

document.getElementById('btn-restart').addEventListener('click', () => {
  localStorage.removeItem('mancala_state');
  location.reload();
});
document.getElementById('btn-play-again').addEventListener('click', () => {
  localStorage.removeItem('mancala_state');
  location.reload();
});

// Bind pits
for(let i=0; i<14; i++) {
  if(i!==6 && i!==13) {
    document.getElementById(`pit-${i}`).addEventListener('click', () => playTurn(i));
  }
}

function initApp() {
  const saved = localStorage.getItem('mancala_state');
  if(saved) {
    try {
      G = JSON.parse(saved);
      document.getElementById('setup').style.display='none';
      const app = document.getElementById('app'); 
      app.style.display='flex';
      initBoard();
      updateUI();
    } catch(e) {
      buildNames(2);
    }
  } else {
    buildNames(2);
  }
}

initApp();
