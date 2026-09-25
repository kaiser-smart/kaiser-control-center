import { timingSafeEqual } from 'node:crypto';
import { z } from 'zod';
import { Store } from './store.mjs';
import { seal } from './crypto.mjs';
import { credentialContext } from './credentials.mjs';
import { capabilities } from './capabilities.mjs';
import { requireValue, ConnectorError } from './errors.mjs';

const id = z.string().min(1).max(128).regex(/^[a-zA-Z0-9_-]+$/);
const revision = z.number().int().positive();
const folder = z.string().max(500).refine(s => !/[\x00-\x1f]/.test(s)).nullable().default(null);
const save = z.object({ id: id.optional(), requestId: z.string().uuid(), revision: revision.optional(),
  address: z.email().max(254).transform(s => s.toLowerCase()), displayName: z.string().trim().min(1).max(100),
  draftsFolder: folder, sentFolder: folder, trashFolder: folder,
  password: z.string().min(1).max(1024).optional() }).strict();
const selection = z.object({ id, revision }).strict();
const schemas = { overview: z.object({}).strict(), save,
  verify: selection, set_active: selection.extend({ active: z.boolean() }) };
const publicColumns = `m.id,m.address,m.display_name,m.active,m.revision,m.drafts_folder,m.sent_folder,m.trash_folder,
  m.updated_at,m.updated_by,m.verified_at,m.verification_json`;
function publicMailbox(m) {
  const { verification_json, ...rest } = m;
  return { ...rest, verification: verification_json ? JSON.parse(verification_json) : null };
}
const mutationSql = (db, sql, ...values) => db.prepare(sql).bind(...values);
async function mailbox(store, tenant, mailboxId) {
  const row = await store.first('SELECT * FROM mailboxes WHERE id=? AND tenant_id=?', mailboxId, tenant);
  requireValue(row, 'MAILBOX_NOT_FOUND');
  return row;
}
async function mutate(store, m, statements, actorId, action, changeId) {
  const audit = mutationSql(store.db, `INSERT INTO audit SELECT ?,?,?,?,?,?
    WHERE EXISTS(SELECT 1 FROM mailboxes WHERE id=? AND tenant_id=? AND last_change_id=?)`,
  crypto.randomUUID(), Date.now(), actorId, m.id, action, 'saved', m.id, m.tenant_id, changeId);
  const results = await store.db.batch([...statements, audit]);
  requireValue(Number(results[0].meta.changes) === 1, 'VERSION_CONFLICT');
  return { mailbox: publicMailbox(await store.first(`SELECT ${publicColumns} FROM mailboxes m WHERE m.id=? AND m.tenant_id=?`, m.id, m.tenant_id)) };
}

