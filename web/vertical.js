// Vertical film page (1080×1920 stage). One JSON script (film/vertical.json) drives the mantis, the camera and the page.
// render(t) is a pure function of time. ?res=full renders at the script size, otherwise at the preview size.
import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { FullScreenQuad } from 'three/addons/postprocessing/Pass.js';
import { HorizontalBlurShader } from 'three/addons/shaders/HorizontalBlurShader.js';
import { VerticalBlurShader } from 'three/addons/shaders/VerticalBlurShader.js';
import { buildMantis, BLOOM_LAYER } from './mantis.js';

const q = new URLSearchParams(location.search);
const SCRIPT = await (await fetch(q.get('script') || '../film/vertical.json')).json();
const [W, H] = q.get('res') === 'full' ? SCRIPT.size : SCRIPT.preview;
const MASK = q.has('mask');

// ------------------------------------------------------------ stage (same look as the approved still)
const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
renderer.setPixelRatio(1); renderer.setSize(W, H);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.NeutralToneMapping;
renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
document.body.prepend(renderer.domElement);
const scene = new THREE.Scene();
{
  const c = document.createElement('canvas'); c.width = 4; c.height = 512;
  const g = c.getContext('2d'); const gr = g.createLinearGradient(0, 0, 0, 512);
  gr.addColorStop(0, '#f7f6f9'); gr.addColorStop(0.55, '#efeef2'); gr.addColorStop(1, '#e4e3e8');
  g.fillStyle = gr; g.fillRect(0, 0, 4, 512);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; scene.background = t;
}
const pmrem = new THREE.PMREMGenerator(renderer);
scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
scene.environmentIntensity = 0.7;
scene.add(new THREE.HemisphereLight(0xffffff, 0xcfcfd6, 0.45));
const key = new THREE.DirectionalLight(0xffffff, 2.2);
key.position.set(-5, 14, 8); key.target.position.set(0.5, 3, 0);
key.castShadow = true; key.shadow.mapSize.set(2048, 2048);
Object.assign(key.shadow.camera, { left: -11, right: 11, top: 11, bottom: -11, near: 2, far: 45 });
key.shadow.bias = -0.0004; key.shadow.normalBias = 0.03; key.shadow.radius = 4;
scene.add(key, key.target);
const rim = new THREE.DirectionalLight(0xf2f5ff, 2.0); rim.position.set(6, 10, -10); scene.add(rim);
const fill = new THREE.DirectionalLight(0xfff6ee, 0.35); fill.position.set(6, 1, 9); scene.add(fill);

const mantis = buildMantis();
scene.add(mantis.root);
const M = mantis.M;
{
  const env = new THREE.Scene(); env.background = new THREE.Color(0x060608);
  for (const [w, h, d, k] of [[10, 6, [-0.2, 1, 0.2], 6], [2.4, 14, [-0.85, 0.3, 0.45], 7], [3.2, 2.2, [0.42, 0.62, 0.66], 9], [1.2, 10, [0.75, 0.2, -0.6], 3], [14, 1.2, [0.2, 0.15, 1], 5]]) {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ color: new THREE.Color(1, 1, 1).multiplyScalar(k), side: THREE.DoubleSide }));
    m.position.copy(new THREE.Vector3(...d).normalize().multiplyScalar(15)); m.lookAt(0, 0, 0); env.add(m);
  }
  M.lens.envMap = pmrem.fromScene(env, 0.01).texture; M.lens.needsUpdate = true;
  env.background = new THREE.Color(0x0c0c0e);
  M.glass.envMap = pmrem.fromScene(env, 0.01).texture; M.glass.needsUpdate = true;
}

