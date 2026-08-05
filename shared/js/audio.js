let actx;
function initAudio() {
  if(!actx) actx = new (window.AudioContext||window.webkitAudioContext)();
  if(actx.state === 'suspended') actx.resume();
}
function sndClick() {
  if(!actx) return;
  const osc = actx.createOscillator(), gain = actx.createGain();
  osc.frequency.setValueAtTime(800, actx.currentTime);
  osc.frequency.exponentialRampToValueAtTime(600, actx.currentTime + 0.04);
  gain.gain.setValueAtTime(0.05, actx.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.001, actx.currentTime + 0.04);
  osc.connect(gain); gain.connect(actx.destination);
  osc.start(); osc.stop(actx.currentTime + 0.04);
}
function sndScore() {
  if(!actx) return;
  const osc = actx.createOscillator(), gain = actx.createGain();
  osc.frequency.setValueAtTime(400, actx.currentTime);
  osc.frequency.exponentialRampToValueAtTime(800, actx.currentTime + 0.15);
  gain.gain.setValueAtTime(0.05, actx.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.001, actx.currentTime + 0.15);
  osc.connect(gain); gain.connect(actx.destination);
  osc.start(); osc.stop(actx.currentTime + 0.15);
}
function sndWin() {
  if(!actx) return;
  [392, 493.88, 587.33, 783.99].forEach((f, i) => {
    const osc = actx.createOscillator(), gain = actx.createGain();
    osc.frequency.value = f;
    gain.gain.setValueAtTime(0, actx.currentTime + i*0.08);
    gain.gain.linearRampToValueAtTime(0.05, actx.currentTime + i*0.08 + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.001, actx.currentTime + i*0.08 + 0.3);
    osc.connect(gain); gain.connect(actx.destination);
    osc.start(actx.currentTime + i*0.08); osc.stop(actx.currentTime + i*0.08 + 0.3);
  });
}
function sndError() {
  if(!actx) return;
  const osc = actx.createOscillator(), gain = actx.createGain();
  osc.type = 'sawtooth';
  osc.frequency.setValueAtTime(150, actx.currentTime);
  osc.frequency.linearRampToValueAtTime(100, actx.currentTime + 0.1);
  gain.gain.setValueAtTime(0.05, actx.currentTime);
  gain.gain.linearRampToValueAtTime(0.001, actx.currentTime + 0.1);
  osc.connect(gain); gain.connect(actx.destination);
  osc.start(); osc.stop(actx.currentTime + 0.1);
}
function sndImpact(intensity=1) {
  if(!actx) return;
  const dur = 0.05 * intensity;
  const buffer = actx.createBuffer(1, actx.sampleRate * dur, actx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
  
  const noise = actx.createBufferSource();
  noise.buffer = buffer;
  const filter = actx.createBiquadFilter();
  filter.type = 'lowpass';
  filter.frequency.value = 1000 + (intensity * 1000);
  
  const gain = actx.createGain();
  gain.gain.setValueAtTime(0.05 * intensity, actx.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.001, actx.currentTime + dur);
  
  noise.connect(filter);
  filter.connect(gain);
  gain.connect(actx.destination);
  noise.start();
}
