import { behavior } from './behavior.js';
// Mecha mantis v3 — 100% procedural. No models, no image textures (wing veins are drawn on a canvas in code).
// World: head toward -X, tail toward +X, up +Y, lateral ±Z. Body length L ≈ 10 units (head to abdomen tip).
// Segment-local frames: +Y along the segment, +X = ventral side, +Z = lateral.
// Measured targets (checklist / job-description round-3 corrections): thorax thickness 0.22 L, abdomen max thickness
// 0.23 L (bulging ellipsoid, length/thickness ≈ 1.9), prothorax ≈ 0.09 L, head height ≈ 0.15 L, femur width ≈ 0.12 L,
// wing 0.59 L × 0.11 L lifted ≈ 10°, hind femur shell ≈ 0.034 L, tibia rod ≈ 0.012 L.
import * as THREE from 'three';
import { mergeGeometries, mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';

const TAU = Math.PI * 2;
const V3 = (x, y, z) => new THREE.Vector3(x, y, z);
const X_AXIS = V3(1, 0, 0), Y_AXIS = V3(0, 1, 0), Z_AXIS = V3(0, 0, 1);
export const BLOOM_LAYER = 2;

export function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ---------------------------------------------------------------- materials
function makeMaterials() {
  const phys = (o) => new THREE.MeshPhysicalMaterial(o);
  const std = (o) => new THREE.MeshStandardMaterial(o);
  return {
    shell: phys({ color: 0xf1f0f3, roughness: 0.34, metalness: 0, clearcoat: 1, clearcoatRoughness: 0.05, side: THREE.DoubleSide }),
    shellFront: phys({ color: 0xf1f0f3, roughness: 0.34, metalness: 0, clearcoat: 1, clearcoatRoughness: 0.05, side: THREE.FrontSide }),
    femurWall: std({ color: 0x5a5c64, metalness: 0.8, roughness: 0.38, side: THREE.DoubleSide }),
    liner: std({ color: 0x202026, metalness: 0.6, roughness: 0.42, side: THREE.BackSide }),
    shellIn: phys({ color: 0xcfcdd2, roughness: 0.6, metalness: 0, clearcoat: 0.2, clearcoatRoughness: 0.4, side: THREE.DoubleSide }),
    dark: std({ color: 0x232328, metalness: 0.8, roughness: 0.4 }),
    gun: std({ color: 0x34353b, metalness: 0.9, roughness: 0.32 }),
    graphite: std({ color: 0x2c2e34, metalness: 0.72, roughness: 0.36 }),
    steel: std({ color: 0x9a9ca3, metalness: 1.0, roughness: 0.22 }),
    chrome: std({ color: 0xdcdde2, metalness: 1.0, roughness: 0.1 }),
    legMetal: std({ color: 0x303138, metalness: 1.0, roughness: 0.2 }),
    rubber: std({ color: 0x1b1c1f, metalness: 0.0, roughness: 0.7 }),
    spine: std({ color: 0x3a3b42, metalness: 0.95, roughness: 0.22 }),
    core: std({ color: 0x24252b, metalness: 0.65, roughness: 0.42 }),
    magenta: phys({ color: 0xd0188a, emissive: 0x7a0048, emissiveIntensity: 0.6, metalness: 0.35, roughness: 0.22, clearcoat: 1, clearcoatRoughness: 0.05 }),
    claw: phys({ color: 0xe0168f, emissive: 0xa0005c, emissiveIntensity: 0.6, metalness: 0.55, roughness: 0.12, clearcoat: 1, clearcoatRoughness: 0.03 }),
    coil: std({ color: 0x000000, emissive: 0xff1fd0, emissiveIntensity: 0.68, roughness: 0.4 }),
    glass: phys({ color: 0xf4f7fa, roughness: 0.03, metalness: 0, transmission: 1, thickness: 0.05, ior: 1.35, specularIntensity: 0.8, envMapIntensity: 1.4, clearcoat: 0.5, clearcoatRoughness: 0.02, side: THREE.FrontSide }),
    lens: phys({ color: 0x030304, roughness: 0.04, metalness: 0, clearcoat: 1, clearcoatRoughness: 0.01, envMapIntensity: 1.15 }),
  };
}

// ---------------------------------------------------------------- geometry helpers
function surf(fn, nu, nv) {
  const pos = [], uv = [], idx = [], p = new THREE.Vector3();
  for (let i = 0; i <= nu; i++) for (let j = 0; j <= nv; j++) {
    fn(i / nu, j / nv, p); pos.push(p.x, p.y, p.z); uv.push(i / nu, j / nv);
  }
  for (let i = 0; i < nu; i++) for (let j = 0; j < nv; j++) {
    const a = i * (nv + 1) + j, b = a + nv + 1;
    idx.push(a, b, a + 1, b, b + 1, a + 1);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx); g.computeVertexNormals();
  return g;
}
function profPts(pts) {
  return (u) => {
    u = Math.min(1, Math.max(0, u));
    for (let i = 0; i < pts.length - 1; i++) {
      const [u0, r0] = pts[i], [u1, r1] = pts[i + 1];
      if (u <= u1) { const t = (u - u0) / (u1 - u0); const s = t * t * (3 - 2 * t); return r0 + (r1 - r0) * s; }
    }
    return pts[pts.length - 1][1];
  };
}
const profEll = (e = 0.5, m = 0.04) => (u) => Math.pow(Math.max(0, Math.sin(Math.PI * (m + (1 - 2 * m) * u))), e);

function segFrame(A, B, xHint) {
  const g = new THREE.Group();
  const y = B.clone().sub(A); const len = y.length(); y.normalize();
  const x = xHint.clone().sub(y.clone().multiplyScalar(xHint.dot(y))).normalize();
  const z = new THREE.Vector3().crossVectors(x, y).normalize();
  g.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(x, y, z));
  g.position.copy(A); g.userData.len = len;
  return g;
}
// point on a segment surface: f scales the radius, off is an absolute inward offset (shell thickness)
const segPt = (P, u, ph, f = 1, off = 0) => {
  const s = P.prof(u);
  return V3(Math.max(0, P.rx * s * f - off) * Math.cos(ph), u * P.len, Math.max(0, P.rz * s * f - off) * Math.sin(ph));
};
const segNrm = (P, ph) => V3(Math.cos(ph) / P.rx, 0, Math.sin(ph) / P.rz).normalize();

function tubeGeo(points, r, closed = false, radial = 6) {
  const c = new THREE.CatmullRomCurve3(points, closed, 'centripetal');
  return new THREE.TubeGeometry(c, Math.max(8, points.length * 3), r, radial, closed);
}
function sweepGeo(curve, u0, u1, rad, p0 = 0, p1 = TAU, nu = 40, nv = 16, lat = Z_AXIS) {
  const T = new THREE.Vector3(), B = new THREE.Vector3(), N = new THREE.Vector3();
  return surf((a, b, p) => {
    const u = u0 + (u1 - u0) * a, ph = p0 + (p1 - p0) * b;
    const P = curve.getPointAt(u); curve.getTangentAt(u, T);
    B.copy(lat).addScaledVector(T, -lat.dot(T)).normalize();
    N.crossVectors(B, T).normalize();
    const [ra, rb] = rad(u);
    p.copy(P).addScaledVector(N, ra * Math.cos(ph)).addScaledVector(B, rb * Math.sin(ph));
  }, nu, nv);
}
function sweepFrame(curve, u, lat = Z_AXIS) {
  const P = curve.getPointAt(u), T = curve.getTangentAt(u);
  const B = lat.clone().addScaledVector(T, -lat.dot(T)).normalize();
  const N = new THREE.Vector3().crossVectors(B, T).normalize();
  return { P, T, B, N };
}
const gearCache = new Map();
function gearGeo(r, teeth, th) {
  const key = `${r.toFixed(3)}|${teeth}|${th.toFixed(3)}`;
  if (gearCache.has(key)) return gearCache.get(key);
  const sh = new THREE.Shape(); const ro = r, ri = r * 0.84;
  for (let i = 0; i < teeth; i++) {
    const a = (i / teeth) * TAU, d = TAU / teeth;
    [[ri, a], [ro, a + d * 0.15], [ro, a + d * 0.45], [ri, a + d * 0.6]].forEach(([rr, aa], k) => {
      const x = rr * Math.cos(aa), y = rr * Math.sin(aa); (i === 0 && k === 0) ? sh.moveTo(x, y) : sh.lineTo(x, y);
    });
  }
  sh.closePath();
  sh.holes.push(new THREE.Path().absarc(0, 0, r * 0.26, 0, TAU, true));
  if (r > 0.12) for (let k = 0; k < 5; k++) {
    const a = (k / 5) * TAU;
    sh.holes.push(new THREE.Path().absarc(Math.cos(a) * r * 0.56, Math.sin(a) * r * 0.56, r * 0.15, 0, TAU, true));
  }
  const bev = Math.min(th * 0.2, r * 0.04);
  const g = new THREE.ExtrudeGeometry(sh, { depth: th - 2 * bev, bevelEnabled: true, bevelThickness: bev, bevelSize: bev * 0.8, bevelSegments: 1, curveSegments: 6 });
  g.translate(0, 0, -(th - 2 * bev) / 2);
  gearCache.set(key, g);
  return g;
}

