// Full film page (1920×1080 stage, 16:9 like the four reference films). One JSON script
// (film/landscape.json) drives the mantis, the camera, the page, the cursor, the labels and the sound cues.
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

const TAU = Math.PI * 2;

const q = new URLSearchParams(location.search);
const SCRIPT = await (await fetch(q.get('script') || '../film/landscape.json')).json();
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
// v6 shadow fix: bounds ±14 cover the exploded spread so every flying part casts its own ground shadow
Object.assign(key.shadow.camera, { left: -14, right: 14, top: 14, bottom: -14, near: 2, far: 45 });
key.shadow.camera.updateProjectionMatrix();
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

// ground shadow catcher: real key-light shadows (the silhouette contact layer below stays as a faint softener)
const shadowFloor = new THREE.Mesh(new THREE.PlaneGeometry(64, 64), new THREE.ShadowMaterial({ opacity: 0.16 }));
shadowFloor.rotation.x = -Math.PI / 2; shadowFloor.position.set(0.8, 0, 0);
shadowFloor.receiveShadow = true; shadowFloor.renderOrder = -2; scene.add(shadowFloor);
// contact shadow (wider window for the explode)
const CS = { half: 14, res: 512 };
const csCam = new THREE.OrthographicCamera(-CS.half, CS.half, CS.half, -CS.half, 0, 10);
csCam.position.set(0.8, -0.001, 0); csCam.up.set(0, 0, -1); csCam.lookAt(0.8, 1, 0); csCam.layers.set(1);
const silU = { uFar: { value: 3.0 } };
const silMat = new THREE.ShaderMaterial({
  uniforms: silU, side: THREE.DoubleSide,
  vertexShader: 'varying float vH; void main(){ vec4 p = vec4(position,1.0);\n#ifdef USE_INSTANCING\n p = instanceMatrix * p;\n#endif\n vec4 w = modelMatrix * p; vH = w.y; gl_Position = projectionMatrix * viewMatrix * w; }',
  fragmentShader: 'varying float vH; uniform float uFar; void main(){ float k = 1.0 - clamp(vH / uFar, 0.0, 1.0); gl_FragColor = vec4(vec3(k), 1.0); }',
});
const mkRT = () => new THREE.WebGLRenderTarget(CS.res, CS.res, { type: THREE.HalfFloatType });
const csLayers = [{ rt: [mkRT(), mkRT()], far: 6.0, blur: 3.0, passes: 5, op: 0.55 }, { rt: [mkRT(), mkRT()], far: 1.0, blur: 1.0, passes: 2, op: 0.8 }];
const hb = new FullScreenQuad(new THREE.ShaderMaterial(HorizontalBlurShader)), vb = new FullScreenQuad(new THREE.ShaderMaterial(VerticalBlurShader));
const floor = new THREE.Mesh(new THREE.PlaneGeometry(CS.half * 2, CS.half * 2), new THREE.ShaderMaterial({
  transparent: true, depthWrite: false,
  uniforms: { tA: { value: csLayers[0].rt[0].texture }, tB: { value: csLayers[1].rt[0].texture }, oA: { value: 0.55 }, oB: { value: 0.8 }, uCol: { value: new THREE.Color(0x3a3440) } },
  vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
  fragmentShader: 'uniform sampler2D tA, tB; uniform float oA, oB; uniform vec3 uCol; varying vec2 vUv; void main(){ vec2 e = smoothstep(0.0,0.12,vUv)*smoothstep(0.0,0.12,1.0-vUv); float a = clamp(texture2D(tA,vUv).r*oA + texture2D(tB,vUv).r*oB, 0.0, 0.275) * e.x * e.y; gl_FragColor = vec4(uCol, a); }',
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

// faint orbit rings for the teardown act (technical-diagram backdrop, like the reference films);
// thin meshes so they stay out of the bloom pass and the floor silhouette.
// v6: 1 solid + 2 dashed rings (dashed = segmented small cylinders) plus 12 radial ground ticks
const rings = new THREE.Group();
const ringMat = new THREE.MeshBasicMaterial({ color: 0xb9b4c2, transparent: true, opacity: 0 });
{
  const defs = [[8.2, 0.32, 0.1], [10.2, -0.2, 0.26], [12.0, 0.5, -0.14]];
  defs.forEach(([r, tx, tz], ri) => {
    const g = new THREE.Group(); g.rotation.set(Math.PI / 2 + tx, 0, tz);
    if (ri === 0) {
      g.add(new THREE.Mesh(new THREE.TorusGeometry(r, 0.02, 6, 180), ringMat));
    } else {
      const SEG = 64, segGeo = new THREE.CylinderGeometry(0.02, 0.02, 1, 6);   // dashed: segmented small cylinders
      for (let i = 0; i < SEG; i++) {
        const a = (i + 0.31) / SEG * TAU;
        const m = new THREE.Mesh(segGeo, ringMat);
        m.position.set(Math.cos(a) * r, Math.sin(a) * r, 0);
        m.rotation.z = a + Math.PI / 2;
        m.scale.y = r * (TAU / SEG) * 0.62;
        g.add(m);
      }
    }
    rings.add(g);
  });
}
for (const [a, r] of [[0.4, 8.2], [2.2, 10.2], [4.0, 12.0], [5.3, 8.2], [1.2, 10.2]]) {
  const d = new THREE.Mesh(new THREE.SphereGeometry(0.085, 8, 6), ringMat);
  d.position.set(Math.cos(a) * r, 0, Math.sin(a) * r);
  rings.add(d);
}
rings.position.set(0.8, 3.5, 0);
scene.add(rings);
// 12 small radial ticks on the ground around the stance
const groundTicks = new THREE.Group();
for (let i = 0; i < 12; i++) {
  const a = i / 12 * TAU;
  const m = new THREE.Mesh(new THREE.BoxGeometry(0.65, 0.02, 0.1), ringMat);
  m.position.set(0.8 + Math.cos(a) * 10.6, 0.012, Math.sin(a) * 10.6);
  m.rotation.y = -a;
  groundTicks.add(m);
}
scene.add(groundTicks);
function setRings(k) { ringMat.opacity = 0.5 * k; }

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
  const prevBg = scene.background; scene.background = null; floor.visible = false; shadowFloor.visible = false;
  const pa = assist.visible, ps = scan.visible; assist.visible = false; scan.visible = false;   // no matte overlay in the bloom pass
  scene.traverse((o) => { if (!o.isMesh || bloomLayer.test(o.layers)) return; saved.set(o, [o.material, o.visible]); if (o.userData.clear) o.visible = false; else o.material = o.material.side === THREE.BackSide ? blackBack : black; });
  bloomComposer.render();
  for (const [o, [m, v]] of saved) { o.material = m; o.visible = v; }
  saved.clear(); scene.background = prevBg; floor.visible = true; shadowFloor.visible = true; assist.visible = pa; scan.visible = ps;
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
const A = Object.fromEntries(ACTS.map((a) => [a.act, a]));
// optional pre-roll showcase (v4): a 360° turntable before the main film. PRE is where the main film
// (act 0) starts; with no "showcase" block PRE = 0 and every behaviour below is exactly the plain film.
const SC = SCRIPT.showcase || null;
const PRE = ACTS[0].t;
const ABD_ACT = A.abdomen;
const AB = SCRIPT.abdomen;
const EX = SCRIPT.explode;
const RE = SCRIPT.release;
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
  st.apart = [...st.panes, ...st.bands].reduce((s, x) => s + smoother(x), 0) / (st.panes.length + st.bands.length);
  return st;
}

// ------------------------------------------------------------ explode choreography: a grouped assembly explosion, not a debris cloud.
// Stage 1 (shell opens): the abdomen cage blooms — panes out along their surface normals, bands step along the
//   body axis, belly plates drop, coil modules slide out on their radial axes, tail slides back, wings lift.
// Stage 2 (components separate): the head assembly slides off the neck pin, the prothorax eases out of the torso
//   socket, the abdomen slides back along its own body axis, the forelegs slide out on their shoulder pins (±Z).
//   The thorax with its four walking legs stays put as the central skeleton reference.
// Hold: everything stops so the structure can be read. Then reassembly in build order (abdomen → neck → head →
//   forelegs → wings) and the shell closes last. No random parts: every fastener/gear rides inside its component.
function integrateProfile(keys, t0, t1) {
  // keys: [t, speed] piecewise-linear speed; returns a tabulated 0→1 integral over [t0,t1]
  const DTI = 1 / 600, n = Math.round((t1 - t0) / DTI) + 1, arr = new Float64Array(n);
  const speed = (t) => {
    if (t <= keys[0][0]) return keys[0][1];
    for (let i = 1; i < keys.length; i++) if (t <= keys[i][0]) { const [ta, va] = keys[i - 1], [tb, vb] = keys[i]; return lerp(va, vb, (t - ta) / (tb - ta)); }
    return keys[keys.length - 1][1];
  };
  let acc = 0;
  for (let i = 1; i < n; i++) { acc += DTI * speed(t0 + (i - 0.5) * DTI); arr[i] = acc; }
  for (let i = 0; i < n; i++) arr[i] /= acc || 1;
  return (t) => { const x = clamp01((t - t0) / (t1 - t0)) * (n - 1), i = Math.min(n - 2, Math.floor(x)); return lerp(arr[i], arr[i + 1], x - i); };
}
// turntable speed profile anchored to the script's own spin/slow windows (v8: choreography timing is
// script-driven; with v5 values this reproduces the classic 5.2/6.4/6.95/7.15/8.4 profile exactly)
const SP0 = EX.spin[0] - PRE, SP1 = EX.spin[1] - PRE, SL0 = EX.slow[0] - PRE, SL1 = EX.slow[1] - PRE;
const spinOf = integrateProfile([[SP0, 0.6], [SL0, 0.6], [SL0 + 0.55, 0.14], [SL1 + 0.15, 0.14], [SP1, 1.0]], SP0, SP1);
// showcase turntable: exactly one revolution, eased to a stop before the main film takes over (2π ≡ 0)
// out-and-back progress for one component: smooth out, full stop through the hold, smooth seat back on return
const partK = (t, g) => ss(g.out, g.out + g.dur, t) * (1 - ss(g.back, g.back + g.ret, t));
const EXG = Object.entries(EX.groups).map(([name, g]) => ({ name, g, dir: new THREE.Vector3(...g.dir).normalize().multiplyScalar(g.dist) }));
// trains: real-part rows registered in mantis.js (optics, band stack, tail stack, side shells, gears, femur
// shells, joint caps, fastener dust). Each item eases out along its own assembly axis with a small per-item
// stagger, and seats back in reverse stagger — pure translation, no tumble.
const EXT = EX.trains || {};
function trainKs(w, t, n) {
  const ks = [];
  for (let i = 0; i < n; i++) {
    const st = (w.stagger || 0) * i, bt = (w.stagger || 0) * (n - 1 - i);
    ks.push(ss(w.out + st, w.out + st + w.dur, t) * (1 - ss(w.back + bt, w.back + bt + w.ret, t)));
  }
  return ks;
}
function explodeState(t, clock) {
  const off = {}; let kSum = 0, nSum = 0;
  for (const { name, g, dir } of EXG) { const k = partK(t, g); off[name] = dir.clone().multiplyScalar(k); kSum += k; nSum += 1; }
  const SH = EX.shell, SB = EX.shellBack;
  const shellK = (n, st = 0) => ss(SH[n][0] + st, SH[n][0] + st + SH[n][1], t) * (1 - ss(SB[n] + st * 0.6, SB[n] + st * 0.6 + 0.55, t));
  const wk = shellK('wings');
  const bk = shellK('belly');
  // glass cage opens as 7 bay petals: the 8 panes of a bay share one k, tail bays lead
  const pk = new Array(56);
  for (let b = 0; b < 7; b++) { const k = shellK('panes', 0.055 * (6 - b)); for (let j = 0; j < 8; j++) pk[b * 8 + j] = k; }
  // every registered train + the abdomen train categories (bands/modules/tail ride poseAbdomen)
  const itemTrains = mantis.parts.trains || {};
  const trains = {}; const amp = {};
  for (const [name, w] of Object.entries(EXT)) {
    const n = itemTrains[name] ? itemTrains[name].length : (name === 'bands' ? 7 : name === 'modules' ? 6 : 1);
    trains[name] = trainKs(w, t, n);
    kSum += trains[name].reduce((s, x) => s + x, 0); nSum += n;
    if (w.amp) Object.assign(amp, w.amp);
  }
  const gk = trains.bands || new Array(7).fill(0);
  const mk = trains.modules || new Array(6).fill(0);
  const tkArr = trains.tail || [0];
  const tk = tkArr.reduce((s, x) => s + x, 0) / tkArr.length;
  const glow = ss(SH.panes[0], SH.panes[0] + 1.0, t) * (1 - ss(SB.panes, SB.panes + 0.6, t));
  const hold = clamp01((t - EX.hold[0]) / 0.3) * (1 - clamp01((t - (EX.hold[1] - 0.3)) / 0.3));
  const abd = {
    wings: [wk, wk], belly: [bk, bk, bk, bk],
    panes: pk, bands: gk, modules: mk,
    tail: tk, glow, hold, clock, amp,
  };
  kSum += wk + bk + pk.reduce((s, x) => s + x, 0); nSum += 58;
  return {
    off, abd, trains, k: kSum / Math.max(1, nSum),
    spin: THREE.MathUtils.degToRad(EX.spinDeg * spinOf(t - PRE) + (360 - EX.spinDeg) * ss(EX.rejoin[0], EX.rejoin[1], t)),
    slow: t >= EX.slow[0] && t <= EX.slow[1],
  };
}
const _swQ = new THREE.Quaternion();
function applyExplode(ex, clock) {
  for (const [name, v] of Object.entries(ex.off)) if (mantis.parts[name]) mantis.parts[name].position.add(v);
  for (const [name, list] of Object.entries(mantis.parts.trains || {})) {
    const ks = ex.trains[name]; if (!ks) continue;
    list.forEach((it, i) => {
      const k = ks[Math.min(i, ks.length - 1)];
      it.g.position.copy(it.base).addScaledVector(it.dir, it.amp * k);
      // v6: the fastener sway scales with k — bolts are dead-still surface screws at rest (exact reset), sway only while afloat
      if (it.swing) it.g.quaternion.copy(it.baseQ).multiply(_swQ.setFromAxisAngle(it.dir, it.swing * 0.3 * k * Math.sin(clock * 1.3 + i * 1.7)));
    });
  }
}

// ------------------------------------------------------------ v6 holographic assist layer (teardown act only)
// assembly-axis guide lines (one per trajectory, socket → part, length = amp·k·1.2, 2 ticks per line),
// 48 flow particles riding the lines, 3 canvas data plaques, a tail→head scan curtain and the 6.4 s impact pulse.
const assistEnv = (t) => ss(A.explode.t + 0.1, A.explode.t + 0.6, t) * (1 - ss(EX.rejoin[1] - 0.6, EX.rejoin[1] + 0.05, t));
const assist = new THREE.Group(), assistGlow = new THREE.Group();
scene.add(assist, assistGlow);
const guideItems = [];
for (const { name, g } of EXG) guideItems.push({ name, kind: 'group', obj: mantis.parts[name], baseLocal: mantis.parts[name].position.clone() });
for (const [name, items] of Object.entries(mantis.parts.trains)) guideItems.push({ name, kind: 'train', obj: items[0].g, baseLocal: items[0].base.clone() });
// bands / modules move via poseAbdomen (no regTrain entry): representative = the last band (max travel) / first module
guideItems.push({ name: 'bands', kind: 'train', obj: mantis.parts.abdBands[mantis.parts.abdBands.length - 1], baseLocal: mantis.parts.abdBands[mantis.parts.abdBands.length - 1].position.clone() });
guideItems.push({ name: 'modules', kind: 'train', obj: mantis.parts.abdModules[0], baseLocal: mantis.parts.abdModules[0].position.clone() });
const GL = guideItems.length;
const gPos = new Float32Array(GL * 2 * 3), gCol = new Float32Array(GL * 2 * 3), tPos = new Float32Array(GL * 2 * 3), tCol = new Float32Array(GL * 2 * 3);
const COL_TRAIN = new THREE.Color(0xe0168f), COL_GROUP = new THREE.Color(0x6a6f7d);
guideItems.forEach((G, i) => {
  const c = G.kind === 'group' ? COL_GROUP : COL_TRAIN;
  for (let j = 0; j < 2; j++) { gCol.set([c.r, c.g, c.b], (i * 2 + j) * 3); tCol.set([c.r, c.g, c.b], (i * 2 + j) * 3); }
});
const guideGeo = new THREE.BufferGeometry();
guideGeo.setAttribute('position', new THREE.BufferAttribute(gPos, 3)); guideGeo.setAttribute('color', new THREE.BufferAttribute(gCol, 3));
const tickGeo = new THREE.BufferGeometry();
tickGeo.setAttribute('position', new THREE.BufferAttribute(tPos, 3)); tickGeo.setAttribute('color', new THREE.BufferAttribute(tCol, 3));
const guideMat = new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.45 });
const tickMat = new THREE.PointsMaterial({ vertexColors: true, transparent: true, opacity: 0.8, size: 5, sizeAttenuation: false });
assist.add(new THREE.LineSegments(guideGeo, guideMat), new THREE.Points(tickGeo, tickMat));
// 48 flow particles (glow-layer small spheres), interleaved over the guide lines; they flow back on the rejoin
const PN = 48;
const particles = new THREE.InstancedMesh(new THREE.SphereGeometry(0.055, 8, 6), new THREE.MeshBasicMaterial({ color: 0xff5ec0, transparent: true, opacity: 0.85 }), PN);
particles.layers.enable(BLOOM_LAYER); particles.frustumCulled = false; assistGlow.add(particles);
const flowPhase = (t) => {
  const t0 = EX.out[0], tR = EX.rejoin[0];
  return t <= tR ? (t - t0) * 0.5 : (tR - t0) * 0.5 - (t - tR) * 0.75;
};
// micro data plaques (×7 ring stack / ×10 gears / ×32 fastener dust), anchored near their trains, billboarded
function plaqueTexture(text) {
  const c = document.createElement('canvas'); c.width = 256; c.height = 128;
  const g = c.getContext('2d');
  g.fillStyle = 'rgba(255,255,255,0.92)'; g.strokeStyle = '#e0168f'; g.lineWidth = 6;
  g.beginPath(); g.roundRect(8, 8, 240, 112, 18); g.fill(); g.stroke();
  g.fillStyle = '#16151a'; g.font = '700 64px "Inter","Segoe UI",Arial'; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillText(text, 128, 66);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}
