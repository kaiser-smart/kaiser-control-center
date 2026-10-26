import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {mkdir,writeFile} from 'node:fs/promises';
import {startPreview} from './preview-server.mjs';
const {chromium,webkit}=createRequire(import.meta.url)(process.env.PLAYWRIGHT_MODULE_PATH||'playwright');
const engine=process.env.VEHICLE_MAP_BROWSER||'webkit',output=process.env.VEHICLE_MAP_OUTPUT||'../outputs/mobile-list';await mkdir(output,{recursive:true});
const {server,url}=await startPreview(0),browser=await(engine==='webkit'?webkit.launch():chromium.launch({channel:'chrome'}));
const context=await browser.newContext({viewport:{width:315,height:500},isMobile:true,hasTouch:true,deviceScaleFactor:1});
const page=await context.newPage();page.setDefaultTimeout(10000);const errors=[],results=[];page.on('pageerror',e=>errors.push(e.message));await page.route('https://**/*',r=>r.abort());
const tap=async s=>{await page.locator(s).tap();await page.waitForTimeout(100);};
const filter=async key=>{await tap(`[data-vm-filter="${key}"]`);assert.equal(await page.locator(`[data-vm-filter="${key}"]`).getAttribute('aria-pressed'),'true');assert.match(await page.locator('[data-vm-page-number]').innerText(),/^1 \/ /);};
async function readPage(){
 const rows=page.locator('[data-vm-row]'),ids=[];
 for(let i=0;i<await rows.count();i++){
  const row=rows.nth(i);await row.scrollIntoViewIfNeeded();
  const d=await row.evaluate(e=>{const r=e.getBoundingClientRect(),p=document.querySelector('.vm-panel').getBoundingClientRect(),n=document.querySelector('.mobile-bottom-nav').getBoundingClientRect();return{top:r.top,bottom:r.bottom,height:r.height,panelTop:p.top,panelBottom:p.bottom,navTop:n.top,hit:e.contains(document.elementFromPoint(r.x+r.width/2,r.y+r.height/2))};});
  assert(d.top>=d.panelTop-1&&d.bottom<=Math.min(d.panelBottom,d.navTop)+1&&d.hit,`Vehicle row is clipped or blocked: ${JSON.stringify(d)}`);ids.push(await row.getAttribute('data-vm-row'));
 }
 return ids;
}
try{
 for(const [width,height] of [[315,500],[390,580],[390,664],[430,750],[844,390]]){
  await page.setViewportSize({width,height});await fetch(url+'/__preview/control?scene=mobile57&error=0&denied=0&unauthorized=0&ttl=3600000&failMe=0');await page.goto(url+'/sledovani-vozidel');await page.waitForSelector('.vm-marker');await tap('[data-vm-view="list"]');
  await filter('moving');assert.equal(await page.locator('#vm-search').evaluate(e=>getComputedStyle(e).backgroundColor),'rgb(17, 30, 39)');await page.screenshot({path:`${output}/${engine}-${width}x${height}-moving.png`});
  const moving=[...await readPage()];await page.screenshot({path:`${output}/${engine}-${width}x${height}-scrolled.png`});await tap('[data-vm-page="1"]');assert.match(await page.locator('[data-vm-page-number]').innerText(),/^2 \/ 2/);moving.push(...await readPage());assert.equal(new Set(moving).size,12);
  await filter('all');const all=[];
  for(let p=0;p<8;p++){all.push(...await readPage());if(p<7)await tap('[data-vm-page="1"]');}
  assert.equal(new Set(all).size,57);assert(await page.locator('[data-vm-page="1"]').isDisabled());
  await filter('moving');assert.equal(await page.locator('[data-vm-row]').count(),8);assert.equal(await page.locator('.vm-panel').evaluate(e=>e.scrollTop),0);
  await filter('all');await filter('stopped');assert.equal(await page.locator('[data-vm-count]').innerText(),'23 z 57 vozidel');await readPage();
  await filter('missing');assert.equal(await page.locator('[data-vm-row]').count(),1);await readPage();
  await filter('all');await page.locator('#vm-search').fill('TEST 057');assert.equal(await page.locator('[data-vm-row]').count(),1);await readPage();await page.locator('#vm-search').fill('');
  await page.locator('[data-vm-row]').nth(7).scrollIntoViewIfNeeded();await tap('[data-vm-row$=":synthetic-8"]');await tap('[data-vm-back]');await tap('[data-vm-view="list"]');const returned=await page.locator('[data-vm-row$=":synthetic-8"]').boundingBox();const panel=await page.locator('.vm-panel').boundingBox();assert(returned.y>=panel.y-1&&returned.y+returned.height<=panel.y+panel.height+1,'Return to list lost the selected row');
  await filter('moving');await tap('[data-vm-view="map"]');assert(await page.locator('.vm-map').isVisible());await tap('[data-vm-view="list"]');assert.equal(await page.locator('[data-vm-filter="moving"]').getAttribute('aria-pressed'),'true');
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);results.push(`${width}x${height}: all 57 and 12 moving reachable, filters reset page, search/detail/map preserved`);
 }
 await page.setViewportSize({width:390,height:360});await page.locator('#vm-search').focus();await page.locator('#vm-search').fill('TEST 001');await readPage();assert.equal(await page.locator('#vm-search').evaluate(e=>getComputedStyle(e).fontSize),'16px');
 assert.deepEqual(errors,[]);console.log('PASS '+engine+' '+results.join('\n'));
}finally{await writeFile(`${output}/${engine}-results.json`,JSON.stringify({results,errors},null,2));await browser.close();server.close();}
