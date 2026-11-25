import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { BokehPass } from 'three/addons/postprocessing/BokehPass.js';
import { FullScreenQuad } from 'three/addons/postprocessing/Pass.js';
import { HorizontalBlurShader } from 'three/addons/shaders/HorizontalBlurShader.js';
import { VerticalBlurShader } from 'three/addons/shaders/VerticalBlurShader.js';
import { buildMantis, BLOOM_LAYER } from './mantis.js';

const q = new URLSearchParams(location.search);
const num = (k, d) => (q.has(k) ? parseFloat(q.get(k)) : d);
const W = num('w', 1600), H = num('h', 900);
const MASK = q.has('mask');

const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
renderer.setPixelRatio(num('dpr', 1));
renderer.setSize(W, H);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.NeutralToneMapping;
renderer.toneMappingExposure = num('exp', 1.0);
renderer.shadowMap.enabled = !MASK;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
document.body.appendChild(renderer.domElement);

const scene = new THREE.Scene();

// ---- near-white vertical gradient backdrop (drawn in code)
function gradientTexture() {
  const c = document.createElement('canvas'); c.width = 4; c.height = 512;
  const g = c.getContext('2d'); const gr = g.createLinearGradient(0, 0, 0, 512);
  gr.addColorStop(0, '#f7f6f9'); gr.addColorStop(0.55, '#efeef2'); gr.addColorStop(1, '#e4e3e8');
  g.fillStyle = gr; g.fillRect(0, 0, 4, 512);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}
scene.background = MASK ? new THREE.Color(0x000000) : gradientTexture();

// ---- environment: RoomEnvironment through PMREM (toggle with ?noenv to verify it is doing work)
const pmrem = new THREE.PMREMGenerator(renderer);
const envTex = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
scene.environment = q.has('noenv') ? null : envTex;
scene.environmentIntensity = num('env', 0.7);

// ---- lights: key (soft self-shadow), rim from behind-above, low fill, hemisphere
scene.add(new THREE.HemisphereLight(0xffffff, 0xcfcfd6, 0.45));
const key = new THREE.DirectionalLight(0xffffff, num('key', 2.2));
key.position.set(-5, 14, 8); key.target.position.set(0.5, 3, 0);
key.castShadow = true; key.shadow.mapSize.set(2048, 2048);
Object.assign(key.shadow.camera, { left: -8, right: 8, top: 8, bottom: -8, near: 2, far: 40 });
key.shadow.bias = -0.0004; key.shadow.normalBias = 0.03; key.shadow.radius = 4;
scene.add(key, key.target);
const rim = new THREE.DirectionalLight(0xf2f5ff, num('rim', 2.0)); rim.position.set(6, 10, -10); scene.add(rim);
const fill = new THREE.DirectionalLight(0xfff6ee, 0.35); fill.position.set(6, 1, 9); scene.add(fill);

// Sparse registration marks give the low orbit a stationary foreground reference.
const marking=new THREE.MeshBasicMaterial({color:0xaaa7ae,transparent:true,opacity:.30,depthWrite:false});
for(let j=0;j<32;j++){
  const angle=j*Math.PI/16;
  const major=j%4===0;
  const mark=new THREE.Mesh(new THREE.PlaneGeometry(major?.043:.028,major?.45:.17),marking);
  mark.rotation.order='YXZ';mark.rotation.x=-Math.PI/2;mark.rotation.y=angle;
  mark.position.set(7.6*Math.sin(angle),.008,7.6*Math.cos(angle));
  scene.add(mark);
}
const mantis = buildMantis();
scene.add(mantis.root);
const M = mantis.M;
if(q.has('clay')) { const clay=new THREE.MeshStandardMaterial({color:0xaaaaaa,roughness:0.75,side:THREE.DoubleSide});mantis.root.traverse(o=>{if(o.isMesh){o.material=clay;o.layers.disable(BLOOM_LAYER);}}); }
if (q.has('noglass')) mantis.root.traverse((o) => { if (o.isMesh && o.material === mantis.M.glass) o.visible = false; });
if (q.has('nolamps')) mantis.root.traverse((o) => { if (o.isPointLight) o.visible = false; });
if (q.has('nocc')) for (const m of Object.values(M)) if ('clearcoat' in m) m.clearcoat = 0;

