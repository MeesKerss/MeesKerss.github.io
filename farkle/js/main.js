// --- Data & State ---
const COLORS   = ['#d97706','#2563eb','#16a34a','#dc2626'];
const DEFAULTS = ['Player 1','Player 2','Player 3','Player 4'];
const MEDALS   = ['🥇','🥈','🥉','4️⃣'];
const PIPS = {
  1:[4], 2:[2,6], 3:[2,4,6],
  4:[0,2,6,8], 5:[0,2,4,6,8], 6:[0,2,3,5,6,8]
};
const N_DICE = 6;

let G;
function saveState() {
  if(G) localStorage.setItem('farkle_state', JSON.stringify({...G, rolling: false}));
}

// --- Scoring ---
// Returns the points for a set of dice values and how many of those dice count.
// A selection is only valid when every selected die is used.
function scoreDice(vals) {
  const c = new Array(7).fill(0);
  vals.forEach(v => c[v]++);
  if(vals.length === 6) {
    if([1,2,3,4,5,6].every(f => c[f] === 1)) return {pts: 1500, used: 6};
    if(c.filter(n => n === 2).length === 3) return {pts: 1500, used: 6};
  }
  let pts = 0, used = 0;
  for(let f=1; f<=6; f++) {
    const k = c[f];
    if(k >= 3) {
      // Three of a kind = face × 100 (1s = 1000); four/five/six = ×2/×3/×4
      pts += (f === 1 ? 1000 : f * 100) * (k - 2);
      used += k;
    } else if(f === 1) {
      pts += 100 * k; used += k;
    } else if(f === 5) {
      pts += 50 * k; used += k;
    }
  }
  return {pts, used};
}

// Which of the free dice could be part of a scoring combination
function scoringSet(idxs) {
  const vals = idxs.map(i => G.dice[i]);
  const c = new Array(7).fill(0);
  vals.forEach(v => c[v]++);
  const all = scoreDice(vals);
  if(vals.length === 6 && all.used === 6 && all.pts === 1500) return new Set(idxs);
  return new Set(idxs.filter(i => {
    const v = G.dice[i];
    return v === 1 || v === 5 || c[v] >= 3;
  }));
}

const idxWhere = st => G.state.map((s, i) => s === st ? i : -1).filter(i => i !== -1);

function selection() {
  const idxs = idxWhere('sel');
  const s = scoreDice(idxs.map(i => G.dice[i]));
  return {idxs, pts: s.pts, valid: idxs.length > 0 && s.pts > 0 && s.used === idxs.length};
}

// --- Game Logic ---
function newGame(names, target, opening) {
  G = {
    players: names.map((n, i) => ({name: n, color: COLORS[i]})),
    scores: names.map(() => 0),
    onBoard: names.map(() => opening === 0),
    turns: names.map(() => 0),
    target,
    opening,
    cur: 0,
    round: 1,
    dice: [1,2,3,4,5,6],
    state: new Array(N_DICE).fill('free'), // 'free' | 'sel' | 'kept'
    turnPts: 0,
    rolled: false,
    rolling: false,
    pendingNext: false,
    finalFrom: null,   // player who first reached the target
    over: false
  };
  saveState();
}

function nextTurn() {
  G.turns[G.cur]++;
  G.pendingNext = false;
  G.cur = (G.cur + 1) % G.players.length;
  if(G.cur === 0) G.round++;
  if(G.finalFrom !== null && G.cur === G.finalFrom) {
    G.over = true;
    saveState();
    sndWin();
    showOver();
    return;
  }
  G.state = new Array(N_DICE).fill('free');
  G.turnPts = 0;
  G.rolled = false;
  saveState();
  resetDiceMeshes();
  updateUI();
  const p = G.players[G.cur];
  showNotif(G.finalFrom !== null ? `${p.name}: last turn!` : `${p.name}'s turn`, p.color);
}

