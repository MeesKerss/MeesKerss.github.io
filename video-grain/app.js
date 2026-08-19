// ╔═══════════════════════════════════════════════════════════════╗
// ║  Film Grain — WebGL Video Processor                         ║
// ║  All processing is GPU-side; no external dependencies.      ║
// ╚═══════════════════════════════════════════════════════════════╝

"use strict";

// ── DOM references ──────────────────────────────────────────────
const fileInput       = document.getElementById("file-input");
const uploadArea      = document.getElementById("upload-area");
const video           = document.getElementById("source-video");
const canvas          = document.getElementById("grain-canvas");
const controls        = document.getElementById("controls");
const playBtn         = document.getElementById("play-btn");

const intensitySlider = document.getElementById("intensity-slider");
const sizeSlider      = document.getElementById("size-slider");
const speedSlider     = document.getElementById("speed-slider");
const intensityOutput = document.getElementById("intensity-value");
const sizeOutput      = document.getElementById("size-value");
const speedOutput     = document.getElementById("speed-value");

// ── Uniform state (read from sliders every frame) ───────────────
let uIntensity = parseFloat(intensitySlider.value);
let uSize      = parseFloat(sizeSlider.value);
let uSpeed     = parseFloat(speedSlider.value);

// ── Slider → uniform binding ───────────────────────────────────
// Each slider writes directly into the JS variable that is sent
// to the corresponding GLSL uniform on every frame — no shader
// recompilation needed.
intensitySlider.addEventListener("input", () => {
  uIntensity = parseFloat(intensitySlider.value);
  intensityOutput.textContent = uIntensity.toFixed(2);
});
sizeSlider.addEventListener("input", () => {
  uSize = parseFloat(sizeSlider.value);
  sizeOutput.textContent = uSize.toFixed(1);
});
speedSlider.addEventListener("input", () => {
  uSpeed = parseFloat(speedSlider.value);
  speedOutput.textContent = uSpeed.toFixed(1);
});

// ═══════════════════════════════════════════════════════════════
// 1. SHADERS
// ═══════════════════════════════════════════════════════════════

// ── Vertex shader ──────────────────────────────────────────────
// Renders a full-screen quad. Positions are in clip space (−1…1);
// texture coordinates (v_uv) are mapped to 0…1.
const VERT_SRC = `
attribute vec2 a_position;   // clip-space quad corners
attribute vec2 a_texcoord;   // matching UV corners
varying   vec2 v_uv;

void main() {
  v_uv        = a_texcoord;
  gl_Position = vec4(a_position, 0.0, 1.0);
}
`;

// ── Fragment shader ────────────────────────────────────────────
// Mathematical approach for noise generation:
//
//   hash(x, y, t) — Dave-Hoskins-style integer-arithmetic hash
//
// Unlike the classic fract(sin(dot())) approach, this hash uses
// fract → multiply → dot cascades to mix all three input
// dimensions non-linearly. The key advantage: changing the time
// input `t` produces a *completely independent* noise pattern
// rather than a translated copy of the previous one, eliminating
// the visible "sliding grain" artifact.
//
// Two noise octaves are layered at different spatial frequencies
// to break up regularity and produce a more organic, filmic look.
//
// Film-grain compositing uses a luminance-aware blend:
//   blend = 4.0 * luma * (1.0 - luma)
// This parabola peaks at mid-tone luma ≈ 0.5 and drops to zero
// at pure black (luma = 0) and pure white (luma = 1), faithfully
// reproducing how real silver-halide grain is most visible in the
// mid-tones of an exposure.
const FRAG_SRC = `
precision mediump float;

varying vec2 v_uv;

uniform sampler2D u_video;    // current video frame
uniform float     u_time;     // elapsed time in seconds
uniform float     u_intensity;// grain blend strength  [0..1]
uniform float     u_size;     // noise coordinate scale
uniform float     u_speed;    // temporal noise rate
uniform vec2      u_resolution;// canvas pixel dimensions

// ── 3D pseudo-random hash (Dave Hoskins) ──────────────────────
// Takes spatial coords (x, y) and a temporal seed (z) as three
// fully-mixed dimensions.  The fract → add-dot → fract cascade
// ensures that ANY change in ANY input dimension produces an
// entirely different output — no translation / sliding.
float hash(vec3 p) {
  p = fract(p * vec3(0.1031, 0.1030, 0.0973));
  p += dot(p, p.yzx + 33.33);
  return fract((p.x + p.y) * p.z);
}

void main() {
  // Sample the current video frame
  vec4 color = texture2D(u_video, v_uv);

  // Pixel coordinates scaled by u_size.
  // floor() quantises so each "grain cell" covers a small block
  // of pixels — larger u_size = finer grain particles.
  vec2 pixelCoord = floor(v_uv * u_resolution / u_size);

  // Temporal seed: a new integer each frame (at the video's
  // temporal cadence, modulated by u_speed).  Passed as the
  // third dimension of the hash — NOT added to x/y, so the
  // noise field is regenerated rather than translated.
  float t = floor(u_time * u_speed * 60.0);

  // ── Two-octave grain ────────────────────────────────────────
  // Layering a second sample at 2× frequency and half weight
  // breaks up the grid regularity and gives a more organic,
  // photographic texture.
  float n1 = hash(vec3(pixelCoord,        t));
  float n2 = hash(vec3(pixelCoord * 2.0,  t + 43.0));
  float noise = (n1 * 0.667 + n2 * 0.333) - 0.5;
  // Result is centred around 0 (range ≈ −0.5 … +0.5)
  // so grain both brightens and darkens the image.

  // ── Luminance-aware blend ───────────────────────────────────
  // Rec. 709 luminance weights.
  float luma  = dot(color.rgb, vec3(0.2126, 0.7152, 0.0722));

  // Parabola peaks at luma = 0.5, zero at 0 and 1.
  // This mimics physical film grain: invisible in pure black
  // (no silver halide exposed) and in pure white (fully exposed),
  // most visible in mid-tones.
  float blend = 4.0 * luma * (1.0 - luma);

  // Apply grain: modulated by blend curve and user intensity.
  color.rgb += noise * blend * u_intensity;

  gl_FragColor = color;
}
`;

