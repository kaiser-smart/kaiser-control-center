import {json,requireAdmin} from '../../../_lib/auth.js';
import {integrationDb} from '../../../_lib/vistos-integration-store.js';
import {getCoreDatabase,getArchiveDatabase,getAuditDatabase} from '../../../_lib/databases.js';
export async function onRequestGet({request,env}) {
  const auth=await requireAdmin(env,request);if(auth.response)return auth.response;
  try {
    const db=integrationDb(env),capacity={};
    for(const [domain,get] of [['core',getCoreDatabase],['archive',getArchiveDatabase],['audit',getAuditDatabase]]) {
      const r=await get(env).prepare('SELECT 1 AS capacity_probe').all();capacity[domain]={sizeBytes:r.meta?.size_after||null};
    }
    const {results:contracts=[]}=await db.prepare('SELECT installation,revision,approved_at FROM vistos_integration_contracts').all();
    const {results:access=[]}=await db.prepare('SELECT installation,company_id FROM vistos_company_access WHERE user_id=?').bind(auth.user.id).all();
    const {results:records=[]}=await db.prepare('SELECT installation,entity,COUNT(*) AS count FROM vistos_source_records GROUP BY installation,entity').all();
    const {results:rules=[]}=await db.prepare("SELECT id,status FROM module_rules WHERE id IN ('jobs-vistos-read','jobs-tcars-evidence','receivables-vistos-writer')").all();
    const {results:streams=[]}=await db.prepare('SELECT installation,entity,mode,status,offset,expected_count,last_success_at,error_code FROM vistos_sync_checkpoints').all();
    const names=['VISTOS_INSTALLATION_ID','VISTOS_SHARED_REQUESTS_PER_MINUTE','VISTOS_READ_SYNC_ENABLED','VISTOS_JOBS_RUNNER_ENABLED','VISTOS_JOB_EXECUTION_ENABLED','VISTOS_PAYMENT_WRITE_ENABLED','D1_CAPACITY_BLOCK_BULK_WRITES'];
    return json({testedAt:new Date().toISOString(),readOnly:true,capacity,contracts,access,records,rules,streams,configuration:Object.fromEntries(names.map(n=>[n,env[n]??null]))});
  }catch(error){return json({error:'Kontrola nastavení propojení se nezdařila.',code:/^[a-z0-9_]+$/.test(error.code||'')?error.code:'vistos_readiness_unavailable'},503);}
}