// contact shadow (wider window for the explode)
const CS = { half: 12, res: 512 };
const csCam = new THREE.OrthographicCamera(-CS.half, CS.half, CS.half, -CS.half, 0, 10);
csCam.position.set(0.8, -0.001, 0); csCam.up.set(0, 0, -1); csCam.lookAt(0.8, 1, 0); csCam.layers.set(1);
const silU = { uFar: { value: 3.0 } };
const silMat = new THREE.ShaderMaterial({
  uniforms: silU, side: THREE.DoubleSide,
  vertexShader: 'varying float vH; void main(){ vec4 p = vec4(position,1.0);\n#ifdef USE_INSTANCING\n p = instanceMatrix * p;\n#endif\n vec4 w = modelMatrix * p; vH = w.y; gl_Position = projectionMatrix * viewMatrix * w; }',
  fragmentShader: 'varying float vH; uniform float uFar; void main(){ float k = 1.0 - clamp(vH / uFar, 0.0, 1.0); gl_FragColor = vec4(vec3(k), 1.0); }',
});
const mkRT = () => new THREE.WebGLRenderTarget(CS.res, CS.res, { type: THREE.HalfFloatType });
const csLayers = [{ rt: [mkRT(), mkRT()], far: 6.0, blur: 3.0, passes: 5, op: 1.1 }, { rt: [mkRT(), mkRT()], far: 1.0, blur: 1.0, passes: 2, op: 1.6 }];
const hb = new FullScreenQuad(new THREE.ShaderMaterial(HorizontalBlurShader)), vb = new FullScreenQuad(new THREE.ShaderMaterial(VerticalBlurShader));
const floor = new THREE.Mesh(new THREE.PlaneGeometry(CS.half * 2, CS.half * 2), new THREE.ShaderMaterial({
  transparent: true, depthWrite: false,
  uniforms: { tA: { value: csLayers[0].rt[0].texture }, tB: { value: csLayers[1].rt[0].texture }, oA: { value: 1.1 }, oB: { value: 1.6 }, uCol: { value: new THREE.Color(0x3a3440) } },
  vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
  fragmentShader: 'uniform sampler2D tA, tB; uniform float oA, oB; uniform vec3 uCol; varying vec2 vUv; void main(){ vec2 e = smoothstep(0.0,0.12,vUv)*smoothstep(0.0,0.12,1.0-vUv); float a = clamp(texture2D(tA,vUv).r*oA + texture2D(tB,vUv).r*oB, 0.0, 0.55) * e.x * e.y; gl_FragColor = vec4(uCol, a); }',
}));
floor.rotation.x = -Math.PI / 2; floor.position.set(0.8, 0.002, 0); floor.renderOrder = -1; scene.add(floor);
mantis.root.traverse((o) => { if (o.isMesh && !o.userData.clear) o.layers.enable(1); });
mantis.root.traverse((o) => { if (o.isMesh) o.receiveShadow = !o.userData.clear; });
function contactShadow() {
  const prevBg = scene.background; scene.background = null; scene.overrideMaterial = silMat; renderer.setClearColor(0x000000, 1);
  renderer.shadowMap.autoUpdate = false;
  for (const L of csLayers) {
    silU.uFar.value = L.far; renderer.setRenderTarget(L.rt[0]); renderer.clear(); renderer.render(scene, csCam);
    for (let i = 0; i < L.passes; i++) {
      hb.material.uniforms.tDiffuse.value = L.rt[0].texture; hb.material.uniforms.h.value = L.blur / CS.res; renderer.setRenderTarget(L.rt[1]); hb.render(renderer);
      vb.material.uniforms.tDiffuse.value = L.rt[1].texture; vb.material.uniforms.v.value = L.blur / CS.res; renderer.setRenderTarget(L.rt[0]); vb.render(renderer);
    }
  }
  renderer.shadowMap.autoUpdate = true;
  renderer.setRenderTarget(null); scene.background = prevBg; scene.overrideMaterial = null;
}

