import test from 'node:test';
import assert from 'node:assert/strict';
import {fixture,mail} from './fixtures.mjs';
import {executeAdmin} from '../src/admin.mjs';
import {createWorker} from '../src/worker.mjs';
import {forwardForpsiMail} from '../../../functions/api/forpsi/mail.js';
import {forwardForpsiAdmin} from '../../../functions/api/forpsi/admin.js';
import {createSessionCookie} from '../../../functions/_lib/auth.js';
import {Forpsi} from '../src/forpsi.mjs';
import {simpleParser} from 'mailparser';
import {composerPayload,composedText,mountForpsiComposer,openForpsiDraft,saveForpsiComposer,forpsiComposerDirtyTarget} from '../../../src/components/ForpsiComposer.js';

const user={id:'composition-user',role:'admin',name:'TEST admin',email:'admin@example.test',active:true,status:'active'};
async function setup(actions=['read','write']) {
  const f=fixture();Object.assign(f.env,{SOAI_MAIL_ENABLED:'true',SOAI_DRAFTS_ENABLED:'true',CONNECTOR_ENABLED:'false',FORPSI_TENANT_ID:'tenant-a',CONNECTOR_ADMIN_TOKEN:'synthetic-composition-test-token-over32'});
  const ctx={...f,tenant:'tenant-a',actorId:user.id};
  await executeAdmin('access_save',{id:'mail-a',revision:1,userId:user.id,actions},ctx);
  f.provider.saveDraft=async(message,options)=>{f.calls.push(['draft',message,options]);return {saved:true,folder:'Drafts',reference:{folder:'Drafts',uid:32,uidValidity:'5'}};};
  const worker=createWorker({providerFactory:f.providerFactory,verificationMode:'simulated'});
  const env={AUTH_MODE:'mock',AUTH_USERS_JSON:JSON.stringify([user]),FORPSI_ADMIN_TOKEN:f.env.CONNECTOR_ADMIN_TOKEN,FORPSI_CONNECTOR:{fetch:r=>worker.fetch(r,f.env)}};
  const cookie=(await createSessionCookie(env,user)).split(';')[0];
  async function request(handler,operation,payload,headers={}) {
    const r=await handler({env,request:new Request('https://so.test/api/forpsi/mail',{method:'POST',headers:{cookie,origin:'https://so.test','content-type':'application/json',...headers},body:JSON.stringify({operation,payload})})});
    return {status:r.status,body:await r.json()};
  }
  return {...f,ctx,pagesEnv:env,call:(op,p={},h)=>request(forwardForpsiMail,op,p,h),admin:(op,p={},h)=>request(forwardForpsiAdmin,op,p,h)};
}
const profile={id:'mail-a',revision:0,senderName:'Alice TEST',signatureText:'Alice\nTEST firma'};
const draft=()=>({mailboxId:'mail-a',requestId:crypto.randomUUID(),profileRevision:0,useSignature:true,message:{...mail}});

