import { requireValue } from './errors.mjs';
import { ACTIONS } from './access-policy.mjs';

// SO.ai IDs are a distinct identity namespace, never inferred from email or OAuth subjects.
export const SOAI_ISSUER = 'urn:smart-odpady:session';

export async function listAccess(m, ctx) {
  const rows = await ctx.store.rows(`SELECT p.id,p.issuer,p.subject,p.active,g.action,g.revoked
    FROM principals p JOIN grants g ON g.principal_id=p.id
    WHERE p.tenant_id=? AND g.mailbox_id=? ORDER BY p.id,g.action LIMIT 1001`,ctx.tenant,m.id);
  requireValue(rows.length <= 1000,'ADMIN_LIMIT_EXCEEDED');
  const entries = new Map();
  for (const row of rows) {
    if (!entries.has(row.id)) entries.set(row.id,{principalId:row.id,
      userId:row.issuer===SOAI_ISSUER?row.subject:null,source:row.issuer===SOAI_ISSUER?'soai':'oauth',
      active:row.active===1,actions:[]});
    if (!row.revoked) entries.get(row.id).actions.push(row.action);
  }
  const current=await ctx.store.first('SELECT revision FROM mailboxes WHERE id=? AND tenant_id=?',m.id,ctx.tenant);
  requireValue(current?.revision===m.revision,'VERSION_CONFLICT');
  return { mailboxId:m.id,revision:m.revision,entries:[...entries.values()] };
}

export async function saveAccess(m, p, ctx) {
  const { store, tenant, actorId } = ctx;
  const current = await store.first('SELECT * FROM principals WHERE issuer=? AND subject=?',SOAI_ISSUER,p.userId);
  requireValue(!current || current.tenant_id===tenant,'ACCESS_DENIED');
  requireValue(!p.actions.length || !current || current.active===1,'PRINCIPAL_DISABLED');
  requireValue(current || p.actions.length,'PRINCIPAL_NOT_FOUND');
  const principalId = current?.id ?? `soai_${crypto.randomUUID()}`;
  const changeId = crypto.randomUUID();
  const before = current ? (await store.rows('SELECT action FROM grants WHERE principal_id=? AND mailbox_id=? AND revoked=0',current.id,m.id)).map(g=>g.action) : [];
  const stmt=(sql,...values)=>store.db.prepare(sql).bind(...values);
  const changed='EXISTS(SELECT 1 FROM mailboxes WHERE id=? AND tenant_id=? AND last_change_id=?)';
  const marker=[m.id,tenant,changeId];
  const statements=[stmt(`UPDATE mailboxes SET revision=revision+1,updated_at=?,updated_by=?,last_change_id=?
    WHERE id=? AND tenant_id=? AND revision=?`,Date.now(),actorId,changeId,m.id,tenant,p.revision)];
  // The mailbox CAS gates every statement. A failed CAS writes neither identity, grants nor audit.
  // Do not reactivate an identity disabled elsewhere or repurpose an existing OAuth identity.
  statements.push(stmt(`INSERT INTO principals SELECT ?,?,?,?,1 WHERE ${changed}
    ON CONFLICT(issuer,subject) DO NOTHING`,principalId,tenant,SOAI_ISSUER,p.userId,...marker));
  for(const action of ACTIONS) statements.push(stmt(`INSERT INTO grants
    SELECT p.id,?,?,? FROM principals p WHERE p.issuer=? AND p.subject=? AND p.tenant_id=? AND ${changed}
    ON CONFLICT(principal_id,mailbox_id,action) DO UPDATE SET revoked=excluded.revoked`,
  m.id,action,p.actions.includes(action)?0:1,SOAI_ISSUER,p.userId,tenant,...marker));
  statements.push(stmt(`INSERT INTO audit SELECT ?,?,?,?,?,? WHERE ${changed}`,
    crypto.randomUUID(),Date.now(),actorId,m.id,'admin.access.save',JSON.stringify({userId:p.userId,before,actions:p.actions}),...marker));
  const results=await store.db.batch(statements);
  requireValue(Number(results[0].meta.changes)===1,'VERSION_CONFLICT');
  // Return the actual persisted selection. A later concurrent edit can only produce a newer snapshot.
  const latest=await store.first('SELECT id,revision FROM mailboxes WHERE id=? AND tenant_id=?',m.id,tenant);
  return {access:await listAccess(latest,ctx)};
}
