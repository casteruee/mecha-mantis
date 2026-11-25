// Camera clearance probe for the v7 FPV flythrough, run inside web/landscape.html via:
//   node tools/vcapture.mjs eval tools/campath.js --script film/landscape_v7.json
// Samples the teardown path every 0.1 s (main-film 5.0-8.6) and measures the distance from the camera
// point to every model mesh's world bounding box (mesh-level: thin parts like wing skins and leg rods
// must not inflate into group-sized false boxes). Instanced small parts are skipped (like clearance.js).
// Red line: >= 0.35 units. FPV pass runs 6.9-7.45 at 3.8-6 units from the swept target.
const THREE = window.__THREE, M = window.__mantis;
const T0 = 4.0, T1 = 8.5, DT = 0.1, MIN = 0.35;
const items = [];
M.root.traverse((o) => {
  if (o.isMesh && !o.isInstancedMesh && o.visible) {
    let name = o.name || '', p = o.parent;
    while (p && p !== M.root) { if (p.name) { name = p.name + '/' + name; break; } p = p.parent; }
    items.push({ id: name || ('mesh' + o.id), obj: o });
  }
});
const cam = window.__camera;
const violations = [];
let globalMin = { dist: Infinity, at: 0, id: '' };
const perItemMin = new Map();
const perSample = [];
for (let t = T0; t <= T1 + 1e-9; t += DT) {
  window.renderFrame(4.5 + t);
  const cp = cam.position.clone();
  let frameMin = { dist: Infinity, id: '' };
  for (const it of items) {
    const b = new THREE.Box3().setFromObject(it.obj);
    const d = b.distanceToPoint(cp);
    const prev = perItemMin.get(it.id);
    if (!prev || d < prev.dist) perItemMin.set(it.id, { dist: d, at: t });
    if (d < frameMin.dist) frameMin = { dist: d, id: it.id };
    if (d < globalMin.dist) globalMin = { dist: d, at: t, id: it.id };
    if (d < MIN) violations.push({ t: +t.toFixed(2), id: it.id, dist: +d.toFixed(3) });
  }
  perSample.push({ t: +t.toFixed(2), cam: cp.toArray().map((v) => +v.toFixed(2)), min: +frameMin.dist.toFixed(3), id: frameMin.id });
}
return {
  meshes: items.length, samples: perSample.length,
  violations: violations.slice(0, 80), violationCount: violations.length,
  globalMin: { dist: +globalMin.dist.toFixed(3), at: +globalMin.at.toFixed(2), id: globalMin.id },
  tightest: [...perItemMin].sort((a, b) => a[1].dist - b[1].dist).slice(0, 20).map(([id, v]) => ({ id, dist: +v.dist.toFixed(3), at: +v.at.toFixed(2) })),
  perSample,
};
