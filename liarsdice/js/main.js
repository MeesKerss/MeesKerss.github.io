// --- Data & State ---
const COLORS = ['#d97706','#2563eb','#16a34a','#dc2626'];
const DEFAULTS = ['Player 1','Player 2','Player 3','Player 4'];
const PIPS = {
  1:[4], 2:[2,6], 3:[2,4,6],
  4:[0,2,6,8], 5:[0,2,4,6,8], 6:[0,2,3,5,6,8]
};

let G;
function saveState() {
  if (G) localStorage.setItem('liarsdice_state', JSON.stringify(G));
}

// --- Audio (game specific) ---
function sndShake(intensity=1) {
  if(!window.actx) return;
  const a=window.actx, now=a.currentTime;
  const events=Math.min(Math.floor(intensity*4), 15);
  for(let i=0;i<events;i++) {
    const t=now+Math.random()*0.3;
    const amp=(5+Math.random()*10)/30*0.3;
    [2800,4200,5600].forEach(f=>{
      const g=a.createGain();
      g.gain.setValueAtTime(0,t);
      g.gain.linearRampToValueAtTime(amp*0.1,t+0.001);
      g.gain.exponentialRampToValueAtTime(0.001,t+0.015);
      const osc=a.createOscillator(); osc.type='sine';
      osc.frequency.value=f+Math.random()*300;
      osc.connect(g); g.connect(a.destination);
      osc.start(t); osc.stop(t+0.02);
    });
  }
}

// --- 3D Rendering (Static physics via Cannon) ---
let normalMats=[];
let scene, camera, renderer, diceMeshes=[];

const FACE_NORMALS = [
  new THREE.Vector3( 1, 0, 0),  // face 0: +X
  new THREE.Vector3(-1, 0, 0),  // face 1: -X
  new THREE.Vector3( 0, 1, 0),  // face 2: +Y
  new THREE.Vector3( 0,-1, 0),  // face 3: -Y
  new THREE.Vector3( 0, 0, 1),  // face 4: +Z
  new THREE.Vector3( 0, 0,-1),  // face 5: -Z
];

function initMats() {
  normalMats = [null];
  for(let i=1;i<=6;i++) {
    const canvas=document.createElement('canvas'); canvas.width=128; canvas.height=128;
    const ctx=canvas.getContext('2d');
    ctx.fillStyle='#ffffff'; ctx.fillRect(0,0,128,128);
    ctx.strokeStyle='#d4d0ca'; ctx.lineWidth=12; ctx.strokeRect(0,0,128,128);
    ctx.fillStyle='#111111';
    for(let d of PIPS[i]) {
      const col=d%3, row=Math.floor(d/3);
      ctx.beginPath(); ctx.arc(28+col*36, 28+row*36, 11, 0, Math.PI*2); ctx.fill();
    }
    const tex=new THREE.CanvasTexture(canvas); tex.anisotropy=4;
    normalMats.push(new THREE.MeshStandardMaterial({map:tex, roughness:0.1}));
  }
}

function getMaterialsForValue(v, faceUp) {
  const res=new Array(6);
  const pairIndex=Math.floor(faceUp/2);
  res[faceUp]=normalMats[v];
  res[faceUp%2===0 ? faceUp+1 : faceUp-1]=normalMats[7-v];

  const avail=[[1,6],[2,5],[3,4]].filter(p=>p[0]!==v && p[1]!==v && p[0]!==7-v && p[1]!==7-v);
  let aIdx=0;
  for(let i=0;i<3;i++) {
    if(i===pairIndex) continue;
    if(avail[aIdx]) {
      res[i*2]  =normalMats[avail[aIdx][0]];
      res[i*2+1]=normalMats[avail[aIdx][1]];
    }
    aIdx++;
  }
  return res;
}

function flattenQuaternion(physicsQ, faceUp) {
  const faceWorld = FACE_NORMALS[faceUp].clone().applyQuaternion(physicsQ);
  const correction = new THREE.Quaternion().setFromUnitVectors(faceWorld, new THREE.Vector3(0, 1, 0));
  return correction.multiply(physicsQ);
}

