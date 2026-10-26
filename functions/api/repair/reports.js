import { json, requireUserPermission } from '../../_lib/auth.js';
import { createUserReportedSelfRepairCase, SelfRepairStoreError } from '../../_lib/self-repair-store.js';
import { boundedForm, repairRoute, assertImage, digest, repairError } from '../../_lib/repair-input.js';
import { REPAIR_STATES } from '../../_lib/repair-queue.js';
import { hasPermission } from '../../../src/permissions.js';
async function list(env,user) {
  const manager=hasPermission(user,'self-repair','manage');
  const q=env.DB_CORE.prepare(`SELECT q.case_id,q.state,q.detail,q.created_at,q.updated_at,q.result_sha,q.deployment_id,q.rollback_id,c.title,c.description,c.source_route,c.reporter_user_name,c.case_number FROM repair_queue q JOIN self_repair_cases c ON c.id=q.case_id ${manager?'':'WHERE q.reporter_id=?'} ORDER BY q.created_at DESC LIMIT 100`);
  const rows=(await (manager?q:q.bind(user.id||user.email)).all()).results||[];
  return rows.map(r=>({...r,stateLabel:REPAIR_STATES[r.state]}));
}
function errorResponse(e) {return json({error:e instanceof SelfRepairStoreError?e.message:'Hlášení nyní nelze zpracovat.'},e instanceof SelfRepairStoreError?e.status:503);}
export async function onRequestGet({request,env}) {
  const {user,response}=await requireUserPermission(env,request,'feedback','view'); if(response)return response;
  try {return json({reports:await list(env,user),automationEnabled:env.REPAIR_AUTOMATION_ENABLED==='true'});} catch(e) {return errorResponse(e);}
}
export async function onRequestPost({request,env}) {
  const {user,response}=await requireUserPermission(env,request,'feedback','create'); if(response)return response;
  try {
    if(request.headers.get('origin')!==new URL(request.url).origin) throw repairError('Odešlete hlášení přímo z aplikace.',403);
    const form=await boundedForm(request);
    const description=String(form.get('description')||'').trim();
    if(description.length<5 || description.length>8000) throw repairError('Popište problém (5 až 8 000 znaků).');
    const sourceRoute=repairRoute(form.get('sourceRoute'));
    let attachment=form.get('attachment');
    if(attachment && typeof attachment.arrayBuffer==='function' && attachment.size) {
      const bytes=await attachment.arrayBuffer(); assertImage(bytes,attachment.type);
      attachment=new File([bytes],attachment.type==='image/png'?'screenshot.png':'fotografie.jpg',{type:attachment.type});
    } else attachment=null;
    const identity=String(user.id||user.email);
    const key=await digest(JSON.stringify([identity,new Date().toISOString().slice(0,10),sourceRoute,description.normalize('NFKC').replace(/\s+/g,' ').toLowerCase(),attachment?await digest(await attachment.arrayBuffer()):'']));
    const existing=await env.DB_CORE.prepare('SELECT case_id FROM repair_queue WHERE dedupe_key=? AND reporter_id=?').bind(key,identity).first();
    if(existing)return json({caseId:existing.case_id,deduplicated:true},200);
    const input={caseType:'bug',moduleKey:'feedback',title:description.split('\n')[0].slice(0,120),description,sourceRoute,clientRequestId:`repair-${key}`,buildVersion:String(form.get('buildVersion')||'').slice(0,100),technicalContext:{repairModule:true}};
    const result=await createUserReportedSelfRepairCase(env,user,input,{attachment,repair:{dedupeKey:key}});
    return json({caseId:result.case.id,deduplicated:!!result.deduplicated},result.deduplicated?200:201);
  } catch(e) {
    if(String(e.message).includes('repair_daily_limit')) return json({error:'Dnes jste již odeslali 20 hlášení. Další prosím přidejte zítra.'},429);
    return errorResponse(e);
  }
}
