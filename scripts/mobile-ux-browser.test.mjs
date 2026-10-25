import { searchNavigation } from "../src/data/globalSearch.js";
import { hasPermission } from "../src/permissions.js";
// Optional integration test. Uses external Playwright tooling, not an app dependency.
// Only local HTTPS, synthetic accounts and mock OTP; no D1, Twilio or production traffic.
import assert from "node:assert/strict";
import { createServer } from "node:https";
import { readFile, mkdtemp, rm, mkdir, writeFile } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import { tmpdir } from "node:os";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { onRequestPost as start } from "../functions/api/auth/start.js";
import { onRequestPost as verify } from "../functions/api/auth/verify.js";
import { onRequestPost as logout } from "../functions/api/auth/logout.js";
import { onRequestGet as me } from "../functions/api/me.js";
import { json, requireUserPermission, createSessionCookie } from "../functions/_lib/auth.js";

const require = createRequire(import.meta.url);
const { webkit, devices } = require(process.env.PLAYWRIGHT_MODULE_PATH || "playwright");
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const dist = path.resolve(process.env.PWA_DIST || path.join(root, "dist"));
const output = path.resolve(process.env.PWA_TEST_OUTPUT || path.join(root, "output/mobile-ux"));
const temp = await mkdtemp(path.join(tmpdir(), "smart-pwa-test-"));
await mkdir(output, { recursive: true });
const user = { id: "pwa-test", name: "Test PWA", email: "pwa@example.test", role: "admin", active: true, status: "active" };
const reader = { id: "pwa-reader", name: "Test čtení", email: "reader@example.test", role: "readonly", active: true, status: "active" };
const roleUsers = ["admin","management","kancelar","garazmistr","dispecer","ridic","readonly"].map(role=>({id:`launcher-${role}`,name:`Test ${role}`,email:`${role}@example.test`,role,active:true,status:"active"}));
const env = { AUTH_MODE: "mock", APP_ENV: "test", AUTH_USERS_JSON: JSON.stringify([user, reader, ...roleUsers]) };
const mime = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".png": "image/png", ".svg": "image/svg+xml", ".json": "application/json", ".webmanifest": "application/manifest+json" };
let revision = "before-update";
let failLogout = false;
let failMe = false;
let origin;
let browser;
let server;
const results = [];
const absenceSubmissions = [];

