import { createHash } from 'node:crypto';
import { z } from 'zod';
import { id, message, reference } from './schemas.mjs';
import { requireValue, ConnectorError } from './errors.mjs';

export const profileSelection=z.object({id}).strict();
export const profileInput=profileSelection.extend({revision:z.number().int().min(0),
  senderName:z.string().trim().max(100).regex(/^[^\x00-\x1f\x7f]*$/),
  signatureText:z.string().max(4000).refine(s=>!/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/.test(s))}).strict();
const draftInput=z.object({mailboxId:id,requestId:z.string().uuid(),profileRevision:z.number().int().min(0),
  useSignature:z.boolean(),message}).strict();
const selected=z.object({mailboxId:id}).strict();
const draftReference=selected.extend({reference}).strict();
const replaceInput=draftReference.extend({requestId:z.string().uuid(),expectedEtag:z.string().regex(/^[a-f0-9]{64}$/),message}).strict();
export async function compositionProfile(store,mailboxId) {
  const row=await store.first('SELECT * FROM composition_profiles WHERE mailbox_id=?',mailboxId);
  return {senderName:row?.sender_name || '',signatureText:row?.signature_text || '',revision:row?.revision || 0};
}
export async function saveCompositionProfile(p,ctx) {
  const {store,tenant,actorId}=ctx;
  requireValue(await store.first('SELECT id FROM mailboxes WHERE id=? AND tenant_id=?',p.id,tenant),'MAILBOX_NOT_FOUND');
  const changeId=crypto.randomUUID(),now=Date.now();
  const result=await store.db.batch([
    store.db.prepare(`INSERT INTO composition_profiles SELECT ?,?,?,1,?,?,? WHERE ?=0
      ON CONFLICT(mailbox_id) DO NOTHING`).bind(p.id,p.senderName,p.signatureText,now,actorId,changeId,p.revision),
    store.db.prepare(`UPDATE composition_profiles SET sender_name=?,signature_text=?,revision=revision+1,
      updated_at=?,updated_by=?,change_id=? WHERE mailbox_id=? AND revision=? AND ?>0`)
      .bind(p.senderName,p.signatureText,now,actorId,changeId,p.id,p.revision,p.revision),
    store.db.prepare(`INSERT INTO audit SELECT ?,?,?,?,?,? WHERE EXISTS
      (SELECT 1 FROM composition_profiles WHERE mailbox_id=? AND change_id=?)`)
      .bind(crypto.randomUUID(),now,actorId,p.id,'admin.composition.save','saved',p.id,changeId)
  ]);
  requireValue(result[0].meta.changes+result[1].meta.changes===1,'VERSION_CONFLICT');
  // Return the exact committed version, even if another administrator saves next.
  return {profile:{senderName:p.senderName,signatureText:p.signatureText,revision:p.revision+1}};
}
export async function compositionContext(raw,{store,principal,env}) {
  const p=selected.parse(raw),mailbox=await store.access(principal,p.mailboxId,'read');
  let canWrite=false;
  try {await store.access(principal,p.mailboxId,'write');canWrite=true;}
  catch(error) {if(!(error instanceof ConnectorError) || error.code!=='ACCESS_DENIED')throw error;}
  return {address:mailbox.address,profile:await compositionProfile(store,p.mailboxId),
    canWrite,draftsEnabled:env.SOAI_DRAFTS_ENABLED==='true',
    draftEditsEnabled:env.SOAI_DRAFT_EDITS_ENABLED==='true',
    draftCopiesEnabled:env.SOAI_DRAFT_COPIES_ENABLED==='true'};
}
export async function createSoaiDraft(raw,ctx) {
  const p=draftInput.parse(raw),{store,principal,env,providerFactory}=ctx;
  requireValue(env.SOAI_DRAFTS_ENABLED==='true','SOAI_DRAFTS_DISABLED');
  await store.access(principal,p.mailboxId,'read');
  const mailbox=await store.access(principal,p.mailboxId,'write');
  const hash=createHash('sha256').update(JSON.stringify(p)).digest('hex');
  const previous=()=>store.first(`SELECT * FROM draft_attempts WHERE mailbox_id=? AND principal_id=? AND request_id=?`,p.mailboxId,principal.id,p.requestId);
  const replay=row=>{
    requireValue(row.payload_hash===hash,'DRAFT_REQUEST_CONFLICT');
    requireValue(row.state==='saved','DRAFT_UNCERTAIN');
    return {...JSON.parse(row.result_json),replayed:true};
  };
  const existing=await previous();if(existing)return replay(existing);
  const profile=await compositionProfile(store,p.mailboxId);
  requireValue(profile.revision===p.profileRevision,'PROFILE_CHANGED');
  const text=p.message.text+(p.useSignature&&profile.signatureText?`\n\n-- \n${profile.signatureText}`:'');
  requireValue(text.length<=100000,'INVALID_ARGUMENTS');
  const now=Date.now();
  const claim=await store.run(`INSERT INTO draft_attempts VALUES (?,?,?,?,'pending',NULL,?,?)
    ON CONFLICT(mailbox_id,principal_id,request_id) DO NOTHING`,p.mailboxId,principal.id,p.requestId,hash,now,now);
  if(claim.meta.changes!==1)return replay(await previous());
  // A durable reservation is never automatically retried after an ambiguous provider result.
  // Recheck access and configuration immediately before the one provider invocation.
  try {
    await store.access(principal,p.mailboxId,'read');
    await store.access(principal,p.mailboxId,'write');
    requireValue((await compositionProfile(store,p.mailboxId)).revision===p.profileRevision,'PROFILE_CHANGED');
    const result=await providerFactory(env,mailbox).saveDraft({...p.message,text},{senderName:profile.senderName,requestId:p.requestId});
    requireValue(result?.saved===true,'DRAFT_SAVE_FAILED');
    const data={saved:true,folder:result.folder,reference:result.reference ?? null};
    await store.db.batch([
      store.db.prepare(`UPDATE draft_attempts SET state='saved',result_json=?,updated_at=? WHERE mailbox_id=? AND principal_id=? AND request_id=?`)
        .bind(JSON.stringify(data),Date.now(),p.mailboxId,principal.id,p.requestId),
      store.db.prepare('INSERT INTO audit VALUES (?,?,?,?,?,?)').bind(crypto.randomUUID(),Date.now(),principal.id,p.mailboxId,'soai.create_draft','saved')
    ]);
    return data;
  } catch {
    await store.db.batch([
      store.db.prepare(`UPDATE draft_attempts SET state='uncertain',updated_at=? WHERE mailbox_id=? AND principal_id=? AND request_id=? AND state='pending'`)
        .bind(Date.now(),p.mailboxId,principal.id,p.requestId),
      store.db.prepare('INSERT INTO audit VALUES (?,?,?,?,?,?)').bind(crypto.randomUUID(),Date.now(),principal.id,p.mailboxId,'soai.create_draft','uncertain')
    ]);
    throw new ConnectorError('DRAFT_UNCERTAIN');
  }
}
export async function openSoaiDraft(raw,{store,principal,env,providerFactory}) {
  const p=draftReference.parse(raw);
  requireValue(env.SOAI_DRAFT_EDITS_ENABLED==='true'||(env.SOAI_DRAFT_COPIES_ENABLED==='true'&&env.SOAI_DRAFTS_ENABLED==='true'),'DRAFT_EDITS_DISABLED');
  const mailbox=await store.access(principal,p.mailboxId,'read');
  const data=await providerFactory(env,mailbox).readEditableDraft(p.reference);
  requireValue(message.safeParse(data.message).success,'DRAFT_FORMAT_UNSUPPORTED');
  await store.access(principal,p.mailboxId,'read');
  return data;
}
export async function copySoaiDraft(raw,{store,principal,env,providerFactory}) {
  const p=replaceInput.parse(raw);
  requireValue(env.SOAI_DRAFTS_ENABLED==='true','SOAI_DRAFTS_DISABLED');
  requireValue(env.SOAI_DRAFT_COPIES_ENABLED==='true','DRAFT_COPIES_DISABLED');
  await store.access(principal,p.mailboxId,'read');
  const mailbox=await store.access(principal,p.mailboxId,'write');
  const hash=createHash('sha256').update(JSON.stringify(p)).digest('hex');
  const previous=()=>store.first('SELECT * FROM draft_attempts WHERE mailbox_id=? AND principal_id=? AND request_id=?',p.mailboxId,principal.id,p.requestId);
  const replay=row=>{
    requireValue(row.payload_hash===hash,'DRAFT_REQUEST_CONFLICT');
    requireValue(row.state==='saved','DRAFT_UNCERTAIN');
    return {...JSON.parse(row.result_json),replayed:true};
  };
  const existing=await previous();if(existing)return replay(existing);
  const now=Date.now();
  const claim=await store.run("INSERT INTO draft_attempts VALUES (?,?,?,?,'pending',NULL,?,?) ON CONFLICT(mailbox_id,principal_id,request_id) DO NOTHING",
    p.mailboxId,principal.id,p.requestId,hash,now,now);
  if(claim.meta.changes!==1)return replay(await previous());
  try {
    await store.access(principal,p.mailboxId,'read');
    await store.access(principal,p.mailboxId,'write');
    const result=await providerFactory(env,mailbox).copyDraft(p.reference,p.expectedEtag,p.message,{requestId:p.requestId});
    requireValue(result?.saved===true && result?.sourceRetained===true,'DRAFT_COPY_UNCERTAIN');
    const data={saved:true,folder:result.folder,reference:result.reference??null,
      verified:result.verified===true,sourceRetained:true};
    await store.db.batch([
      store.db.prepare("UPDATE draft_attempts SET state='saved',result_json=?,updated_at=? WHERE mailbox_id=? AND principal_id=? AND request_id=?")
        .bind(JSON.stringify(data),Date.now(),p.mailboxId,principal.id,p.requestId),
      store.db.prepare('INSERT INTO audit VALUES (?,?,?,?,?,?)').bind(crypto.randomUUID(),Date.now(),principal.id,p.mailboxId,'soai.copy_draft','saved')
    ]);
    return data;
  } catch(error) {
    // A refusal before APPEND can be retried only with a new request after
    // refreshing the source. An uncertain APPEND is never repeated.
    const definitive=error instanceof ConnectorError && ['ACCESS_DENIED','DRAFT_CHANGED','NOT_DRAFT_FOLDER','NOT_EDITABLE_DRAFT',
      'DRAFT_FORMAT_UNSUPPORTED','DRAFT_SENDER_UNSUPPORTED','MESSAGE_NOT_FOUND','MESSAGE_TOO_LARGE','STALE_MESSAGE_REFERENCE'].includes(error.code);
    await store.db.batch([
      store.db.prepare("UPDATE draft_attempts SET state='uncertain',updated_at=? WHERE mailbox_id=? AND principal_id=? AND request_id=? AND state='pending'")
        .bind(Date.now(),p.mailboxId,principal.id,p.requestId),
      store.db.prepare('INSERT INTO audit VALUES (?,?,?,?,?,?)').bind(crypto.randomUUID(),Date.now(),principal.id,p.mailboxId,'soai.copy_draft',definitive?'rejected':'uncertain')
    ]);
    if(definitive)throw error;
    throw new ConnectorError('DRAFT_UNCERTAIN');
  }
}
export async function replaceSoaiDraft(raw,{store,principal,env,providerFactory}) {
  const p=replaceInput.parse(raw);
  requireValue(env.SOAI_DRAFT_EDITS_ENABLED==='true','DRAFT_EDITS_DISABLED');
  await store.access(principal,p.mailboxId,'read');
  const mailbox=await store.access(principal,p.mailboxId,'write');
  const hash=createHash('sha256').update(JSON.stringify(p)).digest('hex');
  const previous=()=>store.first('SELECT * FROM draft_attempts WHERE mailbox_id=? AND principal_id=? AND request_id=?',p.mailboxId,principal.id,p.requestId);
  const replay=row=>{
    requireValue(row.payload_hash===hash,'DRAFT_REQUEST_CONFLICT');
    requireValue(row.state==='saved','DRAFT_UNCERTAIN');
    return {...JSON.parse(row.result_json),replayed:true};
  };
  const existing=await previous();if(existing)return replay(existing);
  const now=Date.now();
  const claim=await store.run("INSERT INTO draft_attempts VALUES (?,?,?,?,'pending',NULL,?,?) ON CONFLICT(mailbox_id,principal_id,request_id) DO NOTHING",
    p.mailboxId,principal.id,p.requestId,hash,now,now);
  if(claim.meta.changes!==1)return replay(await previous());
  try {
    await store.access(principal,p.mailboxId,'read');
    await store.access(principal,p.mailboxId,'write');
    const provider=providerFactory(env,mailbox);
    const current=await provider.readEditableDraft(p.reference);
    requireValue(current.canReplace,'SAFE_REPLACE_UNSUPPORTED');
    requireValue(current.etag===p.expectedEtag,'DRAFT_CHANGED');
    const result=await provider.replaceDraft(p.reference,p.expectedEtag,p.message,{senderName:current.senderName,requestId:p.requestId});
    requireValue(result?.saved===true && result.reference,'DRAFT_REPLACE_UNCERTAIN');
    const data={saved:true,folder:result.folder,reference:result.reference};
    await store.db.batch([
      store.db.prepare("UPDATE draft_attempts SET state='saved',result_json=?,updated_at=? WHERE mailbox_id=? AND principal_id=? AND request_id=?")
        .bind(JSON.stringify(data),Date.now(),p.mailboxId,principal.id,p.requestId),
      store.db.prepare('INSERT INTO audit VALUES (?,?,?,?,?,?)').bind(crypto.randomUUID(),Date.now(),principal.id,p.mailboxId,'soai.replace_draft','saved')
    ]);
    return data;
  } catch(error) {
    // Before UID REPLACE, a definitive validation failure is safe to retry as a
    // fresh attempt after refresh. Once the provider call starts, never repeat.
    const definitive=error instanceof ConnectorError && ['ACCESS_DENIED','SAFE_REPLACE_UNSUPPORTED','DRAFT_CHANGED','NOT_DRAFT_FOLDER','NOT_EDITABLE_DRAFT','DRAFT_FORMAT_UNSUPPORTED','DRAFT_SENDER_UNSUPPORTED','MESSAGE_NOT_FOUND','MESSAGE_TOO_LARGE','STALE_MESSAGE_REFERENCE'].includes(error.code);
    await store.db.batch([
      store.db.prepare("UPDATE draft_attempts SET state='uncertain',updated_at=? WHERE mailbox_id=? AND principal_id=? AND request_id=? AND state='pending'")
        .bind(Date.now(),p.mailboxId,principal.id,p.requestId),
      store.db.prepare('INSERT INTO audit VALUES (?,?,?,?,?,?)').bind(crypto.randomUUID(),Date.now(),principal.id,p.mailboxId,'soai.replace_draft',definitive?'rejected':'uncertain')
    ]);
    if(definitive)throw error;
    throw new ConnectorError('DRAFT_UNCERTAIN');
  }
}
