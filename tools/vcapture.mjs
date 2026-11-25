// Vertical film capture. render(t) is a pure function of time, so every frame is rendered by calling window.renderFrame(t).
//   node tools/vcapture.mjs film <outDir> [script.json]                 all frames at the preview size → frames/ + mp4
//   node tools/vcapture.mjs stills <outDir> <t1,t2,...> [--full] [--q "extra=query"]   page screenshots (--full = script size)
//   node tools/vcapture.mjs mask <outDir> <t1,t2,...> [--q ...]        white-on-black silhouettes (for framing measurements)
//   node tools/vcapture.mjs eval <script.js> [--q ...]                  run a script in the page (window.__check etc.), print JSON
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import puppeteer from 'puppeteer-core';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const [mode, a1, a2] = process.argv.slice(2);
const flag = (k) => process.argv.includes(k);
const opt = (k) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : null; };
const scriptRel = (mode === 'film' && a2 && !a2.startsWith('--')) ? a2 : (opt('--script') || 'film/landscape.json');
const script = JSON.parse(fs.readFileSync(path.join(root, scriptRel), 'utf-8'));
const full = flag('--full');
const [W, H] = full ? script.size : script.preview;
const FPS = script.fps;

const mime = { '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json' };
const server = http.createServer((req, res) => {
  const p = path.join(root, decodeURIComponent(new URL(req.url, 'http://x').pathname));
  if (!p.startsWith(root) || !fs.existsSync(p) || fs.statSync(p).isDirectory()) { res.writeHead(404); return res.end(); }
  res.writeHead(200, { 'Content-Type': mime[path.extname(p)] || 'application/octet-stream' }); fs.createReadStream(p).pipe(res);
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const browser = await puppeteer.launch({ executablePath: process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true, timeout:120000, args: ['--no-sandbox', '--disable-gpu-sandbox', '--ignore-gpu-blocklist', '--enable-gpu', '--use-angle=d3d11'] });
try {
  const page = await browser.newPage();
  await page.setViewport({ width: W, height: H, deviceScaleFactor: 1 });
  page.on('pageerror', (e) => console.log('[pageerror]', e.message));
  page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') console.log('[page]', m.text()); });
  const extra = (opt('--q') ? '&' + opt('--q') : '') + (full ? '&res=full' : '') + (mode === 'mask' ? '&mask' : '');
  await page.goto(`http://127.0.0.1:${server.address().port}/web/landscape.html?script=../${scriptRel}${extra}`);
  await page.waitForFunction('window.__ready === true', { timeout: 180000 });
  if (mode === 'film') {
    const outDir = path.resolve(a1); const frames = path.join(outDir, 'frames'); fs.mkdirSync(frames, { recursive: true });
    const n = Math.round(script.duration * FPS), t0 = Date.now();
    for (let f = 0; f < n; f++) {
      await page.evaluate((tt) => window.renderFrame(tt), f / FPS);
      await page.screenshot({ path: path.join(frames, `f${String(f).padStart(4, '0')}.png`) });
      if (f % 30 === 0) console.log(`frame ${f}/${n}  ${((Date.now() - t0) / 1000).toFixed(1)} s`);
    }
    const mp4 = path.join(outDir, `${opt('--name') || 'beat'}_${W}x${H}_${FPS}fps.mp4`);
    execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-framerate', String(FPS), '-i', path.join(frames, 'f%04d.png'), '-c:v', 'libx264', '-crf', '17', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', mp4]);
    console.log('wrote', mp4);
  } else if (mode === 'stills' || mode === 'mask') {
    const outDir = path.resolve(a1); fs.mkdirSync(outDir, { recursive: true });
    for (const t of a2.split(',').map(Number)) {
      await page.evaluate((tt) => window.renderFrame(tt), t);
      const p = path.join(outDir, `${mode === 'mask' ? 'mask' : 'still'}_${t.toFixed(2)}s_${W}x${H}.png`);
      await page.screenshot({ path: p });
      console.log('wrote', p, JSON.stringify(await page.evaluate(() => window.__state)));
    }
  } else if (mode === 'eval') {
    const code = fs.readFileSync(path.resolve(a1), 'utf-8');
    const out = await page.evaluate(`(async () => { ${code} })()`);
    console.log(JSON.stringify(out, null, 1));
  }
} finally {
  await browser.close(); server.close();
}
