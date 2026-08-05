// Data & Rules
const COLORS   = ['#d97706','#2563eb','#16a34a','#dc2626'];
const DEFAULTS = ['Player 1','Player 2','Player 3','Player 4'];
const MEDALS   = ['🥇','🥈','🥉','4️⃣'];
const PIPS = {
  1:[4], 2:[2,6], 3:[2,4,6],
  4:[0,2,6,8], 5:[0,2,4,6,8], 6:[0,2,3,5,6,8]
};
const CATS = [
  {id:'ones',lbl:'Ones',sec:'U'}, {id:'twos',lbl:'Twos',sec:'U'},
  {id:'threes',lbl:'Threes',sec:'U'}, {id:'fours',lbl:'Fours',sec:'U'},
  {id:'fives',lbl:'Fives',sec:'U'}, {id:'sixes',lbl:'Sixes',sec:'U'},
  {id:'3k',lbl:'Three of a Kind',sec:'L'}, {id:'4k',lbl:'Four of a Kind',sec:'L'},
  {id:'fh',lbl:'Full House',sec:'L'}, {id:'sm',lbl:'Sm. Straight',sec:'L'},
  {id:'lg',lbl:'Lg. Straight',sec:'L'}, {id:'ytz',lbl:'Yahtzee',sec:'L'},
  {id:'chance',lbl:'Chance',sec:'L'}
];
const UPPER = CATS.filter(c=>c.sec==='U').map(c=>c.id);
const ALL   = CATS.map(c=>c.id);

function calcScore(id, dice) {
  const c = new Array(7).fill(0); dice.forEach(d=>c[d]++);
  const sum = dice.reduce((a,b)=>a+b,0), max = Math.max(...c);
  switch(id) {
    case 'ones': return c[1];
    case 'twos': return c[2]*2;
    case 'threes': return c[3]*3;
    case 'fours': return c[4]*4;
    case 'fives': return c[5]*5;
    case 'sixes': return c[6]*6;
    case '3k': return max>=3?sum:0;
    case '4k': return max>=4?sum:0;
    case 'fh': return c.some(v=>v===3)&&c.some(v=>v===2)?25:0;
    case 'sm': {
      const u=[...new Set(dice)].sort((a,b)=>a-b);
      let b=1,r=1; for(let i=1;i<u.length;i++) u[i]===u[i-1]+1?b=Math.max(b,++r):r=1;
      return b>=4?30:0;
    }
    case 'lg': {
      const u=[...new Set(dice)].sort((a,b)=>a-b); if(u.length<5)return 0;
      let r=1; for(let i=1;i<u.length;i++) u[i]===u[i-1]+1?r++:r=1;
      return r>=5?40:0;
    }
    case 'ytz': return max===5?50:0;
    case 'chance': return sum;
    default: return 0;
  }
}
const upperTotal = sh=>UPPER.reduce((a,k)=>a+(sh[k]??0),0);
const upperBonus = sh=>upperTotal(sh)>=63?35:0;
const grandTotal = sh=>ALL.reduce((a,k)=>a+(sh[k]??0),0)+upperBonus(sh);

let G;
function newGame(names) {
  G = {
    players: names.map((n,i)=>({name:n,color:COLORS[i]})),
    sheets: names.map(()=>({})),
    cur:0, round:1, rollsLeft:3,
    dice:[1,2,3,4,5], locked:[false,false,false,false,false],
    rolled:false, rolling:false,
  };
}
function nextTurn() {
  G.cur=(G.cur+1)%G.players.length;
  if(G.cur===0) G.round++;
  G.rollsLeft=3; G.dice=[1,2,3,4,5];
  G.locked=[false,false,false,false,false]; G.rolled=false;
}
const isDone = ()=>G.sheets.every(sh=>ALL.every(k=>sh[k]!==undefined));

