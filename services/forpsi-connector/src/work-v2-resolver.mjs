import { requireValue } from './errors.mjs';
import { eventSchema,factSchema,signalSchema,unknownEntity,noCondition,stableId,stableJson,
  eventCapability,effectiveDecisions,validateDecisionGraph,identityDecisionSchema,resolverVersion,attentionVersion } from './work-v2-contract.mjs';

const day=86400000;
const unique=values=>[...new Set(values)];
const copy=value=>structuredClone(value);
const lifecycleKinds=new Set(['requested','promised','accepted','completed','cancelled','replaced',
  'offered','delivered','informed','created_manually','reopened']);
const creationKinds=new Set(['requested','promised','offered','delivered','informed','created_manually']);
const sections=['todo','decision','waiting','information','review'];
const critical=new Set(['existence','action','owner','status']);
const reason=(property,code,severity='blocking',candidateFactIds=[],decisionIds=[])=>
  ({property,code,severity,candidateFactIds,decisionIds});

function newItem(event){return {id:event.workItemId,caseId:event.caseId,tenantId:event.tenantId,
  actor:unknownEntity(),owner:unknownEntity(),counterparty:unknownEntity(),action:'',category:'unknown',
  status:'unresolved',lifecycleStatus:'unresolved',actionability:'information',optional:false,assignmentStatus:'unknown',
  dueDate:null,dueResolution:'absent',completedAt:null,condition:noCondition(),activation:'not_applicable',
  unresolvedReasons:[],sourceMessageId:event.sourceMessageId,basisEventIds:[],propertyEvidence:{},
  propertyAuthority:{},readRequirements:[],existenceAccepted:false,result:'unspecified',requiresDecision:false,
  protectedFields:[],lastEventByProperty:{}};}

function eventValues(event,decision,facts) {
  if(event.manual)return {values:copy(event.payload),conflicts:[],evidence:{},requirements:event.readRequirements};
  const values={},conflicts=[],evidence={},requirements=[...event.readRequirements];
  for(const [property,ids] of Object.entries(event.factBindings)){
    const eligible=ids.map(id=>facts.find(f=>f.id===id)).filter(f=>f&&f.validation==='valid'&&
      decision.acceptedFactIds.includes(f.id)&&f.tenantId===event.tenantId&&f.workItemId===event.workItemId);
    const choices=unique(eligible.map(f=>stableJson(f.value)));
    if(choices.length===1){values[property]=copy(eligible[0].value);
      evidence[property]=eligible.flatMap(f=>f.evidence);}
    else if(choices.length>1)conflicts.push(reason(property,'FACT_CONFLICT',
      critical.has(property)?'blocking':'advisory',eligible.map(f=>f.id),[decision.id]));
    for(const f of eligible)for(const ref of f.evidence)requirements.push(`message:${ref.messageId}`);
  }
  // Control fields are immutable, reviewed event interpretation, never an alternate fact value.
  for(const p of ['retainDue','releaseProtection','property','operation','replacementWorkItemId',
    'acceptanceKind','requiresDecision'])if(event.payload[p]!==undefined)values[p]=event.payload[p];
  return {values,conflicts,evidence,requirements:unique(requirements)};
}

