import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { execFileSync } from 'node:child_process';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
const {chromium,webkit}=createRequire(import.meta.url)(process.env.PLAYWRIGHT_MODULE_PATH||'playwright');
const engine=process.env.VEHICLE_MAP_BROWSER||'chromium',before=process.env.MARKER_BEFORE==='1';
const output=process.env.VEHICLE_MAP_OUTPUT||'../outputs/marker-visibility';await mkdir(output,{recursive:true});
const url=process.env.MARKER_GOOGLE_URL;
if(!url)throw new Error('Set MARKER_GOOGLE_URL to the isolated preview-server running with VEHICLE_MAP_GOOGLE_RUNTIME; this suite verifies actual Google Maps.');
const browser=await(engine==='webkit'?webkit.launch({headless:true}):chromium.launch({headless:true,channel:'chrome'}));
const page=await browser.newPage({viewport:{width:1440,height:900}});page.setDefaultTimeout(10000);
const source=async file=>before&&process.env.MARKER_BASE_REF?execFileSync('git',['show',`${process.env.MARKER_BASE_REF}:${file}`],{encoding:'utf8',maxBuffer:8*1024*1024}):readFile(file,'utf8');
const errors=[],results=[];page.on('pageerror',e=>errors.push(e.message.replace(/AIza[\w-]+/g,'[REDACTED]')));
// The already authorized local Google preview may be shared by checkouts.
// Serve this checkout's sources only in this isolated browser context.
await page.route('**/src/**',async route=>{
 const file=new URL(route.request().url()).pathname.slice(1);
 if(!file.endsWith('.js')&&!file.endsWith('.css'))return route.continue();
 await route.fulfill({contentType:file.endsWith('.css')?'text/css':'text/javascript',body:await readFile(file,'utf8')});
});
await page.route('**/src/vehicle-map/google-map.js*',async route=>{let code=await source('src/vehicle-map/google-map.js');code=code.replace('let vehicles = [],','window.__visibilityMap=map; window.__visibilityMaps=maps; let vehicles = [],').replace('const overlay = new FleetOverlay();','const overlay = new FleetOverlay(); window.__visibilityOverlay=overlay;');await route.fulfill({contentType:'text/javascript',body:code});});
if(before&&process.env.MARKER_BASE_REF)for(const file of ['src/styles.css','src/vehicle-map/spatial.js','src/vehicle-map/presentation.js'])await page.route('**/'+file+'*',async route=>route.fulfill({contentType:file.endsWith('.css')?'text/css':'text/javascript',body:await source(file)}));
const control=async q=>fetch(url+'/__preview/control?'+q);
const ready=()=>page.waitForSelector('.vm-marker');
const marker=n=>page.locator(`.vm-marker[data-vm-marker$=":synthetic-${n}"]`);
const choose=async n=>{if((await page.viewportSize()).width<=720)await page.locator('[data-vm-view="list"]').click();await page.locator(`[data-vm-row$=":synthetic-${n}"]`).click();await page.waitForTimeout(250);};
const pulse=()=>page.evaluate(()=>[...document.querySelectorAll('.vm-marker')].filter(e=>getComputedStyle(e,'::after').animationName==='vm-selected-drive-pulse').map(e=>e.dataset.vmMarker));
const shot=async name=>page.screenshot({path:`${output}/${before?'before':'after'}-${engine}-${name}.png`});
// Capture actual painted phases, not just an animation-name declaration.
const ringPhases=async theme=>{
 const samples=[];
 for(const time of [625,1500,2250]){
  samples.push(await marker(1).evaluate((el,time)=>{
   const a=el.getAnimations({subtree:true}).find(a=>a.animationName==='vm-selected-drive-pulse');
   if(!a)throw new Error('Selected current vehicle has no pulse animation');
   a.pause();a.currentTime=time;
   const s=getComputedStyle(el,'::after'),base=getComputedStyle(el,'::before');
   const scale=new DOMMatrixReadOnly(s.transform).a;
   return {time,scale,opacity:Number(s.opacity),gap:(parseFloat(s.width)*scale-parseFloat(base.width))/2};
  },time));
  await shot(`${theme}-pulse-${time}`);
 }
 await marker(1).evaluate(el=>el.getAnimations({subtree:true}).find(a=>a.animationName==='vm-selected-drive-pulse').play());
 await writeFile(`${output}/${before?'before':'after'}-${engine}-${theme}-pulse.json`,JSON.stringify(samples,null,2));
 return samples;
};
const test=async(name,fn)=>{await fn();results.push(name);console.log('PASS '+name);};
try{
 await control('scene=overview&error=0&denied=0&unauthorized=0&ttl=3600000&failMe=0');await page.goto(url+'/sledovani-vozidel');await ready();
 await page.evaluate(()=>{__visibilityMap.setZoom(11);__visibilityMap.panTo({lat:49.215,lng:16.62});});await page.waitForTimeout(800);await choose(1);
 await shot('dark-1440x900');
 const darkPhases=await ringPhases('dark');
 if(!before){
  await test('Painted ring clears selection by at least 6px early, expands and gradually fades',async()=>{
   assert.ok(darkPhases[0].gap>=6,JSON.stringify(darkPhases));
   assert.ok(darkPhases[0].opacity>=.5,JSON.stringify(darkPhases));
   assert.ok(darkPhases[1].scale>darkPhases[0].scale);
   assert.ok(darkPhases[2].scale>darkPhases[1].scale);
   assert.ok(darkPhases[0].opacity>darkPhases[1].opacity&&darkPhases[1].opacity>darkPhases[2].opacity);
  });
  await test('Only selected current moving vehicle pulses; cycle 2.5 seconds; artwork and label do not animate',async()=>{
   assert.equal((await pulse()).length,1);
   const styles=await marker(1).evaluate(el=>({cycle:getComputedStyle(el,'::after').animationDuration,art:getComputedStyle(el.querySelector('.vm-art')).animationName,body:getComputedStyle(el).animationName}));
   assert.deepEqual(styles,{cycle:'2.5s',art:'none',body:'none'});
   const first=await marker(1).evaluate(el=>getComputedStyle(el,'::after').transform);await page.waitForTimeout(900);assert.notEqual(await marker(1).evaluate(el=>getComputedStyle(el,'::after').transform),first);
  });
  await test('SPZ 14px bold on light background, 7px corners; click preserves icon and plate geometry',async()=>{
   const geometry=()=>page.evaluate(()=>{const m=document.querySelector('.vm-marker.is-selected'),a=m.querySelector('.vm-art').getBoundingClientRect(),l=document.querySelector('.vm-label.is-selected'),r=l.getBoundingClientRect(),s=getComputedStyle(l);return{art:[a.x,a.y,a.width,a.height],label:[r.x,r.y,r.width,r.height],font:s.fontSize,weight:s.fontWeight,bg:s.backgroundColor,color:s.color,radius:s.borderRadius};});
   assert.equal(await page.locator('.vm-label.is-selected').isVisible(),true);const a=await geometry();assert.ok(a.label[2]>0);assert.equal(a.font,'14px');assert.equal(a.weight,'700');assert.equal(a.bg,'rgb(250, 252, 253)');assert.equal(a.color,'rgb(27, 38, 45)');assert.equal(a.radius,'7px');
   await marker(1).click();await page.waitForTimeout(250);assert.deepEqual(await geometry(),a);
  });
  await test('First selection does not shift the visible artwork or SPZ',async()=>{
   await choose(3);
   const geometry=async()=>({art:await marker(1).locator('.vm-art').boundingBox(),label:await page.locator('.vm-label').filter({hasText:/^TEST 001$/}).boundingBox()});
   const old=await geometry();assert.ok(old.label);await marker(1).click();await page.waitForTimeout(250);assert.deepEqual(await geometry(),old);
  });
  await test('Reduced motion disables pulse',async()=>{await page.emulateMedia({reducedMotion:'reduce'});assert.deepEqual(await pulse(),[]);await page.emulateMedia({reducedMotion:'no-preference'});assert.equal((await pulse()).length,1);});
  await test('Pulse stops when current GPS ages past 120 seconds without receiving another sample',async()=>{
   await page.clock.setFixedTime(new Date(Date.now()+180000));await page.waitForTimeout(1300);assert.deepEqual(await pulse(),[]);
   await page.clock.setFixedTime(new Date());await page.waitForTimeout(1300);assert.equal((await pulse()).length,1);
  });
  for(const [n,name] of [[3,'stopped'],[2,'stale'],[8,'unknown'],[12,'missing']])await test(name+' GPS/movement has no pulse',async()=>{await choose(n);assert.deepEqual(await pulse(),[]);await shot(name);});
 }
 await choose(1);await page.evaluate(()=>{__visibilityMap.setOptions({styles:[]});__visibilityMap.setZoom(11);__visibilityMap.panTo({lat:49.215,lng:16.62});});await page.waitForTimeout(1000);await shot('light-1440x900');
 await ringPhases('light');
 if(!before)await test('Pan and zoom retain selection and fixed geographic anchor',async()=>{const old=await page.evaluate(()=>__visibilityMap.getZoom());await page.locator('[data-vm-zoom="1"]').click();await page.evaluate(()=>__visibilityMap.panBy(60,20));await page.waitForTimeout(800);assert.equal(await page.evaluate(()=>__visibilityMap.getZoom()),old+1);assert.equal(await page.locator('.vm-marker.is-selected').count(),1);assert.equal((await pulse()).length,1);const delta=await page.evaluate(()=>{const a=document.querySelector('.vm-marker.is-selected').getBoundingClientRect(),b=document.querySelector('.vm-map').getBoundingClientRect(),p=__visibilityOverlay.getProjection().fromLatLngToContainerPixel(new __visibilityMaps.LatLng(49.22,16.5));return [a.x+a.width/2-b.x-p.x,a.y+a.height/2-b.y-p.y];});assert.ok(delta.every(n=>Math.abs(n)<.75),JSON.stringify(delta));});
 for(const width of [1024,768,430,390,375,320]) {await page.setViewportSize({width,height:width>=768?768:width>=375?844:700});await page.evaluate(()=>{__visibilityMap.setZoom(11);__visibilityMap.panTo({lat:49.215,lng:16.62});});await page.waitForTimeout(250);await choose(1);await page.waitForTimeout(400);await shot('light-'+width);if(!before){assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),true);assert.equal((await pulse()).length,1);assert.equal(await page.locator('.vm-label.is-selected').isVisible(),true);if(width<=720){const plate=await page.locator('.vm-label.is-selected').boundingBox(),panel=await page.locator('.vm-panel-detail').boundingBox();assert.ok(plate.y+plate.height<panel.y,'Selected plate is fully above mobile detail');}}}
 if(!before){
  await page.setViewportSize({width:1440,height:900});await control('scene=same6');await page.goto(url+'/sledovani-vozidel');await ready();await page.locator('.vm-cluster').click();await page.waitForTimeout(500);await choose(1);
  await test('Coincident vehicles keep exact group count, selected SPZ priority and no plate collisions',async()=>{assert.equal(await page.locator('.vm-marker:not(.vm-cluster)').count(),6);assert.equal(await page.locator('.vm-label.is-selected:not([hidden])').count(),1);const overlap=await page.evaluate(()=>{const a=[...document.querySelectorAll('.vm-label:not(.vm-measure):not([hidden])')].map(el=>el.getBoundingClientRect());return a.some((r,i)=>a.slice(i+1).some(s=>r.left<s.right&&r.right>s.left&&r.top<s.bottom&&r.bottom>s.top));});assert.equal(overlap,false);await shot('cluster-six');});
  assert.deepEqual(errors,[]);console.log('PASS no browser errors');
 }
}finally{await writeFile(`${output}/${before?'before':'after'}-${engine}-results.json`,JSON.stringify({map:'Actual Google Maps; isolated synthetic vehicles',results,errors},null,2));await browser.close();}
