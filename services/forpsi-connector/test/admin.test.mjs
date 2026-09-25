import test from 'node:test';
import assert from 'node:assert/strict';
import { fixture } from './fixtures.mjs';
import { executeAdmin, handleAdmin } from '../src/admin.mjs';
import { mailboxPassword } from '../src/credentials.mjs';
import { Forpsi } from '../src/forpsi.mjs';

function context() {
  const f=fixture();
  f.env.CREDENTIALS_KEY=Buffer.alloc(32,9).toString('base64');
  f.env.FORPSI_TENANT_ID='tenant-a';
  f.env.CONNECTOR_ADMIN_TOKEN='test-only-admin-token-with-32-characters';
  f.provider.verifySmtp=async()=>true;
  return {...f,actorId:'admin-test',tenant:'tenant-a',calendarFactory:()=>({calendars:async()=>({calendars:[]})}),contactFactory:()=>({addressBooks:async()=>({addressBooks:[]})})};
}
const payload=()=>({requestId:crypto.randomUUID(),address:'pilot@example.test',displayName:'TEST schránka',password:'synthetic-password-only'});
test('admin saves paused mailbox and encrypted password atomically; readback never returns credentials',async()=>{
  const f=context(), p=payload();
  const {mailbox:m}=await executeAdmin('save',p,f);
  assert.equal(m.active,0); assert.equal(m.revision,1);
  const row=await f.store.first('SELECT * FROM mailboxes WHERE id=?',m.id);
  assert.equal(await mailboxPassword(f.env,row),p.password);
  const cipher=await f.store.first('SELECT ciphertext FROM mailbox_credentials WHERE mailbox_id=?',m.id);
  assert.ok(!cipher.ciphertext.includes(p.password));
  const overview=await executeAdmin('overview',{},f);
  assert.equal(overview.mailboxes.length,2);
  assert.ok(!JSON.stringify(overview).includes(p.password));
  assert.ok(!JSON.stringify(overview).includes('ciphertext'));
  assert.ok(!JSON.stringify(overview).includes('eve@example.com'));
  assert.equal(overview.audit.length,1);
  await assert.rejects(mailboxPassword(f.env,{...row,tenant_id:'tenant-b'}));
});
test('stale save cannot overwrite password or append success audit',async()=>{
  const f=context(),p=payload();const {mailbox:m}=await executeAdmin('save',p,f);
  const edit={...p,id:m.id,revision:m.revision,displayName:'Změna'};
  await executeAdmin('save',edit,f);
  await assert.rejects(executeAdmin('save',{...edit,password:'attacker'},f),/VERSION_CONFLICT/);
  assert.equal((await executeAdmin('overview',{},f)).audit.length,2);
  assert.equal(await mailboxPassword(f.env,await f.store.first('SELECT * FROM mailboxes WHERE id=?',m.id)),p.password);
  await assert.rejects(executeAdmin('save',{...edit,address:'other@example.test',revision:2},f),/VERSION_CONFLICT/);
});
test('database failure rolls back mailbox update, ciphertext and audit together',async()=>{
  const f=context(),p=payload();const {mailbox:m}=await executeAdmin('save',p,f);
  f.sqlite.exec("CREATE TRIGGER fail_audit BEFORE INSERT ON audit BEGIN SELECT RAISE(ABORT,'audit unavailable'); END;");
  await assert.rejects(executeAdmin('save',{...p,id:m.id,revision:1,password:'replacement'},f));
  const row=await f.store.first('SELECT * FROM mailboxes WHERE id=?',m.id);
  assert.equal(row.revision,1); assert.equal(await mailboxPassword(f.env,row),p.password);
});
test('activation requires fresh real checks, no sending; changing credential pauses access',async()=>{
  const f=context(),p=payload();let {mailbox:m}=await executeAdmin('save',p,f);
  await assert.rejects(executeAdmin('set_active',{id:m.id,revision:1,active:true},f),/VERIFICATION_REQUIRED/);
  ({mailbox:m}=await executeAdmin('verify',{id:m.id,revision:1},f));
  assert.equal(m.verification.smtp,'verified'); assert.equal(m.active,0);
  ({mailbox:m}=await executeAdmin('set_active',{id:m.id,revision:m.revision,active:true},f));
  assert.equal(m.active,1); assert.ok(!f.calls.some(c=>c[0]==='send'));
  ({mailbox:m}=await executeAdmin('save',{...p,id:m.id,revision:m.revision},f));
  assert.equal(m.active,0);assert.equal(m.verified_at,null);
});
test('failed checks never echo provider errors and stale verification cannot approve changed credentials',async()=>{
  const f=context(),p=payload(); const {mailbox:m}=await executeAdmin('save',p,f);
  f.provider.verifySmtp=async()=>{throw new Error(p.password);};
  let result=await executeAdmin('verify',{id:m.id,revision:1},f);
  assert.equal(result.mailbox.verification.smtp,'failed');assert.ok(!JSON.stringify(result).includes(p.password));
  await assert.rejects(executeAdmin('set_active',{id:m.id,revision:2,active:true},f),/VERIFICATION_REQUIRED/);
  f.provider.listFolders=async()=>{await executeAdmin('save',{...p,id:m.id,revision:2},f);return {folders:[]};};
  await assert.rejects(executeAdmin('verify',{id:m.id,revision:2},f),/VERSION_CONFLICT/);
});
test('admin rejects cross-tenant IDs, unknown fields and forged or malformed tokens',async()=>{
  const f=context();await assert.rejects(executeAdmin('verify',{id:'mail-b',revision:1},f),/MAILBOX_NOT_FOUND/);
  await assert.rejects(executeAdmin('save',{...payload(),tenant:'tenant-b'},f),/INVALID_INPUT/);
  for(const token of ['', 'wrong', 'é'.repeat(f.env.CONNECTOR_ADMIN_TOKEN.length)]) {
    const r=await handleAdmin(new Request('https://mail.test/internal/admin',{method:'POST',headers:{authorization:`Bearer ${token}`}}),f.env,f);
    assert.equal(r.status,401);
  }
  const r=await handleAdmin(new Request('https://mail.test/internal/admin',{method:'POST',headers:{authorization:`Bearer ${f.env.CONNECTOR_ADMIN_TOKEN}`},body:JSON.stringify({operation:'overview',payload:{},actorId:'admin-test'})}),f.env,f);
  assert.equal(r.status,200);
});
test('SMTP connection check uses verify and closes transport without sendMail',async()=>{
  let sent=0,verified=0,closed=0;
  const p=new Forpsi({MAILBOX_CREDENTIALS:'{"test":"fake"}'},{address:'test@example.test',credential_key:'test'},{transportFactory:()=>({verify:async()=>{verified++;return true;},close:()=>closed++,sendMail:()=>sent++})});
  assert.equal(await p.verifySmtp(),true);assert.deepEqual([sent,verified,closed],[0,1,1]);
});