const camera = new THREE.PerspectiveCamera(28, W / H, 0.1, 200);
const bloomComposer = new EffectComposer(renderer, new THREE.WebGLRenderTarget(W, H, { type: THREE.HalfFloatType })); bloomComposer.renderToScreen = false;
bloomComposer.addPass(new RenderPass(scene, camera));
bloomComposer.addPass(new UnrealBloomPass(new THREE.Vector2(W, H), 0.38, 0.12, 0.1)); const bloomPass = bloomComposer.passes[1];
const finalComposer = new EffectComposer(renderer, new THREE.WebGLRenderTarget(W, H, { type: THREE.HalfFloatType, samples: 4 }));
finalComposer.addPass(new RenderPass(scene, camera));
const mix = new ShaderPass(new THREE.ShaderMaterial({
  uniforms: { baseTexture: { value: null }, bloomTexture: { value: bloomComposer.renderTarget2.texture } },
  vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
  fragmentShader: 'uniform sampler2D baseTexture, bloomTexture; varying vec2 vUv; void main(){ gl_FragColor = texture2D(baseTexture, vUv) + vec4(texture2D(bloomTexture, vUv).rgb, 0.0); }',
}), 'baseTexture');
mix.needsSwap = true; finalComposer.addPass(mix); finalComposer.addPass(new OutputPass());
const black = new THREE.MeshBasicMaterial({ color: 0x000000 }), blackBack = new THREE.MeshBasicMaterial({ color: 0x000000, side: THREE.BackSide });
const bloomLayer = new THREE.Layers(); bloomLayer.set(BLOOM_LAYER);
const saved = new Map();
function renderBloom() {
  const prevBg = scene.background; scene.background = null; floor.visible = false;
  scene.traverse((o) => { if (!o.isMesh || bloomLayer.test(o.layers)) return; saved.set(o, [o.material, o.visible]); if (o.userData.clear) o.visible = false; else o.material = o.material.side === THREE.BackSide ? blackBack : black; });
  bloomComposer.render();
  for (const [o, [m, v]] of saved) { o.material = m; o.visible = v; }
  saved.clear(); scene.background = prevBg; floor.visible = true;
}

// ------------------------------------------------------------ easing + timeline helpers
const clamp01 = (x) => Math.min(1, Math.max(0, x));
const EASE = {
  linear: (u) => u,
  inOut: (u) => u * u * u * (u * (u * 6 - 15) + 10),
  in: (u) => u * u * u,
  out: (u) => 1 - (1 - u) ** 3,
  sine: (u) => 0.5 - 0.5 * Math.cos(Math.PI * u),
};
const smoother = EASE.inOut;
const ss = (a, b, t) => smoother(clamp01((t - a) / (b - a)));
const lerp = (a, b, k) => a + (b - a) * k;
const ACTS = SCRIPT.acts;
const ABD_ACT = ACTS.find((a) => a.act === 'abdomen');
const AB = SCRIPT.abdomen;
const actIndex = (t) => { let i = 0; while (i < ACTS.length - 1 && ACTS[i + 1].t <= t) i++; return i; };

// ------------------------------------------------------------ abdomen teardown: per-part raw progress (linear; eases live in mantis.pose)
const SECTOR_RANK = [3, 2, 1, 0, 0, 1, 2, 3];   // sector k spans [k, k+1]·45° from the belly (phi = 0); 3 and 4 are the back → first
function ranksFor(name, n) {
  if (name === 'panes') return Array.from({ length: n }, (_, i) => ({ r: SECTOR_RANK[i % 8], w: 6 - Math.floor(i / 8) }));   // tail bay first
  if (name === 'bands') return Array.from({ length: n }, (_, i) => ({ r: 6 - i, w: 0 }));   // tail band first
  return Array.from({ length: n }, (_, i) => ({ r: i, w: 0 }));
}
function partProgress(name, t) {
  const S = AB[name], n = S.n || 1, R = ranksFor(name, n), maxR = Math.max(...R.map((x) => x.r)), maxW = Math.max(...R.map((x) => x.w));
  const to = t - ABD_ACT.open[0], tc = t - ABD_ACT.close[0];
  return R.map(({ r, w }) => {
    const o = clamp01((to - S.open[0] - (S.stagger || 0) * r - (S.wave || 0) * w) / S.open[1]);
    const rc = S.closeOrder === 'reverse' ? maxR - r : r, wc = S.closeOrder === 'reverse' ? maxW - w : w;
    const c = clamp01((tc - S.close[0] - (S.closeStagger || 0) * rc - (S.closeWave || 0) * wc) / S.close[1]);
    return Math.min(o, 1 - c);
  });
}
function abdomenState(t, clock) {
  const g = AB.glow;
  const go = clamp01((t - ABD_ACT.open[0] - g.open[0]) / g.open[1]), gc = clamp01((t - ABD_ACT.close[0] - g.close[0]) / g.close[1]);
  const base = smoother(Math.min(go, 1 - gc));
  const pulse = base * g.pulse * Math.sin(2 * Math.PI * g.pulseHz * Math.max(0, t - ABD_ACT.open[0] - g.open[0]));
  const st = {
    wings: partProgress('wings', t), belly: partProgress('belly', t), panes: partProgress('panes', t), bands: partProgress('bands', t),
    modules: partProgress('modules', t), tail: partProgress('tail', t)[0],
    glow: base + pulse, hold: clamp01((t - ABD_ACT.open[1]) / (ABD_ACT.close[0] - ABD_ACT.open[1])), clock,
  };
  // how far apart, for the status bar: mean eased pane / band progress
  st.apart = [...st.panes, ...st.bands].reduce((s, x) => s + smoother(x), 0) / (st.panes.length + st.bands.length);
  return st;
}
const openAmount = (t) => (ABD_ACT ? ss(ABD_ACT.open[0], ABD_ACT.open[1], t) * (1 - ss(ABD_ACT.close[0], ABD_ACT.close[1], t)) : 0);

