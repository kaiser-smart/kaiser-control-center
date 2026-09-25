import test from 'node:test';
import assert from 'node:assert/strict';
import { fixture } from './fixtures.mjs';
import { executeAdmin } from '../src/admin.mjs';
import { SOAI_ISSUER } from '../src/admin-access.mjs';

const context=()=>({...fixture(),tenant:'tenant-a',actorId:'so-admin'});
const change=(revision,actions=['read'])=>({id:'mail-a',revision,userId:'so-colleague',actions});
test('SO.ai access uses stable identity, exact permissions, atomic audit and real readback',async()=>{
  const f=context();const {access}=await executeAdmin('access_save',change(1,['read','write']),f);
  const person=await f.store.identity(SOAI_ISSUER,'so-colleague');
  assert.equal(person.tenant_id,'tenant-a');assert.equal(access.revision,2);
  assert.deepEqual(access.entries.find(e=>e.userId==='so-colleague').actions,['read','write']);
  const actor={id:person.id,scopes:['forpsi:read','forpsi:send','forpsi:write']};
  assert.equal((await f.store.access(actor,'mail-a','read')).id,'mail-a');
  await assert.rejects(f.store.access(actor,'mail-a','send'),/ACCESS_DENIED/);
  const audit=await f.store.first("SELECT * FROM audit WHERE action='admin.access.save'");
  assert.equal(audit.principal_id,'so-admin');assert.deepEqual(JSON.parse(audit.outcome),{userId:'so-colleague',before:[],actions:['read','write']});
  const read=await executeAdmin('access_list',{id:'mail-a'},f);assert.deepEqual(read.access,access);
  assert.equal((await f.store.first("SELECT active FROM mailboxes WHERE id='mail-a'")).active,1);
  assert.equal(f.calls.length,0);
});
test('revocation immediately denies subsequent access and preserves other identities and mailboxes',async()=>{
  const f=context();await executeAdmin('access_save',change(1),f);
  const person=await f.store.identity(SOAI_ISSUER,'so-colleague');
  await executeAdmin('access_save',change(2,[]),f);
  await assert.rejects(f.store.access({id:person.id,scopes:['forpsi:read']},'mail-a','read'),/ACCESS_DENIED/);
  assert.equal((await f.store.access(f.principal,'mail-a','read')).id,'mail-a');
  const audit=await f.store.rows("SELECT outcome FROM audit WHERE action='admin.access.save' ORDER BY rowid");
  assert.deepEqual(JSON.parse(audit[1].outcome).before,['read']);
  assert.deepEqual((await executeAdmin('access_list',{id:'mail-a'},f)).access.entries.find(e=>e.userId==='so-colleague').actions,[]);
});
test('stale access save and failed audit cannot partly create identity or grants',async()=>{
  const f=context();await executeAdmin('access_save',change(1),f);
  await assert.rejects(executeAdmin('access_save',{...change(1),userId:'new-person'},f),/VERSION_CONFLICT/);
  assert.equal(await f.store.identity(SOAI_ISSUER,'new-person'),null);
  f.sqlite.exec("CREATE TRIGGER fail_access_audit BEFORE INSERT ON audit BEGIN SELECT RAISE(ABORT,'audit unavailable'); END;");
  await assert.rejects(executeAdmin('access_save',{...change(2),userId:'new-person'},f));
  assert.equal(await f.store.identity(SOAI_ISSUER,'new-person'),null);
  assert.equal((await f.store.first("SELECT revision FROM mailboxes WHERE id='mail-a'")).revision,2);
});
test('a competing change between validation and transaction leaves no new identity or success audit',async()=>{
  const f=context();const batch=f.db.batch;
  f.db.batch=async statements=>{f.sqlite.exec("UPDATE mailboxes SET revision=revision+1 WHERE id='mail-a'");return batch(statements);};
  await assert.rejects(executeAdmin('access_save',change(1),f),/VERSION_CONFLICT/);
  assert.equal(await f.store.identity(SOAI_ISSUER,'so-colleague'),null);
  assert.equal((await f.store.rows("SELECT * FROM audit WHERE action='admin.access.save'")).length,0);
});
test('access refresh includes all current public mailbox fields, never a fresh revision with stale settings',async()=>{
  const f=context();f.sqlite.exec("UPDATE mailboxes SET revision=2,active=0,display_name='New name',sent_folder='New sent' WHERE id='mail-a'");
  const {mailbox:m}=await executeAdmin('access_list',{id:'mail-a'},f);
  assert.equal(m.revision,2);assert.equal(m.active,0);assert.equal(m.display_name,'New name');assert.equal(m.sent_folder,'New sent');
  assert.equal(Object.hasOwn(m,'credential_key'),false);
});
test('grant validation denies foreign mailbox, tenant identity collision, disabled identities and invalid selections',async()=>{
  const f=context();
  await assert.rejects(executeAdmin('access_save',{...change(1),id:'mail-b'},f),/MAILBOX_NOT_FOUND/);
  for(const actions of [['read','read'],['schedule'],['admin']]) await assert.rejects(executeAdmin('access_save',change(1,actions),f),/INVALID_INPUT/);
  await assert.rejects(executeAdmin('access_save',{...change(1),issuer:'https://forged'},f),/INVALID_INPUT/);
  f.sqlite.prepare('INSERT INTO principals VALUES (?,?,?,?,?)').run('foreign','tenant-b',SOAI_ISSUER,'so-colleague',1);
  await assert.rejects(executeAdmin('access_save',change(1),f),/ACCESS_DENIED/);
  f.sqlite.prepare('UPDATE principals SET tenant_id=?,active=0 WHERE id=?').run('tenant-a','foreign');
  await assert.rejects(executeAdmin('access_save',change(1),f),/PRINCIPAL_DISABLED/);
  await executeAdmin('access_save',change(1,[]),f);
  assert.equal((await f.store.first("SELECT active FROM principals WHERE id='foreign'")).active,0);
});
test('revoked sending permission blocks an existing queued job without calling provider',async()=>{
  const f=context();await executeAdmin('access_save',change(1,['read','send','schedule']),f);
  const person=await f.store.identity(SOAI_ISSUER,'so-colleague');
  const actor={id:person.id,scopes:['forpsi:read','forpsi:send','forpsi:schedule']};
  const job=await f.outbox.enqueue(actor,{mailboxId:'mail-a',requestId:crypto.randomUUID(),sendAt:new Date(f.now()+1000).toISOString(),message:{to:['synthetic@example.test'],cc:[],bcc:[],subject:'TEST',text:'TEST'}},true);
  await executeAdmin('access_save',change(2,['read']),f);
  f.setTime(f.now()+2000);await f.outbox.process(job.id);
  assert.equal((await f.store.jobFor(actor,job.id)).state,'blocked');assert.equal(f.calls.length,0);
});