function applyEvent(item,event,decision,data){
  const p=data.values,was=item.status,manual=event.manual;
  if(!manual&&item.protectedFields.includes('status')&&lifecycleKinds.has(event.kind))return 'MANUAL_STATUS_PROTECTED';
  const priorLifecycle=item.lastEventByProperty.status;
  if(!manual&&lifecycleKinds.has(event.kind)&&priorLifecycle?.at===event.at&&
    priorLifecycle.id!==event.logicalEventId&&priorLifecycle.kind!==event.kind){
    item.status='unresolved';item.unresolvedReasons.push(reason('status','CONCURRENT_CHANGE'));
    item.readRequirements=unique([...item.readRequirements,...data.requirements]);
    item.basisEventIds.push(event.id);return null;
  }
  const update=(property,value)=>{
    if(!manual&&item.protectedFields.includes(property))return false;
    const previous=item.lastEventByProperty[property];
    if(previous&&previous.at===event.at&&previous.id!==event.logicalEventId&&
      (stableJson(previous.value)!==stableJson(value)||item.unresolvedReasons.some(r=>
        r.property===property&&r.code==='CONCURRENT_CHANGE'))&&!manual){
      item.unresolvedReasons.push(reason(property,'CONCURRENT_CHANGE',critical.has(property)?'blocking':'advisory'));
      if(property==='dueDate'){item.dueDate=null;item.dueResolution='conflicted';}
      else if(property==='condition')item.condition={...noCondition(),kind:'unknown',description:'Rozporné podmínky'};
      else if(critical.has(property))item.status='unresolved';
      return false;
    }
    item.unresolvedReasons=item.unresolvedReasons.filter(r=>r.property!==property);
    item[property]=copy(value);
    item.lastEventByProperty[property]={at:event.at,id:event.logicalEventId,value:copy(value)};
    item.propertyEvidence[property]=copy(data.evidence[property]??[]);
    item.propertyAuthority[property]={decisionId:decision.id,reviewerId:decision.reviewerId,
      semanticBasis:decision.semanticBasis,policyId:decision.policyId,policyVersion:decision.policyVersion};
    if(manual)item.protectedFields=unique([...item.protectedFields,property]);
    return true;
  };
  if(creationKinds.has(event.kind)&&item.basisEventIds.length>0&&
    !['delivered','promised'].includes(event.kind))return 'WORK_ALREADY_EXISTS';
  if(event.kind==='promised'&&item.basisEventIds.length>0&&was!=='open')return 'INVALID_WORK_TRANSITION';
  if(['requested','promised','created_manually','offered','informed'].includes(event.kind)){
    if(!p.action)return 'ACTION_NOT_ACCEPTED';
    if(!event.manual&&p.existence!==true)return 'EXISTENCE_NOT_ACCEPTED';
    item.existenceAccepted=true;
    update('action',p.action);update('actor',p.actor??unknownEntity());
    update('owner',p.owner??unknownEntity());update('counterparty',p.counterparty??unknownEntity());
    if(p.category)update('category',p.category);
    if(p.condition)update('condition',p.condition);
    if(p.dueDate&&update('dueDate',p.dueDate))item.dueResolution='known';
    item.status=['offered','informed'].includes(event.kind)?'informational':'open';
    item.actionability=event.kind==='offered'?'optional':event.kind==='informed'?'information':'obligation';
    item.optional=event.kind==='offered';
    item.assignmentStatus=event.kind==='requested'?'requested':
      ['promised','created_manually'].includes(event.kind)?'accepted':'not_applicable';
    item.requiresDecision=p.requiresDecision===true;
  }else if(event.kind==='delivered'){
    if(!p.action||(!manual&&p.existence!==true))return 'DELIVERY_NOT_ACCEPTED';
    if(item.basisEventIds.length&&was!=='open')return 'INVALID_WORK_TRANSITION';
    for(const property of ['action','actor','owner','counterparty','category'])if(p[property]!==undefined)update(property,p[property]);
    item.existenceAccepted=true;item.status='completed';item.completedAt=event.at;
    item.actionability='information';item.assignmentStatus='not_applicable';item.result=p.result??'unspecified';
  }else if(event.kind==='delegated'){
    if(was!=='open'||!p.owner)return 'INVALID_WORK_TRANSITION';
    update('owner',p.owner);item.assignmentStatus='requested';
  }else if(event.kind==='accepted'){
    if(was==='informational'&&item.optional&&p.acceptanceKind==='offer'){
      item.status='open';item.actionability='obligation';item.optional=false;
    }else if(was!=='open')return 'INVALID_WORK_TRANSITION';
    item.assignmentStatus='accepted';
  }else if(['completed','cancelled','replaced'].includes(event.kind)){
    if(was!=='open'&&!(was==='informational'&&item.optional&&event.kind==='cancelled'))return 'INVALID_WORK_TRANSITION';
    if(event.kind==='replaced'&&!p.replacementWorkItemId)return 'REPLACEMENT_REQUIRED';
    item.status=event.kind==='completed'?'completed':'cancelled';
    item.completedAt=event.kind==='completed'?event.at:null;item.result=p.result??'unspecified';
  }else if(['due_changed','due_removed'].includes(event.kind)){
    if(was!=='open'&&!(was==='informational'&&item.optional))return 'INVALID_WORK_TRANSITION';
    if(event.kind==='due_changed'&&!p.dueDate&&!data.conflicts.some(r=>r.property==='dueDate'))return 'DUE_NOT_ACCEPTED';
    if(update('dueDate',event.kind==='due_removed'?null:p.dueDate??null))item.dueResolution=event.kind==='due_removed'?'removed':
      item.unresolvedReasons.some(r=>r.property==='dueDate')?'conflicted':'known';
  }else if(event.kind==='reopened'){
    if(!['completed','cancelled'].includes(was)||!p.releaseProtection)return 'INVALID_WORK_TRANSITION';
    item.protectedFields=item.protectedFields.filter(p=>p!=='status');
    item.status='open';item.actionability='obligation';item.completedAt=null;
    if(!p.retainDue){item.dueDate=null;item.dueResolution='absent';}
  }else if(event.kind==='overridden'){
    if(!p.property||!['set','release'].includes(p.operation))return 'INVALID_OVERRIDE';
    if(p.operation==='release')item.protectedFields=item.protectedFields.filter(x=>x!==p.property);
    else {if(p[p.property]===undefined)return 'OVERRIDE_VALUE_REQUIRED';update(p.property,p[p.property]);
      if(p.property==='dueDate')item.dueResolution=p.dueDate===null?'removed':'known';}
  }
  if(lifecycleKinds.has(event.kind)){
    item.lifecycleStatus=item.status;
    item.lastEventByProperty.status={at:event.at,id:event.logicalEventId,kind:event.kind};
  }
  for(const conflict of data.conflicts){item.unresolvedReasons.push(conflict);
    if(conflict.property==='dueDate'){item.dueDate=null;item.dueResolution='conflicted';}
    else if(conflict.property==='condition')item.condition={...noCondition(),kind:'unknown',description:'Rozporné podmínky'};
    else if(critical.has(conflict.property))item.status='unresolved';}
  if(item.actionability==='obligation'&&item.owner.kind==='unknown'){
    item.status='unresolved';item.unresolvedReasons.push(reason('owner','OWNER_NOT_ACCEPTED'));}
  item.status=item.unresolvedReasons.some(r=>r.severity==='blocking')?'unresolved':item.lifecycleStatus;
  if(manual&&lifecycleKinds.has(event.kind))item.protectedFields=unique([...item.protectedFields,'status']);
  item.basisEventIds.push(event.id);item.readRequirements=unique([...item.readRequirements,...data.requirements]);
  return null;
}