// gear clocks: the abdomen gears speed up while it is open (tabulated once, read per frame → still a pure function of t)
const MO = SCRIPT.motion;
const DT = 1 / 600, N = Math.ceil((SCRIPT.duration + 1) / DT) + 1;
const CLK = { body: new Float64Array(N), abd: new Float64Array(N), walk: new Float64Array(N) };
for (let i = 1; i < N; i++) {
  const t = (i - 0.5) * DT, o = openAmount(t);
  CLK.body[i] = CLK.body[i - 1] + DT * (1 + MO.gearRate.body * o);
  CLK.abd[i] = CLK.abd[i - 1] + DT * (1 + MO.gearRate.abd * o);
  CLK.walk[i] = CLK.walk[i - 1] + DT * (1 - ss(MO.walk.stop[0], MO.walk.stop[1], t));
}
const clk = (k, t) => { const x = Math.max(0, t) / DT, i = Math.min(N - 2, Math.floor(x)); return lerp(CLK[k][i], CLK[k][i + 1], x - i); };

// ------------------------------------------------------------ stalking motion (intro): slow creep, stepping legs, forearms raised a little
const legs = ['legMidR', 'legMidL', 'legHindR', 'legHindL'].map((n, j) => {
  const g = mantis.parts[n]; const b = new THREE.Box3().setFromObject(g); const c = b.getCenter(new THREE.Vector3());
  const dh = c.sub(g.userData.pivot).setY(0).normalize();
  return { g, pivot: g.userData.pivot.clone(), lift: new THREE.Vector3().crossVectors(dh, new THREE.Vector3(0, 1, 0)).normalize(), phase: [0, 0.5, 0.5, 0][j] * Math.PI * 2 };
});
const fores = ['forelegR', 'forelegL'].map((n) => ({ g: mantis.parts[n], pivot: mantis.parts[n].userData.pivot.clone() }));
const _q = new THREE.Quaternion(), _q2 = new THREE.Quaternion(), _p = new THREE.Vector3(), UP = new THREE.Vector3(0, 1, 0), ZA = new THREE.Vector3(0, 0, 1);
function pivotRotate(g, pivot, q) { g.quaternion.copy(q); g.position.add(pivot.clone().sub(pivot.clone().applyQuaternion(q))); }
function stalk(t) {
  const W = MO.walk, walk = clk('walk', t), live = 1 - ss(W.stop[0], W.stop[1], t);
  mantis.root.position.set(-W.speed * walk, 0, 0);
  for (const L of legs) {
    const ph = 2 * Math.PI * W.stepHz * walk + L.phase, up = Math.max(0, Math.sin(ph)) ** 2 * live;
    _q.setFromAxisAngle(L.lift, W.stepLift * up); _q2.setFromAxisAngle(UP, W.stepSwing * Math.cos(ph) * live); _q.premultiply(_q2);
    pivotRotate(L.g, L.pivot, _q);
  }
  fores.forEach((F, j) => { _q.setFromAxisAngle(ZA, -MO.forearmLift * (0.6 + 0.4 * Math.sin(1.3 * t + j))); pivotRotate(F.g, F.pivot, _q); });
}

