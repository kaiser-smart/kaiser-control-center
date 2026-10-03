import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveWorkItems,projectAttention } from '../src/work-v2-resolver.mjs';
import { stableId,workHash,noCondition,eventCapability,validateEvidence,dateIsSupported,sourceSegments }
  from '../src/work-v2-contract.mjs';

// Synthetic, explicitly reviewed facts. These are resolver tests, not model accuracy results.
const now=Date.parse('2026-10-01T00:00:00Z'),at=now-2*86400000;
const person=(id,label=id)=>({kind:'person',id,label,address:`${id}@example.test`});
const alice=person('alice'),bob=person('bob');
const external={kind:'external',id:'vendor',label:'Dodavatel',address:'vendor@example.test'};
const date=value=>({kind:'date',value,timeZone:'Europe/Prague'});
function inputs(){return {events:[],facts:[],decisions:[],signals:[]};}
function add(data,workId,kind,payload={},options={}){
  const sequence=data.events.length,id=`event-${sequence}`,caseId=options.caseId??`case-${workId}`;
  const defaults={existence:true,actor:alice,owner:alice,counterparty:external,
    action:'Odeslat požadované podklady',category:'other',condition:noCondition()};
  const values={...(['requested','promised','offered','informed','delivered','created_manually'].includes(kind)?defaults:{}),...payload};
  const control=['retainDue','releaseProtection','property','operation','replacementWorkItemId','acceptanceKind','requiresDecision'];
  const bindings={};
  for(const [property,value] of Object.entries(values).filter(([key])=>!control.includes(key))){
    const factId=`fact-${sequence}-${property}`;bindings[property]=[factId];
    data.facts.push({id:factId,tenantId:'tenant',caseId,workItemId:workId,property,value,
      evidence:[],validation:'valid',supersedesFactId:null});
  }
  const event={id,logicalEventId:`logical-${sequence}`,tenantId:'tenant',caseId,workItemId:workId,
    kind,at:options.at??at+sequence,sourceMessageId:options.manual?null:`source-${sequence}`,
    sourceActId:`act-${sequence}`,taskSlotId:'slot-0',sourceLevel:options.level??'1',
    payload:Object.fromEntries(Object.entries(values).filter(([k])=>k!=='existence')),
    factBindings:bindings,readRequirements:options.requirements??['mailbox:mail-a'],manual:options.manual??false};
  data.events.push(event);
  data.decisions.push({id:`decision-${sequence}`,eventId:id,outcome:options.outcome??'accepted',
    acceptedFactIds:Object.values(bindings).flat(),replacesDecisionIds:[],reviewerId:'reviewer',
    semanticBasis:'human_review',policyId:'fixture-authority',policyVersion:'1',
    authorization:{outcome:options.authorized===false?'unknown':'allow',capability:eventCapability[kind],
      actorId:values.actor?.id??'alice',workItemId:workId},at:at+sequence});
  return event;
}
function signal(data,caseId,kind='notification',grouping=null){const id=`signal-${data.signals.length}`;
  data.signals.push({id,tenantId:'tenant',caseId,kind,status:'active',text:'Zdroj oznámil událost.',
    category:'other',sourceMessageId:`source-${id}`,at,evidence:[],readRequirements:['mailbox:mail-a'],
    grouping,reportedDates:[]});return id;}
const view=(data,options={})=>projectAttention({projection:resolveWorkItems(data),principalId:'alice',
  asOf:now,canRead:()=>true,...options});