export async function executeAdmin(operation, raw, ctx) {
  const parsed = schemas[operation]?.safeParse(raw);
  requireValue(parsed?.success, 'INVALID_INPUT');
  const p = parsed.data;
  const { store, env, actorId, tenant, providerFactory, calendarFactory, contactFactory } = ctx;
  if (operation === 'overview') {
    const mailboxes = await store.rows(`SELECT ${publicColumns} FROM mailboxes m WHERE tenant_id=? ORDER BY address LIMIT 201`, tenant);
    requireValue(mailboxes.length <= 200, 'ADMIN_LIMIT_EXCEEDED');
    const [grants, audit, queue, rules, labels] = await Promise.all([
      store.rows(`SELECT p.id principalId,m.id mailboxId,g.action,g.revoked,p.active FROM grants g
        JOIN principals p ON p.id=g.principal_id JOIN mailboxes m ON m.id=g.mailbox_id
        WHERE p.tenant_id=? AND m.tenant_id=? ORDER BY p.id,m.id,g.action LIMIT 501`, tenant, tenant),
      store.rows(`SELECT a.at,a.principal_id,a.mailbox_id,a.action,a.outcome FROM audit a JOIN mailboxes m ON m.id=a.mailbox_id
        WHERE m.tenant_id=? ORDER BY a.at DESC LIMIT 50`, tenant),
      store.rows(`SELECT o.id,o.mailbox_id,o.state,o.send_at FROM outbox o WHERE o.tenant_id=? ORDER BY created_at DESC LIMIT 50`, tenant),
      store.rows(`SELECT r.id,r.mailbox_id,json_extract(r.definition_json,'$.name') name,json_extract(r.definition_json,'$.enabled') enabled,r.version FROM rules r JOIN mailboxes m ON m.id=r.mailbox_id WHERE m.tenant_id=? LIMIT 201`, tenant),
      store.rows(`SELECT l.id,l.mailbox_id,l.name,l.color,l.version FROM labels l JOIN mailboxes m ON m.id=l.mailbox_id WHERE m.tenant_id=? LIMIT 201`, tenant),
    ]);
    return { mailboxes: mailboxes.map(publicMailbox), grants: grants.slice(0,500), audit, queue,
      rules: rules.slice(0,200), labels: labels.slice(0,200),
      truncated: { grants:grants.length>500, rules:rules.length>200, labels:labels.length>200 },
      capabilities: capabilities(), connectorEnabled: env.CONNECTOR_ENABLED === 'true',
      credentialStorageReady: Boolean(env.CREDENTIALS_KEY), oauthConfigured: Boolean(env.OAUTH_ISSUER && env.OAUTH_JWKS_URL && env.MCP_RESOURCE),
      verificationMode: ctx.verificationMode ?? 'provider', checkedAt: Date.now() };
  }
  if (operation === 'save') {
    requireValue(!p.id || p.revision, 'INVALID_INPUT');
    const m = p.id ? await mailbox(store, tenant, p.id) : { id: `mail_${p.requestId}`, tenant_id: tenant, address: p.address };
    requireValue(!p.id || (m.revision === p.revision && m.address === p.address), 'VERSION_CONFLICT');
    if (!p.id) requireValue(!(await store.first('SELECT id FROM mailboxes WHERE tenant_id=? AND address=? COLLATE NOCASE',tenant,p.address)), 'MAILBOX_EXISTS');
    const changeId = crypto.randomUUID();
    const now = Date.now();
    let ciphertext;
    if (p.password) {
      requireValue(env.CREDENTIALS_KEY, 'CREDENTIALS_NOT_CONFIGURED');
      ciphertext = await seal({ password:p.password }, env.CREDENTIALS_KEY, credentialContext(m));
    }
    const statements = [p.id
      ? mutationSql(store.db, `UPDATE mailboxes SET display_name=?,drafts_folder=?,sent_folder=?,trash_folder=?,
          revision=revision+1,updated_at=?,updated_by=?,last_change_id=?,
          active=0,verified_at=NULL,verification_json=NULL,
          credential_key=CASE WHEN ? THEN ? ELSE credential_key END WHERE id=? AND tenant_id=? AND revision=?`,
        p.displayName,p.draftsFolder,p.sentFolder,p.trashFolder,now,actorId,changeId,
        Boolean(p.password)?1:0,`vault:${m.id}`,m.id,tenant,p.revision)
      : mutationSql(store.db, `INSERT INTO mailboxes
          (id,tenant_id,address,credential_key,drafts_folder,sent_folder,trash_folder,active,display_name,updated_at,updated_by,last_change_id)
          VALUES (?,?,?,?,?,?,?,0,?,?,?,?)`,
        m.id,tenant,p.address,`vault:${m.id}`,p.draftsFolder,p.sentFolder,p.trashFolder,p.displayName,now,actorId,changeId)];
    if (ciphertext) statements.push(mutationSql(store.db, `INSERT INTO mailbox_credentials SELECT id,?,? FROM mailboxes
      WHERE id=? AND tenant_id=? AND last_change_id=? ON CONFLICT(mailbox_id) DO UPDATE SET ciphertext=excluded.ciphertext,updated_at=excluded.updated_at`,
    ciphertext,now,m.id,tenant,changeId));
    return mutate(store,m,statements,actorId,'admin.save',changeId);
  }
  const m = await mailbox(store, tenant, p.id);
  requireValue(m.revision === p.revision, 'VERSION_CONFLICT');
  const changeId = crypto.randomUUID();
  if (operation === 'set_active') {
    if (p.active) {
      const v = JSON.parse(m.verification_json ?? '{}');
      requireValue(m.verified_at && v.mode===(ctx.verificationMode ?? 'provider') && Date.now()-m.verified_at < 15*60000 && v.imap === 'verified' && v.smtp === 'verified', 'VERIFICATION_REQUIRED');
    }
    return mutate(store,m,[mutationSql(store.db,`UPDATE mailboxes SET active=?,revision=revision+1,updated_at=?,updated_by=?,last_change_id=?
      WHERE id=? AND tenant_id=? AND revision=?`,p.active?1:0,Date.now(),actorId,changeId,m.id,tenant,p.revision)],actorId,'admin.set_active',changeId);
  }
  // Read-only provider diagnostics. SMTP VERIFY never sends a message.
  const outcome = { mode:ctx.verificationMode ?? 'provider', imap:'failed',smtp:'failed',calendar:'failed',contacts:'failed' };
  const check = async (key, fn) => { try { const result=await fn(); outcome[key]=result==='empty'?'empty':'verified'; } catch { /* Never expose provider errors/secrets. */ } };
  await Promise.all([
    check('imap', async () => { const result = await providerFactory(env,m).listFolders(); outcome.supportsMove = result.supportsMove === true; }),
    check('smtp', async () => requireValue(await providerFactory(env,m).verifySmtp() === true, 'SMTP_VERIFY_FAILED')),
    check('calendar', async () => (await calendarFactory(env,m).calendars()).calendars.length ? 'verified':'empty'),
    check('contacts', async () => (await contactFactory(env,m).addressBooks()).addressBooks.length ? 'verified':'empty'),
  ]);
  return mutate(store,m,[mutationSql(store.db,`UPDATE mailboxes SET verified_at=?,verification_json=?,revision=revision+1,updated_at=?,updated_by=?,last_change_id=?
    WHERE id=? AND tenant_id=? AND revision=?`,Date.now(),JSON.stringify(outcome),Date.now(),actorId,changeId,m.id,tenant,p.revision)],actorId,'admin.verify',changeId);
}