// ---------------------------------------------------------------- builder
export function buildMantis() {
  const M = makeMaterials();
  const root = new THREE.Group(); root.name = 'mantis';
  // R8 proportion pass: lower the stance relative to longitudinal body length.
  root.scale.set(1.08, 0.94, 1);
  const anim = [];
  const shoulderLinks=[];
  let life = behavior(0);
  const arm = side => life.arms[side > 0 ? 0 : 1];
  const stats = { small: 0, smallInstanced: 0, instancedMeshes: 0, big: 0, spines: {} };
  const parts = {};
  const glowMeshes = [];
  // ---- teardown trains: real parts registered so the film can separate them along their own assembly axes
  // (optics, band stack, tail stack, side shells, gears, femur shells, joint caps, fastener dust)
  const trains = {};
  const _tq = new THREE.Quaternion();
  function regTrain(name, g, dir, amp, swing = 0) {
    (trains[name] = trains[name] || []).push({
      g, base: g.position.clone(), dir: dir.clone().normalize(), amp, swing,
      baseQ: (g.quaternion ? g.quaternion.clone() : _tq.clone()),
    });
  }

  const G = {
    screw: new THREE.CylinderGeometry(0.028, 0.028, 0.022, 6),
    pBody: new THREE.CylinderGeometry(0.035, 0.035, 0.2, 10).rotateZ(Math.PI / 2).translate(0, 0.035, 0),
    pRod: new THREE.CylinderGeometry(0.014, 0.014, 0.18, 8).rotateZ(Math.PI / 2).translate(0.17, 0.035, 0),
    box: new THREE.BoxGeometry(0.1, 0.05, 0.06).translate(0, 0.025, 0),
    hose: new THREE.TorusGeometry(0.13, 0.017, 6, 14, Math.PI * 0.85).translate(0, -0.06, 0),
    wire: new THREE.TorusGeometry(0.16, 0.009, 5, 14, Math.PI * 0.8).translate(0, -0.1, 0),
    sgear: gearGeo(0.07, 12, 0.025).clone().rotateX(-Math.PI / 2).translate(0, 0.015, 0),
    sphere: new THREE.SphereGeometry(1, 24, 16),
    cyl: new THREE.CylinderGeometry(1, 1, 1, 20),
    cone: new THREE.ConeGeometry(1, 1, 10),
    needle: new THREE.ConeGeometry(1, 1, 8, 1),
    torus: new THREE.TorusGeometry(1, 0.08, 8, 40),
    link: new THREE.BoxGeometry(0.1, 0.09, 0.07),
  };
  const mesh = (geo, mat, parent) => { const m = new THREE.Mesh(geo, mat); if (parent) parent.add(m); return m; };
  // one teardown fastener: a slightly proud bolt at a real fastener location, riding its component and
  // drifting out along its own screw axis during the teardown
  let dustN = 0;
  function dust(parent, pos, nrm, i) {
    const d = mesh(G.screw, M.steel, parent);
    d.position.copy(pos); d.quaternion.setFromUnitVectors(Y_AXIS, nrm.clone().normalize());
    d.scale.setScalar(1.15 + (i % 3) * 0.12);
    regTrain('dust', d, nrm, 0.8 + (i % 5) * 0.13, 1);
    dustN++;
  }

  // ---- instancer: every small part of one parent goes into a handful of InstancedMeshes
  const instancers = [];
  function instancer(parent) {
    const buckets = new Map(); const spins = [];
    const api = {
      add(geo, mat, m, spin = 0) {
        const key = geo.uuid + mat.uuid;
        if (!buckets.has(key)) buckets.set(key, { geo, mat, list: [] });
        const b = buckets.get(key); b.list.push(m.clone());
        if (spin) spins.push({ b, i: b.list.length - 1, base: m.clone(), spin });
      },
      finalize() {
        for (const b of buckets.values()) {
          const im = new THREE.InstancedMesh(b.geo, b.mat, b.list.length);
          b.list.forEach((m, i) => im.setMatrixAt(i, m));
          im.instanceMatrix.needsUpdate = true; im.computeBoundingSphere(); im.computeBoundingBox();
          b.im = im; parent.add(im); stats.instancedMeshes++; stats.smallInstanced += b.list.length;
        }
        const tmp = new THREE.Matrix4(), rot = new THREE.Matrix4();
        if (spins.length) anim.push((t) => {
          const touched = new Set();
          for (const s of spins) { rot.makeRotationY(t * s.spin); tmp.multiplyMatrices(s.base, rot); s.b.im.setMatrixAt(s.i, tmp); touched.add(s.b.im); }
          for (const im of touched) im.instanceMatrix.needsUpdate = true;
        });
      },
    };
    instancers.push(api);
    return api;
  }
  // one small part = a few instances placed relative to the base matrix (local +Y = surface normal)
  function smallPart(inst, rng, base) {
    const k = rng();
    const L = (x, y, z, ry = 0, s = 1) => base.clone().multiply(new THREE.Matrix4().compose(V3(x, y, z), new THREE.Quaternion().setFromAxisAngle(Y_AXIS, ry), V3(s, s, s)));
    if (k < 0.24) inst.add(G.screw, M.steel, L(0, 0.011, 0));
    else if (k < 0.46) { inst.add(G.pBody, M.dark, L(0, 0, 0)); inst.add(G.pRod, M.chrome, L(0, 0, 0)); inst.add(G.screw, M.steel, L(-0.1, 0.035, 0, 0, 0.7)); }
    else if (k < 0.64) inst.add(G.hose, rng() < 0.7 ? M.rubber : M.graphite, L(0, 0, 0, 0, 0.8 + rng() * 0.6));
    else if (k < 0.78) { const s = 0.8 + rng() * 0.5; for (let w = 0; w < 3; w++) inst.add(G.wire, w === 1 ? M.graphite : M.rubber, L(0, 0, (w - 1) * 0.022, 0, s)); }
    else if (k < 0.91) inst.add(G.sgear, rng() < 0.5 ? M.gun : M.steel, L(0, 0, 0, 0, 0.8 + rng() * 0.7), (rng() - 0.5) * 6);
    else { inst.add(G.box, M.gun, L(0, 0, 0)); inst.add(G.screw, M.steel, L(-0.035, 0.055, 0, 0, 0.6)); inst.add(G.screw, M.steel, L(0.035, 0.055, 0, 0, 0.6)); }
    stats.small++;
  }
  function scatter(parent, P, n, rng, wins, f0 = 0.72, f1 = 0.95) {
    const inst = instancer(parent);
    for (let i = 0; i < n; i++) {
      const w = wins[Math.floor(rng() * wins.length)];
      const u = w[0] + (w[1] - w[0]) * rng(), ph = w[2] + (w[3] - w[2]) * rng();
      const p = segPt(P, u, ph, f0 + (f1 - f0) * rng());
      const q = new THREE.Quaternion().setFromUnitVectors(Y_AXIS, segNrm(P, ph)).multiply(new THREE.Quaternion().setFromAxisAngle(Y_AXIS, rng() * TAU));
      smallPart(inst, rng, new THREE.Matrix4().compose(p, q, V3(1, 1, 1).multiplyScalar(0.85 + rng() * 0.5)));
    }
    return inst;
  }

  // ---- thick shell plate with rounded (bevelled) edges, optional magenta edge line just inside the rim
  function plate(parent, P, o) {
    const { u0, u1, p0, p1, mat = M.shell, inset = 1, edges = {}, nu = 28, nv = 14, th = 0.05, inner = M.shellIn } = o;
    const full = Math.abs(p1 - p0) >= TAU - 1e-3;
    const outer = mesh(surf((a, b, p) => p.copy(segPt(P, u0 + (u1 - u0) * a, p0 + (p1 - p0) * b, inset)), nu, nv), mat, parent);
    if (mat === M.glass || mat === M.core || mat === M.graphite || mat === M.shellIn || mat === M.liner || o.noThick) return outer;
    mesh(surf((a, b, p) => p.copy(segPt(P, u0 + (u1 - u0) * a, p0 + (p1 - p0) * b, inset, th)), nu, nv), inner, parent);
    const rimR = th * 0.55;
    const ring = (u, n) => { const pts = []; for (let i = 0; i < (full ? n : n + 1); i++) pts.push(segPt(P, u, p0 + (p1 - p0) * i / n, inset, th / 2)); return pts; };
    const line = (ph) => { const pts = []; for (let i = 0; i <= 24; i++) pts.push(segPt(P, u0 + (u1 - u0) * i / 24, ph, inset, th / 2)); return pts; };
    const n = Math.max(8, Math.round(Math.abs(p1 - p0) * 9));
    for (const [k, u] of [['u0', u0], ['u1', u1]]) {
      if (P.prof(u) * inset < 0.06) continue;
      mesh(tubeGeo(ring(u, n), rimR, full), mat, parent);
      if (edges[k] === 'm') {
        const du = (k === 'u0' ? 1 : -1) * 0.012; const pts = [];
        for (let i = 0; i < (full ? n : n + 1); i++) pts.push(segPt(P, u + du, p0 + (p1 - p0) * i / n, inset * 1.006));
        mesh(tubeGeo(pts, 0.012, full), M.magenta, parent);
      }
    }
    if (!full) for (const [k, ph] of [['p0', p0], ['p1', p1]]) {
      mesh(tubeGeo(line(ph), rimR), mat, parent);
      if (edges[k] === 'm') {
        const r = Math.max(P.rx, P.rz) * inset; const dph = (k === 'p0' ? 1 : -1) * Math.min(0.12, 0.05 / Math.max(0.1, r));
        const pts = []; for (let i = 0; i <= 24; i++) pts.push(segPt(P, u0 + (u1 - u0) * i / 24, ph + dph, inset * 1.006));
        mesh(tubeGeo(pts, 0.012), M.magenta, parent);
      }
    }
    return outer;
  }
  // tile a (u, phi) window with plates of 3 sizes and gaps between them
  function tiles(parent, P, rng, { u0, u1, p0, p1, inset = 1.0, keep = 0.6, th = 0.04, uSizes = [0.08, 0.14, 0.22], pSizes = [0.35, 0.5, 0.7] }) {
    let u = u0;
    while (u < u1 - 0.03) {
      const du = Math.min(uSizes[Math.floor(rng() * 3)], u1 - u);
      let ph = p0;
      while (ph < p1 - 0.1) {
        const dp = Math.min(pSizes[Math.floor(rng() * 3)], p1 - ph);
        if (rng() < keep) plate(parent, P, { u0: u + 0.012, u1: u + du - 0.012, p0: ph + 0.04, p1: ph + dp - 0.04, inset, th, nu: 8, nv: 6 });
        ph += dp;
      }
      u += du;
    }
  }

  let gearKey = 'body';   // which gear clock drives the gears built from here on ('body' or 'abd')
  function gear(parent, pos, normal, r, teeth, th, mat, speed, phase = 0) {
    const key = gearKey;
    const g = new THREE.Group(); g.position.copy(pos);
    g.quaternion.setFromUnitVectors(Z_AXIS, normal.clone().normalize());
    const m = mesh(gearGeo(r, teeth, th), mat, g);
    const hb = mesh(G.cyl, M.steel, g); hb.scale.set(r * 0.3, th * 1.6, r * 0.3); hb.rotation.x = Math.PI / 2;
    parent.add(g); stats.big++;
    anim.push((t, gc) => { m.rotation.z = phase + (gc ? gc[key] : t) * speed; });
    return g;
  }
  function actuator(parent, A, B, r, t0 = 0, speed = 0) {
    const g = new THREE.Group(); parent.add(g);
    const d = B.clone().sub(A), len = d.length();
    g.position.copy(A); g.quaternion.setFromUnitVectors(Y_AXIS, d.normalize());
    const body = mesh(G.cyl, M.graphite, g); body.scale.set(r, len * 0.55, r); body.position.y = len * 0.275;
    const band = mesh(G.cyl, M.steel, g); band.scale.set(r * 1.15, len * 0.06, r * 1.15); band.position.y = len * 0.52;
    const rod = mesh(G.cyl, M.chrome, g); rod.scale.set(r * 0.42, len * 0.5, r * 0.42);
    const cap = mesh(G.sphere, M.gun, g); cap.scale.setScalar(r * 0.9);
    anim.push((t) => { const e = speed ? 0.04 * Math.sin(t * speed + t0) * len : 0; rod.position.y = len * 0.72 + e; cap.position.y = len * 0.97 + e; });
    stats.big++;
    return g;
  }
  const G_shaft = new THREE.CylinderGeometry(0.3, 1, 1, 8, 1).translate(0, 0.5, 0);
  const G_tip = new THREE.ConeGeometry(0.3, 1, 8, 1).translate(0, 0.5, 0);
  // unit-length curved needle: base radius 0.09 (base width 0.18 × length), bends 0.1 toward local +X near the tip
  const G_curved = surf((a, b, p) => { const u = a, ph = b * TAU, r = 0.09 * Math.pow(1 - u, 0.9) + 0.004; p.set(0.1 * u * u + r * Math.cos(ph), u, r * Math.sin(ph)); }, 10, 8);
  function needle(parent, base, dir, bendTo, len) {
    const y = dir.clone().normalize(); const x = bendTo.clone().addScaledVector(y, -bendTo.dot(y)).normalize(); const z = new THREE.Vector3().crossVectors(x, y);
    const m = mesh(G_curved, M.spine, parent); m.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(x, y, z)); m.position.copy(base); m.scale.setScalar(len);
    return m;
  }
  function spine(parent, base, dir, len, r, mat = M.spine) {
    const d = dir.clone().normalize(), q = new THREE.Quaternion().setFromUnitVectors(Y_AXIS, d);
    if (mat !== M.spine) { const m = mesh(G.needle, mat, parent); m.scale.set(r, len, r); m.quaternion.copy(q); m.position.copy(base).addScaledVector(d, len / 2); return m; }
    const a = mesh(G_shaft, M.spine, parent); a.scale.set(r, len * 0.8, r); a.quaternion.copy(q); a.position.copy(base);
    const b = mesh(G_tip, M.magenta, parent); b.scale.set(r, len * 0.2, r); b.quaternion.copy(q); b.position.copy(base).addScaledVector(d, len * 0.8);
    return a;
  }
  // white joint cap: a bevelled white drum, steel centre screw, thin magenta ring on the face
  function cap(parent, pos, axis, r, th) {
    const g = new THREE.Group(); g.position.copy(pos); g.quaternion.setFromUnitVectors(Y_AXIS, axis.clone().normalize()); parent.add(g);
    const c = mesh(G.cyl, M.shellFront, g); c.scale.set(r, th, r);
    for (const y of [th / 2, -th / 2]) { const t = mesh(G.torus, M.shellFront, g); t.rotation.x = Math.PI / 2; t.position.y = y; t.scale.set(r * 0.96, r * 0.96, r * 0.7); }
    for (const y of [th / 2 + 0.006, -th / 2 - 0.006]) { const s = mesh(G.screw, M.steel, g); s.position.y = y; s.scale.set(r * 0.125 / 0.028, 0.6, r * 0.125 / 0.028); }
    return g;
  }
  function hub(parent, pos, axis, r, th = 0.12, mat = M.gun, screwMat = M.steel) {
    const g = new THREE.Group(); g.position.copy(pos); g.quaternion.setFromUnitVectors(Y_AXIS, axis.clone().normalize());
    const c = mesh(G.cyl, mat, g); c.scale.set(r, th, r);
    const s = mesh(G.cyl, screwMat, g); s.scale.set(r * 0.45, th * 1.25, r * 0.45);
    parent.add(g); return g;
  }
  const flank = (s, a, b) => (s > 0 ? [a, b] : [-b, -a]);

  // chain track: alternating steel / gunmetal links with pins along a curve (instanced); nrm(u, p) gives the outward side
  // crawl > 0 (v9 arm life): the belt flows along its curve — periodic layout makes the wrap invisible
  const G_tlink = new THREE.BoxGeometry(0.1, 0.05, 0.13), G_tpin = new THREE.CylinderGeometry(0.018, 0.018, 0.17, 6).rotateX(Math.PI / 2);
  function track(parent, pts, n, nrm, closed = false, sc = 1, crawl = 0) {
    const tg = new THREE.Group(); parent.add(tg);   // v6: one track = one movable unit so a teardown train can slide it
    const c = new THREE.CatmullRomCurve3(pts, closed);
    const placeAt = (u, p, tan) => {
      const o = nrm(u, p).clone(); const y = o.addScaledVector(tan, -o.dot(tan)).normalize(); const z = new THREE.Vector3().crossVectors(tan, y);
      return new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(tan, y, z));
    };
    if (!crawl) {
      const inst = instancer(tg);
      for (let i = 0; i < n; i++) {
        const u = closed ? i / n : i / (n - 1); const p = c.getPointAt(u), t = c.getTangentAt(u);
        const q = placeAt(u, p, t);
        inst.add(G_tlink, i % 2 ? M.steel : M.gun, new THREE.Matrix4().compose(p, q, V3(sc, sc, sc)));
        inst.add(G_tpin, M.chrome, new THREE.Matrix4().compose(p.clone().addScaledVector(t, 0.05 * sc), q, V3(sc, sc, sc)));
        stats.trackLinks = (stats.trackLinks || 0) + 1;
      }
      return tg;
    }
    const imA = new THREE.InstancedMesh(G_tlink, M.steel, Math.ceil(n / 2)), imB = new THREE.InstancedMesh(G_tlink, M.gun, Math.floor(n / 2)), imP = new THREE.InstancedMesh(G_tpin, M.chrome, n);
    for (const im of [imA, imB, imP]) { im.instanceMatrix.setUsage(THREE.DynamicDrawUsage); tg.add(im); }
    const recs = []; let ia = 0, ib = 0;
    for (let i = 0; i < n; i++) {
      recs.push({ im: i % 2 ? imA : imB, idx: i % 2 ? ia++ : ib++, u0: i / n, pin: false });
      recs.push({ im: imP, idx: i, u0: i / n, pin: true });
      stats.trackLinks = (stats.trackLinks || 0) + 1;
    }
    const tmp = new THREE.Matrix4(), Pv = new THREE.Vector3(), Tv = new THREE.Vector3();
    anim.push((t) => {
      for (const r of recs) {
        const u = ((r.u0 + (typeof crawl === "function" ? crawl() : t*crawl)) % 1 + 1) % 1;
        Pv.copy(c.getPointAt(u)); Tv.copy(c.getTangentAt(u));
        const q = placeAt(u, Pv, Tv);
        if (r.pin) Pv.addScaledVector(Tv, 0.05 * sc);
        r.im.setMatrixAt(r.idx, tmp.compose(Pv, q, V3(sc, sc, sc)));
      }
      imA.instanceMatrix.needsUpdate = true; imB.instanceMatrix.needsUpdate = true; imP.instanceMatrix.needsUpdate = true;
    });
    return tg;
  }
  // fill a seam: a hose, a three-wire loom and small gears running along it (pts are segment-local surface points)
  function seamFill(parent, P, seam, rng) {
    const [u0, u1, ph0, ph1] = seam; const pts = (f) => { const a = []; for (let i = 0; i <= 12; i++) { const k = i / 12; a.push(segPt(P, u0 + (u1 - u0) * k, ph0 + (ph1 - ph0) * k, f)); } return a; };
    mesh(tubeGeo(pts(0.975), 0.03, false, 6), M.rubber, parent);
    for (let w = 0; w < 3; w++) mesh(tubeGeo(pts(0.955 - w * 0.012), 0.011, false, 5), w === 1 ? M.graphite : M.rubber, parent);
    for (let i = 0; i < 3; i++) { const k = (i + 0.5) / 3, ph = ph0 + (ph1 - ph0) * k; gear(parent, segPt(P, u0 + (u1 - u0) * k, ph, 0.96), segNrm(P, ph), 0.06 + rng() * 0.04, 10, 0.03, i % 2 ? M.steel : M.gun, (rng() - 0.5) * 6, i); }
  }

  // ================================================================ THORAX (meso + meta) — thickness 2.2 = 0.22 L
  {
    const grp = new THREE.Group(); grp.name = 'thorax'; root.add(grp); parts.thorax = grp;
    const f = segFrame(V3(-0.95, 3.72, 0), V3(1.3, 3.2, 0), V3(0, -1, 0)); grp.add(f);
    const P = { len: f.userData.len, rx: 1.1, rz: 0.9, prof: profEll(0.5, 0.1) };
    const rng = mulberry32(11);
    plate(f, P, { u0: 0, u1: 1, p0: 0, p1: TAU, mat: M.core, inset: 0.55 });
    [[0.02, 0.31], [0.35, 0.64], [0.68, 0.97]].forEach(([a, b], i) => {
      const g = new THREE.Group(); f.add(g);   // v6: dorsal armour plate = one train item, lifts along its own normal
      plate(g, P, { u0: a, u1: b, p0: Math.PI - 0.9, p1: Math.PI + 0.9, th: 0.07, inset: 1.02, edges: i === 0 ? { p0: 'm', p1: 'm' } : {} });
      regTrain('thoraxPlate', g, segNrm(P, Math.PI), [0.4, 0.55, 0.7][i]);
    });
    [[0.06, 0.44], [0.52, 0.92]].forEach(([a, b]) => {
      const g = new THREE.Group(); f.add(g);   // v6: ventral plate = one train item, drops along its own normal
      plate(g, P, { u0: a, u1: b, p0: -0.5, p1: 0.5, th: 0.06 });
      regTrain('thoraxVentral', g, segNrm(P, 0), 0.4);
    });
    for (const s of [1, -1]) {
      // 5 curved shells per side, each ≈ 0.28 of the segment × 0.75 rad, overlapping (insets 1.0 / 1.03 / 1.06), magenta edges
      const sh = [[0.02, 0.3, 0.6, 1.28, 1.0, { p1: 'm' }], [0.33, 0.62, 0.6, 1.28, 1.02, {}], [0.65, 0.97, 0.6, 1.28, 1.0, { u0: 'm' }],
        [0.04, 0.47, 1.32, 2.02, 1.02, {}], [0.5, 0.95, 1.32, 2.02, 1.0, { p0: 'm' }]];
      for (const [u0, u1, q0, q1, ins, e] of sh) {
        const [a, b] = flank(s, q0, q1); const edges = s > 0 ? e : Object.fromEntries(Object.entries(e).map(([k, v]) => [k === 'p0' ? 'p1' : k === 'p1' ? 'p0' : k, v]));
        const sg = new THREE.Group(); f.add(sg);   // one side shell = one teardown train item, lifting along its own normal
        plate(sg, P, { u0, u1, p0: a, p1: b, inset: ins, th: 0.06, nu: 20, nv: 12, edges });
        regTrain('thoraxShells', sg, segNrm(P, (a + b) / 2), 0.5);
      }
      // deep layer: big gears and drums; mid layer: actuators and rings
      const gs = [[0.16, 1.25, 0.3, 18], [0.4, 1.6, 0.34, 20], [0.64, 1.2, 0.26, 16], [0.86, 1.6, 0.22, 14], [0.3, 0.85, 0.18, 12], [0.56, 0.8, 0.2, 12], [0.28, 1.55, 0.14, 10], [0.5, 1.05, 0.12, 10], [0.76, 1.45, 0.15, 12], [0.9, 1.0, 0.13, 10]];
      gs.forEach(([u, ph, r, n], i) => {
        const pp = s * ph;
        const gg = gear(f, segPt(P, u, pp, 0.9), segNrm(P, pp), r, n, 0.06, i % 3 === 0 ? M.steel : i % 3 === 1 ? M.gun : M.graphite, (i % 2 ? 1 : -1) * (0.8 + i * 0.3), i);
        if (i < 4) regTrain('gears', gg, segNrm(P, pp), 0.55 + 0.11 * i);   // the four big ones slide out along their own shafts
      });
      [[0.3, 1.9, 0.15], [0.74, 0.95, 0.13]].forEach(([u, ph, r]) => { const pp = s * ph; const m = mesh(G.torus, M.steel, f); m.position.copy(segPt(P, u, pp, 0.88)); m.quaternion.setFromUnitVectors(Z_AXIS, segNrm(P, pp)); m.scale.setScalar(r); stats.big++; });
      {
        const A1 = segPt(P, 0.08, s * 1.0, 0.86), B1 = segPt(P, 0.6, s * 0.95, 0.86);
        regTrain('thoraxAct', actuator(f, A1, B1, 0.07, s, 2.0), B1.clone().sub(A1), 0.45);   // v6: along its own axis
        const A2 = segPt(P, 0.45, s * 1.75, 0.86), B2 = segPt(P, 0.95, s * 1.55, 0.86);
        regTrain('thoraxAct', actuator(f, A2, B2, 0.06, 2 * s, 1.6), B2.clone().sub(A2), 0.45);
      }
      const dp = s * 1.4, dr = new THREE.Group(); dr.position.copy(segPt(P, 0.55, dp, 0.92)); dr.quaternion.setFromUnitVectors(Y_AXIS, segNrm(P, dp)); f.add(dr);
      mesh(G.cyl, M.steel, dr).scale.set(0.15, 0.07, 0.15); mesh(G.cyl, M.dark, dr).scale.set(0.09, 0.11, 0.09); stats.big++;
      regTrain('thoraxDrum', dr, segNrm(P, dp), 0.5);   // v6: along its own normal
    }
    for (const s of [1, -1]) {
      regTrain('thoraxTrackA', track(f, [0.03, 0.5, 0.97].map((u) => segPt(P, u, s * 1.3, 0.99)), 22, (u, p) => segNrm(P, s * 1.3)), Y_AXIS, 0.4);   // v6: along the track tangent
      seamFill(f, P, [0.315, 0.315, s * 0.62, s * 1.28], mulberry32(31 + s)); seamFill(f, P, [0.635, 0.635, s * 0.62, s * 1.28], mulberry32(33 + s));
      seamFill(f, P, [0.485, 0.485, s * 1.33, s * 2.0], mulberry32(35 + s));
      regTrain('thoraxTrackB', track(f, [0.02, 0.45, 0.98].map((u) => segPt(P, u, s * 0.56, 0.99)), 20, () => segNrm(P, s * 0.56)), Y_AXIS, 0.4);
    }
    scatter(f, P, 100, rng, [[0.03, 0.97, 0.55, 2.2], [0.03, 0.97, -2.2, -0.55], [0.3, 0.36, 2.2, 4.1], [0.62, 0.69, 2.2, 4.1]], 0.82, 0.98);
    [[0.12, 0.75], [0.38, -1.1], [0.58, 1.85], [0.8, -0.7], [0.22, 2.5], [0.7, -2.4]].forEach(([u, ph], i) => dust(f, segPt(P, u, ph, 1.02), segNrm(P, ph), 14 + i));
    const hb = mesh(G.box, M.gun, f); hb.position.copy(segPt(P, 0.12, Math.PI, 1.02)); hb.scale.set(3, 2, 6);
  }

  // ================================================================ PROTHORAX (neck) — ≈ 0.09 L thick, windows
  // R10 upright posture (owner: "stand up like the reference, more life"): the prothorax rises steeper
  // (44°→61°) and longer so the head sits proud of the shoulders instead of hunching forward.
  const NECK = V3(-2.5, 6.85, 0);
  {
    const grp = new THREE.Group(); grp.name = 'prothorax'; root.add(grp); parts.prothorax = grp;
    const f = segFrame(NECK, V3(-0.8, 3.78, 0), V3(0, -1, 0)); grp.add(f);
    const P = { len: f.userData.len, rx: 0.5, rz: 0.44, prof: profPts([[0, 0.78], [0.12, 0.84], [0.25, 1.0], [0.42, 0.86], [0.62, 0.82], [0.82, 0.92], [1, 1.12]]) };
    const rng = mulberry32(23);
    plate(f, P, { u0: 0, u1: 1, p0: 0, p1: TAU, mat: M.core, inset: 0.6 });
    [[0.0, 0.33], [0.31, 0.66], [0.64, 0.99]].forEach(([a, b], i) => {
      const g = new THREE.Group(); f.add(g);   // v6: dorsal ring = one train item, steps along the neck axis
      plate(g, P, { u0: a, u1: b, p0: Math.PI - 1.25, p1: Math.PI + 1.25, nu: 24, nv: 18, th: 0.06, inset: 1.0 + 0.025 * (i % 2), edges: { p0: 'm', p1: 'm' } });
      regTrain('neckPlate', g, Y_AXIS, [0.25, 0.4, 0.55][i]);
    });
    for (const s of [1, -1]) {
      const [a, b] = flank(s, 0.3, Math.PI - 1.25);
      const sideBay=new THREE.Group();f.add(sideBay);
      sideBay.position.set(0,.30*P.len,s*.47);
      function barrel(parent,r,length,y,material){
        const m=mesh(G.cyl,material,parent);m.position.y=y;m.scale.set(r,length,r);return m;
      }
      const backing=new THREE.Shape();
      backing.moveTo(-.23,-.08);backing.lineTo(.19,.04);backing.lineTo(.20,1.70);
      backing.lineTo(.06,1.99);backing.lineTo(-.20,1.79);backing.closePath();
      const bed=mesh(new THREE.ExtrudeGeometry(backing,{depth:.07,bevelThickness:.018,bevelSize:.018,bevelSegments:2}),M.graphite,sideBay);
      bed.position.z=-s*.11;
      sideBay.rotation.y=s<0?Math.PI:0;
      barrel(sideBay,.125,.66,.34,M.gun);
      for(const y of [.09,.22,.56,.65])barrel(sideBay,.137,.046,y,M.steel);
      const plunger=barrel(sideBay,.072,.86,.71,M.chrome);
      const carriage=barrel(sideBay,.109,.17,1.11,M.magenta);
      for(const x of [-.17,.16]){
        const guide=barrel(sideBay,.025,1.60,.86,M.steel);guide.position.x=x;
      }
      anim.push(t=>{
        const load=THREE.MathUtils.clamp((-.10-arm(s).shoulder)/.54,0,1);
        plunger.position.y=.71+.53*load;carriage.position.y=1.11+.53*load;
      });
      const wg = new THREE.Group(); f.add(wg);   // v6: glass window (pane + its frame bars) = one train item
      plate(wg, P, { u0: 0.05, u1: 0.95, p0: a, p1: b, mat: M.glass, inset: 1.0 });
      for (const u of [0.05, 0.33, 0.66, 0.95]) { const pts = []; for (let i = 0; i <= 10; i++) pts.push(segPt(P, u, a + (b - a) * i / 10, 1.01)); mesh(tubeGeo(pts, 0.016), M.steel, wg); }
      regTrain('neckGlass', wg, segNrm(P, (a + b) / 2), 0.45);
      [[0.04, 0.2], [0.3, 0.5], [0.6, 0.74], [0.82, 0.96]].forEach(([u0, u1]) => { const [q0, q1] = flank(s, 0.2, 0.8); plate(f, P, { u0, u1, p0: q0, p1: q1, inset: 1.01, th: 0.04, nu: 10, nv: 6 }); });
      [[0.12, 1.0, 0.13, 12], [0.38, 1.4, 0.16, 14], [0.62, 0.95, 0.12, 10], [0.84, 1.35, 0.17, 14]].forEach(([u, ph, r, n], i) => {
        const pp = s * ph; gear(f, segPt(P, u, pp, 0.8), segNrm(P, pp), r, n, 0.045, i % 2 ? M.steel : M.gun, (i % 2 ? 1.2 : -1.5), i);
      });
      {
        const A1 = segPt(P, 0.3, s * 1.6, 0.82), B1 = segPt(P, 0.9, s * 1.7, 0.82);
        regTrain('neckAct', actuator(f, A1, B1, 0.05, s, 1.8), B1.clone().sub(A1), 0.4);   // v6: along its own axis
      }
    }
    track(f, [0.02, 0.25, 0.5, 0.75, 0.98].map((u) => segPt(P, u, 0, 0.95)), 40, () => V3(1, 0, 0), false, 1.3);
    for (const s of [1, -1]) track(f, [0.04, 0.5, 0.96].map((u) => segPt(P, u, s * 0.3, 1.0)), 28, () => segNrm(P, s * 0.3));
    scatter(f, P, 40, rng, [[0.03, 0.97, 0.3, 1.9], [0.03, 0.97, -1.9, -0.3], [0.05, 0.95, -0.3, 0.3]], 0.74, 0.95);
    [[0.18, 0.9], [0.42, -1.3], [0.66, 1.2], [0.86, -0.8], [0.55, 2.6]].forEach(([u, ph], i) => dust(f, segPt(P, u, ph, 0.98), segNrm(P, ph), 20 + i));
  }

  // ================================================================ HEAD — inverted-triangle face plate (widest at the eye line ≈ 0.20 L with the eyes),
  // pointed chin, V ridge, cheek plates; two separate black glass domes on the upper corners; short wide glazed neck collar
  {
    const grp = new THREE.Group(); grp.name = 'head'; root.add(grp); parts.head = grp;
    // neck: short, wide white collar with a glass window band and a track inside
    const HB = V3(-2.78, 7.03, 0);   // R10: head base rides the erect neck
    {
      const cf = segFrame(NECK.clone().lerp(HB, -0.1), HB, V3(0, -1, 0)); grp.add(cf);
      const NP = { len: cf.userData.len, rx: 0.36, rz: 0.4, prof: () => 1 };
      plate(cf, NP, { u0: 0, u1: 1, p0: 0, p1: TAU, mat: M.core, inset: 0.75 });
      {
        const r0 = new THREE.Group(); cf.add(r0); plate(r0, NP, { u0: 0.0, u1: 0.3, p0: 0, p1: TAU, th: 0.05, nu: 4, nv: 32 });
        regTrain('headRing', r0, Y_AXIS, 0.3);   // v6: collar sections step along the neck axis
        const r1 = new THREE.Group(); cf.add(r1); plate(r1, NP, { u0: 0.7, u1: 1.0, p0: 0, p1: TAU, th: 0.05, nu: 4, nv: 32 });
        regTrain('headRing', r1, Y_AXIS, 0.55);
      }
      plate(cf, NP, { u0: 0.3, u1: 0.7, p0: 0, p1: TAU, mat: M.glass, nu: 4, nv: 32 });
      plate(cf, NP, { u0: 0.3, u1: 0.7, p0: Math.PI - 0.7, p1: Math.PI + 0.7, th: 0.05, nu: 4, nv: 10, edges: { p0: 'm', p1: 'm' } });
      track(cf, [0.05, 0.5, 0.95].map((u) => segPt(NP, u, 0.9, 0.82)), 8, () => segNrm(NP, 0.9));
      track(cf, [0.05, 0.5, 0.95].map((u) => segPt(NP, u, -0.9, 0.82)), 8, () => segNrm(NP, -0.9));
      for (let i = 0; i < 4; i++) gear(cf, segPt(NP, 0.5, 0.5 + i * 1.57, 0.8), segNrm(NP, 0.5 + i * 1.57), 0.09, 10, 0.03, i % 2 ? M.steel : M.gun, (i % 2 ? 2 : -2), i);
      for (let i = 0; i < 3; i++) { const ph = 0.9 + i * 2.1; dust(cf, segPt(NP, 0.15 + i * 0.3, ph, 1.0), segNrm(NP, ph), 25 + i); }
    }
    // R8: a continuous shield, constrained in face-plane (Y,Z) and depth (X).
    // The front and back are independent smooth patches; no stepped width profile.
    const h = new THREE.Group(); h.name = 'headAssemblyR8';
    h.position.copy(HB).add(V3(-0.06, 0.15, 0)); h.scale.set(1.10,0.93,1.15);
    grp.add(h); parts.headPivot = h;
    const ramp=(t,a,b)=>THREE.MathUtils.smootherstep(t,a,b);
    const turn=t=>-.26+.72*ramp(t,.23,1.02)-.28*ramp(t,4.05,4.95);
    function oval(parent,material,at,radii){
      const item=mesh(G.sphere,material,parent);
      item.position.copy(at); item.scale.set(...radii); return item;
    }
    function link(parent,material,a,b,r0,r1){
      const delta=b.clone().sub(a);
      const item=mesh(new THREE.CylinderGeometry(r1,r0,delta.length(),16),material,parent);
      item.position.copy(a).lerp(b,.5); item.quaternion.setFromUnitVectors(Y_AXIS,delta.normalize());
      return item;
    }
    for(const side of [-1,1]){
      // Nested palp segments share true hinge positions.
      const palp=new THREE.Group(); h.add(palp); palp.position.set(-.31,-.53,side*.23);
      oval(palp,M.gun,V3(0,0,0),[.11,.10,.105]);
      const knuckle=V3(-.19,-.20,side*.18);
      link(palp,M.shell,V3(0,0,0),knuckle,.073,.052);
      const finger=new THREE.Group(); palp.add(finger); finger.position.copy(knuckle);
      oval(finger,M.steel,V3(0,0,0),[.075,.066,.070]);
      const end=V3(-.27,.004,side*.13);
      link(finger,M.graphite,V3(0,0,0),end,.056,.032);
      link(finger,M.shell,end,end.clone().add(V3(-.115,.072,side*.025)),.036,.008);
      const mandible=oval(h,M.graphite,V3(-.34,-.63,side*.13),[.15,.105,.075]);
      const folds=[];
      for(let j=0;j<4;j++){
        const at=V3(HB.x+.16+j*.095,HB.y-.24-j*.16,side*(.34+j*.018));
        oval(grp,M.rubber,at,[.23,.14,.115]);
        folds.push(oval(grp,M.shell,at.clone().add(V3(-.012,.043,side*.045)),[.215,.082,.12]));
      }
      const cableStart=V3(HB.x+.63,HB.y-.93,side*.39);
      const cable=mesh(G.cyl,M.steel,grp);
      anim.push(t=>{
        const u=t-(side>0?0:.46);
        const probe=ramp(u,.18,.76)-ramp(u,1.06,1.52);
        const recoil=ramp(u,4.48,4.67)-ramp(u,4.82,5.34);
        palp.rotation.set(side*.18*probe,side*(-.68*probe+.35*recoil),.14-.65*probe+.58*recoil);
        finger.rotation.z=.18+.75*(ramp(u,.32,.92)-ramp(u,1.19,1.68))-.4*recoil;
        mandible.rotation.z=.15+.5*recoil;
        folds.forEach((f,j)=>{f.rotation.x=side*(.22+.36*turn(t));f.position.y=HB.y-.197-j*(.16+side*.047*turn(t));});
        const upper=V3(-.08,-.21,side*.45).multiply(h.scale).applyEuler(new THREE.Euler(0,.30+turn(t),.13)).add(h.position);
        const axis=upper.clone().sub(cableStart);
        cable.position.copy(cableStart).lerp(upper,.5); cable.scale.set(.031,axis.length(),.031);
        cable.quaternion.setFromUnitVectors(Y_AXIS,axis.normalize());
      });
    }
    const outline = new THREE.CatmullRomCurve3([
      V3(0,0.62,0), V3(0,0.59,0.38), V3(0,0.39,0.64),
      V3(0,0.10,0.60), V3(0,-0.28,0.37), V3(0,-0.62,0.13),
      V3(0,-0.70,0), V3(0,-0.62,-0.13), V3(0,-0.28,-0.37),
      V3(0,0.10,-0.60), V3(0,0.39,-0.64), V3(0,0.59,-0.38)
    ], true, 'centripetal');
    const faceX = (y,z,r=0) => -0.20 - 0.34*Math.sqrt(Math.max(0,1-r*r)) - 0.025*(1-Math.min(1,Math.abs(z)/0.45)) + 0.055*y;
    const skullSurfaces=[];
    function shield(front) {
      const g = surf((u,v,p) => {
        const edge = outline.getPoint(v), y = edge.y*u, z = edge.z*u;
        p.set(front ? faceX(y,z,u) : 0.03 + 0.27*(1-u*u), y, z);
      }, 26, 96);
      // Keep normals facing outward even at the centre fan.
      if(front) { const ix=g.index;for(let i=0;i<ix.count;i+=3){const b=ix.getX(i+1);ix.setX(i+1,ix.getX(i+2));ix.setX(i+2,b);}g.computeVertexNormals(); }
      skullSurfaces.push(g);
    }
    shield(true); shield(false);
    const edgeG = surf((u,v,p)=>{ const e=outline.getPoint(v), bulge=1+0.045*Math.sin(Math.PI*u); p.set(THREE.MathUtils.lerp(faceX(e.y,e.z,1),0.03,u),e.y*bulge,e.z*bulge); },12,96);
    for(let i=0;i<edgeG.index.count;i+=3){const b=edgeG.index.getX(i+1);edgeG.index.setX(i+1,edgeG.index.getX(i+2));edgeG.index.setX(i+2,b);}
    skullSurfaces.push(edgeG);
    const joined=mergeGeometries(skullSurfaces);joined.deleteAttribute('normal');joined.deleteAttribute('uv');
    const skull=mergeVertices(joined,0.0001);skull.computeVertexNormals();
    const shieldMesh = mesh(skull,M.shell,h); shieldMesh.name='continuousShield';
    regTrain('headShield', shieldMesh, Y_AXIS, 0.25);   // v6: shield micro-lift in the head-local explode
    // A separate forehead panel follows the same curved support surface.
    // Its fine seam makes the cheek/forehead structure readable without random detail.
    const boundary=Array.from({length:384},(_,i)=>outline.getPoint(i/384));
    function facePoint(y,z,offset=0.010) {
      const len=Math.hypot(y,z);let closest=Infinity,edgeLen=0.7;
      if(len>0.001)for(const p of boundary){const pl=Math.hypot(p.y,p.z),err=(p.y/pl-y/len)**2+(p.z/pl-z/len)**2;if(err<closest){closest=err;edgeLen=pl;}}
      return V3(faceX(y,z,Math.min(1,len/edgeLen))-offset,y,z);
    }
    const panel=new THREE.CatmullRomCurve3([V3(0,0.57,0),V3(0,0.51,0.30),V3(0,0.22,0.34),V3(0,-0.12,0.23),V3(0,-0.43,0.10),V3(0,-0.48,0),V3(0,-0.43,-0.10),V3(0,-0.12,-0.23),V3(0,0.22,-0.34),V3(0,0.51,-0.30)],true,'centripetal');
    const panelG=surf((u,v,p)=>{const e=panel.getPoint(v);p.copy(facePoint(e.y*u,e.z*u));},24,80);
    for(let i=0;i<panelG.index.count;i+=3){const b=panelG.index.getX(i+1);panelG.index.setX(i+1,panelG.index.getX(i+2));panelG.index.setX(i+2,b);}panelG.computeVertexNormals();
    const fpG = new THREE.Group(); h.add(fpG);   // v6: forehead panel + its seam tube = one train item
    mesh(panelG,M.shell,fpG).name='foreheadPanel';
    const panelEdge=Array.from({length:129},(_,i)=>{const p=panel.getPoint(i/128);return facePoint(p.y,p.z,0.012);});
    mesh(tubeGeo(panelEdge,0.0035),M.gun,fpG);
    regTrain('headPanel', fpG, Y_AXIS, 0.45);
    // Subtle central panel seam, placed on the actual curved face rather than buried in it.
    const seam=[]; for(let i=0;i<=32;i++){const y=0.57-i/32*1.18;seam.push(facePoint(y,0,0.020));}
    mesh(tubeGeo(seam,0.0035),M.magenta,h);
    // Lower face perimeter: two cheek plates and exposed bearings under the shield.
    for(const side of [-1,1]) {
      const cg = new THREE.Group(); h.add(cg);   // v6: cheek unit (lip tube + screws + gears + lower tube) = one train item
      const lip=[[0.12,0.57],[-0.17,0.43],[-0.43,0.24],[-0.65,0.08]].map(([y,z])=>facePoint(y,z*side,0.012));
      mesh(tubeGeo(lip,0.006),M.magenta,cg);
      for(const [y,z] of [[-0.20,0.32],[-0.46,0.16],[0.53,0.27]]) {
        const pos=facePoint(y,z*side,0.022);
        const sc=mesh(G.screw,M.chrome,cg);sc.position.copy(pos);sc.quaternion.setFromUnitVectors(Y_AXIS,V3(-1,0,0));sc.scale.setScalar(0.60);
        const ring=mesh(G.torus,M.gun,cg);ring.position.copy(pos).add(V3(0.004,0,0));ring.rotation.y=Math.PI/2;ring.scale.setScalar(0.024);
      }
      for(const [y,z,r] of [[-0.25,0.43,0.105],[-0.48,0.25,0.075],[-0.61,0.13,0.055]]) {
        gear(cg,V3(-0.05,y,z*side),V3(-0.65,-0.1,0.76*side),r,14,0.045,M.steel,0.4*side);
      }
      mesh(tubeGeo([V3(0.08,-0.35,0.31*side),V3(-0.12,-0.62,0.2*side),V3(-0.31,-0.73,0.09*side)],0.03),M.gun,cg);
      regTrain('headCheek', cg, V3(0, 0, side), 0.4);
    }
    // Use planar lens coordinates so the six-sided facets stay regular at the dome centre.
    const cellMap=document.createElement('canvas');
    cellMap.width=640;cellMap.height=960;
    const ctx=cellMap.getContext('2d');
    ctx.fillStyle='#505050';ctx.fillRect(0,0,640,960);
    const cellRadius=13;
    for(let row=-1;row<68;row++){
      for(let col=-1;col<41;col++){
        const cx=(col+(row&1)*.5)*Math.sqrt(3)*cellRadius,cy=row*1.5*cellRadius;
        const gradient=ctx.createLinearGradient(cx-13,cy-15,cx+12,cy+15);
        gradient.addColorStop(0,'#dadada');gradient.addColorStop(.55,'#a4a4a4');gradient.addColorStop(1,'#686868');
        ctx.fillStyle=gradient;ctx.beginPath();
        for(let k=0;k<6;k++){
          const angle=(k+.5)*Math.PI/3;
          const x=cx+(cellRadius-.9)*Math.cos(angle),y=cy+(cellRadius-.9)*Math.sin(angle);
          if(k===0)ctx.moveTo(x,y);else ctx.lineTo(x,y);
        }
        ctx.closePath();ctx.fill();
      }
    }
    const facetTexture=new THREE.CanvasTexture(cellMap);
    const facetLens=M.lens.clone();facetLens.color.set(0x39343a);facetLens.map=facetTexture;facetLens.roughness=.36;
    facetLens.roughnessMap=facetTexture;facetLens.bumpMap=facetTexture;facetLens.bumpScale=.018;
    facetLens.clearcoat=.27;facetLens.clearcoatRoughness=.065;
    const eyes=[];
    for(const side of [-1,1]) {
      // Wide oblique domes seated at the upper corners, not vertical discs.
      const ec=V3(-0.22,0.34,0.61*side);
      const normal=V3(-0.78,0.11,0.62*side).normalize();
      const major=V3(0.30,0.54,0.82*side);major.addScaledVector(normal,-major.dot(normal)).normalize();
      const minor=new THREE.Vector3().crossVectors(major,normal).normalize();
      const basis=new THREE.Matrix4().makeBasis(minor,major,normal).setPosition(ec);
      const eyeG = new THREE.Group(); h.add(eyeG);eyeG.userData.dir=normal;eyes.push(eyeG);regTrain('eyes', eyeG, normal, 0.55);
      const lensGeo=surf((u,v,p)=>{
        const a=v*TAU,r=u; p.set(0.345*r*Math.cos(a),0.52*r*Math.sin(a),0.25*Math.sqrt(Math.max(0,1-r*r)));
        p.applyMatrix4(basis);
      },30,80);
      const uv=lensGeo.attributes.uv;
      for(let i=0;i<uv.count;i++){
        const r=uv.getX(i),angle=uv.getY(i)*TAU;
        uv.setXY(i,.5+.495*r*Math.cos(angle),.5+.495*r*Math.sin(angle));
      }
      const lens=mesh(lensGeo,facetLens,eyeG);lens.name='lens'+side;
      const socketGeo=surf((u,v,p)=>{const a=v*TAU;p.set(0.357*u*Math.cos(a),0.535*u*Math.sin(a),-0.19*Math.sqrt(Math.max(0,1-u*u)));p.applyMatrix4(basis);},24,80);
      // Reverse the back bowl so its exterior has consistent outward winding.
      for(let i=0;i<socketGeo.index.count;i+=3){const b=socketGeo.index.getX(i+1);socketGeo.index.setX(i+1,socketGeo.index.getX(i+2));socketGeo.index.setX(i+2,b);}socketGeo.computeVertexNormals();
      mesh(socketGeo,M.shell,h).name='orbitalSocket'+side;
      for(const [radius,material,offset] of [[0.012,M.gun,-0.009],[0.007,M.magenta,0]]) {
        const rim=[];for(let j=0;j<=96;j++){const a=j/96*TAU;rim.push(V3(0.35*Math.cos(a),0.528*Math.sin(a),offset).applyMatrix4(basis));}
        mesh(tubeGeo(rim,radius),material,eyeG);
      }
      // Antennae: emerge between the eyes and open laterally in one long smooth arc.
      const base=V3(-0.28,0.61,0.235*side);
      const points=[base,base.clone().add(V3(0.02,0.36,0.16*side)),base.clone().add(V3(0.12,0.78,0.60*side)),base.clone().add(V3(0.28,1.13,1.16*side)),base.clone().add(V3(0.42,1.28,1.74*side)),base.clone().add(V3(0.48,1.21,2.05*side))];
      const ac=new THREE.CatmullRomCurve3(points,false,'centripetal');
      const ant=new THREE.Group();ant.name='antenna';ant.userData.maskOut=true;h.add(ant);
      oval(h,M.gun,base,[.078,.070,.080]);
      const stations=[0,.22,.57,1];
      let parent=ant;
      for(let j=0;j<3;j++){
        const lo=stations[j],hi=stations[j+1],pivot=ac.getPointAt(lo);
        const joint=new THREE.Group();parent.add(joint);
        const radius=u=>.024*(1-u)+.006;
        mesh(sweepGeo(ac,lo,hi,u=>[radius(u),radius(u)],0,TAU,36,8),M.graphite,joint);
        oval(joint,M.steel,pivot,[.039-j*.008,.043-j*.009,.039-j*.008]);
        anim.push(t=>{
          const scan=x=>ramp(x,.34,1.15)-ramp(x,1.48,2.22);
          const lag=turn(t-.13*(j+1))-turn(t-.13*j);
          joint.rotation.set(side*.12*scan(t-j*.15-(side>0?0:.6)),lag*1.5,side*.035*scan(t-.2*j));
          joint.position.copy(pivot).sub(pivot.clone().applyQuaternion(joint.quaternion));
        });
        if(j===2){
          const lengths=[.075,.12,.085,.15,.091,.16,.102,.071,.135,.083,.059];
          lengths.forEach((length,i)=>{
            const u=.61+i*.035+.006*Math.sin(i*3);
            const hair=new THREE.Group();hair.position.copy(ac.getPointAt(u));joint.add(hair);
            const direction=V3(-.25,.85+.22*Math.sin(i*2),side*.65).normalize();
            const shaft=mesh(new THREE.ConeGeometry(.0075,length,7),M.graphite,hair);
            shaft.position.copy(direction).multiplyScalar(length*.5);
            shaft.quaternion.setFromUnitVectors(Y_AXIS,direction);
            if(length>.13)anim.push(t=>{
              hair.rotation.x=side*1.6*(turn(t-.48)-turn(t-.22));
            });
          });
        }
        parent=joint;
      }
      const jaw=mesh(G.sphere,M.gun,h);jaw.position.set(-0.17,-0.70,0.08*side);jaw.scale.set(0.13,0.07,0.06);
      regTrain('headJaw', jaw, V3(0, 0, side), 0.25);   // v6: jaws spread laterally
    }
    parts.eyes=eyes;
    anim.push(t => { h.rotation.set(-.07*life.weight,.30+turn(t),.13-.17*arm(1).wipe-.12*arm(-1).wipe); });
  }

  // ================================================================ RAPTORIAL FORELEGS (hero element) — femur width 1.24 = 0.124 L
  function foreleg(s) {
    const grp = new THREE.Group(); grp.name = s > 0 ? 'forelegR' : 'forelegL'; root.add(grp);
    const rng = mulberry32(s > 0 ? 101 : 202);
    // R10: shoulder rides the erect prothorax, elbow a touch higher, knee raised to head height —
    // the tall folded scythe of the reference (blade tip now hangs at chest height instead of near the ground)
    const S = V3(-2.62, 5.62, 0.36 * s), T = V3(-2.38 - (s < 0 ? 0.2 : 0), 3.3, 1.0 * s), K = V3(-4.42 - (s < 0 ? 0.25 : 0), 5.85 - (s < 0 ? 0.12 : 0), 1.9 * s);
    regTrain('caps', cap(grp, S, V3(0, 0, 1), 0.22, 0.32), V3(0, 0, s), 0.4);
    const seat=new THREE.Group();
    parts.prothorax.add(seat); seat.position.copy(S);
    const collar=mesh(G.sphere,M.rubber,seat);
    collar.scale.set(.41,.42,.39);collar.position.z=.23*s;
    const shells=[];
    for(let j=0;j<2;j++){
      const shape=new THREE.Shape(), radius=.49-j*.085, arcStart=-1.25+j*.52, arcEnd=1.88+j*.5;
      shape.absarc(0,0,radius,arcStart,arcEnd,false);
      shape.absarc(0,0,radius-.135,arcEnd,arcStart,true);shape.closePath();
      const shell=mesh(new THREE.ExtrudeGeometry(shape,{depth:.065,bevelEnabled:true,bevelSize:.026,bevelThickness:.024,bevelSegments:3,curveSegments:32}),M.shell,seat);
      shell.position.z=s*(.43+j*.105);shells.push(shell);
    }
    const rails=[];
    for(let j=0;j<5;j++){
      const ring=mesh(new THREE.TorusGeometry(.29+j*.008,.027,10,48,Math.PI*1.35),M.graphite,seat);
      ring.position.z=s*(.20+j*.052);ring.rotation.z=1.4; rails.push(ring);
    }
    const sleeve=mesh(G.cyl,M.gun,seat),piston=mesh(G.cyl,M.chrome,seat);
    const anchor=V3(.31,.19,.50*s), lug=V3(.02,-.65,.48*s).add(S);
    const pin=mesh(G.sphere,M.steel,grp);pin.position.copy(lug);pin.scale.setScalar(.081);
    const mount=mesh(G.sphere,M.steel,seat);mount.position.copy(anchor);mount.scale.setScalar(.095);
    const point=new THREE.Vector3(),axis=new THREE.Vector3();
    shoulderLinks.push(()=>{
      point.copy(lug);grp.localToWorld(point);seat.worldToLocal(point);
      axis.copy(point).sub(anchor);const length=axis.length();axis.normalize();
      for(const [piece,start,end,r] of [[sleeve,0,.40,.086],[piston,.36,length,.043]]){
        piece.position.copy(anchor).addScaledVector(axis,(start+end)/2);
        piece.quaternion.setFromUnitVectors(Y_AXIS,axis);piece.scale.set(r,end-start,r);
      }
    });
    anim.push(t=>{
      const load=s>0 ? THREE.MathUtils.smootherstep(t,.46,1.17)-THREE.MathUtils.smootherstep(t,3.65,4.83) : 0;
      shells[0].rotation.z=.30+.50*load;shells[1].rotation.z=-1.45-.64*load;
      shells[1].position.y=-.055-.08*load;
      rails.forEach((r,j)=>{r.position.z=s*(.20+j*(.037+.031*load));});
    });
    const cf = segFrame(S, T, V3(-1, 0, 0)); grp.add(cf);
    const CP = { len: cf.userData.len, rx: 0.3, rz: 0.26, prof: profEll(0.45, 0.06) };
    plate(cf, CP, { u0: 0, u1: 1, p0: 0, p1: TAU, mat: M.core, inset: 0.72 });
    plate(cf, CP, { u0: 0.03, u1: 0.97, p0: -2.7, p1: 0.05, th: 0.05 });
    plate(cf, CP, { u0: 0.05, u1: 0.62, p0: 0.6, p1: 2.7, th: 0.05 });
    track(cf, [0.05, 0.5, 0.95].map((u) => segPt(CP, u, 0.33, 1.0)), 12, () => segNrm(CP, 0.33));
    scatter(cf, CP, 6, rng, [[0.1, 0.9, 0.05, 0.6], [0.62, 0.95, 0.6, 2.7]], 0.75, 0.92);
    dust(cf, segPt(CP, 0.35, 0.6, 0.98), segNrm(CP, 0.6), 28 + (s > 0 ? 0 : 1));
    dust(cf, segPt(CP, 0.72, -0.9, 0.98), segNrm(CP, -0.9), 30 + (s > 0 ? 0 : 1));
    regTrain('caps', cap(grp, T, V3(0, 0, 1), 0.22, 0.4), V3(0, 0, s), 0.4);
    // femur: big white glass oval
    const startOfFemur=grp.children.length;
    const ff = segFrame(T, K, V3(-1, -1, 0)); grp.add(ff);
    const FP = { len: ff.userData.len, rx: 0.62, rz: 0.32, prof: profEll(0.55, 0.04) };
    const shellG = { dors: new THREE.Group(), ven: new THREE.Group(), gp: new THREE.Group(), gn: new THREE.Group() };
    for (const g of Object.values(shellG)) ff.add(g);
    parts['femurShell_' + grp.name] = shellG;
    // teardown trains: the four femur shell plates peel open along their own directions
    regTrain('femurShells', shellG.dors, V3(-1, 0, 0), 0.5);
    regTrain('femurShells', shellG.ven, V3(1, 0, 0), 0.28);
    regTrain('femurShells', shellG.gp, V3(0, 0, 1), 0.55);
    regTrain('femurShells', shellG.gn, V3(0, 0, -1), 0.55);
    plate(shellG.dors, FP, { u0: 0.01, u1: 0.99, p0: Math.PI - 0.85, p1: Math.PI + 0.85, nu: 40, th: 0.07, edges: { p0: 'm', p1: 'm' } });
    plate(shellG.ven, FP, { u0: 0.03, u1: 0.97, p0: -0.42, p1: 0.42, nu: 40, th: 0.06 });
    plate(shellG.gp, FP, { u0: 0.04, u1: 0.96, p0: 0.42, p1: Math.PI - 0.85, mat: M.glass });
    plate(shellG.gn, FP, { u0: 0.04, u1: 0.96, p0: -(Math.PI - 0.85), p1: -0.42, mat: M.glass });
    // pale inner wall behind the mechanism, so the oval reads white with the spring inside
    plate(ff, { ...FP, rz: 0.04 }, { u0: 0.06, u1: 0.94, p0: 0, p1: TAU, mat: M.femurWall, inset: 0.88 });
    const L = FP.len;
    const spr = []; for (let i = 0; i <= 300; i++) { const a = i / 300 * TAU * 12; spr.push(V3(-0.02 + 0.2 * Math.cos(a), L * (0.18 + 0.56 * i / 300), 0.2 * Math.sin(a))); }
    const spring = mesh(tubeGeo(spr, 0.034, false, 8), M.chrome, ff); stats.big++;
    regTrain('springOut', spring, Y_AXIS, 0.7);   // v6: the spring pulls out along the femur axis
    const rod = mesh(G.cyl, M.chrome, ff); rod.scale.set(0.05, L * 0.8, 0.05); rod.position.set(-0.02, L * 0.5, 0);
    const hous = mesh(G.cyl, M.graphite, ff); hous.scale.set(0.1, L * 0.16, 0.1); hous.position.set(-0.02, L * 0.83, 0);
    const hb = mesh(G.cyl, M.steel, ff); hb.scale.set(0.11, L * 0.03, 0.11); hb.position.set(-0.02, L * 0.75, 0);
    // a thin dark mechanism strip along the ventral side only
    plate(ff, { ...FP, rx: FP.rx * 0.55, rz: 0.08 }, { u0: 0.08, u1: 0.92, p0: 0, p1: TAU, mat: M.graphite, inset: 1 });
    for (let i = 0; i < 6; i++) { const u = 0.15 + i * 0.13; const g = new THREE.Group(); g.position.set(0.36 * FP.prof(u), u * L, 0); ff.add(g); gear(g, V3(0, 0, 0.06), V3(0, 0, 1), 0.07 + (i % 2) * 0.03, 10, 0.03, i % 2 ? M.steel : M.gun, (i % 2 ? 2 : -2) * s, i); }
    for (const z of [0.12, -0.12]) {
      gear(ff, V3(-0.05, L * 0.09, z), V3(0, 0, Math.sign(z)), 0.18, 16, 0.04, M.steel, 1.5 * s);
      gear(ff, V3(-0.12, L * 0.91, z), V3(0, 0, Math.sign(z)), 0.13, 12, 0.035, M.gun, -2 * s);
    }
    scatter(ff, FP, 14, rng, [[0.08, 0.92, 0.5, 1.9], [0.08, 0.92, -1.9, -0.5]], 0.25, 0.6);
    for (const sd of [1, -1]) { const ph = sd * (Math.PI - 0.9); track(ff, [0.06, 0.3, 0.5, 0.7, 0.94].map((u) => segPt(FP, u, ph, 1.0)), 26, () => segNrm(FP, ph), false, 1, () => .06*arm(s).wipe - .035*arm(s).jab); }
    anim.push(() => {
      const {wipe,jab,fold} = arm(s);
      tib.rotation.z = fold; tib.rotation.x=-.24*s;
      const compression = .07*wipe - .12*jab;
      spring.scale.y = 1-compression;
      rod.position.y = L*(.5-compression*.25);
      hous.position.y = L*(.83-compression*.14);
      hb.position.y = L*(.75-compression*.20);
    });
    // femur spines: 14 needles on the ventral edge, base Ø 0.096 = 0.15 × femur thickness 0.64
    let nsp = 0;
    // Compound lancets: a lenticular blade, silver cutting bevel and a socketed pivot.
    const bladeGeo=surf((u,v,p)=>{
      const r=Math.pow(1-u,.78)*(.84+.28*Math.sin(Math.PI*u))+.003;
      p.set(.34*u*u+.145*r*Math.cos(v*TAU),u,.055*r*Math.sin(v*TAU));
    },18,8);
    const bevelGeo=surf((u,v,p)=>{
      const r=Math.pow(1-u,.78)*(.84+.28*Math.sin(Math.PI*u))+.003;
      const angle=(v-.5)*.86;
      p.set(.34*u*u+.147*r*Math.cos(angle),u,.056*r*Math.sin(angle));
    },18,3);
    const fit=(parent,geo,mat,x,y,z)=>{
      const obj=mesh(geo,mat,parent); obj.scale.set(x,y,z); return obj;
    };
    function lancet(parent,base,axis,bend,length,phase,major,distal,service){
      const socket=segFrame(base,base.clone().add(axis),bend); parent.add(socket);
      const r=major?.092:.048;
      fit(socket,G.cyl,M.rubber,r*1.28,.075,r*1.28);
      const rim=fit(socket,G.cyl,M.steel,r*1.15,.024,r*1.15);rim.position.y=.042;
      const stem=fit(socket,G.cyl,M.chrome,r*.54,.25,r*.54);
      const hinge=new THREE.Group();socket.add(hinge);
      const pin=fit(hinge,G.cyl,M.gun,r*.73,r*1.9,r*.73);pin.rotation.x=Math.PI/2;
      const washer=fit(hinge,G.cyl,M.steel,r*.52,.02,r*.52);washer.rotation.x=Math.PI/2;washer.position.z=r;
      const bearing=fit(hinge,G.cyl,M.magenta,r*.24,.021,r*.24);bearing.rotation.x=Math.PI/2;bearing.position.z=r+.01;
      const blade=fit(hinge,bladeGeo,major?M.gun:M.spine,length,length,length);blade.name=distal?'tibialLancet':'femoralLancet';
      fit(hinge,bevelGeo,M.chrome,length,length,length);
      const ramp=(t,a,b)=>THREE.MathUtils.smootherstep(t,a,b);
      anim.push(t=>{
        const delay=phase*.32+(distal?.12:0);
        const cue=t-(s>0?.78:1.36);
        const opening=Math.max(.38*arm(s).guard,ramp(cue,.48+delay,.89+delay)*(1-ramp(cue,1.93+delay,2.31+delay)));
        // A common two-second breath reaches the distal row slightly later.
        const localTime=cue-.50-phase*.25-(distal?.13:0);
        const breath=.5-.5*Math.cos(Math.PI*localTime);
        const travel=(major?.36:.21)*(.18+.82*arm(s).guard);
        const stroke=travel*breath;
        hinge.position.y=.080+stroke;
        hinge.rotation.z=.52-opening*(major?.64:.40)-.13*breath*arm(s).guard;
        hinge.rotation.y=(service?.12:.045)*breath;
        stem.position.y=(hinge.position.y+.04)/2;stem.scale.y=hinge.position.y-.04;
      });
    }
    function femoralRow(count,major){
      for(let i=0;i<count;i++){
        const phase=i/(count-1),u=(major?.13:.105)+phase*(major?.70:.77);
        const base=segPt(FP,u,s*(major?-.21:.25),1.01);
        const len=(major?.56:.24)+(major?.27:.095)*Math.sin(Math.PI*phase);
        lancet(ff,base,V3(.97,-.15,s*(major?-.2:.2)),V3(0,-1,0),len,phase,major,false,major&&i>=2&&i<=4);
        nsp++;
      }
    }
    femoralRow(7,true); femoralRow(11,false);
    regTrain('caps', cap(grp, K, V3(0, 0, 1), 0.24, 0.46), V3(0, 0, s), 0.4);
    const kk = K.clone();
    const tc = new THREE.CatmullRomCurve3([kk, kk.clone().add(V3(-0.3, -1.0, -0.02 * s)), kk.clone().add(V3(-0.3, -2.05, -0.08 * s)),
      kk.clone().add(V3(0.04, -3.2, -0.30 * s)), kk.clone().add(V3(0.54, -3.8, -0.50 * s))]);
    const tib = new THREE.Group(); grp.add(tib); tib.position.copy(K); parts['tib_' + grp.name] = tib;
    const tg = new THREE.Group(); tg.position.copy(K).negate(); tib.add(tg);
    const tr0 = (u) => [0.18 - 0.04 * u, 0.12 - 0.03 * u];
    mesh(sweepGeo(tc, 0.0, 0.7, tr0, 0.95, TAU - 0.95, 48, 14), M.shell, tg);
    mesh(sweepGeo(tc, 0.0, 0.72, (u) => tr0(u).map((v) => v * 0.8), 0, TAU, 40, 10), M.graphite, tg);
    for (const ph of [0.95, TAU - 0.95]) {
      const pts = []; for (let i = 0; i <= 20; i++) { const u = 0.02 + 0.66 * i / 20; const fr = sweepFrame(tc, u); const [a, b] = tr0(u); pts.push(fr.P.clone().addScaledVector(fr.N, a * Math.cos(ph) * 1.01).addScaledVector(fr.B, b * Math.sin(ph) * 1.01)); }
      tg.add(new THREE.Mesh(tubeGeo(pts, 0.013), M.magenta));
    }
    mesh(sweepGeo(tc, 0.66, 1.0, (u) => { const k = (u - 0.66) / 0.34; return [0.16 * Math.pow(1 - k, 0.8) + 0.006, 0.105 * Math.pow(1 - k, 0.8) + 0.005]; }, 0, TAU, 40, 12), M.claw, tg);
    { const fr = sweepFrame(tc, 0.7); spine(tg, fr.P.clone().addScaledVector(fr.N, 0.14), fr.N.clone().add(fr.T.clone().multiplyScalar(0.9)), 0.42, 0.045, M.claw); }
    // tibia spines: 10 needles, base Ø 0.044 = 0.18 × tibia thickness 0.24
      for(const [count,major] of [[5,true],[13,false]]){
        for(let i=0;i<count;i++){
          const phase=i/(count-1),u=(major?.16:.075)+phase*(major?.49:.58);
          const fr=sweepFrame(tc,u),base=fr.P.clone().addScaledVector(fr.N,tr0(u)[0]*.95).addScaledVector(fr.B,s*(major?.044:-.042));
          const len=(major?.35:.17)+(major?.12:.065)*Math.sin(Math.PI*phase);
          lancet(tg,base,fr.N.clone().addScaledVector(fr.B,s*(major?.18:-.19)),fr.T,len,phase,major,true,false);nsp++;
        }
      }
    // Rotate the femur assembly and the downstream tibia about the coxa endpoint.
    const elbow=new THREE.Group(), members=grp.children.slice(startOfFemur);
    elbow.position.copy(T); grp.add(elbow);
    const socket=new THREE.Group(); socket.position.copy(T).negate(); elbow.add(socket);
    for(const member of members) socket.add(member);
    anim.push(()=>{elbow.rotation.z=arm(s).elbow;});
    stats.spines[grp.name] = nsp;
    // (the tibia's idle motion lives in the arm-life layer above)
    // film camera anchors: the blade tip (and a point just behind it) so the release shot can follow the scythe
    const tipAnchor = new THREE.Object3D(); tipAnchor.name = 'tip_' + grp.name; tipAnchor.position.copy(tc.getPointAt(1)); tg.add(tipAnchor);
    const bladeAnchor = new THREE.Object3D(); bladeAnchor.name = 'blade_' + grp.name; bladeAnchor.position.copy(tc.getPointAt(0.85)); tg.add(bladeAnchor);
    parts['tip_' + grp.name] = tipAnchor; parts['blade_' + grp.name] = bladeAnchor;
    if(s>0){parts.sampleKnee=tib;parts.sampleFemur=ff;}
    grp.userData.pivot = S.clone(); parts[grp.name] = grp;
  }
  foreleg(1); foreleg(-1);

  // ================================================================ WALKING LEGS — white femur shell + thin metal tibia, bent joints
  function walkLeg(name, o) {
    const { base, knee, mid, ankle, foot, seed } = o;
    const grp = new THREE.Group(); grp.name = name; grp.userData.maskOut = true; grp.userData.pivot = base.clone(); root.add(grp); parts[name] = grp;
    const rng = mulberry32(seed);
    regTrain('caps', hub(grp, base, V3(0, 0, 1), 0.2, 0.3), V3(0, 0, Math.sign(base.z)), 0.35);
    const mk = (A, B, r, mat) => { const d = B.clone().sub(A); const m = mesh(G.cyl, mat, grp); m.position.copy(A).add(B).multiplyScalar(0.5); m.scale.set(r, d.length(), r); m.quaternion.setFromUnitVectors(Y_AXIS, d.normalize()); return m; };
    mk(base, knee, 0.08, M.graphite);
    const ff = segFrame(base, knee, V3(0, -1, 0)); grp.add(ff);
    const FP = { len: ff.userData.len, rx: 0.19, rz: 0.18, prof: profEll(0.3, 0.02) };
    const cut = 0.42 + rng() * 0.16;
    plate(ff, FP, { u0: 0.05, u1: cut - 0.02, p0: 0, p1: TAU, nu: 18, nv: 14, th: 0.04, edges: rng() < 0.5 ? { u1: 'm' } : {} });
    plate(ff, FP, { u0: cut + 0.02, u1: 0.93, p0: 0.45, p1: TAU - 0.45, nu: 18, nv: 14, th: 0.04 });
    for (let i = 0; i < 3; i++) { const sc = mesh(G.screw, M.steel, ff); sc.position.copy(segPt(FP, 0.2 + i * 0.25, Math.PI * 0.7, 1.02)); sc.quaternion.setFromUnitVectors(Y_AXIS, segNrm(FP, Math.PI * 0.7)); }
    const femurParts=grp.children.slice(1);
    const support=new THREE.Group(), offset=new THREE.Group();
    support.position.copy(knee); offset.position.copy(knee).negate();
    grp.add(support); support.add(offset);
    femurParts.forEach(m=>offset.add(m));
    anim.push(()=>{support.rotation.x=.035*life.weight+.024*arm(Math.sign(base.z)).lift*Math.sign(base.z);});
    const kc = mesh(G.sphere, M.shell, grp); kc.position.copy(knee); kc.scale.setScalar(0.15);
    regTrain('caps', cap(grp, knee, V3(0, 0, 1), 0.16, 0.34), V3(0, 0, Math.sign(base.z)), 0.35);
    const shinStart=grp.children.length;
    mk(knee, mid, 0.05, M.legMetal);
    mk(knee.clone().lerp(mid, 0.06), knee.clone().lerp(mid, 0.92), 0.07, M.legMetal);
    mk(knee.clone().lerp(mid, 0.06), knee.clone().lerp(mid, 0.12), 0.08, M.steel);
    const mj = mesh(G.sphere, M.steel, grp); mj.position.copy(mid); mj.scale.setScalar(0.075);
    mk(mid, ankle, 0.04, M.legMetal);
    for (const k of [0.3, 0.7]) mk(mid.clone().lerp(ankle, k), mid.clone().lerp(ankle, k + 0.04), 0.065, M.steel);
    const toesStart=grp.children.length;
    const tp = [ankle, ankle.clone().lerp(foot, 0.4).add(V3(0, 0.05, 0)), ankle.clone().lerp(foot, 0.75).add(V3(0, 0.02, 0)), foot];
    for (let i = 0; i < 3; i++) { mk(tp[i], tp[i + 1], 0.036 - i * 0.007, M.legMetal); const j = mesh(G.sphere, M.steel, grp); j.position.copy(tp[i + 1]); j.scale.setScalar(0.04 - i * 0.006); }
    const fwd = foot.clone().sub(ankle).setY(0).normalize();
    for (const sd of [-1, 1]) {
      const side = V3(-fwd.z, 0, fwd.x).multiplyScalar(sd * 0.5);
      spine(grp, foot, fwd.clone().add(side).add(V3(0, -0.35, 0)), 0.17, 0.02, M.legMetal);
    }
    const sole=mesh(G.sphere,M.rubber,grp);
    sole.position.copy(foot).addScaledVector(fwd,-.05); sole.position.y=.034;
    sole.scale.set(.125,.034,.081);
    for (let j=0;j<3;j++){
      const shoe=mesh(G.sphere,j===2?M.graphite:M.shell,grp);
      shoe.position.copy(tp[j]).lerp(tp[j+1],.5);
      shoe.scale.set(.072,.132-.021*j,.065);
      shoe.quaternion.setFromUnitVectors(Y_AXIS,tp[j+1].clone().sub(tp[j]).normalize());
    }
    if(name==='legHindR'){
      const lower=grp.children.slice(shinStart,toesStart),toe=grp.children.slice(toesStart);
      const shin=new THREE.Group(),soleJoint=new THREE.Group();
      grp.add(shin);shin.position.copy(knee);
      lower.forEach(m=>{shin.add(m);m.position.sub(knee);});
      shin.add(soleJoint);soleJoint.position.copy(ankle).sub(knee);
      toe.forEach(m=>{soleJoint.add(m);m.position.sub(ankle);});
      anim.push(t=>{
        const rise=THREE.MathUtils.smootherstep(t,.28,.93)-THREE.MathUtils.smootherstep(t,1.24,1.92);
        shin.rotation.z=.16*rise;
        soleJoint.rotation.z=-.38*(THREE.MathUtils.smootherstep(t,.13,.75)-THREE.MathUtils.smootherstep(t,1.16,1.80));
      });
    }

  }
  // lengths (L = 10): hind femur ≈ 2.9 / tibia ≈ 3.5 / tarsus 0.6; knee at the measured height ≈ 3.0; mid legs shorter; every leg its own pose
  walkLeg('legMidR', { base: V3(-0.55, 3.2, 0.55), knee: V3(-1.6, 3.3, 2.8), mid: V3(-2.1, 1.95, 3.5), ankle: V3(-2.7, 0.5, 4.15), foot: V3(-3.15, 0.02, 4.55), seed: 301 });
  walkLeg('legMidL', { base: V3(-0.5, 3.2, -0.55), knee: V3(-1.7, 3.25, -2.75), mid: V3(-2.15, 1.9, -3.45), ankle: V3(-2.7, 0.5, -4.1), foot: V3(-3.1, 0.02, -4.5), seed: 302 });
  walkLeg('legHindR', { base: V3(0.9, 3.05, 0.55), knee: V3(3.2, 3.1, 2.7), mid: V3(3.9, 1.85, 3.4), ankle: V3(4.55, 0.5, 4.0), foot: V3(5.0, 0.02, 4.4), seed: 303 });
  walkLeg('legHindL', { base: V3(0.95, 3.05, -0.55), knee: V3(3.4, 3.0, -2.7), mid: V3(4.15, 1.8, -3.35), ankle: V3(4.9, 0.5, -3.9), foot: V3(5.45, 0.02, -4.35), seed: 304 });

  // ================================================================ ABDOMEN — bulging ellipsoid, max thickness 2.3 = 0.23 L
  // Built from separately movable sub-parts for the film teardown: 7 white bands (with their rivets), 7 bays × 8 glass panes
  // between the bands, 4 ventral plates, 6 coil modules, the tail tip. Every part sits in its own group so pose() can move it.
  {
    const grp = new THREE.Group(); grp.name = 'abdomen'; root.add(grp); parts.abdomen = grp;
    const f = segFrame(V3(1.05, 3.3, 0), V3(5.35, 2.4, 0), V3(0, -1, 0)); grp.add(f);
    // R9: girth -10% in the diameter direction (rx 1.62→1.458, rz 1.28→1.152) per owner review;
    // every sub-part (panes/bands/modules/coils/tracks) derives from P and follows automatically.
    const P = { len: f.userData.len, rx: 1.458, rz: 1.152, prof: profPts([[0, 0.6], [0.08, 0.82], [0.25, 0.96], [0.45, 1.0], [0.62, 0.97], [0.78, 0.84], [0.9, 0.52], [1, 0.15]]) };
    parts.abdFrame = f; parts.abdP = P;
    for(const side of [-1,1]){
      for(let j=0;j<6;j++){
        const u=.095+.12*j;
        const flap=new THREE.Group(); f.add(flap);
        const pc=side*1.08;
        const skin=mesh(surf((x,y,p)=>{
          const phi=pc+(y-.5)*.9;
          const rib=.024*Math.cos(x*Math.PI*8)*Math.sin(Math.PI*y);
          return p.copy(segPt(P,u+x*.085,phi,1.027+rib));
        },32,12),M.rubber,flap);
        skin.material.side=THREE.DoubleSide;
        plate(flap,P,{u0:u+.008,u1:u+.076,p0:pc-.23,p1:pc+.23,inset:1.059,mat:M.shell,nu:5,nv:8});
        anim.push(t=>{
          const pulse=.5-.5*Math.cos((t-j*.095)*2*Math.PI/2.65);
          flap.scale.set(1+.085*pulse,1,1+.115*pulse);
        });
      }
    }
    // Bearing drums run inside the stationary glass and white hoops.
    for(const [u0,u1,direction,speed] of [[.08,.54,1,1.08],[.56,.81,-1,.76]]){
      const rotor=new THREE.Group();f.add(rotor);
      const drumPoint=(u,angle,depth)=>V3(Math.cos(angle)*P.prof(u)*depth,u*P.len,Math.sin(angle)*P.prof(u)*depth);
      const face=(from,to,angle,width,radius,twist,material)=>{
        const geo=surf((u,v,pt)=>pt.copy(drumPoint(from+(to-from)*u,angle+twist*u+width*v,radius)),24,16);
        mesh(geo,material,rotor);
      };
      const casing=M.graphite.clone();casing.side=THREE.DoubleSide;
      const metal=M.steel.clone();metal.side=THREE.DoubleSide;
      const tracer=M.magenta.clone();tracer.side=THREE.DoubleSide;
      for(let j=0;j<5;j++){
        const phase=j*TAU/5,twist=direction*.94;
        face(u0,u1,phase,1.06,1.015,twist,casing);
        face(u0+.009,u1-.009,phase+.08,.39,1.021,twist,metal);
        face(u0+.014,u1-.012,phase+.46,j===0?.17:.075,1.027,twist,tracer);
      }
      anim.push(t=>{rotor.rotation.y=direction*(speed*t+.16*(t-Math.sin(t)));});
    }
    const rng = mulberry32(77);
    gearKey = 'abd';
    plate(f, P, { u0: 0.0, u1: 0.93, p0: 0, p1: TAU, mat: M.core, inset: 0.56 });
    const RING_U = [0.07, 0.19, 0.31, 0.43, 0.55, 0.67, 0.79], RW = 0.012;
    // static glass collars under the two end tracks
    {
      const c0 = new THREE.Group(); f.add(c0); plate(c0, P, { u0: 0.02, u1: RING_U[0] - RW, p0: 0, p1: TAU, mat: M.glass, nu: 4, nv: 40 });
      regTrain('abdCollar', c0, V3(0, -1, 0), 0.5);   // v6: front collar slides toward the head
      const c1 = new THREE.Group(); f.add(c1); plate(c1, P, { u0: 0.858, u1: 0.9, p0: 0, p1: TAU, mat: M.glass, nu: 4, nv: 40 });
      regTrain('abdCollar', c1, Y_AXIS, 0.5);   // v6: rear collar slides toward the tail
    }
    // glass panes: 7 bays (between bands) × 8 sectors; seams at the belly, the back and both flanks
    parts.abdPanes = [];
    const bays = RING_U.map((u, i) => [u + RW, i < 6 ? RING_U[i + 1] - RW : 0.852]);
    bays.forEach(([ua, ub], b) => {
      for (let k = 0; k < 8; k++) {
        const pa = k * TAU / 8 + 0.012, pb = (k + 1) * TAU / 8 - 0.012, pm = (k + 0.5) * TAU / 8, um = (ua + ub) / 2;
        const pivot = segPt(P, um, pm, 1.0);
        const g = new THREE.Group(); g.position.copy(pivot); f.add(g);
        const inner = new THREE.Group(); inner.position.copy(pivot).negate(); g.add(inner);
        plate(inner, P, { u0: ua, u1: ub, p0: pa, p1: pb, mat: M.glass, nu: 6, nv: 8 });
        for (const fr of [0.02, 0.5, 0.98]) { const ph = pa + (pb - pa) * fr; const pts = []; for (let i = 0; i <= 6; i++) pts.push(segPt(P, ua + (ub - ua) * i / 6, ph, 1.004)); mesh(tubeGeo(pts, 0.008), M.steel, inner); }
        g.userData = { kind: 'pane', bay: b, sector: k, pm, um, base: pivot.clone() };
        parts.abdPanes.push(g);
      }
    });
    for (const u of [0.025, 0.875]) { const pts = []; for (let k = 0; k < 24; k++) pts.push(segPt(P, u, k / 24 * TAU, 1.04)); track(f, pts, u < 0.5 ? 40 : 30, (uu, p) => V3(p.x, 0, p.z), true); }
    // back-face-only dark liner: invisible on the near side, a dark wall behind the mechanism on the far side
    plate(f, P, { u0: 0.0, u1: 0.92, p0: 0, p1: TAU, mat: M.liner, inset: 0.95, nu: 40, nv: 32 });
    // white bands, each carrying its own ring of 40 rivets
    parts.abdBands = [];
    RING_U.forEach((u, i) => {
      const bg = new THREE.Group(); f.add(bg); parts.abdBands.push(bg); bg.userData = { kind: 'band', i, u };
      plate(bg, P, { u0: u - RW, u1: u + RW, p0: 0, p1: TAU, inset: 1.02, nu: 4, nv: 48, th: 0.045, inner: M.graphite, mat: M.shellFront, edges: i % 2 === 1 ? { u1: 'm' } : {} });
      const riv = instancer(bg);
      for (let k = 0; k < 40; k++) { const ph = k / 40 * TAU; const p = segPt(P, u, ph, 1.035); riv.add(G.screw, M.steel, new THREE.Matrix4().compose(p, new THREE.Quaternion().setFromUnitVectors(Y_AXIS, segNrm(P, ph)), V3(0.6, 0.6, 0.6))); stats.rivets = (stats.rivets || 0) + 1; }
      for (const k of [7, 27]) { const ph = k / 40 * TAU; dust(bg, segPt(P, u, ph, 1.05), segNrm(P, ph), i * 2 + (k > 20 ? 1 : 0)); }   // two pop-out bolts per band
    });
    // ventral plates (belly side, phi ≈ 0), each its own group pivoting on its own axial line
    parts.abdBelly = [];
    [[0.12, 0.22], [0.29, 0.39], [0.46, 0.56], [0.63, 0.73]].forEach(([a, b], i) => {
      const pivot = segPt(P, (a + b) / 2, 0, 1.02);
      const g = new THREE.Group(); g.position.copy(pivot); f.add(g);
      const inner = new THREE.Group(); inner.position.copy(pivot).negate(); g.add(inner);
      plate(inner, P, { u0: a, u1: b, p0: -0.45, p1: 0.45, inset: 1.02, th: 0.05, nu: 8, nv: 8, inner: M.graphite, mat: M.shellFront });
      g.userData = { kind: 'belly', i, base: pivot.clone() }; parts.abdBelly.push(g);
    });
    const glow = (m) => { m.layers.enable(BLOOM_LAYER); glowMeshes.push(m); return m; };
    // main coils (static helices around the core; they only glow)
    const coilG = new THREE.Group(); f.add(coilG); parts.abdCoils = coilG;
    [[0.1, 0.33], [0.36, 0.58], [0.62, 0.8]].forEach(([a, b]) => {
      const pts = []; const turns = 4.5, n = 200;
      for (let i = 0; i <= n; i++) { const u = a + (b - a) * i / n; pts.push(segPt(P, u, i / n * TAU * turns, 0.64)); }
      glow(mesh(tubeGeo(pts, 0.028, false, 8), M.coil, coilG));
    });
    // coil modules: axisymmetric (spin about their own axis), slide outward along their radial normal when the cage is open
    parts.abdModules = [];
    for (const [ph, u0, u1] of [[1.2, 0.14, 0.4], [1.9, 0.44, 0.7], [-1.3, 0.16, 0.42], [-2.0, 0.46, 0.72], [2.6, 0.2, 0.46], [-2.6, 0.5, 0.74]]) {
      const A = segPt(P, u0, ph, 0.8), B = segPt(P, u1, ph, 0.8);
      const g = new THREE.Group(); g.position.copy(A); const d = B.clone().sub(A); const len = d.length(); g.quaternion.setFromUnitVectors(Y_AXIS, d.normalize()); f.add(g);
      const sp = new THREE.Group(); g.add(sp);
      const fm = mesh(G.cyl, M.graphite, sp); fm.scale.set(0.07, len, 0.07); fm.position.y = len / 2;
      const cp = []; for (let i = 0; i <= 160; i++) { const a = i / 160 * TAU * 9; cp.push(V3(0.095 * Math.cos(a), len * (0.08 + 0.84 * i / 160), 0.095 * Math.sin(a))); }
      const coilM = glow(mesh(tubeGeo(cp, 0.014, false, 5), M.coil, sp));
      const caps = [];
      for (const y of [0.04, 0.96]) { const c = mesh(G.cyl, M.dark, sp); c.scale.set(0.12, 0.05, 0.12); c.position.y = len * y; caps.push([c]); }
      // a small steel index screw on each end cap so the spin reads
      for (const [j, y] of [[0, 0.04], [1, 0.96]]) { const s = mesh(G.screw, M.steel, sp); s.position.set(0.085, len * y, 0); s.rotation.z = Math.PI / 2; s.scale.setScalar(0.9); caps[j].push(s); }
      g.userData = { kind: 'module', ph, um: (u0 + u1) / 2, base: A.clone(), nrm: segNrm(P, ph), R: P.prof((u0 + u1) / 2) * Math.hypot(P.rx * Math.cos(ph), P.rz * Math.sin(ph)), spin: sp, coilM, caps, len };
      parts.abdModules.push(g); stats.big++;
    }
    for (let i = 0; i < 10; i++) {
      const u = 0.1 + i * 0.075, ph = i * 2.1 + 0.5;
      gear(f, segPt(P, u, ph, 0.7), segNrm(P, ph), 0.1 + (i % 3) * 0.04, 12, 0.04, i % 2 ? M.gun : M.dark, (i % 2 ? 1 : -1) * 1.6, i);
    }
    parts.abdLights = [];
    for (const [u, ph] of [[0.2, 0.6], [0.35, 2.2], [0.5, -1.0], [0.65, 1.4], [0.3, -2.4], [0.72, -0.2]]) {
      const l = new THREE.PointLight(0xff2aa8, 0.1, 0.8, 2); l.position.copy(segPt(P, u, ph, 0.72)); f.add(l); parts.abdLights.push(l);
    }
    scatter(f, P, 70, rng, [[0.05, 0.85, 0, TAU]], 0.56, 0.8);
    // fill the dark cavity: a ring of gears on the core surface between the coils
    for (let i = 0; i < 22; i++) {
      const u = 0.08 + (i % 11) * 0.07, ph = i * 1.37 + (i > 10 ? 0.6 : 0);
      gear(f, segPt(P, u, ph, 0.58), segNrm(P, ph), 0.09 + (i % 4) * 0.03, 10 + (i % 3) * 2, 0.035, [M.gun, M.dark, M.graphite][i % 3], (i % 2 ? 1 : -1) * (1 + (i % 3) * 0.5), i);
    }
    const tail = new THREE.Group(); tail.position.copy(segPt(P, 0.9, 0, 0)); f.add(tail);
    tail.userData = { kind: 'tail', base: tail.position.clone() }; parts.abdTail = tail;
    const stages=[];
    // tail stack: each stage is its own group so the teardown can step them along the axis (like an exploded drawing)
    [[0.48, 0.36, 0.2, M.steel], [0.35, 0.22, 0.2, M.chrome], [0.21, 0.11, 0.18, M.steel]].forEach(([r0, r1, hgt, mt], i, arr) => {
      const y0 = arr.slice(0, i).reduce((acc, a) => acc + a[2], 0);
      const sg = new THREE.Group(); tail.add(sg); stages.push(sg);
      const c = mesh(new THREE.CylinderGeometry(r1, r0, hgt, 32), mt, sg); c.position.y = y0 + hgt / 2;
      const gr = mesh(G.torus, M.dark, sg); gr.rotation.x = Math.PI / 2; gr.position.y = y0 + hgt; gr.scale.setScalar(r1 * 1.02);
      regTrain('tail', sg, Y_AXIS, 0.12 + 0.16 * i);
    });
    const sgTip = new THREE.Group(); tail.add(sgTip);
    const tip = mesh(G.cone, M.chrome, sgTip); tip.scale.set(0.11, 0.48, 0.11); tip.position.y = 0.58 + 0.24;
    regTrain('tail', sgTip, Y_AXIS, 0.62);

    // Only the exposed length of each interior shaft is rendered.
    const bridges=[[.353,.349],[.217,.208],[.108,.102]].map(([outer,inner])=>
      mesh(new THREE.CylinderGeometry(inner,outer,1,40),M.steel,tail));
    const glint=new THREE.PointLight(0xe3f1ff,0,1.75,2);tail.add(glint);
    const stroke=(t,a,b,c,d)=>THREE.MathUtils.smootherstep(t,a,b)-THREE.MathUtils.smootherstep(t,c,d);
    anim.push(t=>{
      const mid=.062*stroke(t-1.18,.65,1.32,4.09,4.85);
      const distal=.094*stroke(t-1.18,.87,1.55,3.91,4.57);
      const point=.45*stroke(t-1.18,1.15,1.98,3.44,4.18);
      stages[1].position.y=mid; stages[2].position.y=mid+distal;
      sgTip.position.y=mid+distal+point;
      for(const [i,[start,length]] of [[.20,mid],[.40+mid,distal],[.58+mid+distal,point]].entries()){
        const bridge=bridges[i];bridge.visible=length>.0001;
        bridge.position.y=start+length/2;bridge.scale.y=length+.001;
      }
      const sweep=THREE.MathUtils.smootherstep(t-1.18,1.85,2.61);
      glint.position.set(.24-.35*sweep,sgTip.position.y+.65+.47*sweep,.34);
      glint.intensity=1.25*Math.sin(Math.PI*sweep)**2;
    });
    anim.push((t) => { M.coil.emissiveIntensity = 0.68 + 0.07 * Math.sin(t * 3.1); });
    anim.push(() => { grp.scale.set(1+.007*life.breath,1+.009*life.breath,1+.007*life.breath); });
    gearKey = 'body';
  }

  // ================================================================ WINGS — 0.59 L × 0.11 L, lifted ≈ 10°, milky with pink veins
  {
    const grp = new THREE.Group(); grp.name = 'wings'; root.add(grp); parts.wings = grp;
    const tex = wingTexture(9);
    const rimMat = new THREE.MeshPhysicalMaterial({ color: 0xf2eef4, roughness: 0.2, metalness: 0, clearcoat: 1, transparent: true, opacity: 0.75, depthWrite: false });
    const mat = new THREE.MeshPhysicalMaterial({ color: 0xffffff, map: tex, transparent: true, roughness: 0.38, metalness: 0, clearcoat: 1, clearcoatRoughness: 0.05, iridescence: 0.3, iridescenceIOR: 1.3, side: THREE.DoubleSide, depthWrite: false });
    const LEN = 6.6, WID = 1.38;
    const camber = (x, zz) => -0.3 * (zz / WID) ** 2 + 0.16 * Math.sin(Math.PI * x / LEN) - 0.01 * x;   // arched across and along
    const geo = new THREE.PlaneGeometry(LEN, WID, 64, 10);
    const pa = geo.attributes.position;
    for (let i = 0; i < pa.count; i++) {
      const x = pa.getX(i) + LEN / 2, y = pa.getY(i);
      const zz = y + WID / 2 - 0.12;
      pa.setXYZ(i, x, camber(x, zz), zz);
    }
    geo.computeVertexNormals();
    // outline (matches the texture's leaf shape) as a rounded rim tube → the wing reads as a sheet with an edge
    const outline = [];
    for (let k = 0; k <= 40; k++) { const u = 0.005 + 0.99 * k / 40; const v = 0.1 + 0.08 * Math.sin(Math.PI * u ** 0.8); outline.push(V3(u * LEN, camber(u * LEN, v * WID - 0.12), v * WID - 0.12)); }
    for (let k = 40; k >= 0; k--) { const u = 0.005 + 0.99 * k / 40; const v = 0.1 + 0.86 * Math.sin(Math.PI * u ** 0.75); outline.push(V3(u * LEN, camber(u * LEN, v * WID - 0.12), v * WID - 0.12)); }
    const rimGeo = tubeGeo(outline, 0.016, true, 6);
    for (const s of [1, -1]) {
      const hinge = new THREE.Group(); hinge.position.set(-0.45, 4.62, 0.05 * s); grp.add(hinge);
      const w = new THREE.Group(); hinge.add(w); (parts.wingW = parts.wingW || []).push({ w, s });
      if (s < 0) w.scale.z = -1;
      const m = mesh(geo, mat, w); m.renderOrder = 2;
      const m2 = mesh(geo, mat, w); m2.position.y = -0.022; m2.renderOrder = 2;   // second skin → thickness
      const r = mesh(rimGeo, rimMat, w); r.renderOrder = 3;
      const hp = mesh(G.sphere, M.shell, hinge); hp.scale.set(0.42, 0.09, 0.22); hp.position.set(0.12, 0.02, 0.18 * s);
      regTrain('wingPin', hp, V3(0, 0, s), 0.4);   // v6: hinge pin slides out along the hinge Z
      // body axis slopes ≈ -0.21 rad; wing lifted ≈ 10° above it
      // body axis slopes ≈ -0.21 rad; +0.05 puts the wing ≈ 15° above it
      const bearing=mesh(G.cyl,M.graphite,hinge);
      bearing.rotation.x=Math.PI/2; bearing.position.set(.08,.01,s*.29);bearing.scale.set(.145,.19,.145);
      const fan=new THREE.Group();hinge.add(fan);fan.position.set(.18,-.04,s*.15);
      const span=4.9;
      const fanPoint=(u,v)=>V3(span*u,.085*Math.cos(v*6*Math.PI)*Math.sin(Math.PI*u),
        s*(.06+Math.sin(Math.PI*u**.82)**.8*v*1.38));
      const membrane=new THREE.MeshPhysicalMaterial({color:0xf4c9dc,transparent:true,opacity:.44,side:THREE.DoubleSide,depthWrite:false,roughness:.43});
      mesh(surf((u,v,p)=>p.copy(fanPoint(u,v)),48,24),membrane,fan);
      for(let j=0;j<=6;j++){
        const pts=Array.from({length:25},(_,i)=>fanPoint(i/24,j/6));
        mesh(tubeGeo(pts,j===0?.017:.010),j===0?M.steel:M.shellIn,fan);
      }
      anim.push(t=>{
        const delay=s>0?0:.23;
        const lift=x=>THREE.MathUtils.smootherstep(x,2.14,3.25)-THREE.MathUtils.smootherstep(x,3.87,5.38);
        const open=lift(t-delay);
        w.rotation.set(.24*s,-s*(.05+.23*open),.05+.28*open);
        const follow=lift(t-delay-.19);
        fan.rotation.set(s*.07,-s*(.04+.47*follow),.035+.095*follow);
        fan.scale.z=.36+.68*follow;
      });
    }
  }

  for (const it of instancers) it.finalize();
  root.traverse((o) => { if (o.isMesh) { const tr = o.material.transparent || o.material.transmission > 0; o.castShadow = !tr; o.receiveShadow = !tr; o.userData.clear = tr; } });

  // gc: optional gear clocks { body, abd } (film time warped by how busy the machine is); without it gears run on t
  function update(t, gc, film = false) { life = behavior(t,film); for (const fn of anim) fn(t, gc); }

  // ---- film poses: every value is a pure function of the film state for one moment
  const groupNames = ['head', 'prothorax', 'thorax', 'abdomen', 'wings', 'forelegR', 'forelegL', 'legMidR', 'legMidL', 'legHindR', 'legHindL'];
  const base = {}; for (const n of groupNames) base[n] = parts[n].position.clone();
  const EX = { head: [-2.0, 1.6, 0], prothorax: [-0.9, 1.0, 0], thorax: [0, 0.5, 0], abdomen: [2.4, 0.3, 0], wings: [0.3, 2.6, 0],
    forelegR: [-1.4, -0.1, 2.0], forelegL: [-1.4, -0.1, -2.0], legMidR: [-0.2, -0.2, 1.6], legMidL: [-0.2, -0.2, -1.6], legHindR: [0.9, -0.2, 1.6], legHindL: [0.9, -0.2, -1.6] };
  const OPEN = { head: [-0.55, 0.5, 0.25], forelegR: [0, 0, 0.45], abdomen: [0.3, 0.2, 0] };
  const STRIKE = { forelegR: [-1.0, 0.25, 1.3], forelegL: [-1.0, 0.25, 0.4] };
  function pose(st = {}) {
    const { head = 0, forearm = 0, abdomen = 0, explode = 0, spin = 0, strike = 0, clock = 0 } = st;
    root.rotation.y = spin;
    const amt = { head, forelegR: forearm, abdomen };
    for (const n of groupNames) {
      const p = parts[n].position.copy(base[n]).addScaledVector(V3(...EX[n]), explode);
      if (OPEN[n]) p.addScaledVector(V3(...OPEN[n]), amt[n]);
      if (STRIKE[n]) p.addScaledVector(V3(...STRIKE[n]), strike);
    }
    // head: turn to show the face, eyes pushed out of their sockets
    parts.headPivot.rotation.y += 0.5 * head;
    for (const e of parts.eyes) e.position.copy(e.userData.dir).multiplyScalar(0.28 * head);
    // forearm: the shell opens around the spring (dorsal plate back, glass panes out to the sides)
    for (const [n, k] of [['forelegR', forearm], ['forelegL', 0]]) {
      const g = parts['femurShell_' + n];
      g.dors.position.set(-0.5 * k, 0, 0); g.ven.position.set(0.22 * k, 0, 0); g.gp.position.set(0, 0, 0.55 * k); g.gn.position.set(0, 0, -0.55 * k);
    }
    // strike: the tibiae unfold forward
    parts.tib_forelegR.rotation.z += -1.35 * strike; parts.tib_forelegL.rotation.z += -1.1 * strike;
    poseAbdomen(st.abd || { all: abdomen, glow: abdomen, hold: 0, clock });
  }
  // ---- abdomen teardown. a: per-part raw progress in [0,1] (linear in time; the eases live here so open and close mirror).
  //   a.wings[2], a.belly[4], a.panes[56], a.bands[7], a.modules[6], a.tail, a.glow, a.hold (0..1 through the hold), a.clock
  //   a.all: one value for every part (old film scripts)
  const sm = (x) => { const u = Math.min(1, Math.max(0, x)); return u * u * u * (u * (u * 6 - 15) + 10); };
  const ABD = { paneOut: 0.78, paneFlip: 1.05, bellyDrop: 1.25, bellyFlip: 0.7, bandStep: 0.17, bandGrow: 0.12, moduleOut: 0.16, moduleTelesc: 0.15, tailOut: 0.55, wingLift: 0.6, wingSpread: 0.22 };
  const _q = new THREE.Quaternion(), _v = new THREE.Vector3();
  function poseAbdomen(a) {
    const all = a.all, pick = (arr, i) => (all !== undefined ? all : arr ? arr[i] : 0), clock = a.clock || 0;
    const am = a.amp || {}, BS = am.bandStep || ABD.bandStep, MO_ = am.moduleOut || ABD.moduleOut;
    for (const { w, s } of parts.wingW) { const k = sm(pick(a.wings, s > 0 ? 0 : 1)); w.rotation.z += ABD.wingLift * k; w.rotation.x += ABD.wingSpread * s * k; }
    const P = parts.abdP;
    parts.abdBelly.forEach((g, i) => {
      const x = pick(a.belly, i), k = sm(x), kf = sm((x - 0.15) / 0.85);
      g.position.copy(g.userData.base).addScaledVector(X_AXIS, ABD.bellyDrop * k);
      g.quaternion.setFromAxisAngle(Y_AXIS, (i % 2 ? 1 : -1) * ABD.bellyFlip * kf);
    });
    parts.abdPanes.forEach((g, i) => {
      const ud = g.userData, x = pick(a.panes, i), k = sm(x), kf = sm((x - 0.15) / 0.85);
      // flank panes (seam at phi = ±pi/2, where the hind femur sits) steer away from the seam; the rest go straight out
      const side = ud.sector % 4 === 1 ? -0.42 : ud.sector % 4 === 2 ? 0.42 : 0;
      const dir = segNrm(P, ud.pm + side);
      const out = ABD.paneOut * (0.9 + 0.2 * P.prof(ud.um));
      g.position.copy(ud.base).addScaledVector(dir, out * k);
      const wob = 0.1 * Math.sin(clock * 1.7 + i * 0.9) * sm(a.hold || 0) * k;
      g.quaternion.setFromAxisAngle(Y_AXIS, (ud.sector % 2 ? 1 : -1) * (ABD.paneFlip * (0.85 + 0.3 * ((i * 37) % 11) / 10) * kf + wob));
    });
    parts.abdBands.forEach((g, i) => {
      const k = sm(pick(a.bands, i));
      g.position.set(0, BS * i * k, 0);
      const sc = 1 + ABD.bandGrow * k; g.scale.set(sc, 1, sc);
    });
    parts.abdModules.forEach((g, i) => {
      const ud = g.userData, k = sm(pick(a.modules, i));
      g.position.copy(ud.base).addScaledVector(ud.nrm, MO_ * ud.R * k);
      ud.spin.rotation.y = clock * (i % 2 ? 1.3 : -1.6);
      // the coil telescopes out of its socket: the end caps pull apart along the module axis and the helix stretches with them
      const ext = ABD.moduleTelesc * ud.len * k;
      for (const m of ud.caps[0]) m.position.y = ud.len * 0.04 - ext;
      for (const m of ud.caps[1]) m.position.y = ud.len * 0.96 + ext;
      ud.coilM.scale.y = 1 + (2 * ABD.moduleTelesc) * k;
    });
    { const t = parts.abdTail, k = sm(all !== undefined ? all : a.tail || 0); t.position.copy(t.userData.base).addScaledVector(Y_AXIS, ABD.tailOut * k); t.rotation.y = clock * 0.9; }
    const g = Math.max(0, all !== undefined ? all : a.glow || 0);
    M.coil.emissiveIntensity *= 1 + 0.45 * g;
    for (const l of parts.abdLights) l.intensity = 0.1 + 0.9 * g;
  }
  parts.trains = trains;
  function articulate(t, film=false) {
    // Rotate about the actual shoulder after the film pose, preserving its raise and offsets.
    for (const [i,name] of ['forelegR','forelegL'].entries()) {
      const g=parts[name], a=life.arms[i], pivot=g.userData.pivot;
      if (!film) { g.position.copy(base[name]); g.quaternion.identity(); }
      const before=pivot.clone().applyQuaternion(g.quaternion);
      g.quaternion.multiply(new THREE.Quaternion().setFromEuler(new THREE.Euler(0,a.swivel,a.shoulder,'ZYX')));
      g.position.add(before.sub(pivot.clone().applyQuaternion(g.quaternion)));
    }
    for(const name of ['thorax','prothorax','abdomen','head','wings','forelegR','forelegL']){
      if(!film && !name.startsWith('foreleg')) parts[name].position.copy(base[name]);
      parts[name].position.z += .09*life.weight;
      parts[name].position.y -= .045*Math.abs(life.weight);
    }
    // The neck settles after the eyes. Carry head and shoulders around the same
    // thoracic socket so there is no gap between independently animated groups.
    const socket=V3(-.8,3.78,0);
    const neckQ=new THREE.Quaternion().setFromAxisAngle(Y_AXIS,life.neck);
    for(const name of ['prothorax','head','forelegR','forelegL']){
      const g=parts[name];
      if(name==='head' || name==='prothorax') g.quaternion.identity();
      g.quaternion.premultiply(neckQ);
      g.position.sub(socket).applyQuaternion(neckQ).add(socket);
    }
    shoulderLinks.forEach(refresh=>refresh());
  }
  return { root, update, articulate, pose, stats, parts, M, glowMeshes, trains };
}

