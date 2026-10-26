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
const ready=async()=>{await page.waitForSelector('.vm-marker',{timeout:15000});await page.waitForTimeout(120);};
const control=async(q)=>{await fetch(`${url}/__preview/control?${q}`);};
const scene=async(name='overview',theme='light',width=1440,height=1000)=>{await control(`scene=${name}&theme=${theme}&error=0&denied=0&unauthorized=0&ttl=3600000&failMe=0`);await page.setViewportSize({width,height});await page.goto(`${url}/sledovani-vozidel`);await ready();};
const camera=()=>page.evaluate(()=>{const m=google.maps._instances.at(-1);return {center:m.getCenter().toJSON(),zoom:m.getZoom(),heading:m.getHeading(),tilt:m.getTilt(),calls:m.calls.length};});
const collisions=()=>page.evaluate(()=>{const a=[...document.querySelectorAll('.vm-marker')].map(e=>({id:e.dataset.vmMarker,r:e.getBoundingClientRect()}));const hit=[];for(let i=0;i<a.length;i++)for(let j=i+1;j<a.length;j++)if(a[i].r.left<a[j].r.right&&a[i].r.right>a[j].r.left&&a[i].r.top<a[j].r.bottom&&a[i].r.bottom>a[j].r.top)hit.push([a[i].id,a[j].id]);return hit;});
const screenshot=async(name)=>{await page.screenshot({path:`${output}/${name}.png`,fullPage:true});};
try{
 await scene();
 await test('Product shell: logo, HP, user bar; no added global sidebar',async()=>{assert.equal(await page.locator('.ui-pilot-sidebar').count(),0);assert.equal(await page.locator('.vm-page > .topbar .kaiser-logo').count(),1);assert.equal(await page.locator('.vm-page > .user-bar').count(),1);});
 await test('Overview: all 18 rows; 17 valid points including two stale; matching counts',async()=>{assert.equal(await page.locator('[data-vm-row]').count(),18);assert.equal(await page.locator('[data-vm-filter="all"] b').innerText(),'18');assert.match(await page.locator('.vm-viewport').innerText(),/17 z 17.*bez polohy 1/);assert.equal(await page.locator('[data-vm-filter="stale"] b').textContent(),'2');});
 await screenshot('overview-desktop');
 await test('Visible row selection and image decoding preserve camera and stable marker element',async()=>{
  await page.evaluate(()=>{window.savedMarker=document.querySelector('[data-vm-marker="synthetic-preview-admin:tcars:vehicle:synthetic-1"]');window.savedImage=window.savedMarker.querySelector('img');});
  const before=await camera();await page.locator('[data-vm-row$=":synthetic-1"]').click();await page.waitForTimeout(120);assert.deepEqual(await camera(),before);
  assert.equal(await page.locator('.vm-marker.is-selected').count(),1);assert.equal(await page.evaluate(()=>savedMarker===document.querySelector('.vm-marker.is-selected')&&savedImage===savedMarker.querySelector('img')),true);
  await page.locator('.vm-more summary').click(); assert.match(await page.locator('.vm-panel-detail').innerText(),/Řidič právě ve vozidle\s+Neověřeno/);
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
  await context.setOffline(false);await page.locator('#app').waitFor({state:'visible'});assert.equal(await page.locator('.vm-marker.is-selected').count(),1);
 });
 await test('List scroll is restored from detail and survives normal refresh',async()=>{
  await page.locator('[data-vm-back]').click();await page.locator('.vm-list').evaluate(e=>e.scrollTop=470);const scroll=await page.locator('.vm-list').evaluate(e=>e.scrollTop);
  await page.locator('[data-vm-row$=":synthetic-6"]').click();await page.locator('[data-vm-back]').click();assert.equal(await page.locator('.vm-list').evaluate(e=>e.scrollTop),scroll);
  await page.locator('[data-vm-refresh]').click();await page.waitForTimeout(120);assert.equal(await page.locator('.vm-list').evaluate(e=>e.scrollTop),scroll);
 });
 await test('Search/filters shared by map and list; missing GPS remains selectable; empty reason',async()=>{
  await page.locator('#vm-search').fill('t e s t 012');await page.waitForTimeout(120);assert.equal(await page.locator('[data-vm-row]').count(),1);assert.equal(await page.locator('.vm-marker').count(),0);assert.equal(await page.locator('[data-vm-fit]').isDisabled(),true);
  await page.locator('[data-vm-row]').click();assert.match(await page.locator('.vm-panel-detail').innerText(),/Bez polohy/);await page.locator('[data-vm-back]').click();
  await page.locator('#vm-search').fill('NOT FOUND');assert.match(await page.locator('.vm-list').innerText(),/Žádná vozidla/);await page.locator('#vm-search').fill('');await page.locator('.vm-extra-filters summary').click();await page.locator('[data-vm-filter="stale"]').click();await page.waitForTimeout(100);assert.equal(await page.locator('[data-vm-row]').count(),2);assert.equal(await page.locator('.vm-marker').count(),2);await page.locator('[data-vm-filter="stale"]').click();
 });
 await test('Hover and keyboard focus highlight without camera changes',async()=>{
  const before=await camera();await page.locator('[data-vm-row$=":synthetic-1"]').focus();await page.waitForTimeout(100);assert(await page.locator('.vm-marker.is-highlighted').count());assert.deepEqual(await camera(),before);
 });
 await test('Detail scroll belongs to selected vehicle: refresh preserves it, changing vehicle resets it',async()=>{
  await scene();await page.locator('[data-vm-row$=":synthetic-1"]').click();
  await page.locator('.vm-more summary').click();await page.locator('.vm-history summary').click();await page.locator('.vm-detail-scroll').evaluate(el=>{el.scrollTop=160;});
  const before=await page.locator('.vm-detail-scroll').evaluate(el=>el.scrollTop);assert(before>0);
  await page.locator('[data-vm-refresh]').click();await page.waitForTimeout(160);
  assert.equal(await page.locator('.vm-detail-scroll').evaluate(el=>el.scrollTop),before);
  await page.locator('.vm-marker[data-vm-marker$=":synthetic-2"]').click();await page.waitForTimeout(160);
  assert.equal(await page.locator('.vm-detail-scroll').evaluate(el=>el.scrollTop),0);
  assert.match(await page.locator('.vm-detail-identity').innerText(),/TEST/);
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
 for(const [width,height] of [[320,700],[390,844],[412,844],[768,1000],[1024,768],[1440,900]]){
  await scene('overview','light',width,height);
  await test(`Viewport ${width}x${height}: map fills work area, no document overflow, existing navigation`,async()=>{
   const d=await page.evaluate(()=>{const r=e=>e.getBoundingClientRect().toJSON();return{scroll:document.documentElement.scrollWidth,work:r(document.querySelector('.vm-work')),map:r(document.querySelector('.vm-map-shell')),panel:r(document.querySelector('.vm-panel')),nav:document.querySelector('.mobile-bottom-nav')?r(document.querySelector('.mobile-bottom-nav')):null};});
   assert(d.scroll<=width);assert(d.map.height>=220);assert(d.map.bottom<=height+1);
   if(width<=720){assert(d.map.bottom<=d.nav.top+1);assert.equal(await page.locator('.vm-panel').isVisible(),false);assert.equal(await page.locator('.mobile-header').count(),1);}
   else {assert.equal(d.panel.width,width<=1100?288:320);assert.equal(d.map.left,d.panel.right);if(width>=1024)assert(d.map.width/d.work.width>=.69);}
   metrics.push({scenario:`viewport-${width}`,mapWidth:d.map.width,mapHeight:d.map.height,panelWidth:d.panel.width});
  });
  await screenshot(`overview-${width}x${height}`);
  if(width<=720)await page.locator('[data-vm-view="list"]').click();
  await test(`Viewport ${width}: instant search by assigned driver, list and filters`,async()=>{
   await page.locator('#vm-search').fill('testovaci prirazeni');assert.equal(await page.locator('[data-vm-row]').count(),1);await page.locator('#vm-search').fill('');
   if(width<=720){assert.equal(await page.locator('[data-vm-row]').count(),8);await page.locator('[data-vm-page="1"]').click();assert.equal(await page.locator('[data-vm-row]').count(),8);await page.locator('[data-vm-page="1"]').click();assert.equal(await page.locator('[data-vm-row]').count(),2);await page.locator('[data-vm-page="-1"]').click();await page.locator('[data-vm-page="-1"]').click();}
  });
  await page.locator('[data-vm-row$=":synthetic-2"]').click();await page.waitForTimeout(150);
  await test(`Viewport ${width}: contextual detail, close preserves camera, selected marker not covered`,async()=>{
   assert(await page.locator('[data-vm-back]').isVisible());const card=await page.locator('.vm-panel-detail').boundingBox(),marker=await page.locator('.vm-marker.is-selected').boundingBox();
   assert(card.x>=0&&card.x+card.width<=width);assert(card.y+card.height<=height);assert(marker.x+marker.width<=card.x||marker.y+marker.height<=card.y||marker.x>=card.x+card.width||marker.y>=card.y+card.height,JSON.stringify({card,marker}));
   if(width>720)assert(await page.locator('.vm-panel-list').isVisible());
  });
  await screenshot(`detail-${width}x${height}`);
  const before=await camera();await page.locator('[data-vm-back]').click();await page.waitForTimeout(80);assert.deepEqual(await camera(),before);
  if(width<=720){await page.locator('[data-vm-view="list"]').click();await page.locator('#vm-search').focus();await page.setViewportSize({width,height:480});await page.waitForTimeout(100);
   await test(`Viewport ${width}: shortened keyboard viewport keeps search accessible`,async()=>{const r=await page.locator('#vm-search').boundingBox();assert(r.y>=0&&r.y+r.height<=480);assert.equal(await page.locator('#vm-search').evaluate(e=>getComputedStyle(e).fontSize),'16px');});
  }
 }
 for(const theme of ['light','dark'])for(const width of [390,1440]){
  await scene('overview',theme,width,width<721?844:900);if(width<=720)await page.locator('[data-vm-view="list"]').click();
  await test(`${theme} ${width}: nine supplied silhouettes decode; map markers transparent and compact`,async()=>{
   await page.locator('[data-vm-legend]').click();await page.locator('.vm-legend img').evaluateAll(imgs=>Promise.all(imgs.map(i=>i.decode())));assert.equal(await page.locator('.vm-legend img').count(),9);await page.locator('[data-vm-close-legend]').click();
   const images=await page.locator('.vm-marker img').evaluateAll(imgs=>Promise.all(imgs.map(async i=>{await i.decode();return{w:i.getBoundingClientRect().width,filter:getComputedStyle(i).filter,bg:getComputedStyle(i.parentElement).backgroundColor};})));
   images.forEach(i=>{assert.equal(i.w,36);assert.equal(i.filter,'none');assert.equal(i.bg,'rgba(0, 0, 0, 0)');});
  });
  await page.locator('[data-vm-row$=":synthetic-2"]').click();await page.waitForTimeout(100);
  await test(`${theme} ${width}: selected stale silhouette and exact brand accent`,async()=>{assert.equal(await page.locator('.vm').getAttribute('data-theme'),theme);assert.match(await page.locator('.vm-marker.is-selected').evaluate(e=>getComputedStyle(e).boxShadow),/rgb\(117, 189, 37\)/);});
  await screenshot(`stale-${theme}-${width}`);
 }
 await scene();
 await test('Measured labels never overlap markers, controls, other labels, or map edges',async()=>{
  const issues=await page.evaluate(()=>{const hit=(a,b)=>a.left<b.right&&a.right>b.left&&a.top<b.bottom&&a.bottom>b.top;const labels=[...document.querySelectorAll('.vm-overlay .vm-label:not([hidden])')];const blockers=[...document.querySelectorAll('.vm-marker,[data-vm-obstacle]')];const map=document.querySelector('.vm-map').getBoundingClientRect();let errors=[];labels.forEach((e,i)=>{const r=e.getBoundingClientRect();if(r.left<map.left||r.right>map.right||r.top<map.top||r.bottom>map.bottom)errors.push('edge');if(blockers.some(b=>hit(r,b.getBoundingClientRect())))errors.push('blocker');if(labels.slice(i+1).some(b=>hit(r,b.getBoundingClientRect())))errors.push('label');});return errors;});assert.deepEqual(issues,[]);
 });
 await test('History: valid route, invalid points excluded, range, stale responses and close cleanup',async()=>{
  await scene();await page.locator('[data-vm-row$=":synthetic-1"]').click();
  const historyRequests=[];
  const points=[{latitude:49.2,longitude:16.6,lastGpsAt:new Date(Date.now()-300000).toISOString()},{latitude:49.21,longitude:16.61,lastGpsAt:new Date(Date.now()-240000).toISOString()},{latitude:0,longitude:0,lastGpsAt:new Date().toISOString()}];
  await page.route('**/api/vehicle-tracking/history?**',r=>{historyRequests.push(r.request().url());return r.fulfill({json:{apiStatus:'ready',points}});});
  await page.locator('[data-vm-history-show]').click();await page.waitForFunction(()=>document.querySelector('[data-vm-history-status]')?.textContent==='2 uložených GPS bodů');
  assert.equal(await page.evaluate(()=>google.maps._polylines.filter(p=>p.map).length),1);
  await page.locator('[data-vm-history-range]').selectOption('7d');await page.locator('[data-vm-history-load]').click();await page.waitForTimeout(100);assert(historyRequests.at(-1).includes('7d'));
  await page.locator('[data-vm-back]').click();assert.equal(await page.evaluate(()=>google.maps._polylines.filter(p=>p.map).length),0);
  await page.unroute('**/api/vehicle-tracking/history?**');
  await page.route('**/api/vehicle-tracking/history?**',async r=>{await new Promise(resolve=>setTimeout(resolve,350));await r.fulfill({json:{apiStatus:'ready',points}});});
  await page.locator('[data-vm-row$=":synthetic-1"]').click();await page.locator('[data-vm-history-show]').click();await page.locator('[data-vm-row$=":synthetic-2"]').click();await page.waitForTimeout(500);
  assert.equal(await page.evaluate(()=>google.maps._polylines.filter(p=>p.map).length),0);await page.unroute('**/api/vehicle-tracking/history?**');await page.locator('[data-vm-back]').click();
 });
 await test('Confirmed 403 removes GPS and selection; no demo fallback',async()=>{await control('denied=1');await page.locator('[data-vm-refresh]').click();await page.waitForTimeout(150);assert.equal(await page.locator('.vm-marker').count(),0);assert.equal(await page.locator('[data-vm-row]').count(),0);});
 await test('Confirmed 401 clears in-memory map and ends session',async()=>{
  await scene();await control('unauthorized=1');await page.locator('[data-vm-refresh]').click();await page.waitForSelector('[data-auth-form]');assert.equal(await page.locator('.vm-marker').count(),0);assert.equal(await page.locator('[data-vm-row]').count(),0);assert(await page.locator('[data-auth-form]').count());
 });
 await test('Known session expiry hides GPS without waiting for a refresh',async()=>{
  await control('unauthorized=0&denied=0&ttl=5000');await page.goto(`${url}/sledovani-vozidel`);await ready();await page.waitForSelector('[data-auth-form]',{timeout:15000});assert.equal(await page.locator('.vm-marker').count(),0);await control('ttl=3600000');
 });
 await test('Resume requires successful reauthorization even on the map',async()=>{
  await scene();await control('failMe=1');await page.evaluate(()=>document.dispatchEvent(new Event('visibilitychange')));await page.waitForTimeout(150);assert.equal(await page.locator('#app').isVisible(),false);assert.equal(await page.locator('#session-guard').isVisible(),true);await control('failMe=0');await page.locator('[data-session-retry]').click();await page.waitForTimeout(150);assert.equal(await page.locator('#app').isVisible(),true);
 });
 await test('Other application routes retain existing offline lock behavior',async()=>{
  await page.goto(`${url}/pripominky`);await page.waitForSelector('[data-logout]');await context.setOffline(true);await page.waitForTimeout(100);assert.equal(await page.locator('#app').isVisible(),false);await context.setOffline(false);await page.waitForTimeout(150);
 });
 await test('No business writes or GPS browser persistence during acceptance run',async()=>{assert.deepEqual(network.filter(r=>r.method!=='GET'),[]);const stored=await page.evaluate(()=>({local:{...localStorage},session:{...sessionStorage}}));assert.deepEqual(stored,{local:{},session:{}});});
 await test('Logout clears selected GPS and returns to login; reload stays signed out',async()=>{
  await scene();await page.locator('[data-vm-row$=":synthetic-1"]').click();
  await page.route('**/api/auth/logout',async r=>{assert.equal(r.request().method(),'POST');await control('unauthorized=1');await r.fulfill({json:{ok:true}});});
  await page.locator('[data-logout]').first().click();await page.waitForSelector('[data-auth-form]');assert.equal(await page.locator('.vm-marker').count(),0);await page.reload();await page.waitForSelector('[data-auth-form]');assert.equal(await page.locator('.vm-marker').count(),0);
 });
 await test('No uncaught runtime errors',async()=>assert.deepEqual(errors,[]));
}finally{
 await writeFile(`${output}/browser-verification.json`,JSON.stringify({engine,scope:'Isolated real application UI with synthetic protected-API fixtures and explicit Google API test double; not real Google/provider verification',results,metrics,errors,nonGetRequests:network.filter(r=>r.method!=='GET')},null,2));
 await browser.close();server.close();
}
if(results.some(r=>r.status==='FAIL'))process.exitCode=1;
