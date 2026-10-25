import { resolveFleetVehicleIdentityAt } from './fleet-temporal-evidence.js';
import { sourceTime, fingerprint } from './vistos-values.js';
import { integrationError } from './vistos-integration-store.js';

const MAX_GAP=120000;
export function pointInsideLocation(point,location) {
  if(location?.verified!==true||!location.evidenceId) return null;
  const lat=point.latitude,lon=point.longitude;
  if(!Number.isFinite(lat)||!Number.isFinite(lon)) return null;
  if(Array.isArray(location.polygon)&&location.polygon.length>=3) {
    let inside=false;const polygon=location.polygon;
    for(let i=0,j=polygon.length-1;i<polygon.length;j=i++) {
      const [x,y]=polygon[i],[px,py]=polygon[j];
      if(((y>lat)!==(py>lat))&&(lon<(px-x)*(lat-y)/(py-y)+x)) inside=!inside;
    }
    return inside;
  }
  if(!Number.isFinite(location.radiusMeters)||location.radiusMeters<=0||!Number.isFinite(location.latitude)||!Number.isFinite(location.longitude)) return null;
  const rad=Math.PI/180,dLat=(lat-location.latitude)*rad,dLon=(lon-location.longitude)*rad;
  const a=Math.sin(dLat/2)**2+Math.cos(lat*rad)*Math.cos(location.latitude*rad)*Math.sin(dLon/2)**2;
  return 6371000*2*Math.atan2(Math.sqrt(a),Math.sqrt(1-a))<=location.radiusMeters;
}
export function temporalVehicle(aliases,providerId,from,to,system='tcars') {
  // Test every change boundary; endpoint equality alone misses an identity change inside the visit.
  const boundaries=[from,to-1,...aliases.flatMap(a=>[Date.parse(a.valid_from),Date.parse(a.valid_to)])
    .filter(t=>Number.isFinite(t)&&t>=from&&t<to)];
  const resolved=boundaries.map(t=>resolveFleetVehicleIdentityAt(aliases,[{system,value:providerId}],new Date(t).toISOString()));
  return resolved.every(r=>r.status==='matched'&&r.vehicleId===resolved[0].vehicleId)?resolved[0]:null;
}
export function deriveJobExecution({jobId,providerId,points=[],aliases=[],location,window,competingJobs=[],trips=[],coverage={}}) {
  const result={jobId,algorithmVersion:'vistos-visit-1',useForPayroll:false,provenance:'gps_observation',
    assignmentStatus:'candidate',coverageStatus:'unavailable',reasons:[],visits:[],trips:[],driver:{status:'unverified',label:'Řidič v daném čase neověřen'},technology:{status:'unverified',label:'Zdroj není ověřen'}};
  const from=sourceTime(window?.from).instant,to=sourceTime(window?.to).instant;
  if(!from||!to||Date.parse(to)<=Date.parse(from)||window?.verified!==true) {result.reasons.push('planned_window_unverified');return result;}
  const start=Date.parse(from),end=Date.parse(to);
  if(trips.some(t=>t.private===true&&sourceTime(t.from).instant&&sourceTime(t.to).instant&&Date.parse(t.from)<end&&Date.parse(t.to)>start)){result.reasons.push('private_trip_overlap');result.assignmentStatus='unavailable';return result;}
  const identity=temporalVehicle(aliases,providerId,start,end);
  if(!identity) result.reasons.push('historical_vehicle_identity_unverified');
  if(location?.verified!==true||!location?.evidenceId||location.overlapping===true) result.reasons.push('location_unverified_or_overlapping');
  const candidates=[...new Set(competingJobs)];
  if(candidates.length!==1||candidates[0]!==jobId) result.reasons.push('competing_jobs');
  result.conditions={vehicle:Boolean(identity),location:location?.verified===true&&Boolean(location.evidenceId)&&!location.overlapping,unique:candidates.length===1&&candidates[0]===jobId};
  if(identity) {result.vehicleId=identity.vehicleId;result.identityEvidenceIds=identity.evidenceIds;}
  const seen=new Set();
  const ordered=points.filter(p=>{
    const timestamp=sourceTime(p.recordedAt).instant;
    if(!timestamp||p.gpsValid!==true||p.providerId!==providerId||!p.id) return false;
    const t=Date.parse(timestamp);if(t<start||t>=end||seen.has(timestamp))return false;
    seen.add(timestamp);return true;
  }).map(p=>({...p,time:Date.parse(p.recordedAt),inside:pointInsideLocation(p,location)})).sort((a,b)=>a.time-b.time);
  if(!ordered.length) {result.reasons.push('history_unavailable');result.assignmentStatus='unavailable';return result;}
  result.coverageStatus=coverage.complete===true?'observed':'incomplete';
  let segment=[];let before=null;
  function finish(after) {
    if(segment.length>=3 && segment.at(-1).time-segment[0].time>=MAX_GAP) {
      const first=segment[0],last=segment.at(-1),gaps=[];
      for(let i=1;i<segment.length;i++) if(segment[i].time-segment[i-1].time>MAX_GAP) gaps.push([segment[i-1].recordedAt,segment[i].recordedAt]);
      const arrival=before?.inside===false&&first.time-before.time<=MAX_GAP?[before.recordedAt,first.recordedAt]:null;
      const departure=after?.inside===false&&after.time-last.time<=MAX_GAP?[last.recordedAt,after.recordedAt]:null;
      const complete=Boolean(arrival&&departure&&!gaps.length&&coverage.complete===true);
      result.visits.push({arrival,departure,observedFrom:first.recordedAt,observedTo:last.recordedAt,
        durationSeconds:complete?{minimum:(last.time-first.time)/1000,maximum:(after.time-before.time)/1000}:null,
        coverage:complete?'observed':'incomplete',gaps,
        boundaryPoints:[before,first,last,after].filter(Boolean).map(({time,inside,...p})=>p),
        pointIds:segment.map(p=>p.id),provenance:'derived_interval'});
    }
    segment=[];
  }
  for(const point of ordered) {
    if(point.inside===true && point.speedKmh!==null && Number.isFinite(point.speedKmh) && point.speedKmh>=0 && point.speedKmh<=5) segment.push(point);
    else {finish(point);before=point;}
  }
  finish(null);
  if(!result.visits.length) {result.assignmentStatus='incomplete';result.reasons.push('visit_not_proven');return result;}
  if(result.visits.some(v=>v.coverage!=='observed')) result.coverageStatus='incomplete';
  const privateTrips=trips.filter(t=>t.private===true && sourceTime(t.from).instant && sourceTime(t.to).instant && Date.parse(t.from)<end && Date.parse(t.to)>start);
  if(privateTrips.length) result.reasons.push('private_trip_overlap');
  result.assignmentStatus=result.reasons.includes('competing_jobs')?'ambiguous':result.reasons.length?'candidate':result.coverageStatus==='incomplete'?'incomplete':'auto_associated';
  // Attach provider trip only when its identity, end place and time are documented.
  for(const visit of result.visits) {
    const arrivals=trips.filter(t=>t.private===false && t.providerId===providerId && t.id && t.locationEvidenceId===location.evidenceId
      && t.locationVerified===true && sourceTime(t.to).instant && visit.arrival && t.to>=visit.arrival[0]&&t.to<=visit.arrival[1]);
    if(arrivals.length===1) result.trips.push({...arrivals[0],provenance:'tcars_trip'});
  }
  return result;
}
export async function storeExecutionEvidence(db,job,evidence,actor='scheduler') {
  const hash=await fingerprint(evidence),now=new Date().toISOString();
  const existing=await db.prepare('SELECT * FROM job_execution_evidence WHERE job_id=? AND fingerprint=?').bind(job.id,hash).first();
  if(existing)return existing;
  const id=crypto.randomUUID();
  await db.batch([
    db.prepare(`INSERT INTO job_execution_evidence(id,job_id,company_id,revision,fingerprint,evidence_json,assignment_status,coverage_status,created_at)
      SELECT ?,?,?,COALESCE(MAX(revision),0)+1,?,?,?,?,? FROM job_execution_evidence WHERE job_id=?`).bind(id,job.id,job.company_id,hash,JSON.stringify(evidence),evidence.assignmentStatus,evidence.coverageStatus,now,job.id),
    db.prepare(`INSERT INTO vistos_evidence_events(id,record_id,company_id,kind,actor,after_fingerprint,created_at) VALUES(?,?,?,?,?,?,?)`).bind(id,job.id,job.company_id,'execution_evidence_changed',actor,hash,now)
  ]);
  return db.prepare('SELECT * FROM job_execution_evidence WHERE id=?').bind(id).first();
}
export async function confirmJobExecution(scope,jobId,{evidenceId,revision,decision,reason}) {
  if(!scope.rights.tracking)throw integrationError('tracking_permission_required',403);
  if(!['human_confirmed','cannot_determine'].includes(decision)||typeof reason!=='string'||!reason.trim()||reason.length>500)throw integrationError('execution_confirmation_invalid',400);
  const evidence=await scope.db.prepare('SELECT * FROM job_execution_evidence WHERE id=? AND job_id=? AND company_id IN ('+scope.companies.map(()=>'?')+')').bind(evidenceId,jobId,...scope.companies).first();
  if(!evidence||evidence.revision!==revision)throw integrationError('execution_revision_conflict');
  const data=JSON.parse(evidence.evidence_json);
  if(decision==='human_confirmed'&&(!data.visits?.length||data.reasons?.includes('private_trip_overlap')))throw integrationError('execution_evidence_missing');
  const latest=await scope.db.prepare('SELECT MAX(revision) AS revision FROM job_execution_evidence WHERE job_id=?').bind(jobId).first();
  if(latest.revision!==revision)throw integrationError('execution_revision_conflict');
  const now=new Date().toISOString();
  await scope.db.batch([
    scope.db.prepare(`INSERT INTO vistos_execution_confirmations(evidence_id,revision,job_id,actor,decision,reason,created_at) VALUES(?,?,?,?,?,?,?) ON CONFLICT(evidence_id) DO NOTHING`).bind(evidenceId,revision,jobId,scope.user.id,decision,reason.trim(),now),
    scope.db.prepare(`INSERT INTO vistos_command_events(id,command_id,company_id,actor,after_state,fingerprint,created_at) VALUES(?,?,?,?,?,?,?) ON CONFLICT(id) DO NOTHING`).bind(`execution:${evidenceId}`,jobId,evidence.company_id,scope.user.id,decision,evidence.fingerprint,now)
  ]);
  return {status:decision,coverage:data.coverageStatus,useForPayroll:false};
}
