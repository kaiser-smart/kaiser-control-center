// A presentation-only MCP Apps resource. The authoritative list and access checks
// live in workflow.mjs; this iframe may call only the existing read_message tool.
export const WORKLIST_UI_URI = 'ui://forpsi/worklist-v1.html';
export const worklistWidget = `<!doctype html>
<html lang="cs"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<style>
  :root { color-scheme: light dark; font-family: -apple-system,BlinkMacSystemFont,system-ui,sans-serif; }
  body { margin: 0; padding: 14px; background: Canvas; color: CanvasText; }
  .shell { border: 1px solid color-mix(in srgb, CanvasText 14%, transparent); border-radius: 16px; overflow: hidden; }
  header { display:flex; align-items:center; justify-content:space-between; gap:12px; padding:14px 16px; background:color-mix(in srgb, CanvasText 4%, Canvas); }
  h1 { font-size:17px; margin:0; } p { margin:4px 0; }
  .muted { color: color-mix(in srgb, CanvasText 60%, Canvas); font-size:12px; }
  .modes { display:flex; gap:4px; } button { font:inherit; cursor:pointer; }
  .mode { border:0; border-radius:8px; padding:7px 10px; background:transparent; color:inherit; }
  .mode[aria-pressed=true] { background:color-mix(in srgb, CanvasText 11%, Canvas); font-weight:600; }
  .layout { display:grid; grid-template-columns:minmax(0,1fr); min-height:240px; }
  .layout.split { grid-template-columns:minmax(220px,40%) minmax(0,60%); }
  ol { list-style:none; margin:0; padding:0; max-height:460px; overflow:auto; }
  li+li { border-top:1px solid color-mix(in srgb, CanvasText 10%, transparent); }
  .row { width:100%; display:grid; grid-template-columns:28px minmax(0,1fr); gap:7px; text-align:left; border:0; padding:12px 14px; background:transparent; color:inherit; }
  .row:hover,.row[aria-current=true] { background:color-mix(in srgb, #4589e8 11%, Canvas); }
  .number { color: color-mix(in srgb, CanvasText 54%, Canvas); font-weight:700; }
  .sender,.subject { display:block; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
  .sender { font-weight:650; font-size:13px; } .subject { font-size:13px; }
  .meta { display:flex; justify-content:space-between; gap:8px; margin-top:5px; }
  .badge { border-radius:999px; padding:2px 7px; background:color-mix(in srgb, #4589e8 14%, Canvas); font-size:11px; }
  .detail { border-left:1px solid color-mix(in srgb, CanvasText 12%, transparent); padding:18px; min-width:0; overflow-wrap:anywhere; }
  .detail h2 { font-size:17px; margin:0 0 8px; }
  .body { white-space:pre-wrap; line-height:1.55; font-size:13px; max-height:350px; overflow:auto; }
  .notice { padding:10px 15px; border-top:1px solid color-mix(in srgb, CanvasText 10%, transparent); }
  @media(max-width:610px) { .layout.split { grid-template-columns:1fr; } .detail { border-left:0; border-top:1px solid color-mix(in srgb, CanvasText 12%, transparent); } }
</style></head><body>
<section class="shell" aria-label="Čtecí přehled pošty"><header><div><h1>Pošta k posouzení</h1><p class="muted" id="summary">Načítám uložený seznam…</p></div>
<div class="modes" aria-label="Zobrazení"><button class="mode" id="compact" aria-pressed="true">Přehled</button><button class="mode" id="split" aria-pressed="false">Seznam–detail</button></div></header>
<div class="layout" id="layout"><ol id="items" aria-label="Pevně očíslovaný seznam zpráv"></ol><article class="detail" id="detail" hidden aria-live="polite"></article></div>
<p class="muted notice" id="notice">Čtecí prototyp. Otevření zprávy nemění její stav ani nic neodesílá.</p></section>
<script>
(() => {
  const pending=new Map(); let nextId=1, snapshot=null, selected=null, mode='compact';
  const el=id=>document.getElementById(id);
  const request=(method,params)=>new Promise((resolve,reject)=>{
    const id=nextId++;pending.set(id,{resolve,reject});
    window.parent.postMessage({jsonrpc:'2.0',id,method,params},'*');
  });
  const label=state=>({todo:'K vyřízení',waiting:'Čekám',snoozed:'Odloženo',done:'Hotovo'})[state]||'K vyřízení';
  function render(){
    if(!snapshot)return;
    const items=snapshot.items||[];
    el('summary').textContent=items.length+' zpráv · '+snapshot.pending+' k vyřízení · '+
      (snapshot.view==='priority'?'prioritní výběr':'nejnovější výběr')+' · seznam '+snapshot.listId;
    el('notice').textContent='Čtecí prototyp. '+(snapshot.knownRemainingPriority?
      snapshot.knownRemainingPriority+' dalších rozpoznaných prioritních zpráv v prohlédnuté části. ':'')+
      (snapshot.olderUnscanned?'Starší část schránky zatím nebyla posouzena. ':'')+
      'Otevření zprávy nic nemění ani neodesílá.';
    el('items').replaceChildren();
    for(const item of items){
      const li=document.createElement('li'),button=document.createElement('button');
      button.className='row';button.type='button';button.setAttribute('aria-current',String(selected===item.number));
      const n=document.createElement('span');n.className='number';n.textContent=String(item.number)+'.';
      const content=document.createElement('span'),sender=document.createElement('span'),subject=document.createElement('span'),meta=document.createElement('span'),badge=document.createElement('span'),date=document.createElement('span');
      sender.className='sender';sender.textContent=item.from||'Neznámý odesílatel';
      subject.className='subject';subject.textContent=item.subject||'(bez předmětu)';
      meta.className='meta';badge.className='badge';badge.textContent=(item.contentType==='newsletter'?'Newsletter · ':
        item.priority==='high'?'Priorita · ':'K posouzení · ')+label(item.state)+
        (item.newerReply?' · nová odpověď':'');
      date.className='muted';date.textContent=item.receivedAt?new Date(item.receivedAt).toLocaleDateString('cs-CZ'):'';
      meta.append(badge,date);content.append(sender,subject,meta);button.append(n,content);li.append(button);el('items').append(li);
      button.addEventListener('click',()=>open(item));
    }
    el('layout').classList.toggle('split',mode==='split');el('detail').hidden=mode!=='split';
    for(const key of ['compact','split'])el(key).setAttribute('aria-pressed',String(mode===key));
  }
  async function open(item){
    selected=item.number;mode='split';render();el('detail').textContent='Načítám zprávu…';
    try {
      const result=await request('tools/call',{name:'read_message',arguments:{mailboxId:snapshot.mailboxId,message:item.reference}});
      if(result.isError)throw new Error('Zprávu nelze bezpečně načíst.');
      const data=result.structuredContent?.data;
      if(!data)throw new Error('Zpráva není dostupná.');
      const title=document.createElement('h2'),from=document.createElement('p'),body=document.createElement('div');
      title.textContent=data.subject||'(bez předmětu)';from.className='muted';from.textContent=(data.from||[]).map(x=>x.address).join(', ');
      body.className='body';body.textContent=data.text||'(bez textu)';el('detail').replaceChildren(title,from,body);
      if(item.newerReply){
        const alert=document.createElement('p');alert.className='muted';
        alert.textContent='Ve vlákně je nová odpověď. Pro práci s ní vytvořte nový seznam.';
        el('detail').prepend(alert);
      }
    } catch {el('detail').textContent='Zprávu nelze načíst. Zkuste textovou alternativu v chatu.';}
  }
  window.addEventListener('message',event=>{
    if(event.source!==window.parent||event.data?.jsonrpc!=='2.0')return;
    const msg=event.data;
    if(msg.id!==undefined&&pending.has(msg.id)){const p=pending.get(msg.id);pending.delete(msg.id);msg.error?p.reject(msg.error):p.resolve(msg.result);return;}
    if(msg.method==='ui/notifications/tool-result'){snapshot=msg.params?.structuredContent?.data??null;render();}
  });
  el('compact').onclick=()=>{mode='compact';render();};el('split').onclick=()=>{mode='split';render();};
  request('ui/initialize',{protocolVersion:'2026-01-26',appInfo:{name:'forpsi-worklist',version:'1'},
    appCapabilities:{}}).then(()=>window.parent.postMessage({jsonrpc:'2.0',method:'ui/notifications/initialized',params:{}},'*'))
    .catch(()=>{el('summary').textContent='Interaktivní zobrazení není dostupné; použijte textový seznam v chatu.';});
})();
</script></body></html>`;