// ═══════════════════════════════════════════════════════════════
// 2. WEBGL BOOTSTRAP
// ═══════════════════════════════════════════════════════════════

let gl, program, videoTexture;
let aPositionLoc, aTexcoordLoc;
let uVideoLoc, uTimeLoc, uIntensityLoc, uSizeLoc, uSpeedLoc, uResolutionLoc;
let startTime = 0;
let animFrameId = null;

/**
 * Compile a shader from source; throw on failure.
 */
function compileShader(gl, type, src) {
  const shader = gl.createShader(type);
  gl.shaderSource(shader, src);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    const log = gl.getShaderInfoLog(shader);
    gl.deleteShader(shader);
    throw new Error("Shader compile error:\n" + log);
  }
  return shader;
}

/**
 * Link vertex + fragment shaders into a program; throw on failure.
 */
function createProgram(gl, vsSrc, fsSrc) {
  const vs  = compileShader(gl, gl.VERTEX_SHADER,   vsSrc);
  const fs  = compileShader(gl, gl.FRAGMENT_SHADER, fsSrc);
  const prg = gl.createProgram();
  gl.attachShader(prg, vs);
  gl.attachShader(prg, fs);
  gl.linkProgram(prg);
  if (!gl.getProgramParameter(prg, gl.LINK_STATUS)) {
    const log = gl.getProgramInfoLog(prg);
    gl.deleteProgram(prg);
    throw new Error("Program link error:\n" + log);
  }
  return prg;
}

/**
 * Initialise WebGL context, shader program, geometry, and texture.
 */
function initWebGL() {
  gl = canvas.getContext("webgl") || canvas.getContext("experimental-webgl");
  if (!gl) {
    alert("WebGL is not supported in this browser.");
    return false;
  }

  // Compile and link shader program
  program = createProgram(gl, VERT_SRC, FRAG_SRC);
  gl.useProgram(program);

  // ── Attribute locations ──────────────────────────────────────
  aPositionLoc = gl.getAttribLocation(program, "a_position");
  aTexcoordLoc = gl.getAttribLocation(program, "a_texcoord");

  // ── Uniform locations ────────────────────────────────────────
  uVideoLoc      = gl.getUniformLocation(program, "u_video");
  uTimeLoc       = gl.getUniformLocation(program, "u_time");
  uIntensityLoc  = gl.getUniformLocation(program, "u_intensity");
  uSizeLoc       = gl.getUniformLocation(program, "u_size");
  uSpeedLoc      = gl.getUniformLocation(program, "u_speed");
  uResolutionLoc = gl.getUniformLocation(program, "u_resolution");

  // ── Full-screen quad geometry ────────────────────────────────
  // Two triangles covering clip space (−1…1), with matching UVs.
  // UV-y is flipped (1→0) because video texture rows are top-down.
  //
  //    position (x,y)   texcoord (u,v)
  const quadData = new Float32Array([
    -1, -1,   0, 1,
     1, -1,   1, 1,
    -1,  1,   0, 0,
     1,  1,   1, 0,
  ]);

  const buf = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buf);
  gl.bufferData(gl.ARRAY_BUFFER, quadData, gl.STATIC_DRAW);

  const STRIDE = 4 * Float32Array.BYTES_PER_ELEMENT;
  gl.enableVertexAttribArray(aPositionLoc);
  gl.vertexAttribPointer(aPositionLoc, 2, gl.FLOAT, false, STRIDE, 0);

  gl.enableVertexAttribArray(aTexcoordLoc);
  gl.vertexAttribPointer(aTexcoordLoc, 2, gl.FLOAT, false, STRIDE, 2 * Float32Array.BYTES_PER_ELEMENT);

  // ── Video texture ────────────────────────────────────────────
  videoTexture = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, videoTexture);
  // Clamp-to-edge + linear filtering — avoids border artefacts
  // and allows non-power-of-two video dimensions.
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);

  // Bind texture unit 0 to the u_video sampler
  gl.uniform1i(uVideoLoc, 0);

  return true;
}