function wingTexture(seed) {
  const rng = mulberry32(seed);
  const W = 2048, H = 512;
  const c = document.createElement('canvas'); c.width = W; c.height = H;
  const g = c.getContext('2d');
  const lead = (x) => H - (0.1 * H + Math.sin(Math.PI * Math.min(1, x / W) ** 0.8) * 0.08 * H);
  const trail = (x) => H - (0.1 * H + Math.sin(Math.PI * Math.min(1, x / W) ** 0.75) * 0.86 * H);
  const path = () => { g.beginPath(); g.moveTo(10, lead(10)); for (let x = 10; x <= W - 6; x += 16) g.lineTo(x, lead(x)); for (let x = W - 6; x >= 10; x -= 16) g.lineTo(x, trail(x)); g.closePath(); };
  path(); g.fillStyle = 'rgba(236,234,242,0.6)'; g.fill();
  g.save(); path(); g.clip();
  const gr = g.createLinearGradient(0, 0, W, 0); gr.addColorStop(0, 'rgba(255,255,255,0.35)'); gr.addColorStop(1, 'rgba(255,255,255,0.05)');
  g.fillStyle = gr; g.fillRect(0, 0, W, H);
  const NL = 9, lines = [];
  for (let k = 0; k < NL; k++) {
    const f = k / (NL - 1); const pts = [];
    for (let x = 0; x <= W; x += 32) { const yl = lead(x), yt = trail(x); const ff = Math.min(1, f * (0.25 + 0.75 * Math.min(1, x / (W * 0.35)))); pts.push([x, yl + (yt - yl) * ff + Math.sin(x * 0.004 + k) * 3]); }
    lines.push(pts);
    g.beginPath(); pts.forEach(([x, y], i) => i ? g.lineTo(x, y) : g.moveTo(x, y));
    g.strokeStyle = 'rgba(206,60,160,0.75)'; g.lineWidth = k === 0 ? 4 : 2.2; g.stroke();
  }
  g.strokeStyle = 'rgba(214,90,175,0.55)'; g.lineWidth = 1.5;
  for (let k = 0; k < NL - 1; k++) {
    for (let i = 1; i < lines[k].length - 1; i++) {
      if (rng() < 0.3) continue;
      const a = lines[k][i], b = lines[k + 1][Math.min(lines[k + 1].length - 1, i + (rng() < 0.5 ? 0 : 1))];
      g.beginPath(); g.moveTo(a[0], a[1]); g.lineTo((a[0] + b[0]) / 2 + (rng() - 0.5) * 14, (a[1] + b[1]) / 2); g.lineTo(b[0], b[1]); g.stroke();
    }
  }
  g.restore();
  path(); g.strokeStyle = 'rgba(205,200,212,0.95)'; g.lineWidth = 5; g.stroke();
  const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 8;
  return tex;
}
