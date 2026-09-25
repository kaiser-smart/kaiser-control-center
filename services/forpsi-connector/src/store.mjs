import { authorizeResource } from './access-policy.mjs';
import { requireValue } from './errors.mjs';
export class Store {
  constructor(db) { this.db = db; }
  first(sql, ...values) { return this.db.prepare(sql).bind(...values).first(); }
  async rows(sql, ...values) { return (await this.db.prepare(sql).bind(...values).all()).results; }
  run(sql, ...values) { return this.db.prepare(sql).bind(...values).run(); }
  async identity(issuer, subject) {
    return this.first('SELECT * FROM principals WHERE issuer=? AND subject=? AND active=1', issuer, subject);
  }
  async access(principal, mailboxId, action) {
    const actor = await this.first('SELECT * FROM principals WHERE id=? AND active=1', principal.id);
    const mailbox = await this.first('SELECT * FROM mailboxes WHERE id=? AND active=1', mailboxId);
    requireValue(actor && mailbox, 'ACCESS_DENIED');
    const grants = await this.rows('SELECT * FROM grants WHERE principal_id=? AND mailbox_id=?', actor.id, mailboxId);
    requireValue(authorizeResource({ subject: actor.id, tenantId: actor.tenant_id, scopes: principal.scopes },
      { id: mailbox.id, tenantId: mailbox.tenant_id }, grants.map(g => ({
        subject: g.principal_id, resourceId: g.mailbox_id, tenantId: actor.tenant_id,
        permission: g.action, revoked: g.revoked !== 0,
      })), action), 'ACCESS_DENIED');
    return mailbox;
  }
  async mailboxes(principal) {
    requireValue(principal.scopes.includes('forpsi:read'), 'ACCESS_DENIED');
    return this.rows(`SELECT DISTINCT m.id, m.address FROM mailboxes m
      JOIN grants g ON g.mailbox_id=m.id JOIN principals p ON p.id=g.principal_id
      WHERE p.id=? AND p.active=1 AND m.active=1 AND p.tenant_id=m.tenant_id
      AND g.action='read' AND g.revoked=0 ORDER BY m.id`, principal.id);
  }
  audit(principal, mailboxId, action, outcome) {
    return this.run('INSERT INTO audit VALUES (?,?,?,?,?,?)', crypto.randomUUID(), Date.now(),
      principal.id, mailboxId ?? null, action, outcome);
  }
  async jobFor(principal, jobId) {
    const row = await this.first('SELECT * FROM outbox WHERE id=? AND principal_id=?', jobId, principal.id);
    requireValue(row, 'JOB_NOT_FOUND');
    await this.access(principal, row.mailbox_id, 'read');
    return row;
  }
}
