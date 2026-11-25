// Film page: the mantis, a fictional product UI, and a JSON script. render(t) is a pure function of time.
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
const SCRIPT = await (await fetch(q.get('script') || '../film/short.json')).json();
const [W, H] = SCRIPT.size;

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
bloomComposer.addPass(new UnrealBloomPass(new THREE.Vector2(W, H), 0.38, 0.12, 0.1));
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

// ------------------------------------------------------------ the script as functions of time
const smoother = (x) => { const u = Math.min(1, Math.max(0, x)); return u * u * u * (u * (u * 6 - 15) + 10); };
const ss = (a, b, t) => smoother((t - a) / (b - a));
const lerp = (a, b, k) => a + (b - a) * k;
const ACTS = SCRIPT.acts;
const A = Object.fromEntries(ACTS.map((a) => [a.act, a]));
const openOf = (a, t) => (a ? ss(a.open[0], a.open[1], t) * (1 - ss(a.close[0], a.close[1], t)) : 0);
function stateAt(t) {
  const ex = A.explode;
  return {
    head: openOf(A.head, t), forearm: openOf(A.forearm, t), abdomen: openOf(A.abdomen, t),
    explode: ex ? ss(ex.out[0], ex.out[1], t) * (1 - ss(ex.back[0], ex.back[1], t)) : 0,
    // 330° while exploded, the last 30° during the fast snap back, so the turn ends where it began
    spin: ex ? THREE.MathUtils.degToRad(ex.spinDeg * ss(ex.spin[0], ex.spin[1], t) + (360 - ex.spinDeg) * ss(ex.back[0], ex.back[1], t)) : 0,
    strike: A.strike ? ss(A.strike.strike[0], A.strike.strike[1], t) : 0,
  };
}
// the busy clock: gears run faster while a part is open or the mantis is exploded (tabulated once, read per frame)
const DT = 1 / 600, N = Math.ceil((SCRIPT.duration + 1) / DT) + 1, CLOCK = new Float64Array(N);
for (let i = 1; i < N; i++) { const s = stateAt((i - 0.5) * DT); CLOCK[i] = CLOCK[i - 1] + DT * (1 + 3 * Math.max(s.head, s.forearm, s.abdomen) + 4 * s.explode + 2 * s.strike); }
const clockAt = (t) => { const x = Math.max(0, t) / DT, i = Math.min(N - 2, Math.floor(x)); return lerp(CLOCK[i], CLOCK[i + 1], x - i); };

const actIndex = (t) => { let i = 0; while (i < ACTS.length - 1 && ACTS[i + 1].t <= t) i++; return i; };
function camOf(i, t) {
  const a = ACTS[i], c = SCRIPT.cameras[a.act], end = i < ACTS.length - 1 ? ACTS[i + 1].t : SCRIPT.duration;
  const k = ss(a.t, end, t);
  return { az: lerp(c.from.az, c.to.az, k), el: lerp(c.from.el, c.to.el, k), d: lerp(c.from.d, c.to.d, k), t: c.from.t.map((v, j) => lerp(v, c.to.t[j], k)) };
}
function cameraAt(t) {
  const i = actIndex(t); let c = camOf(i, t);
  if (i > 0) {
    const k = ss(ACTS[i].t, ACTS[i].t + SCRIPT.blend, t);
    if (k < 1) { const p = camOf(i - 1, t); c = { az: lerp(p.az, c.az, k), el: lerp(p.el, c.el, k), d: lerp(p.d, c.d, k) + 0.8 * Math.sin(Math.PI * k), t: p.t.map((v, j) => lerp(v, c.t[j], k)) }; }
  }
  return c;
}