// dark studio for the eye lenses: deep black with crisp highlights instead of a grey haze (from cutaway's stage)
{
  const env = new THREE.Scene(); env.background = new THREE.Color(0x060608);
  for (const [w, h, d, k] of [[10, 5, [-0.2, 1, 0.2], 3], [4, 6, [-0.85, 0.3, 0.45], 1.5], [5, 3, [0.42, 0.62, 0.66], 2]]) {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ color: new THREE.Color(1, 1, 1).multiplyScalar(k), side: THREE.DoubleSide }));
    m.position.copy(new THREE.Vector3(...d).normalize().multiplyScalar(15)); m.lookAt(0, 0, 0); env.add(m);
  }
  M.lens.envMap = pmrem.fromScene(env, 0.03).texture; M.lens.needsUpdate = true;
  // the glass panes get the same dark studio (a little lifted): crisp softbox streaks, no grey veil over the mechanism
  env.background = new THREE.Color(0x0c0c0e);
  M.glass.envMap = pmrem.fromScene(env, 0.01).texture; M.glass.needsUpdate = true;
}

// ---- contact shadow: the mantis seen from below, lower parts darker, blurred wide + tight, laid on the floor
const CS = { half: 9, res: 512 };
const csCam = new THREE.OrthographicCamera(-CS.half, CS.half, CS.half, -CS.half, 0, 8);
csCam.position.set(0.8, -0.001, 0); csCam.up.set(0, 0, -1); csCam.lookAt(0.8, 1, 0); csCam.layers.set(1);
const silU = { uFar: { value: 3.0 } };
const silMat = new THREE.ShaderMaterial({
  uniforms: silU, side: THREE.DoubleSide,
  vertexShader: 'varying float vH; void main(){ vec4 w = modelMatrix * vec4(position,1.0); vH = w.y; gl_Position = projectionMatrix * viewMatrix * w; }',
  fragmentShader: 'varying float vH; uniform float uFar; void main(){ float k = 1.0 - clamp(vH / uFar, 0.0, 1.0); gl_FragColor = vec4(vec3(k), 1.0); }',
});
// instanced meshes need the instance matrix in the silhouette pass
silMat.vertexShader = 'varying float vH; void main(){ vec4 p = vec4(position,1.0);\n#ifdef USE_INSTANCING\n p = instanceMatrix * p;\n#endif\n vec4 w = modelMatrix * p; vH = w.y; gl_Position = projectionMatrix * viewMatrix * w; }';
const mkRT = () => new THREE.WebGLRenderTarget(CS.res, CS.res, { type: THREE.HalfFloatType });
const csLayers = [{ rt: [mkRT(), mkRT()], far: 6.0, blur: 3.2, passes: 5, op: 1.1 }, { rt: [mkRT(), mkRT()], far: 1.0, blur: 1.0, passes: 2, op: 1.6 }];
const hb = new FullScreenQuad(new THREE.ShaderMaterial(HorizontalBlurShader)), vb = new FullScreenQuad(new THREE.ShaderMaterial(VerticalBlurShader));
const floorMat = new THREE.ShaderMaterial({
  transparent: true, depthWrite: false,
  uniforms: { tA: { value: csLayers[0].rt[0].texture }, tB: { value: csLayers[1].rt[0].texture }, oA: { value: csLayers[0].op }, oB: { value: csLayers[1].op }, uCol: { value: new THREE.Color(0x3a3440) } },
  vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
  fragmentShader: 'uniform sampler2D tA, tB; uniform float oA, oB; uniform vec3 uCol; varying vec2 vUv; void main(){ vec2 e = smoothstep(0.0,0.12,vUv)*smoothstep(0.0,0.12,1.0-vUv); float a = clamp(texture2D(tA,vUv).r*oA + texture2D(tB,vUv).r*oB, 0.0, 0.55) * e.x * e.y; gl_FragColor = vec4(uCol, a); }',
});
const floor = new THREE.Mesh(new THREE.PlaneGeometry(CS.half * 2, CS.half * 2), floorMat);
floor.rotation.x = -Math.PI / 2; floor.position.set(0.8, 0.002, 0); floor.renderOrder = -1;
if (!MASK) scene.add(floor);
mantis.root.traverse((o) => { if (o.isMesh && !o.userData.clear) o.layers.enable(1); });
function contactShadow() {
  const prevBg = scene.background, prevOv = scene.overrideMaterial, prevCol = renderer.getClearColor(new THREE.Color()), prevA = renderer.getClearAlpha();
  scene.background = null; scene.overrideMaterial = silMat; renderer.setClearColor(0x000000, 1);
  const ps = renderer.shadowMap.autoUpdate; renderer.shadowMap.autoUpdate = false;
  for (const L of csLayers) {
    silU.uFar.value = L.far;
    renderer.setRenderTarget(L.rt[0]); renderer.clear(); renderer.render(scene, csCam);
    for (let i = 0; i < L.passes; i++) {
      hb.material.uniforms.tDiffuse.value = L.rt[0].texture; hb.material.uniforms.h.value = L.blur / CS.res; renderer.setRenderTarget(L.rt[1]); hb.render(renderer);
      vb.material.uniforms.tDiffuse.value = L.rt[1].texture; vb.material.uniforms.v.value = L.blur / CS.res; renderer.setRenderTarget(L.rt[0]); vb.render(renderer);
    }
  }
  renderer.shadowMap.autoUpdate = ps;
  renderer.setRenderTarget(null); scene.background = prevBg; scene.overrideMaterial = prevOv; renderer.setClearColor(prevCol, prevA);
}
// the key light's shadow only falls on the mantis itself (self-shadow); the floor gets the contact shadow
mantis.root.traverse((o) => { if (o.isMesh) o.receiveShadow = !o.userData.clear; });