// --- Audio (game specific) ---
// Shared sounds (sndClick, sndScore, sndWin, sndError) come from audio.js
function sndDie(intensity) {
  if(!actx) return;
  const a = actx, now = a.currentTime;
  const amp = Math.min(1.0, intensity / 30);
  if(amp < 0.03) return;

  const gTable = a.createGain();
  gTable.gain.setValueAtTime(0, now);
  gTable.gain.linearRampToValueAtTime(amp * 0.4, now + 0.002);
  gTable.gain.exponentialRampToValueAtTime(0.001, now + 0.08);
  const oscTable = a.createOscillator(); oscTable.type = 'sine';
  oscTable.frequency.setValueAtTime(150, now);
  oscTable.frequency.exponentialRampToValueAtTime(60, now + 0.04);
  oscTable.connect(gTable); gTable.connect(a.destination);
  oscTable.start(now); oscTable.stop(now + 0.1);

  [2400,3600,4800].forEach(f => {
    const g = a.createGain();
    g.gain.setValueAtTime(0, now);
    g.gain.linearRampToValueAtTime(amp * 0.15, now + 0.001);
    g.gain.exponentialRampToValueAtTime(0.001, now + 0.015);
    const osc = a.createOscillator(); osc.type = 'sine';
    osc.frequency.value = f + (Math.random() * 300 - 150);
    osc.connect(g); g.connect(a.destination);
    osc.start(now); osc.stop(now + 0.02);
  });
}
function sndRattle(n) {
  if(!actx || n === 0) return;
  const a = actx, now = a.currentTime;
  const events = Math.min(n * 4, 14);
  for(let i=0; i<events; i++) {
    const t = now + Math.random() * 0.25;
    const amp = (5 + Math.random() * 10) / 30 * 0.3;
    [2800,4200,5600].forEach(f => {
      const g = a.createGain();
      g.gain.setValueAtTime(0, t);
      g.gain.linearRampToValueAtTime(amp * 0.1, t + 0.001);
      g.gain.exponentialRampToValueAtTime(0.001, t + 0.015);
      const osc = a.createOscillator(); osc.type = 'sine';
      osc.frequency.value = f + Math.random() * 300;
      osc.connect(g); g.connect(a.destination);
      osc.start(t); osc.stop(t + 0.02);
    });
  }
}
function sndHot() {
  if(!actx) return;
  [523,659,784,1047].forEach((f, i) => {
    const osc = actx.createOscillator(), g = actx.createGain(), t = actx.currentTime + i * 0.09;
    osc.type = 'triangle'; osc.frequency.value = f;
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(0.12, t + 0.02);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.28);
    osc.connect(g); g.connect(actx.destination);
    osc.start(t); osc.stop(t + 0.28);
  });
}

// --- 3D Physics & Rendering ---
let normalMats=[], selMats=[], keptMats=[], preMats=[];
let scene, camera, renderer, diceMeshes=[], rollingDice=[];
let dcEl = null, tagEls = [];
const raycaster = new THREE.Raycaster();

function getTargetPos(i) {
  return {x: (i % 3 - 1) * 2.3, z: i < 3 ? -1.2 : 1.2};
}

function initMats() {
  normalMats = createDiceMaterials('#ffffff', '#d4d0ca', '#111111');
  selMats    = createDiceMaterials('#fffbeb', '#d97706', '#92400e');
  keptMats   = createDiceMaterials('#f0ede8', '#e2ded8', '#c9c4bc');

  const canvas=document.createElement('canvas'); canvas.width=128; canvas.height=128;
  const ctx=canvas.getContext('2d');
  ctx.fillStyle='#f5f5f5'; ctx.fillRect(0,0,128,128);
  ctx.strokeStyle='#e0e0e0'; ctx.lineWidth=12; ctx.strokeRect(0,0,128,128);
  const tex=new THREE.CanvasTexture(canvas); tex.anisotropy=4;
  preMats=new Array(6).fill(new THREE.MeshStandardMaterial({map:tex, roughness:0.2}));
}

