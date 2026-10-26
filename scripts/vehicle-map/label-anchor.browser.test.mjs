import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
const {chromium,webkit}=createRequire(import.meta.url)(process.env.PLAYWRIGHT_MODULE_PATH||'playwright');
const engine=process.env.VEHICLE_MAP_BROWSER||'chromium',output=process.env.VEHICLE_MAP_OUTPUT||'../outputs/label-anchor';
const url=process.env.MARKER_GOOGLE_URL;if(!url)throw Error('Actual Google Maps preview URL required');await mkdir(output,{recursive:true});
const browser=await(engine==='webkit'?webkit.launch({headless:true}):chromium.launch({headless:true,channel:'chrome'}));
const page=await browser.newPage({viewport:{width:1440,height:900}});const results=[],errors=[];page.on('pageerror',e=>errors.push(e.message));
await page.route('**/src/**',async r=>{const p=new URL(r.request().url()).pathname.slice(1);if(!/\.(js|css)$/.test(p))return r.continue();let body=await readFile(p,'utf8');if(p==='src/vehicle-map/google-map.js')body=body.replace('let vehicles = [],','window.__anchorMap=map;let vehicles = [],');await r.fulfill({contentType:p.endsWith('.css')?'text/css':'text/javascript',body});});
const labels=()=>page.locator('.vm-label.is-selected:not([hidden])');
const focus=async()=>{await page.locator('[data-vm-fit]').click();await page.waitForTimeout(900);assert.equal(await labels().count(),1);};
try{
 await fetch(url+'/__preview/control?scene=overview&error=0&denied=0&unauthorized=0&ttl=3600000&failMe=0');await page.goto(url+'/sledovani-vozidel');await page.waitForSelector('.vm-marker',{timeout:30000});
 await page.locator('[data-vm-row$=":synthetic-1"]').click();await page.waitForTimeout(1000);
 for(const width of [1440,390]){
  await page.setViewportSize({width,height:width===1440?900:844});await focus();
  for(const edge of ['left','right','top','bottom']){
   await focus();await page.evaluate(edge=>{const e=document.querySelector('.vm-marker.is-selected').getBoundingClientRect(),m=document.querySelector('.vm-map').getBoundingClientRect();const x=e.x+e.width/2-m.x,y=e.y+e.height/2-m.y;const target=edge==='left'?[-80,m.height/2]:edge==='right'?[m.width+80,m.height/2]:edge==='top'?[m.width/2,-10]:[m.width/2,m.height+60];__anchorMap.panBy(x-target[0],y-target[1]);},edge);await page.waitForTimeout(900);
   await page.screenshot({path:`${output}/${engine}-${width}-${edge}.png`});
   assert.equal(await labels().count(),0,`${width}/${edge}: no plate without its visible vehicle`);
   await focus();const delta=await page.evaluate(()=>{const m=document.querySelector('.vm-marker.is-selected').getBoundingClientRect(),l=document.querySelector('.vm-label.is-selected').getBoundingClientRect();return Math.abs(m.x+m.width/2-l.x-l.width/2);});assert.ok(delta<1,'Plate remains centered on the vehicle');
   results.push(`${width}/${edge}: hidden outside, exact anchor restored inside`);
  }
  await page.screenshot({path:`${output}/${engine}-${width}-restored.png`});
 }
 assert.deepEqual(errors,[]);console.log(`PASS ${results.length} actual Google Maps edge/return cases (${engine})`);
}finally{await writeFile(`${output}/${engine}-results.json`,JSON.stringify({results,errors},null,2));await browser.close();}
