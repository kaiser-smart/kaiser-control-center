import test from 'node:test';
import assert from 'node:assert/strict';
import { generateKeyPair, SignJWT } from 'jose';
import { fixture, mail } from './fixtures.mjs';
import { verifyToken } from '../src/auth.mjs';
import { createWorker } from '../src/worker.mjs';
import { selectors } from '../src/schemas.mjs';
import { seal, unseal } from '../src/crypto.mjs';

test('OAuth verifies signature, issuer, audience, expiry and enabled employee', async () => {
  const f = fixture();
  const { privateKey, publicKey } = await generateKeyPair('ES256');
  const cfg = { issuer: 'https://id.example', resource: 'https://mail.example/mcp' };
  const token = extra => new SignJWT({ scope: 'forpsi:read', ...extra }).setProtectedHeader({ alg: 'ES256' })
    .setIssuer(extra?.iss ?? cfg.issuer).setAudience(extra?.aud ?? cfg.resource).setSubject('sub-alice')
    .setExpirationTime(extra?.exp ?? '1h').sign(privateKey);
  const principal = await verifyToken(await token(), cfg, publicKey, f.store);
  assert.deepEqual(principal, { id: 'alice', scopes: ['forpsi:read'] });
  for (const extra of [{ aud: 'https://other.example' }, { iss: 'https://other.example' }, { exp: 1 }]) {
    await assert.rejects(verifyToken(await token(extra), cfg, publicKey, f.store));
  }
  const other = await generateKeyPair('ES256');
  await assert.rejects(verifyToken(await token(), cfg, other.publicKey, f.store));
  await f.store.run("UPDATE principals SET active=0 WHERE id='alice'");
  await assert.rejects(verifyToken(await token(), cfg, publicKey, f.store), /AUTH_REQUIRED/);
});

