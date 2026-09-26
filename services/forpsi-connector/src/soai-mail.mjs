import { compositionContext, createSoaiDraft, openSoaiDraft, copySoaiDraft, replaceSoaiDraft } from './composition.mjs';
import { timingSafeEqual } from 'node:crypto';
import { z } from 'zod';
import { id } from './schemas.mjs';
import { Store } from './store.mjs';
import { SOAI_ISSUER } from './admin-access.mjs';
import { Organizer } from './organize.mjs';
import { executeTool } from './mcp.mjs';
import { requireValue, safeError } from './errors.mjs';

const input=z.object({actorId:id,operation:z.enum(['list_mailboxes','list_folders','search_messages','read_message','composition_context','create_draft','open_draft','copy_draft','replace_draft']),payload:z.record(z.string(),z.unknown())}).strict();
export async function handleSoaiMail(request,env,factories) {
  const json=(data,status=200)=>Response.json(data,{status,headers:{'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}});
  const token=env.CONNECTOR_ADMIN_TOKEN, supplied=request.headers.get('authorization')?.replace(/^Bearer /,'') || '';
  if(!token || token.length<32 || Buffer.byteLength(supplied)!==Buffer.byteLength(token) || !timingSafeEqual(Buffer.from(supplied),Buffer.from(token)))return json({error:'ACCESS_DENIED'},401);
  if(request.method!=='POST')return json({error:'TOOL_NOT_ALLOWED'},405);
  if(env.SOAI_MAIL_ENABLED!=='true')return json({error:'SOAI_MAIL_DISABLED'},503);
  if(!env.DB || !env.FORPSI_TENANT_ID)return json({error:'MAIL_NOT_CONFIGURED'},503);
  try {
    const reader=request.body?.getReader();requireValue(reader,'INVALID_ARGUMENTS');const parts=[];let size=0;
    for(;;){const {value,done}=await reader.read();if(done)break;size+=value.byteLength;if(size>524288){await reader.cancel();return json({error:'INVALID_ARGUMENTS'},413);}parts.push(value);}
    const body=input.parse(JSON.parse(Buffer.concat(parts).toString('utf8')));
    const store=new Store(env.DB);
    const identity=await store.identity(SOAI_ISSUER,body.actorId);
    if(!identity && body.operation==='list_mailboxes') {requireValue(Object.keys(body.payload).length===0,'INVALID_ARGUMENTS');return json({data:{mailboxes:[]},mode:factories.verificationMode});}
    requireValue(identity?.tenant_id===env.FORPSI_TENANT_ID,'ACCESS_DENIED');
    const principal={id:identity.id,scopes:['forpsi:read','forpsi:write']};
    const ctx={...factories,env,store,principal,organizer:new Organizer(store)};
    const data=body.operation==='composition_context'?await compositionContext(body.payload,ctx):
      body.operation==='create_draft'?await createSoaiDraft(body.payload,ctx):
      body.operation==='open_draft'?await openSoaiDraft(body.payload,ctx):
      body.operation==='copy_draft'?await copySoaiDraft(body.payload,ctx):
      body.operation==='replace_draft'?await replaceSoaiDraft(body.payload,ctx):await executeTool(body.operation,body.payload,ctx);
    if(body.operation==='list_folders'){
      data.draftEditsEnabled=env.SOAI_DRAFT_EDITS_ENABLED==='true';
      data.draftCopiesEnabled=env.SOAI_DRAFT_COPIES_ENABLED==='true'&&env.SOAI_DRAFTS_ENABLED==='true';
      try {await store.access(principal,body.payload.mailboxId,'write');data.draftWriteAllowed=true;}
      catch(error){if(error?.code!=='ACCESS_DENIED')throw error;data.draftWriteAllowed=false;}
    }
    requireValue((data.mailboxes?.length ?? 0)<=200 && (data.folders?.length ?? 0)<=500,'MAIL_LIMIT_EXCEEDED');
    // A revoked grant or paused mailbox cannot release in-flight content to the caller.
    if(body.payload.mailboxId) {await store.access(principal,body.payload.mailboxId,'read');if(['create_draft','copy_draft','replace_draft'].includes(body.operation))await store.access(principal,body.payload.mailboxId,'write');}
    if(body.operation==='list_mailboxes'){data.mailboxes=await store.mailboxes(principal);requireValue(data.mailboxes.length<=200,'MAIL_LIMIT_EXCEEDED');}
    return json({data,mode:factories.verificationMode});
  } catch(error) {
    const code=error instanceof z.ZodError || error instanceof SyntaxError?'INVALID_ARGUMENTS':safeError(error);
    return json({error:code},code==='INVALID_ARGUMENTS'?400:code==='ACCESS_DENIED'?403:
      ['STALE_MESSAGE_REFERENCE','PROFILE_CHANGED','DRAFT_REQUEST_CONFLICT','DRAFT_UNCERTAIN','DRAFT_CHANGED','SAFE_REPLACE_UNSUPPORTED','NOT_DRAFT_FOLDER','NOT_EDITABLE_DRAFT','DRAFT_FORMAT_UNSUPPORTED','DRAFT_SENDER_UNSUPPORTED'].includes(code)?409:
      code==='MESSAGE_NOT_FOUND'?404:code==='MESSAGE_TOO_LARGE'?413:503);
  }
}