function createDiceMaterials(bg, border, pip) {
  const mats=[null];
  for(let i=1;i<=6;i++) {
    const canvas=document.createElement('canvas'); canvas.width=128; canvas.height=128;
    const ctx=canvas.getContext('2d');
    ctx.fillStyle=bg; ctx.fillRect(0,0,128,128);
    ctx.strokeStyle=border; ctx.lineWidth=12; ctx.strokeRect(0,0,128,128);
    ctx.fillStyle=pip;
    for(let d of PIPS[i]) {
      const col=d%3, row=Math.floor(d/3);
      ctx.beginPath(); ctx.arc(28+col*36, 28+row*36, 11, 0, Math.PI*2); ctx.fill();
    }
    const tex=new THREE.CanvasTexture(canvas); tex.anisotropy=4;
    mats.push(new THREE.MeshStandardMaterial({map:tex, roughness:0.1}));
  }
  return mats;
}

// Put value v on face faceUp, with its opposite on the other side of the cube
function getMaterialsForValue(v, faceUp, srcMats) {
  const res=new Array(6);
  const pairIndex=Math.floor(faceUp/2);
  res[faceUp]=srcMats[v];
  res[faceUp%2===0 ? faceUp+1 : faceUp-1]=srcMats[7-v];
  const avail=[[1,6],[2,5],[3,4]].filter(p=>p[0]!==v && p[1]!==v && p[0]!==7-v && p[1]!==7-v);
  let aIdx=0;
  for(let i=0;i<3;i++) {
    if(i===pairIndex) continue;
    if(avail[aIdx]) {
      res[i*2]  =srcMats[avail[aIdx][0]];
      res[i*2+1]=srcMats[avail[aIdx][1]];
    }
    aIdx++;
  }
  return res;
}

function matsFor(i) {
  const st = G.state[i];
  return getMaterialsForValue(G.dice[i], diceMeshes[i].currentFaceUp, st === 'sel' ? selMats : st === 'kept' ? keptMats : normalMats);
}

