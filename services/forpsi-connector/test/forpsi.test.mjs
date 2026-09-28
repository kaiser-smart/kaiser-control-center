import test from 'node:test';
import assert from 'node:assert/strict';
import { Readable } from 'node:stream';
import { Forpsi } from '../src/forpsi.mjs';
import { ref, mail } from './fixtures.mjs';

function adapter(overrides = {}) {
  const calls = [];
  const client = { on() {}, connect: async () => {}, close() { calls.push(['closed']); },
    mailbox: { uidValidity: 3n, uidNext: 20 }, capabilities: new Map([['MOVE', true]]),
    getMailboxLock: async (folder, options) => { calls.push(['lock', folder, options]); return { release() {} }; },
    fetchOne: async () => ({ uid: 10, size: 100, flags: new Set(), envelope: {} }),
    download: async () => ({ content: Readable.from([Buffer.from('From: sender@example.com\r\nSubject: Test\r\n\r\nPlain body')]) }),
    list: async () => [{ path: 'Drafts', specialUse: '\\Drafts' }, { path: 'Trash', specialUse: '\\Trash' }, { path: 'Sent', specialUse: '\\Sent' }],
    append: async (...args) => { calls.push(['append', ...args]); return { uid: 9, uidValidity: 3n }; },
    messageMove: async () => { calls.push(['move']); return { uidMap: new Map([[10, 11]]), uidValidity: 4n }; },
    ...overrides };
  const provider = new Forpsi({ MAILBOX_CREDENTIALS: JSON.stringify({ secret: 'not-a-live-password' }) }, {
    address: 'alice@example.com', credential_key: 'secret', id: 'mail-a' }, {
    clientFactory: options => { calls.push(['options', options]); return client; },
    transportFactory: options => { calls.push(['smtpOptions', options]); return {
      sendMail: async data => { calls.push(['smtp', data]); return { accepted: ['recipient@example.com'], rejected: [] }; }, close() {} }; },
  });
  return { provider, client, calls };
}
test('reading uses read-only IMAP lock, TLS verification and does not mark seen', async () => {
  const f = adapter(); const result = await f.provider.read(ref);
  assert.equal(result.text, 'Plain body'); assert.equal(result.untrustedContent, true);
  assert.deepEqual(f.calls.find(c => c[0] === 'lock')[2], { readOnly: true });
  const config = f.calls.find(c => c[0] === 'options')[1];
  assert.equal(config.tls.rejectUnauthorized, true); assert.equal(config.port, 993);
  assert.equal(config.logger, false);
});
test('Mail Brain reads a 3 MiB message without downloading its 2.5 MiB attachment',async()=>{
  const body=Buffer.from('Please send the revised offer by Friday.');
  const downloaded=[];
  const f=adapter({fetchOne:async()=>({uid:10,size:3*1024*1024,flags:new Set(),
    envelope:{subject:'Offer',messageId:'<large@example.net>'},
    bodyStructure:{type:'multipart/mixed',childNodes:[
      {part:'1',type:'text/plain',size:body.length},
      {part:'2',type:'application/pdf',size:2.5*1024*1024,
        disposition:'attachment',dispositionParameters:{filename:'offer.pdf'}}]}}),
  download:async(_uid,part,options)=>{
    downloaded.push({part,options});
    if(part!=='1')throw Error('Binary attachment must not be downloaded');
    return {meta:{contentType:'text/plain'},content:Readable.from([body])};
  }});
  const result=await f.provider.readForBrain(ref);
  assert.equal(result.text,body.toString());
  assert.equal(result.size,3*1024*1024);
  assert.deepEqual(result.attachments,[{filename:'offer.pdf',contentType:'application/pdf',
    size:2.5*1024*1024}]);
  assert.deepEqual(downloaded.map(x=>x.part),['1']);
  assert.equal(downloaded[0].options.maxBytes,512*1024+1);
  assert.deepEqual(f.calls.find(c=>c[0]==='lock')[2],{readOnly:true});
  assert.equal(f.calls.some(c=>['append','move','smtp'].includes(c[0])),false);
});
test('Mail Brain rejects oversized text and malformed MIME before claiming a read',async()=>{
  let downloads=0;
  const large=adapter({fetchOne:async()=>({uid:10,size:3*1024*1024,
    bodyStructure:{type:'text/plain',size:512*1024+1}}),
  download:async()=>{downloads++;throw Error('unexpected download');}});
  await assert.rejects(large.provider.readForBrain(ref),/MESSAGE_TOO_LARGE/);
  const malformed=adapter({fetchOne:async()=>({uid:10,size:3*1024*1024,
    bodyStructure:{type:'multipart/mixed'}}),
  download:async()=>{downloads++;throw Error('unexpected download');}});
  await assert.rejects(malformed.provider.readForBrain(ref),/MIME_STRUCTURE_INVALID/);
  assert.equal(downloads,0);
});
test('Mail Brain rejects a silently truncated text stream and converts bounded HTML',async()=>{
  const oversized=adapter({fetchOne:async()=>({uid:10,size:3*1024*1024,
    bodyStructure:{type:'text/plain',size:10}}),
  download:async()=>({meta:{contentType:'text/plain'},
    content:Readable.from([Buffer.alloc(512*1024+1,65)])})});
  await assert.rejects(oversized.provider.readForBrain(ref),/MESSAGE_TOO_LARGE/);
  const incomplete=adapter({fetchOne:async()=>({uid:10,size:3*1024*1024,
    bodyStructure:{type:'text/plain',encoding:'7bit',size:20}}),
  download:async()=>({meta:{contentType:'text/plain'},
    content:Readable.from([Buffer.from('short')])})});
  await assert.rejects(incomplete.provider.readForBrain(ref),/MIME_PART_INCOMPLETE/);
  const html=Buffer.from('<p>Hello <strong>world</strong>.</p>');
  const converted=adapter({fetchOne:async()=>({uid:10,size:3*1024*1024,
    bodyStructure:{type:'text/html',size:html.length}}),
  download:async()=>({meta:{contentType:'text/html'},content:Readable.from([html])})});
  assert.match((await converted.provider.readForBrain(ref)).text,/Hello world/);
});
test('small messages use the same parsing result in the Mail Brain reader',async()=>{
  const f=adapter();
  assert.deepEqual(await f.provider.readForBrain(ref),await f.provider.read(ref));
});
test('PDF inspection uses bytes rather than filename and keeps the mailbox read-only',async()=>{
  const real=Buffer.from('%PDF-1.4\n1 0 obj\n<<>>\nendobj\n%%EOF');
  const fake=Buffer.from('ordinary text, despite a PDF name');
  const attachment=(name,bytes)=>`--part\r\nContent-Type: application/pdf; name="${name}"\r\n`+
    `Content-Disposition: attachment; filename="${name}"\r\nContent-Transfer-Encoding: base64\r\n\r\n`+
    `${bytes.toString('base64')}\r\n`;
  const raw=Buffer.from('From: sender@example.com\r\nMIME-Version: 1.0\r\n'+
    'Content-Type: multipart/mixed; boundary="part"\r\n\r\n'+
    attachment('fake.pdf',fake)+attachment('invoice.bin',real)+'--part--\r\n');
  const f=adapter({fetchOne:async()=>({uid:10,size:raw.length}),
    download:async()=>({content:Readable.from([raw])})});
  const found=await f.provider.inspectPdfAttachments(ref);
  assert.deepEqual(found.map(x=>x.isPdf),[false,true]);
  assert.equal(found[1].filename,'invoice.bin');
  assert.match(found[1].sha256,/^[a-f0-9]{64}$/);
  assert.deepEqual(f.calls.find(c=>c[0]==='lock')[2],{readOnly:true});
  assert.equal(f.calls.some(c=>['append','move','smtp'].includes(c[0])),false);
});
test('search passes exact receive-date bounds and paginates empty UID windows without marking seen',async()=>{
  let query;const f=adapter({mailbox:{uidValidity:3n,uidNext:12000},search:async q=>{query=q;return [];}});
  const result=await f.provider.search({folder:'INBOX',since:'2026-08-26',before:'2026-09-03',limit:20});
  assert.equal(query.since.toISOString(),'2026-08-26T00:00:00.000Z');assert.equal(query.before.toISOString(),'2026-09-03T00:00:00.000Z');
  assert.equal(result.nextBeforeUid,7000);assert.equal(result.messages.length,0);
  assert.deepEqual(f.calls.find(c=>c[0]==='lock')[2],{readOnly:true});
});
test('stale UIDVALIDITY rejects mutation, preventing action on another message', async () => {
  const f = adapter();
  await assert.rejects(f.provider.move({ ...ref, uidValidity: '99' }, 'Archive'), /STALE_MESSAGE_REFERENCE/);
  assert.equal(f.calls.some(c => c[0] === 'move'), false);
});
test('server without MOVE cannot invoke a dangerous broad EXPUNGE fallback', async () => {
  const f = adapter({ capabilities: new Map() });
  await assert.rejects(f.provider.move(ref, undefined, true), /SAFE_MOVE_UNSUPPORTED/);
  assert.equal(f.calls.some(c => c[0] === 'move'), false);
});
test('draft preserves Bcc but actual SMTP content strips it; recipients include Bcc', async () => {
  const f = adapter(); const message = { ...mail, bcc: ['hidden@example.com'] };
  await f.provider.saveDraft(message);
  const draft = f.calls.find(c => c[0] === 'append');
  assert.match(draft[2].toString(), /Bcc: hidden@example.com/);
  await f.provider.send(message, { id: crypto.randomUUID(), send_at: Date.now() });
  const sent = f.calls.find(c => c[0] === 'smtp')[1];
  assert.doesNotMatch(sent.raw.toString(), /^Bcc:/m);
  assert.ok(sent.envelope.to.includes('hidden@example.com'));
  assert.equal(sent.envelope.from, 'alice@example.com');
});
test('SMTP acceptance stays successful when saving Sent copy fails', async () => {
  const f = adapter({ append: async () => { throw new Error('IMAP unavailable'); } });
  const sent = await f.provider.send(mail, { id: crypto.randomUUID(), send_at: Date.now() });
  assert.equal(sent.sentCopy, 'failed'); assert.equal(sent.accepted, 1);
  assert.equal(f.calls.filter(c => c[0] === 'smtp').length, 1);
});
test('folder discovery reports non-selectable parents and ambiguous special folders require explicit choice',async()=>{
  const f=adapter({list:async()=>[{path:'Parent',flags:new Set(['\\Noselect'])},{path:'Drafts',specialUse:'\\Drafts'},
    {path:'Other drafts',specialUse:'\\Drafts'}]});
  assert.equal((await f.provider.listFolders()).folders[0].selectable,false);
  await assert.rejects(f.provider.saveDraft(mail),/SPECIAL_FOLDER_NOT_CONFIGURED/);
  assert.equal(f.calls.some(c=>c[0]==='append'),false);
  f.provider.mailbox.drafts_folder='Drafts';
  await f.provider.saveDraft(mail);
  assert.equal(f.calls.find(c=>c[0]==='append')[1],'Drafts');
});
