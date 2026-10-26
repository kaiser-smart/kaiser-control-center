import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
const {webkit}=await import(process.env.PLAYWRIGHT_MODULE||'playwright');
const output=process.env.REPAIR_SCREENSHOTS||'../repair-browser';await mkdir(output,{recursive:true});
const root=path.resolve('dist');
const server=createServer(async(req,res)=>{try{const u=new URL(req.url,'http://localhost');let file=path.join(root,u.pathname);if(!path.extname(file))file=path.join(file,'index.html');if(!file.startsWith(root+path.sep))throw Error('path');const content=await readFile(file);res.setHeader('Content-Type',file.endsWith('.js')?'text/javascript':file.endsWith('.css')?'text/css':file.endsWith('.html')?'text/html':'application/octet-stream');res.end(content);}catch{res.statusCode=404;res.end('not found');}});
await new Promise(r=>server.listen(0,'127.0.0.1',r));const origin=`http://127.0.0.1:${server.address().port}`;
const browser=await webkit.launch({headless:true});
try{
for(const width of [390,768,1440]){
const context=await browser.newContext({viewport:{width,height:900}});let submitted=0;const errors=[];
await context.route('**/*',async route=>{
 const u=new URL(route.request().url());if(u.origin!==origin)return route.abort();
 if(!u.pathname.startsWith('/api/'))return route.continue();
 let data={items:[],cases:[],notifications:[],settings:{},users:[],reports:[],apiStatus:'ready'};
 if(u.pathname==='/api/me')data={user:{id:'repair-tester',name:'Testující',email:'tester@example.test',role:'admin',active:true},sessionExpiresAt:Date.now()+3600000};
 if(u.pathname==='/api/repair/reports'){
  if(route.request().method()==='POST'){submitted++;const body=route.request().postData();assert.ok(body.includes('Na telefonu je tlačítko malé'));assert.ok(body.includes('/pneumatiky'));data={caseId:'case-test'};}
  else data={automationEnabled:false,reports:submitted?[{case_id:'case-test',state:'queued',stateLabel:'Ve frontě',title:'Na telefonu je tlačítko malé',reporter_user_name:'Testující',created_at:new Date().toISOString(),case_number:'KSO-TEST'}]:[]};
 }
 return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(data)});
});
const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));
await page.goto(`${origin}/opravit?page=%2Fpneumatiky%3Ftoken%3Dprivate`);
await page.locator('[data-repair-root]').waitFor();
assert.equal(await page.locator('[name=sourceRoute]').inputValue(),'/pneumatiky');
await page.locator('textarea[name=description]').fill('Na telefonu je tlačítko malé');
await page.getByRole('button',{name:'Odeslat hlášení'}).click();
await page.getByText('Hlášení je uložené. Stav najdete níže.').waitFor();
assert.equal(submitted,1);await page.getByRole('heading',{name:'Na telefonu je tlačítko malé'}).waitFor();
assert.deepEqual(errors,[]);
assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'No horizontal overflow');
await page.screenshot({path:path.join(output,`opravit-${width}.png`),fullPage:true});await context.close();
}
console.log('WebKit: 390/768/1440px, route prefill without query secrets, submit and queue feedback, no JS errors or horizontal overflow. APIs mocked; not production E2E.');
}finally{await browser.close();await new Promise(r=>server.close(r));}
