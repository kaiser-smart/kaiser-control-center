import test from 'node:test';
import assert from 'node:assert/strict';
import { fixture, ref } from './fixtures.mjs';
import { executeTool } from '../src/mcp.mjs';

test('labels support create/edit/assign with mailbox isolation and version protection', async () => {
  const f = fixture();
  const { label } = await executeTool('create_label', { mailboxId: 'mail-a', name: 'Faktury', color: '#0066ff' }, f);
  await executeTool('assign_label', { mailboxId: 'mail-a', labelId: label.id, message: ref, assigned: true }, f);
  assert.equal((await f.organizer.messageLabels('mail-a', ref))[0].name, 'Faktury');
  const edited = await executeTool('edit_label', { mailboxId: 'mail-a', labelId: label.id, version: 1, name: 'Zaplaceno', color: '#00ff00' }, f);
  assert.equal(edited.label.version, 2);
  await assert.rejects(executeTool('edit_label', { mailboxId: 'mail-a', labelId: label.id, version: 1, name: 'Stale', color: '#ff0000' }, f), /LABEL_VERSION_CONFLICT/);
  await assert.rejects(f.organizer.label('mail-b', label.id), /LABEL_NOT_FOUND/);
  await executeTool('assign_label', { mailboxId: 'mail-a', labelId: label.id, message: ref, assigned: false }, f);
  assert.equal((await f.organizer.messageLabels('mail-a', ref)).length, 0);
});
test('rule preview does not mutate; apply labels, flags and move, preserving known UID mapping', async () => {
  const f = fixture();
  const { label } = await executeTool('create_label', { mailboxId: 'mail-a', name: 'Faktury', color: '#0066ff' }, f);
  const rule = { name: 'Faktury', enabled: true, folder: 'INBOX',
    conditions: [{ field: 'subject', contains: 'FAKTURA' }],
    actions: { labels: [label.id], destination: 'Invoices', seen: true } };
  const created = await executeTool('create_rule', { mailboxId: 'mail-a', rule }, f);
  const args = { mailboxId: 'mail-a', ruleId: created.id, version: created.version, messages: [ref] };
  const preview = await executeTool('apply_rule', args, f);
  assert.equal(preview.preview, true); assert.equal(preview.results[0].matches, true);
  assert.equal(f.calls.some(c => c[0] !== 'read'), false);
  assert.equal((await f.organizer.messageLabels('mail-a', ref)).length, 0);
  const applied = await executeTool('apply_rule', { ...args, preview: false }, f);
  assert.equal(applied.results[0].applied, true);
  assert.equal((await f.organizer.messageLabels('mail-a', { folder: 'Invoices', uidValidity: '5', uid: 110 }))[0].id, label.id);
  const updated = await executeTool('edit_rule', { mailboxId: 'mail-a', ruleId: created.id, version: 1,
    rule: { ...rule, folder: 'Archive', enabled: false } }, f);
  assert.equal(updated.version, 2);
  await assert.rejects(executeTool('apply_rule', args, f), /RULE_VERSION_CONFLICT/);
});
test('rule partial failure reports completed steps, never declares total success', async () => {
  const f = fixture();
  const created = await executeTool('create_rule', { mailboxId: 'mail-a', rule: { name: 'R', enabled: true, folder: 'INBOX',
    conditions: [{ field: 'subject', contains: 'faktura' }], actions: { seen: true, destination: 'Archive' } } }, f);
  f.provider.move = async () => { throw new Error('provider secret text'); };
  const result = await executeTool('apply_rule', { mailboxId: 'mail-a', ruleId: created.id, version: 1, messages: [ref], preview: false }, f);
  assert.equal(result.results[0].applied, false);
  assert.deepEqual(result.results[0].completed, ['flags']);
  assert.equal(result.results[0].error, 'PROVIDER_UNAVAILABLE');
});
test('cross-tenant grant and coworker access are rejected before provider access', async () => {
  const f = fixture();
  await f.store.run("INSERT INTO grants VALUES ('alice','mail-b','read',0)");
  await assert.rejects(executeTool('read_message', { mailboxId: 'mail-b', message: ref }, f), /ACCESS_DENIED/);
  await assert.rejects(executeTool('read_message', { mailboxId: 'mail-a', message: ref }, { ...f, principal: { ...f.principal, id: 'bob' } }), /ACCESS_DENIED/);
  assert.equal(f.calls.length, 0);
});
