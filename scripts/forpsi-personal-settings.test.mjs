import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { fixture } from '../services/forpsi-connector/test/fixtures.mjs';
import { executeAdmin } from '../services/forpsi-connector/src/admin.mjs';
import { createWorker } from '../services/forpsi-connector/src/worker.mjs';
import { Shortcuts } from '../services/forpsi-connector/src/shortcuts.mjs';
import { SOAI_ISSUER } from '../services/forpsi-connector/src/admin-access.mjs';
import { createSessionCookie } from '../functions/_lib/auth.js';
import { onRequestPost } from '../functions/api/forpsi/personal-settings.js';

test('manual SO.ai settings belong to the authenticated employee and survive a new chat',async()=>{
  const f=fixture(),secret='synthetic-personal-settings-service-token-longer-than32';
  const radim={id:'settings-radim',name:'Radim TEST',email:'radim@example.test',role:'readonly',
    active:true,status:'active'};
  const colleague={id:'settings-colleague',name:'Colleague TEST',email:'colleague@example.test',
    role:'readonly',active:true,status:'active'};
  Object.assign(f.env,{SOAI_MAIL_ENABLED:'true',FORPSI_TENANT_ID:'tenant-a',CONNECTOR_ADMIN_TOKEN:secret});
  await executeAdmin('access_save',{id:'mail-a',revision:1,userId:radim.id,actions:['read']},
    {...f,tenant:'tenant-a',actorId:'admin'});
  const worker=createWorker();
  const env={AUTH_MODE:'mock',AUTH_USERS_JSON:JSON.stringify([radim,colleague]),FORPSI_ADMIN_TOKEN:secret,
    FORPSI_CONNECTOR:{fetch:r=>worker.fetch(r,f.env)}};
  const cookie=(await createSessionCookie(env,radim)).split(';')[0];
  const otherCookie=(await createSessionCookie(env,colleague)).split(';')[0];
  const call=(body,cookieValue=cookie,origin='https://so.test')=>onRequestPost({env,
    request:new Request('https://so.test/api/forpsi/personal-settings',{method:'POST',
      headers:{cookie:cookieValue,origin,'content-type':'application/json'},body:JSON.stringify(body)})});

  assert.equal((await call({operation:'status'},'')).status,401);
  assert.equal((await call({operation:'status'},cookie,'https://evil.test')).status,403);
  assert.equal((await call({operation:'status',actorId:'alice'})).status,400);
  const initial=await (await call({operation:'status'})).json();
  assert.equal(initial.data.mailboxes.length,1);
  assert.equal(initial.data.mailboxes[0].id,'mail-a');
  assert.equal(initial.data.mailboxes[0].signature.configured,false);
  assert.equal((await call({operation:'status'},otherCookie)).status,403);

  const signature=await call({operation:'save_signature',mailboxId:'mail-a',expectedRevision:0,
    fullText:'Radim O.\nKaiser',shortText:'Radim'});
  assert.equal(signature.status,200);
  assert.equal((await signature.json()).data.mailboxes[0].signature.revision,1);
  assert.equal((await call({operation:'save_signature',mailboxId:'mail-a',expectedRevision:0,
    fullText:'stale',shortText:'stale'})).status,409);
  const style=await call({operation:'save_style',mailboxId:'mail-a',expectedProfileVersion:0,
    replyStyle:'concise'});
  assert.equal(style.status,200);
  const saved=(await (await call({operation:'status'})).json()).data.mailboxes[0];
  assert.equal(saved.signature.fullText,'Radim O.\nKaiser');
  assert.equal(saved.replyStyle,'concise');
  assert.equal(saved.profileVersion,1);
  assert.equal((await call({operation:'save_style',mailboxId:'mail-a',expectedProfileVersion:0,
    replyStyle:'formal'})).status,409);
  assert.equal((await call({operation:'save_signature',mailboxId:'mail-a',expectedRevision:0,
    fullText:'cizí',shortText:'cizí'},otherCookie)).status,403);
  assert.equal((await call({operation:'remove_signature',mailboxId:'mail-a',expectedRevision:1})).status,200);
  assert.equal((await (await call({operation:'status'})).json()).data.mailboxes[0].signature.configured,false);
  const linked=await f.store.identity(SOAI_ISSUER,radim.id);
  const shortcut=await new Shortcuts({store:f.store,principal:{id:linked.id,scopes:['forpsi:read']},env:f.env}).propose({
    mailboxId:'mail-a',name:'Potvrď přijetí',phrases:['potvrď přijetí'],definition:{
      kind:'acknowledge',recipient:null,attachmentRule:'none',style:'stručně',signatureMode:'short'}});
  const pending=(await (await call({operation:'status'})).json()).data.mailboxes[0].shortcuts;
  assert.equal(pending[0].id,shortcut.id);
  assert.equal(pending[0].approved,false);
  assert.equal((await call({operation:'approve_shortcut',mailboxId:'mail-a',
    shortcutId:shortcut.id,version:shortcut.version},otherCookie)).status,403);
  assert.equal((await call({operation:'approve_shortcut',mailboxId:'mail-a',
    shortcutId:shortcut.id,version:shortcut.version})).status,200);
  const approved=(await (await call({operation:'status'})).json()).data.mailboxes[0].shortcuts[0];
  assert.equal(approved.approved,true);
  assert.equal((await call({operation:'remove_shortcut',mailboxId:'mail-a',
    shortcutId:shortcut.id,version:shortcut.version})).status,409);
  assert.equal((await call({operation:'remove_shortcut',mailboxId:'mail-a',
    shortcutId:shortcut.id,version:approved.version})).status,200);
  assert.deepEqual((await (await call({operation:'status'})).json()).data.mailboxes[0].shortcuts,[]);
});

