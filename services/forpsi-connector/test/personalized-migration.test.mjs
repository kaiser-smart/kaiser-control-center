import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';

test('additive migration preserves an existing numbered list and defaults unknown coverage',()=>{
  const db=new DatabaseSync(':memory:');
  for(let number=1;number<=6;number++){
    const name=['mail_connector','labels_rules','administration','composition','workflow','onboarding'][number-1];
    db.exec(readFileSync(new URL(`../migrations/${String(number).padStart(4,'0')}_${name}.sql`,import.meta.url),'utf8'));
  }
  db.exec(`INSERT INTO principals VALUES ('p','t','issuer','subject',1);
    INSERT INTO mailboxes(id,tenant_id,address,credential_key,active) VALUES ('m','t','a@example.test','key',1);
    INSERT INTO workflow_lists VALUES ('list','t','p','m','INBOX','priority',0,1,1,1,100,200);`);
  const before=db.prepare('SELECT * FROM workflow_lists WHERE id=?').get('list');
  db.exec(readFileSync(new URL('../migrations/0007_personalized_setup.sql',import.meta.url),'utf8'));
  db.exec(readFileSync(new URL('../migrations/0008_sync_progress.sql',import.meta.url),'utf8'));
  const after=db.prepare('SELECT * FROM workflow_lists WHERE id=?').get('list');
  assert.equal(after.id,before.id);assert.equal(after.folder,before.folder);
  assert.equal(after.older_unscanned,1);assert.equal(after.scanned_count,0);
  assert.equal(after.semantic_status,'unavailable');
  assert.equal(after.semantic_context_status,'not_analyzed');
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM workflow_sync_cursors').get().n,0);
});

test('attachment metadata migration preserves old numbered work and marks old counts unknown',()=>{
  const db=new DatabaseSync(':memory:');
  const names=['mail_connector','labels_rules','administration','composition','workflow',
    'onboarding','personalized_setup','sync_progress','send_approvals','daily_mail_view'];
  names.forEach((name,index)=>db.exec(readFileSync(new URL(`../migrations/${String(index+1).padStart(4,'0')}_${name}.sql`,import.meta.url),'utf8')));
  db.exec(`INSERT INTO principals VALUES ('p','t','issuer','subject',1);
    INSERT INTO mailboxes(id,tenant_id,address,credential_key,active) VALUES ('m','t','a@example.test','key',1);
    INSERT INTO workflow_lists(id,tenant_id,principal_id,mailbox_id,folder,view,created_at,expires_at)
      VALUES ('list','t','p','m','INBOX','priority',100,200);
    INSERT INTO workflow_list_items(list_id,number,reference_json,thread_key,message_key,sender,subject)
      VALUES ('list',7,'{"folder":"INBOX","uid":7,"uidValidity":"1"}','thread','message','a@example.test','Starší zpráva');`);
  db.exec(readFileSync(new URL('../migrations/0011_worklist_attachment_metadata.sql',import.meta.url),'utf8'));
  const item=db.prepare('SELECT number,subject,attachment_count FROM workflow_list_items WHERE list_id=?').get('list');
  assert.equal(item.number,7);
  assert.equal(item.subject,'Starší zpráva');
  assert.equal(item.attachment_count,null);
  assert.equal(db.prepare('PRAGMA integrity_check').get().integrity_check,'ok');
});
