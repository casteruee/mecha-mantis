// Side-by-side comparison sheet (each tile 900px wide = the "thumbnail" density check).
// node tools/sheet.mjs out.png "img|label" "img|label" ...   (first image = reference)
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import puppeteer from 'puppeteer-core';

const [out, ...items] = process.argv.slice(2);
const list = items.map((s) => { const [p, label] = s.split('|'); return { p: path.resolve(p), label }; });
const m = JSON.parse(execFileSync('python', ['-I', 'tools/measure.py', 'json', ...list.map((x) => x.p)], { encoding: 'utf-8' }));
const ref = m[list[0].p];
const tiles = list.map(({ p, label }) => {
  const d = m[p]; const s = 900 / d.W; const [x0, y0, x1, y1] = d.box.map((v) => v * s);
  const b64 = fs.readFileSync(p).toString('base64');
  const isRef = p === list[0].p;
  const ok = (v, r, hi) => isRef ? '' : (hi ? (v <= r ? '<b style="color:#1a7f37">✓</b>' : '<b style="color:#c62828">✗</b>') : (v >= 0.8 * r ? '<b style="color:#1a7f37">✓</b>' : '<b style="color:#c62828">✗</b>'));
  return `<div class="t"><div class="h">${label}</div>
  <div class="m">外框 ${d.wfrac.toFixed(2)}×${d.hfrac.toFixed(2)} · 身体暗像素 ${d.dark_body.toFixed(3)} (${(d.dark_body / ref.dark_body).toFixed(2)}×) ${ok(d.dark_body, ref.dark_body)} · 边缘密度 ${d.edge.toFixed(3)} (${(d.edge / ref.edge).toFixed(2)}×) ${ok(d.edge, ref.edge)} · 最大纯黑块 ${(d.blob * 100).toFixed(2)}% ${ok(d.blob, 0.005, true)}</div>
  <div class="i"><img src="data:image/png;base64,${b64}"><div class="bx" style="left:${x0}px;top:${y0}px;width:${x1 - x0}px;height:${y1 - y0}px"></div></div></div>`;
});
const html = `<!doctype html><meta charset="utf-8"><style>
body{margin:0;background:#c8c8cd;font:15px "Microsoft YaHei","SimHei",sans-serif;display:flex;gap:10px;width:max-content}
.t{background:#fff;width:900px}.h{font-size:20px;font-weight:600;padding:8px 10px 2px}.m{padding:0 10px 8px;color:#444}
.i{position:relative;line-height:0}.i img{width:900px}.bx{position:absolute;border:1px solid #00aaff}
</style>${tiles.join('')}`;
const browser = await puppeteer.launch({ executablePath: process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true });
const page = await browser.newPage();
await page.setViewport({ width: 920 * list.length, height: 600 });
await page.setContent(html, { waitUntil: 'load' });
const body = await page.$('body');
await body.screenshot({ path: out });
await browser.close();
for (const { p, label } of list) console.log(label, JSON.stringify({ w: +m[p].wfrac.toFixed(3), h: +m[p].hfrac.toFixed(3), dark_body: +m[p].dark_body.toFixed(4), edge: +m[p].edge.toFixed(4), blob: +m[p].blob.toFixed(4), masked: m[p].masked }));
console.log('wrote', out);