// ------------------------------------------------------------ camera: shot library + per-act key tracks, 0.6 s cross-blend between acts
const CAM = SCRIPT.camera, SHOTS = SCRIPT.shots;
const lerpShot = (a, b, k) => ({ az: lerp(a.az, b.az, k), el: lerp(a.el, b.el, k), d: lerp(a.d, b.d, k), fov: lerp(a.fov, b.fov, k), screenY: lerp(a.screenY, b.screenY, k), target: a.target.map((v, j) => lerp(v, b.target[j], k)) });
function actCamera(i, t) {
  const keys = ACTS[i].camera;
  if (t <= keys[0].t) return SHOTS[keys[0].shot];
  for (let j = 1; j < keys.length; j++) {
    if (t <= keys[j].t) { const B = SHOTS[keys[j].shot]; return lerpShot(SHOTS[keys[j - 1].shot], B, EASE[B.ease]((t - keys[j - 1].t) / (keys[j].t - keys[j - 1].t))); }
  }
  return SHOTS[keys[keys.length - 1].shot];
}
function cameraAt(t) {
  const i = actIndex(t); let c = actCamera(i, t);
  if (i > 0) {
    const k = ss(ACTS[i].t, ACTS[i].t + SCRIPT.blend, t);
    if (k < 1) { c = lerpShot(actCamera(i - 1, t), c, k); c.d *= 1 + CAM.pullback * Math.sin(Math.PI * k); }
  }
  return c;
}
const camera2 = camera;
function placeCamera(t) {
  const c = cameraAt(t), az = THREE.MathUtils.degToRad(CAM.heroAzWorld - c.az), el = THREE.MathUtils.degToRad(c.el), d = c.d * CAM.heroDist;
  const T = new THREE.Vector3(...c.target).add(mantis.root.position);
  camera2.fov = c.fov; camera2.aspect = W / H;
  // put the target at screenY of the frame (not the centre): shift the view window
  camera2.setViewOffset(W, H, 0, (0.5 - c.screenY) * H, W, H);
  camera2.position.set(T.x - Math.sin(az) * Math.cos(el) * d, T.y + Math.sin(el) * d, T.z + Math.cos(az) * Math.cos(el) * d);
  camera2.lookAt(T);
  camera2.updateProjectionMatrix();
  return c;
}

// ------------------------------------------------------------ page placeholder: product line + title on top, status bar at the bottom
const ui = document.getElementById('ui');
ui.style.transform = `scale(${W / 1080})`;
if (MASK || q.has('noui')) ui.classList.add('hide');
document.getElementById('pname').innerHTML = SCRIPT.product.name.replace(/(MX-\d+)/, '<b>$1</b>');
document.getElementById('ptitle').textContent = SCRIPT.product.title;
function drawUI(t, ab) {
  const a = ACTS[actIndex(t)];
  let txt = a.status;
  if (a.act === 'abdomen') txt = t < ABD_ACT.open[0] ? 'Abdomen' : SCRIPT.ui.statusOpen.replace('{pct}', Math.round(62 * ab.apart));
  document.getElementById('stxt').textContent = txt;
  document.getElementById('sbar').style.width = `${(100 * t / 12).toFixed(2)}%`;
  const s = Math.floor(t), cs = Math.floor((t - s) * 10);
  document.getElementById('tc').textContent = `00:${String(s).padStart(2, '0')}.${cs}`;
}

// ------------------------------------------------------------ render(t): pure function of time
if (MASK) {
  scene.background = new THREE.Color(0x000000); floor.visible = false;
  scene.overrideMaterial = new THREE.MeshBasicMaterial({ color: 0xffffff, side: THREE.DoubleSide });
}
function render(t) {
  const gc = { body: clk('body', t), abd: clk('abd', t) };
  const ab = abdomenState(t, gc.abd);
  mantis.update(t, gc);
  mantis.pose({ clock: gc.abd, abd: ab });
  stalk(t);
  placeCamera(t);
  bloomPass.strength = lerp(AB.glow.bloom[0], AB.glow.bloom[1], clamp01(ab.glow));
  if (MASK) { renderer.render(scene, camera); }
  else { contactShadow(); renderBloom(); finalComposer.render(); }
  drawUI(t, ab);
  window.__state = { t, cam: cameraAt(t), apart: ab.apart, glow: ab.glow };
}
window.renderFrame = render;
window.__script = SCRIPT;
window.__mantis = mantis;
window.__THREE = THREE;
window.__camera = camera;
render(Number(q.get('t') || 0));
window.__ready = true;
if (q.has('play')) { const t0 = performance.now(); const loop = () => { render(((performance.now() - t0) / 1000) % SCRIPT.duration); requestAnimationFrame(loop); }; loop(); }
