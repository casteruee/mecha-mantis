// Reproduce the fixed R8 review views. All images use the same model and t=0.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import puppeteer from 'puppeteer-core';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const out=path.join(root,process.argv[2]||'rounds/r8');   // review target dir (default keeps the R8 reproduction command)
const tasks=[
 ['still','t=0'],['front','shot=front&t=0&nodof'],
 ['macro_head','shot=head&t=0&nodof'],['head_front','shot=headFront&t=0&nodof'],
 ['head_side','shot=headSide&t=0&nodof'],['head_clay','shot=head&t=0&nodof&clay&nobloom'],
 ['macro_forearm','shot=forearm&t=0&nodof'],['macro_abdomen','shot=abdomen&t=0&nodof']
];
const server=http.createServer((req,res)=>{
 const pathname=decodeURIComponent(new URL(req.url,'http://local').pathname);
 if(pathname==='/favicon.ico'){res.writeHead(204);res.end();return;}
 const p=path.join(root,pathname);const rel=path.relative(root,p);
 if(rel.startsWith('..')||!fs.existsSync(p)||fs.statSync(p).isDirectory()){res.writeHead(404);res.end();return;}
 res.writeHead(200,{'Content-Type':({'.html':'text/html','.js':'application/javascript','.json':'application/json','.png':'image/png'})[path.extname(p)]||'application/octet-stream'});fs.createReadStream(p).pipe(res);
});
await new Promise(r=>server.listen(0,'127.0.0.1',r));
let browser;const results=[];
try {
 browser=await puppeteer.launch({executablePath: process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true,timeout:120000,userDataDir:path.join(out,'work/review-profile'),args:['--no-sandbox','--disable-gpu-sandbox','--ignore-gpu-blocklist','--enable-gpu','--use-angle=d3d11','--enable-unsafe-swiftshader']});
 for(const [name,query] of tasks){
  const page=await browser.newPage();await page.setViewport({width:1600,height:900,deviceScaleFactor:1});
  const errors=[];page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
  await page.goto(`http://127.0.0.1:${server.address().port}/web/index.html?${query}`,{waitUntil:'load',timeout:120000});
  await page.waitForFunction('window.__ready===true',{timeout:180000});
  const check=await page.evaluate(()=>{
   let meshes=0,bad=0,vertices=0;window.__root.traverse(o=>{if(!o.isMesh)return;meshes++;const a=o.geometry.attributes.position;vertices+=a.count;for(const n of a.array)if(!Number.isFinite(n))bad++;});
   const c=window.__camera;return {meshes,vertices,nonFinitePositions:bad,camera:{position:c.position.toArray(),quaternion:c.quaternion.toArray(),fov:c.fov},stats:window.__stats};
  });
  await (await page.$('canvas')).screenshot({path:path.join(out,name+'.png')});
  results.push({name,query,errors,...check});console.log(JSON.stringify({name,errors,nonFinitePositions:check.nonFinitePositions}));
  await page.close();
 }
 fs.writeFileSync(path.join(out,'render-checks.json'),JSON.stringify(results,null,2));
 if(results.some(x=>x.errors.length||x.nonFinitePositions))process.exitCode=1;
} finally {if(browser)await browser.close();server.close();}
