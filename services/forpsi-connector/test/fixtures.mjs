import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import { Store } from '../src/store.mjs';
import { Organizer } from '../src/organize.mjs';
import { Outbox } from '../src/outbox.mjs';

export function fixture() {
  const sqlite = new DatabaseSync(':memory:');
  for (const name of ['0001_mail_connector.sql', '0002_labels_rules.sql', '0003_administration.sql', '0004_composition.sql', '0005_workflow.sql', '0006_onboarding.sql']) {
    sqlite.exec(readFileSync(new URL(`../migrations/${name}`, import.meta.url), 'utf8'));
  }
  // Execute the real migration SQL and queries using SQLite, exposing the D1 interface.
  const db = { prepare(sql) {
    return { bind(...args) {
      const statement = sqlite.prepare(sql);
      return { async first() { return statement.get(...args) ?? null; },
        async all() { return { results: statement.all(...args) }; },
        async run() { return { success: true, meta: statement.run(...args) }; },
        _run() { return {success:true,meta:statement.run(...args)}; } };
    } };
  } };
  db.batch = async statements => {
    sqlite.exec('BEGIN');
    try { const results = statements.map(s => s._run()); sqlite.exec('COMMIT'); return results; }
    catch (error) { sqlite.exec('ROLLBACK'); throw error; }
  };
  const store = new Store(db);
  sqlite.exec(`INSERT INTO principals VALUES ('alice','tenant-a','https://id.example','sub-alice',1),
    ('bob','tenant-a','https://id.example','sub-bob',1),('eve','tenant-b','https://id.example','sub-eve',1);
    INSERT INTO mailboxes (id,tenant_id,address,credential_key,drafts_folder,sent_folder,trash_folder,active) VALUES ('mail-a','tenant-a','alice@example.com','key-a','Drafts','Sent','Trash',1),
    ('mail-b','tenant-b','eve@example.com','key-b','Drafts','Sent','Trash',1);`);
  for (const action of ['read','write','send','delete','schedule']) {
    sqlite.prepare('INSERT INTO grants VALUES (?,?,?,0)').run('alice', 'mail-a', action);
  }
  const principal = { id: 'alice', scopes: ['read','write','send','delete','schedule'].map(a => `forpsi:${a}`) };
  const calls = [];
  const provider = {
    async read(ref) { calls.push(['read', ref]); return { reference: ref, subject: 'Faktura',
      from: [{ name: 'Supplier', address: 'supplier@example.com' }], text: 'Invoice body', truncated: false }; },
    async flags(ref, flags) { calls.push(['flags', ref, flags]); return { updated: true }; },
    async move(ref, destination) { calls.push(['move', ref, destination]); return { moved: true,
      reference: { folder: destination, uidValidity: '5', uid: ref.uid + 100 } }; },
    async send(message, job) { calls.push(['send', message, job.id]); return { accepted: 1, rejected: 0, sentCopy: 'saved' }; },
    async listFolders() { return { folders: [{ path: 'INBOX' }] }; },
  };
  const env = { DB: db, CONNECTOR_ENABLED: 'true', MCP_RESOURCE: 'https://mail.example/mcp',
    OAUTH_ISSUER: 'https://id.example', OAUTH_JWKS_URL: 'https://id.example/jwks',
    OUTBOX_KEY: Buffer.alloc(32, 42).toString('base64') };
  const providerFactory = () => provider;
  let currentTime = Date.parse('2026-09-25T12:00:00Z');
  const outbox = new Outbox(store, env, providerFactory, () => currentTime);
  return { sqlite, db, store, principal, calls, provider, providerFactory, env,
    organizer: new Organizer(store), outbox, now: () => currentTime, setTime: value => { currentTime = value; } };
}
export const ref = { folder: 'INBOX', uid: 10, uidValidity: '3' };
export const mail = { to: ['recipient@example.com'], cc: [], bcc: [], subject: 'Test', text: 'Test body' };
