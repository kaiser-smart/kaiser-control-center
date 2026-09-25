import { timingSafeEqual } from 'node:crypto';
import { z } from 'zod';
import { id } from './schemas.mjs';
import { Store } from './store.mjs';
import { SOAI_ISSUER } from './admin-access.mjs';
import { Organizer } from './organize.mjs';
import { executeTool } from './mcp.mjs';
import { requireValue, safeError } from './errors.mjs';

const input=z.object({actorId:id,operation:z.enum(['list_mailboxes','list_folders','search_messages','read_message']),payload:z.record(z.string(),z.unknown())}).strict();
export async function handleSoaiMail(request,env,factories) {
  const json=(data,status=200)=>Response.json(data,{status,headers:{'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}});
  const token=env.CONNECTOR_ADMIN_TOKEN, supplied=request.headers.get('authorization')?.replace(/^Bearer /,'') || '';
  if(!token || token.length<32 || Buffer.byteLength(supplied)!==Buffer.byteLength(token) || !timingSafeEqual(Buffer.from(supplied),Buffer.from(token)))return json({error:'ACCESS_DENIED'},401);
  if(request.method!=='POST')return json({error:'TOOL_NOT_ALLOWED'},405);
  if(env.SOAI_MAIL_ENABLED!=='true')return json({error:'SOAI_MAIL_DISABLED'},503);
  if(!env.DB || !env.FORPSI_TENANT_ID)return json({error:'MAIL_NOT_CONFIGURED'},503);
  try {
    const reader=request.body?.getReader();requireValue(reader,'INVALID_ARGUMENTS');const parts=[];let size=0;
    for(;;){const {value,done}=await reader.read();if(done)break;size+=value.byteLength;if(size>16384){await reader.cancel();return json({error:'INVALID_ARGUMENTS'},413);}parts.push(value);}
    const body=input.parse(JSON.parse(Buffer.concat(parts).toString('utf8')));
    const store=new Store(env.DB);
    const identity=await store.identity(SOAI_ISSUER,body.actorId);
    if(!identity && body.operation==='list_mailboxes') {requireValue(Object.keys(body.payload).length===0,'INVALID_ARGUMENTS');return json({data:{mailboxes:[]},mode:factories.verificationMode});}
    requireValue(identity?.tenant_id===env.FORPSI_TENANT_ID,'ACCESS_DENIED');
    const principal={id:identity.id,scopes:['forpsi:read']};
    const data=await executeTool(body.operation,body.payload,{...factories,env,store,principal,organizer:new Organizer(store)});
    requireValue((data.mailboxes?.length ?? 0)<=200 && (data.folders?.length ?? 0)<=500,'MAIL_LIMIT_EXCEEDED');
    // A revoked grant or paused mailbox cannot release in-flight content to the caller.
    if(body.payload.mailboxId) await store.access(principal,body.payload.mailboxId,'read');
    if(body.operation==='list_mailboxes'){data.mailboxes=await store.mailboxes(principal);requireValue(data.mailboxes.length<=200,'MAIL_LIMIT_EXCEEDED');}
    return json({data,mode:factories.verificationMode});
  } catch(error) {
    const code=error instanceof z.ZodError || error instanceof SyntaxError?'INVALID_ARGUMENTS':safeError(error);
    return json({error:code},code==='INVALID_ARGUMENTS'?400:code==='ACCESS_DENIED'?403:code==='STALE_MESSAGE_REFERENCE'?409:code==='MESSAGE_NOT_FOUND'?404:code==='MESSAGE_TOO_LARGE'?413:503);
  }
}
