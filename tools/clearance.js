// Clipping check for the abdomen teardown, run inside web/vertical.html via: node tools/vcapture.mjs eval tools/clearance.js
// Every moving sub-part (pane, belly plate, band, coil module, tail, wing) is sampled as points (triangle vertices +
// centroids + edge midpoints, world space). Every other mesh near the abdomen is sampled the same way into a spatial hash.
// A contact = a moving-part point closer than EPS to a point of a different part. Pairs already touching in the closed
// pose (t = REST) are allowed only if they do not get worse (point count ≤ 1.3 × rest + 4). Instanced small parts are skipped.
const THREE = window.__THREE, M = window.__mantis, parts = M.parts;
const EPS = 0.022, CELL = 0.05, REST = 2.45;
const movers = [];
const tag = (obj, id) => obj.traverse((o) => { if (o.isMesh && !o.isInstancedMesh) o.userData.__owner = id; });
parts.abdPanes.forEach((g, i) => { tag(g, 'pane' + i); movers.push(['pane' + i, g]); });
parts.abdBelly.forEach((g, i) => { tag(g, 'belly' + i); movers.push(['belly' + i, g]); });
parts.abdBands.forEach((g, i) => { tag(g, 'band' + i); movers.push(['band' + i, g]); });
parts.abdModules.forEach((g, i) => { tag(g, 'module' + i); movers.push(['module' + i, g]); });
tag(parts.abdTail, 'tail'); movers.push(['tail', parts.abdTail]);
parts.wingW.forEach(({ w, s }) => { tag(w, 'wing' + (s > 0 ? 'R' : 'L')); movers.push(['wing' + (s > 0 ? 'R' : 'L'), w]); });
const statics = [parts.abdomen, parts.thorax, parts.legHindR, parts.legHindL, parts.legMidR, parts.legMidL, parts.wings];
const V = new THREE.Vector3(), A = new THREE.Vector3(), B = new THREE.Vector3(), C = new THREE.Vector3();
function samples(mesh, out) {
  const g = mesh.geometry, pos = g.attributes.position, idx = g.index, mw = mesh.matrixWorld;
  const n = idx ? idx.count : pos.count;
  const step = n > 30000 ? 6 : 3;   // very dense meshes: every other triangle
  for (let i = 0; i < n; i += step) {
    const ia = idx ? idx.getX(i) : i, ib = idx ? idx.getX(i + 1) : i + 1, ic = idx ? idx.getX(i + 2) : i + 2;
    A.fromBufferAttribute(pos, ia).applyMatrix4(mw); B.fromBufferAttribute(pos, ib).applyMatrix4(mw); C.fromBufferAttribute(pos, ic).applyMatrix4(mw);
    out.push(A.x, A.y, A.z, (A.x + B.x + C.x) / 3, (A.y + B.y + C.y) / 3, (A.z + B.z + C.z) / 3, (A.x + B.x) / 2, (A.y + B.y) / 2, (A.z + B.z) / 2, (B.x + C.x) / 2, (B.y + C.y) / 2, (B.z + C.z) / 2);
  }
}
function contactsAt(t) {
  window.renderFrame(t); M.root.updateMatrixWorld(true);
  const grid = new Map(); const key = (x, y, z) => `${Math.floor(x / CELL)},${Math.floor(y / CELL)},${Math.floor(z / CELL)}`;
  const seen = new Set();
  for (const s of statics) s.traverse((o) => {
    if (!o.isMesh || o.isInstancedMesh || !o.visible || seen.has(o)) return; seen.add(o);
    const own = o.userData.__owner || 'static:' + (o.parent?.name || '') + o.id;
    const pts = []; samples(o, pts);
    for (let i = 0; i < pts.length; i += 3) { const k = key(pts[i], pts[i + 1], pts[i + 2]); let c = grid.get(k); if (!c) grid.set(k, (c = [])); c.push(pts[i], pts[i + 1], pts[i + 2], own); }
  });
  const res = new Map();
  for (const [id, g] of movers) {
    const pts = []; g.traverse((o) => { if (o.isMesh && !o.isInstancedMesh) samples(o, pts); });
    for (let i = 0; i < pts.length; i += 3) {
      const x = pts[i], y = pts[i + 1], z = pts[i + 2], cx = Math.floor(x / CELL), cy = Math.floor(y / CELL), cz = Math.floor(z / CELL);
      for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) for (let dz = -1; dz <= 1; dz++) {
        const c = grid.get(`${cx + dx},${cy + dy},${cz + dz}`); if (!c) continue;
        for (let j = 0; j < c.length; j += 4) {
          if (c[j + 3] === id) continue;
          const ex = c[j] - x, ey = c[j + 1] - y, ez = c[j + 2] - z;
          if (ex * ex + ey * ey + ez * ez < EPS * EPS) { const pk = id < c[j + 3] ? id + '|' + c[j + 3] : c[j + 3] + '|' + id; res.set(pk, (res.get(pk) || 0) + 1); }
        }
      }
    }
  }
  return res;
}
const rest = contactsAt(REST);
const fps = window.__script.fps, [t0, t1] = [2.45, window.__script.duration];
const bad = new Map();
const times = []; for (let f = Math.round(t0 * fps); f <= Math.round(t1 * fps); f++) times.push(f / fps);
for (const t of times) {
  const c = contactsAt(t);
  for (const [pk, n] of c) {
    const r = rest.get(pk) || 0;
    if (n > 1.3 * r + 4) { const b = bad.get(pk) || { first: t, last: t, worst: 0, rest: r }; b.last = t; if (n > b.worst) { b.worst = n; b.at = t; } bad.set(pk, b); }
  }
}
// closed again at the end: every mover (wings excepted: their rest pose includes the slow flutter) back at its local rest transform?
const local = () => movers.filter(([id]) => !id.startsWith('wing')).map(([id, g]) => { g.updateMatrix(); return [id, g.matrix.elements.slice()]; });
window.renderFrame(t1); const endPos = local();
window.renderFrame(1.0); const restPos = local();
let maxDev = 0, maxId = '';
restPos.forEach(([id, e], i) => { for (let k = 0; k < 16; k++) { const d = Math.abs(e[k] - endPos[i][1][k]); if (d > maxDev) { maxDev = d; maxId = id; } } });
return { frames: times.length, restPairs: rest.size, problems: [...bad].sort((a, b) => b[1].worst - a[1].worst).slice(0, 40).map(([k, v]) => ({ pair: k, ...v })), problemCount: bad.size, returnMaxMatrixDiff: maxDev, returnWorst: maxId };
