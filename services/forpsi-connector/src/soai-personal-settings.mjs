import { timingSafeEqual } from 'node:crypto';
import { z } from 'zod';
import { Store } from './store.mjs';
import { Shortcuts } from './shortcuts.mjs';
import { SOAI_ISSUER } from './admin-access.mjs';
import { requireValue, safeError } from './errors.mjs';

const actorId=z.string().min(1).max(128).regex(/^[a-zA-Z0-9_-]+$/);
const mailboxId=z.string().min(1).max(128);
const uuid=z.string().uuid();
const revision=z.number().int().min(0);
const plainText=max=>z.string().trim().min(1).max(max)
  .refine(value=>!/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/.test(value));
const input=z.discriminatedUnion('operation',[
  z.object({operation:z.literal('status'),actorId}).strict(),
  z.object({operation:z.literal('save_signature'),actorId,mailboxId,expectedRevision:revision,
    fullText:plainText(2000),shortText:plainText(1000)}).strict(),
  z.object({operation:z.literal('remove_signature'),actorId,mailboxId,
    expectedRevision:revision}).strict(),
  z.object({operation:z.literal('save_style'),actorId,mailboxId,expectedProfileVersion:revision,
    replyStyle:z.enum(['concise','friendly','formal'])}).strict(),
  z.object({operation:z.literal('approve_shortcut'),actorId,mailboxId,shortcutId:uuid,
    version:revision.min(1)}).strict(),
  z.object({operation:z.literal('remove_shortcut'),actorId,mailboxId,shortcutId:uuid,
    version:revision.min(1)}).strict(),
]);

