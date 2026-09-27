import test from 'node:test';
import assert from 'node:assert/strict';
import { generateKeyPair, SignJWT } from 'jose';
import { fixture, mail, ref } from './fixtures.mjs';
import { verifyToken } from '../src/auth.mjs';
import { createWorker } from '../src/worker.mjs';
import { selectors } from '../src/schemas.mjs';
import { seal, unseal } from '../src/crypto.mjs';
import { SOAI_ISSUER } from '../src/admin-access.mjs';
import { SETUP_UI_URI } from '../src/setup-widget.mjs';

test('verified OAuth subject resolves only through an explicit active SO.ai identity link',async()=>{
  const f=fixture();
  await f.store.run('INSERT INTO principals VALUES (?,?,?,?,1)','soai-pilot','tenant-a',SOAI_ISSUER,'soai-user-a');
  await f.store.run('INSERT INTO principal_identity_links VALUES (?,?,?,?,1)',
    'https://id.example','oidc-user-a','soai-pilot','tenant-a');
  const keys=await generateKeyPair('ES256');
  const token=subject=>new SignJWT({scope:'forpsi:read'}).setProtectedHeader({alg:'ES256'})
    .setIssuer('https://id.example').setAudience('https://mail.example/mcp')
    .setSubject(subject).setExpirationTime('1h').sign(keys.privateKey);
  const config={issuer:'https://id.example',resource:'https://mail.example/mcp'};
  assert.equal((await verifyToken(await token('oidc-user-a'),config,keys.publicKey,f.store)).id,'soai-pilot');
  await assert.rejects(verifyToken(await token('oidc-user-b'),config,keys.publicKey,f.store),/AUTH_REQUIRED/);
  await f.store.run("UPDATE principal_identity_links SET active=0 WHERE subject='oidc-user-a'");
  await assert.rejects(verifyToken(await token('oidc-user-a'),config,keys.publicKey,f.store),/AUTH_REQUIRED/);
});

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
  assert.ok(list.result.tools.length >= 74);
  assert.ok(list.result.tools.some(t=>t.name==='get_mail_connection_status'));
  assert.ok(list.result.tools.some(t=>t.name==='submit_mail_view_analysis'));
  const widget = list.result.tools.find(t => t.name === 'render_worklist');
  assert.equal(widget._meta.ui.resourceUri, 'ui://forpsi/mail-app-v3.html');
  assert.equal(widget.annotations.readOnlyHint, true);
  const resources = await (await worker.fetch(request('resources/list'), f.env)).json();
  assert.equal(resources.result.resources[0].mimeType, 'text/html;profile=mcp-app');
  assert.equal(resources.result.resources[1].uri,SETUP_UI_URI);
  const setupResource=await (await worker.fetch(request('resources/read',{
    uri:SETUP_UI_URI}),f.env)).json();
  assert.match(setupResource.result.contents[0].text,/Souhlasím a pokračovat/);
  const resource=await (await worker.fetch(request('resources/read',{
    uri:'ui://forpsi/mail-app-v3.html'}),f.env)).json();
  assert.match(resource.result.contents[0].text,/ui\/notifications\/tool-result/);
  assert.match(resource.result.contents[0].text,/ui\/notifications\/initialized/);
  assert.match(resource.result.contents[0].text,/get_mail/);
  const send = list.result.tools.find(t => t.name === 'send_message');
  assert.equal(send.annotations.openWorldHint, true);
  assert.equal(send.annotations.destructiveHint, false);
  assert.deepEqual(send.securitySchemes[0].scopes, ['forpsi:send']);
  const response = await (await worker.fetch(request('tools/call', { name: 'list_mailboxes', arguments: {} }), f.env)).json();
  assert.equal(response.result.structuredContent.data.mailboxes[0].id, 'mail-a');
  const profile = await (await worker.fetch(request('tools/call', { name: 'get_profile', arguments: {} }), f.env)).json();
  assert.deepEqual(profile.result.structuredContent, { id: 'alice' });
});