test('manual settings page shows a concurrent edit conflict after reloading the latest values',async()=>{
  class Element {
    constructor(){this.value='';this.textContent='';this.hidden=false;this.disabled=false;this.handlers={};this.children=[];}
    addEventListener(type,handler){this.handlers[type]=handler;}
    replaceChildren(...children){this.children=children;}
    append(...children){this.children.push(...children);}
  }
  const ids=new Map(['status','result','app','mailbox','mode','full','short','preview-full',
    'preview-short','remove-signature','style','style-example','save-signature','save-style','shortcuts']
    .map(id=>[id,new Element()]));
  const mailbox={id:'mail-a',address:'alice@example.test',signature:{configured:true,
    revision:1,fullText:'Alice Full',shortText:'Alice'},replyStyle:'friendly',
    profileVersion:1,syncMode:'manual',shortcuts:[{id:'8e70137b-10da-474e-ac65-6b89a4a346d3',
      name:'Potvrď přijetí',phrases:['potvrď přijetí'],definition:{recipient:null,
        attachmentRule:'none',style:'stručně',signatureMode:'short'},approved:false,version:1}]};
  let calls=0;
  const fetch=async (_url,options)=>{
    const command=JSON.parse(options.body);calls++;
    if(command.operation==='status')return Response.json({data:{mailboxes:[mailbox],
      chatgptNativeActionsEnabled:false}});
    if(command.operation==='approve_shortcut'){
      assert.equal(command.shortcutId,mailbox.shortcuts[0].id);
      assert.equal(command.version,1);
      mailbox.shortcuts[0].approved=true;mailbox.shortcuts[0].version=2;
      return Response.json({data:{mailboxes:[mailbox],chatgptNativeActionsEnabled:false}});
    }
    assert.equal(command.operation,'save_style');
    assert.equal(command.expectedProfileVersion,1);
    mailbox.profileVersion=2;mailbox.replyStyle='formal';
    return Response.json({code:'PROFILE_VERSION_CONFLICT'},{status:409});
  };
  const html=readFileSync(new URL('../public/forpsi-mail-settings/index.html',import.meta.url),'utf8');
  const script=html.match(/<script type="module">([\s\S]*?)<\/script>/)?.[1];
  assert.ok(script);
  vm.runInNewContext(script,{document:{getElementById:id=>ids.get(id),
    createElement:()=>new Element()},window:{confirm:()=>true},fetch,Response});
  await new Promise(resolve=>setImmediate(resolve));
  assert.equal(calls,1,'opening settings only reads; it never saves automatically');
  ids.get('style').value='concise';
  ids.get('save-style').handlers.click();
  await new Promise(resolve=>setImmediate(resolve));
  assert.equal(calls,3,'a conflict reloads the latest version');
  assert.equal(ids.get('style').value,'formal');
  assert.match(ids.get('result').textContent,/mezitím změnil/);
  const approve=ids.get('shortcuts').children[0].children[2].children[0];
  assert.equal(approve.textContent,'Schválit tuto podobu');
  approve.handlers.click();
  await new Promise(resolve=>setImmediate(resolve));
  assert.equal(calls,4);
  assert.match(ids.get('result').textContent,/Zkratka je schválená/);
});
