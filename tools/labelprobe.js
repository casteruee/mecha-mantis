const out = [];
const m = window.__mantis, T = window.__THREE;
window.renderFrame(11.2);
const cam = window.__camera;
const scr = (v) => { const p = v.clone().project(cam); return [Math.round((p.x * 0.5 + 0.5) * 1920), Math.round((-p.y * 0.5 + 0.5) * 1080)]; };
const w = (p) => p.getWorldPosition(new T.Vector3());
out.push({
  staticGearsAnchor: scr(new T.Vector3(0.3, 4.15, 0.95).applyAxisAngle(new T.Vector3(0, 1, 0), window.__spin || 0).add(m.root.position)),
  gearItems: (m.parts.trains.gears || []).map((it) => scr(w(it.g))),
  dustN: (m.parts.trains.dust || []).length,
  dustSample: (m.parts.trains.dust || []).slice(0, 4).map((it) => scr(w(it.g))),
  counts: Object.fromEntries(Object.entries(m.parts.trains).map(([k, v]) => [k, v.length])),
  drawn: [...Array(7)].map((_, i) => { const c = document.getElementById('lc' + i); return c.getAttribute('opacity') === '1' ? [Math.round(+c.getAttribute('cx')), Math.round(+c.getAttribute('cy'))] : null; }),
});
return out;
