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
let auditRole='admin';
let auditTheme={};
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
    const user={id:'icons-test',name:'Testovací uživatel',email:'icons@example.test',role:auditRole,status:'active',active:true};
    const employee={id:'icons-test',userId:'icons-test',name:'Testovací uživatel',firstName:'Testovací',lastName:'Uživatel',role:auditRole,employmentStatus:'active'};
    let body={apiStatus:'ready',settings:{},items:[],requests:[],users:[],messages:[],show:false};
    if(url.pathname==='/api/me')body={user};
    if(url.pathname==='/api/theme-settings')body={settings:auditTheme};
    if(url.pathname==='/api/employees')body={apiStatus:'ready',employees:[employee]};
    if(url.pathname==='/api/employees/icons-test')body={apiStatus:'ready',employee};
    if(url.pathname==='/api/vehicles')body={apiStatus:'ready',vehicles:[{id:'icons-car',licensePlate:'TEST 001',brand:'MAN',model:'TGS',vehicleType:'Svozové vozidlo',status:'active'}]};
    if(url.pathname==='/api/users')body={users:[user]};
    if(url.pathname==='/api/forpsi/admin')body={mailboxes:[],rules:[],labels:[],queue:[],truncated:{},credentialStorageReady:false};
    return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(body)});
  });
  const page=await context.newPage();page.setDefaultTimeout(10000);page.setDefaultNavigationTimeout(20000);
  page.on('pageerror',error=>errors.push({url:page.url(),message:error.message}));

  const surfaces=[];
  for(const role of process.env.AUDIT_THEME_ONLY?[]:['admin','ridic']) {
    auditRole=role;
    for(const width of [375,390,430,768,1440]) {
      await page.setViewportSize({width,height:width===375?667:width===390?844:width===430?932:1000});
      for(const route of ['/','/dovolena-nemoc/rychle-zadani']) {
        await page.goto(origin+route);await page.locator('[data-logout]').first().waitFor({state:'attached'});await page.waitForLoadState('networkidle');
        const snapshot=await page.evaluate(()=>{
          const visible=n=>{const r=n.getBoundingClientRect();return r.width>0&&r.height>0;};
          const style=(n,pseudo)=>{const s=getComputedStyle(n,pseudo),r=n.getBoundingClientRect();return {tag:n.tagName,class:n.className?.baseVal??n.className,pseudo,rect:{x:r.x,y:r.y,width:r.width,height:r.height},fill:s.fill,stroke:s.stroke,opacity:s.opacity,color:s.color,background:s.backgroundColor,backgroundImage:s.backgroundImage,filter:s.filter,backdropFilter:s.backdropFilter,mask:s.maskImage,transform:s.transform,content:s.content,zIndex:s.zIndex,objectFit:s.objectFit,colorScheme:s.colorScheme};};
          const icons=[...document.querySelectorAll('svg.smart-icon')].filter(visible).map(n=>({name:n.dataset.icon,style:style(n),accent:style(n.querySelector('[data-icon-accent]')),ancestors:(()=>{let p=n.parentElement,a=[];while(p){a.push(style(p));p=p.parentElement;}return a;})()}));
          const effects=[...document.querySelectorAll('body *')].filter(visible).flatMap(n=>[undefined,'::before','::after'].map(p=>style(n,p))).filter(s=>(!s.pseudo||!['none','normal'].includes(s.content))&&(s.filter!=='none'||(s.backdropFilter&&s.backdropFilter!=='none')||s.backgroundImage!=='none'||(s.pseudo&&s.background!=='rgba(0, 0, 0, 0)')));
          const nav=[...document.querySelectorAll('.mobile-bottom-nav a,.mobile-bottom-nav button')].map(n=>({text:n.textContent.trim(),href:n.getAttribute('href'),active:n.getAttribute('aria-current'),height:n.getBoundingClientRect().height,width:n.getBoundingClientRect().width}));
          return {icons,effects,nav,overflow:document.documentElement.scrollWidth-innerWidth,rootColorScheme:getComputedStyle(document.documentElement).colorScheme};
        });
        assert.equal(snapshot.overflow,0);
        for(const icon of snapshot.icons){assert.equal(icon.style.fill,'rgb(36, 49, 40)');assert.equal(icon.accent.fill,'rgb(117, 189, 37)');assert.equal(icon.style.stroke,'none');assert.equal(icon.style.filter,'none');for(const a of icon.ancestors){assert.equal(a.opacity,'1');assert.equal(a.filter,'none');}}
        if(width<721){assert.ok(snapshot.nav.every(n=>n.height>=44&&n.width>=44));assert.deepEqual(snapshot.nav.map(n=>n.text),route==='/'?['Moduly','Více']:role==='admin'?['Moduly','Vozidla','Trasy','Hlášení','Více']:['Moduly','Vozidla','Trasy','Hlášení','Více']);}
        const slug=route==='/'?'modules':'absence';
        await page.screenshot({path:path.join(output,`${role}-${slug}-${width}.png`)});
        surfaces.push({role,route,width,...snapshot});
        if(route!=='/'&&width===390&&role==='admin') {
          const card=page.locator('.quick-absence-type').filter({hasText:'OČR'});
          await card.hover();await card.focus();
          await page.screenshot({path:path.join(output,'absence-focus-390.png')});
          const active=await card.evaluate(n=>({background:getComputedStyle(n).backgroundColor,outline:getComputedStyle(n).outlineStyle,border:getComputedStyle(n).borderColor}));
          const effects=await page.evaluate(()=>[...document.querySelectorAll('*')].filter(n=>getComputedStyle(n).filter!=='none').map(n=>({tag:n.tagName,class:n.className,filter:getComputedStyle(n).filter})));
          await writeFile(path.join(output,'focus-effects.json'),JSON.stringify({active,effects},null,2));
          const shell=page.locator('main.ui-system-v2');await shell.evaluate(n=>n.scrollTop=1000);
          await page.screenshot({path:path.join(output,'absence-scrolled-390.png')});
          if(width<721)assert.equal(await page.locator('.mobile-bottom-nav').evaluate(n=>Math.round(n.getBoundingClientRect().bottom)),844);
        }
      }
    }
  }
  await page.setViewportSize({width:390,height:844});await page.goto(origin+'/dovolena-nemoc/rychle-zadani');await page.waitForLoadState('networkidle');
  const safeStyle=await page.addStyleTag({content:':root{--mobile-top:72px!important;--mobile-bottom:94px!important}#app .mobile-header{padding-top:20px!important}#app .mobile-bottom-nav{padding-bottom:34px!important}'});
  const safe=await page.evaluate(()=>({header:document.querySelector('.mobile-header').getBoundingClientRect().height,bottom:document.querySelector('.mobile-bottom-nav').getBoundingClientRect().height,contentTop:parseFloat(getComputedStyle(document.querySelector('main.ui-system-v2')).paddingTop),contentBottom:parseFloat(getComputedStyle(document.querySelector('main.ui-system-v2')).paddingBottom)}));
  assert.equal(safe.header,72);assert.equal(safe.bottom,94);assert.ok(safe.contentTop>=72&&safe.contentBottom>=94);
  await page.screenshot({path:path.join(output,'synthetic-safe-area-390.png')});await safeStyle.evaluate(n=>n.remove());
  const disabled=page.locator('.quick-absence-type').first();await disabled.evaluate(n=>n.disabled=true);assert.equal(await disabled.evaluate(n=>getComputedStyle(n).opacity),'0.58');
  await page.screenshot({path:path.join(output,'disabled-390.png')});
  await writeFile(path.join(output,'synthetic-states.json'),JSON.stringify({safeArea: safe,physicalIPhone:false,disabledOpacity:.58},null,2));
  await page.emulateMedia({colorScheme:'dark'});await page.setViewportSize({width:390,height:844});
  for(const route of ['/','/dovolena-nemoc/rychle-zadani']){await page.goto(origin+route);await page.waitForLoadState('networkidle');assert.equal(await page.evaluate(()=>getComputedStyle(document.documentElement).colorScheme),'light');await page.screenshot({path:path.join(output,`os-dark-${route==='/'?'modules':'absence'}.png`)});}
  auditRole='admin';auditTheme={paletteMode:'manual',backgroundColor:'#151c18',cardColor:'#202a23',textColor:'#edf3ee',mutedTextColor:'#b2beb3'};
  for(const width of [390,1440]){
    await page.setViewportSize({width,height:1000});await page.goto(origin+'/sledovani-vozidel');await page.waitForLoadState('networkidle');
    assert.equal(await page.locator('.vm').getAttribute('data-theme'),'dark');
    assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
    await page.screenshot({path:path.join(output,`supported-map-dark-${width}.png`)});
  }
  assert.deepEqual(errors,[]);
  await writeFile(path.join(output,'audit.json'),JSON.stringify({baseline,engine:'webkit',browser:browser.version(),physicalIPhone:false,surfaces,errors,externalBlocked:[...new Set(external)]},null,2));
  await context.close();
}finally{await browser?.close();server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}