test('simulated approval cannot activate a mailbox in provider mode; duplicate creation is explicit',async()=>{
  const f=context(),p=payload();const {mailbox:m}=await executeAdmin('save',p,f);
  await assert.rejects(executeAdmin('save',p,f),/MAILBOX_EXISTS/);
  await executeAdmin('verify',{id:m.id,revision:1},{...f,verificationMode:'simulated'});
  await assert.rejects(executeAdmin('set_active',{id:m.id,revision:2,active:true},f),/VERIFICATION_REQUIRED/);
});

test('resource discovery works while paused and disabled; returns only metadata without mutations',async()=>{
  const f=context(),p=payload();const {mailbox:m}=await executeAdmin('save',p,f);
  f.env.CONNECTOR_ENABLED='false';
  f.provider.listFolders=async()=>({folders:[{path:'INBOX',name:'Inbox',selectable:true,secret:'must-not-return'}]});
  f.calendarFactory=()=>({calendars:async()=>({calendars:[{id:'opaque-internal',name:'Vlastní',components:['VEVENT']}]})});
  const before=f.sqlite.prepare('SELECT total_changes() AS n').get().n;
  const {resources:r}=await executeAdmin('resources',{id:m.id,revision:m.revision},f);
  assert.equal(r.folders.status,'available'); assert.equal(r.calendars.items[0].name,'Vlastní');
  assert.equal(r.addressBooks.status,'empty'); assert.equal(r.revision,m.revision);
  assert.ok(!JSON.stringify(r).includes('must-not-return'));assert.ok(!JSON.stringify(r).includes('opaque-internal'));
  assert.equal((await f.store.first('SELECT revision FROM mailboxes WHERE id=?',m.id)).revision,1);
  assert.equal((await executeAdmin('overview',{},f)).audit.length,1);
  assert.equal(f.calls.length,0); assert.equal(f.sqlite.prepare('SELECT total_changes() AS n').get().n,before);
});
test('resources preserve partial failures, redact errors, bound results and enforce tenant/revision',async()=>{
  const f=context(); f.calendarFactory=()=>({calendars:async()=>{throw new Error('secret-password');}});
  f.contactFactory=()=>({addressBooks:async()=>({addressBooks:Array.from({length:501},()=>({name:'Book'}))})});
  const {resources:r}=await executeAdmin('resources',{id:'mail-a',revision:1},f);
  assert.equal(r.folders.status,'available'); assert.equal(r.calendars.status,'failed');
  assert.equal(r.addressBooks.diagnostic.code,'ADMIN_RESOURCE_LIMIT'); assert.ok(!JSON.stringify(r).includes('secret-password'));
  await assert.rejects(executeAdmin('resources',{id:'mail-b',revision:1},f),/MAILBOX_NOT_FOUND/);
  await assert.rejects(executeAdmin('resources',{id:'mail-a',revision:2},f),/VERSION_CONFLICT/);
  f.provider.listFolders=async()=>{f.sqlite.exec("UPDATE mailboxes SET revision=revision+1 WHERE id='mail-a'");return {folders:[]};};
  await assert.rejects(executeAdmin('resources',{id:'mail-a',revision:1},f),/VERSION_CONFLICT/);
});
test('folder choices are checked against live selectable folders before an atomic paused save',async()=>{
  const f=context(),p=payload();let {mailbox:m}=await executeAdmin('save',p,f);
  f.provider.listFolders=async()=>({folders:[{path:'Sent',selectable:true},{path:'Parent',selectable:false}]});
  const {password,...plain}=p;
  const edit={...plain,id:m.id,revision:m.revision,sentFolder:'Missing'};
  await assert.rejects(executeAdmin('save',edit,f),/FOLDER_NOT_AVAILABLE/);
  await assert.rejects(executeAdmin('save',{...edit,sentFolder:'Parent'},f),/FOLDER_NOT_AVAILABLE/);
  await assert.rejects(executeAdmin('save',{...edit,sentFolder:'Sent',password:'new-password'},f),/FOLDER_RELOAD_REQUIRED/);
  assert.equal((await executeAdmin('overview',{},f)).audit.length,1);
  ({mailbox:m}=await executeAdmin('save',{...edit,sentFolder:'Sent'},f));
  assert.equal(m.sent_folder,'Sent');assert.equal(m.active,0);assert.equal(m.revision,2);
  assert.equal(await mailboxPassword(f.env,await f.store.first('SELECT * FROM mailboxes WHERE id=?',m.id)),password);
  await assert.rejects(executeAdmin('save',{...edit,sentFolder:'Sent'},f),/VERSION_CONFLICT/);
  assert.equal(f.calls.length,0);
});
test('new mailbox cannot save unverified folder paths; provider failure leaves settings untouched',async()=>{
  const f=context(),p=payload();
  await assert.rejects(executeAdmin('save',{...p,sentFolder:'Sent'},f),/FOLDER_RELOAD_REQUIRED/);
  const {mailbox:m}=await executeAdmin('save',p,f); const {password,...plain}=p;
  f.provider.listFolders=async()=>{throw new Error('offline');};
  await assert.rejects(executeAdmin('save',{...plain,id:m.id,revision:1,sentFolder:'Sent'},f),/offline/);
  assert.equal((await f.store.first('SELECT revision FROM mailboxes WHERE id=?',m.id)).revision,1);
});
