// Isolated browser verification. Real UI, Pages/Worker handlers and SQLite; synthetic provider/data only.
// This server listens only on loopback and contains no production credentials.
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { resolve,sep } from 'node:path';
import { workFixture } from './work-v2-fixtures.mjs';
import { createWorker } from '../src/worker.mjs';
import { executeTool } from '../src/mcp.mjs';
import { workV2Widget } from '../src/work-v2-widget.mjs';
import { forwardForpsiMail } from '../../../functions/api/forpsi/mail.js';
import { onRequestPost as forwardBrain } from '../../../functions/api/forpsi/brain.js';
import { forwardForpsiAdmin } from '../../../functions/api/forpsi/admin.js';
import { createSessionCookie } from '../../../functions/_lib/auth.js';

const f=await workFixture(),root=fileURLToPath(new URL('../../../',import.meta.url));
Object.assign(f.env,{MAIL_BRAIN_V2_ANALYSIS_MODE:'chatgpt',MAIL_BRAIN_V2_DAILY_CALL_LIMIT:'0',SOAI_MAIL_ENABLED:'true',FORPSI_TENANT_ID:'tenant-a',
  CONNECTOR_ADMIN_TOKEN:'synthetic-loopback-service-token-never-used-in-production'});
f.provider.listFolders=async()=>({folders:[{path:'INBOX',selectable:true},{path:'Sent',selectable:true}]});
f.provider.search=async()=>({messages:[],nextBeforeUid:null,uidValidity:'7'});
const user={id:'test-alice',name:'Alice – izolovaný test',email:'alice@example.com',role:'admin',active:true,status:'active'};
await f.store.run(`INSERT INTO principal_identity_links VALUES ('urn:smart-odpady:session',?,'alice','tenant-a',1)`,user.id);
await f.work.refresh({caseId:f.first.caseId},await f.proposal());
const worker=createWorker({providerFactory:f.providerFactory,verificationMode:'simulated'});
const env={AUTH_MODE:'mock',AUTH_COOKIE_NAME:'isolated_work_v2_session',AUTH_USERS_JSON:JSON.stringify([user]),FORPSI_ADMIN_TOKEN:f.env.CONNECTOR_ADMIN_TOKEN,
  FORPSI_CONNECTOR:{fetch:r=>worker.fetch(r,f.env)}};
const cookie=await createSessionCookie(env,user);
const hostHtml=`<!doctype html><html lang="cs"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<link rel="stylesheet" href="/src/styles.css"><title>Mail Brain – izolovaný TEST</title>
<body><main style="max-width:1100px;margin:0 auto;padding:16px;min-width:0"><p><strong>IZOLOVANÝ TEST · syntetická pošta · žádná skutečná schránka</strong></p><div id="app"></div></main>
<script type="module">import {forpsiMailSection,mountForpsiMail} from '/src/components/ForpsiMailPanel.js';
const app=document.getElementById('app');app.innerHTML=forpsiMailSection();
const apiJson=async(url,init={})=>{const response=await fetch(url,{...init,headers:{'content-type':'application/json'}});const data=await response.json();if(!response.ok){const e=Error(data.error||'Chyba');e.code=data.code;e.status=response.status;throw e;}return data;};
mountForpsiMail(app,{owner:'test-alice',apiJson,guard:action=>action()});</script></body></html>`;
const adminHtml=hostHtml.replace("import {forpsiMailSection,mountForpsiMail} from '/src/components/ForpsiMailPanel.js';",
  "import {forpsiAdminSection,mountForpsiAdmin} from '/src/components/ForpsiAdminPanel.js';")
  .replace('app.innerHTML=forpsiMailSection();',"app.innerHTML=forpsiAdminSection('test-alice');")
  .replace('mountForpsiMail(app,','mountForpsiAdmin(app,');