// ---- selective bloom: only the coils glow
const camera = new THREE.PerspectiveCamera(num('fov', 28), W / H, 0.1, 200);
const bloomRT = new THREE.WebGLRenderTarget(W, H, { type: THREE.HalfFloatType });
const bloomComposer = new EffectComposer(renderer, bloomRT); bloomComposer.renderToScreen = false;
bloomComposer.addPass(new RenderPass(scene, camera));
bloomComposer.addPass(new UnrealBloomPass(new THREE.Vector2(W, H), num('bloom', 0.38), 0.12, 0.1));
const finalComposer = new EffectComposer(renderer, new THREE.WebGLRenderTarget(W, H, { type: THREE.HalfFloatType, samples: 4 }));
finalComposer.addPass(new RenderPass(scene, camera));
const mix = new ShaderPass(new THREE.ShaderMaterial({
  uniforms: { baseTexture: { value: null }, bloomTexture: { value: bloomComposer.renderTarget2.texture } },
  vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
  fragmentShader: 'uniform sampler2D baseTexture, bloomTexture; varying vec2 vUv; void main(){ gl_FragColor = texture2D(baseTexture, vUv) + vec4(texture2D(bloomTexture, vUv).rgb, 0.0); }',
}), 'baseTexture');
mix.needsSwap = true;
finalComposer.addPass(mix);
// shallow depth of field for the macro shots (enabled in frameShot)
const bokeh = new BokehPass(scene, camera, { focus: 7, aperture: 0.006, maxblur: 0.012 }); bokeh.enabled = false;
finalComposer.addPass(bokeh);
finalComposer.addPass(new OutputPass());
const black = new THREE.MeshBasicMaterial({ color: 0x000000 });
const blackBack = new THREE.MeshBasicMaterial({ color: 0x000000, side: THREE.BackSide });
const bloomLayer = new THREE.Layers(); bloomLayer.set(BLOOM_LAYER);
const saved = new Map();
function renderBloom() {
  const prevBg = scene.background; scene.background = null; floor.visible = false;
  scene.traverse((o) => {
    if (!o.isMesh || bloomLayer.test(o.layers)) return;
    saved.set(o, [o.material, o.visible]);
    if (o.userData.clear) o.visible = false; else o.material = o.material.side === THREE.BackSide ? blackBack : black;
  });
  bloomComposer.render();
  for (const [o, [m, v]] of saved) { o.material = m; o.visible = v; }
  saved.clear(); scene.background = prevBg; floor.visible = true;
}

