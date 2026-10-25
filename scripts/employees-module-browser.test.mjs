// Local static build with synthetic API responses; no production data or requests.
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import path from 'node:path';
const require = createRequire(import.meta.url);
const { webkit, chromium } = require(process.env.PLAYWRIGHT_MODULE_PATH || 'playwright');
const root = path.resolve(import.meta.dirname, '..', 'dist');
const output = path.resolve(import.meta.dirname, '../../../outputs/employees-module');
await mkdir(output, {recursive:true});
const mime = {'.js':'text/javascript','.css':'text/css','.html':'text/html','.png':'image/png','.svg':'image/svg+xml','.json':'application/json'};
const server = createServer(async (req,res) => {
  let filename = path.join(root, new URL(req.url,'http://localhost').pathname);
  if (!path.extname(filename)) filename = path.join(filename,'index.html');
  let content;
  try {content = await readFile(filename);} catch {filename=path.join(root,'index.html'); content=await readFile(filename);}
  res.writeHead(200,{'Content-Type':mime[path.extname(filename)] || 'application/octet-stream'});res.end(content);
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const origin=`http://127.0.0.1:${server.address().port}`;
const employee={id:'test-person',userId:'test-person',firstName:'Testovací',lastName:'Zaměstnanec',name:'Testovací Zaměstnanec',role:'ridic',employmentStatus:'active',position:'Řidič',department:'Provoz'};
let browser;
const results=[];
try {
  browser=process.env.BROWSER_ENGINE === "chromium"
    ? await chromium.launch({headless:true, channel:"chrome", timeout:20000})
    : await webkit.launch({headless:true, timeout:20000, ...(process.env.PLAYWRIGHT_WEBKIT_EXECUTABLE ? {executablePath:process.env.PLAYWRIGHT_WEBKIT_EXECUTABLE} : {})});
  for (const role of ['admin','management','kancelar','garazmistr','dispecer','ridic','readonly']) {
    const context=await browser.newContext();
    const page=await context.newPage();
    page.setDefaultTimeout(10000);
    const errors=[];page.on('pageerror',e=>errors.push(e.message));
    await page.route('**/*',async route=>{
      const url=new URL(route.request().url());
      if(url.origin!==origin)return route.abort();
      if(!url.pathname.startsWith('/api/'))return route.continue();
      const user={id:'test-person',name:'Testovací Zaměstnanec',email:'test@example.test',role,status:'active',active:true};
      let body={apiStatus:'ready',settings:{},items:[],requests:[],users:[],messages:[],show:false};
      if(url.pathname==='/api/me')body={user};
      else if(url.pathname==='/api/employees')body={employees:[employee],apiStatus:'ready'};
      else if(url.pathname==='/api/employees/test-person')body={employee,apiStatus:'ready'};
      return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(body)});
    });
    for(const width of [375,768,1440]) {
      await page.setViewportSize({width,height:900});
      await page.goto(origin);
      await page.locator('[data-module-search]').waitFor();
      await page.locator('[data-module-search]').fill('zamestnanci');
      assert.equal(await page.locator('[data-launcher-module]:visible').count(),1);
      assert.equal(await page.locator('[data-launcher-module]:visible').getAttribute('href'),'/zamestnanci');
      await page.locator('[data-module-search]').fill('nic-takoveho');
      assert.equal(await page.locator('[data-module-search-empty]').isVisible(),true);
      await page.locator('[data-module-search]').fill('');
      assert.equal(await page.locator('[data-launcher-module]:visible').count(),2);
      if(role==='admin')await page.screenshot({path:path.join(output,`launcher-${width}.png`)});
      await page.locator('[data-launcher-module][href="/zamestnanci"]').click();
      await page.locator('.absence-table--employees').waitFor();
      assert.equal(await page.locator('main[data-ui-module]').getAttribute('data-ui-module'),'employees');
      assert.equal(await page.locator('.absence-tabs').count(),0);
      assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),`List overflow ${role} ${width}`);
      if(role==='admin') {
        assert.equal(await page.locator('[data-employee-add-open] span').evaluate(el=>getComputedStyle(el).color),'rgb(36, 49, 22)');
        await page.screenshot({path:path.join(output,`employees-${width}.png`)});
      }
      await page.locator('.absence-table--employees a').first().click();
      await page.locator('#employee-card-title').waitFor();
      assert.equal(new URL(page.url()).pathname,'/zamestnanci/test-person');
      await page.locator('.employee-detail-tabs [data-employee-detail-tab="documents"]').click();
      assert.equal(await page.locator('[data-employee-detail-active-tab]').getAttribute('data-employee-detail-active-tab'),'documents');
      assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),`Card overflow ${role} ${width}`);
      await page.locator('.employee-detail-tabs [data-employee-detail-tab="overview"]').click();
      if(role==='admin')await page.screenshot({path:path.join(output,`employee-card-${width}.png`)});
      await page.locator('.employee-card-header__actions a[href="/zamestnanci"]').click();
      await page.locator('.absence-table--employees').waitFor();
      await page.goto(`${origin}/dovolena-nemoc/zamestnanci/test-person?source=old#detail`);
      await page.locator('#employee-card-title').waitFor();
      assert.equal(new URL(page.url()).pathname,'/zamestnanci/test-person');
      assert.equal(new URL(page.url()).search,'?source=old');
      assert.equal(new URL(page.url()).hash,'#detail');
      await page.goto(`${origin}/dovolena-nemoc/zamestnanci`);
      await page.locator('.absence-table--employees').waitFor();
      assert.equal(new URL(page.url()).pathname,'/zamestnanci');
      await page.goto(`${origin}/dovolena-nemoc`);
      await page.locator('.absence-tabs').waitFor({state:'attached'});
      assert.equal(await page.locator('.absence-tabs a[href*="zamestnanci"]').count(),0);
      assert.equal(await page.locator('main[data-ui-module]').getAttribute('data-ui-module'),'absence');
      results.push({role,width,status:'passed'});
    }
    assert.deepEqual(errors,[],`${role} page errors`);
    await context.close();
  }
  await writeFile(path.join(output,'browser-results.json'),JSON.stringify(results,null,2));
  console.log(`Passed ${results.length} role/viewport combinations: launcher search, list, card tabs, back link, old URLs, absence separation and overflow.`);
} finally {await browser?.close(); await new Promise(resolve=>server.close(resolve));}
