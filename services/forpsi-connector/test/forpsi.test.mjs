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
