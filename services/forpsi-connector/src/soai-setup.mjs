import { timingSafeEqual } from 'node:crypto';
import { z } from 'zod';
import { Store } from './store.mjs';
import { SOAI_ISSUER } from './admin-access.mjs';
import { Onboarding } from './onboarding.mjs';
import { requireValue, safeError } from './errors.mjs';

const actorId=z.string().min(1).max(128).regex(/^[a-zA-Z0-9_-]+$/);
const sessionId=z.string().uuid();
const input=z.discriminatedUnion('operation',[
  z.object({operation:z.literal('status'),actorId,sessionId}).strict(),
  z.object({operation:z.literal('approve'),actorId,sessionId,proposalVersion:z.number().int().positive()}).strict(),
]);

export async function handleSoaiSetup(request,env,{providerFactory}) {
  const json=(data,status=200)=>Response.json(data,{status,headers:{'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}});
  const expected=env.CONNECTOR_ADMIN_TOKEN,supplied=request.headers.get('authorization')?.replace(/^Bearer /,'')??'';
  if(!expected || expected.length<32 || Buffer.byteLength(supplied)!==Buffer.byteLength(expected) ||
    !timingSafeEqual(Buffer.from(supplied),Buffer.from(expected)))return json({error:'ACCESS_DENIED'},401);
  if(request.method!=='POST')return json({error:'METHOD_NOT_ALLOWED'},405);
  if(env.SOAI_MAIL_ENABLED!=='true' || !env.DB || !env.FORPSI_TENANT_ID)return json({error:'SETUP_UNAVAILABLE'},503);
  try {
    const reader=request.body?.getReader();requireValue(reader,'INVALID_ARGUMENTS');
    const parts=[];let size=0;
    for(;;){const {value,done}=await reader.read();if(done)break;size+=value.byteLength;
      if(size>16384){await reader.cancel();return json({error:'INVALID_ARGUMENTS'},413);}parts.push(value);}
    const command=input.parse(JSON.parse(Buffer.concat(parts).toString('utf8')));
    const store=new Store(env.DB),identity=await store.identity(SOAI_ISSUER,command.actorId);
    requireValue(identity?.tenant_id===env.FORPSI_TENANT_ID,'ACCESS_DENIED');
    const principal={id:identity.id,scopes:['forpsi:read']};
    const setup=new Onboarding({store,principal,providerFactory,env,approvalSource:'soai_session'});
    const data=command.operation==='status'?await setup.status({sessionId:command.sessionId}):
      await setup.approve({sessionId:command.sessionId,proposalVersion:command.proposalVersion});
    const owned=await setup.owned(command.sessionId);
    await store.access(principal,owned.mailbox.id,'read');
    return json({data});
  }catch(error){
    const code=error instanceof z.ZodError || error instanceof SyntaxError?'INVALID_ARGUMENTS':safeError(error);
    return json({error:code},code==='INVALID_ARGUMENTS'?400:code==='ACCESS_DENIED'?403:
      ['ONBOARDING_NOT_FOUND'].includes(code)?404:
      ['PROFILE_VERSION_CONFLICT','ONBOARDING_NOT_READY'].includes(code)?409:503);
  }
}