function init3D() {
  initMats();
  dcEl = document.getElementById('dice-container');
  const tagLayer = document.getElementById('tag-layer');
  tagEls = Array.from({length: N_DICE}, () => {
    const t = document.createElement('div');
    t.className = 'htag'; t.textContent = 'KEEP';
    tagLayer.appendChild(t);
    return t;
  });

  scene=new THREE.Scene();
  camera=new THREE.PerspectiveCamera(32, 1, 0.1, 100);

  renderer=new THREE.WebGLRenderer({antialias:true, alpha:true});
  renderer.setPixelRatio(window.devicePixelRatio);
  renderer.shadowMap.enabled=true;
  renderer.shadowMap.type=THREE.PCFSoftShadowMap;
  renderer.setClearColor(0x000000,0);
  dcEl.insertBefore(renderer.domElement, dcEl.firstChild);

  scene.add(new THREE.AmbientLight(0xffffff,0.65));
  const dir=new THREE.DirectionalLight(0xffffff,0.45);
  dir.position.set(2,10,4); dir.castShadow=true;
  dir.shadow.mapSize.width=1024; dir.shadow.mapSize.height=1024;
  scene.add(dir);

  const floor=new THREE.Mesh(new THREE.PlaneGeometry(50,50), new THREE.ShadowMaterial({opacity:0.12}));
  floor.rotation.x=-Math.PI/2; floor.receiveShadow=true; scene.add(floor);

  const geo=new THREE.BoxGeometry(1.6,1.6,1.6);
  for(let i=0;i<N_DICE;i++) {
    const mesh=new THREE.Mesh(geo,preMats);
    mesh.castShadow=true; mesh.receiveShadow=true;
    scene.add(mesh);
    diceMeshes.push({mesh, currentFaceUp:2});
  }
  resetDiceMeshes();

  // Same iOS-safe tap handling as Yahtzee: touchend + click, deduplicated
  let lastTouchHit = 0;
  function hitTest(clientX, clientY) {
    const rect=dcEl.getBoundingClientRect();
    if(clientX<rect.left||clientX>rect.right||clientY<rect.top||clientY>rect.bottom) return false;
    const mouse=new THREE.Vector2(((clientX-rect.left)/rect.width)*2-1, -((clientY-rect.top)/rect.height)*2+1);
    raycaster.setFromCamera(mouse,camera);
    const hits=raycaster.intersectObjects(diceMeshes.map(d=>d.mesh));
    if(hits.length>0) {
      const idx=diceMeshes.findIndex(d=>d.mesh===hits[0].object);
      if(idx!==-1){ toggleDie(idx); return true; }
    }
    return false;
  }
  window.addEventListener('touchend',(e)=>{
    if(!e.changedTouches.length) return;
    const t=e.changedTouches[0];
    if(hitTest(t.clientX,t.clientY)) lastTouchHit=performance.now();
  },{passive:true});
  window.addEventListener('click',(e)=>{
    if(performance.now()-lastTouchHit<700) return;
    hitTest(e.clientX,e.clientY);
  },true);

  // Fit the 3x2 dice grid into whatever shape the container has
  function updateCamera() {
    const w=dcEl.clientWidth, h=dcEl.clientHeight;
    if(!w||!h) return;
    camera.aspect=w/h;
    const half=Math.tan(THREE.MathUtils.degToRad(camera.fov/2));
    const dist=Math.max(5.6/2/half, 7.8/2/(half*camera.aspect));
    camera.position.set(0,dist,dist*0.14); camera.lookAt(0,0,0);
    camera.updateProjectionMatrix();
    renderer.setSize(w,h);
    alignTags();
  }
  window.addEventListener('resize',updateCamera);
  new ResizeObserver(updateCamera).observe(dcEl);

  const PHYSICS_DT = 1/60;
  let lastTime = null, accum = 0;
  function animate(now) {
    requestAnimationFrame(animate);
    if(lastTime !== null) accum += Math.min((now - lastTime) / 1000, PHYSICS_DT * 4);
    lastTime = now;
    if(rollingDice.length > 0) {
      while(accum >= PHYSICS_DT) {
        accum -= PHYSICS_DT;
        let allDone = true;
        for(let rd of rollingDice) {
          if(rd.frame < rd.traj.length) {
            allDone = false;
            const t = rd.traj[rd.frame];
            rd.mesh.position.copy(t.p);
            rd.mesh.quaternion.copy(t.q);
            const intensity = rd.bounceMap.get(rd.frame);
            if(intensity !== undefined) sndDie(intensity);
            rd.frame++;
          }
        }
        if(allDone) { rollingDice = []; break; }
      }
    } else {
      accum = 0;
    }
    renderer.render(scene, camera);
  }
  animate(performance.now());
}

// Dice at rest on their spots, top face (+Y) up
function resetDiceMeshes() {
  diceMeshes.forEach((d, i) => {
    const tgt = getTargetPos(i);
    d.mesh.position.set(tgt.x, 0.8, tgt.z);
    d.mesh.rotation.set(0, Math.random()*0.5-0.25, 0);
    d.currentFaceUp = 2;
    d.mesh.material = G.rolled ? matsFor(i) : preMats;
  });
  updateTags();
}

function alignTags() {
  if(!camera || !dcEl) return;
  const w = dcEl.clientWidth, h = dcEl.clientHeight;
  for(let i=0; i<N_DICE; i++) {
    const tgt = getTargetPos(i);
    const pos = new THREE.Vector3(tgt.x, 0, tgt.z + 1.15).project(camera);
    tagEls[i].style.left = (pos.x * 0.5 + 0.5) * w + 'px';
    tagEls[i].style.top = (pos.y * -0.5 + 0.5) * h + 'px';
  }
}
function updateTags() {
  tagEls.forEach((t, i) => t.classList.toggle('on', G.state[i] === 'sel' && !G.rolling));
}

