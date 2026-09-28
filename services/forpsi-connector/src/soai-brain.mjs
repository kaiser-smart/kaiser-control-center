import { timingSafeEqual } from 'node:crypto';
import { z } from 'zod';
import { Store } from './store.mjs';
import { SOAI_ISSUER } from './admin-access.mjs';
import { MailBrain, brainSchemas } from './mail-brain.mjs';
import { safeError, requireValue } from './errors.mjs';
import { id } from './schemas.mjs';

const input=z.discriminatedUnion('operation',[
  z.object({operation:z.literal('consent'),actorId:id,payload:z.object({mailboxId:id,
    lookbackDays:z.number().int().min(1).max(90).default(90)}).strict()}).strict(),
  z.object({operation:z.literal('revoke'),actorId:id,payload:z.object({mailboxId:id}).strict()}).strict(),
  z.object({operation:z.literal('sync'),actorId:id,payload:brainSchemas.sync}).strict(),
  z.object({operation:z.literal('rules'),actorId:id,payload:brainSchemas.rule}).strict(),
  z.object({operation:z.literal('rule_activate'),actorId:id,payload:z.object({mailboxId:id,
    ruleId:z.string().uuid(),version:z.number().int().positive()}).strict()}).strict(),
  z.object({operation:z.literal('draft_create'),actorId:id,payload:brainSchemas.draft}).strict(),
  z.object({operation:z.literal('message_send'),actorId:id,payload:brainSchemas.send}).strict(),
  z.object({operation:z.literal('attachment_get'),actorId:id,payload:brainSchemas.attachment}).strict(),
  ...[['attention',brainSchemas.attention],['case_get',brainSchemas.getCase],
    ['search',brainSchemas.search],['case_action',brainSchemas.action]].map(([operation,payload])=>
      z.object({operation:z.literal(operation),actorId:id,payload}).strict()),
]);

export async function handleSoaiBrain(request,env,{providerFactory}) {
  const json=(data,status=200)=>Response.json(data,{status,headers:{'Cache-Control':'no-store',
    'X-Content-Type-Options':'nosniff'}});
  const token=env.CONNECTOR_ADMIN_TOKEN,supplied=request.headers.get('authorization')?.replace(/^Bearer /,'')??'';
  if(!token||token.length<32||Buffer.byteLength(supplied)!==Buffer.byteLength(token)||
    !timingSafeEqual(Buffer.from(supplied),Buffer.from(token)))return json({error:'ACCESS_DENIED'},401);
  if(request.method!=='POST')return json({error:'METHOD_NOT_ALLOWED'},405);
  if(env.MAIL_BRAIN_ENABLED!=='true'||!env.DB||!env.FORPSI_TENANT_ID)return json({error:'MAIL_BRAIN_DISABLED'},503);
  try {
    const reader=request.body?.getReader();requireValue(reader,'INVALID_ARGUMENTS');
    const parts=[];let size=0;
    for(;;){const {value,done}=await reader.read();if(done)break;size+=value.byteLength;
      if(size>32768){await reader.cancel();return json({error:'INVALID_ARGUMENTS'},413);}parts.push(value);}
    const command=input.parse(JSON.parse(Buffer.concat(parts).toString('utf8')));
    const store=new Store(env.DB),identity=await store.identity(SOAI_ISSUER,command.actorId);
    requireValue(identity?.tenant_id===env.FORPSI_TENANT_ID,'ACCESS_DENIED');
    const principal={id:identity.id,scopes:['forpsi:read','forpsi:write','forpsi:send']};
    const brain=new MailBrain({store,principal,providerFactory,env});
    const data=await ({consent:()=>brain.consent(command.payload),revoke:()=>brain.revoke(command.payload),
      sync:()=>brain.sync(command.payload),attention:()=>brain.attention(command.payload),
      rules:()=>brain.rules(command.payload),
      rule_activate:()=>brain.activateRule(command.payload,'soai_session'),
      draft_create:()=>brain.createDraft(command.payload),
      message_send:()=>brain.sendDraft(command.payload),
      attachment_get:()=>brain.getAttachment(command.payload),
      case_get:()=>brain.getCase(command.payload),search:()=>brain.search(command.payload),
      case_action:()=>brain.action(command.payload,'soai_session')})[command.operation]();
    if(command.payload.mailboxId)await store.access(principal,command.payload.mailboxId,'read');
    return json({data});
  }catch(error){const code=error instanceof z.ZodError||error instanceof SyntaxError?
      'INVALID_ARGUMENTS':safeError(error);
    return json({error:code},code==='INVALID_ARGUMENTS'?400:code==='ACCESS_DENIED'?403:
      ['CASE_NOT_FOUND'].includes(code)?404:
      ['CASE_VERSION_CONFLICT'].includes(code)?409:503);
  }
}