export async function handleAdmin(request, env, factories) {
  const json = (data,status=200) => Response.json(data,{status,headers:{'Cache-Control':'no-store'}});
  const expected = env.CONNECTOR_ADMIN_TOKEN;
  const supplied = request.headers.get('authorization')?.replace(/^Bearer /,'') ?? '';
  if (!expected || expected.length < 32 || Buffer.byteLength(supplied) !== Buffer.byteLength(expected) ||
      !timingSafeEqual(Buffer.from(supplied),Buffer.from(expected))) return json({error:'ADMIN_AUTH_REQUIRED'},401);
  if (request.method !== 'POST') return json({error:'METHOD_NOT_ALLOWED'},405);
  if (!env.DB || !env.FORPSI_TENANT_ID) return json({error:'ADMIN_NOT_CONFIGURED'},503);
  try {
    const reader = request.body?.getReader(); let size=0; const chunks=[];
    requireValue(reader,'INVALID_INPUT');
    for (;;) { const {value,done}=await reader.read(); if(done) break; size+=value.byteLength;
      if(size>16384) { await reader.cancel(); throw new ConnectorError('INVALID_INPUT'); } chunks.push(value); }
    const body = z.object({operation:z.enum(Object.keys(schemas)),payload:z.record(z.string(),z.unknown()),actorId:id}).strict()
      .parse(JSON.parse(Buffer.concat(chunks).toString('utf8')));
    return json(await executeAdmin(body.operation,body.payload,{...factories,env,store:new Store(env.DB),
      actorId:body.actorId,tenant:env.FORPSI_TENANT_ID}));
  } catch(error) {
    const code=error instanceof ConnectorError?error.code:error instanceof z.ZodError || error instanceof SyntaxError?'INVALID_INPUT':'ADMIN_UNAVAILABLE';
    return json({error:code},code==='INVALID_INPUT'?400:code==='MAILBOX_NOT_FOUND'?404:['VERSION_CONFLICT','MAILBOX_EXISTS'].includes(code)?409:503);
  }
}