function activate(item,items,evaluations,stack=new Set()){
  if(item.status!=='open'){
    item.activation='not_applicable';
    if(item.status==='completed'&&item.condition.kind!=='none'){
      const disputed=item.condition.dependsOnWorkItemIds.some(id=>{
        const prior=items.find(i=>i.id===id);return !prior||prior.status==='cancelled'||prior.result==='negative'||
          item.condition.requiredResult==='positive'&&(prior.status!=='completed'||prior.result!=='positive');})||
        evaluations.filter(e=>e.workItemId===item.id&&e.authorized===true&&
          e.conditionDigest===stableId('condition',item.condition)).sort((a,b)=>b.at-a.at||(b.revision??0)-(a.revision??0))[0]?.result==='failed';
      if(disputed)item.unresolvedReasons.push(reason('condition','COMPLETED_CONDITION_DISPUTED','advisory'));
    }
    return;
  }
  if(stack.has(item.id)){item.activation='unknown';item.unresolvedReasons.push(reason('condition','CONDITION_CYCLE'));return;}
  const condition=item.condition;if(condition.kind==='none'){item.activation='active';return;}
  if(condition.kind==='unknown'){item.activation='unknown';return;}
  const dependencies=condition.dependsOnWorkItemIds.map(id=>items.find(i=>i.id===id));
  if(dependencies.some(x=>!x)){item.activation='unknown';return;}
  for(const dep of dependencies){activate(dep,items,evaluations,new Set([...stack,item.id]));
    item.readRequirements=unique([...item.readRequirements,...dep.readRequirements]);}
  if(dependencies.some(d=>d.unresolvedReasons.some(r=>r.code==='CONDITION_CYCLE'))){
    item.activation='unknown';item.unresolvedReasons.push(reason('condition','CONDITION_CYCLE'));return;}
  if(dependencies.some(d=>d.status==='cancelled'||d.result==='negative')){
    item.activation='blocked_condition';return;}
  if(condition.kind==='after_completion'){
    if(condition.requiredResult==='positive'&&dependencies.some(d=>d.status==='completed'&&d.result==='unspecified')){
      item.activation='unknown';return;}
    item.activation=dependencies.length>0&&dependencies.every(d=>d.status==='completed'&&
      (condition.requiredResult!=='positive'||d.result==='positive'))?'active':'pending_condition';return;
  }
  const relevant=evaluations.filter(e=>e.workItemId===item.id&&e.authorized===true&&
    e.conditionDigest===stableId('condition',condition));
  const latest=relevant.sort((a,b)=>b.at-a.at||(b.revision??0)-(a.revision??0))[0];
  if(!latest){item.activation='pending_condition';return;}
  item.readRequirements=unique([...item.readRequirements,...latest.readRequirements]);
  // The caller supplies independently verified document/response predicates, not email arrival.
  const supplied=latest.result==='satisfied'&&(condition.kind!=='document_received'||
    latest.documentKey===condition.documentKey&&latest.counterpartyId===condition.counterpartyId&&
    latest.documentAvailable===true&&latest.contentConfirmed===true)&&
    (condition.kind!=='after_response'||latest.relevantResponse===true&&latest.automaticReply!==true);
  item.activation=latest.result==='failed'?'blocked_condition':latest.result==='unknown'?'unknown':
    supplied?'active':'pending_condition';
}