test('twenty synthetic audited scenarios keep 17 work items, 5 active obligations and 7 signals separate',()=>{
  const d=inputs();
  add(d,'audit','delivered',{category:'audit'},{caseId:'case-1'});
  add(d,'permit','requested',{owner:bob,dueDate:date('2026-12-31')},{caseId:'case-2'});
  const verify=add(d,'verify','requested',{owner:bob},{caseId:'case-3'});
  add(d,'pay','requested',{owner:bob,dueDate:date('2026-10-08'),condition:{...noCondition(),
    kind:'after_completion',dependsOnWorkItemIds:[verify.workItemId],requiredResult:'positive',
    description:'Kladné ověření účtu'}},{caseId:'case-3'});
  add(d,'receipt','delivered',{category:'receipt'},{caseId:'case-4'});
  add(d,'bank','requested',{owner:external},{caseId:'case-5'});
  add(d,'forward','promised',{condition:{...noCondition(),kind:'document_received',
    documentKey:'balance-2026-03-31',counterpartyId:'vendor',description:'Doručení potvrzení zůstatku'}},
  {caseId:'case-5'});signal(d,'case-5','source_gap');
  add(d,'campaign','requested',{owner:bob},{caseId:'case-6'});
  add(d,'cookie','promised',{}, {caseId:'case-6'});
  for(const [n,category] of [[7,'summary'],[8,'invoice'],[9,'newsletter'],[10,'marketing'],
    [13,'contract'],[18,'newsletter'],[20,'newsletter']])add(d,`info-${n}`,'informed',{category},
      {caseId:`case-${n}`,level:'3'});
  const grouping={system:'vehicle-provider',vehicle:'TEST-VEHICLE-1',at,timeBasis:'received_at'};
  signal(d,'case-11','notification',grouping);signal(d,'case-12','notification',{...grouping,at:at+120000});
  signal(d,'case-14');add(d,'optional','offered',{}, {caseId:'case-15'});
  signal(d,'case-16','conditional_notice');signal(d,'case-17','source_gap');signal(d,'case-19');
  const result=view(d);
  const expected=[
    [1,[['audit','completed','not_applicable','information']],0],
    [2,[['permit','open','active','waiting']],0],
    [3,[['verify','open','active','waiting'],['pay','open','pending_condition','information']],0],
    [4,[['receipt','completed','not_applicable','information']],0],
    [5,[['bank','open','active','waiting'],['forward','open','pending_condition','information']],1],
    [6,[['campaign','open','active','waiting'],['cookie','open','active','todo']],0],
    ...[7,8,9,10,13,18,20].map(n=>[n,[[`info-${n}`,'informational','not_applicable','information']],0]),
    ...[11,12,14,16,17,19].map(n=>[n,[],1]),
    [15,[['optional','informational','not_applicable','information']],0],
  ];
  assert.equal(expected.length,20);
  for(const [n,items,signalCount] of expected){
    const actual=result.workItems.filter(v=>v.item.caseId===`case-${n}`).map(v=>
      [v.item.id,v.item.status,v.item.activation,v.primarySection]);
    assert.deepEqual(actual.sort(),items.sort(),`case ${n}`);
    assert.equal(result.signals.filter(v=>v.signal.caseId===`case-${n}`).length,signalCount,`signals in case ${n}`);
  }
  assert.equal(result.workItems.find(v=>v.item.id==='verify').item.dueDate,null);
  assert.equal(result.workItems.find(v=>v.item.id==='pay').item.dueDate.value,'2026-10-08');
  assert.equal(result.workItems.length,17);
  assert.deepEqual(result.counts.activeObligations,{items:5,cases:4});
  assert.deepEqual(result.counts.pendingConditionItems,{items:2,cases:2});
  assert.equal(result.counts.optionalItems.items,1);
  assert.equal(result.counts.attentionSignals.signals,7);
  assert.equal(result.counts.signalGroups.groups,6);
  assert.equal(result.counts.sections.todo.items,1);
  assert.equal(result.counts.sections.waiting.items,4);
  assert.equal(result.counts.sections.information.items,12);
  assert.equal(result.deadlineFacet.items,2);
  assert.equal(result.deadlineFacet.activeItems,1);
  assert.equal(result.deadlineFacet.pendingItems,1);
});

test('a due-date conflict retains the active obligation without a fabricated date',()=>{
  const d=inputs();add(d,'task','requested',{owner:bob});
  const e=add(d,'task','due_changed',{dueDate:date('2026-10-08')});
  const duplicate={...d.facts.at(-1),id:'other-date',value:date('2026-10-09')};d.facts.push(duplicate);
  e.factBindings.dueDate.push(duplicate.id);d.decisions.at(-1).acceptedFactIds.push(duplicate.id);
  const v=view(d),item=v.workItems[0].item;
  assert.equal(item.status,'open');assert.equal(item.dueResolution,'conflicted');assert.equal(item.dueDate,null);
  assert.equal(v.counts.activeObligations.items,1);assert.equal(v.deadlineFacet.items,0);
});

test('due removal is explicit and does not cancel work; a date omitted in new extraction changes nothing',()=>{
  const d=inputs();add(d,'task','promised',{dueDate:date('2026-10-08')});
  add(d,'task','accepted',{});
  assert.equal(view(d).workItems[0].item.dueDate.value,'2026-10-08');
  add(d,'task','due_removed',{});
  assert.equal(view(d).workItems[0].item.dueResolution,'removed');
  assert.equal(view(d).counts.activeObligations.items,1);
});

test('unaccepted and unauthorized proposals never silently replace accepted work',()=>{
  const d=inputs();add(d,'task','promised');
  add(d,'task','cancelled',{}, {authorized:false});
  assert.equal(view(d).counts.activeObligations.items,1);
  assert.equal(resolveWorkItems(d).pendingEventIds.length,1);
  const e=inputs();add(e,'task','requested',{}, {outcome:'disputed'});
  assert.equal(view(e).workItems.length,0);
});