function calculateDicePlacements(diceArrays) {
  const world = new CANNON.World();
  world.gravity.set(0, -55, 0);
  const floor = new CANNON.Body({ mass: 0 });
  floor.addShape(new CANNON.Plane());
  floor.quaternion.setFromAxisAngle(new CANNON.Vec3(1, 0, 0), -Math.PI / 2);
  world.addBody(floor);

  const bodies = [];

  diceArrays.forEach((playerDice, pIdx) => {
    playerDice.forEach((v) => {
      const die = new CANNON.Body({ mass: 1, linearDamping: 0.4, angularDamping: 0.4 });
      die.addShape(new CANNON.Box(new CANNON.Vec3(0.8, 0.8, 0.8)));
      // Drop from random positions — physics gives us randomized face-up orientations
      die.position.set((Math.random() - 0.5) * 6, 10 + Math.random() * 5, (Math.random() - 0.5) * 6);
      die.velocity.set((Math.random() - 0.5) * 3, -10, (Math.random() - 0.5) * 3);
      die.angularVelocity.set((Math.random()-0.5)*30, (Math.random()-0.5)*30, (Math.random()-0.5)*30);
      world.addBody(die);
      bodies.push({ body: die, v, pIdx });
    });
  });

  for (let i = 0; i < 120; i++) world.step(1 / 60);

  // Extract only the orientation from physics — faceUp and quaternion give each die
  // its unique natural tumbled look. We discard the physics X/Z position entirely.
  const rawResults = bodies.map(({ body, v, pIdx }) => {
    const endQ = new THREE.Quaternion(body.quaternion.x, body.quaternion.y, body.quaternion.z, body.quaternion.w);
    const localUp = new THREE.Vector3(0, 1, 0).applyQuaternion(endQ.clone().invert());
    let max = -1, faceUp = 0;
    for (let j = 0; j < 6; j++) {
      const dot = localUp.dot(FACE_NORMALS[j]);
      if (dot > max) { max = dot; faceUp = j; }
    }
    return { pIdx, v, q: flattenQuaternion(endQ, faceUp), faceUp };
  });

  // --- Guaranteed visible grid layout ---
  // Instead of random physics positions (which can scatter off-screen), we place
  // dice in a neat grid that always fits within the camera's safe zone.
  // Orientations are still fully random from the physics sim above.
  const total = rawResults.length;
  const cols = Math.ceil(Math.sqrt(total));
  const rows = Math.ceil(total / cols);
  const SAFE_W = 9.0;  // total width of safe zone in world units
  const SAFE_D = 5.0;  // total depth of safe zone in world units
  const stepX = cols > 1 ? SAFE_W / (cols - 1) : 0;
  const stepZ = rows > 1 ? SAFE_D / (rows - 1) : 0;

  return rawResults.map((r, i) => {
    const col = i % cols;
    const row = Math.floor(i / cols);
    const jx = stepX > 0 ? (Math.random() - 0.5) * stepX * 0.3 : 0;
    const jz = stepZ > 0 ? (Math.random() - 0.5) * stepZ * 0.3 : 0;
    return {
      pIdx: r.pIdx,
      v: r.v,
      q: r.q,
      faceUp: r.faceUp,
      pos: new THREE.Vector3(
        cols > 1 ? col * stepX - SAFE_W / 2 + jx : jx,
        0.8,
        rows > 1 ? row * stepZ - SAFE_D / 2 + jz : jz
      )
    };
  });
}