// Compute a flat-landing quaternion that preserves the die's natural yaw
const FACE_NORMALS = [
  new THREE.Vector3( 1, 0, 0), new THREE.Vector3(-1, 0, 0),
  new THREE.Vector3( 0, 1, 0), new THREE.Vector3( 0,-1, 0),
  new THREE.Vector3( 0, 0, 1), new THREE.Vector3( 0, 0,-1)
];
function flattenQuaternion(physicsQ, faceUp) {
  const faceWorld = FACE_NORMALS[faceUp].clone().applyQuaternion(physicsQ);
  const correction = new THREE.Quaternion().setFromUnitVectors(faceWorld, new THREE.Vector3(0, 1, 0));
  return correction.multiply(physicsQ);
}

// Simulate one die with cannon, then shift the path so it lands on its spot
function precalculateRoll(tx,tz) {
  const world=new CANNON.World();
  world.gravity.set(0,-55,0);
  const floor=new CANNON.Body({mass:0});
  floor.addShape(new CANNON.Plane());
  floor.quaternion.setFromAxisAngle(new CANNON.Vec3(1,0,0),-Math.PI/2);
  world.addBody(floor);

  const die=new CANNON.Body({mass:1, linearDamping:0.2, angularDamping:0.2});
  die.addShape(new CANNON.Box(new CANNON.Vec3(0.8,0.8,0.8)));
  // Lower drop than Yahtzee: the canvas is clipped to the dice box, so dice must not start near the camera
  die.position.set((Math.random()-0.5)*5, 6+Math.random()*2.5, -1.5+Math.random()*2);
  die.velocity.set((Math.random()-0.5)*15, -6-Math.random()*10, (Math.random()-0.5)*10);
  die.angularVelocity.set((Math.random()-0.5)*25,(Math.random()-0.5)*25,(Math.random()-0.5)*25);
  world.addBody(die);

  const traj=[], bounceMap=new Map(), dt=1/60;
  let lastDy=die.velocity.y;
  for(let i=0;i<85;i++) {
    if(i>35){die.linearDamping=0.8; die.angularDamping=0.8;}
    world.step(dt);
    if(lastDy<0&&die.velocity.y>0&&Math.abs(lastDy)>0.5) bounceMap.set(i,Math.abs(lastDy));
    lastDy=die.velocity.y;
    traj.push({
      p:new THREE.Vector3(die.position.x,die.position.y,die.position.z),
      q:new THREE.Quaternion(die.quaternion.x,die.quaternion.y,die.quaternion.z,die.quaternion.w)
    });
  }

  const endP=traj[traj.length-1].p, endQ=traj[traj.length-1].q;
  const dx=tx-endP.x, dz=tz-endP.z;
  for(let t of traj){t.p.x+=dx; t.p.z+=dz;}

  const localUp=new THREE.Vector3(0,1,0).applyQuaternion(endQ.clone().invert());
  let max=-1, faceUp=0;
  for(let i=0;i<6;i++){const dot=localUp.dot(FACE_NORMALS[i]); if(dot>max){max=dot; faceUp=i;}}

  const flatQ = flattenQuaternion(endQ, faceUp);
  const snapStart = traj.length - 10;
  for(let i = snapStart; i < traj.length; i++){
    const t = (i - snapStart + 1) / 10;
    traj[i].q.slerp(flatQ, t * t);
  }
  return {traj, bounceMap, faceUp};
}

