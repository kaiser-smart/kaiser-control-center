import { integrationDb, integrationError } from './vistos-integration-store.js';
import { deriveJobExecution, storeExecutionEvidence, temporalVehicle } from './vistos-job-execution.js';
import { loadJobTrackingInterval } from './vehicle-tracking-history.js';
import { fetchTcarsVehicleTrips } from './tcars-client.js';
import { sourceTime, referenceIds } from './vistos-values.js';
import { decodeSourceFields, fieldValues } from './vistos-source-model.js';
import { pragueDayBounds } from './vistos-time.js';

const day=value=>new Intl.DateTimeFormat('sv-SE',{timeZone:'Europe/Prague',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(value));
export function verifiedTcarsTime(value,zone) {
  const instant=sourceTime(value).instant;if(instant)return instant;
  if(zone!=='Europe/Prague'||typeof value!=='string'||!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}$/.test(value))return null;
  const candidates=['+01:00','+02:00'].map(offset=>new Date(value+offset)).filter(date=>{
    const parts=Object.fromEntries(new Intl.DateTimeFormat('sv-SE',{timeZone:zone,year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23'}).formatToParts(date).map(p=>[p.type,p.value]));
    return `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}:${parts.second}`===value;
  });
  return candidates.length===1?candidates[0].toISOString():null; // Repeated/nonexistent DST wall time stays unknown.
}
function verifiedAliases(rows){return rows.map(row=>{let meta={};try{meta=JSON.parse(row.metadata_json||'{}');}catch{}return {...row,verified:meta.verified===true,source_system:meta.source_system};});}
export async function enrichJobExecution(env,job,contract,{now=new Date(),tripReader=fetchTcarsVehicleTrips}={}) {
  const db=integrationDb(env),tracking=contract.tracking||{},values=fieldValues(decodeSourceFields(job.fields_json));
  let window={verified:false};
  if(job.planned_start&&job.planned_end&&job.planned_end>job.planned_start)window={verified:true,from:new Date(Date.parse(job.planned_start)-7200000).toISOString(),to:new Date(Date.parse(job.planned_end)+7200000).toISOString()};
  else if(job.planned_day)window={verified:true,...pragueDayBounds(job.planned_day)};
  const empty=(reason)=>({jobId:job.id,algorithmVersion:'vistos-visit-1',assignmentStatus:'unavailable',coverageStatus:'unavailable',reasons:[reason],visits:[],trips:[],useForPayroll:false});
  if(!window.verified)return storeExecutionEvidence(db,job,empty('planned_window_unverified'));
  if(Date.parse(window.to)-Date.parse(window.from)>7*86400000)return storeExecutionEvidence(db,job,empty('window_too_wide'));
  if(!tracking.tripPrivacyVerified||!tracking.tripCompletenessVerified||!tracking.timeZoneEvidenceId)return storeExecutionEvidence(db,job,empty('trip_contract_unverified'));
  const siteReference=tracking.siteField?referenceIds(values,tracking.siteField,'detail')[0]:null,link=tracking.siteLinks?.[siteReference];
  const locationRow=link?.evidenceId?await db.prepare("SELECT * FROM collection_site_locations WHERE id=? AND status='active' AND confirmed_at IS NOT NULL").bind(link.locationId).first():null;
  const location=locationRow?{verified:true,evidenceId:link.evidenceId,latitude:locationRow.latitude,longitude:locationRow.longitude,radiusMeters:link.radiusMeters,polygon:link.polygon,overlapping:link.overlapping!==false}:null;
  const {results:aliasRows=[]}=await db.prepare("SELECT * FROM fleet_vehicle_external_aliases WHERE external_system IN ('vistos','tcars') AND status IN ('active','historical')").all();
  const aliases=verifiedAliases(aliasRows),sourceVehicles=JSON.parse(job.vehicle_ids_json),associations=[];
  for(const sourceVehicle of sourceVehicles){
    const identity=temporalVehicle(aliases,sourceVehicle,Date.parse(window.from),Date.parse(window.to),'vistos');
    if(identity?.status!=='matched')continue;
    const providers=[...new Set(aliases.filter(a=>a.external_system==='tcars'&&a.vehicle_id===identity.vehicleId&&a.verified&&a.valid_from<=window.from&&(!a.valid_to||a.valid_to>=window.to)).map(a=>a.external_key))];
    if(providers.length===1)associations.push({sourceVehicle,providerId:providers[0],vehicleId:identity.vehicleId});
  }
  if(associations.length!==sourceVehicles.length||!associations.length)return storeExecutionEvidence(db,job,empty('historical_vehicle_identity_unverified'));
  const results=[];
  for(const association of associations){
    const {providerId,vehicleId}=association,trips=[];
    const first=day(window.from),last=day(new Date(Date.parse(window.to)-1));
    let date=first;
    for(let days=0;date<=last&&days<9;days++){
      const cached=await db.prepare('SELECT * FROM vistos_tcars_trip_days WHERE installation=? AND vehicle_id=? AND local_day=?').bind(job.installation,providerId,date).first();
      let records;
      if(cached?.status==='read'&&Date.parse(cached.read_at)>now.getTime()-600000)records=JSON.parse(cached.trips_json);
      else {
        try{records=await tripReader(env,{tcarsVehicleId:providerId},{fromDay:date,toDay:date});
          await db.prepare(`INSERT INTO vistos_tcars_trip_days(installation,vehicle_id,local_day,status,trips_json,read_at) VALUES(?,?,?,'read',?,?) ON CONFLICT(installation,vehicle_id,local_day) DO UPDATE SET status='read',trips_json=excluded.trips_json,read_at=excluded.read_at,error_code=NULL`).bind(job.installation,providerId,date,JSON.stringify(records),now.toISOString()).run();
        }catch{
          await db.prepare(`INSERT INTO vistos_tcars_trip_days(installation,vehicle_id,local_day,status,error_code) VALUES(?,?,?,'error','tcars_trip_read_failed') ON CONFLICT(installation,vehicle_id,local_day) DO UPDATE SET status='error',error_code='tcars_trip_read_failed'`).bind(job.installation,providerId,date).run();
          throw integrationError('tcars_trip_read_failed');
        }
      }
      for(const trip of records){
        const from=verifiedTcarsTime(trip.startedAt,tracking.timeZone),to=verifiedTcarsTime(trip.endedAt,tracking.timeZone);
        if(!from||!to||typeof trip.privateTrip!=='boolean')return storeExecutionEvidence(db,job,empty('trip_time_or_privacy_unverified'));
        // Provider labels are never equated to a job location without a verified source identity.
        trips.push({id:trip.id,providerId,from,to,private:trip.privateTrip,provenance:'tcars_trip'});
      }
      const noon=new Date(date+'T12:00:00Z');noon.setUTCDate(noon.getUTCDate()+1);date=day(noon);
    }
    const points=[];let cursor=null,retentionMissing=false,more=false;
    for(let page=0;page<12;page++){
      const batch=await loadJobTrackingInterval(db,{vehicleKey:providerId,...window,cursor,now});
      points.push(...batch.points.map(p=>({...p,recordedAt:verifiedTcarsTime(p.recordedAt,tracking.timeZone)})));
      retentionMissing ||= batch.retentionMissing;cursor=batch.nextCursor;more=Boolean(cursor);if(!cursor)break;
    }
    // Candidate selection spans all company jobs; a restricted user cannot hide a competitor.
    const {results:neighbours=[]}=await db.prepare(`SELECT * FROM vistos_source_records WHERE installation=? AND entity='ServiceList'
      AND ((planned_start<? AND COALESCE(planned_end,planned_start)>=?) OR (planned_day>=? AND planned_day<=?))`).bind(job.installation,window.to,window.from,first,last).all();
    const competingJobs=[];
    for(const neighbour of neighbours){
      const ids=JSON.parse(neighbour.vehicle_ids_json);
      if(ids.some(id=>resolveFleetVehicleIdentityAt(aliases,[{system:'vistos',value:id}],window.from).vehicleId===vehicleId))competingJobs.push(neighbour.id);
    }
    const evidence=deriveJobExecution({jobId:job.id,providerId,aliases,points,location,window,competingJobs,trips,coverage:{complete:!more&&!retentionMissing}});
    evidence.plannedWindow=window;evidence.sourceVehicleId=association.sourceVehicle;evidence.retentionMissing=retentionMissing;evidence.nextCursor=cursor;
    results.push(evidence);
  }
  const evidence=results.length===1?results[0]:{jobId:job.id,algorithmVersion:'vistos-visit-1',assignmentStatus:'candidate',coverageStatus:results.every(r=>r.coverageStatus==='observed')?'observed':'incomplete',reasons:['multiple_vehicles_review'],vehicles:results,visits:[],trips:[],useForPayroll:false};
  return storeExecutionEvidence(db,job,evidence);
}
