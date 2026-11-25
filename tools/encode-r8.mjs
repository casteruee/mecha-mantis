import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import puppeteer from 'puppeteer-core';
const root=process.cwd();
const server=http.createServer((req,res)=>{
 const rel=decodeURIComponent(new URL(req.url,'http://x').pathname).slice(1);
 if(!rel){res.setHeader('Content-Type','text/html');res.end('<canvas id="c" width="1280" height="720"></canvas>');return;}
 const p=path.resolve(root,rel);
 if(path.relative(root,p).startsWith('..')||!fs.existsSync(p)){res.writeHead(404);res.end();return;}
 res.setHeader('Content-Type',p.endsWith('.wav')?'audio/wav':'image/png');fs.createReadStream(p).pipe(res);
});
await new Promise(r=>server.listen(0,'127.0.0.1',r));
const browser=await puppeteer.launch({executablePath: process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true,args:['--no-sandbox','--disable-gpu-sandbox','--autoplay-policy=no-user-gesture-required','--use-angle=d3d11']});
try{
 const page=await browser.newPage();
 await page.goto(`http://127.0.0.1:${server.address().port}`);
 const result=await page.evaluate(async()=>{
  const canvas=document.querySelector('canvas'),ctx=canvas.getContext('2d');
  const ac=new AudioContext();await ac.resume();
  const audio=await ac.decodeAudioData(await (await fetch('/rounds/film_v1/score.wav')).arrayBuffer());
  const source=ac.createBufferSource();source.buffer=audio;
  const dest=ac.createMediaStreamDestination();source.connect(dest);
  const stream=canvas.captureStream(30);dest.stream.getAudioTracks().forEach(t=>stream.addTrack(t));
  const mime=['video/webm;codecs=vp9,opus','video/webm;codecs=vp8,opus'].find(t=>MediaRecorder.isTypeSupported(t));
  const rec=new MediaRecorder(stream,{mimeType:mime,videoBitsPerSecond:8000000,audioBitsPerSecond:192000});
  const chunks=[];rec.ondataavailable=e=>chunks.push(e.data);
  const done=new Promise(r=>rec.onstop=r);
  const load=async i=>createImageBitmap(await (await fetch(`/rounds/r8_video/frames/f${String(i).padStart(4,'0')}.png`)).blob());
  const pending=new Map();for(let i=0;i<8;i++)pending.set(i,load(i));
  let late=0;const first=await pending.get(0);ctx.drawImage(first,0,0);first.close();pending.delete(0);
  rec.start();source.start();const start=performance.now();
  for(let i=1;i<360;i++){
   if(i+7<360)pending.set(i+7,load(i+7));
   const im=await pending.get(i);pending.delete(i);
   const delay=start+i*1000/30-performance.now();if(delay>0)await new Promise(r=>setTimeout(r,delay));else if(delay < -34)late++;
   ctx.drawImage(im,0,0);im.close();
  }
  await new Promise(r=>setTimeout(r,Math.max(0,start+12000-performance.now())));
  rec.stop();source.stop();await done;await ac.close();
  const blob=new Blob(chunks,{type:mime});
  const data=await new Promise(r=>{const reader=new FileReader();reader.onload=()=>r(reader.result.split(',')[1]);reader.readAsDataURL(blob);});
  return {data,mime,late,durationMs:performance.now()-start};
 });
 fs.writeFileSync('rounds/r8_video/ORCHIS-R8-preview.webm',Buffer.from(result.data,'base64'));
 delete result.data;fs.writeFileSync('rounds/r8_video/encode-check.json',JSON.stringify(result,null,2));console.log(result);
}finally{await browser.close();server.close();}
