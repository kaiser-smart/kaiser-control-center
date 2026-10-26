// Isolated synthetic browser regression; all APIs are mocked, external traffic denied.
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import {createRequire} from 'node:module';
import path from 'node:path';
const require=createRequire(import.meta.url);
const {webkit,devices}=require(process.env.PLAYWRIGHT_MODULE_PATH||'playwright');
const root=path.resolve(import.meta.dirname,'../dist');
const output=path.resolve(process.env.PWA_TEST_OUTPUT||'output/employee-card-toolbar');
const baseline=process.env.TOOLBAR_BASELINE==='1';
await mkdir(output,{recursive:true});
const mime={'.js':'text/javascript','.css':'text/css','.html':'text/html','.svg':'image/svg+xml','.png':'image/png','.json':'application/json'};
const server=createServer(async(req,res)=>{
 let file=path.join(root,new URL(req.url,'http://localhost').pathname);if(!path.extname(file))file=path.join(file,'index.html');
 let content;try{content=await readFile(file);}catch{file=path.join(root,'index.html');content=await readFile(file);}
 res.writeHead(200,{'Content-Type':mime[path.extname(file)]||'application/octet-stream'});res.end(content);
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const origin=`http://127.0.0.1:${server.address().port}`;
const employees=[{id:'test-person',userId:'test-person',firstName:'Testovací',lastName:'Zaměstnankyně',name:'Testovací Zaměstnankyně',role:'ridic',employmentStatus:'active',position:'Vedoucí evidence odpadů',department:'Management'},
{id:'test-second',firstName:'Velmi dlouhé testovací jméno',lastName:'Zaměstnance pro kontrolu zalamování',name:'Velmi dlouhé testovací jméno Zaměstnance pro kontrolu zalamování',role:'ridic',employmentStatus:'active',position:'Řidič',department:'Provoz'}];
const results=[],errors=[],writes=[];let browser;
try{
 browser=await webkit.launch({headless:true});
 for(const role of baseline?['admin']:['admin','management','kancelar','garazmistr','dispecer','ridic','readonly']){
  for(const width of [320,375,390,430,768,1024,1440,1920]){
   const context=await browser.newContext({...width<720?devices['iPhone 13']:{deviceScaleFactor:1},viewport:{width,height:900},serviceWorkers:'block'});
   await context.route('**/*',async route=>{
    const url=new URL(route.request().url());
    const fonts=process.env.PWA_FONT_FIXTURES;
    if(fonts&&url.hostname==='fonts.googleapis.com')return route.fulfill({contentType:'text/css',body:await readFile(path.join(fonts,'quicksand.css'))});
    if(fonts&&url.hostname==='fonts.gstatic.com')return route.fulfill({contentType:'font/ttf',body:await readFile(path.join(fonts,path.basename(url.pathname)))});
    if(url.origin!==origin)return route.abort();
    if(!url.pathname.startsWith('/api/'))return route.continue();
    if(route.request().method()!=='GET')writes.push({role,width,path:url.pathname});
    let body={apiStatus:'ready',settings:{},items:[],requests:[],users:[],messages:[],show:false};
    if(url.pathname==='/api/me')body={user:{id:'test-person',name:'Testovací účet',email:'test@example.test',role,status:'active',active:true}};
    else if(url.pathname==='/api/employees')body={employees,apiStatus:'ready'};
    else if(employees.some(e=>url.pathname===`/api/employees/${e.id}`))body={employee:employees.find(e=>url.pathname.endsWith('/'+e.id)),apiStatus:'ready'};
    return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(body)});
   });
   const page=await context.newPage();page.setDefaultTimeout(10000);page.on('pageerror',e=>errors.push({role,width,error:e.message}));
   await page.goto(origin+'/zamestnanci/test-person');await page.locator('#employee-card-title').waitFor();await page.evaluate(()=>document.fonts.ready);
   if(role==='admin')await page.screenshot({path:path.join(output,`employee-card-${width}.png`)});
   const canEdit=['admin','management','kancelar'].includes(role);
   assert.equal(await page.locator('.employee-card-header [data-employee-edit-open]').count(),canEdit?1:0);
   assert.equal(await page.locator('.employee-card-header [data-employee-add-open]').count(),canEdit?1:0);
   const measure=async()=>page.locator('.employee-card-header').evaluate(header=>{
    const box=n=>{const b=n.getBoundingClientRect();return {x:b.x,y:b.y,width:b.width,height:b.height,right:b.right,bottom:b.bottom}};
    const controls=[...header.querySelectorAll('a,button,select')].filter(n=>n.getBoundingClientRect().width).map(box);
    const overlap=controls.some((a,i)=>controls.slice(i+1).some(b=>a.x<b.right-1&&a.right>b.x+1&&a.y<b.bottom-1&&a.bottom>b.y+1));
    const bounds=box(header),toolbar=header.querySelector('.employee-card-header__toolbar');
    return {overflow:document.documentElement.scrollWidth>innerWidth+1,overlap,controls,bounds,toolbar:toolbar?box(toolbar):null,actions:box(header.querySelector('.employee-card-header__actions')),select:box(header.querySelector('select'))};
   });
   let layout=await measure();assert.equal(layout.overflow,false);assert.equal(layout.overlap,false);
   if(!baseline){
    assert(layout.toolbar.y>=layout.actions.bottom,'Secondary toolbar must sit below primary actions');
    assert(layout.select.height>=44,'Employee selector touch target');
    assert(layout.controls.every(b=>b.x>=layout.bounds.x&&b.right<=layout.bounds.right+1),'Controls stay inside header');
    assert.equal(await page.getByLabel('Přejít na zaměstnance',{exact:true}).count(),1);
    if(canEdit){
     await page.locator('.employee-card-header [data-employee-edit-open]').click();await page.locator('[data-employee-editor-backdrop]').waitFor();await page.getByRole('button',{name:'Zavřít editaci zaměstnance',exact:true}).click();
     await page.locator('.employee-card-header [data-employee-add-open]').click();await page.locator('#employee-add-title').waitFor();await page.getByRole('button',{name:'Zavřít přidání zaměstnance',exact:true}).click();
    }
    await page.locator('[data-employee-card-select]').selectOption('test-second');await page.waitForURL('**/zamestnanci/test-second');await page.locator('#employee-card-title').filter({hasText:employees[1].name}).waitFor();
    const longLayout=await measure();assert.equal(longLayout.overflow,false);assert.equal(longLayout.overlap,false);
    if(role==='admin')await page.screenshot({path:path.join(output,`employee-card-long-${width}.png`)});
    await page.locator('.employee-card-header__actions a').click();await page.locator('.absence-table--employees').waitFor();assert.equal(new URL(page.url()).pathname,'/zamestnanci');
   }
   results.push({role,width,canEdit,layout,status:'passed'});await context.close();
  }
 }
 assert.deepEqual(errors,[]);assert.deepEqual(writes,[]);
 await writeFile(path.join(output,'results.json'),JSON.stringify({baseline,results,errors,writes,physicalIPhone:false},null,2));
 console.log(baseline ? `PASS ${results.length} baseline screenshots and layout checks.` : `PASS ${results.length} role/viewport cases: layout, permissions, edit/add opening, employee switching, long names, return link; no API writes.`);
}finally{await browser?.close();server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}