// ------------------------------------------------------------ UI: product name, three buttons, four live cards
document.getElementById('pname').innerHTML = SCRIPT.product.name.replace(/(MX-\d+)/, '<b>$1</b>');
document.getElementById('psub').textContent = SCRIPT.product.sub;
const BTN = [['head', '头部 · 复眼'], ['forearm', '镰刀前臂'], ['abdomen', '发光腹部']];
const btnEl = {};
for (const [id, label] of BTN) { const b = document.createElement('div'); b.className = 'btn'; b.innerHTML = `${label}<div class="bar"></div>`; document.getElementById('buttons').append(b); btnEl[id] = b; }
const cardEl = {};
for (const c of SCRIPT.cards) {
  const d = document.createElement('div'); d.className = 'card';
  d.innerHTML = `<div class="t">${c.title}</div>` + c.rows.map((r, j) => `<div class="row"><span>${r}</span><span data-r="${j}"></span></div>`).join('');
  document.getElementById('cards').append(d); cardEl[c.id] = d;
}
const LABEL = { intro: '运行中 · STANDBY', head: '01 · 头部与复眼', forearm: '02 · 镰刀前臂', abdomen: '03 · 发光腹部', explode: '整机爆炸 · 330°', strike: '出击 · STRIKE' };
function setRows(id, vals) { cardEl[id].querySelectorAll('[data-r]').forEach((e, j) => { e.textContent = vals[j]; }); }
function ui(t, s, clock) {
  const i = actIndex(t), a = ACTS[i];
  document.getElementById('act').textContent = LABEL[a.act];
  for (const [id] of BTN) {
    const on = a.button === id; btnEl[id].classList.toggle('on', on);
    btnEl[id].querySelector('.bar').style.width = on ? `${Math.min(100, (t - a.open[0]) / (a.close[1] - a.open[0]) * 100)}%` : '0';
  }
  setRows('head', [`${(34 + 8 * s.head).toFixed(1)} mm`, `1/${Math.round(2400 + 1200 * s.head)}`, s.head > 0.5 ? '弹出 28 mm' : '锁定']);
  setRows('forearm', [`${Math.round(420 + 260 * s.forearm + 300 * s.strike)} N`, '34 根 · 微弯', `${(3.2 * s.strike).toFixed(2)} m/s`]);
  setRows('abdomen', [`${(61 + 19 * s.abdomen + 2 * Math.sin(t * 3)).toFixed(1)} °C`, `${Math.round(50 + 40 * s.abdomen)} Hz`, s.abdomen > 0.5 ? '7 段 · 展开' : '7 段 · 闭合']);
  const rpm = Math.round(1200 * (1 + 3 * Math.max(s.head, s.forearm, s.abdomen) + 4 * s.explode));
  setRows('system', [`${rpm} rpm`, s.explode > 0.05 ? '爆炸视图' : s.strike > 0.05 ? '出击' : Math.max(s.head, s.forearm, s.abdomen) > 0.05 ? '拆解中' : '待机', `${t.toFixed(2)} s`]);
  for (const id of ['head', 'forearm', 'abdomen']) cardEl[id].classList.toggle('on', a.act === id);
  cardEl.system.classList.toggle('on', a.act === 'explode' || a.act === 'strike');
  document.getElementById('tc').textContent = `T ${t.toFixed(2)} / ${SCRIPT.duration.toFixed(1)} s · ${SCRIPT.fps} fps`;
}

// ------------------------------------------------------------ render(t): pure function of time
const V = new THREE.Vector3();
function render(t) {
  const s = stateAt(t), clock = clockAt(t);
  mantis.update(clock);
  mantis.pose({ ...s, clock });
  const c = cameraAt(t), az = THREE.MathUtils.degToRad(c.az), el = THREE.MathUtils.degToRad(c.el);
  V.set(...c.t);
  camera.position.set(V.x - Math.sin(az) * Math.cos(el) * c.d, V.y + Math.sin(el) * c.d, V.z + Math.cos(az) * Math.cos(el) * c.d);
  camera.lookAt(V);
  contactShadow(); renderBloom(); finalComposer.render();
  ui(t, s, clock);
}
window.renderFrame = render;
window.__script = SCRIPT;
render(Number(q.get('t') || 0));
window.__ready = true;
if (q.has('play')) { const t0 = performance.now(); const loop = () => { render(((performance.now() - t0) / 1000) % SCRIPT.duration); requestAnimationFrame(loop); }; loop(); }