test('profile save is mailbox scoped, audited, versioned, and never pauses or changes mailbox credentials',async()=>{
  const f=await setup();const before=await f.store.first('SELECT * FROM mailboxes WHERE id=?','mail-a');
  assert.equal((await f.admin('composition_save',profile)).status,200);
  const read=await f.admin('composition_get',{id:'mail-a'});assert.equal(read.body.profile.signatureText,profile.signatureText);assert.equal(read.body.profile.revision,1);
  assert.equal((await f.admin('composition_save',{...profile,senderName:'stale'})).status,409);
  assert.equal((await f.admin('composition_save',{...profile,revision:1,senderName:''})).status,200);
  assert.equal((await f.admin('composition_get',{id:'mail-b'})).status,404);
  assert.deepEqual(await f.store.first('SELECT * FROM mailboxes WHERE id=?','mail-a'),before);
  assert.equal((await f.store.rows("SELECT * FROM audit WHERE action='admin.composition.save'")).length,2);
  assert.equal(f.calls.length,0);
});
test('signature input rejects forged sender/HTML modes/header injection and requires a current administrator',async()=>{
  const f=await setup();
  for(const p of [{...profile,senderName:'Alice\r\nBcc: other@example.test'},{...profile,from:'other@example.test'},{...profile,html:'<img src=x>'},{...profile,signatureText:'x\u0000y'}])assert.equal((await f.admin('composition_save',p)).status,400);
  assert.equal((await f.admin('composition_save',profile,{origin:'https://evil.test'})).status,403);
  f.pagesEnv.AUTH_USERS_JSON=JSON.stringify([{...user,role:'readonly'}]);assert.equal((await f.admin('composition_save',profile)).status,403);
  assert.equal((await f.store.rows('SELECT * FROM composition_profiles')).length,0);
});
test('concurrent profile writes preserve one winner and exactly one audit',async()=>{
  const f=await setup();const results=await Promise.all([f.admin('composition_save',profile),f.admin('composition_save',{...profile,senderName:'Other'})]);
  assert.deepEqual(results.map(r=>r.status).sort(),[200,409]);assert.equal((await f.store.rows("SELECT * FROM audit WHERE action='admin.composition.save'")).length,1);
});
test('Pages -> Worker -> SQL -> draft provider applies selected signature once and uses server sender identity',async()=>{
  const f=await setup();await f.admin('composition_save',profile);
  const context=await f.call('composition_context',{mailboxId:'mail-a'});assert.equal(context.body.data.canWrite,true);assert.equal(context.body.data.address,'alice@example.com');
  const p={...draft(),profileRevision:1};const first=await f.call('create_draft',p),again=await f.call('create_draft',p);
  assert.equal(first.status,200);assert.equal(again.status,200);assert.equal(again.body.data.replayed,true);
  const call=f.calls.find(c=>c[0]==='draft');assert.equal(call[1].text,`${mail.text}\n\n-- \n${profile.signatureText}`);assert.equal(call[2].senderName,profile.senderName);
  assert.equal(f.calls.filter(c=>c[0]==='draft').length,1);assert.equal(f.calls.some(c=>c[0]==='send'),false);
  assert.equal((await f.store.rows('SELECT * FROM outbox')).length,0);
  const raw=JSON.stringify(await f.store.rows('SELECT * FROM draft_attempts'));assert.ok(!raw.includes(mail.text));assert.ok(!raw.includes(mail.to[0]));
  assert.equal((await f.call('create_draft',{...p,message:{...mail,text:'changed'}})).status,409);
  await f.admin('composition_save',{...profile,revision:1,signatureText:'changed after save'});
  assert.equal((await f.call('create_draft',p)).status,200,'successful retry does not depend on a later profile change');
});
test('concurrent identical requests invoke the provider once; pending and uncertain results never auto-retry',async()=>{
  const f=await setup();let started,finish;const ready=new Promise(r=>started=r),hold=new Promise(r=>finish=r);let calls=0;
  f.provider.saveDraft=async()=>{calls++;started();await hold;throw new Error('socket failed after APPEND; secret password');};
  const p=draft(),pending=f.call('create_draft',p);await ready;
  assert.equal((await f.call('create_draft',p)).body.code,'DRAFT_UNCERTAIN');finish();
  const result=await pending;assert.equal(result.body.code,'DRAFT_UNCERTAIN');assert.ok(!JSON.stringify(result).includes('password'));
  assert.equal((await f.call('create_draft',p)).body.code,'DRAFT_UNCERTAIN');assert.equal(calls,1);
  assert.equal((await f.store.first('SELECT state FROM draft_attempts')).state,'uncertain');
});
test('read-only grant, disabled drafts, revoked grant, foreign mailbox, forged From and stale profile cannot write',async()=>{
  const f=await setup(['read']);const p=draft();
  assert.equal((await f.call('composition_context',{mailboxId:'mail-a'})).body.data.canWrite,false);
  assert.equal((await f.call('create_draft',p)).status,403);
  f.sqlite.exec("UPDATE grants SET revoked=CASE WHEN action='write' THEN 0 ELSE 1 END WHERE principal_id LIKE 'soai_%'");
  assert.equal((await f.call('create_draft',p)).status,403,'write without read is insufficient');
  const g=await setup();g.env.SOAI_DRAFTS_ENABLED='false';assert.equal((await g.call('create_draft',p)).body.code,'SOAI_DRAFTS_DISABLED');g.env.SOAI_DRAFTS_ENABLED='true';
  assert.equal((await g.call('create_draft',{...p,mailboxId:'mail-b'})).status,403);
  assert.equal((await g.call('create_draft',{...p,message:{...mail,from:'forged@example.test'}})).status,400);
  await g.admin('composition_save',profile);assert.equal((await g.call('create_draft',p)).body.code,'PROFILE_CHANGED');
  g.sqlite.exec("UPDATE grants SET revoked=1 WHERE principal_id LIKE 'soai_%' AND action='write'");assert.equal((await g.call('create_draft',{...p,profileRevision:1})).status,403);
  assert.equal(g.calls.length,0);assert.equal((await g.store.rows('SELECT * FROM draft_attempts')).length,0);
});
test('text body size, optional signature and JSON size are enforced without leaking or sending',async()=>{
  const f=await setup();await f.admin('composition_save',profile);
  assert.equal((await f.call('create_draft',{...draft(),profileRevision:1,useSignature:false,message:{...mail,text:'č'.repeat(50000)}})).status,200);
  assert.equal(f.calls[0][1].text.length,50000);
  assert.equal((await f.call('create_draft',{...draft(),profileRevision:1,message:{...mail,text:'x'.repeat(100000)}})).status,400);
  assert.equal((await f.call('create_draft',{...draft(),message:{...mail,text:'č'.repeat(300000)}})).status,413);
  assert.equal(f.calls.length,1);
});
test('revocation or user disablement while APPEND runs suppresses success and never retries the write',async()=>{
  for(const revoke of ['grant','user']) {
    const f=await setup();let calls=0;
    f.provider.saveDraft=async()=>{calls++;
      if(revoke==='grant')f.sqlite.exec("UPDATE grants SET revoked=1 WHERE principal_id LIKE 'soai_%' AND action='write'");
      else f.pagesEnv.AUTH_USERS_JSON=JSON.stringify([{...user,active:false}]);
      return {saved:true,folder:'Drafts',reference:null};
    };
    const p=draft(),r=await f.call('create_draft',p);assert.equal(r.status,revoke==='grant'?403:401);assert.equal(r.body.data,undefined);
    const again=await f.call('create_draft',p);assert.ok([401,403].includes(again.status));assert.equal(calls,1);
    assert.equal((await f.store.first('SELECT state FROM draft_attempts')).state,'saved');
  }
});
test('draft MIME has the verified mailbox, Czech sender name, Bcc and plain text; never invokes SMTP',async()=>{
  let raw,appends=0;
  const provider=new Forpsi({MAILBOX_CREDENTIALS:JSON.stringify({key:'synthetic'})},{id:'mail-a',address:'alice@example.test',credential_key:'key'},
    {clientFactory:()=>({on(){},connect:async()=>{},close(){},list:async()=>[{path:'Drafts',specialUse:'\\Drafts'}],append:async(_folder,bytes,flags)=>{appends++;raw=bytes;assert.deepEqual(flags,['\\Draft']);return {uid:2,uidValidity:9n};}}),transportFactory:()=>{throw new Error('SMTP forbidden in draft flow');}});
  await provider.saveDraft({...mail,bcc:['hidden@example.test'],text:'Text\n\n-- \nŽluťoučký <img src=x>'},{senderName:'Žluťoučký TEST',requestId:'96f7c303-827b-47bb-93e0-e12c1f534187'});
  const parsed=await simpleParser(raw);assert.equal(parsed.from.value[0].name,'Žluťoučký TEST');assert.equal(parsed.from.value[0].address,'alice@example.test');assert.equal(parsed.bcc.value[0].address,'hidden@example.test');assert.equal(parsed.html,false);assert.equal(appends,1);assert.match(parsed.text,/<img src=x>/);
});
test('UI payload matches server signature preview and recipient separators',()=>{
  const d={requestId:crypto.randomUUID(),to:'first@example.test; second@example.test',cc:'copy@example.test',bcc:'',subject:'Subject',text:'Body',useSignature:true};
  const p=composerPayload('mail-a',d,2);assert.equal(p.message.to.length,2);assert.deepEqual(p.message.bcc,[]);assert.equal(composedText(d,{signatureText:'Signature'}),'Body\n\n-- \nSignature');
});