try {
  execFileSync("openssl", ["req", "-x509", "-newkey", "rsa:2048", "-nodes", "-keyout", path.join(temp, "key.pem"), "-out", path.join(temp, "cert.pem"), "-days", "1", "-subj", "/CN=127.0.0.1"], { stdio: "ignore" });
  server = createServer({ key: await readFile(path.join(temp, "key.pem")), cert: await readFile(path.join(temp, "cert.pem")) }, async (req, res) => {
    try {
      const url = new URL(req.url, origin);
      if (url.pathname.startsWith("/api/")) {
        const chunks = [];
        for await (const chunk of req) chunks.push(chunk);
        const request = new Request(url, { method: req.method, headers: req.headers, ...(chunks.length ? { body: Buffer.concat(chunks) } : {}) });
        const handler = { "/api/auth/start": start, "/api/auth/verify": verify, "/api/auth/logout": logout, "/api/me": me }[url.pathname];
        let response;
        if (url.pathname === "/api/auth/logout" && failLogout) response = json({ error: "Simulated unavailable service" }, 503);
        else if (url.pathname === "/api/me" && failMe) response = json({ error: "Simulated unavailable service" }, 503);
        else if (url.pathname === '/api/absence-requests') {
          if (req.method === 'POST') { const payload=await request.json(); absenceSubmissions.push(payload); response=json({apiStatus:'ready',request:{id:'isolated-request-'+absenceSubmissions.length,...payload}}); }
          else response=json({apiStatus:'ready',requests:[]});
        }
        else if (url.pathname === '/api/forpsi/admin') response=json({mailboxes:[],rules:[],labels:[],queue:[],truncated:{},credentialStorageReady:false});
        else if (url.pathname === '/api/driver-reports') response=json({apiStatus:'ready',permissions:{canCreate:true,canManage:true},requests:Array.from({length:18},(_,i)=>({id:`report-${i}`,reportId:`H-${i+1}`,licensePlate:`TEST ${String(i+1).padStart(3,'0')}`,defectDescription:'Kontrola osvětlení vozidla',status:'new_report',driverName:`Řidič ${i+1}`,createdByUserId:user.id,reportedAt:'2026-10-25T06:00:00Z'}))});
        else if (url.pathname === '/api/vehicle-tracking/status') response=json({apiStatus:'ready',liveVerified:true,lastUpdatedAt:new Date().toISOString(),summary:{vehiclesTotal:24,withoutValidLocationCount:3},vehicles:Array.from({length:24},(_,i)=>({vehicleId:`mobile-${i}`,licensePlate:`TEST ${String(i+1).padStart(3,'0')}`,vehicleType:'collection_truck'})),locations:Array.from({length:21},(_,i)=>({id:`position-${i}`,vehicleId:`mobile-${i}`,licensePlate:`TEST ${String(i+1).padStart(3,'0')}`,latitude:49.2+i/1000,longitude:16.6+i/1000,lastGpsAt:new Date().toISOString(),speedKmh:i<12?35:0}))});
        else if (url.pathname === '/api/vehicles') response = json({apiStatus:'ready', vehicles:Array.from({length:24},(_,i)=>({id:`mobile-${i}`,licensePlate:`TEST ${String(i+1).padStart(3,'0')}`,brand:'MAN',model:'TGS',vehicleType:'Svozové vozidlo',driverName:`Řidič ${i+1}`,status:'active'}))});
        else if (url.pathname.endsWith('/tcars')) response=json({apiStatus:'ready',trips:[],costs:[],positions:[],fuel:[],summary:{},vehicle:{id:'mobile-0',licensePlate:'TEST 001'}});
        else if (url.pathname.startsWith('/api/vehicles/mobile-')) response = json({vehicle:{id:url.pathname.split('/').pop(),licensePlate:'TEST 001',brand:'MAN',model:'TGS'}});
        else if (url.pathname === '/api/vehicle-tracking/analytics') response = json({apiStatus:'ready',summary:{totalKm:1524,vehicleCount:24},vehicles:[]});
        else if (handler) response = await handler({ request, env });
        else if (url.pathname === "/api/users") {
          const access = await requireUserPermission(env, request, "users", "view");
          response = access.response || json({ users: [user, ...Array.from({length:23},(_,i)=>({id:`team-${i+2}`,name:`Zkouška ${i+2}`,email:`team${i+2}@example.test`,role:'readonly',active:true,status:'active'}))] });
        } else if (url.pathname === "/api/ai/search") {
          const check = await requireUserPermission(env, request, "dashboard", "view");
          const q = url.searchParams.get("q") || "";
          const navigation = searchNavigation(check.user, q);
          if (q === "slow") await new Promise(resolve => setTimeout(resolve, 1000));
          response = check.response || json({ modules: navigation.filter(i => i.kind === "Modul"), pages: navigation.filter(i => i.kind !== "Modul"), records: q === "test-spz" ? [{ id: "test-vehicle", title: "TEST-SPZ", description: "Testovací vozidlo", route: "/vozovy-park/test-vehicle", kind: "Vozidla" }] : q === "slow" ? [{id: "old", title: "STALE RESULT", route: "/", kind: "Test"}] : [], unavailable: [], more: [] });
        } else {
          // Business modules are fixtures. This test does not claim to validate their backends.
          response = json({ settings: {}, items: [], messages: [], users: [], show: false, apiStatus: "ready" });
        }
        res.writeHead(response.status, Object.fromEntries(response.headers));
        res.end(Buffer.from(await response.arrayBuffer()));
        return;
      }
      let filename = path.resolve(dist, `.${url.pathname}`);
      if (!filename.startsWith(`${dist}${path.sep}`) && filename !== dist) throw new Error("Invalid path");
      if (!path.extname(filename)) filename = path.join(filename, "index.html");
      let content;
      try { content = await readFile(filename); }
      catch { filename = path.join(dist, "404.html"); content = await readFile(filename); }
      if (filename.endsWith(".html")) content = Buffer.from(content.toString().replace("</head>", `<meta name="pwa-test-revision" content="${revision}"></head>`));
      res.writeHead(200, { "Content-Type": mime[path.extname(filename)] || "application/octet-stream", "Cache-Control": "no-cache" });
      res.end(content);
    } catch (error) {
      res.writeHead(500);
      res.end("Local test server error");
      console.error(error.message);
    }
  });
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  origin = `https://127.0.0.1:${server.address().port}`;
  browser = await webkit.launch({ headless: true, ...(process.env.PLAYWRIGHT_WEBKIT_EXECUTABLE ? { executablePath: process.env.PLAYWRIGHT_WEBKIT_EXECUTABLE } : {}) });
  console.log(`WebKit ${browser.version()}; local HTTPS; real auth handlers with mock OTP.`);


  const primaryRoutes = ['/', '/vozovy-park', '/sledovani-vozidel', '/trasy-svozu', '/hlaseni-ridicu', '/datove-schranky-plus', '/dovolena-nemoc/rychle-zadani', '/pohledavky', '/pneumatiky', '/nastaveni'];
  const extraRoutes = ['/dashboard','/servis-udrzba','/trasy-vzorku','/vistos','/naklady','/reporty','/rcs-sms-konverzace','/dovolena-nemoc','/uzivatele','/kontrola-systemu','/samoopravy','/pripominky','/dovolena-nemoc/kalendar','/dovolena-nemoc/ke-schvaleni','/dovolena-nemoc/nova-zadost','/vozovy-park#fleet-fuel'];
  const routes = process.env.MOBILE_AUDIT_EXTRA ? extraRoutes : primaryRoutes;
  const context = await browser.newContext({ ...devices['iPhone 13'], ignoreHTTPSErrors:true });
  await context.route('**/*', route=>new URL(route.request().url()).origin===origin?route.continue():route.abort());
  const cookie=await createSessionCookie(env,user);
  await context.addCookies([{name:'__Host-smart_odpady_session',value:cookie.split(';')[0].split('=')[1],domain:'127.0.0.1',path:'/',httpOnly:true,secure:true,sameSite:'Lax'}]);
  const page=await context.newPage(); page.setDefaultTimeout(10000); page.setDefaultNavigationTimeout(15000);
  const errors=[]; page.on('pageerror',e=>{errors.push(e.message); console.log('PAGEERROR',page.url(),e.stack);}); page.on('console',m=>{if(m.type()==='error') {console.log('CONSOLE',m.text()); if(m.text().includes('smart_odpady_render_failed')) errors.push(m.text());}});
  if (process.env.GLOBAL_SEARCH_ONLY) {
    for (const [width,height] of [[375,667],[390,844],[430,932],[1440,1000]]) {
      await page.setViewportSize({width,height}); await page.goto(origin+'/');
      const input=page.locator('[data-module-search]'); await input.waitFor();
      await input.fill('vozidla');
      await page.locator('[data-global-search-results] a[href="/vozovy-park"]').waitFor();
      assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
      assert.equal(await input.getAttribute('aria-label'),'Globální vyhledávání');
      const oldStarted=page.waitForRequest(r=>r.url().includes('q=slow'));
      await input.fill('slow'); await oldStarted;
      await input.fill('vozidla'); await page.waitForTimeout(1200);
      assert.equal(await page.getByText('STALE RESULT',{exact:true}).count(),0);
      await input.fill('test-spz'); await page.getByText('TEST-SPZ',{exact:true}).waitFor();
      assert.equal(await page.locator('[data-global-search-results] a').getAttribute('href'),'/vozovy-park/test-vehicle');
      await input.fill('<img src=x onerror=alert(1)>');
      assert.equal(await page.locator('[data-global-search-results] img').count(),0);
      await input.fill('vozidla'); await page.screenshot({path:path.join(output,`global-search-${width}.png`)});
      await page.locator('[data-global-search-results] a[href="/vozovy-park"]').click();
      await page.waitForURL('**/vozovy-park');
      results.push({globalSearch:'passed',width,checks:['module-search','record-result','stale-response-rejected','safe-html','result-navigation','no-horizontal-overflow']});
    }
    await writeFile(path.join(output,'global-search.json'),JSON.stringify({results,errors},null,2));
    assert.deepEqual(errors,[]); await context.close();
  } else {
  for(const [width,height] of ((process.env.MOBILE_FUNCTION_ONLY || process.env.MOBILE_REFERENCE_ONLY || process.env.MOBILE_LAUNCHER_ONLY) ? [] : process.env.MOBILE_AUDIT_FAST ? [[375,667]] : [[375,667],[390,844],[430,932]])) {
    await page.setViewportSize({width,height});
    for (const route of routes) {
      await page.goto(origin+route); await page.locator('[data-logout]').first().waitFor({state:'attached'}); await page.waitForTimeout(500);
      const slug=route==='/'?'home':route.replaceAll('/','-').slice(1);
      const metrics=await page.evaluate(()=>({height:document.documentElement.scrollHeight,width:document.documentElement.scrollWidth,viewport:innerWidth,headings:[...document.querySelectorAll('h1,h2')].filter(x=>x.getBoundingClientRect().height).map(x=>({text:x.textContent.trim(),y:Math.round(x.getBoundingClientRect().y)})),sections:[...document.querySelector('main').children].map(x=>({tag:x.tagName,cls:x.className,h:Math.round(x.getBoundingClientRect().height)}))}));
      await page.screenshot({path:path.join(output,`${slug}-${width}.png`),fullPage:true});
      await page.screenshot({path:path.join(output,`${slug}-${width}-viewport.png`)});
      if(!process.env.MOBILE_BASELINE) assert.ok(metrics.width<=width,`Horizontal overflow ${route} ${width}`);
      if (!process.env.MOBILE_BASELINE && route === '/sledovani-vozidel') {
        // The approved map workspace retains simultaneous map/list and its own shell.
        // Short screens may scroll to keep controls reachable; other modules keep native chrome.
        await page.locator('[data-vm-row]').first().waitFor();
        assert.equal(await page.locator('[data-vm-row]').count(),24);
        assert.equal(await page.locator('[data-vm-filter="missing"] b').innerText(),'3');
        assert.ok((await page.locator('.vm-map').boundingBox()).height>=220);
        assert.equal(await page.locator('.ui-pilot-sidebar').count(),0);
        assert.ok(await page.locator('#vm-search').evaluate(e=>parseFloat(getComputedStyle(e).fontSize)>=16));
      } else if (!process.env.MOBILE_BASELINE) {
        const native = await page.evaluate(() => {
          const main = document.querySelector('main.ui-system-v2');
          const header = document.querySelector('.mobile-header');
          const nav = document.querySelector('.mobile-bottom-nav');
          const before = [header.getBoundingClientRect().top, nav.getBoundingClientRect().top];
          main.scrollTop = main.scrollHeight;
          const after = [header.getBoundingClientRect().top, nav.getBoundingClientRect().top];
          const result = {rootHeight:document.documentElement.scrollHeight, viewportHeight:innerHeight,
            rootScroll:scrollY, mainHeight:main.clientHeight, contentHeight:main.scrollHeight, scroll:main.scrollTop, before, after,
            smallInputs:[...document.querySelectorAll('input:not([type=checkbox]):not([type=radio]),select,textarea')].filter(x=>x.getBoundingClientRect().height && parseFloat(getComputedStyle(x).fontSize)<16).map(x=>x.name)};
          main.scrollTop = 0;
          return result;
        });
        assert.equal(native.rootHeight, height, `Document height ${route}`);
        assert.equal(native.rootScroll, 0, `Document must not scroll ${route}`);
        assert.deepEqual(native.before,native.after, `Navigation stays fixed ${route}`);
        assert.deepEqual(native.smallInputs,[], `Input autozoom prevention ${route}`);
        if (native.contentHeight>native.mainHeight) assert.ok(native.scroll>0,`Long content reachable ${route}`);
      }

      if(width===375) await writeFile(path.join(output,`${slug}-dom.html`),await page.locator('main').first().innerHTML());
      results.push({route,width,height,...metrics});
      console.log(route,width,metrics.height,metrics.width);
    }
  }
  if (!process.env.NATIVE_LAYOUT_ONLY && !process.env.MOBILE_BASELINE && !process.env.MOBILE_AUDIT_EXTRA && !process.env.MOBILE_LAUNCHER_ONLY) {
    const navigateReference = async route => { await page.waitForLoadState('networkidle'); await page.goto(origin+route); await page.waitForLoadState('networkidle'); };
    for (const [width,height] of [[375,667],[390,844],[430,932]]) {
      await page.setViewportSize({width,height});
      await navigateReference('/dovolena-nemoc/rychle-zadani');
      await page.locator('[data-quick-type="vacation"]').waitFor();
      const section=page.locator('.mobile-section-select select');
      assert.equal(await section.inputValue(),'','Quick entry must not show Dnes as the current section');
      const dashboardLoaded = page.waitForResponse(response => new URL(response.url()).pathname === '/api/absence-requests/pending' && response.status() === 200);
      await section.selectOption({label:'Dnes'});
      await dashboardLoaded;
      await page.waitForURL(url=>url.pathname==='/dovolena-nemoc');
      await navigateReference('/dovolena-nemoc/rychle-zadani');
      await page.locator('[data-quick-type="vacation"]').click();
      await page.locator('[data-quick-date-choice="tomorrow"]').click();
      await page.locator('#quick-summary-title').waitFor();
      await page.locator('[data-quick-note-toggle]').click();
      await page.locator('[data-quick-note]').fill('Izolovaný test mobilní žádosti');
      await page.locator('[data-quick-back="date"]').click();
      await page.locator('[data-quick-date-choice="tomorrow"]').click();
      assert.equal(await page.locator('[data-quick-note]').inputValue(),'Izolovaný test mobilní žádosti');
      await page.screenshot({path:path.join(output,`quick-entry-summary-${width}.png`),fullPage:true});
      const submit=page.locator('[data-quick-submit]');
      await submit.scrollIntoViewIfNeeded();
      const box=await submit.boundingBox();
      assert.ok(box.height>=44 && box.width>=44);
      assert.ok(box.y>=52 && box.y+box.height<=height-60,'Submit must be reachable above bottom navigation');
      await submit.click();
      await page.locator('#quick-success-title').waitFor();
      assert.equal(absenceSubmissions.at(-1).type,'vacation');
      assert.equal(absenceSubmissions.at(-1).note,'Izolovaný test mobilní žádosti');
      await page.locator('[data-quick-reset]').click();
      await page.locator('[data-quick-type="doctor"]').click();
      await page.locator('[data-quick-start-time]').fill('11:00');
      await page.locator('[data-quick-end-time]').fill('09:00');
      const count=absenceSubmissions.length;
      await page.locator('[data-quick-custom-continue]').click();
      assert.match(await page.locator('.quick-absence-error').innerText(),/Čas do musí být po času od/);
      assert.equal(absenceSubmissions.length,count,'Invalid date/time must not submit');
      await page.locator('[data-quick-end-time]').fill('12:00');
      const field=await page.locator('[data-quick-date-from]').evaluate(el=>{const s=getComputedStyle(el);return {radius:s.borderRadius,border:s.borderColor,background:s.backgroundColor,fontSize:s.fontSize};});
      assert.equal(field.fontSize,'16px');
      await page.locator('[data-quick-custom-continue]').click();
      await page.locator('[data-quick-submit]').click();
      await page.locator('#quick-success-title').waitFor();
      assert.equal(absenceSubmissions.at(-1).unit,'hours');
      assert.equal(absenceSubmissions.at(-1).startTime,'11:00');
      assert.equal(absenceSubmissions.at(-1).endTime,'12:00');
      await page.locator('[data-quick-reset]').click();
      await page.screenshot({path:path.join(output,`quick-entry-${width}.png`)});
      const reference=await page.locator('.quick-absence-card--step').evaluate(el=>{const s=getComputedStyle(el);return {radius:s.borderRadius,border:s.borderColor,background:s.backgroundColor,font:s.fontFamily,shadow:s.boxShadow};});
      for(const [route,selector,input] of [
        ['/hlaseni-ridicu','.driver-report-click-entry','input:not([type=hidden]):visible'],
        ['/pohledavky','.receivables-panel',null],
        ['/pneumatiky','.tyres-panel',null],
        ['/uzivatele','.users-panel',null]
      ]) {
        await navigateReference(route);await page.locator(selector).first().waitFor();
        const actual=await page.locator(selector).first().evaluate(el=>{const s=getComputedStyle(el);return {radius:s.borderRadius,border:s.borderColor,background:s.backgroundColor,font:s.fontFamily,shadow:s.boxShadow};});
        assert.deepEqual(actual,reference,`Working surface matches Quick entry: ${route}`);
        if(input){const target=page.locator(input).first();if(await target.count()){const actualField=await target.evaluate(el=>{const s=getComputedStyle(el);return {radius:s.borderRadius,border:s.borderColor,background:s.backgroundColor,fontSize:s.fontSize};});assert.deepEqual(actualField,field,`Fields match Quick entry: ${route}`);}}
        assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
      }
      results.push({reference:'Nepřítomnost',width,height,status:'passed',checks:['correct-section-navigation','vacation-summary-back-note-submit','doctor-invalid-time','doctor-valid-submit','submit-not-covered','shared-panels-and-fields']});
    }
  }
  if (!process.env.MOBILE_BASELINE && !process.env.MOBILE_AUDIT_EXTRA && !process.env.MOBILE_REFERENCE_ONLY && !process.env.MOBILE_LAUNCHER_ONLY) {
    await page.setViewportSize({width:375,height:667});
    await page.goto(origin); await page.locator('.module-launcher').waitFor(); await page.waitForTimeout(500);
    const header=await page.locator('.mobile-header').boundingBox(); assert.equal(header.height,52);
    assert.equal(await page.locator('.ai-assistant-launcher').count(),0,'Floating voice icon hidden');
    const tile=await page.locator('[data-launcher-module]').first().boundingBox(); assert.ok(tile.y+tile.height<607,'Module above fold');
    assert.equal(await page.locator('[data-launcher-module]').count(),2);
    assert.equal(await page.locator('.main-dashboard-kpis,.mobile-today').count(),0);
    for(const node of await page.locator('.mobile-bottom-nav a,.mobile-bottom-nav button,.mobile-header button').all()) {
      const box=await node.boundingBox(); assert.ok(box.height>=44 && box.width>=44,'Touch targets >=44');
    }
    await page.locator('.mobile-header button').click();
    await page.locator('.mobile-menu[open]').waitFor();
    assert.equal(await page.evaluate(()=>getComputedStyle(document.body).overflow),'hidden');
    assert.equal(await page.locator('.mobile-menu a[href*=forpsi-mail]').count(),0,'Company mail hidden');
    await page.locator('.mobile-menu-search').fill('pneumatiky');
    assert.equal(await page.locator('.mobile-menu-nav a:visible').count(),1);
    await page.screenshot({path:path.join(output,'menu-375.png')});
    await page.keyboard.press('Escape');
    await page.locator('.mobile-menu').waitFor({state:'hidden'});
    await page.goto(origin+'/dashboard'); await page.locator('.mobile-today').waitFor();
    await page.locator('.mobile-bottom-nav a').filter({hasText:'Vozidla'}).click();
    await page.waitForURL('**/vozovy-park#fleet-vehicles');
    await page.locator('.fleet-table__row').first().waitFor();
    assert.equal(await page.locator('.fleet-table__row:visible').count(),8);
    assert.ok((await page.locator('.fleet-table__row:visible').first().boundingBox()).y < 350, 'Records immediately reachable');
    const pager=page.locator('.fleet-table + .mobile-pager');
    await pager.getByRole('button',{name:'Další',exact:true}).click();
    assert.match(await pager.innerText(),/9–16 \/ 24/);
    await pager.getByRole('button',{name:'Další',exact:true}).click();
    assert.match(await pager.innerText(),/17–24 \/ 24/);
    await pager.getByRole('button',{name:'Předchozí'}).click();
    await pager.getByRole('button',{name:'Předchozí'}).click();
    const row=page.locator('.fleet-table__row:visible').first();
    await row.getByRole('button',{name:'Detail',exact:true}).click();
    assert.ok(await row.locator('.fleet-table__driver').isVisible());
    await page.screenshot({path:path.join(output,'vehicle-row-detail-375.png')});
    await row.locator('.fleet-table__actions a').click();
    await page.waitForURL('**/vozovy-park/mobile-0**');
    await page.locator('#fleet-detail').waitFor();
    await page.waitForTimeout(150); assert.ok(await page.locator('.mobile-vehicle-back').isVisible());
    await page.screenshot({path:path.join(output,'vehicle-detail-375.png')});
    await page.getByRole('button',{name:'Další akce vozidla',exact:true}).click();
    await page.getByRole('button',{name:'Zobrazit historii',exact:true}).click();
    await page.locator('#fleet-timeline').waitFor({state:'visible'});
    await page.goBack(); await page.waitForURL('**/vozovy-park#fleet-vehicles'); await page.locator('.fleet-table').waitFor();
    await page.getByRole('button',{name:'Hledat a filtrovat vozidla',exact:true}).click();
    await page.locator('[data-fleet-filter][name=search]').fill('TEST 024');
    await page.locator('[data-fleet-filter][name=search]').dispatchEvent('change');
    await page.waitForTimeout(150);
    assert.equal(await page.locator('.fleet-table__row:visible').count(),1,'Filter changes visible records');
    await page.screenshot({path:path.join(output,'vehicle-filter-375.png')});
    await page.goto(origin+'/sledovani-vozidel'); await page.locator('[data-vm-row]').first().waitFor();
    assert.ok((await page.locator('.vm-map').boundingBox()).height>=220,'Map keeps minimum usable height');
    await page.locator('[data-vm-expand]').click();
    assert.ok(await page.locator('.vm-list').isVisible());
    assert.ok(await page.locator('.vm-map').isVisible(),'List does not replace map');
    assert.equal(await page.locator('[data-vm-row]').count(),24);
    await page.screenshot({path:path.join(output,'map-list-375.png')});
    await page.locator('[data-vm-row]').first().click();
    assert.ok(await page.locator('.vm-panel-detail').isVisible(),'Selected vehicle detail reachable');
    assert.match(await page.locator('.vm-panel-detail').innerText(),/TEST 001/);
    await page.goto(origin+'/hlaseni-ridicu'); await page.locator('[name=defectDescription]').waitFor();
    await page.locator('[name=defectDescription]').fill('Test mobilního formuláře; neodesílat');
    await page.setViewportSize({width:375,height:420});
    await page.locator('[name=defectDescription]').scrollIntoViewIfNeeded();
    assert.equal(await page.locator('[name=defectDescription]').inputValue(),'Test mobilního formuláře; neodesílat');
    assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'Narrow keyboard viewport');
    await page.screenshot({path:path.join(output,'keyboard-simulated-375.png')});
    await page.setViewportSize({width:1440,height:1000});
    await page.goto(origin+'/dashboard'); await page.locator('.main-dashboard-economics').waitFor();
    assert.equal(await page.locator('.mobile-header').count(),0,'Desktop is not transformed');
    assert.ok(await page.locator('.ui-pilot-sidebar').isVisible());
    assert.equal(await page.locator('a[href*=forpsi-mail], .ai-assistant-launcher').count(),0,'Mail and voice icon hidden on desktop');
    await page.screenshot({path:path.join(output,'desktop-1440.png'),fullPage:true});
    await page.setViewportSize({width:390,height:844}); await page.locator('.mobile-header').waitFor();
    await page.goto(origin+'/uzivatele'); await page.locator('[data-access-user-row]').first().waitFor();
    assert.equal(await page.locator('[data-access-users-empty-search]').isVisible(),false);
    await page.locator('[data-access-users-search]').fill('Zkouška 24');
    await page.waitForTimeout(100);
    assert.equal(await page.locator('[data-access-user-row]:visible').count(),1,'DOM search reaches records outside current page');
    await page.locator('[data-access-users-search]').fill(''); await page.waitForTimeout(100);
    await page.locator('[data-access-user-row]').first().getByRole('button',{name:'Detail',exact:true}).click();
    await page.locator('[data-access-edit-user]').first().click();
    await page.locator('#access-user-editor').waitFor({state:'visible'});
    assert.ok(await page.locator('#access-user-editor input[name=name]').isVisible());
    await page.locator('#access-user-editor .access-permissions-table .mobile-record:visible').first().getByRole('button',{name:'Detail',exact:true}).click();
    const accessToggle=await page.locator('#access-user-editor .access-check:visible').first().boundingBox();
    assert.ok(accessToggle.width>=44 && accessToggle.height>=44,'Permission toggles touch size');
    assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'Permission form has no horizontal scroll');
    await page.screenshot({path:path.join(output,'user-editor-390.png')});
    await page.goto(origin+'/dashboard?view=forpsi-mail'); await page.waitForURL(origin+'/');
    assert.equal(await page.locator('[data-forpsi-mail]').count(),0,'Hidden mail URL redirects safely');
    const limited=await createSessionCookie(env,reader);
    await context.clearCookies();
    await context.addCookies([{name:'__Host-smart_odpady_session',value:limited.split(';')[0].split('=')[1],domain:'127.0.0.1',path:'/',httpOnly:true,secure:true,sameSite:'Lax'}]);
    await page.goto(origin); await page.locator('.mobile-header').waitFor();
    await page.locator('.mobile-header button').click();
    assert.equal(await page.locator('.mobile-menu-nav a[href="/uzivatele"]').count(),0,'Restricted role must not gain users administration');
    assert.equal((await context.request.get(origin+'/api/users')).status(),403);
    await page.locator('.mobile-menu [data-logout]').click();
    await page.locator('[data-auth-form]').waitFor();
    assert.equal((await context.request.get(origin+'/api/me')).status(),401);
    results.push({functional:'passed',checks:['header','touch-targets','quick-actions','menu-search','menu-focus','fleet-pagination-all-24','record-expand','vehicle-detail','history','filter','map-list','keyboard-resize','desktop','role-permissions','user-search-across-pages','user-editor','permission-touch-targets','vehicle-history','selected-map-detail','hidden-mail-redirect','hidden-voice-icon','logout']});
    assert.deepEqual(errors,[],'No uncaught browser errors');
  }
  if (process.env.NATIVE_MOBILE_CHECKS) {
    await context.clearCookies();
    await page.goto(origin);
    await page.locator('[data-auth-form]').waitFor();
    await page.locator('[name=identifier]').fill(user.email);
    await page.locator('[data-auth-form] button[type=submit]').click();
    await page.locator('[name=code]').fill('123456');
    await page.locator('[data-auth-form] button[type=submit]').click();
    await page.locator('.module-launcher').waitFor();
    await page.setViewportSize({width:390,height:844});
    await page.goto(origin+'/hlaseni-ridicu');
    await page.locator('[name=defectDescription]').fill('Zachovat při otočení a klávesnici');
    for (const [width,height] of [[844,390],[390,844],[667,375],[932,430]]) {
      await page.setViewportSize({width,height});
      await page.waitForTimeout(120);
      assert.ok(await page.locator('.mobile-header').isVisible(),'Landscape keeps mobile navigation');
      assert.equal(await page.locator('[name=defectDescription]').inputValue(),'Zachovat při otočení a klávesnici');
      assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth),width);
      assert.equal(await page.evaluate(()=>document.documentElement.scrollHeight),height);
      await page.screenshot({path:path.join(output,`orientation-${width}-${height}.png`)});
    }
    await page.setViewportSize({width:390,height:844});
    await page.locator('[name=defectDescription]').focus();
    await page.evaluate(()=>{
      Object.defineProperty(visualViewport,'height',{configurable:true,value:380});
      Object.defineProperty(visualViewport,'offsetTop',{configurable:true,value:0});
      visualViewport.dispatchEvent(new Event('resize'));
    });
    await page.waitForTimeout(100);
    assert.ok(await page.evaluate(()=>document.documentElement.classList.contains('mobile-keyboard')));
    assert.equal(await page.locator('main.ui-system-v2').evaluate(el=>el.clientHeight),380);
    const fieldBox=await page.locator('[name=defectDescription]').boundingBox();
    assert.ok(fieldBox.y>=52 && fieldBox.y+fieldBox.height<=380,'Focused field above simulated keyboard');
    await page.screenshot({path:path.join(output,'keyboard-visual-viewport-390.png')});
    await page.evaluate(()=>{delete visualViewport.height;delete visualViewport.offsetTop;document.activeElement.blur();visualViewport.dispatchEvent(new Event('resize'));});
    await page.waitForTimeout(100);
    assert.equal(await page.locator('main.ui-system-v2').evaluate(el=>el.clientHeight),844);
    assert.ok(await page.locator('.mobile-bottom-nav').isVisible());
    const gestures=await page.evaluate(()=>{
      const target=document.querySelector('h1') || document.querySelector('main');
      const dispatch=el=>{const event=new Event('gesturestart',{bubbles:true,cancelable:true});el.dispatchEvent(event);return event.defaultPrevented;};
      Object.defineProperty(navigator,'standalone',{configurable:true,value:false});
      const browser=dispatch(target);
      Object.defineProperty(navigator,'standalone',{configurable:true,value:true});
      const installed=dispatch(target);
      const map=document.createElement('div');map.className='tracking-google-map';document.querySelector('main').append(map);
      const mapAllowed=!dispatch(map);
      const button=document.createElement('button');button.textContent='Testovat akci';document.querySelector('main').append(button);
      let actions=0;button.addEventListener('click',()=>actions++);button.click();button.click();
      const toggle=document.createElement('button');toggle.setAttribute('aria-expanded','false');document.querySelector('main').append(toggle);
      let toggles=0;toggle.addEventListener('click',()=>toggles++);toggle.click();toggle.click();
      map.append(button);button.click();button.click();
      const data=document.createElement('a');data.textContent='Uživatelský údaj';document.querySelector('main').append(data);
      const selection=getComputedStyle(data).userSelect;data.remove();
      const result={browser,installed,mapAllowed,actions,toggles,selection,touch:getComputedStyle(document.querySelector('main')).touchAction,viewport:document.querySelector('meta[name=viewport]').content};
      button.remove();toggle.remove();map.remove();delete navigator.standalone;return result;
    });
    assert.equal(gestures.browser,false,'Browser accessibility pinch available');
    assert.equal(gestures.installed,true,'Installed iOS accidental page gesture suppressed');
    assert.equal(gestures.mapAllowed,true,'Map gesture exempt');
    assert.equal(gestures.actions,3,'One regular action plus two map actions');
    assert.equal(gestures.toggles,2,'Intentional toggles allowed');
    assert.notEqual(gestures.selection,'none','User data remains selectable');
    assert.equal(gestures.touch,'manipulation','Double-tap zoom disabled without blocking pan or pinch');
    assert.ok(!/user-scalable|maximum-scale/.test(gestures.viewport),'No accessibility viewport restriction');
    results.push({nativeMobile:'passed',checks:['bounded-document','independent-content-scroll','fixed-navigation','all-inputs-16px','landscape-draft-preserved','synthetic-visual-viewport-keyboard','synthetic-installed-gesture','browser-pinch-preserved','map-gesture-exemption','rapid-action-guard'],physicalIPhone:false});
  }
  if (!process.env.NATIVE_LAYOUT_ONLY && !process.env.MOBILE_BASELINE && !process.env.MOBILE_AUDIT_EXTRA) {
    await context.clearCookies();
    for (const account of roleUsers) {
      await page.goto(origin+'/pripominky');
      await page.locator('[data-auth-form]').waitFor();
      await page.locator('[name=identifier]').fill(account.email);
      await page.locator('[data-auth-form] button[type=submit]').click();
      await page.locator('[name=code]').waitFor();
      await page.locator('[name=code]').fill('123456');
      await page.locator('[data-auth-form] button[type=submit]').click();
      await page.waitForURL(origin+'/');
      await page.locator('.module-launcher').waitFor();
      await page.waitForLoadState('networkidle');
      for (const [width,height] of [[375,667],[390,844],[430,932],[1440,1000]]) {
        await page.setViewportSize({width,height});
        await page.waitForFunction(mobile=>Boolean(document.querySelector('.mobile-header'))===mobile,width<721);
        await page.locator('[data-module-search]').waitFor();
        assert.equal(await page.locator('[data-launcher-module]:visible').count(),2);
        assert.deepEqual(await page.locator('[data-launcher-module] strong').allTextContents(),['Nepřítomnost','Zaměstnanci']);
        const {search,tile}=await page.evaluate(()=>({search:document.querySelector('[data-module-search]').getBoundingClientRect().toJSON(),tile:document.querySelector('[data-launcher-module]').getBoundingClientRect().toJSON()}));
        assert.ok(search.y<tile.y && tile.y+tile.height<height-(width<721?60:0),'Search and module visible without scrolling');
        assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
        await page.locator('[data-module-search]').fill('nepritomnost');
        assert.ok(await page.locator('[data-global-search-results] a').count() > 0,'Search ignores accents');
        await page.locator('[data-module-search]').fill('vozidla');
        assert.equal(await page.locator('[data-launcher-module]:visible').count(),0);
        assert.equal(await page.locator('[data-global-search-results] a[href="/vozovy-park"]').count(),hasPermission(account,'fleet','view') ? 1 : 0,'Search respects module permissions');
        await page.locator('[data-module-search]').fill('zzzz-no-match');
        assert.equal(await page.locator('[data-global-search-results] a').count(),0);
        await page.locator('[data-module-search]').fill('');
        await page.screenshot({path:path.join(output,`launcher-${account.role}-${width}.png`)});
      }
      await page.locator('[data-launcher-module]').filter({hasText:'Nepřítomnost'}).click();
      if(account.role==='readonly') { await page.waitForURL('**/dovolena-nemoc/moje-zadosti'); assert.equal(await page.locator('[data-quick-type]').count(),0); }
      else {await page.waitForURL('**/dovolena-nemoc/rychle-zadani');await page.locator('[data-quick-type="vacation"]').waitFor();}
      if(['garazmistr','dispecer','ridic','readonly'].includes(account.role)) assert.equal((await context.request.get(origin+'/api/users')).status(),403);
      await page.waitForLoadState('networkidle');
      await context.request.post(origin+'/api/auth/logout');await context.clearCookies();
      results.push({launcherRole:account.role,status:'passed',sizes:[375,390,430,1440],checks:['real-login-to-home','launcher-preserved','global-search-without-accents','permission-filtered-results','empty-search-result','module-opens','permissions-preserved']});
    }
  }
  assert.deepEqual(errors,[],'No render or browser errors');
  await writeFile(path.join(output,'audit.json'),JSON.stringify({results,errors},null,2));
  await context.close();
  }
} finally {
 if(browser) await browser.close();
 if(server) { server.closeAllConnections(); await new Promise(resolve=>server.close(resolve)); }
 await rm(temp,{recursive:true,force:true});
}
