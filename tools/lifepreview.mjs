// Alive-model preview clips (v9): drive window.render(t) over a time span at a fixed review shot and encode mp4.
//   node tools/lifepreview.mjs <outDir> <shot> <seconds> [t0] [fps]
// shots: hero / forearm / head / abdomen (web/main.js SHOTS). The arm-life layer (tibia fold + flick, spring
// pump, belt crawl), antenna wave and belly breathe all live in mantis.js and show here; film choreography does not.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import puppeteer from 'puppeteer-core';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const [outDirArg, shot = 'forearm', secs = '8', t0 = '0', fpsArg = '24'] = process.argv.slice(2);
const outDir = path.resolve(outDirArg);
const FPS = Number(fpsArg), SECS = Number(secs), T0 = Number(t0);
const mime = { '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json' };
const server = http.createServer((req, res) => {
  const pathname = decodeURIComponent(new URL(req.url, 'http://local').pathname);
  if (pathname === '/favicon.ico') { res.writeHead(204); return res.end(); }
  const p = path.join(root, pathname);
  const rel = path.relative(root, p);
  if (rel.startsWith('..') || !fs.existsSync(p) || fs.statSync(p).isDirectory()) { res.writeHead(404); return res.end(); }
  res.writeHead(200, { 'Content-Type': mime[path.extname(p)] || 'application/octet-stream' });
  fs.createReadStream(p).pipe(res);
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const frames = path.join(outDir, 'frames');
fs.mkdirSync(frames, { recursive: true });
const browser = await puppeteer.launch({ executablePath: process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true, timeout: 120000, args: ['--no-sandbox', '--disable-gpu-sandbox', '--ignore-gpu-blocklist', '--enable-gpu', '--use-angle=d3d11'] });
try {
  const page = await browser.newPage();
  await page.setViewport({ width: 1600, height: 900, deviceScaleFactor: 1 });
  page.on('pageerror', (e) => console.log('[pageerror]', e.message));
  await page.goto(`http://127.0.0.1:${server.address().port}/web/index.html?shot=${shot}&nodof&t=0`, { waitUntil: 'load', timeout: 120000 });
  await page.waitForFunction('window.__ready === true', { timeout: 180000 });
  const n = Math.round(SECS * FPS), t0ms = Date.now();
  for (let f = 0; f < n; f++) {
    await page.evaluate((tt) => window.render(tt), T0 + f / FPS);
    await (await page.$('canvas')).screenshot({ path: path.join(frames, `f${String(f).padStart(4, '0')}.png`) });
    if (f % 24 === 0) console.log(`frame ${f}/${n}  ${((Date.now() - t0ms) / 1000).toFixed(1)} s`);
  }
  const mp4 = path.join(outDir, `life_${shot}_${SECS}s_${FPS}fps.mp4`);
  execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-framerate', String(FPS), '-i', path.join(frames, 'f%04d.png'), '-c:v', 'libx264', '-crf', '17', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', mp4]);
  console.log('wrote', mp4);
} finally { await browser.close(); server.close(); }