function init3D() {
  initMats();
  const appEl=document.getElementById('app');
  const dc=document.getElementById('dice-container');

  scene=new THREE.Scene();
  camera=new THREE.PerspectiveCamera(35, dc.clientWidth/dc.clientHeight, 0.1, 100);
  camera.position.set(0,22,5); camera.lookAt(0,0,0);

  renderer=new THREE.WebGLRenderer({antialias:true, alpha:true});
  renderer.setPixelRatio(window.devicePixelRatio);
  renderer.shadowMap.enabled=true;
  renderer.shadowMap.type=THREE.PCFSoftShadowMap;
  renderer.setClearColor(0x000000,0);
  dc.insertBefore(renderer.domElement, dc.firstChild);

  const amb=new THREE.AmbientLight(0xffffff,0.65); scene.add(amb);
  const dir=new THREE.DirectionalLight(0xffffff,0.45);
  dir.position.set(2,10,4); dir.castShadow=true;
  dir.shadow.mapSize.width=1024; dir.shadow.mapSize.height=1024;
  scene.add(dir);

  const floor=new THREE.Mesh(new THREE.PlaneGeometry(50,50), new THREE.ShadowMaterial({opacity:0.12}));
  floor.rotation.x=-Math.PI/2; floor.receiveShadow=true; scene.add(floor);

  function updateCamera() {
    if(!dc.clientWidth) return;
    camera.aspect=dc.clientWidth/dc.clientHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(dc.clientWidth, dc.clientHeight);
    renderScene();
  }
  window.addEventListener('resize',updateCamera);

  const ro=new ResizeObserver(()=>{
    if(dc.clientWidth>0&&dc.clientHeight>0){ro.disconnect(); updateCamera();}
  });
  ro.observe(dc);
}

function renderScene() {
  if(renderer && scene && camera) renderer.render(scene, camera);
}

function rebuildMeshes(placements, filterPlayerIdx = -1) {
  // Clear old
  diceMeshes.forEach(d => scene.remove(d));
  diceMeshes = [];

  const geo=new THREE.BoxGeometry(1.6,1.6,1.6);
  
  placements.forEach(pd => {
    if(filterPlayerIdx !== -1 && pd.pIdx !== filterPlayerIdx) return;
    const mesh=new THREE.Mesh(geo, getMaterialsForValue(pd.v, pd.faceUp));
    mesh.castShadow=true; mesh.receiveShadow=true;
    mesh.position.copy(pd.pos);
    mesh.quaternion.copy(pd.q);
    
    // Add a slight tint for the player color if reveal
    if(filterPlayerIdx === -1) {
      const pColor = new THREE.Color(G.players[pd.pIdx].color);
      mesh.material = mesh.material.map(m => {
        const c = m.clone();
        c.color.lerp(pColor, 0.15); // subtle tint
        return c;
      });
    }

    scene.add(mesh);
    diceMeshes.push(mesh);
  });
  renderScene();
}

// --- Game Logic ---
function newGame(names) {
  G = {
    players: names.map((n,i)=>({name:n,color:COLORS[i], dice:5})),
    turn: 0,
    round: 1,
    phase: 'bidding', // 'bidding', 'reveal'
    currentBid: null, // { q: number, f: number, pIdx: number }
    diceVals: [],
    placements: []
  };
  startRound();
}

function startRound() {
  G.phase = 'bidding';
  G.currentBid = null;
  G.diceVals = G.players.map(p => {
    const arr = [];
    for(let i=0; i<p.dice; i++) arr.push(Math.ceil(Math.random()*6));
    return arr;
  });
  G.placements = calculateDicePlacements(G.diceVals);
  saveState();
  updateUI();
  
  // Play shake sound to indicate round start
  if(window.initAudio) window.initAudio();
  sndShake(2);
}

const FACES = ['⚀','⚁','⚂','⚃','⚄','⚅'];

