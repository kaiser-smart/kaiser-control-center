// Local synthetic UI audit. No API writes or external network traffic.
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import path from 'node:path';
import { modules } from '../src/data/modules.js';
import { iconDefinitions } from '../src/components/icons/definitions.js';
import { SmartIcon } from '../src/components/icons/SmartIcon.js';
const require=createRequire(import.meta.url);
const {webkit,chromium,devices}=require(process.env.PLAYWRIGHT_MODULE_PATH || 'playwright');
const root=path.resolve(import.meta.dirname,'..');
const dist=path.resolve(process.env.PWA_DIST || path.join(root,'dist'));
const output=path.resolve(process.env.PWA_TEST_OUTPUT || path.join(root,'output/icons'));
const baseline=Boolean(process.env.ICONS_BASELINE);
await mkdir(output,{recursive:true});
const mime={'.js':'text/javascript','.css':'text/css','.html':'text/html','.png':'image/png','.svg':'image/svg+xml','.json':'application/json'};
const catalog=`<!doctype html><html lang="cs"><meta charset="utf-8"><title>SMART ODPADY — SVG 20 / 24 / 28 px</title><style>body{font:14px system-ui;color:#243128;background:#fff;padding:24px}main{display:grid;grid-template-columns:repeat(4,1fr);gap:16px}article{padding:12px;border-bottom:1px solid #ddd}h2{font-size:13px;font-weight:500}article div{display:flex;align-items:center;gap:20px;height:36px}svg{flex-shrink:0}</style><h1>SMART ODPADY · 20 / 24 / 28 px</h1><main>${Object.keys(iconDefinitions).map(name=>`<article><h2>${name}</h2><div>${[20,24,28].map(size=>SmartIcon(name).replace('width="24" height="24"',`width="${size}" height="${size}"`)).join('')}</div></article>`).join('')}</main></html>`;
const server=createServer(async(req,res)=>{
  const url=new URL(req.url,'http://localhost');
  if(url.pathname==='/icon-catalog'){res.writeHead(200,{'Content-Type':'text/html'});res.end(catalog);return;}
  let file=path.resolve(dist,`.${url.pathname}`);
  if(!file.startsWith(dist+path.sep)){file=path.join(dist,'index.html');}
  if(!path.extname(file))file=path.join(file,'index.html');
  let content;try{content=await readFile(file);}catch{file=path.join(dist,'index.html');content=await readFile(file);}
  res.writeHead(200,{'Content-Type':mime[path.extname(file)]||'application/octet-stream'});res.end(content);
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const origin=`http://127.0.0.1:${server.address().port}`;
let browser;
const results=[],errors=[],external=[],mockedMutations=[];
try {
  browser=process.env.BROWSER_ENGINE==='chromium'?await chromium.launch({channel:'chrome',headless:true}):await webkit.launch({headless:true});
  const context=await browser.newContext({...devices['iPhone 13'],serviceWorkers:'block'});
  await context.route('**/*',async route=>{
    const url=new URL(route.request().url());
    if(url.origin!==origin){external.push(url.hostname);return route.abort();}
    if(!url.pathname.startsWith('/api/'))return route.continue();
    // Background sync requests are fulfilled in memory, never sent to any backend.
    if(route.request().method()!=='GET')mockedMutations.push({method:route.request().method(),path:url.pathname});
    const user={id:'icons-test',name:'Testovací uživatel',email:'icons@example.test',role:'admin',status:'active',active:true};
    const employee={id:'icons-test',userId:'icons-test',name:'Testovací uživatel',firstName:'Testovací',lastName:'Uživatel',role:'admin',employmentStatus:'active'};
    let body={apiStatus:'ready',settings:{},items:[],requests:[],users:[],messages:[],show:false};
    if(url.pathname==='/api/me')body={user};
    if(url.pathname==='/api/employees')body={apiStatus:'ready',employees:[employee]};
    if(url.pathname==='/api/employees/icons-test')body={apiStatus:'ready',employee};
    if(url.pathname==='/api/vehicles')body={apiStatus:'ready',vehicles:[{id:'icons-car',licensePlate:'TEST 001',brand:'MAN',model:'TGS',vehicleType:'Svozové vozidlo',status:'active'}]};
    if(url.pathname==='/api/users')body={users:[user]};
    if(url.pathname==='/api/forpsi/admin')body={mailboxes:[],rules:[],labels:[],queue:[],truncated:{},credentialStorageReady:false};
    return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(body)});
  });
  const page=await context.newPage();page.setDefaultTimeout(10000);page.setDefaultNavigationTimeout(20000);
  page.on('pageerror',error=>errors.push({url:page.url(),message:error.message}));
  const routes=['/',...modules.map(m=>m.route),'/dovolena-nemoc/rychle-zadani','/pripominky'];
  for(const [width,height] of [[375,667],[390,844],[430,932],[768,1024],[1440,1000]]) {
    await page.setViewportSize({width,height});
    for(const route of routes) {
      await page.goto(origin+route);await page.locator('[data-logout]').first().waitFor({state:'attached'});await page.waitForLoadState('networkidle');
      const metrics=await page.evaluate(()=>{
        const visible=node=>{const b=node.getBoundingClientRect();return b.width>0&&b.height>0;};
        const icons=[...document.querySelectorAll('svg.smart-icon')].filter(visible);
        return {width:innerWidth,scrollWidth:document.documentElement.scrollWidth,icons:icons.length,
          iconProblems:icons.flatMap(node=>{const s=getComputedStyle(node),b=node.getBoundingClientRect(),g=node.querySelector('g'),a=g&&getComputedStyle(g);return (s.stroke!=='rgb(36, 49, 40)'||a?.stroke!=='rgb(117, 189, 37)'||s.strokeWidth!=='2.2px'||s.filter!=='none'||s.boxShadow!=='none'||b.width<19||b.width>29||b.height<19||b.height>29)?[{name:node.dataset.icon,width:b.width,height:b.height,stroke:s.stroke,accent:a?.stroke,strokeWidth:s.strokeWidth}]:[];}),
          iconTiles:[...document.querySelectorAll('.module-launcher-icon,.ui-pilot-nav__icon,.quick-absence-type__icon,.sarlota-absence-voice-button > span:first-child')].filter(visible).filter(n=>{const s=getComputedStyle(n);return s.backgroundColor!=='rgba(0, 0, 0, 0)'||s.backgroundImage!=='none'||s.boxShadow!=='none';}).map(n=>n.className),
          rasterIcons:[...document.querySelectorAll('[data-tracking-vehicle-icon],[data-tracking-tcars-marker-icon],.ai-voice-assistant-panel__mic img')].filter(visible).filter(n=>/\.(png|webp)(\?|$)/.test(n.src)).map(n=>n.src),
          resources:performance.getEntriesByType('resource').filter(r=>r.name.startsWith(location.origin)).reduce((sum,r)=>sum+r.transferSize,0),
          duration:Math.round(performance.now())};
      });
      const slug=route==='/'?'home':route.slice(1).replaceAll('/','-');
      await page.screenshot({path:path.join(output,`${slug}-${width}.png`)});
      assert.ok(metrics.scrollWidth<=width,`Overflow ${route} @ ${width}`);
      if(!baseline){assert.deepEqual(metrics.iconProblems,[],`SVG contract ${route} @ ${width}`);assert.deepEqual(metrics.rasterIcons,[],`Raster icons ${route}`);assert.deepEqual(metrics.iconTiles,[],`Icon backgrounds ${route}`);assert.ok(metrics.icons>0);}
      results.push({route,width,height,...metrics});
      if(route==='/'&&width<721){
        if(!baseline)assert.equal(await page.locator('.mobile-home-link [data-icon=home]').count(),1);
        await page.locator('.mobile-bottom-nav button').click();await page.locator('.mobile-menu[open]').waitFor();
        await page.screenshot({path:path.join(output,`menu-${width}.png`)});
        if(!baseline)assert.equal(await page.locator('.mobile-menu-nav').evaluate(nav=>[...nav.querySelectorAll('a')].filter(a=>{const text=a.lastElementChild;return text&&text.scrollWidth>text.clientWidth+1;}).length),0,'Menu labels must not clip');
        const labels=await page.locator('.mobile-menu-nav a').allTextContents();
        assert.ok(labels.some(t=>t.includes('Zaměstnanci')));
        await page.locator('.mobile-menu-search').fill('pneumatiky');
        assert.equal(await page.locator('.mobile-menu-nav a:visible').count(),1);
        await page.locator('.mobile-menu-nav a:visible').click();await page.waitForURL('**/pneumatiky');
        if(!baseline){await page.locator('.mobile-home-link').click();await page.waitForURL(origin+'/');}
      }
    }
    console.log(`${baseline?'before':'after'} ${width}: ${routes.length} routes passed`);
  }
  if(!baseline){
    await page.setViewportSize({width:1100,height:1000});await page.goto(origin+'/icon-catalog');
    await page.screenshot({path:path.join(output,'icon-catalog.png'),fullPage:true});
    assert.equal(await page.locator('svg').count(),Object.keys(iconDefinitions).length*3);
    await writeFile(path.join(output,'icon-catalog.html'),catalog);
  }
  assert.deepEqual(errors,[],'No browser errors');
  await writeFile(path.join(output,'audit.json'),JSON.stringify({baseline,engine:process.env.BROWSER_ENGINE||'webkit',browser:browser.version(),physicalIPhone:false,results,errors,externalBlocked:[...new Set(external)],mockedMutations},null,2));
  await context.close();
}finally{await browser?.close();server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}
