import { timingSafeEqual } from 'node:crypto';
import { z } from 'zod';
import { Store } from './store.mjs';
import { seal } from './crypto.mjs';
import { credentialContext } from './credentials.mjs';
import { capabilities } from './capabilities.mjs';
import { requireValue, ConnectorError } from './errors.mjs';
import { providerDiagnostic } from './diagnostics.mjs';
import { readResources, validateFolderChange } from './admin-resources.mjs';
import { listAccess, saveAccess, SOAI_ISSUER } from './admin-access.mjs';
import { profileSelection, profileInput, compositionProfile, saveCompositionProfile } from './composition.mjs';
import { ACTIONS } from './access-policy.mjs';

const id = z.string().min(1).max(128).regex(/^[a-zA-Z0-9_-]+$/);
const revision = z.number().int().positive();
const folder = z.string().max(500).refine(s => !/[\x00-\x1f]/.test(s)).nullable().default(null);
const save = z.object({ id: id.optional(), requestId: z.string().uuid(), revision: revision.optional(),
  address: z.email().max(254).transform(s => s.toLowerCase()), displayName: z.string().trim().min(1).max(100),
  draftsFolder: folder, sentFolder: folder, trashFolder: folder,
  password: z.string().min(1).max(1024).optional() }).strict();
const selection = z.object({ id, revision }).strict();
const diagnosticSelection=z.object({mailboxId:id,
  folder:z.string().min(1).max(500).refine(s=>!/[\x00-\x1f]/.test(s)),
  uid:z.number().int().min(1).max(4294967295),
  uidValidity:z.string().regex(/^\d{1,20}$/)}).strict();
const diagnosticErrorCodes=new Set(['MESSAGE_NOT_FOUND','STALE_MESSAGE_REFERENCE',
  'SOURCE_REFERENCE_MISMATCH','SOURCE_CHANGED_DURING_READ','MESSAGE_TOO_LARGE',
  'MIME_STRUCTURE_INVALID','MIME_TEXT_UNAVAILABLE','MIME_PART_UNAVAILABLE',
  'MIME_PART_MISMATCH','MIME_PART_INCOMPLETE','MIME_TEXT_UNREADABLE',
  'MIME_HEADERS_TOO_LARGE','DIAGNOSTIC_REQUIRES_SELECTIVE_MIME']);
