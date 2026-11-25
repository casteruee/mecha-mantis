// Reset precision probe: at main-film 8.55 s (abs 13.05) every train item must be exactly back at its
// rest transform and the explode amount must read 0. Run: node tools/vcapture.mjs eval tools/resetprobe.js --script film/landscape_v6.json
const M = window.__mantis;
const T = window.__script.acts.find((a) => a.act === 'release').t;   // probe at the reassembly handoff
window.renderFrame(T);
let maxPos = 0, worstPos = '', maxRot = 0, worstRot = '';
for (const [name, list] of Object.entries(M.parts.trains)) {
  list.forEach((it, i) => {
    const d = it.g.position.distanceTo(it.base);
    if (d > maxPos) { maxPos = d; worstPos = `${name}[${i}]`; }
    const qd = it.g.quaternion.angleTo(it.baseQ);
    if (qd > maxRot) { maxRot = qd; worstRot = `${name}[${i}]`; }
  });
}
const groupBase = {};
for (const g of ['head', 'prothorax', 'thorax', 'abdomen', 'wings', 'forelegR', 'forelegL', 'legMidR', 'legMidL', 'legHindR', 'legHindL']) {
  groupBase[g] = M.parts[g].position.toArray().map((v) => +v.toFixed(4));
}
const st = window.__state;
return {
  maxPosDiff: +maxPos.toFixed(6), worstPos,
  maxRotDiff: +maxRot.toFixed(6), worstRot,
  ex: st.ex, apart: st.apart, glow: +st.glow.toFixed(4), spin: +st.spin.toFixed(4),
  groupBase,
};
