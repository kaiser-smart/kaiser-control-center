// Synthetic read-only UI acceptance. No production credentials or remote network.
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import {createRequire} from 'node:module';
import path from 'node:path';
const require=createRequire(import.meta.url),{webkit,chromium}=require(process.env.PLAYWRIGHT_MODULE_PATH||'playwright');
const root=path.resolve(import.meta.dirname,'..'),output=process.env.VISTOS_TEST_OUTPUT||'/private/tmp/jobs-six-tabs-proof';
const html=`<!doctype html><html lang="cs"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/src/styles.css"><link rel="stylesheet" href="/src/ui-system-pilot.css"><link rel="stylesheet" href="/src/mobile-workspace.css"><link rel="stylesheet" href="/src/icon-system.css"><link rel="stylesheet" href="/src/vistos-workspace.css"><style>body{margin:0;padding:16px;font:14px sans-serif;background:#e0e5e8}*{box-sizing:border-box}</style><main></main><script type="module">import {vistosWorkspaceSection,mountVistosWorkspace} from '/src/components/VistosWorkspace.js';const app=document.querySelector('main');app.innerHTML=vistosWorkspaceSection();mountVistosWorkspace(app,{user:{role:'admin'},apiJson:async(url,options)=>{const r=await fetch(url,options),b=await r.json();if(!r.ok)throw Error(b.error);return b;}});</script></html>`;
const server=createServer(async(req,res)=>{const url=new URL(req.url,'http://localhost');if(url.pathname==='/zakazky'){res.setHeader('Content-Type','text/html');res.end(html);return;}const file=path.resolve(root,'.'+url.pathname);if(!file.startsWith(root+'/src/')){res.writeHead(404);res.end();return;}try{res.setHeader('Content-Type',file.endsWith('.css')?'text/css':'text/javascript');res.end(await readFile(file));}catch{res.writeHead(404);res.end();}});
await new Promise(r=>server.listen(0,'127.0.0.1',r));const origin=`http://127.0.0.1:${server.address().port}`;
const f=(value,availability='known')=>({value,label:'Zdrojový údaj',availability,source:'detail',disclosure:'operational'});
const job={id:'fixture-94',number:'2026010094',customer:'Ukázkový zákazník · syntetický test',place:null,service:null,status:'unverified',plannedDay:'2026-07-02',vehicleIds:[],unassigned:true,needsReview:true,receivedAt:'2026-10-26T06:00:00Z',fields:{Number:f('2026010094'),Status_FK:f('14521','unverified'),Contract_FK:f(null,'null'),Description:f('<img src=x onerror=alert(1)>')}};
const items=['14 06 03 - Jiná rozpouštědla','06 05 02 - Kaly z čištění odpadních vod v místě jejich vzniku obs. NL'].map((name,i)=>({id:'i'+i,fields:{Id:f('55731'+(5+i)),Product_FK_Caption:f(name,'unverified'),Quantity:f(i?'0.215':'0.018','unverified'),...Object.fromEntries(Array.from({length:25},(_,n)=>['technical'+n,f(null,'not_exposed')]))}}));
const tabs=['Přehled','Provedení','Položky','Doklady','Všechna data','Historie'],results=[],errors=[];let browser;
try{await mkdir(output,{recursive:true});for(const [engine,type]of [['webkit',webkit],['chromium',chromium]]){
 browser=await type.launch({headless:true,...(engine==='chromium'&&process.env.CHROME_PATH?{executablePath:process.env.CHROME_PATH}:{})});
 for(const width of [375,390,768,1440]){
  const context=await browser.newContext({viewport:{width,height:900},serviceWorkers:'block'});let finance=false,executionFail=false,historyFail=false,itemCount=2,partial=false;
  await context.route('**/*',async route=>{const url=new URL(route.request().url());if(url.origin!==origin)return route.abort();if(!url.pathname.startsWith('/api/'))return route.continue();assert.equal(route.request().method(),'GET','Opening UI must never write');
   if(url.pathname==='/api/jobs/preferences')return route.fulfill({json:{columns:[]}});
   if(url.pathname==='/api/jobs')return route.fulfill({json:{rows:[job],stats:{total:1,review:1,unassigned:1},pagination:{page:1,pageSize:50,total:1},rights:{},companies:['1'],period:'all',dateVerified:true,streams:[]}});
   if(url.pathname==='/api/jobs/fixture-94')return route.fulfill({json:{job,items:items.slice(0,itemCount).map(i=>finance?{...i,fields:{...i.fields,PriceWithTax:f('0'),Currency_FK_Caption:f('CZK')}}:i),itemsAvailable:true,itemsPartial:partial,itemsPagination:{page:1,total:itemCount,hasNext:false},rights:{manage:true,personal:false,finance},attachmentsAvailable:false}});
   if(url.pathname.endsWith('/execution'))return route.fulfill({status:executionFail?403:200,json:executionFail?{error:'Nemáte oprávnění ke sledování vozidel.'}:{assignmentStatus:'unavailable',coverageStatus:'unavailable',reasons:['history_not_imported']}});
   if(url.pathname.endsWith('/history'))return route.fulfill({status:historyFail?503:200,json:historyFail?{error:'Načtení se nezdařilo.'}:{events:[{id:'e1',kind:'source_changed',created_at:'2026-10-26T06:00:00Z',changedFields:[{field:'Quantity',label:'Množství'}]}],next:null}});
   return route.fulfill({status:404,json:{error:'Unexpected endpoint'}});
  });
  const page=await context.newPage();page.setDefaultTimeout(8000);page.on('pageerror',e=>errors.push(e.message));await page.goto(origin+'/zakazky?period=all');
  await page.getByRole('button',{name:'Položky 2026010094',exact:true}).filter({visible:true}).first().click();await page.locator('.vj-item-row').first().waitFor();
  assert.equal(await page.locator('.vj-item-row').count(),2);assert.equal(await page.locator('.vj-item-details[open]').count(),0);assert.equal(await page.locator('.vj-item-name').count(),2);
  assert.ok((await page.locator('dialog').innerText()).includes('0,018'));assert.ok(!(await page.locator('dialog').innerText()).includes('technical0'));
  assert.equal(await page.locator('.vj-items-table > thead > tr > th').count(),3);
  for(let index=0;index<tabs.length;index++){
   await page.getByRole('tab',{name:tabs[index],exact:true}).click();
   if(index===1)await page.getByText('Časová historie zatím nebyla načtena.',{exact:true}).waitFor();
   if(index===2)await page.locator('.vj-item-row').first().waitFor();
   if(index===4)await page.getByLabel('Záznam',{exact:true}).locator('option').nth(2).waitFor({state:'attached'});
   if(index===5)await page.locator('.vj-history').waitFor();
   assert.equal(await page.getByRole('tab',{name:tabs[index],exact:true}).getAttribute('aria-selected'),'true');
   assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
   assert.ok(await page.locator('[data-tab-body]').evaluate(el=>el.scrollWidth<=el.clientWidth+1),'No horizontal panel overflow');
   assert.deepEqual(await page.locator('dialog button,dialog summary,dialog input,dialog select').evaluateAll(els=>els.filter(el=>el.getClientRects().length&&el.checkVisibility()).filter(el=>el.getBoundingClientRect().height<43.9).map(el=>el.textContent)),[],'Touch controls at least 44px');
   const heading=await page.locator('#vj-detail-title').boundingBox(); // Pure browser fixture, not live-user automation.
   assert.ok(heading.y>=0);
   await page.screenshot({path:path.join(output,`${engine}-${width}-tab-${index}.png`)});
  }
  await page.getByRole('tab',{name:'Všechna data',exact:true}).click();await page.getByLabel('Záznam',{exact:true}).selectOption('1');await page.getByLabel('Hledat v datech',{exact:true}).fill('Quantity');
  assert.equal(await page.locator('[data-fields] tbody tr').count(),1);assert.ok((await page.locator('[data-fields]').innerText()).includes('0.215'));
  assert.equal(await page.locator('dialog img').count(),0);
  await page.getByRole('tab',{name:'Položky',exact:true}).click();await page.locator('.vj-item-row').first().waitFor();await page.locator('.vj-item-details summary').first().click();assert.ok((await page.locator('dialog').innerText()).includes('technical0'));
  await page.reload();await page.locator('.vj-item-row').first().waitFor();assert.equal(await page.getByRole('tab',{name:'Položky',exact:true}).getAttribute('aria-selected'),'true');
  await page.getByRole('tab',{name:'Položky',exact:true}).press('ArrowRight');assert.equal(await page.getByRole('tab',{name:'Doklady',exact:true}).getAttribute('aria-selected'),'true');
  await page.getByRole('tab',{name:'Doklady',exact:true}).press('Home');assert.equal(await page.getByRole('tab',{name:'Přehled',exact:true}).getAttribute('aria-selected'),'true');
  for(let n=0;n<20;n++){await page.keyboard.press('Tab');assert.ok(await page.evaluate(()=>document.activeElement.closest('dialog')!==null),'Focus remains trapped');}
  executionFail=true;await page.getByRole('tab',{name:'Provedení',exact:true}).click();await page.getByRole('alert').waitFor();assert.ok((await page.locator('dialog').innerText()).includes('2. 7. 2026.'));executionFail=false;await page.getByRole('button',{name:'Zkusit znovu',exact:true}).click();await page.getByText('Časová historie zatím nebyla načtena.',{exact:true}).waitFor();
  historyFail=true;await page.getByRole('tab',{name:'Historie',exact:true}).click();await page.getByRole('button',{name:'Zkusit historii znovu'}).waitFor();historyFail=false;await page.getByRole('button',{name:'Zkusit historii znovu'}).click();await page.locator('.vj-history').waitFor();
  itemCount=0;partial=true;await page.getByRole('tab',{name:'Položky',exact:true}).click();await page.getByText('Položky zatím nejsou načtené.',{exact:true}).waitFor();partial=false;await page.getByRole('button',{name:'Obnovit zobrazení položek'}).click();await page.getByText('Zakázka nemá položky.',{exact:true}).waitFor();
  finance=true;itemCount=2;await page.getByRole('button',{name:'Obnovit zobrazení položek'}).click();await page.locator('.vj-item-row').first().waitFor();assert.equal(await page.locator('.vj-items-table > thead > tr > th').count(),4);assert.ok((await page.locator('.vj-item-row').first().innerText()).includes('CZK'));assert.ok((await page.locator('.vj-item-row').first().innerText()).includes('0'));
  await page.keyboard.press('Escape');await page.getByRole('dialog').waitFor({state:'detached'});assert.equal(new URL(page.url()).searchParams.get('detail'),null);assert.equal(new URL(page.url()).searchParams.get('q'),null);assert.ok(await page.locator('button:focus').count());
  results.push({engine,width,sixTabs:true,twoRows:true,exactQuantities:true,noGuessedUnits:true,noOverflow:true,keyboard:true,focusTrap:true,deepLinkReload:true,permissionAndRetry:true,emptyVsPartial:true,financialZero:true});await context.close();
 }
 await browser.close();browser=null;
}
assert.deepEqual(errors,[]);await writeFile(path.join(output,'results.json'),JSON.stringify({synthetic:true,productionVerified:false,results},null,2));console.log(JSON.stringify(results));
}finally{await browser?.close();await new Promise(r=>server.close(r));}