test('daily mail exposes only safe tools with frozen setup, while another user cannot read a mailbox',async()=>{
  const f=fixture(),env={...f.env,ONBOARDING_FROZEN:'true',MCP_NATIVE_MUTATIONS_ENABLED:'false'};
  const own=createWorker({authenticate:async()=>({id:'alice',scopes:['forpsi:read']}),
    providerFactory:f.providerFactory});
  const listed=(await (await own.fetch(request('tools/list'),env)).json()).result.tools.map(x=>x.name);
  assert.ok(listed.includes('get_mail_connection_status'));
  assert.ok(listed.includes('submit_mail_view_analysis'));
  assert.ok(!listed.includes('answer_mail_setup'));
  assert.ok(!listed.includes('send_message'));
  assert.ok(!listed.includes('move_message'));
  const stranger=createWorker({authenticate:async()=>({id:'bob',scopes:['forpsi:read']}),
    providerFactory:f.providerFactory});
  const status=(await (await stranger.fetch(request('tools/call',{
    name:'get_mail_connection_status',arguments:{}}),env)).json()).result.structuredContent.data;
  assert.deepEqual(status.mailboxes,[]);
  const read=(await (await stranger.fetch(request('tools/call',{
    name:'get_mail',arguments:{mailboxId:'mail-a',message:{folder:'INBOX',uid:10,uidValidity:'3'}}}),env)).json()).result;
  assert.equal(read.isError,true);
  assert.equal(read.content[0].text,'ACCESS_DENIED');
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
test('direct MCP send only prepares an exact preview and cannot contact SMTP', async () => {
  const f=fixture();
  const worker=createWorker({authenticate:async()=>f.principal,providerFactory:f.providerFactory});
  const response=await worker.fetch(request('tools/call',{name:'send_message',arguments:{
    mailboxId:'mail-a',message:mail,requestId:crypto.randomUUID()}}),f.env);
  const result=(await response.json()).result;
  assert.equal(result.isError,undefined);
  assert.equal(result.structuredContent.data.state,'pending');
  assert.deepEqual(result.structuredContent.data.to,mail.to);
  assert.equal(result.structuredContent.data.text,mail.text);
  assert.match(result.structuredContent.data.approvalUrl,/\/forpsi-send\/\?proposalId=/);
  assert.equal((await f.store.rows('SELECT COUNT(*) AS n FROM outbox'))[0].n,0);
  assert.equal(f.calls.length,0);
});
test('personal pilot rejects another authenticated principal and hides mailbox mutation tools',async()=>{
  const f=fixture();
  Object.assign(f.env,{PERSONAL_PILOT_READ_ONLY:'true',PERSONAL_PILOT_PRINCIPAL_ID:'alice',
    PERSONAL_PILOT_MAILBOX_ID:'mail-a'});
  const worker=createWorker({authenticate:async request=>request.headers.get('x-test-user')==='bob'?
    {id:'bob',scopes:['forpsi:read']}:f.principal,providerFactory:f.providerFactory});
  const other=await worker.fetch(request('tools/list',{}, {'x-test-user':'bob'}),f.env);
  assert.equal(other.status,403);
  const allowed=await worker.fetch(request('tools/list'),f.env);
  const listed=(await allowed.json()).result.tools.map(tool=>tool.name);
  assert.ok(listed.includes('begin_mail_setup'));
  assert.ok(listed.includes('render_worklist'));
  assert.ok(!listed.includes('send_message'));
  assert.ok(!listed.includes('set_message_flags'));
  const write=await worker.fetch(request('tools/call',{name:'set_message_flags',arguments:{
    mailboxId:'mail-a',message:ref,seen:true}}),f.env);
  assert.equal((await write.json()).result.content[0].text,'PILOT_READ_ONLY');
  await worker.scheduled(null,f.env);
  assert.equal(f.calls.length,0);
});
test('personal pilot hides another mailbox and refuses its existing setup session',async()=>{
  const f=fixture();
  Object.assign(f.env,{PERSONAL_PILOT_READ_ONLY:'true',PERSONAL_PILOT_PRINCIPAL_ID:'alice',
    PERSONAL_PILOT_MAILBOX_ID:'mail-a'});
  await f.store.run(`INSERT INTO mailboxes
    (id,tenant_id,address,credential_key,drafts_folder,sent_folder,trash_folder,active)
    VALUES ('mail-other','tenant-a','other@example.com','key-other','Drafts','Sent','Trash',1)`);
  await f.store.run('INSERT INTO grants VALUES (?,?,?,0)','alice','mail-other','read');
  const sessionId=crypto.randomUUID();
  await f.store.run('INSERT INTO workflow_onboarding VALUES (?,?,?,?,?,?,?,?,?,?)',sessionId,
    'tenant-a','alice','mail-other','consented',JSON.stringify({days:30,folders:['INBOX']}),
    1,'{}',Date.now(),Date.now());
  const worker=createWorker({authenticate:async()=>f.principal,providerFactory:f.providerFactory});
  const listed=await worker.fetch(request('tools/call',{name:'list_mailboxes',arguments:{}}),f.env);
  assert.deepEqual((await listed.json()).result.structuredContent.data.mailboxes.map(m=>m.id),['mail-a']);
  const foreign=await worker.fetch(request('tools/call',{name:'get_mail_setup',arguments:{sessionId}}),f.env);
  assert.equal((await foreign.json()).result.content[0].text,'PILOT_ACCESS_DENIED');
});
test('personal pilot exposes message text to the MCP model and saves only cited analysis',async()=>{
  const f=fixture(),calls=[];
  Object.assign(f.env,{PERSONAL_PILOT_READ_ONLY:'true',PERSONAL_PILOT_PRINCIPAL_ID:'alice',
    PERSONAL_PILOT_MAILBOX_ID:'mail-a'});
  const incoming={reference:ref,date:'2026-09-25T09:00:00Z',messageId:'<pilot@example.net>',
    from:[{address:'client@example.net'}],to:[{address:'alice@example.com'}],cc:[],
    subject:'Rozhodnutí',text:'Prosím rozhodněte do zítřka.'};
  const provider={
    async listFolders(){return {folders:[{path:'INBOX',selectable:true},{path:'Sent',selectable:true}]};},
    async search({folder}){calls.push('search');return {messages:folder==='INBOX'?[incoming]:[],nextBeforeUid:null};},
    async read(){calls.push('read');return incoming;},
  };
  const worker=createWorker({authenticate:async()=>f.principal,providerFactory:()=>provider});
  const call=async(name,args)=>{
    const response=await worker.fetch(request('tools/call',{name,arguments:args}),f.env);
    assert.equal(response.status,200);
    const result=(await response.json()).result;
    assert.equal(result.isError,undefined,name);
    return result.structuredContent.data;
  };
  const begin=await call('begin_mail_setup',{mailboxId:'mail-a',consent:true});
  assert.equal(begin.scope.days,30);
  const state=await call('analyze_mail_history',{sessionId:begin.sessionId});
  assert.equal(state.analysisStatus,'awaiting_chatgpt');
  const sample=await call('read_setup_sample',{sessionId:begin.sessionId,offset:0,limit:5});
  assert.equal(sample.messages.length,1);
  assert.equal(sample.messages[0].text,'Prosím rozhodněte do zítřka.');
  assert.equal(sample.messages[0].recipientRole,'to');
  const sourceKey=sample.messages[0].key;
  const saved=await call('submit_setup_analysis',{sessionId:begin.sessionId,proposalVersion:1,
    findings:[{kind:'waiting_user',sourceKey,quote:'Prosím rozhodněte do zítřka.',
      summary:'Žádost o rozhodnutí.'}],priorities:[{sourceKey,priority:'high',
      reason:'Žádost o rozhodnutí.',quote:'Prosím rozhodněte do zítřka.'}]});
  assert.equal(saved.analysisStatus,'chatgpt_proposal');
  assert.equal(saved.observations.semantic.findings[0].dueDate,'2026-09-26');
  assert.equal(saved.proposal.version,2);
  const restored=await call('get_mail_setup',{sessionId:begin.sessionId});
  assert.equal(restored.observations.chatgptPriorities[0].priority,'high');
  assert.ok(restored.nextQuestion);
  const mailbox=await call('list_mailboxes',{});
  assert.equal(mailbox.mailboxes[0].setupSessionId,begin.sessionId);
  assert.deepEqual(calls.filter(x=>x==='search'),['search','search']);
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
