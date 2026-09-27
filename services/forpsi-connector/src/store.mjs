import { authorizeResource } from './access-policy.mjs';
import { requireValue } from './errors.mjs';
import { z } from 'zod';
export class Store {
  constructor(db) { this.db = db; }
  first(sql, ...values) { return this.db.prepare(sql).bind(...values).first(); }
  async rows(sql, ...values) { return (await this.db.prepare(sql).bind(...values).all()).results; }
  run(sql, ...values) { return this.db.prepare(sql).bind(...values).run(); }
  async identity(issuer, subject) {
    const direct=await this.first('SELECT * FROM principals WHERE issuer=? AND subject=? AND active=1',issuer,subject);
    const linked=await this.first(`SELECT p.* FROM principal_identity_links l
      JOIN principals p ON p.id=l.principal_id AND p.tenant_id=l.tenant_id AND p.active=1
      WHERE l.issuer=? AND l.subject=? AND l.active=1`,issuer,subject);
    // A conflicting direct identity and link is a provisioning error, not a choice.
    return direct&&linked&&direct.id!==linked.id?null:direct??linked;
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
  async verifiedAliases(mailbox){
    const rows=await this.rows(`SELECT address FROM mailbox_verified_aliases
      WHERE tenant_id=? AND mailbox_id=? AND active=1 AND verified_at>0 ORDER BY address LIMIT 21`,
    mailbox.tenant_id,mailbox.id);
    requireValue(rows.length<=20,'ALIAS_LIMIT_EXCEEDED');
    return rows.map(x=>x.address.toLowerCase()).filter(x=>z.email().safeParse(x).success);
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