// ─── Audio Subsystem ────────────────────────────────────────────────────────
let _AC = null;
function ac() {
  if(!_AC) _AC=new(window.AudioContext||window.webkitAudioContext)();
  if(_AC.state==='suspended') _AC.resume();
  return _AC;
}
function sndImpact(intensity) {
  const a = ac(), now = a.currentTime;
  const amp = Math.min(1.0, intensity/30);
  if(amp < 0.03) return;

  const gTable = a.createGain();
  gTable.gain.setValueAtTime(0, now);
  gTable.gain.linearRampToValueAtTime(amp*0.4, now+0.002);
  gTable.gain.exponentialRampToValueAtTime(0.001, now+0.08);
  const oscTable = a.createOscillator(); oscTable.type='sine';
  oscTable.frequency.setValueAtTime(150, now);
  oscTable.frequency.exponentialRampToValueAtTime(60, now+0.04);
  oscTable.connect(gTable); gTable.connect(a.destination);
  oscTable.start(now); oscTable.stop(now+0.1);

  [2400,3600,4800].forEach(f=>{
    const g=a.createGain();
    g.gain.setValueAtTime(0,now);
    g.gain.linearRampToValueAtTime(amp*0.15,now+0.001);
    g.gain.exponentialRampToValueAtTime(0.001,now+0.015);
    const osc=a.createOscillator(); osc.type='sine';
    osc.frequency.value=f+(Math.random()*300-150);
    osc.connect(g); g.connect(a.destination);
    osc.start(now); osc.stop(now+0.02);
  });

  const len=Math.floor(a.sampleRate*0.005);
  const buf=a.createBuffer(1,len,a.sampleRate);
  const dat=buf.getChannelData(0);
  for(let i=0;i<len;i++) dat[i]=(Math.random()*2-1)*Math.exp(-i/(len*0.3));
  const src=a.createBufferSource(); src.buffer=buf;
  const nf=a.createBiquadFilter(); nf.type='highpass'; nf.frequency.value=3000;
  const ng=a.createGain(); ng.gain.value=amp*0.7;
  src.connect(nf); nf.connect(ng); ng.connect(a.destination);
  src.start(now);
}