// ---- mask mode: body white, walking legs + antennae black, for the density metric's body region
if (MASK) {
  const white = new THREE.MeshBasicMaterial({ color: 0xffffff, side: THREE.DoubleSide });
  const out = new Set(); mantis.root.traverse((o) => { if (o.userData.maskOut) o.traverse((c) => out.add(c)); });
  mantis.root.traverse((o) => { if (o.isMesh) { o.material = out.has(o) ? black : white; o.visible = true; } });
  scene.traverse((o) => { if (o.isLight) o.visible = false; });
  renderer.toneMapping = THREE.NoToneMapping;
}

// ---- cameras: the hero (auto-fit) and three macro shots matched to the reference close-ups
function screenBounds() {
  const v = new THREE.Vector3(); let x0 = 1, x1 = -1, y0 = 1, y1 = -1;
  mantis.root.updateMatrixWorld(true); camera.updateMatrixWorld(true);
  mantis.root.traverse((o) => {
    if (!o.isMesh || !o.visible || o.isInstancedMesh) return;
    const a = o.geometry.attributes.position;
    for (let i = 0; i < a.count; i++) {
      v.fromBufferAttribute(a,i).applyMatrix4(o.matrixWorld).project(camera);
      x0 = Math.min(x0, v.x); x1 = Math.max(x1, v.x); y0 = Math.min(y0, v.y); y1 = Math.max(y1, v.y);
    }
  });
  return { x0, x1, y0, y1 };
}
const dirOf = (az, el) => { az = THREE.MathUtils.degToRad(az); el = THREE.MathUtils.degToRad(el); return new THREE.Vector3(-Math.sin(az) * Math.cos(el), Math.sin(el), Math.cos(az) * Math.cos(el)); };
function frameHero() {
  // measured from hero.png by tools/fitcam.py: az ≈ 26°, el ≈ 3° (FOV 28°). Brief: raise to 15-20° → el 15, az 22 (within the fit's spread).
  // distance is set from the measured box height (0.89 of the frame; hfill calibrated against tools/measure.py)
  const dir = dirOf(num('az', 24), num('el', 12));
  const target = new THREE.Vector3(0.6, 3.3, 0);
  let dist = 26; const fill = num('fill', 0.88), cx = num('cx', 0.0), cy = num('cy', 0.0);
  for (let it = 0; it < 12; it++) {
    camera.position.copy(target).addScaledVector(dir, dist); camera.lookAt(target);
    const b = screenBounds();
    const w = (b.x1 - b.x0) / 2, h = (b.y1 - b.y0) / 2;
    dist *= 0.35 + 0.65 * Math.max(w / fill, h / num('hfill', 0.92));
    const mx = (b.x0 + b.x1) / 2 - cx, my = (b.y0 + b.y1) / 2 - cy;
    const right = new THREE.Vector3().setFromMatrixColumn(camera.matrixWorld, 0);
    const up = new THREE.Vector3().setFromMatrixColumn(camera.matrixWorld, 1);
    const halfH = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)) * dist;
    target.addScaledVector(right, mx * halfH * camera.aspect).addScaledVector(up, my * halfH);
  }
  camera.position.copy(target).addScaledVector(dir, dist); camera.lookAt(target);
}
// macro shots: [az, el, dist, target, fov]
const SHOTS = {
  front: { az: 90, el: 7, d: 20.5, t: [0, 3.55, 0], fov: 28, ap: 0 },
  headFront: { az: 73, el: 0, d: 6.6, t: [-3.10, 6.81, 0], fov: 30, ap: 0 },
  headSide: { az: 0, el: 0, d: 6.6, t: [-3.10, 6.81, 0], fov: 30, ap: 0 },
  forearm: { az: 18, el: 6, d: 14.8, t: [-3.35, 5.12, 0.75], fov: 30, ap: 0.006 },   // one foreleg, side-on, centred, claw tip complete // ref-forearm-macro: one raptorial leg side-on, knee top left, head behind right
  head: { az: 48, el: 7, d: 6.6, t: [-2.97, 6.53, 0], fov: 30, ap: 0.0025 },   // 3/4 face (≈43° off the face direction), camera a little below the head       // ref-head-macro: head left of centre, prothorax running off right-down
  abdomen: { az: -42, el: 30, d: 8.8, t: [2.85, 2.95, 0.3], fov: 30, ap: 0.001 },    // ref-abdomen-macro: from behind and above the flank, clear of the legs, tail bottom right
};
function frameShot(s) {
  camera.fov = s.fov; camera.updateProjectionMatrix();
  const t = new THREE.Vector3(...s.t);
  camera.position.copy(t).addScaledVector(dirOf(s.az, s.el), s.d); camera.lookAt(t);
  if (!q.has('nodof') && s.ap > 0) { bokeh.enabled = true; bokeh.uniforms.focus.value = s.d; bokeh.uniforms.aperture.value = num('ap', s.ap ?? 0.006); bokeh.uniforms.maxblur.value = num('mb', 0.012); }
}