test('unknown owner is unresolved obligation, not completed work',()=>{
  const d=inputs();add(d,'task','requested',{owner:{kind:'unknown',id:null,label:'Nejasný vlastník',address:null}});
  assert.equal(view(d).counts.unresolvedObligations.items,1);
  assert.equal(view(d).counts.activeObligations.items,0);
});

test('failed or cancelled predecessor blocks a successor without cancelling it',()=>{
  for(const kind of ['cancelled','completed']){
    const d=inputs();add(d,'verify','requested');
    add(d,'pay','requested',{condition:{...noCondition(),kind:'after_completion',
      dependsOnWorkItemIds:['verify'],requiredResult:'positive',description:'Kladné ověření'}});
    add(d,'verify',kind,{result:'negative'});
    const item=view(d).workItems.find(v=>v.item.id==='pay').item;
    assert.equal(item.status,'open');assert.equal(item.activation,'blocked_condition');
  }
});

test('disputing a condition never reopens completed work or leaks a hidden predecessor',()=>{
  const d=inputs();add(d,'verify','requested');
  add(d,'forward','promised',{condition:{...noCondition(),kind:'after_completion',dependsOnWorkItemIds:['verify'],
    requiredResult:'positive',description:'Kladné ověření předchůdce'}});
  add(d,'verify','completed',{result:'positive'});add(d,'forward','completed',{result:'positive'},{manual:true});
  add(d,'verify','reopened',{releaseProtection:true},{manual:true,requirements:['mailbox:mail-secret']});
  const complete=view(d).workItems.find(v=>v.item.id==='forward');
  assert.equal(complete.item.status,'completed');
  assert.ok(complete.item.unresolvedReasons.some(r=>r.code==='COMPLETED_CONDITION_DISPUTED'));
  assert.equal(view(d,{canRead:r=>r!=='mailbox:mail-secret'}).workItems.some(v=>v.item.id==='forward'),false);
});

test('conflicting activation conditions remain visible without silently choosing an active predicate',()=>{
  const d=inputs();add(d,'task','promised');
  const event=d.events[0],first=d.facts.find(f=>f.property==='condition');
  const other={...first,id:'different-condition',value:{...noCondition(),kind:'document_received',
    description:'Doručení dokumentu',documentKey:'statement',counterpartyId:'vendor'}};
  d.facts.push(other);event.factBindings.condition.push(other.id);d.decisions[0].acceptedFactIds.push(other.id);
  const result=view(d);assert.equal(result.workItems[0].item.status,'open');
  assert.equal(result.workItems[0].item.activation,'unknown');assert.equal(result.workItems[0].primarySection,'review');
  assert.equal(result.counts.activeObligations.items,0);assert.equal(result.counts.blockedConditionItems.items,1);
});

test('positive completion activates successor; document metadata and automatic response do not',()=>{
  const d=inputs();add(d,'verify','requested');
  add(d,'pay','requested',{condition:{...noCondition(),kind:'after_completion',
    dependsOnWorkItemIds:['verify'],requiredResult:'positive',description:'Ověření'}});
  add(d,'verify','completed',{result:'positive'});
  assert.equal(view(d).workItems.find(v=>v.item.id==='pay').item.activation,'active');
  const condition={...noCondition(),kind:'document_received',documentKey:'balance',
    counterpartyId:'vendor',description:'Potvrzení zůstatku'};
  add(d,'forward','promised',{condition});
  d.conditionEvaluations=[{workItemId:'forward',authorized:true,conditionDigest:stableId('condition',condition),
    result:'satisfied',at,readRequirements:['mailbox:mail-a'],documentKey:'balance',counterpartyId:'vendor',
    documentAvailable:true,contentConfirmed:false,automaticReply:true}];
  assert.equal(view(d).workItems.find(v=>v.item.id==='forward').item.activation,'pending_condition');
  d.conditionEvaluations[0].contentConfirmed=true;d.conditionEvaluations[0].automaticReply=false;
  assert.equal(view(d).workItems.find(v=>v.item.id==='forward').item.activation,'active');
});

test('manual closure survives a later source event and explicit reopening removes old due by default',()=>{
  const d=inputs();add(d,'task','promised',{dueDate:date('2026-10-08')});
  add(d,'task','completed',{}, {manual:true});add(d,'task','promised');
  assert.equal(view(d).workItems[0].item.status,'completed');
  add(d,'task','reopened',{releaseProtection:true,retainDue:false},{manual:true});
  assert.equal(view(d).workItems[0].item.status,'open');
  assert.equal(view(d).workItems[0].item.dueResolution,'absent');
});