// Cap at 12 shake-sound events regardless of how many dice are rolling,
// preventing audio-node thrashing when all 5 dice are in motion.
function sndShake(n) {
  if(n===0) return;
  const a=ac(), now=a.currentTime;
  const events=Math.min(n*4, 12);
  for(let i=0;i<events;i++) {
    const t=now+Math.random()*0.25;
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
function sndClick(isLocking) {
  const a=ac(), osc=a.createOscillator(), g=a.createGain();
  osc.type='sine'; osc.frequency.value=isLocking?900:540;
  g.gain.setValueAtTime(0.07,a.currentTime);
  g.gain.exponentialRampToValueAtTime(0.001,a.currentTime+0.055);
  osc.connect(g); g.connect(a.destination); osc.start(); osc.stop(a.currentTime+0.055);
}
function sndScore() {
  const a=ac();
  [[440,0],[660,0.09]].forEach(([f,t])=>{
    const osc=a.createOscillator(), g=a.createGain();
    osc.type='sine'; osc.frequency.value=f;
    g.gain.setValueAtTime(0,a.currentTime+t);
    g.gain.linearRampToValueAtTime(0.22,a.currentTime+t+0.015);
    g.gain.exponentialRampToValueAtTime(0.001,a.currentTime+t+0.22);
    osc.connect(g); g.connect(a.destination);
    osc.start(a.currentTime+t); osc.stop(a.currentTime+t+0.22);
  });
}
function sndYahtzee() {
  const a=ac();
  [523,659,784,1047].forEach((f,i)=>{
    const osc=a.createOscillator(), g=a.createGain();
    osc.type='triangle'; osc.frequency.value=f;
    g.gain.setValueAtTime(0,a.currentTime+i*0.11);
    g.gain.linearRampToValueAtTime(0.28,a.currentTime+i*0.11+0.02);
    g.gain.exponentialRampToValueAtTime(0.001,a.currentTime+i*0.11+0.32);
    osc.connect(g); g.connect(a.destination);
    osc.start(a.currentTime+i*0.11); osc.stop(a.currentTime+i*0.11+0.32);
  });
}

// ─── 3D Physics & Rendering ─────────────────────────────────────────────────
let normalMats=[], lockedMats=[], preMats=[];
let scene, camera, renderer, diceMeshes=[], rollingDice=[];
const raycaster = new THREE.Raycaster();

// Cached once in init3D — avoids repeated getElementById on every frame/event
let appEl   = null;
let htagEls = null;

function getTargetPos(i) {
  if(i<3) return {x:(i-1)*2.2, z:-1.1};
  return {x:(i-3.5)*2.2, z:1.1};
}

function initMats() {
  normalMats = createDiceMaterials(false);
  lockedMats = createDiceMaterials(true);

  const canvas=document.createElement('canvas'); canvas.width=128; canvas.height=128;
  const ctx=canvas.getContext('2d');
  ctx.fillStyle='#f5f5f5'; ctx.fillRect(0,0,128,128);
  ctx.strokeStyle='#e0e0e0'; ctx.lineWidth=12; ctx.strokeRect(0,0,128,128);
  const tex=new THREE.CanvasTexture(canvas); tex.anisotropy=4;
  const preMat=new THREE.MeshStandardMaterial({map:tex, roughness:0.2});
  preMats=new Array(6).fill(preMat);
}

function createDiceMaterials(locked) {
  const mats=[null];
  for(let i=1;i<=6;i++) {
    const canvas=document.createElement('canvas'); canvas.width=128; canvas.height=128;
    const ctx=canvas.getContext('2d');
    ctx.fillStyle=locked?'#fffbeb':'#ffffff'; ctx.fillRect(0,0,128,128);
    ctx.strokeStyle=locked?'#d97706':'#d4d0ca'; ctx.lineWidth=12; ctx.strokeRect(0,0,128,128);
    ctx.fillStyle=locked?'#92400e':'#111111';
    for(let d of PIPS[i]) {
      const col=d%3, row=Math.floor(d/3);
      ctx.beginPath(); ctx.arc(28+col*36, 28+row*36, 11, 0, Math.PI*2); ctx.fill();
    }
    const tex=new THREE.CanvasTexture(canvas); tex.anisotropy=4;
    mats.push(new THREE.MeshStandardMaterial({map:tex, roughness:0.1}));
  }
  return mats;
}

function getMaterialsForValue(v, faceUp, srcMats) {
  const res=new Array(6);
  const pairIndex=Math.floor(faceUp/2);
  res[faceUp]=srcMats[v];
  res[faceUp%2===0 ? faceUp+1 : faceUp-1]=srcMats[7-v];

  // Exclude the pair containing v (and its opposite 7-v) — both sides of each pair filtered
  const avail=[[1,6],[2,5],[3,4]].filter(p=>p[0]!==v && p[1]!==v && p[0]!==7-v && p[1]!==7-v);
  let aIdx=0;
  for(let i=0;i<3;i++) {
    if(i===pairIndex) continue;
    if(avail[aIdx]) { // defensive guard against unexpected underflow
      res[i*2]  =srcMats[avail[aIdx][0]];
      res[i*2+1]=srcMats[avail[aIdx][1]];
    }
    aIdx++;
  }
  return res;
}

function init3D() {
  initMats();
  appEl=document.getElementById('app');
  const dc=document.getElementById('dice-container');
  const cl=document.getElementById('canvas-layer');

  // Cache held-tag elements — avoids getElementById on every alignHeldTags / updateHeldTags call
  htagEls=Array.from({length:5},(_,i)=>document.getElementById(`htag-${i}`));

  scene=new THREE.Scene();
  camera=new THREE.PerspectiveCamera(32, dc.clientWidth/dc.clientHeight, 0.1, 100);
  camera.position.set(0,10,1.5); camera.lookAt(0,0,0);

  renderer=new THREE.WebGLRenderer({antialias:true, alpha:true});
  renderer.setPixelRatio(window.devicePixelRatio);
  renderer.shadowMap.enabled=true;
  renderer.shadowMap.type=THREE.PCFSoftShadowMap;
  renderer.setClearColor(0x000000,0);
  cl.appendChild(renderer.domElement);

  const amb=new THREE.AmbientLight(0xffffff,0.65); scene.add(amb);
  const dir=new THREE.DirectionalLight(0xffffff,0.45);
  dir.position.set(2,10,4); dir.castShadow=true;
  dir.shadow.mapSize.width=1024; dir.shadow.mapSize.height=1024;
  scene.add(dir);

  const floor=new THREE.Mesh(new THREE.PlaneGeometry(50,50), new THREE.ShadowMaterial({opacity:0.12}));
  floor.rotation.x=-Math.PI/2; floor.receiveShadow=true; scene.add(floor);

  const geo=new THREE.BoxGeometry(1.6,1.6,1.6);
  for(let i=0;i<5;i++) {
    const tgt=getTargetPos(i);
    const mesh=new THREE.Mesh(geo,preMats);
    mesh.castShadow=true; mesh.receiveShadow=true;
    mesh.position.set(tgt.x,0.8,tgt.z);
    mesh.rotation.set(0,Math.random()*0.5-0.25,0);
    scene.add(mesh);
    diceMeshes.push({mesh, currentFaceUp:2});
  }

  // ── iOS Safari dice-tap fix ──────────────────────────────────────────────
  // iOS Safari won't fire 'click' on a plain <div> that isn't marked interactive.
  // The canvas sits inside #canvas-layer (pointer-events:none), so taps fall
  // through to #dice-container — a div iOS considers non-clickable.
  // Fix: listen to 'touchend' (always reliable on iOS) AND 'click' (desktop/Android),
  // deduplicated via timestamp so the iOS click that fires ~300ms after touchend
  // doesn't double-toggle the die.

  let _lastTouchHitMs = 0;

  function _hitTestDice(clientX, clientY) {
    if(!G||!G.rolled||G.rolling||G.rollsLeft===0) return false;
    const rect=appEl.getBoundingClientRect();
    if(clientX<rect.left||clientX>rect.right||clientY<rect.top||clientY>rect.bottom) return false;
    const mouse=new THREE.Vector2(
      ((clientX-rect.left)/rect.width)*2-1,
      -((clientY-rect.top)/rect.height)*2+1
    );
    raycaster.setFromCamera(mouse,camera);
    const hits=raycaster.intersectObjects(diceMeshes.map(d=>d.mesh));
    if(hits.length>0) {
      const idx=diceMeshes.findIndex(d=>d.mesh===hits[0].object);
      if(idx!==-1){ toggleLock(idx); return true; }
    }
    return false;
  }

  // touchend: fires on iOS even for non-interactive elements
  window.addEventListener('touchend',(e)=>{
    if(!e.changedTouches.length) return;
    const t=e.changedTouches[0];
    if(_hitTestDice(t.clientX,t.clientY)) _lastTouchHitMs=performance.now();
  },{passive:true});

  // click: desktop + Android; skip within 700ms of a touchend that already handled it
  window.addEventListener('click',(e)=>{
    if(performance.now()-_lastTouchHitMs<700) return;
    _hitTestDice(e.clientX,e.clientY);
  },true);

  function updateCamera() {
    if(!appEl.clientWidth||!dc.clientWidth) return;
    const vW=dc.clientWidth, vH=dc.clientHeight;
    const fW=appEl.clientWidth, fH=appEl.clientHeight;
    const rectApp=appEl.getBoundingClientRect();
    const rectDc=dc.getBoundingClientRect();
    const offsetX=rectDc.left-rectApp.left;
    const offsetY=rectDc.top-rectApp.top;
    camera.aspect=vW/vH;
    camera.setViewOffset(vW,vH,-offsetX,-offsetY,fW,fH);
    camera.updateProjectionMatrix();
    renderer.setSize(fW,fH);
    alignHeldTags();
  }
  window.addEventListener('resize',updateCamera);

  function animate() {
    requestAnimationFrame(animate);
    if(rollingDice.length>0) {
      let allDone=true;
      for(let rd of rollingDice) {
        if(rd.frame<rd.traj.length) {
          allDone=false;
          const t=rd.traj[rd.frame];
          rd.mesh.position.copy(t.p);
          rd.mesh.quaternion.copy(t.q);
          // O(1) Map lookup instead of O(n) Array.find() on every frame
          const intensity=rd.bounceMap.get(rd.frame);
          if(intensity!==undefined) sndImpact(intensity);
          rd.frame++;
        }
      }
      if(allDone) rollingDice=[];
    }
    renderer.render(scene,camera);
  }
  animate();

  // ResizeObserver fires exactly once when the container gets real dimensions —
  // no blind setTimeout race condition.
  const ro=new ResizeObserver(()=>{
    if(dc.clientWidth>0&&dc.clientHeight>0){ro.disconnect(); updateCamera();}
  });
  ro.observe(dc);
}

function alignHeldTags() {
  if(!camera||!renderer||!htagEls) return;
  const rect=appEl.getBoundingClientRect();
  for(let i=0;i<5;i++) {
    const tgt=getTargetPos(i);
    const pos=new THREE.Vector3(tgt.x,0,tgt.z+1.2);
    pos.project(camera);
    htagEls[i].style.left=(pos.x*0.5+0.5)*rect.width+'px';
    htagEls[i].style.top=(pos.y*-0.5+0.5)*rect.height+'px';
  }
}
function updateHeldTags() {
  if(!htagEls) return;
  for(let i=0;i<5;i++) {
    // classList.toggle(name, force) — single call instead of if/else add/remove
    htagEls[i].classList.toggle('on', G.locked[i]&&!G.rolling);
  }
}

// Compute a flat-landing quaternion that preserves the die's natural yaw.
// Instead of snapping to a canonical rotation (which makes all dice look
// grid-aligned), we find the minimal tilt correction: the smallest rotation
// that takes the top-face normal from wherever it is → straight up (+Y),
// and multiply it with the physics quaternion. The yaw is untouched.
const FACE_NORMALS = [
  new THREE.Vector3( 1, 0, 0),  // face 0: +X
  new THREE.Vector3(-1, 0, 0),  // face 1: -X
  new THREE.Vector3( 0, 1, 0),  // face 2: +Y
  new THREE.Vector3( 0,-1, 0),  // face 3: -Y
  new THREE.Vector3( 0, 0, 1),  // face 4: +Z
  new THREE.Vector3( 0, 0,-1),  // face 5: -Z
];

function flattenQuaternion(physicsQ, faceUp) {
  // Where the top face's local normal currently points in world space
  const faceWorld = FACE_NORMALS[faceUp].clone().applyQuaternion(physicsQ);
  // Minimal rotation from that direction → straight up
  const correction = new THREE.Quaternion().setFromUnitVectors(
    faceWorld,
    new THREE.Vector3(0, 1, 0)
  );
  // correction * physicsQ = flat on the table, yaw preserved
  return correction.multiply(physicsQ);
}
function precalculateRoll(tx,tz) {
  const world=new CANNON.World();
  world.gravity.set(0,-55,0);
  const floor=new CANNON.Body({mass:0});
  floor.addShape(new CANNON.Plane());
  floor.quaternion.setFromAxisAngle(new CANNON.Vec3(1,0,0),-Math.PI/2);
  world.addBody(floor);

  const die=new CANNON.Body({mass:1, linearDamping:0.2, angularDamping:0.2});
  die.addShape(new CANNON.Box(new CANNON.Vec3(0.8,0.8,0.8)));
  die.position.set((Math.random()-0.5)*5, 12+Math.random()*4, -1.5+Math.random()*2);
  die.velocity.set((Math.random()-0.5)*15, -8-Math.random()*15, (Math.random()-0.5)*10);
  die.angularVelocity.set((Math.random()-0.5)*25,(Math.random()-0.5)*25,(Math.random()-0.5)*25);
  world.addBody(die);

  const traj=[];
  // Bounces stored as frame→intensity Map for O(1) lookup in the hot animation loop
  const bounceMap=new Map();
  const dt=1/60;
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

  const endP=traj[traj.length-1].p;
  const endQ=traj[traj.length-1].q;
  const dx=tx-endP.x, dz=tz-endP.z;
  for(let t of traj){t.p.x+=dx; t.p.z+=dz;}

  const localUp=new THREE.Vector3(0,1,0).applyQuaternion(endQ.clone().invert());
  const normals=[
    new THREE.Vector3(1,0,0),new THREE.Vector3(-1,0,0),
    new THREE.Vector3(0,1,0),new THREE.Vector3(0,-1,0),
    new THREE.Vector3(0,0,1),new THREE.Vector3(0,0,-1)
  ];
  let max=-1, faceUp=0;
  for(let i=0;i<6;i++){const dot=localUp.dot(normals[i]); if(dot>max){max=dot; faceUp=i;}}

  // Smooth slerp into perfectly flat landing over the last 10 frames.
  // flatQ preserves the die's natural yaw — only the tilt is corrected.
  const flatQ = flattenQuaternion(endQ, faceUp);
  const snapStart = traj.length - 10;
  const snapLen = traj.length - snapStart; // = 10
  for(let i = snapStart; i < traj.length; i++){
    const t = (i - snapStart + 1) / snapLen; // 0.1 → 1.0
    traj[i].q.slerp(flatQ, t * t);           // ease-in, fully flat at last frame
  }

  return {traj, bounceMap, faceUp};
}

async function doRoll() {
  if(G.rolling||G.rollsLeft<=0) return;
  G.rolling=true;
  updateHeldTags(); updateRollBtn();
  sndShake(G.locked.filter(l=>!l).length);

  for(let i=0;i<5;i++) if(!G.locked[i]) G.dice[i]=Math.ceil(Math.random()*6);
  G.rollsLeft--;
  G.rolled=true;

  for(let i=0;i<5;i++) {
    if(!G.locked[i]) {
      const tgt=getTargetPos(i);
      const res=precalculateRoll(tgt.x,tgt.z);
      diceMeshes[i].currentFaceUp=res.faceUp;
      diceMeshes[i].mesh.material=getMaterialsForValue(G.dice[i],res.faceUp,normalMats);
      rollingDice.push({mesh:diceMeshes[i].mesh, traj:res.traj, bounceMap:res.bounceMap, frame:0});
    }
  }

  await new Promise(r=>{
    const check=()=>rollingDice.length===0?r():requestAnimationFrame(check);
    check();
  });

  G.rolling=false;
  updateHeldTags(); updateRollBtn(); updateScorecard();
  hideScoreConfirm(); // rolling cancels any pending zero-score confirmation
}

function toggleLock(i) {
  if(!G.rolled||G.rolling||G.rollsLeft===0) return;
  G.locked[i]=!G.locked[i];
  sndClick(G.locked[i]);
  diceMeshes[i].mesh.material=getMaterialsForValue(G.dice[i],diceMeshes[i].currentFaceUp,G.locked[i]?lockedMats:normalMats);
  updateHeldTags();
}

function pickScore(id) {
  if(!G.rolled||G.rolling||G.sheets[G.cur][id]!==undefined) return;
  const s=calcScore(id,G.dice);

  // Zero-score misclick protection: require explicit confirmation on first tap
  if(s===0 && pendingScoreId!==id) {
    showScoreConfirm(id);
    return;
  }

  // Either a positive score, or the player confirmed the zero — proceed
  hideScoreConfirm();

  G.sheets[G.cur][id]=s;
  if(id==='ytz'&&s===50) sndYahtzee(); else sndScore();

  // Capture the direct cell reference BEFORE updateScorecard so the
  // animation targets the correct (already-existing) DOM node.
  const scoredCell=scRefs?.cats[id]?.[G.cur]?.sv;
  updateScorecard();

  const advance=()=>{
    if(isDone()||G.round>13){showOver(); return;}
    nextTurn();
    if(G.round>13){showOver(); return;}
    for(let i=0;i<5;i++) diceMeshes[i].mesh.material=preMats;
    updateHeldTags(); updateHeader(); updateRollBtn(); updateScorecard(); flashNotif();
  };

  // Advance the turn driven by the animation finishing — not a blind setTimeout
  if(scoredCell&&typeof scoredCell.animate==='function') {
    const anim=scoredCell.animate(
      [{opacity:1,transform:'scale(1)'},{opacity:0.4,transform:'scale(1.18)'},{opacity:1,transform:'scale(1)'}],
      {duration:380, easing:'ease-in-out'}
    );
    anim.onfinish=advance;
  } else {
    advance(); // fallback: WAAPI not available
  }
}

// ─── Zero-Score Confirmation ─────────────────────────────────────────────────

let pendingScoreId      = null;
let pendingCancelTimer  = null;
let pendingOutsideClick = null;

function showScoreConfirm(id) {
  // If a different zero-score is already pending, swap to the new one cleanly
  if(pendingScoreId !== null) _clearPendingState();

  pendingScoreId = id;
  const cat = CATS.find(c=>c.id===id);

  // Highlight the pending cell in the scorecard
  const cellRef = scRefs?.cats[id]?.[G.cur];
  if(cellRef) cellRef.td.classList.add('confirm-pending');

  // Populate and show the bar
  document.getElementById('sc-cat-name').textContent = cat?.lbl ?? id;
  const bar = document.getElementById('score-confirm');
  bar.classList.add('on');

  // Restart the countdown animation by toggling the class
  const cd = document.getElementById('sc-countdown');
  cd.classList.remove('draining');
  // rAF pair: first frame removes the class (above), second restarts the transition
  requestAnimationFrame(()=>requestAnimationFrame(()=>cd.classList.add('draining')));

  // Auto-cancel after 4 s (valid UI timer — not a layout dependency)
  pendingCancelTimer = setTimeout(hideScoreConfirm, 4000);

  // Cancel if the player clicks outside the confirm bar
  // Deferred by one rAF so the current click doesn't immediately trigger it
  pendingOutsideClick = (e)=>{
    if(!bar.contains(e.target)) hideScoreConfirm();
  };
  requestAnimationFrame(()=>document.addEventListener('click', pendingOutsideClick, true));
}

function hideScoreConfirm() {
  if(pendingScoreId===null) return;
  _clearPendingState();
}

function _clearPendingState() {
  // Remove cell highlight
  const cellRef = scRefs?.cats[pendingScoreId]?.[G.cur];
  if(cellRef) cellRef.td.classList.remove('confirm-pending');

  pendingScoreId = null;

  // Hide bar
  document.getElementById('score-confirm').classList.remove('on');

  // Cancel timers and listeners
  clearTimeout(pendingCancelTimer); pendingCancelTimer=null;
  if(pendingOutsideClick) {
    document.removeEventListener('click', pendingOutsideClick, true);
    pendingOutsideClick=null;
  }
}

// ─── Scorecard — build once, update in place ────────────────────────────────
//
// scRefs holds direct DOM references built once per game.
// updateScorecard() only mutates textContent and className — no DOM creation.

let scRefs=null;

function initScorecard() {
  const t=document.getElementById('sc');
  t.innerHTML='';
  scRefs={headers:[], cats:{}, bonus:[], totals:[]};

  // Header row
  const hr=t.createTHead().insertRow();
  hr.appendChild(document.createElement('th')); // blank corner cell
  G.players.forEach((p,i)=>{
    const el=document.createElement('th');
    el.textContent=p.name.length>9?p.name.slice(0,9)+'…':p.name;
    hr.appendChild(el);
    scRefs.headers.push(el);
  });

  const tbody=t.createTBody();

  buildSectRow(tbody,'Upper Section');
  CATS.filter(c=>c.sec==='U').forEach(c=>{scRefs.cats[c.id]=buildCatRow(tbody,c);});
  scRefs.bonus=buildBonusRow(tbody);

  buildSectRow(tbody,'Lower Section');
  CATS.filter(c=>c.sec==='L').forEach(c=>{scRefs.cats[c.id]=buildCatRow(tbody,c);});
  scRefs.totals=buildTotRow(tbody);

  updateScorecard();
}

function buildSectRow(tbody,lbl) {
  const tr=tbody.insertRow(); tr.className='sect';
  const td=document.createElement('td');
  td.colSpan=G.players.length+1; td.textContent=lbl; tr.appendChild(td);
}

/** Returns [{td,sv}] per player. Click listener is attached once here. */
function buildCatRow(tbody,cat) {
  const tr=tbody.insertRow(); tr.className='cat';
  const tdn=document.createElement('td'); tdn.className='cname'; tdn.textContent=cat.lbl; tr.appendChild(tdn);
  return G.players.map((_,i)=>{
    const td=document.createElement('td'); td.className='scell';
    const sv=document.createElement('span'); sv.className='v';
    td.appendChild(sv); tr.appendChild(td);
    // pickScore already guards: !G.rolled || G.rolling || score already set
    td.addEventListener('click',()=>pickScore(cat.id));
    return {td, sv};
  });
}

function buildBonusRow(tbody) {
  const tr=tbody.insertRow(); tr.className='bon';
  const tdn=document.createElement('td'); tdn.className='cname';
  tdn.textContent='Bonus (≥63 → +35)'; tdn.style.color='#bbb'; tr.appendChild(tdn);
  return G.players.map((_,i)=>{
    const td=document.createElement('td'); td.className='scell';
    const sv=document.createElement('span'); sv.className='v';
    td.appendChild(sv); tr.appendChild(td);
    return {td, sv};
  });
}

function buildTotRow(tbody) {
  const tr=tbody.insertRow(); tr.className='tot';
  const tdn=document.createElement('td'); tdn.textContent='Total'; tr.appendChild(tdn);
  return G.players.map((_,i)=>{
    const td=document.createElement('td'); td.className='scell';
    const sv=document.createElement('span'); sv.className='v tot';
    td.appendChild(sv); tr.appendChild(td);
    return {td, sv};
  });
}

/** Mutates cell content and classes in place — zero DOM node creation per call */
function updateScorecard() {
  if(!scRefs) return;

  // Headers
  G.players.forEach((p,i)=>{
    scRefs.headers[i].classList.toggle('cur',i===G.cur);
    scRefs.headers[i].style.color=i===G.cur?p.color:'';
  });

  // Category rows
  CATS.forEach(cat=>{
    scRefs.cats[cat.id].forEach(({td,sv},i)=>{
      const sh=G.sheets[i];
      td.className='scell'+(i===G.cur?' cur':'');
      if(sh[cat.id]!==undefined) {
        sv.className='v done'; sv.textContent=sh[cat.id];
      } else if(i===G.cur&&G.rolled) {
        const s=calcScore(cat.id,G.dice);
        sv.className='v '+(s>0?'pot':'zero');
        sv.textContent=s>0?s:'0';
      } else {
        sv.className='v blank'; sv.textContent='—';
      }
    });
  });

  // Bonus row
  scRefs.bonus.forEach(({td,sv},i)=>{
    const sh=G.sheets[i];
    const us=upperTotal(sh), b=upperBonus(sh);
    const filled=UPPER.filter(k=>sh[k]!==undefined).length;
    td.className='scell'+(i===G.cur?' cur':'');
    if(b>0)           {sv.className='v bon-on'; sv.textContent='+35';}
    else if(filled>0) {sv.className='v bon-pr'; sv.textContent=`${us}/63`;}
    else              {sv.className='v blank';  sv.textContent='—';}
  });

  // Total row
  scRefs.totals.forEach(({td,sv},i)=>{
    td.className='scell'+(i===G.cur?' cur':'');
    sv.textContent=grandTotal(G.sheets[i]);
    sv.style.color=i===G.cur?G.players[i].color:'';
  });
}

// ─── UI Helpers ─────────────────────────────────────────────────────────────
function updateHeader() {
  const p=G.players[G.cur];
  document.getElementById('h-player').textContent=p.name+"'s turn";
  document.getElementById('h-player').style.color=p.color;
  document.getElementById('h-round').textContent=`Round ${G.round} of 13`;
}
function updateRollBtn() {
  const btn=document.getElementById('roll-btn'), txt=document.getElementById('rolls-txt');
  const no=G.rollsLeft<=0;
  btn.disabled=no||G.rolling;
  btn.textContent=!G.rolled?'Roll':no?'Pick a score':'Roll again';
  txt.textContent=G.rollsLeft===1?'1 roll left':G.rollsLeft>0?`${G.rollsLeft} rolls left`:'';
}

let nTimer;
function flashNotif(msg) {
  const p=G.players[G.cur];
  document.getElementById('n-dot').style.background=p.color;
  document.getElementById('n-txt').textContent=msg||`${p.name}'s turn`;
  const el=document.getElementById('notif');
  el.classList.add('on'); clearTimeout(nTimer);
  nTimer=setTimeout(()=>el.classList.remove('on'),1800);
}

function showOver() {
  // Cancel in-flight timers so neither can fight the game-over overlay
  clearTimeout(nTimer);
  document.getElementById('notif').classList.remove('on');
  hideScoreConfirm();

  const results=G.players.map((p,i)=>({p,t:grandTotal(G.sheets[i])})).sort((a,b)=>b.t-a.t);
  document.getElementById('over-card').innerHTML=results.map((r,i)=>`
    <div class="over-row${i===0?' win':''}">
      <span class="over-med">${MEDALS[i]}</span>
      <div class="over-dot" style="background:${r.p.color}"></div>
      <span class="over-name">${r.p.name}</span>
      <span class="over-score">${r.t}</span>
    </div>`).join('');
  document.getElementById('over').classList.add('on');
}

// ─── App Setup ───────────────────────────────────────────────────────────────
// Wire up confirm bar buttons once at load time (they are always in the DOM)
document.getElementById('sc-cancel').addEventListener('click', hideScoreConfirm);
document.getElementById('sc-ok').addEventListener('click', ()=>{
  if(pendingScoreId) pickScore(pendingScoreId); // second call — pendingScoreId is set, so it confirms
});
function buildNames(n) {
  const el=document.getElementById('name-list'); el.innerHTML='';
  for(let i=0;i<n;i++) {
    const row=document.createElement('div'); row.className='nrow';
    const dot=document.createElement('div'); dot.className='ndot'; dot.style.background=COLORS[i];
    const inp=document.createElement('input');
    inp.className='ninp'; inp.type='text'; inp.value=DEFAULTS[i];
    inp.placeholder=DEFAULTS[i]; inp.maxLength=16;
    row.appendChild(dot); row.appendChild(inp); el.appendChild(row);
  }
}
document.querySelectorAll('.cnt').forEach(b=>{
  b.addEventListener('click',()=>{
    document.querySelectorAll('.cnt').forEach(x=>x.classList.remove('on'));
    b.classList.add('on'); buildNames(+b.dataset.n);
  });
});
document.getElementById('start-btn').addEventListener('click',()=>{
  const names=[...document.querySelectorAll('.ninp')].map(i=>i.value.trim()||i.placeholder);
  newGame(names);
  document.getElementById('setup').style.display='none';
  const app=document.getElementById('app'); app.style.display='flex'; app.style.flexDirection='column';
  init3D(); updateHeader(); updateRollBtn(); initScorecard(); flashNotif();
});
document.getElementById('roll-btn').addEventListener('click',doRoll);



buildNames(3);
