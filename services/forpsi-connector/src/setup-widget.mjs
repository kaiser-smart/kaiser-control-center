// Presentation only. Consent and every answer are checked against the authenticated
// mailbox and the current server-side setup session by the existing MCP tools.
export const SETUP_UI_URI='ui://forpsi/setup-v1.html';
export const setupWidget=`<!doctype html>
<html lang="cs"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<style>
:root{color-scheme:light dark;font-family:-apple-system,BlinkMacSystemFont,system-ui,sans-serif}
body{margin:0;padding:16px;background:Canvas;color:CanvasText}
main{max-width:620px;border:1px solid color-mix(in srgb,CanvasText 15%,transparent);border-radius:16px;padding:20px;box-sizing:border-box}
h2{font-size:19px;line-height:1.3;margin:0 0 10px}p{line-height:1.5;margin:8px 0 15px}
.muted{color:color-mix(in srgb,CanvasText 62%,Canvas);font-size:13px}.choices{display:grid;gap:8px;margin:18px 0}
button,a.action{font:inherit;cursor:pointer;border:1px solid color-mix(in srgb,CanvasText 18%,transparent);border-radius:10px;padding:11px 13px;background:color-mix(in srgb,#4589e8 10%,Canvas);color:CanvasText;text-align:left;text-decoration:none}
button:hover,a.action:hover{background:color-mix(in srgb,#4589e8 20%,Canvas)}button:disabled{opacity:.6;cursor:wait}
label{display:block;margin:10px 0}input[type=checkbox]{margin-right:9px}input[type=number],textarea{box-sizing:border-box;width:100%;font:inherit;border:1px solid color-mix(in srgb,CanvasText 25%,transparent);border-radius:8px;background:Canvas;color:CanvasText;padding:9px}
textarea{min-height:75px}.error{color:#b52628}.info{color:CanvasText;background:color-mix(in srgb,#4589e8 9%,Canvas);border-radius:8px;padding:10px}.note{border-top:1px solid color-mix(in srgb,CanvasText 12%,transparent);padding-top:12px}
</style></head><body><main id="app" aria-live="polite"><h2>Osobní nastavení pošty</h2><p>Načítám…</p></main>
<script>
(()=>{
  const app=document.getElementById('app'),pending=new Map();let nextId=1,snapshot=null,busy=false;
  const node=(tag,text,className)=>{const e=document.createElement(tag);if(text!==undefined)e.textContent=text;if(className)e.className=className;return e};
  const request=(method,params)=>new Promise((resolve,reject)=>{const id=nextId++;pending.set(id,{resolve,reject});
    window.parent.postMessage({jsonrpc:'2.0',id,method,params},'*')});
  const friendlyError=code=>({'ANSWER_NEEDS_CLARIFICATION':'Této odpovědi zatím nerozumím jistě. Zkuste ji upřesnit.',
    'QUESTION_OUT_OF_SEQUENCE':'Tato otázka už není aktuální. Otevřete prosím nejnovější kartu.',
    'PROFILE_VERSION_CONFLICT':'Návrh se mezitím změnil. Otevřete prosím nejnovější kartu.',
    'ONBOARDING_NOT_READY':'Nastavení ještě není připravené. Zkuste se vrátit k poslední kartě.',
    'SIGNATURE_EVIDENCE_UNAVAILABLE':'Podpis se nepodařilo ověřit. Můžete ho vložit ručně.',
    'ACCESS_DENIED':'K této schránce teď nemáte přístup.'})[code]||
    'Odpověď se nepodařilo uložit. Zkuste to znovu; nic se ve schránce nezměnilo.';
  const tool=async(name,args)=>{const r=await request('tools/call',{name,arguments:args});
    if(r.isError)throw Error(friendlyError(r.content?.[0]?.text));return r.structuredContent?.data};
  const message=prompt=>{
    if(window.openai?.sendFollowUpMessage)return window.openai.sendFollowUpMessage({prompt});
    return request('ui/message',{role:'user',content:[{type:'text',text:prompt}]});
  };
  const button=(label,action)=>{const b=node('button',label);b.type='button';b.onclick=async()=>{
    if(busy)return;busy=true;b.disabled=true;try{await action();}catch(error){showError(error.message);}finally{busy=false;b.disabled=false;}};return b};
  const showError=text=>{let e=document.getElementById('setup-error');if(!e){e=node('p','','error');e.id='setup-error';app.append(e)}e.textContent=text};
  const showInfo=text=>{let e=document.getElementById('setup-info');if(!e){e=node('p','','info');e.id='setup-info';app.append(e)}e.textContent=text};
  const heading=text=>{app.replaceChildren(node('h2',text))};
  const choiceLabel=value=>({'přeskočit':'Teď ne','ručně':'Jen když o poštu požádám',
    'každých 15 minut':'Každých 15 minut','použít doložený návrh':'Ano, tento podpis je můj',
    'ponechat bez podpisu':'Pokračovat bez podpisu','žádný':'Žádný z těchto kontaktů',
    'ano, relevantní':'Ano, patří k mé práci','ne, nerelevantní':'Ne, tohle neřeším'})[value]||value;
  function consent(){
    heading('Přizpůsobit poštu vám');app.append(node('p','Pomůžu vám nastavit poštu tak, aby důležité věci nezapadly a zbytečnosti vás nezdržovaly. Můžu pro návrh projít nejvýše 50 přijatých a odeslaných e-mailů z posledních 30 dní? Nic neodešlu ani nezměním ve vaší schránce.'));
    if(!snapshot.sentFolderAvailable)app.append(node('p','K vašim odeslaným zprávám se teď nedostanu, takže z nich zatím nemůžu navrhnout podpis.','muted'));
    const start=async(period,selected)=>{
      if(!selected.length||selected.length>8||!Number.isInteger(period)||period<1||period>90){
        showError('Vyberte složku a období od 1 do 90 dní.');return}
      const begun=await tool('begin_mail_setup',{mailboxId:snapshot.mailboxId,consent:true,days:period,folders:selected});
      await tool('analyze_mail_history',{sessionId:begun.sessionId});
      heading('Děkuji, můžete pokračovat');
      app.append(node('p','Teď projdu vybrané zprávy a připravím vám konkrétní návrh.'));
      await message('Pokračujte prosím v mém osobním nastavení pošty. Vyhodnoťte jen odsouhlasené zprávy a potom mi ukažte další volbu v klikacím formuláři.');
    };
    const defaultFolders=(snapshot.folders||[]).filter(f=>f.path==='INBOX'||
      snapshot.sentFolderAvailable&&f.path===snapshot.sentFolder).map(f=>f.path);
    app.append(button('Ano, začněte.',()=>start(30,defaultFolders)));
    const customize=node('div');customize.hidden=true;
    app.append(button('Chci jiný rozsah.',()=>{customize.hidden=false}),customize);
    const choices=node('div',undefined,'choices');
    const folders=(snapshot.folders||[]).filter(f=>f.selectable!==false);
    for(const folder of folders){const label=node('label'),check=node('input');check.type='checkbox';
      check.value=folder.path;check.checked=folder.path==='INBOX'||folder.path===snapshot.sentFolder;
      label.append(check,document.createTextNode(folder.path==='INBOX'?'Doručená':
        folder.path===snapshot.sentFolder?'Odeslaná':folder.path));choices.append(label)}
    customize.append(node('p','Které složky mohu použít?'),choices);
    const days=node('input');days.type='number';days.min='1';days.max='90';days.value='30';
    const dayLabel=node('label','Za kolik posledních dní?');dayLabel.append(days);customize.append(dayLabel);
    customize.append(button('Souhlasím a pokračovat',async()=>{
      const selected=[...choices.querySelectorAll('input:checked')].map(x=>x.value);
      await start(Number(days.value),selected);
    }));
    app.append(button('Teď ne.',async()=>{
      await tool('begin_mail_setup',{mailboxId:snapshot.mailboxId,consent:false});
      heading('Dobře, necháme to na později');app.append(node('p','Poštu můžete dál používat beze změny.'));
    }));
  }
  async function answer(value){snapshot=await tool('answer_mail_setup',{
    sessionId:snapshot.sessionId,questionId:snapshot.nextQuestion.id,answer:value});render();
    if(snapshot.clarification)showInfo(snapshot.clarification);
    else if(snapshot.interpretation?.interpreted?.length)showInfo(snapshot.interpretation.interpreted.join(' '));}
  function question(){
    const q=snapshot.nextQuestion;heading('Nastavení pošty');app.append(node('p',q.title));
    if(q.id==='signature'&&snapshot.observations?.signatureCandidate){
      const candidate=snapshot.observations.signatureCandidate;
      app.append(node('p','Pro nové zprávy','muted'),node('pre',candidate.fullText),
        node('p','Pro odpovědi','muted'),node('pre',candidate.shortText));
    }
    if(q.id==='important_contacts'){
      const box=node('div',undefined,'choices');
      for(const value of q.options.filter(x=>x!=='žádný'&&x!=='přeskočit')){
        const label=node('label'),check=node('input');check.type='checkbox';check.value=value;
        label.append(check,document.createTextNode(value));box.append(label)}
      app.append(box,button('Potvrdit vybrané',async()=>{
        const selected=[...box.querySelectorAll('input:checked')].map(x=>x.value);
        if(!selected.length){showInfo('Vyberte kontakt, nebo použijte „Žádný z těchto kontaktů“ či „Teď ne“.');return}
        await answer('Důležité kontakty: '+selected.join(', '))}),
      button('Žádný z těchto kontaktů',()=>answer('žádný')),
      button('Teď ne',()=>answer('přeskočit')));
    }else if(q.id==='newsletter_keep'){
      const box=node('div',undefined,'choices');
      for(const item of q.candidates||[]){const label=node('label'),check=node('input');
        check.type='checkbox';check.value=item.id;
        label.append(check,document.createTextNode(item.title+' — '+item.sender));box.append(label)}
      app.append(box,button('Nechat vybrané na očích',async()=>{
        const selected=[...box.querySelectorAll('input:checked')].map(x=>x.value);
        if(!selected.length){showInfo('Vyberte newsletter, nebo klikněte na „Žádný“ či „Teď ne“.');return}
        await answer('vybrat: '+selected.join(','))}),
      button('Žádný z těchto newsletterů',()=>answer('žádný')),
      button('Teď ne',()=>answer('přeskočit')));
    }else{
      const choices=node('div',undefined,'choices');for(const value of q.options)choices.append(button(choiceLabel(value),()=>answer(value)));
      app.append(choices);
    }
    if(q.id==='signature'){
      const full=node('textarea');full.placeholder='Vložte podpis, který používáte';
      app.append(node('p','Pokud chcete jiný podpis, vložte jej sem. Kratší podobu navrhnu z prvních řádků a uvidíte ji před závěrečným potvrzením.','muted'),full,
        button('Vložit tento podpis',()=>{
          if(!full.value.trim()){showError('Vložte prosím svůj podpis.');return}
          return answer(full.value.trim());
        }));
    }else{
      const custom=node('textarea');custom.placeholder='Vlastní odpověď (volitelné)';
      app.append(custom,button('Použít vlastní odpověď',()=>answer(custom.value)));
    }
    app.append(node('p','Vaše volba je zatím jen návrh. Zprávy se tím nemění.','muted note'));
  }
  function waiting(){heading('Připravuji návrh');app.append(node('p','ChatGPT ještě vyhodnocuje odsouhlasené zprávy. Zatím po vás nechci rozhodnutí bez podkladů.'));
    app.append(button('Pokračovat v ChatGPT',()=>message('Dokonči obsahovou analýzu schváleného vzorku přes read_setup_sample a submit_setup_analysis. Potom ukaž render_mail_setup s klikacími volbami.')))}
  function ready(){heading('Návrh je připraven');app.append(node('p','Teď si jej můžete v klidu prohlédnout. Platit začne až po vašem schválení.'));
    const profile=snapshot.proposal?.data||{},list=node('ul');
    const add=text=>list.append(node('li',text));
    for(const agenda of profile.agendaRecommendations||[])if(agenda.userMarkedRelevant===true)add('Běžná agenda: '+agenda.summary);
    if(profile.importantContacts?.length)add('Přednostní pracovní kontakty: '+profile.importantContacts.join(', '));
    for(const rule of profile.newsletterRules||[])add((rule.action==='keep_visible'?'Na očích: ':'Mimo hlavní priority: ')+
      (rule.subject||rule.seriesKey)+' od '+rule.sender);
    if(profile.replyStyle?.mode)add('Styl návrhů odpovědí: '+({concise:'stručně a věcně',friendly:'přátelsky',formal:'formálně'}[profile.replyStyle.mode]||profile.replyStyle.mode));
    if(profile.synchronization?.mode==='interval')add('Novou poštu kontrolovat každých '+profile.synchronization.minutes+' minut.');
    if(profile.signature?.fullText){add('Podpis pro nové zprávy: '+profile.signature.fullText);
      add('Podpis pro odpovědi: '+profile.signature.shortText)}
    if(!list.children.length)add('Zatím žádné trvalé pravidlo; zprávy zůstávají k posouzení.');
    app.append(list);
    if(snapshot.approvalUrl){const a=node('a','Potvrdit nastavení','action');a.href=snapshot.approvalUrl;a.target='_blank';a.rel='noopener noreferrer';app.append(a)}
    else app.append(node('p','Zbývá nastavení potvrdit ve vašem účtu SO.ai.','muted'));
  }
  function render(){if(!snapshot)return;
    if(snapshot.mode==='consent')return consent();
    if(snapshot.nextQuestion)return question();
    if(snapshot.analysisStatus==='awaiting_chatgpt'||snapshot.analysisStatus!=='chatgpt_proposal'&&snapshot.status!=='approved')return waiting();
    return ready();
  }
  window.addEventListener('message',event=>{if(event.source!==window.parent||event.data?.jsonrpc!=='2.0')return;
    const msg=event.data;if(msg.id!==undefined&&pending.has(msg.id)){
      const p=pending.get(msg.id);pending.delete(msg.id);msg.error?p.reject(msg.error):p.resolve(msg.result);return}
    if(msg.method==='ui/notifications/tool-result'){snapshot=msg.params?.structuredContent?.data??null;render()}});
  request('ui/initialize',{protocolVersion:'2026-01-26',appInfo:{name:'forpsi-setup',version:'1'},appCapabilities:{}})
    .then(()=>window.parent.postMessage({jsonrpc:'2.0',method:'ui/notifications/initialized',params:{}},'*'))
    .catch(()=>{heading('Formulář není dostupný');app.append(node('p','Pokračujte textově v chatu.'))});
})();
</script></body></html>`;
