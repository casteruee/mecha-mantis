// Frame-by-frame film capture: node tools/capture.mjs <outDir> [script.json] [--stills t1,t2,...]
// Calls window.renderFrame(t) for every frame (render(t) is a pure function of time), screenshots the whole page
// (3D + UI), then encodes an mp4 with ffmpeg. No audio.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import puppeteer from 'puppeteer-core';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const outDir = path.resolve(process.argv[2] || 'rounds/film_v0');
const scriptRel = process.argv[3] && !process.argv[3].startsWith('--') ? process.argv[3] : 'film/short.json';
const stillsArg = process.argv.indexOf('--stills');
const script = JSON.parse(fs.readFileSync(path.join(root, scriptRel), 'utf-8'));
const [W, H] = script.size, FPS = script.fps;

const mime = { '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json' };
const server = http.createServer((req, res) => {
  const p = path.join(root, decodeURIComponent(new URL(req.url, 'http://x').pathname));
  if (!p.startsWith(root) || !fs.existsSync(p) || fs.statSync(p).isDirectory()) { res.writeHead(404); return res.end(); }
  res.writeHead(200, { 'Content-Type': mime[path.extname(p)] || 'application/octet-stream' }); fs.createReadStream(p).pipe(res);
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const browser = await puppeteer.launch({ executablePath: process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true, args: ['--ignore-gpu-blocklist', '--enable-gpu', '--use-angle=d3d11'] });
try {
  const page = await browser.newPage();
  await page.setViewport({ width: W, height: H, deviceScaleFactor: 1 });
  page.on('pageerror', (e) => console.log('[pageerror]', e.message));
  await page.goto(`http://127.0.0.1:${server.address().port}/web/film.html?script=../${scriptRel}`);
  await page.waitForFunction('window.__ready === true', { timeout: 180000 });
  fs.mkdirSync(outDir, { recursive: true });
  if (stillsArg > 0) {
    for (const t of process.argv[stillsArg + 1].split(',').map(Number)) {
      await page.evaluate((tt) => window.renderFrame(tt), t);
      await page.screenshot({ path: path.join(outDir, `still_${t.toFixed(2)}.png`) });
    }
  } else {
    const frames = path.join(outDir, 'frames'); fs.mkdirSync(frames, { recursive: true });
    const n = Math.round(script.duration * FPS);
    const t0 = Date.now();
    for (let f = 0; f < n; f++) {
      await page.evaluate((tt) => window.renderFrame(tt), f / FPS);
      await page.screenshot({ path: path.join(frames, `f${String(f).padStart(4, '0')}.png`) });
      if (f % 60 === 0) console.log(`frame ${f}/${n}  ${((Date.now() - t0) / 1000).toFixed(1)} s`);
    }
    const mp4 = path.join(outDir, 'mantis_short_v0_1280x720_30fps.mp4');
    execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-framerate', String(FPS), '-i', path.join(frames, 'f%04d.png'), '-c:v', 'libx264', '-crf', '18', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', mp4]);
    console.log('wrote', mp4);
  }
} finally {
  await browser.close(); server.close();
}