const plaques = [['×7', [3.6, 4.35, 1.75]], ['×10', [0.15, 5.0, 1.45]], ['×32', [2.1, 4.85, -1.35]]].map(([txt, at]) => {
  const m = new THREE.Mesh(new THREE.PlaneGeometry(0.58, 0.29), new THREE.MeshBasicMaterial({ map: plaqueTexture(txt), transparent: true, opacity: 0, depthWrite: false }));
  m.position.set(...at); assist.add(m); return m;
});
// scan curtain: a thin glowing plane sweeping tail→head along the body axis (main-film 5.1–5.6 s)
const scan = new THREE.Mesh(new THREE.PlaneGeometry(8.4, 8.4), new THREE.MeshBasicMaterial({ color: 0xe0168f, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
scan.rotation.y = Math.PI / 2; scan.visible = false; mantis.root.add(scan);
function updateAssist(t) {
  if (MASK) { assist.visible = assistGlow.visible = false; return; }
  const env = assistEnv(t);
  guideMat.opacity = 0.45 * env; tickMat.opacity = 0.8 * env;
  assist.visible = env > 0.004; assistGlow.visible = assist.visible;
  if (assist.visible) {
    const _s = new THREE.Vector3(), _p = new THREE.Vector3(), _d = new THREE.Vector3(), _m = new THREE.Matrix4();
    for (let i = 0; i < GL; i++) {
      const G = guideItems[i];
      G.obj.parent.localToWorld(_s.copy(G.baseLocal));   // the socket rides its own component
      G.obj.getWorldPosition(_p);
      _d.subVectors(_p, _s).multiplyScalar(1.2);         // line length = amp·k·1.2 (retracts with k on the reset)
      gPos[i * 6] = _s.x; gPos[i * 6 + 1] = _s.y; gPos[i * 6 + 2] = _s.z;
      gPos[i * 6 + 3] = _s.x + _d.x; gPos[i * 6 + 4] = _s.y + _d.y; gPos[i * 6 + 5] = _s.z + _d.z;
      tPos[i * 6] = _s.x + _d.x * 0.45; tPos[i * 6 + 1] = _s.y + _d.y * 0.45; tPos[i * 6 + 2] = _s.z + _d.z * 0.45;
      tPos[i * 6 + 3] = _s.x + _d.x * 0.85; tPos[i * 6 + 4] = _s.y + _d.y * 0.85; tPos[i * 6 + 5] = _s.z + _d.z * 0.85;
      if (i < PN) {
        const fr = ((i * 0.618 + flowPhase(t)) % 1 + 1) % 1;
        _m.makeTranslation(_s.x + _d.x * fr, _s.y + _d.y * fr, _s.z + _d.z * fr);
        particles.setMatrixAt(i, _m);
      }
    }
    for (let i = GL; i < PN; i++) {
      const G = guideItems[i % GL];
      G.obj.parent.localToWorld(_s.copy(G.baseLocal)); G.obj.getWorldPosition(_p);
      _d.subVectors(_p, _s).multiplyScalar(1.2);
      const fr = ((i * 0.618 + flowPhase(t)) % 1 + 1) % 1;
      _m.makeTranslation(_s.x + _d.x * fr, _s.y + _d.y * fr, _s.z + _d.z * fr);
      particles.setMatrixAt(i, _m);
    }
    guideGeo.attributes.position.needsUpdate = true;
    tickGeo.attributes.position.needsUpdate = true;
    particles.instanceMatrix.needsUpdate = true;
    for (const m of plaques) { m.material.opacity = 0.92 * env; m.lookAt(camera.position); }
  } else {
    for (const m of plaques) m.material.opacity = 0;
  }
  const SCAN = EX.scan || [5.1, 0.5];
  const su = clamp01((t - (PRE + SCAN[0])) / SCAN[1]);
  scan.visible = su > 0 && su < 1;
  if (scan.visible) {
    scan.position.set(lerp(7.5, -5.5, su), 3.4, 0);
    scan.material.opacity = 0.16 * Math.sin(Math.PI * su);
  }
}

// ------------------------------------------------------------ gears + slow-motion clock
const MO = SCRIPT.motion;
const groupOut = (t) => ss(EX.out[0], EX.out[1], t);
const rejoin = (t) => ss(EX.rejoin[0], EX.rejoin[1], t);
const DT = 1 / 600, N = Math.ceil((SCRIPT.duration + 1) / DT) + 1;
const CLK = { body: new Float64Array(N), abd: new Float64Array(N), walk: new Float64Array(N) };
{
  const openAmount = (t) => ss(ABD_ACT.open[0], ABD_ACT.open[1], t) * (1 - ss(ABD_ACT.close[0], ABD_ACT.close[1], t));
  const slowAmt = (t) => 1 - (1 - EX.slowRate) * (ss(EX.slow[0], EX.slow[0] + 0.12, t) * (1 - ss(EX.slow[1], EX.slow[1] + 0.18, t)));
  for (let i = 1; i < N; i++) {
    const t = (i - 0.5) * DT, o = openAmount(t), ex = groupOut(t) * (1 - rejoin(t)), sm = slowAmt(t);
    CLK.body[i] = CLK.body[i - 1] + DT * (1 + MO.gearRate.body * o + 3.5 * ex) * sm;
    CLK.abd[i] = CLK.abd[i - 1] + DT * (1 + MO.gearRate.abd * o + 3.5 * ex) * sm;
    CLK.walk[i] = CLK.walk[i - 1] + DT * (1 - ss(MO.walk.stop[0], MO.walk.stop[1], t)) * (t >= PRE ? 1 : 0);   // walk starts with the main film, not the showcase
  }
}
const clk = (k, t) => { const x = Math.max(0, t) / DT, i = Math.min(N - 2, Math.floor(x)); return lerp(CLK[k][i], CLK[k][i + 1], x - i); };

// ------------------------------------------------------------ stalking motion (intro) + release forearm raise
const legs = ['legMidR', 'legMidL', 'legHindR', 'legHindL'].map((n, j) => {
  const g = mantis.parts[n]; const b = new THREE.Box3().setFromObject(g); const c = b.getCenter(new THREE.Vector3());
  const dh = c.sub(g.userData.pivot).setY(0).normalize();
  return { g, pivot: g.userData.pivot.clone(), lift: new THREE.Vector3().crossVectors(dh, new THREE.Vector3(0, 1, 0)).normalize(), phase: [0, 0.5, 0.5, 0][j] * Math.PI * 2 };
});
const fores = ['forelegR', 'forelegL'].map((n) => ({ g: mantis.parts[n], pivot: mantis.parts[n].userData.pivot.clone() }));
const _q = new THREE.Quaternion(), _q2 = new THREE.Quaternion(), UP = new THREE.Vector3(0, 1, 0), ZA = new THREE.Vector3(0, 0, 1);
function pivotRotate(g, pivot, q) { g.quaternion.copy(q); g.position.add(pivot.clone().sub(pivot.clone().applyQuaternion(q))); }
function stalk(t, raise) {
  const W = MO.walk, walk = clk('walk', t), live = 1 - ss(W.stop[0], W.stop[1], t);
  mantis.root.position.set(-W.speed * walk, 0, 0);
  for (const L of legs) {
    const ph = 2 * Math.PI * W.stepHz * walk + L.phase, up = Math.max(0, Math.sin(ph)) ** 2 * live;
    _q.setFromAxisAngle(L.lift, W.stepLift * up); _q2.setFromAxisAngle(UP, W.stepSwing * Math.cos(ph) * live); _q.premultiply(_q2);
    pivotRotate(L.g, L.pivot, _q);
  }
  fores.forEach((F, j) => {
    _q.setFromAxisAngle(ZA, -(0.62 * raise));
    pivotRotate(F.g, F.pivot, _q);
  });
}

// ------------------------------------------------------------ camera: shot library + per-act key tracks, 0.6 s cross-blend between acts
// Shot targets are mantis-local points, or a part name (e.g. "tip_forelegR") whose live world position is used —
// the release shot follows the blade tip wherever the R8 geometry puts it.
const CAM = SCRIPT.camera, SHOTS = SCRIPT.shots;
const _tv = new THREE.Vector3();
function resolveShot(s) {
  const tw = typeof s.target === 'string'
    ? mantis.parts[s.target].getWorldPosition(new THREE.Vector3())
    : new THREE.Vector3(...s.target).add(mantis.root.position);
  return { ...s, tw };
}
const lerpShot = (a, b, k) => ({ az: lerp(a.az, b.az, k), el: lerp(a.el, b.el, k), d: lerp(a.d, b.d, k), fov: lerp(a.fov, b.fov, k), screenX: lerp(a.screenX ?? 0.5, b.screenX ?? 0.5, k), screenY: lerp(a.screenY, b.screenY, k), tw: a.tw.clone().lerp(b.tw, k) });
// flow mode (v8): monotone cubic (Fritsch–Carlson / PCHIP) through the act's keys — C1-continuous,
// no per-key stops and no velocity kinks. FPV research takeaway: cinematic FPV is fluidity, not speed;
// the speed sensation comes from proximity. One committed, silky take.
function pchipM(xs, ys) {
  const n = xs.length, d = [], m = new Array(n);
  for (let i = 0; i < n - 1; i++) d.push((ys[i + 1] - ys[i]) / (xs[i + 1] - xs[i]));
  m[0] = d[0]; m[n - 1] = d[n - 2];
  for (let i = 1; i < n - 1; i++) {
    if (d[i - 1] * d[i] <= 0) m[i] = 0;
    else { const h0 = xs[i] - xs[i - 1], h1 = xs[i + 1] - xs[i], w1 = 2 * h1 + h0, w2 = h1 + 2 * h0; m[i] = (w1 + w2) / (w1 / d[i - 1] + w2 / d[i]); }
  }
  return m;
}
function pchipY(xs, ys, m, x) {
  if (x <= xs[0]) return ys[0];
  if (x >= xs[xs.length - 1]) return ys[ys.length - 1];
  let i = 0; while (x > xs[i + 1]) i++;
  const h = xs[i + 1] - xs[i], t = (x - xs[i]) / h, t2 = t * t, t3 = t2 * t;
  return (2 * t3 - 3 * t2 + 1) * ys[i] + (t3 - 2 * t2 + t) * h * m[i] + (-2 * t3 + 3 * t2) * ys[i + 1] + (t3 - t2) * h * m[i + 1];
}
function actCamera(i, t) {
  const keys = ACTS[i].camera;
  if (ACTS[i].flow) {
    const ts = keys.map((k) => k.t), shots = keys.map((k) => resolveShot(SHOTS[k.shot]));
    const chan = (f) => { const ys = shots.map(f); return pchipY(ts, ys, pchipM(ts, ys), t); };
    return {
      az: chan((s) => s.az), el: chan((s) => s.el), d: chan((s) => s.d), fov: chan((s) => s.fov),
      screenX: chan((s) => s.screenX ?? 0.5), screenY: chan((s) => s.screenY),
      tw: new THREE.Vector3(chan((s) => s.tw.x), chan((s) => s.tw.y), chan((s) => s.tw.z)),
    };
  }
  if (t <= keys[0].t) return resolveShot(SHOTS[keys[0].shot]);
  for (let j = 1; j < keys.length; j++) {
    if (t <= keys[j].t) { const B = SHOTS[keys[j].shot]; return lerpShot(resolveShot(SHOTS[keys[j - 1].shot]), resolveShot(B), EASE[B.ease]((t - keys[j - 1].t) / (keys[j].t - keys[j - 1].t))); }
  }
  return resolveShot(SHOTS[keys[keys.length - 1].shot]);
}
// Camera tracks the walking path; local angular and respiratory offsets stay on the animal.
function beatView(i,t) {
  const [start,name,az,el,d,target,rate,push]=SCRIPT.views[i];
  if(name==='groom'){
    const parts=mantis.parts, loc=obj=>obj.getWorldPosition(new THREE.Vector3());
    const tw=loc(parts.sampleKnee).multiplyScalar(.42).addScaledVector(loc(parts.sampleFemur),.30)
      .addScaledVector(loc(parts.tip_forelegR),.28);
    return {az:52+2*(t-start),el:15,d:9.7/CAM.heroDist,fov:30,screenX:.50,screenY:.5,tw};
  }
  if(name==='teardown') return actCamera(2,t);
  if(name==='release') {
    const settle = ss(14.85,17.35,t);
    return resolveShot({az:3+5*settle,el:12+2*settle,d:(26-.35*settle)/CAM.heroDist,
      fov:32,screenX:.46,screenY:.58,target:[-1,3.3,0]});
  }
  const u=t-start;
  return resolveShot({az:az+rate*u,el,d:(d-push*u)/CAM.heroDist,target,screenY:.50,fov:32});
}
function cameraAt(t) {
  const i=SCRIPT.views.findLastIndex(row=>t>=row[0]);
  const next=beatView(i,t);
  if(!i) return next;
  const k=ss(SCRIPT.views[i][0],SCRIPT.views[i][0]+SCRIPT.blend,t);
  if(k>=1) return next;
  const prev=beatView(i-1,t);
  next.az=prev.az+((next.az-prev.az+540)%360)-180;
  const c=lerpShot(prev,next,k);
  c.d+=CAM.dollyUnits*Math.sin(Math.PI*k)/CAM.heroDist;
  return c;
}
function placeCamera(t) {
  const c = cameraAt(t), az = THREE.MathUtils.degToRad(CAM.heroAzWorld - c.az), el = THREE.MathUtils.degToRad(c.el), d = c.d * CAM.heroDist;
  const T = c.tw;
  camera.fov = c.fov; camera.aspect = W / H;
  camera.setViewOffset(W, H, (0.5 - (c.screenX ?? 0.5)) * W, (0.5 - c.screenY) * H, W, H);
  camera.position.set(T.x - Math.sin(az) * Math.cos(el) * d, T.y + Math.sin(el) * d, T.z + Math.cos(az) * Math.cos(el) * d);
  camera.lookAt(T);
  camera.updateProjectionMatrix();
  return c;
}

// ------------------------------------------------------------ page: brand, live tag, title, pills, cards, status, cursor, labels, rings, veil
const ui = document.getElementById('ui');
ui.style.transform = `scale(${W / 1920})`;
if (MASK || q.has('noui')) ui.classList.add('hide');
document.getElementById('brandname').textContent = SCRIPT.product.brand || 'ORCHIS';
document.getElementById('pname').innerHTML = SCRIPT.product.name.replace(/(MX-\d+)/, '<b>$1</b>');
document.getElementById('ptitle').textContent = SCRIPT.product.title;
document.getElementById('pdate').textContent = SCRIPT.product.date || '';
// faint orbit rings + dots
document.getElementById('rings').innerHTML = `<svg width="1920" height="1080" viewBox="0 0 1920 1080">
  ${[330, 520, 700, 880].map((r, i) => `<circle cx="960" cy="560" r="${r}" fill="none" stroke="#d6d2de" stroke-width="1.2" stroke-dasharray="${i % 2 ? '3 14' : '1 0'}" opacity="0.55"/>`).join('')}
  ${[[430, 240], [1520, 320], [300, 780], [1650, 700], [1180, 170], [720, 940]].map(([x, y]) => `<circle cx="${x}" cy="${y}" r="4" fill="#d6d2de" opacity="0.7"/>`).join('')}
</svg>`;
// pills
const pills = {};
for (const b of SCRIPT.buttons) {
  const d = document.createElement('div'); d.className = 'pill'; d.innerHTML = `<span class="tri"></span>${b.label}`;
  document.getElementById('pills').append(d); pills[b.id] = d;
}
// cards
const cardEls = {};
for (const c of SCRIPT.cards) {
  const d = document.createElement('div'); d.className = 'card';
  const widget = c.widget === 'wave' ? '<div class="w"><svg viewBox="0 0 260 26" preserveAspectRatio="none"><polyline id="w_' + c.id + '" fill="none" stroke="#e0168f" stroke-width="2.2"/></svg></div>'
    : c.widget === 'progress' ? '<div class="prog"><i id="w_' + c.id + '"></i></div>'
    : c.widget === 'segments' ? '<div class="seg" id="w_' + c.id + '">' + Array.from({ length: 8 }, () => '<i></i>').join('') + '</div>'
    : '<div class="batt"><i id="w_' + c.id + '"></i></div>';
  d.innerHTML = `<div class="ct">${c.title}</div><div class="cv"><span id="v_${c.id}">0</span><small>${c.unit}</small></div>${widget}`;
  document.getElementById('cards').append(d); cardEls[c.id] = d;
}
// labels
const labEls = [];
for (const grp of ['abdomen', 'explode']) {
  for (const L of SCRIPT.labels[grp]) {
    const d = document.createElement('div'); d.className = 'lab';
    d.innerHTML = `<div class="lt">${L.title}</div><div class="ls">${L.sub}</div>`;
    d.style.left = `${L.at[0] * 1920}px`; d.style.top = `${L.at[1] * 1080}px`;
    document.getElementById('labels').append(d);
    labEls.push({ ...L, el: d, grp });
  }
}
const leaders = document.getElementById('leaders');
leaders.innerHTML = labEls.map((_, i) => `<path id="ld${i}" fill="none" stroke="#b9b4c2" stroke-width="1.6"/><circle id="lc${i}" r="5" fill="#e0168f"/>`).join('');

const drawUI = (() => {
  const stxt = document.getElementById('stxt'), sbar = document.getElementById('sbar'), tcEl = document.getElementById('tc');
  const cursor = document.getElementById('cursor'), veil = document.getElementById('veil'), hud = document.getElementById('hud');
  const hash = (x) => { const s = Math.sin(x * 127.1) * 43758.5453; return s - Math.floor(s); };
  return (t, ab, ex, strike, raise) => {
    const ai = actIndex(t), act = ACTS[ai];
    // status
    let txt = act.status;
    if (act.act === 'abdomen') txt = t < ABD_ACT.open[0] ? 'Abdomen' : SCRIPT.ui.statusOpen.replace('{pct}', Math.round(62 * ab.apart));
    if (act.act === 'explode') txt = SCRIPT.ui.statusExplode.replace('{pct}', Math.round(65 * clamp01(ex.k)));
    stxt.textContent = txt;
    // main-film clock (the showcase keeps 00:00.0 / 0% like the film's own first frame); with a showcase,
    // snap to the frame grid so the timecode tenths match the plain film exactly despite float drift
    const tm = SC ? Math.round((t - PRE) * SCRIPT.fps) / SCRIPT.fps : Math.max(0, t - PRE);
    sbar.style.width = `${(100 * tm / (SCRIPT.duration - PRE)).toFixed(2)}%`;
    const s = Math.floor(tm), cs = Math.floor((tm - s) * 10);
    tcEl.textContent = `00:${String(s).padStart(2, '0')}.${cs}`;
    // pills + cursor
    const click = SCRIPT.cursor.clicks;
    let cx = SCRIPT.cursor.start[0], cy = SCRIPT.cursor.start[1];
    for (let i = 0; i < click.length; i++) {
      const C = click[i], el = pills[C.button];
      const px = (el.offsetLeft + el.offsetWidth / 2) / 1920, py = (el.offsetTop + el.offsetHeight * 1.35) / 1080;
      const from = i === 0 ? SCRIPT.cursor.start : [click[i - 1] ? (pills[click[i - 1].button].offsetLeft + pills[click[i - 1].button].offsetWidth / 2) / 1920 : cx,
        i === 0 ? SCRIPT.cursor.start[1] : (pills[click[i - 1].button].offsetTop + pills[click[i - 1].button].offsetHeight * 1.35) / 1080];
      const k = ss(C.move[0], C.move[1], t);
      cx = lerp(from[0], px, k); cy = lerp(from[1], py, k);
    }
    cursor.style.left = `${cx * 1920 - 4}px`; cursor.style.top = `${cy * 1080 - 2}px`;
    const press = click.reduce((m, C) => Math.max(m, 1 - clamp01(Math.abs(t - C.t) / 0.09)), 0);
    cursor.style.transform = `scale(${1 - 0.18 * press})`;
    for (const b of SCRIPT.buttons) {
      const on = click.some((C) => C.button === b.id && t >= C.t - 0.02 && t <= C.t + 1.2);
      pills[b.id].classList.toggle('on', on);
    }
    // cards
    const jolt = (k) => (hash(Math.floor(tm * 6) + k) - 0.5);   // main-film clock keeps the v3 readout jitter identical
    const glow = clamp01(ab.glow), exAmt = clamp01(ex.k);
    const strikeV = (3.2 * strike).toFixed(2), springV = Math.round(420 + 260 * raise + 1500 * strike + 8 * jolt(1));
    document.getElementById('v_strike').textContent = strikeV;
    document.getElementById('v_spring').textContent = springV;
    document.getElementById('v_coil').textContent = (61 + 26 * glow + 2 * jolt(2)).toFixed(1);
    document.getElementById('v_battery').textContent = Math.round(92 - 6 * exAmt - 3 * strike + 2 * jolt(3));
    {
      const pts = [];
      for (let i = 0; i <= 26; i++) pts.push(`${i * 10},${13 + Math.sin(i * 0.9 + tm * 7) * (2 + 8 * strike + 3 * jolt(4))}`);
      document.getElementById('w_strike').setAttribute('points', pts.join(' '));
    }
    document.getElementById('w_spring').style.width = `${Math.min(100, 18 + 26 * raise + 56 * strike + 3 * jolt(5))}%`;
    {
      const segs = cardEls.coil.querySelectorAll('.seg i'), n = Math.round(2 + 6 * glow);
      segs.forEach((el2, i) => el2.classList.toggle('on', i < n));
    }
    document.getElementById('w_battery').style.width = `${92 - 6 * exAmt - 3 * strike}%`;
    // labels + leaders
    for (let i = 0; i < labEls.length; i++) {
      const L = labEls[i];
      const path = document.getElementById(`ld${i}`), dot = document.getElementById(`lc${i}`);
      let on = t >= L.t[0] && t <= L.t[1] && !MASK;
      if (on) {
        // static labels rotate with the turntable; "track" labels ride a moving component (root-local anchor + live offset)
        const v = L.track && mantis.parts[L.track]
          ? mantis.root.localToWorld(new THREE.Vector3(...L.anchor).add(mantis.parts[L.track].position))
          : new THREE.Vector3(...L.anchor).applyAxisAngle(UP, window.__spin || 0).add(mantis.root.position);
        v.project(camera);
        const sx = (v.x * 0.5 + 0.5) * 1920, sy = (-v.y * 0.5 + 0.5) * 1080;
        // v6: with the flythrough camera an anchor can leave the frame — hide the label instead of drawing a broken leader
        on = v.z < 1 && sx > 64 && sx < 1856 && sy > 128 && sy < 1008;
        if (on) {
          const bx = L.at[0] * 1920 + 90, by = L.at[1] * 1080 + 34;
          path.setAttribute('d', `M ${bx} ${by} L ${sx} ${sy}`);
          dot.setAttribute('cx', sx); dot.setAttribute('cy', sy); dot.setAttribute('opacity', 1);
        }
      }
      L.el.style.opacity = on ? 1 : 0;
      if (!on) { path.setAttribute('d', ''); dot.setAttribute('opacity', 0); }
    }
    // fade veil
    veil.style.opacity = (0.62 * ss(RE.fade[0], RE.fade[1], t)).toFixed(3);
    // HUD corner brackets fade in/out with the teardown act
    hud.style.opacity = (0.9 * assistEnv(t)).toFixed(3);
    // showcase: the dashboard boots up over the last beat of the turntable (untouched when no showcase)
    if (SC) ui.style.opacity = smoother(clamp01((t - SC.ui[0]) / (SC.ui[1] - SC.ui[0])));
  };
})();

// ------------------------------------------------------------ render(t): pure function of time
if (MASK) {
  scene.background = new THREE.Color(0x000000); floor.visible = false; shadowFloor.visible = false;
  scene.overrideMaterial = new THREE.MeshBasicMaterial({ color: 0xffffff, side: THREE.DoubleSide });
}
function render(t, probeOnly=false) {
  // gear clocks rebased to the main-film clock so the v3 segment runs identically (the showcase just adds
  // a constant offset that cancels at the handoff); the walk clock already starts at the handoff
  const gc = { body: clk('body', t) - PRE, abd: clk('abd', t) - PRE };
  const ab = abdomenState(t, gc.abd);
  const ex = explodeState(t, gc.abd);
  const strike = ss(RE.strike[0], RE.strike[1], t)*(1-ss(RE.strike[1],RE.strike[1]+.34,t));
  const raise = ss(RE.raise[0], RE.raise[1], t);
  // during the showcase pre-roll the model turns a full revolution; the main film drives the teardown spin
  if(t >= EX.rejoin[1]) ex.spin = 0;
  const spinV = ex.spin;
  window.__spin = spinV;
  // the explode act drives the abdomen groups with its own staged shell-open state
  const abdState = (t >= A.explode.t && t < A.release.t + 0.02) ? ex.abd : ab;
  mantis.update(t, gc, true);   // idle micro-animations (head sway, wing flutter, springs) run on the main-film clock
  mantis.pose({ clock: gc.abd, abd: abdState, explode: 0, spin: spinV, strike:0 });
  stalk(t, 0);
  mantis.articulate(t,true);
  applyExplode(ex, gc.abd);
  setRings(ss(EX.out[0], EX.out[0] + 0.5, t) * (1 - ss(EX.rejoin[1] - 0.35, EX.rejoin[1], t)));
  updateAssist(t);
  // impact pulse (tech layer): one 0.25 s emissive envelope on the shared magenta/claw/coil materials at 6.4 s
  const pE = Math.max(0, 1 - Math.abs(t - EX.slow[0]) / 0.125), pulse = smoother(pE);
  M.magenta.emissiveIntensity = 0.6 + 1.1 * pulse;
  M.claw.emissiveIntensity = 0.6 + 1.1 * pulse;
  M.coil.emissiveIntensity += 1.1 * pulse;
  placeCamera(t);
  bloomPass.strength = lerp(AB.glow.bloom[0], AB.glow.bloom[1], clamp01(abdState.glow));
  if(probeOnly) { mantis.root.updateMatrixWorld(true); camera.updateMatrixWorld(true); }
  else if (MASK) { renderer.render(scene, camera); }
  else { contactShadow(); renderBloom(); finalComposer.render(); }
  if(!probeOnly) drawUI(t, ab, ex, strike, raise);
  const tip = mantis.parts.tip_forelegR.getWorldPosition(new THREE.Vector3());
  window.__state = {
    t, cam: cameraAt(t), apart: ab.apart, glow: abdState.glow, ex: ex.k, spin: ex.spin, strike,
    tip: tip.toArray().map((v) => +v.toFixed(3)), tipNdc: tip.project(camera).toArray().map((v) => +v.toFixed(3)),
  };
}
window.renderFrame = render;
window.__script = SCRIPT;
window.__mantis = mantis;
window.__THREE = THREE;
window.__camera = camera;
render(Number(q.get('t') || 0));
window.__ready = true;
if (q.has('play')) { const t0 = performance.now(); const loop = () => { render(((performance.now() - t0) / 1000) % SCRIPT.duration); requestAnimationFrame(loop); }; loop(); }