// --- Turn Actions ---
async function doRoll() {
  if(!G || G.rolling || G.pendingNext || G.over) return;
  initAudio();

  if(G.rolled) {
    const s = selection();
    if(!s.valid) { sndError(); setHint('Keep at least one complete scoring set first', true); return; }
    G.turnPts += s.pts;
    s.idxs.forEach(i => G.state[i] = 'kept');
    bump('turn-pts');
    if(G.state.every(st => st === 'kept')) {
      G.state = new Array(N_DICE).fill('free');
      sndHot();
      showNotif('Hot dice! Roll all six again 🔥', G.players[G.cur].color);
      diceMeshes.forEach((d, i) => d.mesh.material = matsFor(i));
    } else {
      s.idxs.forEach(i => diceMeshes[i].mesh.material = matsFor(i));
    }
  }

  const free = idxWhere('free');
  G.rolling = true;
  free.forEach(i => G.dice[i] = Math.ceil(Math.random() * 6));
  G.rolled = true;
  saveState();
  updateUI();
  sndRattle(free.length);

  free.forEach(i => {
    const tgt = getTargetPos(i);
    const res = precalculateRoll(tgt.x, tgt.z);
    diceMeshes[i].currentFaceUp = res.faceUp;
    diceMeshes[i].mesh.material = getMaterialsForValue(G.dice[i], res.faceUp, normalMats);
    rollingDice.push({mesh: diceMeshes[i].mesh, traj: res.traj, bounceMap: res.bounceMap, frame: 0});
  });

  await new Promise(r => {
    const check = () => rollingDice.length === 0 ? r() : requestAnimationFrame(check);
    check();
  });
  G.rolling = false;

  if(scoreDice(free.map(i => G.dice[i])).pts === 0) {
    farkle();
    return;
  }
  saveState();
  updateUI();
}

function farkle() {
  const p = G.players[G.cur];
  const lost = G.turnPts;
  G.turnPts = 0;
  G.pendingNext = true;
  saveState();
  updateUI();
  sndError();
  setTimeout(() => sndError(), 140);
  dcEl.classList.remove('farkle'); void dcEl.offsetWidth; dcEl.classList.add('farkle');
  showNotif(lost > 0 ? `Farkle! ${p.name} loses ${lost.toLocaleString()} points` : `Farkle! Nothing scores`, p.color, true);
  setTimeout(nextTurn, 2400);
}

function bank() {
  if(!G || !G.rolled || G.rolling || G.pendingNext || G.over) return;
  initAudio();
  const s = selection();
  if(!s.valid) { sndError(); setHint('Keep at least one complete scoring set first', true); return; }
  const total = G.turnPts + s.pts;
  if(!G.onBoard[G.cur] && total < G.opening) {
    sndError();
    setHint(`You need ${G.opening} in one turn to get on the board`, true);
    return;
  }
  const p = G.players[G.cur];
  G.scores[G.cur] += total;
  G.onBoard[G.cur] = true;
  G.pendingNext = true; // locks input until the turn changes
  sndScore();
  let msg = `${p.name} banks ${total.toLocaleString()}`, delay = 1000;
  if(G.finalFrom === null && G.scores[G.cur] >= G.target) {
    G.finalFrom = G.cur;
    msg = `${p.name} reached ${G.target.toLocaleString()}!${G.players.length > 1 ? ' Final round' : ''}`;
    delay = 1800;
  }
  saveState();
  updateUI();
  showNotif(msg, p.color);
  setTimeout(nextTurn, delay);
}

function toggleDie(i) {
  if(!G || !G.rolled || G.rolling || G.pendingNext || G.over) return;
  if(G.state[i] === 'kept') return;
  initAudio();
  if(G.state[i] === 'free') {
    const candidates = idxWhere('free').concat(idxWhere('sel'));
    if(!scoringSet(candidates).has(i)) {
      sndError();
      setHint("That die doesn't score", true);
      return;
    }
    G.state[i] = 'sel';
  } else {
    G.state[i] = 'free';
  }
  sndClick();
  diceMeshes[i].mesh.material = matsFor(i);
  saveState();
  updateUI();
}

// --- UI ---
let hintOverride = null;
function setHint(msg, warn) {
  hintOverride = {msg, warn};
  renderHint();
  clearTimeout(setHint.t);
  setHint.t = setTimeout(() => { hintOverride = null; renderHint(); }, 2200);
}