// start, end, animation clock, camera poses [azimuth, elevation, distance, x, y, z]
const cuts = [
  [0, 2.9, 0, [40,8,2.2,-3.35,7.1,.55], [78,6,22,-.35,3.9,0]],
  [2.9, 5.2, .65, [17,1,8.9,-3.5,4.7,.9], [30,9,11,-3.6,5.1,.85]],
  [5.2, 6.8, .4, [-22,6,5,5.12,.75,4.04], [-35,12,7,4.85,1.1,3.8]],
  [6.8, 8.6, 1, [4,5,8,-.7,3.53,.5], [-14,16,8.7,.18,3.33,.5]],
  [8.6, 11, 1.5, [-27,12,9,3,2.85,.22], [-52,23,8.4,3.65,2.75,.18]],
  [11, 13, 2.45, [-65,40,12,3,3.9,0], [-91,56,13,2.8,3.65,0]],
  [13, 15.65, 1.63, [-14,7,6.4,5.68,2.3,.1], [-26,12,6.65,6.08,2.24,.1]],
  [15.65, 18.8, 1.4, [150,-5,19,-2.6,4.98,.2], [76,10,28,.1,3.8,0]],
  [18.8, 21.8, 5.38, [67,7,33,-.72,3.85,.1], [64,10,37,-1.4,3.8,.1]],
  [21.8, 23.6, 7.85, [60,4,9.2,-3.05,6.36,.2], [42,8,2.28,-3.35,7.10,.55]]
];
const script = await (await fetch('../film/landscape.json')).json();
const ABD_ACT=script.acts.find(a=>a.act==='abdomen'), AB=script.abdomen, EX=script.explode, PRE=script.acts[0].t;
const clamp01=x=>THREE.MathUtils.clamp(x,0,1), smoother=x=>THREE.MathUtils.smootherstep(x,0,1);
const ss=(a,b,x)=>THREE.MathUtils.smootherstep(x,a,b), lerp=THREE.MathUtils.lerp;
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

