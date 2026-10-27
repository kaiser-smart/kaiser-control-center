import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {mkdir,writeFile} from 'node:fs/promises';
const {chromium,webkit}=createRequire(import.meta.url)(process.env.PLAYWRIGHT_MODULE_PATH||'playwright');
const engine=process.env.VEHICLE_MAP_BROWSER||'chromium',url=process.env.MARKER_GOOGLE_URL,output=process.env.VEHICLE_MAP_OUTPUT||'../outputs/ignition-dots';
if(!url)throw Error('Actual Google Maps preview URL required');await mkdir(output,{recursive:true});
const browser=await(engine==='webkit'?webkit.launch():chromium.launch({channel:'chrome'}));
const page=await browser.newPage({viewport:{width:1440,height:900}});page.setDefaultTimeout(15000);
const errors=[],results=[];let patch={ignition:false,speedKmh:0};
page.on('pageerror',e=>errors.push(e.message.replace(/AIza[\w-]+/g,'[REDACTED]')));
await page.route('**/api/vehicle-tracking/status*',async r=>{const response=await r.fetch(),body=await response.json();const s=body.locations.find(s=>s.externalVehicleId==='synthetic-1');Object.assign(s,patch);s.lastGpsAt=new Date(Date.now()-(patch.ageSeconds||30)*1000).toISOString();await r.fulfill({response,json:body});});
const selected=()=>page.locator('.vm-marker.is-selected .vm-ignition');
const check=async expected=>{
 const selectors=['.vm-marker.is-selected .vm-ignition','.vm-panel-detail .vm-ignition','[data-vm-row$=":synthetic-1"] .vm-ignition','.vm-table-scroll [data-vm-ignition$=":synthetic-1"]'];
 for(const selector of selectors){const e=page.locator(selector);assert.equal(await e.count(),1);assert((await e.getAttribute('aria-label')).startsWith(expected===null?'Zapalování nezjištěno':`Zapalování ${expected?'zapnuto':'vypnuto'} · poslední stav `));assert.equal(await e.evaluate(e=>getComputedStyle(e).backgroundColor),expected===null?'rgba(0, 0, 0, 0)':expected?'rgb(117, 189, 37)':'rgb(239, 68, 68)');}
};
const refresh=async(expected)=>{console.log('REFRESH',page.viewportSize().width,JSON.stringify(patch));await page.waitForTimeout(600);await Promise.all([page.waitForResponse(r=>r.url().includes('/api/vehicle-tracking/status')),page.locator('[data-vm-refresh]').click()]);await page.waitForTimeout(200);await page.waitForFunction(({expected})=>document.querySelector('.vm-marker.is-selected .vm-ignition')?.getAttribute('aria-label')?.startsWith(expected),{expected:expected===null?'Zapalování nezjištěno':`Zapalování ${expected?'zapnuto':'vypnuto'} · poslední stav `});await check(expected);};
try{
 for(const width of [1440,1024,768,430,375,320]){
  patch={ignition:false,speedKmh:0,ageSeconds:86400};await fetch(url+'/__preview/control?scene=overview&theme=dark&error=0&denied=0&unauthorized=0&ttl=3600000&failMe=0');await page.setViewportSize({width,height:width>720?900:844});await page.goto(url+'/sledovani-vozidel');await page.waitForSelector('.vm-marker');if(width<=720)await page.locator('[data-vm-view="list"]').click();await page.locator('[data-vm-row$=":synthetic-1"]').click();await page.waitForTimeout(500);await check(false);
  await page.locator('[data-vm-ignition-toggle]').click();assert.equal(await page.locator('[data-vm-ignition-message]').isVisible(),true);assert.match(await page.locator('[data-vm-ignition-message]').innerText(),/^Zapalování vypnuto · poslední stav /);await page.screenshot({path:`${output}/${engine}-${width}-off.png`});
  assert.match(await selected().getAttribute('title'),/poslední stav \d/);
  const anchor=await page.locator('.vm-marker.is-selected').evaluate(e=>({x:e.style.left,y:e.style.top}));
  patch={ignition:true,speedKmh:0};await refresh(true);assert.equal(await page.locator('.vm-marker.is-selected.has-current-motion').count(),0);
  assert.deepEqual(await page.locator('.vm-marker.is-selected').evaluate(e=>({x:e.style.left,y:e.style.top})),anchor);
  await page.screenshot({path:`${output}/${engine}-${width}-on.png`});
  assert.equal(await page.locator('[data-vm-ignition-message]').isVisible(),true);
  patch={ignition:false,speedKmh:0};await refresh(false);
  patch={ignition:true,speedKmh:35};await refresh(true);await page.waitForSelector('.vm-marker.is-selected.has-current-motion');
  patch={ignition:null,speedKmh:35};await refresh(null);assert.equal(await page.locator('.vm-marker.is-selected.has-current-motion').count(),1);
  results.push({width,status:'PASS',states:'off at rest / on at rest / on moving / missing ignition'});
 }
 patch={ignition:true,speedKmh:0};await page.reload();await page.waitForSelector('.vm-marker');await page.locator('[data-vm-view="list"]').click();await page.locator('[data-vm-row$=":synthetic-1"]').click();await page.waitForSelector('.vm-marker.is-selected .vm-ignition-on');await check(true);
 await page.clock.setFixedTime(new Date(Date.now()+1900000));await page.waitForTimeout(1400);await check(true);
 assert.equal(await page.locator('.vm-marker.is-selected.has-current-motion').count(),0);
 assert.deepEqual(errors,[]);console.log(`PASS ${engine}: Google Maps, 6 widths, actual colors on list/map/detail/table, ignition refresh, stopped on/off, missing suppression / known expired ignition retained, stable anchor, independent pulse`);
}catch(e){await page.screenshot({path:`${output}/${engine}-failure.png`});console.error(await page.locator('[data-vm-refresh-status]').innerText());throw e;}finally{await writeFile(`${output}/${engine}-results.json`,JSON.stringify({results,errors},null,2));await browser.close();}