function renderHint() {
  const el = document.getElementById('hint');
  if(hintOverride) {
    el.textContent = hintOverride.msg;
    el.classList.toggle('warn', !!hintOverride.warn);
    return;
  }
  el.classList.remove('warn');
  const s = selection();
  let msg = '';
  if(G.pendingNext || G.rolling) msg = '';
  else if(!G.rolled) msg = G.onBoard[G.cur] ? 'Roll to start your turn' : `Roll to start. You need ${G.opening} to get on the board`;
  else if(s.idxs.length === 0) msg = 'Tap scoring dice to keep them';
  else if(!s.valid) { msg = 'Select complete sets only'; el.classList.add('warn'); }
  else if(idxWhere('free').length === 0) msg = 'Hot dice! Roll all six again, or bank';
  else msg = 'Bank it, or keep rolling';
  el.textContent = msg;
}

function bump(id) {
  const el = document.getElementById(id);
  el.classList.remove('bump'); void el.offsetWidth; el.classList.add('bump');
}

function updateUI() {
  const p = G.players[G.cur];
  const hPlayer = document.getElementById('h-player');
  hPlayer.textContent = `${p.name}'s turn`;
  hPlayer.style.color = p.color;
  document.getElementById('h-round').textContent = G.finalFrom !== null ? 'Final round' : `Round ${G.round}`;

  const strip = document.getElementById('score-strip');
  strip.innerHTML = '';
  G.players.forEach((pl, i) => {
    const el = document.createElement('div');
    el.className = `p-score ${i === G.cur ? 'active' : ''}`;
    if(i === G.cur) el.style.borderColor = pl.color;
    el.innerHTML = `
      <div class="top-row">
        <div class="p-dot" style="background:${pl.color}"></div>
        <span class="p-name">${pl.name}</span>
      </div>
      <span class="p-val" style="color:${pl.color}">${G.scores[i].toLocaleString()}${G.onBoard[i] ? '' : ' <span class="off">not on board</span>'}</span>
    `;
    strip.appendChild(el);
  });

  const s = selection();
  document.getElementById('turn-pts').textContent = G.turnPts.toLocaleString();
  const selEl = document.getElementById('sel-pts');
  selEl.textContent = s.valid ? s.pts.toLocaleString() : '0';
  selEl.classList.toggle('bad', s.idxs.length > 0 && !s.valid);

  const rollBtn = document.getElementById('roll-btn');
  const bankBtn = document.getElementById('bank-btn');
  const busy = G.rolling || G.pendingNext || G.over;
  const remaining = idxWhere('free').length;
  const hot = G.rolled && s.valid && remaining === 0;
  rollBtn.disabled = busy || (G.rolled && !s.valid);
  rollBtn.classList.toggle('hot', hot && !busy);
  rollBtn.textContent = !G.rolled ? 'Roll' : hot ? 'Roll all 6 🔥' : `Roll ${remaining}`;
  bankBtn.disabled = busy || !G.rolled || !s.valid;
  bankBtn.textContent = s.valid && G.rolled ? `Bank ${(G.turnPts + s.pts).toLocaleString()}` : 'Bank';

  updateTags();
  renderHint();
}

let notifTimer;
function showNotif(msg, color, bad) {
  clearTimeout(notifTimer);
  const notifEl = document.getElementById('notif');
  notifEl.classList.toggle('bad', !!bad);
  document.getElementById('n-dot').style.background = bad ? '#fff' : (color || 'transparent');
  document.getElementById('n-dot').style.display = color ? 'block' : 'none';
  document.getElementById('n-txt').textContent = msg;
  notifEl.classList.add('on');
  notifTimer = setTimeout(() => notifEl.classList.remove('on'), bad ? 2300 : 1800);
}