function render(t) {
  const splice=470/30, elapsed=t-splice;
  if(elapsed>=0 && elapsed<11){
    const macro=elapsed<3.6;
    const u=macro?elapsed/3.6:(elapsed-3.6)/7.4;
    const clock=macro?lerp(6,8.6,u):lerp(8.6,13.05,u);
    const lifeClock=1+elapsed*.53;
    mantis.update(lifeClock);
    const ex=explodeState(clock,lifeClock);
    mantis.pose({clock:lifeClock,abd:macro?abdomenState(clock,lifeClock):ex.abd});
    for(const name of ['forelegR','forelegL']) mantis.parts[name].quaternion.identity();
    mantis.articulate(lifeClock,true);
    applyExplode(ex,lifeClock);
    const k=smoother(u);
    frameShot(macro?{az:-16-58*k,el:12+19*k,d:12.9+3.2*Math.sin(Math.PI*u),t:[3.65,2.95,.05],fov:39,ap:0}:
      {az:-64-154*k,el:12+15*Math.sin(Math.PI*u)-9*k,d:31+11*Math.sin(Math.PI*u),t:[.85,3.88,0],fov:41,ap:0});
    contactShadow();renderBloom();finalComposer.render();return;
  }
  if(elapsed>=11)t-=11;

  const [start,end,clock,a,b] = cuts.find(c=>t<c[1]) || cuts.at(-1);
  const local=t-start;
  const u=THREE.MathUtils.smootherstep(local,start===0?.28:0,end-start-(start===0?.32:0));
  const [az,el,d,x,y,z]=a.map((v,i)=>THREE.MathUtils.lerp(v,b[i],u));
  frameShot({az,el,d,t:[x,y,z],fov:38,ap:0});
  const actionTime=clock+local;
  mantis.update(actionTime);
  const wingLift=start===11 ? Math.sin(Math.PI*local/(end-start))**2*.74 : 0;
  if(wingLift) mantis.parts.wingW.forEach(({w,s})=>{w.rotation.z+=wingLift*.6;w.rotation.x+=s*wingLift*.22;});
  mantis.articulate(actionTime);
  if (MASK) { renderer.render(scene, camera); return; }
  contactShadow();
  if (q.has('nobloom')) { mix.enabled = false; } else renderBloom();
  finalComposer.render();
}

window.render = render; window.__scene = scene; window.__camera = camera; window.__root = mantis.root; window.__mantis = mantis;
window.__stats = mantis.stats;
const t0 = num('t', 0);
mantis.update(t0);
const shot = q.get('shot');
if (shot && SHOTS[shot]) {
  const s = { ...SHOTS[shot] };
  for (const k of ['az', 'el', 'd', 'fov']) if (q.has('s' + k)) s[k] = num('s' + k, s[k]);
  if (q.has('st')) s.t = q.get('st').split(',').map(Number);
  frameShot(s);
} else frameHero();
render(t0);
window.__frame = { cam: camera.position.toArray() };
window.__ready = true;

if (q.has('orbit')) {
  const controls = new OrbitControls(camera, renderer.domElement);
  controls.target.set(0.6, 3.3, 0); controls.update();
  const start = performance.now();
  renderer.setAnimationLoop(() => { controls.update(); render(t0 + (performance.now() - start) / 1000); });
}
window.__csdbg = () => { const out = []; for (const L of csLayers) { const buf = new Uint16Array(CS.res * CS.res * 4); renderer.readRenderTargetPixels(L.rt[0], 0, 0, CS.res, CS.res, buf); let mx = 0, n = 0; for (let i = 0; i < buf.length; i += 4) { const v = THREE.DataUtils.fromHalfFloat(buf[i]); if (v > mx) mx = v; if (v > 0.01) n++; } out.push({ mx, n }); } return JSON.stringify(out); };
