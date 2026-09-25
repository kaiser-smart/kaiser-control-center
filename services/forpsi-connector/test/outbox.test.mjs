import test from 'node:test';
import assert from 'node:assert/strict';
import { fixture, mail } from './fixtures.mjs';

test('send is idempotent and rejects content changes for the same key', async () => {
  const f = fixture(); const request = { mailboxId: 'mail-a', requestId: crypto.randomUUID(), message: mail };
  const sent = await f.outbox.enqueue(f.principal, request, false);
  assert.equal(sent.state, 'sent');
  assert.equal((await f.outbox.enqueue(f.principal, request, false)).id, sent.id);
  assert.equal(f.calls.filter(c => c[0] === 'send').length, 1);
  await assert.rejects(f.outbox.enqueue(f.principal, { ...request, message: { ...mail, text: 'Changed' } }, false), /IDEMPOTENCY_CONFLICT/);
  const row = await f.store.first('SELECT * FROM outbox WHERE id=?', sent.id);
  assert.equal(row.payload_cipher, null);
});
test('simultaneous calls with one key produce one SMTP send', async () => {
  const f = fixture(); const request = { mailboxId: 'mail-a', requestId: crypto.randomUUID(), message: mail };
  await Promise.all([f.outbox.enqueue(f.principal, request, false), f.outbox.enqueue(f.principal, request, false)]);
  assert.equal(f.calls.filter(c => c[0] === 'send').length, 1);
});
test('schedule encrypts content, respects offset and never sends early', async () => {
  const f = fixture();
  const job = await f.outbox.enqueue(f.principal, { mailboxId: 'mail-a', requestId: crypto.randomUUID(), message: mail,
    sendAt: '2026-09-25T15:00:00+02:00' }, true);
  assert.equal(job.sendAt, '2026-09-25T13:00:00.000Z');
  const row = await f.store.first('SELECT * FROM outbox WHERE id=?', job.id);
  assert.equal(row.payload_cipher.includes('Test body'), false);
  await f.outbox.tick(); assert.equal(f.calls.length, 0);
  f.setTime(Date.parse(job.sendAt));
  await Promise.all([f.outbox.tick(), f.outbox.tick()]);
  assert.equal(f.calls.filter(c => c[0] === 'send').length, 1);
});
test('revoked grants block scheduled delivery at execution time', async () => {
  const f = fixture();
  const job = await f.outbox.enqueue(f.principal, { mailboxId: 'mail-a', requestId: crypto.randomUUID(), message: mail,
    sendAt: new Date(f.now() + 60000).toISOString() }, true);
  await f.store.run("UPDATE grants SET revoked=1 WHERE principal_id='alice' AND action='send'");
  f.setTime(f.now() + 60000); await f.outbox.tick();
  assert.equal((await f.store.first('SELECT state FROM outbox WHERE id=?', job.id)).state, 'blocked');
  assert.equal(f.calls.length, 0);
});
test('SMTP timeout is uncertain and is never retried by scheduler', async () => {
  const f = fixture(); let attempts = 0;
  f.provider.send = async () => { attempts++; throw new Error('Socket lost after DATA'); };
  const job = await f.outbox.enqueue(f.principal, { mailboxId: 'mail-a', requestId: crypto.randomUUID(), message: mail }, false);
  assert.equal(job.state, 'uncertain');
  await f.outbox.tick(); await f.outbox.process(job.id); assert.equal(attempts, 1);
});
test('partial SMTP acceptance is reported and not retried', async () => {
  const f = fixture(); f.provider.send = async () => ({ accepted: 1, rejected: 1, sentCopy: 'failed' });
  const job = await f.outbox.enqueue(f.principal, { mailboxId: 'mail-a', requestId: crypto.randomUUID(), message: mail }, false);
  assert.equal(job.state, 'partial'); assert.equal(job.result.sentCopy, 'failed');
});
test('cancellation is owned by the employee and prevents delivery', async () => {
  const f = fixture();
  const job = await f.outbox.enqueue(f.principal, { mailboxId: 'mail-a', requestId: crypto.randomUUID(), message: mail,
    sendAt: new Date(f.now() + 60000).toISOString() }, true);
  await assert.rejects(f.outbox.cancel({ ...f.principal, id: 'bob' }, job.id), /JOB_NOT_FOUND/);
  assert.equal((await f.outbox.cancel(f.principal, job.id)).state, 'cancelled');
  f.setTime(f.now() + 60000); await f.outbox.tick(); assert.equal(f.calls.length, 0);
});
test('stale sending jobs become uncertain after a crash without being requeued', async () => {
  const f = fixture();
  const job = await f.outbox.enqueue(f.principal, { mailboxId: 'mail-a', requestId: crypto.randomUUID(), message: mail,
    sendAt: new Date(f.now() + 60000).toISOString() }, true);
  await f.store.run("UPDATE outbox SET state='sending' WHERE id=?", job.id);
  f.setTime(f.now() + 16 * 60000); await f.outbox.tick();
  assert.equal((await f.store.first('SELECT state FROM outbox WHERE id=?', job.id)).state, 'uncertain');
  assert.equal(f.calls.length, 0);
});
test('mailbox identity change blocks scheduled delivery', async () => {
  const f = fixture();
  const job = await f.outbox.enqueue(f.principal, { mailboxId: 'mail-a', requestId: crypto.randomUUID(), message: mail,
    sendAt: new Date(f.now() + 60000).toISOString() }, true);
  await f.store.run("UPDATE mailboxes SET address='other@example.com' WHERE id='mail-a'");
  f.setTime(f.now() + 60000); await f.outbox.tick();
  assert.equal((await f.store.first('SELECT state FROM outbox WHERE id=?', job.id)).state, 'blocked');
});