// --- Game Over ---
function showOver() {
  clearTimeout(notifTimer);
  document.getElementById('notif').classList.remove('on');
  const results = G.players.map((p, i) => ({p, i, t: G.scores[i]})).sort((a, b) => b.t - a.t);
  const solo = G.players.length === 1;
  document.getElementById('over-card').innerHTML = results.map((r, rank) => `
    <div class="over-row${rank === 0 ? ' win' : ''}">
      <span class="over-med">${MEDALS[rank]}</span>
      <div class="over-dot" style="background:${r.p.color}"></div>
      <span class="over-name">${r.p.name}</span>
      <span class="over-score">${solo ? `${G.turns[r.i]} turns` : r.t.toLocaleString()}</span>
    </div>`).join('');
  document.getElementById('over').classList.add('on');
}

// --- Setup & Init ---
let curTarget = 10000;
let curOpening = 0;

function buildNames(n) {
  const globalPlayers = JSON.parse(localStorage.getItem('mkers_players') || '[]');
  const el = document.getElementById('name-list'); el.innerHTML = '';
  for(let i=0; i<n; i++) {
    const row = document.createElement('div'); row.className = 'nrow';
    const dot = document.createElement('div'); dot.className = 'ndot'; dot.style.background = COLORS[i];
    const inp = document.createElement('input');
    inp.className = 'ninp'; inp.type = 'text'; inp.value = globalPlayers[i] || DEFAULTS[i];
    inp.placeholder = DEFAULTS[i]; inp.maxLength = 16;
    row.appendChild(dot); row.appendChild(inp); el.appendChild(row);
  }
}

function bindChoice(rowId, fn) {
  document.querySelectorAll(`#${rowId} .cnt`).forEach(b => {
    b.addEventListener('click', () => {
      document.querySelectorAll(`#${rowId} .cnt`).forEach(x => x.classList.remove('on'));
      b.classList.add('on');
      fn(b);
    });
  });
}
bindChoice('player-btns', b => buildNames(+b.dataset.n));
bindChoice('target-btns', b => curTarget = +b.dataset.t);
bindChoice('open-btns', b => curOpening = +b.dataset.o);

function showApp() {
  document.getElementById('setup').style.display = 'none';
  document.getElementById('app').style.display = 'flex';
  init3D();
  updateUI();
}

document.getElementById('start-btn').addEventListener('click', () => {
  const names = [...document.querySelectorAll('.ninp')].map(i => i.value.trim() || i.placeholder);
  const globalPlayers = JSON.parse(localStorage.getItem('mkers_players') || '[]');
  for(let i=0; i<names.length; i++) globalPlayers[i] = names[i];
  localStorage.setItem('mkers_players', JSON.stringify(globalPlayers));

  initAudio();
  sndClick();
  newGame(names, curTarget, curOpening);
  showApp();
  showNotif(`${G.players[0].name}'s turn`, G.players[0].color);
});

document.getElementById('roll-btn').addEventListener('click', doRoll);
document.getElementById('bank-btn').addEventListener('click', bank);
document.getElementById('btn-rules').addEventListener('click', () => {
  document.getElementById('rules').classList.toggle('on');
  document.getElementById('btn-rules').classList.toggle('on');
});

document.getElementById('btn-restart').addEventListener('click', () => {
  localStorage.removeItem('farkle_state');
  location.reload();
});
document.getElementById('btn-play-again').addEventListener('click', () => {
  localStorage.removeItem('farkle_state');
  location.reload();
});

function initApp() {
  const saved = localStorage.getItem('farkle_state');
  if(saved) {
    try {
      G = JSON.parse(saved);
      G.rolling = false;
      showApp();
      if(G.over) showOver();
      else if(G.pendingNext) nextTurn();
      // Reloaded mid-roll before the farkle check ran: run it now so the turn can't get stuck
      else if(G.rolled && scoreDice(idxWhere('free').concat(idxWhere('sel')).map(i => G.dice[i])).pts === 0) farkle();
    } catch(e) {
      buildNames(2);
    }
  } else {
    buildNames(2);
  }
}

initApp();
