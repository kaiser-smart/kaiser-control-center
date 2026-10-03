import { requireValue } from './errors.mjs';
import { ACTIONS } from './access-policy.mjs';

// SO.ai IDs are a distinct identity namespace, never inferred from email or OAuth subjects.
export const SOAI_ISSUER = 'urn:smart-odpady:session';

export async function listAccess(m, ctx) {
  const rows = await ctx.store.rows(`SELECT p.id,p.issuer,p.subject,p.active,g.action,g.revoked,l.subject linked_subject
    FROM principals p JOIN grants g ON g.principal_id=p.id
    LEFT JOIN principal_identity_links l ON l.principal_id=p.id AND l.tenant_id=p.tenant_id
      AND l.issuer='urn:smart-odpady:session' AND l.active=1
    WHERE p.tenant_id=? AND g.mailbox_id=? ORDER BY p.id,g.action LIMIT 1001`,ctx.tenant,m.id);
  requireValue(rows.length <= 1000,'ADMIN_LIMIT_EXCEEDED');
  const entries = new Map();
  for (const row of rows) {
    if (!entries.has(row.id)) entries.set(row.id,{principalId:row.id,
      userId:row.issuer===SOAI_ISSUER?row.subject:row.linked_subject??null,
      source:row.issuer===SOAI_ISSUER||row.linked_subject?'soai':'oauth',
      active:row.active===1,actions:[]});
    if (!row.revoked) entries.get(row.id).actions.push(row.action);
  }
  if(ctx.env.MAIL_BRAIN_V2_ENABLED==='true'){
    const capabilities=await ctx.store.rows(`SELECT principal_id,capability FROM brain_work_authorities_v2
      WHERE tenant_id=? AND mailbox_id=? AND enabled=1`,ctx.tenant,m.id);
    const entities=await ctx.store.rows('SELECT principal_id,address FROM brain_entities_v2 WHERE tenant_id=? AND kind=\'person\'',ctx.tenant);
    for(const entry of entries.values()){
      entry.workCapabilities=capabilities.filter(c=>c.principal_id===entry.principalId).map(c=>c.capability);
      entry.verifiedWorkAddress=entities.find(e=>e.principal_id===entry.principalId)?.address??null;
    }
  }
  const current=await ctx.store.first('SELECT revision FROM mailboxes WHERE id=? AND tenant_id=?',m.id,ctx.tenant);
  requireValue(current?.revision===m.revision,'VERSION_CONFLICT');
  return { mailboxId:m.id,revision:m.revision,entries:[...entries.values()],
    ...(ctx.env.MAIL_BRAIN_V2_ENABLED==='true'?{workV2Enabled:true}:{}) };
}