test('composer preserves frozen payload on unknown result, protects navigation and clears data across owners',async()=>{
  const listeners={},requests=[];
  const root={isConnected:true,innerHTML:'',addEventListener:(name,fn)=>listeners[name]=fn,querySelector:selector=>selector==='[data-composer-form]'?{reportValidity:()=>true}:null};
  const api=async(_url,{body})=>{const c=JSON.parse(body);requests.push(c);
    if(c.operation==='composition_context')return {data:{address:'safe@example.test',profile:{senderName:'<img src=x>',signatureText:'Signature',revision:1},canWrite:true,draftsEnabled:true}};
    if(requests.filter(r=>r.operation==='create_draft').length===1)throw Object.assign(new Error('Unknown outcome'),{status:503});
    return {data:{saved:true,folder:'Drafts'}};
  };
  let guarded=false;mountForpsiComposer(root,{owner:'test-owner',mailboxId:'mail-a',apiJson:api,guard:()=>{guarded=true;}});
  const click=action=>listeners.click({target:{closest:()=>({dataset:{composerAction:action}})},preventDefault(){},stopPropagation(){}});
  click('open');await new Promise(r=>setImmediate(r));assert.ok(!root.innerHTML.includes('<img src=x>'));assert.match(root.innerHTML,/&lt;img/);
  for(const [name,value] of Object.entries({to:'recipient@example.test',subject:'TEST',text:'Body'}))listeners.input({target:{name,value,type:'text',form:{matches:()=>true}}});
  click('close');assert.equal(guarded,true);assert.ok(forpsiComposerDirtyTarget());
  assert.equal(await saveForpsiComposer(),false);assert.match(root.innerHTML,/fieldset disabled/);assert.match(root.innerHTML,/Unknown outcome/);
  assert.equal(await saveForpsiComposer(),true);assert.equal(forpsiComposerDirtyTarget(),null);
  const writes=requests.filter(r=>r.operation==='create_draft');assert.deepEqual(writes[0].payload,writes[1].payload);
  mountForpsiComposer(root,{owner:'other-owner',mailboxId:'mail-a',apiJson:api,guard:()=>{}});assert.ok(!root.innerHTML.includes('safe@example.test'));assert.ok(!root.innerHTML.includes('Body'));
});