export function resolveWorkItems({events=[],facts=[],decisions=[],signals=[],conditionEvaluations=[],identityDecisions=[]}){
  events=events.map(e=>eventSchema.parse(e));facts=facts.map(f=>factSchema.parse(f));
  validateDecisionGraph(decisions,events,facts);
  const identities=identityDecisions.map(i=>identityDecisionSchema.parse(i)),aliases=new Map();
  for(const i of identities){const e=events.find(e=>e.id===i.eventId);
    requireValue(e&&e.tenantId===i.tenantId&&e.caseId===i.caseId,'WORK_IDENTITY_SCOPE_MISMATCH');
    if(e.workItemId!==i.canonicalWorkItemId){
      requireValue(!aliases.has(e.workItemId)||aliases.get(e.workItemId)===i.canonicalWorkItemId,'WORK_IDENTITY_CONFLICT');
      aliases.set(e.workItemId,i.canonicalWorkItemId);
    }
  }
  const canonical=id=>{const seen=new Set();while(aliases.has(id)){
    requireValue(!seen.has(id),'WORK_IDENTITY_CYCLE');seen.add(id);id=aliases.get(id);}return id;};
  const active=effectiveDecisions(decisions),workItems=[],pending=[],issues=[];
  // Releasing a manual field exposes the latest derived value, not its old pre-override value.
  const order=(a,b)=>a.at-b.at||a.sequence-b.sequence||a.id.localeCompare(b.id);
  const ordered=[...events].sort(order);
  const releases=new Set(ordered.filter(e=>e.manual&&e.kind==='overridden'&&e.payload.operation==='release'&&
    active.some(d=>d.eventId===e.id&&d.outcome==='accepted'&&d.authorization.outcome==='allow'))
    .flatMap(e=>ordered.filter(p=>p.manual&&p.workItemId===e.workItemId&&order(p,e)<0&&
      (p.kind==='overridden'&&p.payload.property===e.payload.property||
        ['due_changed','due_removed'].includes(p.kind)&&e.payload.property==='dueDate'||
        p.kind==='delegated'&&e.payload.property==='owner')).map(p=>p.id)));
  const appliedLogical=new Set();
  for(const event of ordered){
    const ds=active.filter(d=>d.eventId===event.id),decision=ds.find(d=>d.outcome==='accepted'&&
      d.authorization.outcome==='allow'&&d.authorization.capability===eventCapability[event.kind]);
    if(ds.some(d=>['rejected','superseded'].includes(d.outcome)))continue;
    if(!decision||ds.some(d=>d.outcome==='disputed')){pending.push(event.id);continue;}
    if(releases.has(event.id))continue;
    if(appliedLogical.has(event.logicalEventId)){issues.push({eventId:event.id,code:'EVENT_INTERPRETATION_CONFLICT'});continue;}
    if(!event.manual&&!['1','2'].includes(event.sourceLevel)&&event.kind!=='informed'){
      issues.push({eventId:event.id,code:'CONTEXT_CANNOT_CREATE_WORK'});continue;}
    const data=eventValues(event,decision,facts);
    const canonicalId=canonical(event.workItemId),canonicalEvent={...event,workItemId:canonicalId};
    const bindings=identities.filter(i=>canonical(i.canonicalWorkItemId)===canonicalId);
    data.requirements=unique([...data.requirements,...bindings.flatMap(i=>i.readRequirements)]);
    let item=workItems.find(i=>i.id===canonicalId);
    if(!item){if(!creationKinds.has(event.kind)){issues.push({eventId:event.id,code:'WORK_ORIGIN_REQUIRED'});continue;}
      item=newItem(canonicalEvent);workItems.push(item);}
    requireValue(item.tenantId===event.tenantId&&item.caseId===event.caseId,'WORK_EVENT_SCOPE_MISMATCH');
    const error=applyEvent(item,canonicalEvent,decision,data);
    if(error){issues.push({eventId:event.id,code:error});continue;}
    appliedLogical.add(event.logicalEventId);
  }
  const valid=workItems.filter(i=>i.basisEventIds.length);
  // Replacement publication must include both halves in this same full projection.
  for(const e of ordered.filter(e=>e.kind==='replaced'&&appliedLogical.has(e.logicalEventId)))
    requireValue(valid.some(i=>i.id===e.payload.replacementWorkItemId),'WORK_REPLACEMENT_INCOMPLETE');
  for(const item of valid)activate(item,valid,conditionEvaluations);
  // Dependencies can change a completed item's explanation too. Their ACL follows the whole closure.
  for(const item of valid){const seen=new Set(),pending=[item];
    while(pending.length){const next=pending.pop();if(seen.has(next.id))continue;seen.add(next.id);
      item.readRequirements=unique([...item.readRequirements,...next.readRequirements]);
      pending.push(...next.condition.dependsOnWorkItemIds.map(id=>valid.find(i=>i.id===id)).filter(Boolean));}
    if(item.unresolvedReasons.some(r=>r.code==='COMPLETED_CONDITION_DISPUTED'))
      issues.push({eventId:item.basisEventIds.at(-1),code:'COMPLETED_CONDITION_DISPUTED'});
  }
  return {resolverVersion,workItems:valid,signals:signals.map(s=>signalSchema.parse(s)),pendingEventIds:pending,issues};
}