export async function saveAccess(m, p, ctx) {
  const { store, tenant, actorId } = ctx;
  const direct=await store.first('SELECT * FROM principals WHERE issuer=? AND subject=?',SOAI_ISSUER,p.userId);
  const linked=await store.first(`SELECT p.*,l.active link_active FROM principal_identity_links l JOIN principals p
    ON p.id=l.principal_id AND p.tenant_id=l.tenant_id WHERE l.issuer=? AND l.subject=?`,SOAI_ISSUER,p.userId);
  requireValue(!direct||!linked||direct.id===linked.id,'ACCESS_DENIED');
  const current=direct??linked;
  requireValue(!current || current.tenant_id===tenant,'ACCESS_DENIED');
  requireValue(!p.actions.length || !current || current.active===1,'PRINCIPAL_DISABLED');
  requireValue(!p.actions.length||linked?.link_active!==0,'PRINCIPAL_DISABLED');
  requireValue(current || p.actions.length,'PRINCIPAL_NOT_FOUND');
  const principalId = current?.id ?? `soai_${crypto.randomUUID()}`;
  if(p.workCapabilities!==undefined||p.workIdentity){
    requireValue(ctx.env.MAIL_BRAIN_V2_ENABLED==='true','INVALID_INPUT');
    requireValue(!p.workCapabilities?.length||p.actions.includes('read')&&p.actions.includes('write'),'INVALID_INPUT');
    requireValue(!p.workIdentity||p.actions.includes('read'),'INVALID_INPUT');
  }
  const changeId = crypto.randomUUID();
  const before = current ? (await store.rows('SELECT action FROM grants WHERE principal_id=? AND mailbox_id=? AND revoked=0',current.id,m.id)).map(g=>g.action) : [];
  const stmt=(sql,...values)=>store.db.prepare(sql).bind(...values);
  const changed='EXISTS(SELECT 1 FROM mailboxes WHERE id=? AND tenant_id=? AND last_change_id=?)';
  const marker=[m.id,tenant,changeId];
  const statements=[stmt(`UPDATE mailboxes SET revision=revision+1,updated_at=?,updated_by=?,last_change_id=?
    WHERE id=? AND tenant_id=? AND revision=?`,Date.now(),actorId,changeId,m.id,tenant,p.revision)];
  // The mailbox CAS gates every statement. A failed CAS writes neither identity, grants nor audit.
  // Do not reactivate an identity disabled elsewhere or repurpose an existing OAuth identity.
  if(!current)statements.push(stmt(`INSERT INTO principals SELECT ?,?,?,?,1 WHERE ${changed}
    ON CONFLICT(issuer,subject) DO NOTHING`,principalId,tenant,SOAI_ISSUER,p.userId,...marker));
  for(const action of ACTIONS) statements.push(stmt(`INSERT INTO grants
    SELECT p.id,?,?,? FROM principals p WHERE p.id=? AND p.tenant_id=? AND ${changed}
    ON CONFLICT(principal_id,mailbox_id,action) DO UPDATE SET revoked=excluded.revoked`,
  m.id,action,p.actions.includes(action)?0:1,principalId,tenant,...marker));
  if(p.workCapabilities!==undefined)for(const capability of ['facts.review','work.manage','signals.manage_shared'])
    statements.push(stmt(`INSERT INTO brain_work_authorities_v2
      (tenant_id,principal_id,mailbox_id,capability,enabled,approved_by,approved_at,revision)
      SELECT ?,?,?,?,?,?,?,1 WHERE ${changed}
      ON CONFLICT(tenant_id,principal_id,mailbox_id,capability) DO UPDATE SET
        enabled=excluded.enabled,approved_by=excluded.approved_by,approved_at=excluded.approved_at,
        revision=brain_work_authorities_v2.revision+1`,tenant,principalId,m.id,capability,
      p.workCapabilities.includes(capability)?1:0,actorId,Date.now(),...marker));
  if(p.workIdentity)statements.push(stmt(`INSERT INTO brain_entities_v2
    (id,tenant_id,kind,label,address,principal_id,verified_by,verified_at,revision)
    SELECT ?,?,'person',?,?,?,?,?,1 WHERE ${changed}
    ON CONFLICT(tenant_id,id) DO UPDATE SET label=excluded.label,address=excluded.address,
      verified_by=excluded.verified_by,verified_at=excluded.verified_at,revision=brain_entities_v2.revision+1`,
  principalId,tenant,p.workIdentity.label,p.workIdentity.address.toLowerCase(),principalId,actorId,Date.now(),...marker));
  statements.push(stmt(`INSERT INTO audit SELECT ?,?,?,?,?,? WHERE ${changed}`,
    crypto.randomUUID(),Date.now(),actorId,m.id,'admin.access.save',JSON.stringify({userId:p.userId,before,actions:p.actions,
      ...(p.workCapabilities!==undefined?{workCapabilities:p.workCapabilities}:{}),
      ...(p.workIdentity?{workIdentityVerified:true}:{})}),...marker));
  const results=await store.db.batch(statements);
  requireValue(Number(results[0].meta.changes)===1,'VERSION_CONFLICT');
  // Return the actual persisted selection. A later concurrent edit can only produce a newer snapshot.
  const latest=await store.first('SELECT id,revision FROM mailboxes WHERE id=? AND tenant_id=?',m.id,tenant);
  return {access:await listAccess(latest,ctx)};
}
