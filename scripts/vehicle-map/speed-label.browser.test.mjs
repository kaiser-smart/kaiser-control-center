import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
const {chromium,webkit}=createRequire(import.meta.url)(process.env.PLAYWRIGHT_MODULE_PATH||'playwright');
const engine=process.env.VEHICLE_MAP_BROWSER||'chromium',url=process.env.MARKER_GOOGLE_URL,output=process.env.VEHICLE_MAP_OUTPUT||'../outputs/speed-label';
if(!url)throw Error('Actual Google Maps preview URL required');await mkdir(output,{recursive:true});
const browser=await(engine==='webkit'?webkit.launch():chromium.launch({channel:'chrome'}));
const page=await browser.newPage({viewport:{width:1440,height:900}});page.setDefaultTimeout(15000);const errors=[],results=[];let patch=null;
page.on('pageerror',e=>errors.push(e.message.replace(/AIza[\w-]+/g,'[REDACTED]')));
await page.route('**/src/**',async r=>{const f=new URL(r.request().url()).pathname.slice(1);if(!/\.(js|css)$/.test(f))return r.continue();await r.fulfill({contentType:f.endsWith('.css')?'text/css':'text/javascript',body:await readFile(f,'utf8')});});
await page.route('**/api/vehicle-tracking/status*',async r=>{const response=await r.fetch(),body=await response.json();if(patch){const s=body.locations.find(s=>s.externalVehicleId==='synthetic-1');Object.assign(s,patch);s.lastGpsAt=new Date(Date.now()-(patch.ageSeconds||30)*1000).toISOString();}await r.fulfill({response,json:body});});
const choose=async n=>{if(page.viewportSize().width<=720)await page.locator('[data-vm-view="list"]').click();await page.locator(`[data-vm-row$=":synthetic-${n}"]`).click();await page.waitForTimeout(900);};
const speed=()=>page.locator('.vm-label.is-selected:not([hidden]) .vm-label-speed');
const check=async()=>{
 const d=await page.evaluate(()=>{const l=document.querySelector('.vm-label.is-selected:not([hidden])'),m=document.querySelector('.vm-marker.is-selected'),r=l.getBoundingClientRect(),a=m.getBoundingClientRect(),p=l.querySelector('.vm-label-plate').getBoundingClientRect(),s=l.querySelector('.vm-label-speed').getBoundingClientRect();const hit=(a,b)=>a.left<b.right&&a.right>b.left&&a.top<b.bottom&&a.bottom>b.top;return{center:Math.abs(r.x+r.width/2-a.x-a.width/2),sameRow:Math.abs(p.top-s.top)<1,noOverlap:p.right<s.left,divider:getComputedStyle(l.querySelector('.vm-label-speed')).borderLeftWidth,collisions:[...document.querySelectorAll('.vm-label:not(.vm-measure):not([hidden]),.vm-marker,[data-vm-obstacle]')].filter(e=>e!==l&&e.getClientRects().length).some(e=>hit(r,e.getBoundingClientRect())),label:[r.width,r.height]};});
 assert(d.center<1,JSON.stringify(d));assert(d.sameRow&&d.noOverlap);assert.equal(d.divider,'1px');assert(!d.collisions,JSON.stringify(d));return d;
};
try{
 for(const width of [1440,768,390,320]){
  await page.setViewportSize({width,height:width>720?900:844});await fetch(url+'/__preview/control?scene=overview&error=0&denied=0&unauthorized=0&ttl=3600000&failMe=0');await page.goto(url+'/sledovani-vozidel');await page.waitForSelector('.vm-marker');
  await choose(1);assert.equal(await speed().innerText(),'26 km/h');const geometry=await check();await page.screenshot({path:`${output}/${engine}-${width}-moving.png`});
  await choose(3);assert.equal(await speed().innerText(),'0 km/h');await check();
  await choose(2);assert.equal(await speed().innerText(),'— km/h');await check();await page.screenshot({path:`${output}/${engine}-${width}-stale.png`});
  await choose(8);assert.equal(await speed().innerText(),'— km/h');
  results.push({width,geometry,states:'moving / stopped / stale / unknown'});
 }
 await choose(1);patch={speedKmh:123};await page.locator('[data-vm-refresh]').click();await page.waitForTimeout(1000);assert.equal(await speed().innerText(),'123 km/h');await check();
 patch={speedKmh:32,ageSeconds:117};await page.reload();await page.waitForSelector('.vm-marker');await choose(1);assert.equal(await speed().innerText(),'32 km/h');await page.waitForTimeout(4300);assert.equal(await speed().innerText(),'— km/h');await check();
 assert.deepEqual(errors,[]);console.log(`PASS ${engine}: actual Google, 4 widths, current/zero/stale/unknown speed, refreshed width, expiry without refresh, no collisions, fixed anchor`);
}finally{await writeFile(`${output}/${engine}-results.json`,JSON.stringify({results,errors},null,2));await browser.close();}
