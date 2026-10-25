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
const env = { AUTH_MODE: "mock", APP_ENV: "test", AUTH_USERS_JSON: JSON.stringify([user, reader]) };
const mime = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".png": "image/png", ".svg": "image/svg+xml", ".json": "application/json", ".webmanifest": "application/manifest+json" };
let revision = "before-update";
let failLogout = false;
let failMe = false;
let origin;
let browser;
let server;
const results = [];

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
        else if (url.pathname === '/api/forpsi/admin') response=json({mailboxes:[],rules:[],labels:[],queue:[],truncated:{},credentialStorageReady:false});
        else if (url.pathname === '/api/driver-reports') response=json({apiStatus:'ready',permissions:{canCreate:true,canManage:true},requests:Array.from({length:18},(_,i)=>({id:`report-${i}`,reportId:`H-${i+1}`,licensePlate:`TEST ${String(i+1).padStart(3,'0')}`,defectDescription:'Kontrola osvětlení vozidla',status:'new_report',driverName:`Řidič ${i+1}`,createdByUserId:user.id,reportedAt:'2026-10-25T06:00:00Z'}))});
        else if (url.pathname === '/api/vehicle-tracking/status') response=json({apiStatus:'ready',liveVerified:true,lastUpdatedAt:new Date().toISOString(),summary:{vehiclesTotal:24,withoutValidLocationCount:3},locations:Array.from({length:21},(_,i)=>({id:`position-${i}`,vehicleId:`mobile-${i}`,licensePlate:`TEST ${String(i+1).padStart(3,'0')}`,latitude:49.2+i/1000,longitude:16.6+i/1000,lastGpsAt:new Date().toISOString(),speedKmh:i<12?35:0}))});
        else if (url.pathname === '/api/vehicles') response = json({apiStatus:'ready', vehicles:Array.from({length:24},(_,i)=>({id:`mobile-${i}`,licensePlate:`TEST ${String(i+1).padStart(3,'0')}`,brand:'MAN',model:'TGS',vehicleType:'Svozové vozidlo',driverName:`Řidič ${i+1}`,status:'active'}))});
        else if (url.pathname.endsWith('/tcars')) response=json({apiStatus:'ready',trips:[],costs:[],positions:[],fuel:[],summary:{},vehicle:{id:'mobile-0',licensePlate:'TEST 001'}});
        else if (url.pathname.startsWith('/api/vehicles/mobile-')) response = json({vehicle:{id:url.pathname.split('/').pop(),licensePlate:'TEST 001',brand:'MAN',model:'TGS'}});
        else if (url.pathname === '/api/vehicle-tracking/analytics') response = json({apiStatus:'ready',summary:{totalKm:1524,vehicleCount:24},vehicles:[]});
        else if (handler) response = await handler({ request, env });
        else if (url.pathname === "/api/users") {
          const access = await requireUserPermission(env, request, "users", "view");
          response = access.response || json({ users: [user, ...Array.from({length:23},(_,i)=>({id:`team-${i+2}`,name:`Zkouška ${i+2}`,email:`team${i+2}@example.test`,role:'readonly',active:true,status:'active'}))] });
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
  browser = await webkit.launch({ headless: true });
  console.log(`WebKit ${browser.version()}; local HTTPS; real auth handlers with mock OTP.`);


  const primaryRoutes = ['/', '/vozovy-park', '/sledovani-vozidel', '/trasy-svozu', '/hlaseni-ridicu', '/datove-schranky-plus', '/dovolena-nemoc/rychle-zadani', '/pohledavky', '/pneumatiky', '/nastaveni'];
  const extraRoutes = ['/dashboard','/servis-udrzba','/trasy-vzorku','/vistos','/naklady','/reporty','/rcs-sms-konverzace','/dovolena-nemoc','/uzivatele','/kontrola-systemu','/samoopravy','/pripominky','/dovolena-nemoc/kalendar','/dovolena-nemoc/ke-schvaleni','/dovolena-nemoc/nova-zadost','/vozovy-park#fleet-fuel'];
  const routes = process.env.MOBILE_AUDIT_EXTRA ? extraRoutes : primaryRoutes;
  const context = await browser.newContext({ ...devices['iPhone 13'], ignoreHTTPSErrors:true });
  await context.route('**/*', route=>new URL(route.request().url()).origin===origin?route.continue():route.abort());
  const cookie=await createSessionCookie(env,user);
  await context.addCookies([{name:'__Host-smart_odpady_session',value:cookie.split(';')[0].split('=')[1],domain:'127.0.0.1',path:'/',httpOnly:true,secure:true,sameSite:'Lax'}]);
  const page=await context.newPage(); page.setDefaultTimeout(10000); page.setDefaultNavigationTimeout(15000);
  const errors=[]; page.on('pageerror',e=>errors.push(e.message)); page.on('console',m=>{if(m.type()==='error') {console.log('CONSOLE',m.text()); if(m.text().includes('smart_odpady_render_failed')) errors.push(m.text());}});
  for(const [width,height] of (process.env.MOBILE_FUNCTION_ONLY ? [] : process.env.MOBILE_AUDIT_FAST ? [[375,667]] : [[375,667],[390,844],[430,932]])) {
    await page.setViewportSize({width,height});
    for (const route of routes) {
      await page.goto(origin+route); await page.locator('[data-logout]').first().waitFor({state:'attached'}); await page.waitForTimeout(500);
      const slug=route==='/'?'home':route.replaceAll('/','-').slice(1);
      const metrics=await page.evaluate(()=>({height:document.documentElement.scrollHeight,width:document.documentElement.scrollWidth,viewport:innerWidth,headings:[...document.querySelectorAll('h1,h2')].filter(x=>x.getBoundingClientRect().height).map(x=>({text:x.textContent.trim(),y:Math.round(x.getBoundingClientRect().y)})),sections:[...document.querySelector('main').children].map(x=>({tag:x.tagName,cls:x.className,h:Math.round(x.getBoundingClientRect().height)}))}));
      await page.screenshot({path:path.join(output,`${slug}-${width}.png`),fullPage:true});
      await page.screenshot({path:path.join(output,`${slug}-${width}-viewport.png`)});
      if(!process.env.MOBILE_BASELINE) assert.ok(metrics.width<=width,`Horizontal overflow ${route} ${width}`);
      if(width===375) await writeFile(path.join(output,`${slug}-dom.html`),await page.locator('main').first().innerHTML());
      results.push({route,width,height,...metrics});
      console.log(route,width,metrics.height,metrics.width);
    }
  }
  if (!process.env.MOBILE_BASELINE && !process.env.MOBILE_AUDIT_EXTRA) {
    await page.setViewportSize({width:375,height:667});
    await page.goto(origin); await page.locator('.mobile-today').waitFor(); await page.waitForTimeout(500);
    const header=await page.locator('.mobile-header').boundingBox(); assert.equal(header.height,52);
    assert.equal(await page.locator('.ai-assistant-launcher').count(),0,'Floating voice icon hidden');
    const quick=await page.locator('.mobile-quick-actions').boundingBox(); assert.ok(quick.y+quick.height<607,'All quick actions above fold');
    assert.equal(await page.locator('.mobile-today-kpis .main-dashboard-kpi').count(),3);
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
    await page.goto(origin+'/sledovani-vozidel'); await page.locator('.mobile-map-switch').waitFor(); await page.waitForTimeout(150);
    const stage=await page.locator('.tracking-operational-map-stage').boundingBox();
    assert.ok(stage.height>=250 && stage.y+stage.height<=607,'Map ends above navigation');
    await page.locator('.mobile-map-switch').getByRole('button',{name:'Vozidla',exact:true}).click();
    assert.ok(await page.locator('.tracking-operational-list').isVisible());
    assert.equal(await page.locator('.tracking-operational-map-stage').isVisible(),false);
    await page.screenshot({path:path.join(output,'map-list-375.png')});
    await page.locator('.tracking-operational-vehicle').first().click();
    assert.ok(await page.locator('.tracking-operational-detail').isVisible(), 'Selected map record detail reachable');
    await page.goto(origin+'/hlaseni-ridicu'); await page.locator('[name=defectDescription]').waitFor();
    await page.locator('[name=defectDescription]').fill('Test mobilního formuláře; neodesílat');
    await page.setViewportSize({width:375,height:420});
    await page.locator('[name=defectDescription]').scrollIntoViewIfNeeded();
    assert.equal(await page.locator('[name=defectDescription]').inputValue(),'Test mobilního formuláře; neodesílat');
    assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'Narrow keyboard viewport');
    await page.screenshot({path:path.join(output,'keyboard-simulated-375.png')});
    await page.setViewportSize({width:1440,height:1000});
    await page.goto(origin); await page.locator('.main-dashboard-economics').waitFor();
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
  assert.deepEqual(errors,[],'No render or browser errors');
  await writeFile(path.join(output,'audit.json'),JSON.stringify({results,errors},null,2));
  await context.close();
} finally {
 if(browser) await browser.close();
 if(server) { server.closeAllConnections(); await new Promise(resolve=>server.close(resolve)); }
 await rm(temp,{recursive:true,force:true});
}