function updateUI() {
  // Header
  const p = G.players[G.turn];
  document.getElementById('h-player').textContent = p.name + "'s turn";
  document.getElementById('h-player').style.color = p.color;

  // Score strip (Dice remaining)
  const strip = document.getElementById('score-strip');
  strip.innerHTML = '';
  G.players.forEach((player, i) => {
    const active = i===G.turn && G.phase==='bidding' ? 'active' : '';
    const elim = player.dice === 0 ? 'eliminated' : '';
    strip.innerHTML += `
      <div class="p-score ${active}" style="border-color:${i===G.turn?player.color:'transparent'}">
        <div class="top-row">
          <div class="p-dot" style="background:${player.color}"></div>
          <span class="p-name ${elim}">${player.name}</span>
        </div>
        <span class="p-val ${elim}">${player.dice} dice</span>
      </div>
    `;
  });

  // Banner
  const banner = document.getElementById('phase-banner');
  if(G.phase === 'bidding') {
    if(!G.currentBid) {
      banner.textContent = `New Round. ${p.name} starts the bidding.`;
      banner.style.background = '#fff';
      banner.style.color = '#111';
    } else {
      const bidder = G.players[G.currentBid.pIdx];
      banner.innerHTML = `<span><span style="color:${bidder.color}">${bidder.name}</span> bid <strong>${G.currentBid.q} &times; <span class="dice-font">${FACES[G.currentBid.f-1]}</span></strong></span>`;
      banner.style.background = '#fffbeb';
      banner.style.color = '#111';
    }
  } else if (G.phase === 'reveal') {
    banner.innerHTML = G.revealMessage || `Resolving challenge...`;
  }

  // Controls
  document.getElementById('ctrl-bid').style.display = G.phase === 'bidding' ? 'block' : 'none';
  document.getElementById('ctrl-reveal').style.display = G.phase === 'reveal' ? 'block' : 'none';

  if(G.phase === 'bidding') {
    document.getElementById('btn-liar').disabled = !G.currentBid;
    syncBidStepper();
  }

  // 3D & Peek
  const peek = document.getElementById('peek-overlay');
  if(G.phase === 'reveal') {
    peek.classList.add('hidden');
    rebuildMeshes(G.placements, -1);
  } else {
    peek.classList.remove('hidden');
    // Mesh is built on mousedown
  }
}

let tempBidQ = 1;
let tempBidF = 1;

function syncBidStepper() {
  if(!G.currentBid) {
    // defaults
    if(tempBidQ < 1) tempBidQ = 1;
  } else {
    // restrict to valid higher bids
    if(tempBidQ < G.currentBid.q) tempBidQ = G.currentBid.q;
    if(tempBidQ === G.currentBid.q && tempBidF <= G.currentBid.f) {
      tempBidF = G.currentBid.f + 1;
      if(tempBidF > 6) {
        tempBidQ++;
        tempBidF = 1;
      }
    }
  }
  document.getElementById('bid-q').textContent = tempBidQ;
  document.getElementById('bid-f').textContent = FACES[tempBidF-1];
}

document.getElementById('btn-q-up').onclick = () => { tempBidQ++; syncBidStepper(); if(window.sndClick) window.sndClick(); };
document.getElementById('btn-q-down').onclick = () => { tempBidQ--; syncBidStepper(); if(window.sndClick) window.sndClick(); };
document.getElementById('btn-f-up').onclick = () => { tempBidF++; if(tempBidF>6)tempBidF=1; syncBidStepper(); if(window.sndClick) window.sndClick(); };
document.getElementById('btn-f-down').onclick = () => { tempBidF--; if(tempBidF<1)tempBidF=6; syncBidStepper(); if(window.sndClick) window.sndClick(); };

document.getElementById('btn-submit-bid').onclick = () => {
  if(window.initAudio) window.initAudio();
  if(window.sndClick) window.sndClick();
  
  G.currentBid = { q: tempBidQ, f: tempBidF, pIdx: G.turn };
  
  // Next active player
  do {
    G.turn = (G.turn + 1) % G.players.length;
  } while(G.players[G.turn].dice === 0);
  
  saveState();
  updateUI();
};