const widgetHost=`<!doctype html><html lang="cs"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>TEĎ – izolovaný test hostitele MCP</title><body><p>IZOLOVANÝ TEST hostitele MCP · syntetická pošta · ChatGPT zde neběží</p><p id="followup" role="status"></p><iframe title="TEĎ" src="/widget-frame" style="width:100%;height:80vh;border:0"></iframe><script>
const frame=document.querySelector('iframe');window.addEventListener('message',async event=>{if(event.source!==frame.contentWindow||event.origin!==location.origin)return;const m=event.data;if(m.method==='ui/initialize'){frame.contentWindow.postMessage({jsonrpc:'2.0',id:m.id,result:{}},location.origin);return;}
if(m.method==='ui/notifications/initialized'){const r=await fetch('/fixture-mcp',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({name:'render_attention',arguments:{version:'2.2',mailboxId:'mail-a'}})});const data=await r.json();frame.contentWindow.postMessage({jsonrpc:'2.0',method:'ui/notifications/tool-result',params:{structuredContent:{data}}},location.origin);return;}
if(m.method==='ui/message'){document.getElementById('followup').textContent='Předané zadání: '+m.params.content.map(c=>c.text||'').join(' ');frame.contentWindow.postMessage({jsonrpc:'2.0',id:m.id,result:{}},location.origin);return;}
if(m.method==='tools/call'){const r=await fetch('/fixture-mcp',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(m.params)});const data=await r.json();frame.contentWindow.postMessage({jsonrpc:'2.0',id:m.id,result:r.ok?{structuredContent:{data}}:{isError:true}},location.origin);}});</script></body></html>`;
const responsiveHost=`<!doctype html><html lang="cs"><meta charset="utf-8"><title>Mail Brain – test rozměrů</title>
<body><label>Šířka ověřované aplikace<select id="width"><option>320</option><option selected>375</option><option>430</option><option>768</option><option>1024</option><option>1440</option></select></label>
<p>IZOLOVANÝ TEST: skutečná aplikace v rámci o vybrané šířce.</p><button id="measure">Změřit zobrazení</button><output id="metrics"></output><iframe title="Testovaná aplikace" src="/" style="display:block;width:375px;height:80vh;border:0"></iframe>
<script>document.getElementById('width').onchange=e=>document.querySelector('iframe').style.width=e.target.value+'px';
document.getElementById('measure').onclick=()=>{const d=document.querySelector('iframe').contentDocument,h=d.documentElement;document.getElementById('metrics').textContent=JSON.stringify({width:h.clientWidth,scrollWidth:h.scrollWidth,overflow:h.scrollWidth>h.clientWidth,hasChatGptButton:[...d.querySelectorAll('button')].some(b=>b.textContent==='Zkopírovat zadání pro ChatGPT')});};</script></body></html>`;
const server=createServer(async(req,res)=>{try{
  f.setTime(Date.now());
  const origin='http://127.0.0.1:4179',url=new URL(req.url,origin),parts=[];
  for await(const part of req){parts.push(part);if(parts.reduce((n,p)=>n+p.length,0)>524288)throw Error('FIXTURE_REQUEST_TOO_LARGE');}
  const body=Buffer.concat(parts);let response;
  if(url.pathname.startsWith('/api/forpsi/')){
    const request=new Request(url,{method:req.method,headers:req.headers,...(body.length?{body}: {})});
    const handler=url.pathname.endsWith('/brain')?forwardBrain:url.pathname.endsWith('/admin')?forwardForpsiAdmin:forwardForpsiMail;
    response=await handler({request,env});
  }else if(url.pathname==='/fixture-mcp'){
    const input=JSON.parse(body);response=Response.json(await executeTool(input.name,input.arguments,f));
  }else if(url.pathname==='/widget-frame')response=new Response(workV2Widget,{headers:{'content-type':'text/html;charset=utf-8'}});
  else if(url.pathname==='/responsive')response=new Response(responsiveHost,{headers:{'content-type':'text/html;charset=utf-8'}});
  else if(url.pathname==='/admin')response=new Response(adminHtml,{headers:{'content-type':'text/html;charset=utf-8',
    'set-cookie':cookie.replace(/;\s*Secure/gi,'')}});
  else if(url.pathname==='/widget')response=new Response(widgetHost,{headers:{'content-type':'text/html;charset=utf-8'}});
  else if(url.pathname==='/'||url.pathname==='/dashboard')response=new Response(hostHtml,{headers:{'content-type':'text/html;charset=utf-8',
    'set-cookie':cookie.replace(/;\s*Secure/gi,'')}});
  else if(url.pathname.startsWith('/src/')){
    const path=resolve(root,`.${url.pathname}`);if(!path.startsWith(root.replace(/\/$/,'')+sep))throw Error('INVALID_PATH');
    response=new Response(await readFile(path),{headers:{'content-type':path.endsWith('.css')?'text/css':'text/javascript'}});
  }else response=new Response('Not found',{status:404});
  response.headers.set('Cache-Control','no-store');res.writeHead(response.status,Object.fromEntries(response.headers));res.end(Buffer.from(await response.arrayBuffer()));
}catch(error){console.error(error.message);res.writeHead(500,{'content-type':'application/json'});res.end(JSON.stringify({error:error.message}));}});
server.listen(4179,'127.0.0.1',()=>console.log('Isolated UI ready: http://127.0.0.1:4179'));