const diagnosticError=error=>{
  const code=error?.code??error?.message;
  return diagnosticErrorCodes.has(code)?code:'PROVIDER_UNAVAILABLE';
};
const schemas = { overview: z.object({}).strict(), save,
  brain_rule_save:z.object({ruleId:z.string().uuid().optional(),version:revision.optional(),
    mailboxId:id.optional(),category:z.string().min(1).max(80),senderAddress:z.email().optional(),
    action:z.enum(['prioritize','deprioritize','assign','forward']),
    destination:z.string().max(254).optional(),enabled:z.boolean()}).strict(),
  composition_get: profileSelection, composition_save: profileInput,
  access_list: z.object({id}).strict(),
  access_save: selection.extend({userId:id,actions:z.array(z.enum(ACTIONS)).max(5)
    .refine(a=>new Set(a).size===a.length && (!a.includes('schedule') || a.includes('send')))}).strict(),
  verify: selection, resources: z.union([selection,diagnosticSelection]),
  set_active: selection.extend({ active: z.boolean() }) };
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
    const brainRules=env.MAIL_BRAIN_ENABLED==='true'?await store.rows(`SELECT id,mailbox_id,source,
      category,sender_address,action,destination,enabled,version FROM brain_rules
      WHERE tenant_id=? AND source='company' ORDER BY created_at,id LIMIT 201`,tenant):[];
    return { mailboxes: mailboxes.map(publicMailbox), grants: grants.slice(0,500), audit, queue,
      rules: rules.slice(0,200), labels: labels.slice(0,200),
      brainRules:brainRules.slice(0,200),brainEnabled:env.MAIL_BRAIN_ENABLED==='true',
      brainPilotReadOnly:env.MAIL_BRAIN_PILOT_READ_ONLY==='true',
      brainDiagnosticEnabled:env.MAIL_BRAIN_DIAGNOSTIC_ENABLED==='true'&&
        env.MAIL_BRAIN_PILOT_READ_ONLY==='true'&&
        env.MAIL_BRAIN_PILOT_MAILBOX_ID==='mail_d4cfaf87-2357-4586-97a3-b9ec1782af8f'&&
        env.MAIL_BRAIN_DIAG_TARGET_FOLDER==='INBOX.Sent Items'&&
        env.MAIL_BRAIN_DIAG_TARGET_UID==='74324'&&
        env.MAIL_BRAIN_DIAG_TARGET_UIDVALIDITY==='1381849700',
      truncated: { grants:grants.length>500, rules:rules.length>200, labels:labels.length>200 },
      capabilities: capabilities(), connectorEnabled: env.CONNECTOR_ENABLED === 'true',
      soaiMailEnabled: env.SOAI_MAIL_ENABLED === 'true',
      soaiDraftsEnabled: env.SOAI_DRAFTS_ENABLED === 'true',
      credentialStorageReady: Boolean(env.CREDENTIALS_KEY), oauthConfigured: Boolean(env.OAUTH_ISSUER && env.OAUTH_JWKS_URL && env.MCP_RESOURCE),
      verificationMode: ctx.verificationMode ?? 'provider', checkedAt: Date.now() };
  }
  // The existing authenticated admin resources route carries this one-message
  // read-only diagnostic without adding a public endpoint or MCP tool.
  if(operation==='resources'&&'mailboxId' in p){
    requireValue(env.MAIL_BRAIN_DIAGNOSTIC_ENABLED==='true'&&
      env.MAIL_BRAIN_PILOT_READ_ONLY==='true','DIAGNOSTIC_DISABLED');
    requireValue(p.mailboxId===env.MAIL_BRAIN_PILOT_MAILBOX_ID&&
      p.folder===env.MAIL_BRAIN_DIAG_TARGET_FOLDER&&
      String(p.uid)===env.MAIL_BRAIN_DIAG_TARGET_UID&&
      p.uidValidity===env.MAIL_BRAIN_DIAG_TARGET_UIDVALIDITY,
    'DIAGNOSTIC_TARGET_DENIED');
    const m=await mailbox(store,tenant,p.mailboxId);
    requireValue(m.active===1&&m.sent_folder===p.folder,'ACCESS_DENIED');
    const identity=await store.identity(SOAI_ISSUER,actorId);
    requireValue(identity?.tenant_id===tenant,'ACCESS_DENIED');
    const principal={id:identity.id,scopes:['forpsi:read']};
    const permitted=async()=>{
      await store.access(principal,m.id,'read');
      const consent=await store.first(`SELECT 1 FROM brain_consents WHERE tenant_id=?
        AND principal_id=? AND mailbox_id=? AND sent_folder=? AND revoked_at IS NULL`,
      tenant,identity.id,m.id,p.folder);
      requireValue(consent,'BRAIN_CONSENT_REQUIRED');
    };
    await permitted();
    const provider=providerFactory(env,m);
    requireValue(typeof provider.readForBrain==='function','DIAGNOSTIC_READER_UNAVAILABLE');
    const metrics={};let readError=null;
    try{await provider.readForBrain({folder:p.folder,uid:p.uid,
      uidValidity:p.uidValidity},metrics);}
    catch(error){readError=diagnosticError(error);}
    await permitted();
    const clean=value=>typeof value==='string'?value.replace(/[\x00-\x1f\x7f]/g,' ').slice(0,500):null;
    return {success:readError===null,errorCode:readError,
      subject:clean(metrics.subject),messageId:clean(metrics.messageId),
      rawMessageSize:metrics.rawMessageSize??null,
      textPartsFound:metrics.textPartsFound??0,
      downloadedTextParts:metrics.downloadedTextParts??0,
      downloadedBytes:metrics.downloadedBytes??0,
      textSource:metrics.textSource??null,
      attachments:(metrics.attachments??[]).map(a=>({filename:clean(a.filename),
        contentType:clean(a.contentType),size:a.size??null})),
      downloadedBinaryAttachments:metrics.downloadedBinaryAttachments??0};
  }
  if(operation==='brain_rule_save'){
    requireValue(env.MAIL_BRAIN_ENABLED==='true','MAIL_BRAIN_DISABLED');
    requireValue(env.MAIL_BRAIN_PILOT_READ_ONLY!=='true','BRAIN_PILOT_READ_ONLY');
    requireValue(!p.ruleId||p.version,'INVALID_INPUT');
    requireValue(!['assign','forward'].includes(p.action)||!!p.destination,
      'RULE_DESTINATION_REQUIRED');
    requireValue(!p.enabled||p.action!=='forward','RULE_FORWARD_NOT_READY');
    if(p.action==='forward')requireValue(z.email().safeParse(p.destination).success,
      'INVALID_RULE_DESTINATION');
    if(p.mailboxId)await mailbox(store,tenant,p.mailboxId);
    if(p.action==='assign'){
      requireValue(id.safeParse(p.destination).success,'INVALID_RULE_DESTINATION');
      const target=await store.first('SELECT id FROM principals WHERE id=? AND tenant_id=? AND active=1',
        p.destination,tenant);
      requireValue(target,'OWNER_NOT_FOUND');
      if(p.mailboxId)await store.access({id:p.destination,scopes:['forpsi:read']},
        p.mailboxId,'read');
    }
    const now=Date.now(),ruleId=p.ruleId??crypto.randomUUID();
    if(p.ruleId){const prior=await store.first(`SELECT id FROM brain_rules WHERE id=? AND tenant_id=?
      AND source='company' AND version=?`,ruleId,tenant,p.version);
      requireValue(prior,'RULE_VERSION_CONFLICT');
      const changed=await store.first(`UPDATE brain_rules SET mailbox_id=?,category=?,
        sender_address=?,action=?,destination=?,enabled=?,approved_at=?,version=version+1,
        updated_at=? WHERE id=? AND tenant_id=? AND source='company' AND version=?
        RETURNING version`,p.mailboxId??null,p.category,p.senderAddress?.toLowerCase()??null,
      p.action,p.destination??null,+p.enabled,p.enabled?now:null,now,ruleId,tenant,p.version);
      requireValue(changed,'RULE_VERSION_CONFLICT');
    }else await store.run(`INSERT INTO brain_rules
      (id,tenant_id,mailbox_id,source,category,sender_address,action,destination,enabled,
        approved_at,created_at,updated_at) VALUES (?,?,?,'company',?,?,?,?,?,?,?,?)`,ruleId,
      tenant,p.mailboxId??null,p.category,p.senderAddress?.toLowerCase()??null,p.action,
      p.destination??null,+p.enabled,p.enabled?now:null,now,now);
    await store.audit({id:actorId},p.mailboxId??null,'brain.company_rule.save','completed');
    return {ruleId,enabled:p.enabled};
  }
  if (operation === 'save') {
    requireValue(!p.id || p.revision, 'INVALID_INPUT');
    const m = p.id ? await mailbox(store, tenant, p.id) : { id: `mail_${p.requestId}`, tenant_id: tenant, address: p.address };
    requireValue(!p.id || (m.revision === p.revision && m.address === p.address), 'VERSION_CONFLICT');
    if (!p.id) requireValue(!(await store.first('SELECT id FROM mailboxes WHERE tenant_id=? AND address=? COLLATE NOCASE',tenant,p.address)), 'MAILBOX_EXISTS');
    await validateFolderChange(m,p,ctx);
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
  if(operation==='composition_get')return {profile:await compositionProfile(store,m.id),address:m.address};
  if(operation==='composition_save')return saveCompositionProfile(p,ctx);
  const publicView=async()=>publicMailbox(await store.first(`SELECT ${publicColumns} FROM mailboxes m WHERE m.id=? AND m.tenant_id=?`,m.id,tenant));
  if (operation === 'access_list') return {access:await listAccess(m,ctx),mailbox:await publicView()};
  requireValue(m.revision === p.revision, 'VERSION_CONFLICT');
  if (operation === 'access_save') return {...await saveAccess(m,p,ctx),mailbox:await publicView()};
  if (operation === 'resources') {
    const resources = await readResources(m,ctx);
    requireValue((await mailbox(store,tenant,m.id)).revision === m.revision, 'VERSION_CONFLICT');
    return { resources };
  }
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
  const check = async (key, fn) => {
    try { const result=await fn(); outcome[key]=result==='empty'?'empty':'verified'; }
    catch (error) { (outcome.diagnostics ??= {})[key] = providerDiagnostic(error); }
  };
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
    return json({error:code},code==='INVALID_INPUT'?400:code==='ACCESS_DENIED'?403:['MAILBOX_NOT_FOUND','PRINCIPAL_NOT_FOUND'].includes(code)?404:['VERSION_CONFLICT','MAILBOX_EXISTS','PRINCIPAL_DISABLED'].includes(code)?409:503);
  }
}
