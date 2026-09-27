import { timingSafeEqual } from 'node:crypto';
import { z } from 'zod';
import { Store } from './store.mjs';
import { SOAI_ISSUER } from './admin-access.mjs';
import { Outbox } from './outbox.mjs';
import { SendApproval } from './send-approval.mjs';
import { requireValue, safeError } from './errors.mjs';

const input=z.discriminatedUnion('operation',[
  z.object({operation:z.literal('status'),actorId:z.string().regex(/^[a-zA-Z0-9_-]{1,128}$/),
    proposalId:z.string().uuid()}).strict(),
  z.object({operation:z.literal('approve'),actorId:z.string().regex(/^[a-zA-Z0-9_-]{1,128}$/),
    proposalId:z.string().uuid(),version:z.number().int().positive()}).strict(),
  z.object({operation:z.literal('cancel'),actorId:z.string().regex(/^[a-zA-Z0-9_-]{1,128}$/),
    proposalId:z.string().uuid(),version:z.number().int().positive()}).strict(),
]);

export async function handleSoaiSend(request,env,{providerFactory}){
  const json=(data,status=200)=>Response.json(data,{status,headers:{
    'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}});
  const supplied=request.headers.get('authorization')?.replace(/^Bearer /i,'')??'';
  const expected=env.CONNECTOR_ADMIN_TOKEN??'';
  if(expected.length<32||Buffer.byteLength(supplied)!==Buffer.byteLength(expected)||
    !timingSafeEqual(Buffer.from(supplied),Buffer.from(expected)))
    return json({error:'ACCESS_DENIED'},401);
  if(request.method!=='POST')return json({error:'METHOD_NOT_ALLOWED'},405);
  if(!env.DB||!env.FORPSI_TENANT_ID)return json({error:'SEND_NOT_CONFIGURED'},503);
  try{
    const raw=await request.text();requireValue(raw.length<=4096,'INVALID_ARGUMENTS');
    const command=input.parse(JSON.parse(raw));
    const store=new Store(env.DB),actor=await store.identity(SOAI_ISSUER,command.actorId);
    requireValue(actor?.tenant_id===env.FORPSI_TENANT_ID,'ACCESS_DENIED');
    const principal={id:actor.id,scopes:['forpsi:read','forpsi:send','forpsi:schedule']};
    const approvals=new SendApproval(store,env,new Outbox(store,env,providerFactory));
    const data=command.operation==='status'?await approvals.status(principal,command.proposalId):
      command.operation==='approve'?await approvals.approve(principal,command.proposalId,command.version):
        await approvals.cancel(principal,command.proposalId,command.version);
    return json({data});
  }catch(error){
    const code=error instanceof z.ZodError||error instanceof SyntaxError?'INVALID_ARGUMENTS':safeError(error);
    const status=code==='INVALID_ARGUMENTS'?400:code==='ACCESS_DENIED'?403:
      code==='PROPOSAL_NOT_FOUND'?404:
      ['PROPOSAL_VERSION_CONFLICT','PROPOSAL_NOT_PENDING','PROPOSAL_EXPIRED'].includes(code)?409:503;
    return json({error:code},status);
  }
}
