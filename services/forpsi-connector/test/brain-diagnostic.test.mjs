import test from 'node:test';
import assert from 'node:assert/strict';
import {fixture} from './fixtures.mjs';
import {executeAdmin,handleAdmin} from '../src/admin.mjs';
import {SOAI_ISSUER} from '../src/admin-access.mjs';

const target={mailboxId:'mail-a',folder:'Sent',uid:74324,uidValidity:'1381849700'};
function setup(){
  const f=fixture(),calls=[];
  f.env.FORPSI_TENANT_ID='tenant-a';
  f.env.CONNECTOR_ADMIN_TOKEN='test-only-admin-token-with-32-characters';
  f.env.MAIL_BRAIN_DIAGNOSTIC_ENABLED='true';
  f.env.MAIL_BRAIN_PILOT_READ_ONLY='true';
  f.env.MAIL_BRAIN_PILOT_MAILBOX_ID='mail-a';
  f.env.MAIL_BRAIN_DIAG_TARGET_FOLDER='Sent';
  f.env.MAIL_BRAIN_DIAG_TARGET_UID='74324';
  f.env.MAIL_BRAIN_DIAG_TARGET_UIDVALIDITY='1381849700';
  f.sqlite.prepare('INSERT INTO principals VALUES (?,?,?,?,1)')
    .run('pilot','tenant-a',SOAI_ISSUER,'pilot-admin');
  f.sqlite.prepare('INSERT INTO grants VALUES (?,?,?,0)').run('pilot','mail-a','read');
  f.sqlite.prepare(`INSERT INTO brain_consents
    (tenant_id,principal_id,mailbox_id,sent_folder,consented_at) VALUES (?,?,?,?,?)`)
    .run('tenant-a','pilot','mail-a','Sent',Date.now());
  f.sqlite.prepare(`INSERT INTO brain_sync_cursors
    (tenant_id,mailbox_id,folder,uid_validity,next_before_uid,window_start,window_end)
    VALUES (?,?,?,?,?,?,?)`).run('tenant-a','mail-a','Sent',target.uidValidity,74319,1,2);
  const provider={async readForBrain(ref,metrics){
    calls.push(ref);
    Object.assign(metrics,{subject:'Offer',messageId:'<offer@example.test>',
      rawMessageSize:3*1024*1024,textPartsFound:1,downloadedTextParts:1,
      downloadedBytes:38,textSource:'plain',attachments:[{filename:'offer.pdf',
        contentType:'application/pdf',size:2.5*1024*1024}],downloadedBinaryAttachments:0});
    return {text:'SECRET MESSAGE BODY',attachments:[{content:'SECRET PDF'}]};
  }};
  const ctx={store:f.store,env:f.env,actorId:'pilot-admin',tenant:'tenant-a',
    providerFactory:()=>provider};
  return {...f,calls,provider,ctx};
}

test('one-message admin diagnostic reads exact reference and writes no D1 state',async()=>{
  const f=setup();
  const beforeChanges=f.sqlite.prepare('SELECT total_changes() AS n').get().n;
  const beforeCursor=f.sqlite.prepare('SELECT * FROM brain_sync_cursors').get();
  const result=await executeAdmin('resources',target,f.ctx);
  assert.equal(result.success,true);
  assert.equal(result.errorCode,null);
  assert.equal(result.downloadedBinaryAttachments,0);
  assert.equal(result.downloadedBytes,38);
  assert.deepEqual(f.calls,[{folder:'Sent',uid:74324,uidValidity:'1381849700'}]);
  assert.equal(JSON.stringify(result).includes('SECRET'),false);
  assert.deepEqual(f.sqlite.prepare('SELECT * FROM brain_sync_cursors').get(),beforeCursor);
  assert.equal(f.sqlite.prepare('SELECT total_changes() AS n').get().n,beforeChanges);
  for(const table of ['brain_messages','brain_cases','brain_case_events','outbox'])
    assert.equal(f.sqlite.prepare(`SELECT COUNT(*) AS n FROM ${table}`).get().n,0);
});

test('diagnostic is disabled by default and constrained to pilot, exact folder, UID and UIDVALIDITY',async()=>{
  const f=setup();
  const before=f.sqlite.prepare('SELECT total_changes() AS n').get().n;
  for(const [key,value,code] of [
    ['MAIL_BRAIN_DIAGNOSTIC_ENABLED','false','DIAGNOSTIC_DISABLED'],
    ['MAIL_BRAIN_PILOT_READ_ONLY','false','DIAGNOSTIC_DISABLED']]){
    const old=f.env[key];f.env[key]=value;
    await assert.rejects(executeAdmin('resources',target,f.ctx),new RegExp(code));
    f.env[key]=old;
  }
  for(const changed of [
    {...target,mailboxId:'mail-b'},
    {...target,folder:'Trash'},
    {...target,uid:74325},
    {...target,uidValidity:'1381849701'}])
    await assert.rejects(executeAdmin('resources',changed,f.ctx),/DIAGNOSTIC_TARGET_DENIED/);
  await assert.rejects(executeAdmin('resources',{...target,extra:'untrusted'},f.ctx),
    /INVALID_INPUT/);
  assert.equal(f.calls.length,0);
  assert.equal(f.sqlite.prepare('SELECT total_changes() AS n').get().n,before);
});

test('diagnostic requires current read grant and consent and returns only coded provider errors',async()=>{
  const f=setup();
  f.provider.readForBrain=async(_ref,metrics)=>{
    Object.assign(metrics,{rawMessageSize:3*1024*1024,downloadedBytes:0,
      downloadedBinaryAttachments:0});
    throw Error('MESSAGE_NOT_FOUND');
  };
  const missing=await executeAdmin('resources',target,f.ctx);
  assert.equal(missing.success,false);
  assert.equal(missing.errorCode,'MESSAGE_NOT_FOUND');
  assert.equal(missing.rawMessageSize,3*1024*1024);
  await f.store.run("UPDATE grants SET revoked=1 WHERE principal_id='pilot' AND action='read'");
  await assert.rejects(executeAdmin('resources',target,f.ctx),/ACCESS_DENIED/);
  await f.store.run("UPDATE grants SET revoked=0 WHERE principal_id='pilot' AND action='read'");
  await f.store.run("UPDATE brain_consents SET revoked_at=1 WHERE principal_id='pilot'");
  await assert.rejects(executeAdmin('resources',target,f.ctx),/BRAIN_CONSENT_REQUIRED/);
});

test('internal admin route rejects missing server token before diagnostic access',async()=>{
  const f=setup();
  const request=token=>new Request('https://forpsi.internal/internal/admin',{
    method:'POST',headers:{authorization:`Bearer ${token}`},
    body:JSON.stringify({operation:'resources',payload:target,actorId:'pilot-admin'})});
  const denied=await handleAdmin(request('wrong'),f.env,{providerFactory:()=>f.provider});
  assert.equal(denied.status,401);
  assert.equal(f.calls.length,0);
  const allowed=await handleAdmin(request(f.env.CONNECTOR_ADMIN_TOKEN),f.env,
    {providerFactory:()=>f.provider});
  assert.equal(allowed.status,200);
  assert.equal((await allowed.json()).success,true);
});
