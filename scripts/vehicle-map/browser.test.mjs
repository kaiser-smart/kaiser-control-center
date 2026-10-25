import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdir, writeFile } from 'node:fs/promises';
import { startPreview } from './preview-server.mjs';
const require = createRequire(import.meta.url);
const { chromium, webkit } = require(process.env.PLAYWRIGHT_MODULE_PATH || 'playwright');
const engine=process.env.VEHICLE_MAP_BROWSER || 'chromium';
if(!['chromium','webkit'].includes(engine))throw new Error('Unsupported test browser');
const output=process.env.VEHICLE_MAP_OUTPUT || '../outputs';
await mkdir(output,{recursive:true});
const {server,url,state}=await startPreview(0);
const browser=await (engine==='webkit'?webkit.launch({headless:true}):chromium.launch({headless:true,channel:'chrome'}));
const context=await browser.newContext({viewport:{width:1440,height:1000},deviceScaleFactor:1});
const page=await context.newPage();page.setDefaultTimeout(6000);const errors=[],network=[],results=[],metrics=[];
page.on('pageerror',e=>errors.push(e.message));page.on('request',r=>network.push({method:r.method(),url:r.url()}));
await page.route('https://**/*',r=>r.abort());
const test=async(name,fn)=>{try{await fn();results.push({name,status:'PASS'});console.log(`PASS ${name}`);}catch(e){results.push({name,status:'FAIL',error:e.message});console.log(`FAIL ${name}: ${e.message}`);}};
const ready=async()=>{await page.waitForSelector('.vm-marker');await page.waitForTimeout(120);};
const control=async(q)=>{await fetch(`${url}/__preview/control?${q}`);};
const scene=async(name='overview',theme='light',width=1440,height=1000)=>{await control(`scene=${name}&theme=${theme}&error=0&denied=0&unauthorized=0&ttl=3600000&failMe=0`);await page.setViewportSize({width,height});await page.goto(`${url}/sledovani-vozidel`);await ready();};
const camera=()=>page.evaluate(()=>{const m=google.maps._instances.at(-1);return {center:m.getCenter().toJSON(),zoom:m.getZoom(),heading:m.getHeading(),tilt:m.getTilt(),calls:m.calls.length};});
const collisions=()=>page.evaluate(()=>{const a=[...document.querySelectorAll('.vm-marker')].map(e=>({id:e.dataset.vmMarker,r:e.getBoundingClientRect()}));const hit=[];for(let i=0;i<a.length;i++)for(let j=i+1;j<a.length;j++)if(a[i].r.left<a[j].r.right&&a[i].r.right>a[j].r.left&&a[i].r.top<a[j].r.bottom&&a[i].r.bottom>a[j].r.top)hit.push([a[i].id,a[j].id]);return hit;});
const screenshot=async(name)=>{await page.screenshot({path:`${output}/${name}.png`,fullPage:true});};
try{
 await scene();
 await test('Product shell: logo, HP, user bar; no added global sidebar',async()=>{assert.equal(await page.locator('.ui-pilot-sidebar').count(),0);assert.equal(await page.locator('.vm-page > .topbar .kaiser-logo').count(),1);assert.equal(await page.locator('.vm-page > .user-bar').count(),1);});
 await test('Overview: all 18 rows; 17 valid points including two stale; matching counts',async()=>{assert.equal(await page.locator('[data-vm-row]').count(),18);assert.equal(await page.locator('[data-vm-filter="all"] b').innerText(),'18');assert.match(await page.locator('.vm-viewport').innerText(),/17 z 17.*bez polohy 1/);assert.equal(await page.locator('[data-vm-filter="stale"] b').innerText(),'2');});
 await screenshot('overview-desktop');
 await test('Visible row selection and image decoding preserve camera and stable marker element',async()=>{
  await page.evaluate(()=>{window.savedMarker=document.querySelector('[data-vm-marker="synthetic-preview-admin:tcars:vehicle:synthetic-1"]');window.savedImage=window.savedMarker.querySelector('img');});
  const before=await camera();await page.locator('[data-vm-row$=":synthetic-1"]').click();await page.waitForTimeout(120);assert.deepEqual(await camera(),before);
  assert.equal(await page.locator('.vm-marker.is-selected').count(),1);assert.equal(await page.evaluate(()=>savedMarker===document.querySelector('.vm-marker.is-selected')&&savedImage===savedMarker.querySelector('img')),true);
  assert.match(await page.locator('.vm-panel-detail').innerText(),/Řidič právě ve vozidle\s+Neověřeno/);
 });
 await screenshot('selected-desktop');
 await test('Refresh with new GPS sample IDs: selection, zoom, center, marker and image survive',async()=>{
  const before=await camera();await control('revision=1');await page.locator('[data-vm-refresh]').click();await page.waitForTimeout(180);assert.deepEqual(await camera(),before);
  assert.equal(await page.evaluate(()=>savedMarker===document.querySelector('.vm-marker.is-selected')&&savedImage===savedMarker.querySelector('img')),true);
 });
 await test('Stale 47 minute point: original GPS, clock badge, no direction and last reported state',async()=>{
  await page.locator('[data-vm-back]').click();await page.locator('[data-vm-row$=":synthetic-2"]').click();await page.waitForTimeout(100);
  assert.match(await page.locator('.vm-panel-detail').innerText(),/před 47 min/);assert.match(await page.locator('.vm-panel-detail').innerText(),/Poslední hlášený stav/);
  assert.equal(await page.locator('.vm-marker.is-selected .vm-heading').count(),0);assert.equal(await page.locator('.vm-marker.is-selected .vm-badge').innerText(),'◷');
 });
 await screenshot('stale-desktop');
 await test('API provider error: retained map and selection, explicit last success',async()=>{
  const before=await camera();await control('error=1');await page.locator('[data-vm-refresh]').click();await page.waitForTimeout(120);
  assert.match(await page.locator('[data-vm-refresh-status]').innerText(),/Obnova se nezdařila/);assert.equal(await page.locator('.vm-marker.is-selected').count(),1);assert.deepEqual(await camera(),before);
  await control('error=0');await page.locator('[data-vm-refresh]').click();await page.waitForTimeout(120);assert.doesNotMatch(await page.locator('[data-vm-refresh-status]').innerText(),/nezdařila/);
 });
 await test('Temporary network failure retains visible authenticated read-only map; reconnect recovers',async()=>{
  const before=await camera();await page.route('**/api/vehicle-tracking/status',r=>r.abort());await page.locator('[data-vm-refresh]').click();await page.waitForTimeout(100);
  assert.equal(await page.locator('#app').isVisible(),true);assert.equal(await page.locator('.vm-marker.is-selected').count(),1);assert.deepEqual(await camera(),before);
  await page.unroute('**/api/vehicle-tracking/status');await page.locator('[data-vm-refresh]').click();await page.waitForTimeout(100);
 });
 await test('Offline event keeps only active visible unexpired map; online verifies session',async()=>{
  await context.setOffline(true);await page.waitForTimeout(100);assert.equal(await page.locator('#app').isVisible(),true);assert.equal(await page.locator('.vm-marker.is-selected').count(),1);
  await context.setOffline(false);await page.waitForTimeout(180);assert.equal(await page.locator('#app').isVisible(),true);
 });
 await test('List scroll is restored from detail and survives normal refresh',async()=>{
  await page.locator('[data-vm-back]').click();await page.locator('.vm-list').evaluate(e=>e.scrollTop=470);const scroll=await page.locator('.vm-list').evaluate(e=>e.scrollTop);
  await page.locator('[data-vm-row$=":synthetic-6"]').click();await page.locator('[data-vm-back]').click();assert.equal(await page.locator('.vm-list').evaluate(e=>e.scrollTop),scroll);
  await page.locator('[data-vm-refresh]').click();await page.waitForTimeout(120);assert.equal(await page.locator('.vm-list').evaluate(e=>e.scrollTop),scroll);
 });
 await test('Search/filters shared by map and list; missing GPS remains selectable; empty reason',async()=>{
  await page.locator('#vm-search').fill('t e s t 012');await page.waitForTimeout(120);assert.equal(await page.locator('[data-vm-row]').count(),1);assert.equal(await page.locator('.vm-marker').count(),0);assert.equal(await page.locator('[data-vm-fit]').isDisabled(),true);
  await page.locator('[data-vm-row]').click();assert.match(await page.locator('.vm-panel-detail').innerText(),/Bez polohy/);await page.locator('[data-vm-back]').click();
  await page.locator('#vm-search').fill('NOT FOUND');assert.match(await page.locator('.vm-list').innerText(),/Žádná vozidla/);await page.locator('#vm-search').fill('');await page.locator('[data-vm-filter="stale"]').click();await page.waitForTimeout(100);assert.equal(await page.locator('[data-vm-row]').count(),2);assert.equal(await page.locator('.vm-marker').count(),2);await page.locator('[data-vm-filter="stale"]').click();
 });
 await test('Hover and keyboard focus highlight without camera changes',async()=>{
  const before=await camera();await page.locator('[data-vm-row$=":synthetic-1"]').focus();await page.waitForTimeout(100);assert(await page.locator('.vm-marker.is-highlighted').count());assert.deepEqual(await camera(),before);
 });
 for(const count of [6,20]){
  await scene(`same${count}`);
  await test(`${count} coincident vehicles: exact cluster count; complete member list`,async()=>{assert.equal(await page.locator('.vm-cluster').count(),1);assert.equal(await page.locator('.vm-cluster b').innerText(),String(count));await page.locator('.vm-cluster').click();await page.waitForTimeout(160);assert.equal(await page.locator('[data-vm-row]').count(),count);if(count===6)assert.equal(await page.locator('.vm-marker:not(.vm-cluster)').count(),6);else assert.equal(await page.locator('.vm-cluster').count(),1);assert.deepEqual(await collisions(),[]);});
  await screenshot(`group-${count}-desktop`);
  await test(`${count} group selected member: no double count; connector; Escape/back`,async()=>{
   await page.locator('[data-vm-row]').first().click();await page.waitForTimeout(120);assert.equal(await page.locator('.vm-marker.is-selected').count(),1);
   const total=await page.evaluate(()=>[...document.querySelectorAll('.vm-marker')].reduce((s,e)=>s+(e.classList.contains('vm-cluster')?Number(e.querySelector('b').textContent):1),0));assert.equal(total,count);assert.deepEqual(await collisions(),[]);assert(await page.locator('.vm-connectors line').count());
   await page.keyboard.press('Escape');await page.keyboard.press('Escape');await page.waitForTimeout(100);assert.equal(await page.locator('.vm-group-heading').isVisible(),false);
  });
 }
 await scene('dense200');
 await test('Dense 200 fleet: all vehicles represented and no active target overlaps',async()=>{assert.equal(await page.locator('[data-vm-row]').count(),200);const total=await page.evaluate(()=>[...document.querySelectorAll('.vm-marker')].reduce((s,e)=>s+(e.classList.contains('vm-cluster')?Number(e.querySelector('b').textContent):1),0));assert.equal(total,200);assert.deepEqual(await collisions(),[]);});
 await test('200 vehicle interaction measurement: synthetic pan measured, no unhandled errors',async()=>{
  const times=await page.evaluate(async()=>{const samples=[];for(let i=0;i<30;i++){const start=performance.now();google.maps._instances.at(-1).panBy(i%2?20:-20,0);await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));samples.push(performance.now()-start);}return samples.sort((a,b)=>a-b);});
  metrics.push({scenario:'dense200',operation:'pan + two animation frames',samples:times.length,medianMs:times[15],p95Ms:times[28],maxMs:times[29]});assert(times[28]<250);
 });
 await screenshot('dense200-desktop');
 for(const width of [320,390,412,768,1024,1440]){
  const height=width<761?844:1000;await scene('overview','light',width,height);
  await test(`Viewport ${width}: no horizontal overflow, map/list simultaneous; touch and attribution unobscured`,async()=>{
   const dims=await page.evaluate(()=>{const work=document.querySelector('.vm-work').getBoundingClientRect(),map=document.querySelector('.vm-map-shell').getBoundingClientRect(),panel=document.querySelector('.vm-panel').getBoundingClientRect(),attr=document.querySelector('.test-attribution').getBoundingClientRect();return{width:innerWidth,scroll:document.documentElement.scrollWidth,work:work.toJSON(),map:map.toJSON(),panel:panel.toJSON(),attr:attr.toJSON()};});
   assert(dims.scroll<=width,JSON.stringify(dims));assert(dims.map.height>=220);if(width<=760){assert.equal(dims.panel.height,168);assert(dims.panel.top>=dims.map.bottom-1);assert(dims.attr.bottom<=dims.panel.top);}else{assert.equal(dims.panel.width,width<1200?304:328);assert.equal(dims.map.left,dims.panel.right);if(width>=1024)assert(dims.map.width/dims.work.width>=.65);}
   metrics.push({scenario:`viewport-${width}`,mapWidth:dims.map.width,mapHeight:dims.map.height,panelWidth:dims.panel.width,panelHeight:dims.panel.height});
  });
  if(width<=760){await page.locator('[data-vm-expand]').click();await page.locator('[data-vm-row$=":synthetic-1"]').click();await page.waitForTimeout(100);
   await test(`Viewport ${width}: detail replaces bottom list; map >=220; image 104x78`,async()=>{assert.equal(await page.locator('.vm-panel-list').isVisible(),false);const box=await page.locator('.vm-panel-detail .vm-art--detail').boundingBox();assert.equal(box.width,104);assert.equal(box.height,78);assert((await page.locator('.vm-map-shell').boundingBox()).height>=220);assert(await page.locator('[data-vm-back]').isVisible());});
   await screenshot(`selected-mobile-${width}`);
   await page.locator('[data-vm-back]').click();await page.locator('#vm-search').focus();await page.setViewportSize({width,height:480});await page.waitForTimeout(100);
   await test(`Viewport ${width}: shortened keyboard viewport keeps search accessible`,async()=>{await page.locator('#vm-search').scrollIntoViewIfNeeded();const r=await page.locator('#vm-search').boundingBox();assert(r.y>=0&&r.y+r.height<=480);assert.equal(await page.locator('#vm-search').evaluate(e=>getComputedStyle(e).fontSize),'16px');});
  }
 }
 for(const theme of ['light','dark'])for(const width of [390,1440]){
  await scene('overview',theme,width,width<761?844:1000);
  await test(`${theme} ${width}: all four artwork files decode; white tiles and neutral monograms`,async()=>{
   await page.locator('[data-vm-legend]').click();await page.locator('.vm-legend img').evaluateAll(imgs=>Promise.all(imgs.map(i=>i.decode())));
   const arts=await page.locator('.vm-legend img').evaluateAll(imgs=>imgs.map(i=>({width:i.naturalWidth,height:i.naturalHeight,filter:getComputedStyle(i).filter,bg:getComputedStyle(i.parentElement).backgroundColor})));
   assert.equal(await page.locator('.vm-page > .topbar .back-button').evaluate(e=>getComputedStyle(e).color),'rgb(32, 40, 33)');assert.equal(arts.length,4);arts.forEach(a=>{assert.equal(a.width,256);assert.equal(a.height,192);assert.equal(a.filter,'none');assert.equal(a.bg,'rgb(255, 255, 255)');});assert.equal(await page.locator('.vm-legend-mono p').count(),5);await page.locator('[data-vm-close-legend]').click();
   const markerImgs=await page.locator('.vm-marker img').evaluateAll(imgs=>Promise.all(imgs.map(async i=>{await i.decode();return{width:i.naturalWidth,height:i.naturalHeight,box:i.getBoundingClientRect().toJSON(),tile:i.parentElement.getBoundingClientRect().toJSON()};})));
   markerImgs.forEach(i=>{assert.equal(i.width,128);assert.equal(i.height,96);assert.equal(i.box.width,48);assert.equal(i.box.height,36);assert.equal(i.tile.width,56);assert.equal(i.tile.height,44);});
  });
  if(width<=760)await page.locator('[data-vm-expand]').click();await page.locator('[data-vm-row$=":synthetic-2"]').click();await page.waitForTimeout(100);
  await test(`${theme} ${width}: selected stale image not recolored; selection exact brand`,async()=>{assert.equal(await page.locator('.vm-art--detail img').evaluate(e=>getComputedStyle(e).filter),'none');assert.equal(await page.locator('.vm').getAttribute('data-theme'),theme);const style=await page.locator('.vm-marker.is-selected').evaluate(e=>getComputedStyle(e).boxShadow);assert.match(style,/rgb\(117, 189, 37\)/);assert.match(style,/rgb\(32, 40, 33\)/);});
  await screenshot(`stale-${theme}-${width}`);
 }
 await scene();
 await test('Measured labels never overlap markers, controls, other labels, or map edges',async()=>{
  const issues=await page.evaluate(()=>{const hit=(a,b)=>a.left<b.right&&a.right>b.left&&a.top<b.bottom&&a.bottom>b.top;const labels=[...document.querySelectorAll('.vm-overlay .vm-label:not([hidden])')];const blockers=[...document.querySelectorAll('.vm-marker,[data-vm-obstacle]')];const map=document.querySelector('.vm-map').getBoundingClientRect();let errors=[];labels.forEach((e,i)=>{const r=e.getBoundingClientRect();if(r.left<map.left||r.right>map.right||r.top<map.top||r.bottom>map.bottom)errors.push('edge');if(blockers.some(b=>hit(r,b.getBoundingClientRect())))errors.push('blocker');if(labels.slice(i+1).some(b=>hit(r,b.getBoundingClientRect())))errors.push('label');});return errors;});assert.deepEqual(issues,[]);
 });
 await test('Confirmed 403 removes GPS and selection; no demo fallback',async()=>{await control('denied=1');await page.locator('[data-vm-refresh]').click();await page.waitForTimeout(150);assert.equal(await page.locator('.vm-marker').count(),0);assert.equal(await page.locator('[data-vm-row]').count(),0);});
 await test('Confirmed 401 clears in-memory map and ends session',async()=>{
  await scene();await control('unauthorized=1');await page.locator('[data-vm-refresh]').click();await page.waitForSelector('[data-auth-form]');assert.equal(await page.locator('.vm-marker').count(),0);assert.equal(await page.locator('[data-vm-row]').count(),0);assert(await page.locator('[data-auth-form]').count());
 });
 await test('Known session expiry hides GPS without waiting for a refresh',async()=>{
  await control('unauthorized=0&denied=0&ttl=5000');await page.goto(`${url}/sledovani-vozidel`);await ready();await page.waitForSelector('[data-auth-form]',{timeout:7000});assert.equal(await page.locator('.vm-marker').count(),0);await control('ttl=3600000');
 });
 await test('Resume requires successful reauthorization even on the map',async()=>{
  await scene();await control('failMe=1');await page.evaluate(()=>document.dispatchEvent(new Event('visibilitychange')));await page.waitForTimeout(150);assert.equal(await page.locator('#app').isVisible(),false);assert.equal(await page.locator('#session-guard').isVisible(),true);await control('failMe=0');await page.locator('[data-session-retry]').click();await page.waitForTimeout(150);assert.equal(await page.locator('#app').isVisible(),true);
 });
 await test('Other application routes retain existing offline lock behavior',async()=>{
  await page.goto(`${url}/pripominky`);await page.waitForSelector('[data-logout]');await context.setOffline(true);await page.waitForTimeout(100);assert.equal(await page.locator('#app').isVisible(),false);await context.setOffline(false);await page.waitForTimeout(150);
 });
 await test('All four map/detail exports decode in both themes at mobile and desktop sizes',async()=>{
  for(const theme of ['light','dark'])for(const width of [390,1440]){
   await scene('overview',theme,width,width===390?844:1000);if(width===390)await page.locator('[data-vm-expand]').click();
   for(const id of [1,2,3,4]){await page.locator(`[data-vm-row$=":synthetic-${id}"]`).click();await page.waitForTimeout(60);
    const imgs=await page.locator('.vm-art--detail img,.vm-marker.is-selected img').evaluateAll(imgs=>Promise.all(imgs.map(async i=>{await i.decode();return{n:i.naturalWidth,r:i.getBoundingClientRect().toJSON(),tile:i.parentElement.getBoundingClientRect().toJSON(),filter:getComputedStyle(i).filter,bg:getComputedStyle(i.parentElement).backgroundColor};})));
    assert.equal(imgs.length,2);assert.deepEqual(imgs.map(i=>i.n).sort(),[128,256]);for(const i of imgs){assert.equal(i.filter,'none');assert.equal(i.bg,'rgb(255, 255, 255)');if(i.n===256){assert.equal(i.r.width,width===390?100:108);assert.equal(i.r.height,width===390?75:81);assert.equal(i.tile.width,width===390?104:112);assert.equal(i.tile.height,width===390?78:84);}}await page.locator('[data-vm-back]').click();
   }
  }
 });
 await test('No business writes or GPS browser persistence during acceptance run',async()=>{assert.deepEqual(network.filter(r=>r.method!=='GET'),[]);const stored=await page.evaluate(()=>({local:{...localStorage},session:{...sessionStorage}}));assert.deepEqual(stored,{local:{},session:{}});});
 await test('No uncaught runtime errors',async()=>assert.deepEqual(errors,[]));
}finally{
 await writeFile(`${output}/browser-verification.json`,JSON.stringify({engine,scope:'Isolated real application UI with synthetic protected-API fixtures and explicit Google API test double; not real Google/provider verification',results,metrics,errors,nonGetRequests:network.filter(r=>r.method!=='GET')},null,2));
 await browser.close();server.close();
}
if(results.some(r=>r.status==='FAIL'))process.exitCode=1;