test('personal snooze keeps the obligation count and never changes another person view',()=>{
  const d=inputs();add(d,'task','promised');
  const overrides=[{targetId:'task',principalId:'alice',scope:'personal',property:'snoozedUntil',
    operation:'set',value:now+day,startsAt:now-1,expiresAt:now+day,revision:1}];
  const a=view(d,{overrides}),b=view(d,{overrides,principalId:'bob'});
  assert.equal(a.counts.activeObligations.items,1);assert.equal(a.counts.snoozedItems.items,1);
  assert.equal(b.counts.snoozedItems.items,0);assert.equal(b.workItems[0].primarySection,'waiting');
});
const day=86400000;

test('mixed-source ACL removes the whole item, counts and dates before grouping',()=>{
  const d=inputs();add(d,'task','promised',{dueDate:date('2026-10-08')},
    {requirements:['mailbox:mail-a','mailbox:mail-secret']});
  const first=signal(d,'case-a','notification',{system:'car',vehicle:'TEST-1',at,timeBasis:'received_at'});
  signal(d,'case-b','notification',{system:'car',vehicle:'TEST-1',at,timeBasis:'received_at'});
  d.signals[1].readRequirements=['mailbox:mail-secret'];
  const v=view(d,{canRead:r=>r==='mailbox:mail-a'});
  assert.equal(v.workItems.length,0);assert.equal(v.counts.activeObligations.items,0);
  assert.equal(v.deadlineFacet.items,0);assert.equal(v.signals.length,1);
  assert.deepEqual(v.signalGroups[0].memberSignalIds,[first]);
  assert.equal(v.signalGroups[0].visibleCaseIds.length,1);
  assert.equal(JSON.stringify(v).includes('mail-secret'),false);
});

test('signal acknowledgement is personal, dismissal changes only that filtered result',()=>{
  const d=inputs(),id=signal(d,'case');
  const override={targetId:id,principalId:'alice',scope:'personal',property:'disposition',operation:'set',
    startsAt:at,expiresAt:null,revision:1,value:'acknowledged'};
  assert.equal(view(d,{overrides:[override]}).signals.length,1);
  override.value='dismissed';
  assert.equal(view(d,{overrides:[override]}).signals.length,0);
  assert.equal(view(d,{overrides:[override],principalId:'bob'}).signals.length,1);
  assert.equal(view(d,{overrides:[override],includeDismissed:true}).signals.length,1);
});

test('completion receipt is the same work item for seven days, then history',()=>{
  const d=inputs();add(d,'delivery','delivered',{}, {at:now-6*day});
  assert.equal(view(d).workItems[0].presentation,'completion_receipt');
  assert.equal(view(d,{asOf:now+2*day}).workItems.length,0);
  assert.equal(view(d,{asOf:now+2*day,includeHistory:true}).workItems[0].item.id,'delivery');
});

test('source-level reports cannot create obligations even with a human acceptance error',()=>{
  const d=inputs();add(d,'summary-payment','requested',{}, {level:'3'});
  assert.equal(view(d).workItems.length,0);
  assert.equal(resolveWorkItems(d).issues[0].code,'CONTEXT_CANNOT_CREATE_WORK');
});

test('evidence validation separates authored text, subject date and quoted history',()=>{
  const source={id:'source',content_hash:workHash('mime'),authored_text:'Prosím ověřit účet.',
    subject:'Faktura, splatnost 8. 10. 2026',body_text:'Prosím ověřit účet.\n> Zaplatím zítra.'};
  const ref=(scope,text)=>({messageId:'source',scope,quote:text,start:source[scope==='quoted_history'?'body_text':scope].indexOf(text),
    end:source[scope==='quoted_history'?'body_text':scope].indexOf(text)+text.length,
    sourceHash:source.content_hash,sourceLevel:'1'});
  assert.equal(validateEvidence(ref('authored_text','Prosím ověřit účet.'),[source],{property:'action'}),'valid');
  assert.equal(validateEvidence(ref('subject','8. 10. 2026'),[source],{property:'dueDate'}),'valid');
  assert.equal(validateEvidence(ref('subject','8. 10. 2026'),[source],{property:'existence'}),'context_only');
  assert.equal(validateEvidence(ref('quoted_history','Zaplatím zítra.'),[source],{property:'action'}),'context_only');
  assert.equal(dateIsSupported(date('2026-10-08'),[ref('subject','8. 10. 2026')]),true);
  assert.equal(dateIsSupported(date('2026-10-09'),[ref('subject','8. 10. 2026')]),false);
  assert.deepEqual(sourceSegments(source),sourceSegments({...source,subject:'Other title'}));
});