function request(method, params = {}, extra = {}) {
  return new Request('https://mail.example/mcp', { method: 'POST', headers: {
    'content-type': 'application/json', accept: 'application/json, text/event-stream', ...extra },
  body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }) });
}
test('real MCP transport initializes, lists tools and returns structured results', async () => {
  const f = fixture();
  const worker = createWorker({ authenticate: async () => f.principal, providerFactory: f.providerFactory });
  const init = await worker.fetch(request('initialize', { protocolVersion: '2025-11-25', capabilities: {},
    clientInfo: { name: 'local-test', version: '1' } }), f.env);
  assert.equal(init.status, 200);
  assert.equal((await init.json()).result.serverInfo.name, 'forpsi-company-mail');
  const list = await (await worker.fetch(request('tools/list'), f.env)).json();
  assert.equal(list.result.tools.length, 60);
  const widget = list.result.tools.find(t => t.name === 'render_worklist');
  assert.equal(widget._meta.ui.resourceUri, 'ui://forpsi/worklist-v1.html');
  assert.equal(widget.annotations.readOnlyHint, true);
  const resources = await (await worker.fetch(request('resources/list'), f.env)).json();
  assert.equal(resources.result.resources[0].mimeType, 'text/html;profile=mcp-app');
  const resource=await (await worker.fetch(request('resources/read',{
    uri:'ui://forpsi/worklist-v1.html'}),f.env)).json();
  assert.match(resource.result.contents[0].text,/ui\/notifications\/tool-result/);
  assert.match(resource.result.contents[0].text,/ui\/notifications\/initialized/);
  assert.match(resource.result.contents[0].text,/name:'read_message'/);
  const send = list.result.tools.find(t => t.name === 'send_message');
  assert.equal(send.annotations.openWorldHint, true);
  assert.equal(send.annotations.destructiveHint, true);
  assert.deepEqual(send.securitySchemes[0].scopes, ['forpsi:send']);
  const response = await (await worker.fetch(request('tools/call', { name: 'list_mailboxes', arguments: {} }), f.env)).json();
  assert.equal(response.result.structuredContent.data.mailboxes[0].id, 'mail-a');
  const profile = await (await worker.fetch(request('tools/call', { name: 'get_profile', arguments: {} }), f.env)).json();
  assert.deepEqual(profile.result.structuredContent, { id: 'alice' });
});
test('unauthenticated and cross-origin HTTP requests do not access a mailbox', async () => {
  const f = fixture(); const worker = createWorker();
  const denied = await worker.fetch(request('tools/list'), f.env);
  assert.equal(denied.status, 401);
  assert.match(denied.headers.get('www-authenticate'), /oauth-protected-resource/);
  const foreign = await worker.fetch(request('tools/list', {}, { origin: 'https://evil.example' }), f.env);
  assert.equal(foreign.status, 403);
  assert.equal((await worker.fetch(request('tools/list'), { ...f.env, CONNECTOR_ENABLED: 'false' })).status, 503);
  const metadata = await worker.fetch(new Request('https://mail.example/.well-known/oauth-protected-resource/mcp'), f.env);
  assert.equal((await metadata.json()).resource, 'https://mail.example/mcp');
});
test('scope escalation fails inside tool execution and exposes an OAuth challenge', async () => {
  const f = fixture();
  const worker = createWorker({ authenticate: async () => ({ id: 'alice', scopes: ['forpsi:read'] }), providerFactory: f.providerFactory });
  const response = await worker.fetch(request('tools/call', { name: 'send_message', arguments: {
    mailboxId: 'mail-a', message: mail, requestId: crypto.randomUUID() } }), f.env);
  const result = (await response.json()).result;
  assert.equal(result.isError, true);
  assert.match(result._meta['mcp/www_authenticate'][0], /insufficient_scope/);
  assert.equal(f.calls.length, 0);
});
test('direct MCP send cannot bypass a concrete preview and approval', async () => {
  const f=fixture();
  const worker=createWorker({authenticate:async()=>f.principal,providerFactory:f.providerFactory});
  const response=await worker.fetch(request('tools/call',{name:'send_message',arguments:{
    mailboxId:'mail-a',message:mail,requestId:crypto.randomUUID()}}),f.env);
  const result=(await response.json()).result;
  assert.equal(result.isError,true);
  assert.equal(result.content[0].text,'SEND_CONFIRMATION_REQUIRED');
  assert.equal((await f.store.rows('SELECT COUNT(*) AS n FROM outbox'))[0].n,0);
  assert.equal(f.calls.length,0);
});
test('MCP Apps worklist renders a saved synthetic snapshot without mailbox writes',async()=>{
  const f=fixture(),provider={
    async search(){f.calls.push('search');return {messages:[{
      reference:{folder:'INBOX',uid:42,uidValidity:'3'},date:'2026-09-25T09:00:00Z',
      from:[{address:'client@example.net'}],subject:'Dotaz'}],nextBeforeUid:null};},
    async read(reference){f.calls.push('read');return {reference,messageId:'<m42@example.net>',references:[],
      date:'2026-09-25T09:00:00Z',from:[{address:'client@example.net'}],subject:'Dotaz',text:'Prosím o odpověď.'};},
  };
  const worker=createWorker({authenticate:async()=>f.principal,providerFactory:()=>provider});
  const started=(await (await worker.fetch(request('tools/call',{name:'start_worklist',arguments:{
    mailboxId:'mail-a',limit:1}}),f.env)).json()).result.structuredContent.data;
  assert.equal(started.items[0].reference.uid,42);
  const rendered=(await (await worker.fetch(request('tools/call',{name:'render_worklist',arguments:{
    listId:started.listId}}),f.env)).json()).result.structuredContent.data;
  assert.equal(rendered.listId,started.listId);
  assert.equal(rendered.items[0].number,1);
  const detail=(await (await worker.fetch(request('tools/call',{name:'read_message',arguments:{
    mailboxId:'mail-a',message:rendered.items[0].reference}}),f.env)).json()).result.structuredContent.data;
  assert.equal(detail.text,'Prosím o odpověď.');
  assert.deepEqual(f.calls,['search','read','read']);
  assert.equal((await f.store.rows('SELECT COUNT(*) AS n FROM outbox'))[0].n,0);
});
test('input validation rejects header injection, arbitrary senders, invalid time and UID injection', () => {
  const base = { mailboxId: 'mail-a', message: mail, requestId: crypto.randomUUID() };
  assert.equal(selectors.send.safeParse({ ...base, message: { ...mail, subject: 'Hi\r\nBcc: x@example.com' } }).success, false);
  assert.equal(selectors.send.safeParse({ ...base, message: { ...mail, from: 'spoof@example.com' } }).success, false);
  assert.equal(selectors.schedule.safeParse({ ...base, sendAt: '2026-09-26T09:00:00' }).success, false);
  assert.equal(selectors.read.safeParse({ mailboxId: 'mail-a', message: { folder: 'INBOX', uid: '1:*', uidValidity: '2' } }).success, false);
});
test('encrypted payload cannot be used under another tenant/job or after tampering', async () => {
  const f = fixture(); const encrypted = await seal(mail, f.env.OUTBOX_KEY, 'tenant-a:job-a');
  assert.deepEqual(await unseal(encrypted, f.env.OUTBOX_KEY, 'tenant-a:job-a'), mail);
  await assert.rejects(unseal(encrypted, f.env.OUTBOX_KEY, 'tenant-b:job-a'));
  const parts = encrypted.split('.'); parts[2] = (parts[2][0] === 'a' ? 'b' : 'a') + parts[2].slice(1);
  await assert.rejects(unseal(parts.join('.'), f.env.OUTBOX_KEY, 'tenant-a:job-a'));
});
