// Isolated synthetic component tests; only a loopback fixture server is reachable.
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import {createRequire} from 'node:module';
import path from 'node:path';
const require=createRequire(import.meta.url);
const {webkit}=require(process.env.PLAYWRIGHT_MODULE_PATH||'playwright');
const root=path.resolve(import.meta.dirname,'..'),output=process.env.VISTOS_TEST_OUTPUT||'/private/tmp/vistos-jobs-ui-proof';
const html=`<!doctype html><html lang="cs"><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><link rel="stylesheet" href="/src/vistos-workspace.css"><style>body{margin:0;padding:16px;font:16px sans-serif;box-sizing:border-box}*{box-sizing:border-box}</style><main></main><script type="module">
import {vistosWorkspaceSection,mountVistosWorkspace} from '/src/components/VistosWorkspace.js';
const app=document.querySelector('main');app.innerHTML=vistosWorkspaceSection();
mountVistosWorkspace(app,{user:{role:'admin'},apiJson:async (url,options)=>{const r=await fetch(url,options);const b=await r.json();if(!r.ok)throw new Error(b.error);return b;}});
</script></html>`;
const server=createServer(async(req,res)=>{
 const url=new URL(req.url,'http://localhost');
 if(url.pathname==='/zakazky'){res.setHeader('Content-Type','text/html');res.end(html);return;}
 const file=path.resolve(root,'.'+url.pathname);
 if(!file.startsWith(root+'/src/')){res.writeHead(404);res.end();return;}
 try{res.setHeader('Content-Type',file.endsWith('.css')?'text/css':'text/javascript');res.end(await readFile(file));}catch{res.writeHead(404);res.end();}
});
await new Promise(r=>server.listen(0,'127.0.0.1',r));const origin=`http://127.0.0.1:${server.address().port}`;
let browser;const errors=[],checks=[];
const field=(value)=>({value,label:'Test',source:'detail',availability:'known',disclosure:'operational'});
const record={id:'fixture-1',number:'ZL-TEST-1',customer:'Testovací zákazník',place:'Testovací místo',service:'Testovací služba',status:'unverified',vehicleIds:[],driverId:null,needsReview:true,unassigned:true,receivedAt:'2026-10-25T10:00:00Z',fields:{Number:field('ZL-TEST-1'),Description:field('<img src=x onerror="alert(1)">')}};
const payload=rows=>({rows,stats:{total:rows.length,inProgress:0,unassigned:rows.length,review:rows.length,unknownDate:rows.length},pagination:{page:1,pageSize:50,total:rows.length},rights:{},companies:['fixture-company'],importProgress:{total:1,lastReceivedAt:'2026-10-25T10:00:00Z',itemsPending:1},streams:[],period:'all',dateVerified:false});
try{
 await mkdir(output,{recursive:true});browser=await webkit.launch({headless:true});
 for(const width of [390,1440]){
  const context=await browser.newContext({viewport:{width,height:900},serviceWorkers:'block'});let fail=true,empty=false,slowRelease,detailReads=0,itemPosts=0,itemsLoaded=false,manage=true;
  await context.route('**/*',async route=>{
   const url=new URL(route.request().url());if(url.origin!==origin)return route.abort();
   if(!url.pathname.startsWith('/api/'))return route.continue();
   if(url.pathname==='/api/jobs/fixture-1/items/refresh'&&route.request().method()==='POST'){itemPosts++;itemsLoaded=true;return route.fulfill({json:{status:'compared'}});}
   if(route.request().method()!=='GET')throw Error('unexpected mutation');
   if(url.pathname==='/api/jobs/preferences')return route.fulfill({json:{columns:[]}});
   if(url.pathname==='/api/jobs/fixture-1'){detailReads++;const second=url.searchParams.get('itemsPage')==='2';return route.fulfill({json:{job:record,items:itemsLoaded?[{fields:{Name:field(second?'Poslední položka':'Čištění <img src=x onerror=alert(1)>')}}]:[],itemsAvailable:true,itemsPartial:!itemsLoaded,itemsPagination:{page:second?2:1,total:itemsLoaded?101:0,hasNext:itemsLoaded&&!second},rights:{manage}}});}
   if(url.pathname==='/api/jobs'){
    const search=url.searchParams.get('q');if(search==='slow')await new Promise(r=>{slowRelease=r;});
    return route.fulfill({status:fail?403:200,json:fail?{error:'Chybí potvrzený firemní rozsah přístupu.'}:payload(empty||search==='none'?[]:[{...record,number:search==='fast'?'ZL-FAST':record.number}])});
   }
   return route.fulfill({json:{events:[],next:null}});
  });
  const page=await context.newPage();page.setDefaultTimeout(8000);page.on('pageerror',e=>errors.push(e.message));
  await page.goto(origin+'/zakazky');await page.getByRole('heading',{name:'Zakázky se nepodařilo načíst'}).waitFor();
  assert.equal(await page.locator('.vj-kpis,.vj-empty,.vj-notice').count(),0);
  assert.ok(await page.getByRole('alert').textContent().then(t=>t.includes('Chybí potvrzený firemní rozsah')));
  assert.equal(await page.locator('[data-vistos-workspace]').getAttribute('aria-busy'),'false');
  await page.screenshot({path:path.join(output,`error-${width}.png`)});
  fail=false;await page.getByRole('button',{name:'Zkusit znovu',exact:true}).click();await page.locator('.vj-kpis').waitFor();
  assert.ok((await page.locator('.vj-meta').allTextContents()).some(t=>t.includes('Poslední načtená změna:')&&!t.includes('Neověřeno')));
  assert.equal(await page.locator('.vj-load-error').count(),0);assert.ok(await page.locator('.vj-quality-mark').count()>0);
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
  const detail=page.getByRole('button',{name:'Detail ZL-TEST-1',exact:true}).filter({visible:true}).first();await detail.click();
  await page.getByRole('dialog').waitFor();
  // Items are refreshed on tab entry, without importing merely by viewing.
  itemsLoaded=true;await page.getByRole('tab',{name:'Položky',exact:true}).click();
  await page.getByText('Načteno položek: 101',{exact:true}).waitFor();assert.equal(itemPosts,0);assert.ok(detailReads>=2);
  assert.equal(await page.locator('dialog img').count(),0);
  await page.getByRole('button',{name:'Další položky',exact:true}).click();await page.getByText('Poslední položka',{exact:true}).first().waitFor();
  await page.getByRole('button',{name:'Načíst položky z Vistosu',exact:true}).click();await page.getByText('Položky byly porovnány s Vistosem.',{exact:true}).waitFor();assert.equal(itemPosts,1);
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
  await page.screenshot({path:path.join(output,`items-${width}.png`)});
  manage=false;await page.getByRole('button',{name:'Obnovit zobrazení položek',exact:true}).click();await page.getByText('Poslední položka',{exact:true}).first().waitFor();assert.equal(await page.locator('[data-items-import]').count(),0);
  await page.getByRole('tab',{name:'Všechna data',exact:true}).click();
  assert.equal(await page.locator('dialog img').count(),0);assert.ok((await page.locator('dialog').textContent()).includes('<img src=x'));
  await page.keyboard.press('Escape');await page.getByRole('dialog').waitFor({state:'detached'});
  assert.equal(await page.locator('button:focus').getAttribute('data-vj-action'),'detail');
  await page.getByRole('button',{name:'Položky ZL-TEST-1',exact:true}).filter({visible:true}).first().click();await page.getByText('Načteno položek: 101',{exact:true}).waitFor();await page.keyboard.press('Escape');await page.getByRole('dialog').waitFor({state:'detached'});
  // A failed new filter must not keep showing the old result under the new filter.
  fail=true;await page.getByLabel('Hledání',{exact:true}).fill('error');await page.getByRole('alert').waitFor();
  assert.equal(await page.locator('.vj-kpis,.vj-mobile-cards,.vj-table').count(),0);
  fail=false;empty=true;await page.getByRole('button',{name:'Zkusit znovu',exact:true}).click();await page.getByRole('heading',{name:'Žádné dostupné zakázky'}).waitFor();
  assert.equal(await page.getByRole('alert').count(),0);
  empty=false;await page.getByRole('button',{name:'Zobrazit všechny načtené zakázky',exact:true}).click();assert.equal(new URL(page.url()).searchParams.get('period'),'all');await page.getByRole('button',{name:'Detail ZL-TEST-1',exact:true}).filter({visible:true}).first().waitFor();
  // Delayed responses cannot replace the current query's result.
  await page.getByLabel('Hledání',{exact:true}).fill('slow');await page.waitForRequest(r=>new URL(r.url()).searchParams.get('q')==='slow');
  await page.getByLabel('Hledání',{exact:true}).fill('fast');await page.getByRole('button',{name:'Detail ZL-FAST',exact:true}).filter({visible:true}).first().waitFor();
  const response=page.waitForResponse(r=>new URL(r.url()).searchParams.get('q')==='slow');slowRelease();await response;
  await page.waitForLoadState('networkidle');assert.ok(await page.getByRole('button',{name:'Detail ZL-FAST',exact:true}).filter({visible:true}).first().isVisible());
  await page.screenshot({path:path.join(output,`loaded-${width}.png`)});checks.push({width,errorsDistinctFromEmpty:true,retry:true,filterFailureClearsStaleRows:true,escapeAndFocus:true,safeSourceText:true,noOverflow:true,staleResponseIgnored:true,itemsRefreshOnEntry:true,itemsPageTwo:true,explicitImportOnly:true,itemsPermission:true,directItemsButton:true});await context.close();
 }
 assert.deepEqual(errors,[]);await writeFile(path.join(output,'results.json'),JSON.stringify({synthetic:true,productionVerified:false,checks},null,2));console.log(JSON.stringify({synthetic:true,checks}));
}finally{await browser?.close();await new Promise(r=>server.close(r));}