// ═══════════════════════════════════════════════════════════════
// 3. RENDER LOOP
// ═══════════════════════════════════════════════════════════════

/**
 * Called every frame via requestAnimationFrame.
 * Uploads the current video frame as a texture, sets uniforms
 * from the slider state, and draws the full-screen quad.
 */
function render(now) {
  animFrameId = requestAnimationFrame(render);

  // Elapsed time in seconds (used as u_time in the shader)
  const elapsed = (now - startTime) * 0.001;

  // Upload current video frame to the GPU texture.
  // texImage2D reads the <video> element's current decoded frame.
  gl.activeTexture(gl.TEXTURE0);
  gl.bindTexture(gl.TEXTURE_2D, videoTexture);
  gl.texImage2D(
    gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, video
  );

  // Set the viewport to the canvas pixel dimensions
  gl.viewport(0, 0, canvas.width, canvas.height);

  // ── Push uniform values to the GPU ───────────────────────────
  // These are read directly from the slider-bound JS variables,
  // so changes are reflected instantly without shader recompilation.
  gl.uniform1f(uTimeLoc,      elapsed);
  gl.uniform1f(uIntensityLoc, uIntensity);
  gl.uniform1f(uSizeLoc,      uSize);
  gl.uniform1f(uSpeedLoc,     uSpeed);
  gl.uniform2f(uResolutionLoc, canvas.width, canvas.height);

  // Draw the full-screen quad (4 vertices, triangle strip)
  gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
}

// ═══════════════════════════════════════════════════════════════
// 4. VIDEO LOADING & PLAYBACK
// ═══════════════════════════════════════════════════════════════

/**
 * Handle file selection: create an object URL, assign it to the
 * hidden <video>, wait for metadata, then size the canvas and
 * initialise WebGL.
 */
function handleFile(file) {
  if (!file || !file.type.startsWith("video/")) return;

  // Revoke any previous object URL to avoid memory leaks
  if (video.src) URL.revokeObjectURL(video.src);

  const url = URL.createObjectURL(file);
  video.src = url;
  video.load();

  video.addEventListener(
    "loadedmetadata",
    () => {
      // Resize canvas to the video's native resolution so the
      // WebGL viewport matches 1 : 1 with the source pixels.
      canvas.width  = video.videoWidth;
      canvas.height = video.videoHeight;

      // Show canvas & controls, hide upload area
      canvas.classList.add("visible");
      controls.classList.remove("hidden");
      uploadArea.classList.add("hidden");

      // Initialise WebGL (only once; idempotent guard below)
      if (!gl && !initWebGL()) return;

      // Start render loop
      startTime = performance.now();
      if (animFrameId) cancelAnimationFrame(animFrameId);
      animFrameId = requestAnimationFrame(render);
    },
    { once: true }
  );
}

// ── File input change ──────────────────────────────────────────
fileInput.addEventListener("change", (e) => {
  if (e.target.files.length) handleFile(e.target.files[0]);
});

// ── Drag-and-drop support ──────────────────────────────────────
uploadArea.addEventListener("dragover", (e) => {
  e.preventDefault();
  uploadArea.classList.add("dragover");
});
uploadArea.addEventListener("dragleave", () => {
  uploadArea.classList.remove("dragover");
});
uploadArea.addEventListener("drop", (e) => {
  e.preventDefault();
  uploadArea.classList.remove("dragover");
  if (e.dataTransfer.files.length) handleFile(e.dataTransfer.files[0]);
});

// ── Play / Pause toggle ───────────────────────────────────────
playBtn.addEventListener("click", () => {
  if (video.paused) {
    video.play();
    playBtn.textContent = "⏸ Pause";
  } else {
    video.pause();
    playBtn.textContent = "▶ Play";
  }
});