document.getElementById('btn-liar').onclick = () => {
  if(window.initAudio) window.initAudio();
  if(window.sndScore) window.sndScore();
  
  G.phase = 'reveal';
  
  // Count actual
  const targetFace = G.currentBid.f;
  let count = 0;
  G.diceVals.forEach(arr => {
    arr.forEach(v => {
      if(v === targetFace) count++;
      // standard rules usually make 1s wild, but let's keep it exact for simplicity unless 1s were bid.
    });
  });

  const banner = document.getElementById('phase-banner');
  const diff = count - G.currentBid.q;
  const bidder = G.players[G.currentBid.pIdx];
  const caller = G.players[G.turn];

  let loserIdx;
  if(diff >= 0) {
    // Bid was true! Caller loses a die.
    G.revealMessage = `<span>There are ${count} &times; <span class="dice-font">${FACES[targetFace-1]}</span>. Bid was safe! <span style="color:${caller.color}">${caller.name}</span> loses a die.</span>`;
    loserIdx = G.turn;
  } else {
    // Bid was false! Bidder loses a die.
    G.revealMessage = `<span>There are only ${count} &times; <span class="dice-font">${FACES[targetFace-1]}</span>. <span style="color:${bidder.color}">${bidder.name}</span> loses a die!</span>`;
    loserIdx = G.currentBid.pIdx;
  }

  G.players[loserIdx].dice--;
  if(G.players[loserIdx].dice > 0) {
    G.turn = loserIdx; // Loser starts next round
  } else {
    // Loser eliminated, next active player starts
    do {
      G.turn = (G.turn + 1) % G.players.length;
    } while(G.players[G.turn].dice === 0);
  }

  saveState();
  updateUI();
  
  // Check win condition
  const activePlayers = G.players.filter(p => p.dice > 0);
  if(activePlayers.length <= 1) {
    setTimeout(showOver, 3000);
  }
};

document.getElementById('btn-next-round').onclick = () => {
  if(window.sndClick) window.sndClick();
  G.round++;
  startRound();
};

// --- Peek Logic ---
const peekEl = document.getElementById('peek-overlay');
function startPeek(e) {
  if(e) e.preventDefault();
  if(G.phase !== 'bidding') return;
  if(window.initAudio) window.initAudio();
  peekEl.classList.add('hidden');
  rebuildMeshes(G.placements, G.turn);
}
function stopPeek(e) {
  if(e) e.preventDefault();
  if(G.phase !== 'bidding') return;
  peekEl.classList.remove('hidden');
  // Clear scene
  diceMeshes.forEach(d => scene.remove(d));
  diceMeshes = [];
  renderScene();
}
peekEl.addEventListener('mousedown', startPeek);
peekEl.addEventListener('touchstart', startPeek, {passive:false});
window.addEventListener('mouseup', stopPeek);
window.addEventListener('touchend', stopPeek);

// --- Game Over ---
function showOver() {
  const results = G.players.map(p => p).sort((a,b) => b.dice - a.dice);
  const MEDALS = ['🥇','🥈','🥉','4️⃣'];
  document.getElementById('over-card').innerHTML = results.map((r,i) => `
    <div class="over-row${i===0?' win':''}">
      <span class="over-med">${MEDALS[i]}</span>
      <div class="over-dot" style="background:${r.color}"></div>
      <span class="over-name">${r.name}</span>
      <span class="over-score">${r.dice} dice</span>
    </div>`).join('');
  document.getElementById('over').classList.add('on');
}

// --- Setup & Init ---
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
document.querySelectorAll('.cnt').forEach(b=>{
  b.addEventListener('click',()=>{
    if(window.sndClick) window.sndClick();
    document.querySelectorAll('.cnt').forEach(x=>x.classList.remove('on'));
    b.classList.add('on'); buildNames(+b.dataset.n);
  });
});
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
  init3D(); updateUI();
});

document.getElementById('btn-restart').addEventListener('click', () => {
  localStorage.removeItem('liarsdice_state');
  location.reload();
});
document.getElementById('btn-play-again').addEventListener('click', () => {
  localStorage.removeItem('liarsdice_state');
  location.reload();
});

function initApp() {
  const saved = localStorage.getItem('liarsdice_state');
  if(saved) {
    try {
      G = JSON.parse(saved);
      document.getElementById('setup').style.display='none';
      const app = document.getElementById('app'); 
      app.style.display='flex';
      init3D(); 
      updateUI();
      
      const activePlayers = G.players.filter(p => p.dice > 0);
      if(activePlayers.length <= 1) showOver();
    } catch(e) {
      buildNames(3);
    }
  } else {
    buildNames(3);
  }
}

initApp();