const editableRef={folder:'Drafts',uid:32,uidValidity:'5'};
const editable=()=>({reference:editableRef,message:{...mail},senderName:'Alice TEST',etag:'a'.repeat(64),canReplace:true});
const replacement=()=>({mailboxId:'mail-a',requestId:crypto.randomUUID(),reference:editableRef,expectedEtag:'a'.repeat(64),message:{...mail,text:'Updated body'}});
test('stored draft edit crosses Pages, Worker and SQLite once without sending',async()=>{
  const f=await setup();f.env.SOAI_DRAFT_EDITS_ENABLED='true';
  f.provider.readEditableDraft=async ref=>{f.calls.push(['open',ref]);return editable();};
  f.provider.replaceDraft=async(ref,etag,message,options)=>{f.calls.push(['replace',ref,etag,message,options]);return {saved:true,folder:'Drafts',reference:{...editableRef,uid:33}};};
  const opened=await f.call('open_draft',{mailboxId:'mail-a',reference:editableRef});
  assert.equal(opened.status,200);assert.equal(opened.body.data.etag,'a'.repeat(64));
  const p=replacement(),saved=await f.call('replace_draft',p),replay=await f.call('replace_draft',p);
  assert.equal(saved.status,200);assert.equal(saved.body.data.reference.uid,33);assert.equal(replay.body.data.replayed,true);
  const changes=f.calls.filter(c=>c[0]==='replace');assert.equal(changes.length,1);
  assert.deepEqual(changes[0].slice(1,4),[editableRef,p.expectedEtag,p.message]);assert.equal(changes[0][4].senderName,'Alice TEST');
  assert.equal(f.calls.some(c=>c[0]==='send'),false);assert.equal((await f.store.rows('SELECT * FROM outbox')).length,0);
  assert.equal((await f.store.first('SELECT state FROM draft_attempts')).state,'saved');
  const recorded=JSON.stringify(await f.store.rows('SELECT * FROM draft_attempts'));
  assert.ok(!recorded.includes(p.message.text));assert.ok(!recorded.includes(p.message.to[0]));
  assert.equal((await f.call('replace_draft',{...p,message:{...mail,text:'forged'}})).status,409);
});
test('edit is off by default and needs both read and write grants',async()=>{
  const f=await setup(['read']);f.provider.readEditableDraft=async()=>editable();
  const p=replacement();
  assert.equal((await f.call('open_draft',{mailboxId:'mail-a',reference:editableRef})).body.code,'DRAFT_EDITS_DISABLED');
  assert.equal((await f.call('replace_draft',p)).body.code,'DRAFT_EDITS_DISABLED');
  f.env.SOAI_DRAFT_EDITS_ENABLED='true';
  assert.equal((await f.call('open_draft',{mailboxId:'mail-a',reference:editableRef})).status,200);
  assert.equal((await f.call('replace_draft',p)).status,403);
  assert.equal((await f.store.rows('SELECT * FROM draft_attempts')).length,0);
});
test('changed source and unsupported provider reject replacement before invoking it',async()=>{
  for(const condition of ['changed','unsupported']){
    const f=await setup();f.env.SOAI_DRAFT_EDITS_ENABLED='true';
    f.provider.readEditableDraft=async()=>({...editable(),etag:condition==='changed'?'b'.repeat(64):'a'.repeat(64),canReplace:condition!=='unsupported'});
    f.provider.replaceDraft=async()=>{throw Error('must not replace');};
    const p=replacement(),result=await f.call('replace_draft',p);
    assert.equal(result.status,409);assert.equal(result.body.code,condition==='changed'?'DRAFT_CHANGED':'SAFE_REPLACE_UNSUPPORTED');
    assert.equal((await f.store.first('SELECT state FROM draft_attempts')).state,'uncertain');
    assert.equal((await f.call('replace_draft',p)).body.code,'DRAFT_UNCERTAIN','same request cannot repeat');
    assert.equal((await f.store.rows('SELECT * FROM outbox')).length,0);
  }
});
test('concurrent replacement and ambiguous provider response never invoke replacement twice',async()=>{
  const f=await setup();f.env.SOAI_DRAFT_EDITS_ENABLED='true';f.provider.readEditableDraft=async()=>editable();
  let started,finish;const ready=new Promise(r=>started=r),hold=new Promise(r=>finish=r);let calls=0;
  f.provider.replaceDraft=async()=>{calls++;started();await hold;throw Error('socket closed after UID REPLACE');};
  const p=replacement(),first=f.call('replace_draft',p);await ready;
  assert.equal((await f.call('replace_draft',p)).body.code,'DRAFT_UNCERTAIN');
  finish();assert.equal((await first).body.code,'DRAFT_UNCERTAIN');
  assert.equal((await f.call('replace_draft',p)).body.code,'DRAFT_UNCERTAIN');assert.equal(calls,1);
});
test('revoking write or disabling the user during replacement hides the result and preserves one attempt',async()=>{
  for(const revoke of ['grant','user']){
    const f=await setup();f.env.SOAI_DRAFT_EDITS_ENABLED='true';f.provider.readEditableDraft=async()=>editable();let calls=0;
    f.provider.replaceDraft=async()=>{calls++;
      if(revoke==='grant')f.sqlite.exec("UPDATE grants SET revoked=1 WHERE principal_id LIKE 'soai_%' AND action='write'");
      else f.pagesEnv.AUTH_USERS_JSON=JSON.stringify([{...user,active:false}]);
      return {saved:true,folder:'Drafts',reference:{...editableRef,uid:33}};
    };
    const p=replacement(),response=await f.call('replace_draft',p);
    assert.equal(response.status,revoke==='grant'?403:401);assert.equal(response.body.data,undefined);
    assert.equal((await f.store.first('SELECT state FROM draft_attempts')).state,'saved');
    assert.equal((await f.call('replace_draft',p)).status,revoke==='grant'?403:401);assert.equal(calls,1);
  }
});
test('provider reads and atomically replaces only a matching text draft; both UID reply forms work',async()=>{
  for(const replyLocation of ['tagged','untagged']){
    const env={MAILBOX_CREDENTIALS:JSON.stringify({key:'synthetic'})};
    const mailbox={address:'alice@example.test',credential_key:'key',drafts_folder:'Drafts'};
    let raw,executions=0;
    const client={on(){},connect:async()=>{},close(){},mailbox:{uidValidity:5n},enabled:new Set(),capabilities:new Map([['REPLACE',true],['UIDPLUS',true]]),
      list:async()=>[{path:'Drafts',specialUse:'\\Drafts'}],
      getMailboxLock:async()=>({release(){}}),
      fetchOne:async()=>({uid:32,size:raw.length,flags:new Set(['\\Draft'])}),
      download:async()=>({content:(async function*(){yield raw;})()}),
      exec:async(command,attributes,options)=>{executions++;assert.equal(command,'UID REPLACE');assert.equal(attributes[0].value,'32');
        assert.equal(attributes[1].value,'Drafts');assert.equal(attributes[2][0].value,'\\Draft');
        const parsed=await simpleParser(attributes[3].value);assert.equal(parsed.text?.trim(),'Updated body');
        assert.equal(parsed.from.value[0].address,mailbox.address);
        const code={attributes:[{section:[{value:'APPENDUID'},{value:'5'},{value:'33'}]}]};
        if(replyLocation==='untagged')options.untagged.OK(code);
        return {response:replyLocation==='tagged'?code:{attributes:[]},next(){}};
      }};
    const provider=new Forpsi(env,mailbox,{clientFactory:()=>client});
    raw=await provider.compose({...mail,text:'Original body'},crypto.randomUUID(),{senderName:'Alice TEST',keepBcc:true});
    const opened=await provider.readEditableDraft(editableRef);
    assert.equal(opened.message.text.trim(),'Original body');assert.equal(opened.senderName,'Alice TEST');assert.equal(opened.canReplace,true);
    assert.deepEqual((await provider.replaceDraft(editableRef,opened.etag,{...mail,text:'Updated body'},{senderName:opened.senderName})).reference,{folder:'Drafts',uid:33,uidValidity:'5'});
    assert.equal(executions,1);
    await assert.rejects(provider.replaceDraft(editableRef,'b'.repeat(64),mail),{code:'DRAFT_CHANGED'});
    client.capabilities.delete('REPLACE');
    await assert.rejects(provider.replaceDraft(editableRef,opened.etag,mail),{code:'SAFE_REPLACE_UNSUPPORTED'});
    assert.equal(executions,1);
  }
});
test('provider refuses attachments, HTML, wrong sender, missing draft flag and other folders',async()=>{
  const mailbox={address:'alice@example.test',credential_key:'key',drafts_folder:'Drafts'};
  let raw=Buffer.from('From: other@example.test\r\nTo: recipient@example.com\r\nSubject: test\r\nContent-Type: text/plain\r\n\r\nBody');
  let flags=new Set(['\\Draft']);
  const client={on(){},connect:async()=>{},close(){},mailbox:{uidValidity:5n},capabilities:new Map([['REPLACE',true],['UIDPLUS',true]]),
    list:async()=>[{path:'Drafts',specialUse:'\\Drafts'}],getMailboxLock:async()=>({release(){}}),
    fetchOne:async()=>({uid:32,size:raw.length,flags}),download:async()=>({content:(async function*(){yield raw;})()}),exec:async()=>{throw Error('must not replace');}};
  const provider=new Forpsi({MAILBOX_CREDENTIALS:JSON.stringify({key:'synthetic'})},mailbox,{clientFactory:()=>client});
  await assert.rejects(provider.readEditableDraft(editableRef),{code:'DRAFT_SENDER_UNSUPPORTED'});
  raw=Buffer.from('From: alice@example.test\r\nTo: recipient@example.com\r\nSubject: test\r\nContent-Type: text/html\r\n\r\n<b>Body</b>');
  await assert.rejects(provider.readEditableDraft(editableRef),{code:'DRAFT_FORMAT_UNSUPPORTED'});
  raw=Buffer.from('From: alice@example.test\r\nTo: recipient@example.com\r\nSubject: test\r\nContent-Type: multipart/mixed; boundary="x"\r\n\r\n--x\r\nContent-Type: text/plain\r\n\r\nBody\r\n--x\r\nContent-Type: application/octet-stream\r\nContent-Disposition: attachment; filename="file.txt"\r\n\r\nDATA\r\n--x--');
  await assert.rejects(provider.readEditableDraft(editableRef),{code:'DRAFT_FORMAT_UNSUPPORTED'});
  flags=new Set(['\\Seen']);await assert.rejects(provider.readEditableDraft(editableRef),{code:'NOT_EDITABLE_DRAFT'});
  await assert.rejects(provider.readEditableDraft({...editableRef,folder:'INBOX'}),{code:'NOT_DRAFT_FOLDER'});
});
test('folder metadata finds configured Drafts without special-use marker and respects write grant',async()=>{
  const f=await setup(['read']);f.env.SOAI_DRAFT_EDITS_ENABLED='true';
  f.provider.listFolders=async()=>({folders:[{path:'INBOX.Drafts',selectable:true,specialUse:null}],draftFolder:'INBOX.Drafts',supportsReplace:true});
  const readonly=await f.call('list_folders',{mailboxId:'mail-a'});
  assert.equal(readonly.status,200);assert.equal(readonly.body.data.draftWriteAllowed,false);
  assert.equal(readonly.body.data.draftFolder,'INBOX.Drafts');
  f.sqlite.exec("UPDATE grants SET revoked=0 WHERE principal_id LIKE 'soai_%' AND action='write'");
  assert.equal((await f.call('list_folders',{mailboxId:'mail-a'})).body.data.draftWriteAllowed,true);
  const provider=new Forpsi({MAILBOX_CREDENTIALS:JSON.stringify({key:'synthetic'})},{address:'alice@example.test',credential_key:'key',drafts_folder:'INBOX.Drafts'},
    {clientFactory:()=>({on(){},connect:async()=>{},close(){},list:async()=>[{path:'INBOX.Drafts',specialUse:null}],capabilities:new Map([['REPLACE',true],['UIDPLUS',true]])})});
  assert.equal((await provider.listFolders()).draftFolder,'INBOX.Drafts');
});
test('editor preserves typed text on stale edit and blocks a second replacement until reload',async()=>{
  const listeners={},requests=[];
  const root={isConnected:true,innerHTML:'',addEventListener:(name,fn)=>listeners[name]=fn,
    querySelector:selector=>selector==='[data-composer-form]'?{reportValidity:()=>true}:null};
  const api=async(_url,{body})=>{const c=JSON.parse(body);requests.push(c);
    if(c.operation==='composition_context')return {data:{address:'alice@example.test',profile:{senderName:'',signatureText:'',revision:0},canWrite:true,draftsEnabled:true,draftEditsEnabled:true}};
    if(c.operation==='open_draft')return {data:editable()};
    throw Object.assign(new Error('Koncept se mezitím změnil.'),{status:409,code:'DRAFT_CHANGED'});
  };
  let guarded=false;
  mountForpsiComposer(root,{owner:'edit-owner',mailboxId:'mail-a',apiJson:api,guard:()=>{guarded=true;}});
  assert.equal(await openForpsiDraft(editableRef),true);
  assert.match(root.innerHTML,/Upravit koncept/);
  listeners.input({target:{name:'text',value:'Moje rozepsané změny',type:'text',form:{matches:()=>true}}});
  assert.equal(await saveForpsiComposer(),false);
  assert.match(root.innerHTML,/Moje rozepsané změny/);
  assert.match(root.innerHTML,/Načíst koncept znovu/);
  assert.match(root.innerHTML,/type="submit" disabled/);
  assert.equal(await saveForpsiComposer(),false);
  assert.equal(requests.filter(c=>c.operation==='replace_draft').length,1);
  listeners.click({target:{closest:()=>({dataset:{composerAction:'reload'}})},preventDefault(){},stopPropagation(){}});
  assert.equal(guarded,true,'discarding typed work requires the app navigation guard');
});