const safeProperties=['id','caseId','actor','counterparty','owner','action','category','status','actionability',
  'optional','assignmentStatus','dueDate','dueResolution','completedAt','condition','activation',
  'unresolvedReasons','sourceMessageId','basisEventIds','propertyEvidence','propertyAuthority'];
const pair=items=>({items:items.length,cases:new Set(items.map(i=>i.caseId)).size});
export function localDay(at){return new Intl.DateTimeFormat('en-CA',
  {timeZone:'Europe/Prague',year:'numeric',month:'2-digit',day:'2-digit'}).format(at);}
export function workItemView(item,{principalId,asOf,overrides=[]}){
  const own=item.owner.kind==='person'&&item.owner.id===principalId;
  const primarySection=item.status==='unresolved'?'review':
    item.status==='open'&&['blocked_condition','unknown'].includes(item.activation)?'review':
    item.status!=='open'||item.activation==='pending_condition'?'information':
    own?item.requiresDecision?'decision':'todo':'waiting';
  const personal=overrides.filter(o=>o.targetId===item.id&&o.scope==='personal'&&o.principalId===principalId&&
    o.startsAt<=asOf&&(o.expiresAt===null||o.expiresAt>asOf)).sort((a,b)=>b.revision-a.revision);
  const snooze=personal.find(o=>o.property==='snoozedUntil');
  const personalState={snoozedUntil:snooze?.operation==='set'?snooze.value:null};
  const nextActionCs=item.status==='completed'?'Práce je dokončená.':item.status==='cancelled'?'Práce je zrušená.':
    primarySection==='review'?'Ověřit uvedený rozpor a podklady.':item.activation==='pending_condition'?
      `Čeká na podmínku: ${item.condition.description}`:primarySection==='waiting'?
        `Čekáte na ${item.owner.label}: ${item.action}`:item.optional?'Reakce je volitelná.':
          item.actionability==='information'?'Informace k případu.':item.action;
  return {item:Object.fromEntries(safeProperties.map(p=>[p,copy(item[p])])),primarySection,
    presentation:item.status==='completed'?'completion_receipt':'standard',nextActionCs,
    explanation:item.dueResolution==='conflicted'?'Práce trvá; termín je sporný.':
      item.unresolvedReasons.some(r=>r.code==='COMPLETED_CONDITION_DISPUTED')?
        'Práce zůstává dokončená, ale její podmínka byla zpochybněna. Ověřte výsledek.':nextActionCs,
    contextIncomplete:item.unresolvedReasons.length>0,personalState};
}

