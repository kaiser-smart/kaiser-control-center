import {json,requireAdmin} from '../../../_lib/auth.js';
import {auditVistosRead} from '../../../_lib/vistos-read-audit.js';
export async function onRequestGet({request,env}) {
  const auth=await requireAdmin(env,request);if(auth.response)return auth.response;
  const url=new URL(request.url);
  try {
    return json(await auditVistosRead(env,{entity:url.searchParams.get('entity')||'ServiceList',id:url.searchParams.get('id'),start:Number(url.searchParams.get('start')||0),
      modifiedFrom:url.searchParams.get('modifiedFrom'),modifiedTo:url.searchParams.get('modifiedTo'),parentId:url.searchParams.get('parentId')}));
  }catch(error){return json({error:'Čtecí kontrola Vistosu se nezdařila.',code:/^[a-z0-9_]+$/.test(error.code||'')?error.code:'read_audit_unavailable',upstreamStatus:error.upstreamStatus||null},error.status||503);}
}
