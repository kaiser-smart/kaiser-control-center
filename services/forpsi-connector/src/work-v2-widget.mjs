// This app displays only server-authorized DTOs. All content uses textContent.
export const WORK_V2_UI_URI='ui://forpsi/attention-v2.html';
export const workV2Widget=`<!doctype html><html lang="cs"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1"><style>
:root{color-scheme:light dark;font-family:Quicksand,system-ui,sans-serif}*{box-sizing:border-box}
body{margin:0;padding:16px;background:Canvas;color:CanvasText;overflow-wrap:anywhere}
h1{font-size:22px;margin:0}h2{font-size:18px}h3{font-size:16px}p{line-height:1.45}
button,a{font:inherit;color:inherit}button,a.button{border:1px solid #8887;background:transparent;border-radius:9px;padding:9px 12px;cursor:pointer;text-decoration:none}
button:focus-visible,a:focus-visible{outline:2px solid #247a4b}button:disabled{opacity:.5}
.actions{display:flex;flex-wrap:wrap;gap:8px;margin-block:10px}article{border:1px solid #8885;border-radius:12px;padding:14px;margin-block:12px;min-width:0}
pre{white-space:pre-wrap;overflow-wrap:anywhere;font:inherit}small{opacity:.75}#status{min-height:1.5em}details{margin-block:10px}
</style></head><body><header><h1>TEĎ</h1><p id="counts"></p><p id="coverage"></p></header>
<div class="actions"><button id="refresh">Obnovit přehled</button><button id="back" hidden>Zpět na přehled</button></div>
<p id="status" role="status">Načítám…</p><main id="content"></main><div id="pages" class="actions"></div>
<script>(()=>{
let view=null,detail=null,busy=false,nextId=1;const pending=new Map(),el=id=>document.getElementById(id);
const node=(tag,text)=>{const n=document.createElement(tag);if(text!==undefined)n.textContent=String(text);return n};
const button=(text,fn)=>{const b=node('button',text);b.type='button';b.disabled=busy;b.onclick=fn;return b};
const request=(method,params)=>new Promise((resolve,reject)=>{const id=nextId++;const timer=setTimeout(()=>{pending.delete(id);reject(Error('Konektor neodpověděl včas. Obnovte přehled.'));},35000);pending.set(id,{resolve,reject,timer});window.parent.postMessage({jsonrpc:'2.0',id,method,params},'*')});
async function call(name,args){const result=await request('tools/call',{name,arguments:args});if(result.isError||!result.structuredContent?.data)throw Error('Přístup nebo podklady se změnily. Obnovte přehled.');return result.structuredContent.data}
async function run(fn){if(busy)return;busy=true;document.querySelectorAll('button').forEach(b=>b.disabled=true);el('status').textContent='Načítám…';
try{await fn();el('status').textContent='';}catch(error){view=null;detail=null;el('content').replaceChildren();el('counts').textContent='';el('pages').replaceChildren();el('status').textContent=error.message;}
finally{busy=false;document.querySelectorAll('button').forEach(b=>b.disabled=false);}}
const labels={todo:'Vyřídit',decision:'Rozhodnout',waiting:'Čekám',information:'Informace',review:'K ověření'};
const amount=(n,one,few,many)=>n+' '+(n===1?one:n>=2&&n<=4?few:many);
const filters=()=>({version:'2.2',...(view?.appliedFilters??{})});
function editLink(caseId){const a=node('a','Ověřit podklady a upravit práci v SO.ai');a.className='button';a.target='_blank';a.rel='noopener noreferrer';
const url=new URL('https://smart-odpady.ai/dashboard');url.searchParams.set('view','forpsi-mail');const mailboxId=detail?.case.mailbox_id??(view?.mailboxes.length===1?view.mailboxes[0].id:null);if(mailboxId)url.searchParams.set('forpsiMailboxId',mailboxId);if(caseId)url.searchParams.set('forpsiCaseId',caseId);a.href=url.href;
a.onclick=e=>{if(window.openai?.openExternal){e.preventDefault();window.openai.openExternal({href:a.href,redirectUrl:false});}};return a}
async function openCase(caseId){await run(async()=>{detail=await call('case_get',{caseId,version:'2.2'});renderDetail();});}
function render(){if(!view)return;detail=null;el('back').hidden=true;el('content').replaceChildren();el('pages').replaceChildren();
const c=view.counts;el('counts').textContent=amount(c.activeObligations.items,'aktivní povinnost','aktivní povinnosti','aktivních povinností')+' v '+amount(c.activeObligations.cases,'případu','případech','případech')+' · '+c.pendingConditionItems.items+' čeká na podmínku · '+c.attentionSignals.signals+' upozornění · '+amount(view.deadlineFacet.items,'termín','termíny','termínů');
el('coverage').textContent=view.coverage.complete?'Pošta je načtená pro uvedené období.':'Část pošty nebo vyhodnocení chybí. Přehled neznamená, že je vše vyřízené.';
for(const [key,label] of Object.entries(labels)){const items=view.workItems.filter(v=>v.primarySection===key);const groups=key==='review'?view.signalGroups:[];if(!items.length&&!groups.length)continue;
const section=node('section');section.append(node('h2',label));for(const v of items){const a=node('article');a.append(node('h3',v.item.action),node('p',v.explanation),node('p','Vlastník: '+v.item.owner.label));
if(v.item.dueDate)a.append(node('p','Termín: '+v.item.dueDate.value));if(v.personalState.snoozedUntil)a.append(node('small','Osobně odloženo do '+new Date(v.personalState.snoozedUntil).toLocaleString('cs-CZ')));
a.append(button('Otevřít případ',()=>openCase(v.item.caseId)));section.append(a);}
for(const g of groups){const a=node('article');a.append(node('h3',g.visibleSignalCount+' hlášení'));for(const s of view.signals.filter(s=>g.memberSignalIds.includes(s.signal.id)))a.append(node('p',s.explanation),button('Otevřít podklady',()=>openCase(s.signal.caseId)));if(g.visibleSignalCount>1)a.append(node('small','Počet hlášení není počet skutečných událostí.'));section.append(a);}el('content').append(section);}
if(view.legacyFallback.length){const box=node('details');box.append(node('summary','Případy čekající na nové vyhodnocení ('+view.legacyFallback.length+')'));for(const c of view.legacyFallback)box.append(node('p',c.title),button('Otevřít případ',()=>openCase(c.caseId)));el('content').append(box);}
el('content').append(editLink());if(view.pagination.nextCursor)el('pages').append(button('Další část přehledu',()=>run(async()=>{view=await call('attention_list',{...filters(),cursor:view.pagination.nextCursor});render();})));}
function renderDetail(){el('back').hidden=false;el('pages').replaceChildren();const root=el('content');root.replaceChildren(node('h2',detail.case.title));
const w=detail.work;for(const v of w.projection.workItems){const a=node('article');a.append(node('h3',v.item.action),node('p',v.explanation),node('p','Vlastník: '+v.item.owner.label));
const evidence=node('details');evidence.append(node('summary','Podklady jednotlivých údajů'));
const properties={existence:'Existence práce',actor:'Autor',owner:'Vlastník',counterparty:'Protistrana',action:'Činnost',category:'Druh',dueDate:'Termín',condition:'Podmínka',result:'Výsledek'};
for(const [property,refs] of Object.entries(v.item.propertyEvidence)){for(const ref of refs){const p=node('p');p.append(node('strong',(properties[property]||property)+': '),node('q',ref.quote));evidence.append(p);}}a.append(evidence);
root.append(a);}if(w.proposals.length)root.append(node('p','K ověření významu a pravomoci autora: '+amount(w.proposals.length,'výklad','výklady','výkladů')+'.'));
root.append(editLink(w.caseId));for(const m of detail.messages){const d=node('details');d.append(node('summary',m.subject+' · '+m.sender),node('pre',m.body_text));root.append(d);}}
el('refresh').onclick=()=>run(async()=>{view=await call('attention_list',filters());render();});el('back').onclick=render;
window.addEventListener('message',event=>{if(event.source!==window.parent||event.data?.jsonrpc!=='2.0')return;const m=event.data;if(m.id!==undefined&&pending.has(m.id)){const p=pending.get(m.id);pending.delete(m.id);clearTimeout(p.timer);m.error?p.reject(Error(m.error.message||'Konektor odmítl požadavek.')):p.resolve(m.result);return;}
if(m.method==='ui/notifications/tool-result'){const data=m.params?.structuredContent?.data;if(data?.schemaVersion==='mail-brain-attention.v2.2'){view=data;render();el('status').textContent='';}}});
request('ui/initialize',{protocolVersion:'2026-01-26',appInfo:{name:'forpsi-attention',version:'2.2'},appCapabilities:{}})
.then(()=>window.parent.postMessage({jsonrpc:'2.0',method:'ui/notifications/initialized',params:{}},'*'))
.catch(()=>{el('status').textContent='Interaktivní zobrazení není dostupné. Použijte autorizovaný přehled v chatu.';});
})();</script></body></html>`;