export function projectAttention({projection,principalId,asOf,canRead,overrides=[],
  includeHistory=false,includeDismissed=false,hideSnoozed=false,category,section}){
  const allowed=requirements=>requirements.length>0&&requirements.every(canRead);
  let workItems=projection.workItems.filter(i=>allowed(i.readRequirements)&&
    (includeHistory||!['completed','cancelled'].includes(i.status)||i.status==='completed'&&
      i.completedAt!==null&&i.completedAt<=asOf&&i.completedAt>=asOf-7*day))
    .map(item=>workItemView(item,{principalId,asOf,overrides})).filter(v=>
      (!hideSnoozed||!v.personalState.snoozedUntil)&&(!category||v.item.category===category)&&
      (!section||v.primarySection===section));
  const dispositions=targetId=>overrides.filter(o=>o.targetId===targetId&&
    (o.scope==='shared'||o.principalId===principalId)&&o.property==='disposition'&&
    o.startsAt<=asOf&&(o.expiresAt===null||o.expiresAt>asOf)).sort((a,b)=>b.revision-a.revision)[0];
  const resolution=targetId=>overrides.filter(o=>o.targetId===targetId&&o.scope==='shared'&&o.property==='resolution'&&
    o.startsAt<=asOf&&(o.expiresAt===null||o.expiresAt>asOf)).sort((a,b)=>b.revision-a.revision)[0]?.value;
  let signals=projection.signals.filter(s=>allowed(s.readRequirements)&&
    (includeHistory||(resolution(s.id)??s.status)==='active')&&
    (!category||s.category===category)&&(!section||section==='review')).map(s=>{
    const d=dispositions(s.id);return {signal:Object.fromEntries(['id','caseId','kind','status','text',
      'category','sourceMessageId','at','evidence','reportedDates'].map(k=>[k,copy(s[k])])),
      primarySection:'review',explanation:s.text,disposition:d?.operation==='set'?d.value:null,
      grouping:s.grouping,tenantId:s.tenantId};}).filter(s=>includeDismissed||s.disposition!=='dismissed');
  for(const entry of signals)entry.signal.status=resolution(entry.signal.id)??entry.signal.status;
  const signalGroups=[];
  for(const s of signals){const g=s.grouping;
    const id=g?stableId('group',s.tenantId,'vehicle_notice_5m.v1',s.signal.kind,g.system,g.vehicle,
      Math.floor(g.at/300000)*300000):stableId('group',s.signal.id);
    let group=signalGroups.find(x=>x.id===id);
    if(!group){group={id,ruleVersion:g?'vehicle_notice_5m.v1':'single.v1',memberSignalIds:[],
      visibleSignalCount:0,visibleCaseIds:[],groupingBasis:g?g.timeBasis:'single',incidentCount:null};signalGroups.push(group);}
    group.memberSignalIds.push(s.signal.id);group.visibleSignalCount++;
    group.visibleCaseIds=unique([...group.visibleCaseIds,s.signal.caseId]);
    delete s.grouping;delete s.tenantId;
  }
  workItems.sort((a,b)=>sections.indexOf(a.primarySection)-sections.indexOf(b.primarySection)||
    (a.item.dueDate?.value??'9999').localeCompare(b.item.dueDate?.value??'9999')||a.item.id.localeCompare(b.item.id));
  const items=workItems.map(v=>v.item),active=items.filter(i=>i.status==='open'&&i.activation==='active');
  const deadline=items.filter(i=>i.status==='open'&&i.actionability==='obligation'&&i.dueResolution==='known');
  const today=localDay(asOf),deadlineCounts=list=>({items:list.length,
    activeItems:list.filter(i=>i.activation==='active').length,
    pendingItems:list.filter(i=>i.activation==='pending_condition').length,
    blockedItems:list.filter(i=>['blocked_condition','unknown'].includes(i.activation)).length});
  const counts={activeWorkItems:pair(active),activeObligations:pair(active.filter(i=>i.actionability==='obligation')),
    pendingConditionItems:pair(items.filter(i=>i.status==='open'&&i.activation==='pending_condition')),
    blockedConditionItems:pair(items.filter(i=>i.status==='open'&&['blocked_condition','unknown'].includes(i.activation))),
    unresolvedItems:pair(items.filter(i=>i.status==='unresolved')),
    unresolvedObligations:pair(items.filter(i=>i.status==='unresolved'&&i.actionability==='obligation')),
    optionalItems:pair(items.filter(i=>i.optional)),
    snoozedItems:pair(workItems.filter(v=>v.personalState.snoozedUntil).map(v=>v.item)),
    completionReceipts:pair(workItems.filter(v=>v.presentation==='completion_receipt').map(v=>v.item)),
    attentionSignals:{signals:signals.length,cases:new Set(signals.map(s=>s.signal.caseId)).size},
    signalGroups:{groups:signalGroups.length,cases:new Set(signals.map(s=>s.signal.caseId)).size},
    sections:Object.fromEntries(sections.map(s=>[s,{...pair(workItems.filter(v=>v.primarySection===s).map(v=>v.item)),
      signals:s==='review'?signals.length:0}]))};
  return {schemaVersion:attentionVersion,principalId,asOf,counts,workItems,signals,signalGroups,
    sections:Object.fromEntries(sections.map(s=>[s,{workItemIds:workItems.filter(v=>v.primarySection===s).map(v=>v.item.id),
      signalGroupIds:s==='review'?signalGroups.map(g=>g.id):[]}])),
    deadlineFacet:{workItemIds:deadline.map(i=>i.id),...deadlineCounts(deadline),
      overdueItems:deadlineCounts(deadline.filter(i=>i.dueDate.value<today))}};
}
