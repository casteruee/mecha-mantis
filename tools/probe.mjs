import puppeteer from 'puppeteer-core'; import http from 'node:http'; import fs from 'node:fs'; import path from 'node:path';
const root = process.cwd();
const server = http.createServer((req,res)=>{const p=path.join(root,decodeURIComponent(new URL(req.url,'http://x').pathname)); if(!fs.existsSync(p)||fs.statSync(p).isDirectory()){res.writeHead(404);return res.end();} res.writeHead(200,{'Content-Type':p.endsWith('.js')?'text/javascript':'text/html'}); fs.createReadStream(p).pipe(res);});
await new Promise(r=>server.listen(0,'127.0.0.1',r));
const b = await puppeteer.launch({executablePath: process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true,args:['--ignore-gpu-blocklist','--use-angle=d3d11']});
const pg = await b.newPage(); await pg.setViewport({width:1600,height:900});
await pg.goto(`http://127.0.0.1:${server.address().port}/web/index.html?t=0`); await pg.waitForFunction('window.__ready===true');
console.log(await pg.evaluate(process.argv[2]));
await b.close(); server.close();
