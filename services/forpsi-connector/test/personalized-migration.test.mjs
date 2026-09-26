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
  const after=db.prepare('SELECT * FROM workflow_lists WHERE id=?').get('list');
  assert.equal(after.id,before.id);assert.equal(after.folder,before.folder);
  assert.equal(after.older_unscanned,1);assert.equal(after.scanned_count,0);
  assert.equal(after.semantic_status,'unavailable');
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM workflow_sync_cursors').get().n,0);
});
