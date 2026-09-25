import test from 'node:test';
import assert from 'node:assert/strict';
import { providerDiagnostic } from '../src/diagnostics.mjs';
import { CalDav } from '../src/caldav.mjs';
import { executeAdmin } from '../src/admin.mjs';
import { fixture } from './fixtures.mjs';

test('diagnostics keep fixed classifications without provider payloads or credentials', () => {
  const secret = 'password-or-auth-response-must-stay-private';
  const error = Object.assign(new Error(secret), {code:'EAUTH', command:'AUTH LOGIN', responseCode:535,
    response:secret, password:secret, cause:{code:'ECONNRESET',message:secret}, davStage:secret});
  assert.deepEqual(providerDiagnostic(error), {code:'EAUTH',causeCode:'ECONNRESET',phase:'auth',smtpStatus:535});
  assert.deepEqual(providerDiagnostic({code:secret,name:secret,command:secret,httpStatus:secret,responseCode:secret}), {code:'PROVIDER_UNAVAILABLE'});
  assert.deepEqual(providerDiagnostic(null), {code:'PROVIDER_UNAVAILABLE'});
  assert.deepEqual(providerDiagnostic(new DOMException(secret,'TimeoutError')), {code:'PROVIDER_UNAVAILABLE',type:'TimeoutError'});
});

test('DAV failure exposes status and discovery stage but never the server response', async () => {
  const env = {MAILBOX_CREDENTIALS:'{"test":"fake-test-password"}'};
  const provider = new CalDav(env, {address:'pilot@example.test',credential_key:'test'},
    async()=>new Response('private provider traceback',{status:403}));
  await assert.rejects(provider.calendars(), error => {
    assert.deepEqual(providerDiagnostic(error), {code:'CALDAV_ACCESS_DENIED',phase:'root',httpStatus:403});
    assert.ok(!error.message.includes('private')); return true;
  });
});

test('admin persists bounded failure diagnostics, keeps successful checks and stays paused', async () => {
  const f=fixture();
  f.sqlite.exec("UPDATE mailboxes SET active=0 WHERE id='mail-a'");
  const result=await executeAdmin('verify',{id:'mail-a',revision:1},{...f,actorId:'admin-test',tenant:'tenant-a',
    providerFactory:()=>({listFolders:async()=>({supportsMove:true}),verifySmtp:async()=>{throw Object.assign(new Error('secret'),{code:'ESOCKET',command:'CONN'});}}),
    calendarFactory:()=>({calendars:async()=>({calendars:[]})}),
    contactFactory:()=>({addressBooks:async()=>{throw new Error('secret');}})});
  assert.equal(result.mailbox.verification.imap,'verified');
  assert.equal(result.mailbox.verification.calendar,'empty');
  assert.equal(result.mailbox.active,0);
  assert.deepEqual(result.mailbox.verification.diagnostics,{smtp:{code:'ESOCKET',phase:'connect'},contacts:{code:'PROVIDER_UNAVAILABLE'}});
  assert.ok(!JSON.stringify(result).includes('secret'));
  assert.ok(!f.calls.some(c=>c[0]==='send'));
});