function response(data,status=200){return Response.json(data,{status,headers:{
  'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}});}

async function view(store,principal,env){
  const mailboxes=await store.mailboxes(principal);
  return {mailboxes:await Promise.all(mailboxes.map(async mailbox=>{
    const signature=await store.first(`SELECT revision,full_text,short_text FROM workflow_signatures
      WHERE tenant_id=? AND principal_id=? AND mailbox_id=? AND sender_address=?`,
    env.FORPSI_TENANT_ID,principal.id,mailbox.id,mailbox.address);
    const profile=await store.first(`SELECT version,profile_json FROM workflow_profile_versions
      WHERE tenant_id=? AND principal_id=? AND mailbox_id=? AND active=1`,
    env.FORPSI_TENANT_ID,principal.id,mailbox.id);
    const saved=profile?JSON.parse(profile.profile_json):{};
    const shortcuts=await store.rows(`SELECT id,name,phrases_json,definition_json,approved,version FROM workflow_shortcuts
      WHERE tenant_id=? AND principal_id=? AND mailbox_id=? ORDER BY name`,
    env.FORPSI_TENANT_ID,principal.id,mailbox.id);
    return {id:mailbox.id,address:mailbox.address,
      signature:signature?{configured:true,revision:signature.revision,
        fullText:signature.full_text,shortText:signature.short_text}:
        {configured:false,revision:0,fullText:'',shortText:''},
      replyStyle:saved.replyStyle?.mode??null,profileVersion:profile?.version??0,
      syncMode:saved.synchronization?.mode==='interval'?'interval':'manual',
      shortcuts:shortcuts.map(item=>({id:item.id,name:item.name,phrases:JSON.parse(item.phrases_json),
        definition:JSON.parse(item.definition_json),approved:item.approved===1,version:item.version}))};
  })),chatgptNativeActionsEnabled:env.MCP_NATIVE_MUTATIONS_ENABLED!=='false'};
}

async function signature(store,principal,mailbox,command,env){
  const current=await store.first(`SELECT revision FROM workflow_signatures WHERE tenant_id=?
    AND principal_id=? AND mailbox_id=? AND sender_address=?`,mailbox.tenant_id,
  principal.id,mailbox.id,mailbox.address);
  requireValue((current?.revision??0)===command.expectedRevision,'SIGNATURE_VERSION_CONFLICT');
  if(command.operation==='remove_signature'){
    if(current){const removed=await store.first(`DELETE FROM workflow_signatures WHERE tenant_id=? AND principal_id=?
      AND mailbox_id=? AND sender_address=? AND revision=? RETURNING revision`,mailbox.tenant_id,
    principal.id,mailbox.id,mailbox.address,command.expectedRevision);
      requireValue(removed,'SIGNATURE_VERSION_CONFLICT');}
  }else if(current){
    const updated=await store.first(`UPDATE workflow_signatures SET full_text=?,short_text=?,
      revision=revision+1,approved_at=? WHERE tenant_id=? AND principal_id=? AND mailbox_id=?
      AND sender_address=? AND revision=? RETURNING revision`,command.fullText,command.shortText,
    Date.now(),mailbox.tenant_id,principal.id,mailbox.id,mailbox.address,command.expectedRevision);
    requireValue(updated,'SIGNATURE_VERSION_CONFLICT');
  }else{
    try{await store.run(`INSERT INTO workflow_signatures VALUES (?,?,?,?,?,?,?,?)`,
      mailbox.tenant_id,principal.id,mailbox.id,mailbox.address,command.fullText,
      command.shortText,1,Date.now());}
    catch{requireValue(false,'SIGNATURE_VERSION_CONFLICT');}
  }
  await store.audit(principal,mailbox.id,`settings.${command.operation}`,'completed');
  return view(store,principal,env);
}

async function style(store,principal,mailbox,command,env){
  const current=await store.first(`SELECT version,profile_json FROM workflow_profile_versions WHERE tenant_id=?
    AND principal_id=? AND mailbox_id=? AND active=1`,mailbox.tenant_id,principal.id,mailbox.id);
  requireValue((current?.version??0)===command.expectedProfileVersion,'PROFILE_VERSION_CONFLICT');
  const next={...(current?JSON.parse(current.profile_json):{}),replyStyle:{mode:command.replyStyle}};
  if(!next.synchronization)next.synchronization={mode:'manual'};
  const now=Date.now(),statements=[];
  if(current)statements.push(store.db.prepare(`UPDATE workflow_profile_versions SET active=0
    WHERE tenant_id=? AND principal_id=? AND mailbox_id=? AND version=? AND active=1`).bind(
    mailbox.tenant_id,principal.id,mailbox.id,current.version));
  statements.push(store.db.prepare(`INSERT INTO workflow_profile_versions
    (tenant_id,principal_id,mailbox_id,version,profile_json,approved_at,active) VALUES (?,?,?,?,?,?,1)`).bind(
    mailbox.tenant_id,principal.id,mailbox.id,command.expectedProfileVersion+1,JSON.stringify(next),now));
  try{await store.db.batch(statements);}catch{requireValue(false,'PROFILE_VERSION_CONFLICT');}
  await store.audit(principal,mailbox.id,'settings.save_style','completed');
  return view(store,principal,env);
}

export async function handleSoaiPersonalSettings(request,env){
  const expected=env.CONNECTOR_ADMIN_TOKEN,supplied=request.headers.get('authorization')?.replace(/^Bearer /,'')??'';
  if(!expected||expected.length<32||Buffer.byteLength(supplied)!==Buffer.byteLength(expected)||
    !timingSafeEqual(Buffer.from(supplied),Buffer.from(expected)))return response({error:'ACCESS_DENIED'},401);
  if(request.method!=='POST')return response({error:'METHOD_NOT_ALLOWED'},405);
  if(env.SOAI_MAIL_ENABLED!=='true'||!env.DB||!env.FORPSI_TENANT_ID)
    return response({error:'SETTINGS_UNAVAILABLE'},503);
  try{
    const raw=await request.text();requireValue(raw.length<=8192,'INVALID_ARGUMENTS');
    const command=input.parse(JSON.parse(raw));
    const store=new Store(env.DB),identity=await store.identity(SOAI_ISSUER,command.actorId);
    requireValue(identity?.tenant_id===env.FORPSI_TENANT_ID,'ACCESS_DENIED');
    const principal={id:identity.id,scopes:['forpsi:read']};
    if(command.operation==='status')return response({data:await view(store,principal,env)});
    const mailbox=await store.access(principal,command.mailboxId,'read');
    let data;
    if(command.operation==='approve_shortcut'||command.operation==='remove_shortcut'){
      const manager=new Shortcuts({store,principal,env,approvalSource:'soai_session'});
      if(command.operation==='approve_shortcut')await manager.approve({...command,approved:true});
      else await manager.remove(command);
      await store.audit(principal,mailbox.id,`settings.${command.operation}`,'completed');
      data=await view(store,principal,env);
    }else data=command.operation==='save_style'?await style(store,principal,mailbox,command,env):
      await signature(store,principal,mailbox,command,env);
    return response({data});
  }catch(error){
    const code=error instanceof z.ZodError||error instanceof SyntaxError?'INVALID_ARGUMENTS':safeError(error);
    return response({error:code},code==='INVALID_ARGUMENTS'?400:code==='ACCESS_DENIED'?403:
      code.endsWith('VERSION_CONFLICT')?409:503);
  }
}
