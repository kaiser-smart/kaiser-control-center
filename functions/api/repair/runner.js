import { digest, assertImage } from '../../_lib/repair-input.js';
import { json } from '../../_lib/auth.js';
import { authorizeRunner,claimRepair,finishRepair } from '../../_lib/repair-queue.js';
import { SelfRepairStoreError } from '../../_lib/self-repair-store.js';
export async function onRequestPost({request,env}) {
  try {
    await authorizeRunner(request,env);
    // Bounded even when Content-Length is omitted.
    const reader=request.body?.getReader();let bytes=0;const chunks=[];
    if(!reader)return json({error:'Prázdný požadavek.'},400);
    for(;;){const {done,value}=await reader.read();if(done)break;bytes+=value.length;if(bytes>8192){await reader.cancel();return json({error:'Příliš velký požadavek.'},413);}chunks.push(value);}
    const input=JSON.parse(await new Blob(chunks).text());
    if(input.action==='claim') {
      const runId=String(input.runId||'');
      const job=await claimRepair(env.DB_CORE,runId,new Date().toISOString(),await digest(`${env.REPAIR_RUNNER_TOKEN}:${runId}`));
      if(job) {
        const attachment=await env.DB_ARCHIVE.prepare('SELECT storage_key,content_type,checksum_sha256 FROM self_repair_case_attachments WHERE case_id=? ORDER BY created_at LIMIT 1').bind(job.caseId).first();
        if(attachment) {
          const object=await env.SMART_ODPADY_DOCUMENTS.get(attachment.storage_key);
          if(!object || object.size>5*1024*1024) throw new Error('Attachment unavailable');
          const bytes=await object.arrayBuffer();assertImage(bytes,attachment.content_type);
          if(await digest(bytes)!==attachment.checksum_sha256) throw new Error('Attachment integrity');
          let binary='';for(const byte of new Uint8Array(bytes))binary+=String.fromCharCode(byte);
          job.image={type:attachment.content_type,base64:btoa(binary)};
        }
        delete job.lease;
      }
      return json({job});
    }
    if(input.action==='inspect') {
      const row=await env.DB_CORE.prepare('SELECT * FROM repair_queue WHERE case_id=? AND run_id=?').bind(input.caseId,input.runId).first();
      if(!row || row.lease_hash!==await digest(String(input.lease||''))) return json({error:'Neplatný běh.'},409);
      const {lease_hash,...job}=row;return json({job});
    }
    if(input.action==='finish')return json(await finishRepair(env.DB_CORE,input));
    return json({error:'Neplatná akce.'},400);
  }catch(e){return json({error:e instanceof SelfRepairStoreError?e.message:'Běh nelze dokončit.'},e instanceof SelfRepairStoreError?e.status:503);}
}
