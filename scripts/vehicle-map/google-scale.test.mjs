import {createRequire} from 'node:module';
import {readFile,writeFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
const {chromium}=createRequire(import.meta.url)(process.env.PLAYWRIGHT_MODULE_PATH||'playwright');
const browser=await chromium.launch({channel:'chrome',headless:true});
const p=await browser.newPage({viewport:{width:1440,height:1000}}),base='http://127.0.0.1:53000',report={scope:'Actual Google API, synthetic 200 vehicles. Two animation frames measure interaction response, not complete tile download or physical-device FPS.',results:[],measurements:[]};
await p.route('**/src/vehicle-map/google-map.js*',async r=>r.fulfill({contentType:'text/javascript',body:(await readFile('src/vehicle-map/google-map.js','utf8')).replace('let vehicles = [],','window.__integrationMap=map; let vehicles = [],')}));
try{
 await fetch(base+'/__preview/control?scene=dense200&theme=light&error=0&ttl=3600000');await p.goto(base+'/sledovani-vozidel');await p.waitForSelector('.vm-marker');await p.waitForTimeout(1000);
 assert.equal(await p.locator('[data-vm-row]').count(),200);
 const layout=await p.evaluate(()=>{const els=[...document.querySelectorAll('.vm-marker')],a=els.map(e=>e.getBoundingClientRect());let overlaps=0;for(let i=0;i<a.length;i++)for(let j=i+1;j<a.length;j++)if(a[i].left<a[j].right&&a[i].right>a[j].left&&a[i].top<a[j].bottom&&a[i].bottom>a[j].top)overlaps++;return{represented:els.reduce((s,e)=>s+(e.classList.contains('vm-cluster')?Number(e.querySelector('b').textContent):1),0),overlaps};});assert.equal(layout.represented,200);assert.equal(layout.overlaps,0);report.results.push({name:'200 actual-Google projected vehicles represented once; no overlapping active targets',status:'PASS'});
 for(const operation of ['pan','zoom']){const samples=await p.evaluate(async op=>{const m=__integrationMap,z=m.getZoom(),times=[];for(let i=0;i<30;i++){const start=performance.now();if(op==='pan')m.panBy(i%2?20:-20,0);else m.setZoom(z+i%2);await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));times.push(performance.now()-start);}return times.sort((a,b)=>a-b);},operation);report.measurements.push({operation,samples:30,medianMs:samples[15],p95Ms:samples[28],maxMs:samples[29]});}
 await p.screenshot({path:'../outputs/integration-google/dense200.png',fullPage:true});
 await fetch(base+'/__preview/control?scene=overview&theme=dark');await p.reload();await p.waitForSelector('.vm-marker');await p.locator('[data-vm-row$=":synthetic-2"]').click();await p.waitForTimeout(800);
 assert.equal(await p.locator('.gm-err-content').count(),0);assert.equal(await p.locator('.vm-marker.is-selected .vm-heading').count(),0);
 const images=await p.locator('.vm-marker.is-selected img').evaluateAll(els=>els.map(e=>({decoded:e.complete&&e.naturalWidth===128,filter:getComputedStyle(e).filter})));assert(images.length);assert(images.every(x=>x.decoded&&x.filter==='none'));report.results.push({name:'Actual Google dark theme: selected stale artwork decoded without recoloring or heading',status:'PASS'});
 await p.screenshot({path:'../outputs/integration-google/dark-selected-stale.png',fullPage:true});
}finally{await writeFile('../outputs/integration-google/scale-verification.json',JSON.stringify(report,null,2));await browser.close();}
console.log(JSON.stringify(report));
