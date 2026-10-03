import test from 'node:test';
import assert from 'node:assert/strict';
import { workFixture as setup,alice } from './work-v2-fixtures.mjs';
import { workHash } from '../src/work-v2-contract.mjs';
import { purgeClosedBrainCases } from '../src/brain-sync.mjs';

test('real migration and SQLite persistence: proposals are separate, accepted work survives re-extraction omission',async()=>{
  const f=await setup(),raw=await f.proposal();
  const first=await f.work.refresh({caseId:f.first.caseId},raw);
  assert.equal(first.proposedEvents,1);assert.equal(first.workItems,0);
  assert.equal((await f.work.attention({})).counts.attentionSignals.signals,1);
  const accepted=await f.accept();assert.equal(accepted.workItems,1);
  const v=await f.work.attention({});assert.equal(v.workItems[0].primarySection,'todo');
  assert.equal(v.counts.activeObligations.items,1);
  await f.work.refresh({caseId:f.first.caseId},raw);
  assert.equal((await f.store.first('SELECT COUNT(*) n FROM brain_work_events_v2')).n,1);
  await f.work.refresh({caseId:f.first.caseId},{events:[],signals:[]});
  assert.equal((await f.work.attention({})).counts.activeObligations.items,1);
  await assert.rejects(f.store.run("UPDATE brain_work_events_v2 SET document_json='{}'"),/IMMUTABLE_WORK_EVENT/);
  await assert.rejects(f.store.run("UPDATE brain_work_facts_v2 SET document_json='{}'"),/IMMUTABLE_WORK_FACT/);
});

test('quote mismatch cannot be admitted, and model calls cannot claim human review',async()=>{
  const f=await setup(),raw=await f.proposal();raw.events[0].evidence.action[0].quote='Neexistující citace';
  await f.work.refresh({caseId:f.first.caseId},raw);
  await assert.rejects(f.accept(),/WORK_EVIDENCE_REQUIRED/);
  const detail=await f.work.getCase({caseId:f.first.caseId});
  await assert.rejects(f.work.review({caseId:f.first.caseId,revision:detail.revision,
    eventId:detail.proposals[0].event.id,outcome:'accepted',authorityConfirmed:true},'model'),/WORK_REVIEW_UI_REQUIRED/);
  assert.equal((await f.work.attention({})).counts.activeObligations.items,0);
});

test('write grant is not a semantic/business authority and tenant scopes are rechecked',async()=>{
  const f=await setup();await f.work.refresh({caseId:f.first.caseId},await f.proposal());
  await f.store.run("UPDATE brain_work_authorities_v2 SET enabled=0 WHERE capability='work.manage'");
  await assert.rejects(f.accept(),/WORK_AUTHORITY_REQUIRED/);
  await f.store.run("UPDATE grants SET revoked=1 WHERE principal_id='alice' AND action='read'");
  await assert.rejects(f.work.getCase({caseId:f.first.caseId}),/ACCESS_DENIED/);
});

test('batch failure leaves the last complete revision and no half-published decisions',async()=>{
  const f=await setup();await f.work.refresh({caseId:f.first.caseId},await f.proposal());
  const before=await f.store.first('SELECT * FROM brain_work_heads_v2'),batch=f.db.batch;
  f.sqlite.exec('CREATE TABLE fail_batch(value INTEGER CHECK(value=1))');
  f.db.batch=statements=>batch([...statements,f.db.prepare('INSERT INTO fail_batch VALUES (?)').bind(2)]);
  await assert.rejects(f.accept(),/CHECK constraint failed/);
  f.db.batch=batch;
  const after=await f.store.first('SELECT * FROM brain_work_heads_v2');
  assert.equal(before.published_revision,after.published_revision);assert.equal(before.revision,after.revision);
  assert.equal((await f.store.first('SELECT COUNT(*) n FROM brain_fact_decisions_v2')).n,0);
  assert.equal((await f.work.attention({})).counts.activeObligations.items,0);
  assert.equal((await f.store.rows("SELECT state FROM brain_projection_runs_v2 WHERE state='failed'")).length,1);
});

test('stale revision rejects a second review without overwriting the winning decision',async()=>{
  const f=await setup();await f.work.refresh({caseId:f.first.caseId},await f.proposal());
  const d=await f.work.getCase({caseId:f.first.caseId});await f.accept();
  await assert.rejects(f.work.review({caseId:f.first.caseId,revision:d.revision,eventId:d.proposals[0].event.id,
    outcome:'rejected',authorityConfirmed:false},'soai_session'),/WORK_VERSION_CONFLICT/);
  assert.equal((await f.work.attention({})).counts.activeObligations.items,1);
});

test('pagination pins counts and complete groups; review and revocation expire old cursors',async()=>{
  const f=await setup();await f.work.refresh({caseId:f.first.caseId},await f.proposal());await f.accept();
  const second=await f.add('Pošlu návrh.',2);
  await f.work.refresh({caseId:second.caseId},await f.proposal(second.caseId,second.messageId));
  const first=await f.work.attention({limit:1});assert.ok(first.pagination.nextCursor);
  const next=await f.work.attention({limit:1,cursor:first.pagination.nextCursor});
  assert.equal(next.viewRevision,first.viewRevision);assert.deepEqual(next.counts,first.counts);
  await f.accept(second.caseId);
  await assert.rejects(f.work.attention({limit:1,cursor:first.pagination.nextCursor}),/VIEW_EXPIRED/);
  const latest=await f.work.attention({limit:1});
  await f.store.run("UPDATE grants SET revoked=1 WHERE principal_id='alice' AND action='read'");
  await assert.rejects(f.work.attention({limit:1,cursor:latest.pagination.nextCursor}),/VIEW_EXPIRED/);
});

test('a failed refresh serves safe stale V2, invalidated source never resurrects V1',async()=>{
  const f=await setup();await f.work.refresh({caseId:f.first.caseId},await f.proposal());await f.accept();
  await f.add('Doplňující zpráva.',3,'<v2-1@example.test>');
  f.work.analyzer=async()=>{throw Error('WORK_ANALYSIS_UNAVAILABLE');};
  await assert.rejects(f.work.refresh({caseId:f.first.caseId}),/WORK_ANALYSIS_UNAVAILABLE/);
  const stale=await f.work.attention({});assert.equal(stale.projectionSelections[0].mode,'v2_stale');
  assert.equal(stale.counts.activeObligations.items,1);assert.equal(stale.coverage.complete,false);
  await f.store.run('UPDATE brain_messages SET content_hash=? WHERE id=?',workHash('different-source'),f.first.messageId);
  const unavailable=await f.work.attention({});
  assert.equal(unavailable.projectionSelections[0].mode,'v2_unavailable');
  assert.equal(unavailable.workItems.length,0);assert.equal(unavailable.legacyFallback.length,0);
});

test('semantic correction atomically supersedes the old interpretation without cancelling or duplicating work',async()=>{
  const f=await setup(),raw=await f.proposal();
  await f.work.refresh({caseId:f.first.caseId},raw);await f.accept();
  const old=(await f.work.getCase({caseId:f.first.caseId})),id=old.projection.workItems[0].item.id;
  raw.events[0].action='Předat konkrétní podklady';
  await f.work.refresh({caseId:f.first.caseId},raw);
  let detail=await f.work.getCase({caseId:f.first.caseId});
  await assert.rejects(f.accept(),/WORK_INTERPRETATION_REVIEW_REQUIRED/);
  await f.work.review({caseId:f.first.caseId,revision:detail.revision,eventId:detail.proposals[0].event.id,
    outcome:'accepted',authorityConfirmed:true,identityRelation:'same_work',canonicalWorkItemId:id,
    replacesEventIds:[old.acceptedInterpretations[0].id]},'soai_session');
  detail=await f.work.getCase({caseId:f.first.caseId});
  assert.equal(detail.projection.workItems.length,1);assert.equal(detail.projection.workItems[0].item.id,id);
  assert.equal(detail.projection.workItems[0].item.action,'Předat konkrétní podklady');
  assert.equal(detail.projection.workItems[0].item.status,'open');assert.equal(detail.proposals.length,0);
  const events=await f.store.rows('SELECT document_json FROM brain_work_events_v2');
  assert.equal(events.some(e=>JSON.parse(e.document_json).kind==='cancelled'),false);
});

test('personal actions are idempotent and cannot change shared status; manual closure requires explicit correction binding',async()=>{
  const f=await setup(),raw=await f.proposal();await f.work.refresh({caseId:f.first.caseId},raw);await f.accept();
  let detail=await f.work.getCase({caseId:f.first.caseId}),targetId=detail.projection.workItems[0].item.id;
  const command={caseId:f.first.caseId,revision:detail.revision,requestId:crypto.randomUUID(),scope:'personal',
    action:'snooze',targetId,until:f.now()+86400000};
  const first=await f.work.action(command);assert.deepEqual(await f.work.action(command),first);
  assert.equal((await f.work.attention({})).counts.activeObligations.items,1);
  await assert.rejects(f.work.action({...command,action:'completed',requestId:crypto.randomUUID(),revision:first.revision}),/WORK_PERSONAL_SCOPE_INVALID/);
  await f.work.action({...command,scope:'shared',action:'completed',payload:{result:'positive'},
    requestId:crypto.randomUUID(),revision:first.revision},'soai_session');
  detail=await f.work.getCase({caseId:f.first.caseId});
  assert.equal(detail.projection.workItems[0].item.status,'completed');
  const oldEvent=detail.acceptedInterpretations[0].id;
  raw.events[0].action='Jiný výklad původní činnosti';await f.work.refresh({caseId:f.first.caseId},raw);
  detail=await f.work.getCase({caseId:f.first.caseId});
  const correction={caseId:f.first.caseId,revision:detail.revision,eventId:detail.proposals[0].event.id,
    outcome:'accepted',authorityConfirmed:true,identityRelation:'same_work',canonicalWorkItemId:targetId,replacesEventIds:[oldEvent]};
  await assert.rejects(f.work.review(correction,'soai_session'),/WORK_MANUAL_BINDING_REQUIRED/);
  await f.work.review({...correction,manualBinding:'retain'},'soai_session');
  detail=await f.work.getCase({caseId:f.first.caseId});assert.equal(detail.projection.workItems[0].item.status,'completed');
  await f.work.action({caseId:f.first.caseId,revision:detail.revision,requestId:crypto.randomUUID(),scope:'shared',
    action:'reopened',targetId,payload:{releaseProtection:true,retainDue:false},note:'Nová kontrola výsledku'},'soai_session');
  detail=await f.work.getCase({caseId:f.first.caseId});assert.equal(detail.projection.workItems[0].item.status,'open');
});

test('changed notice wording stays source-attributed and its old immutable version does not resurrect on review',async()=>{
  const f=await setup(),raw=await f.proposal(),cite=raw.events[0].evidence.action[0];
  raw.signals=[{messageId:f.first.messageId,kind:'notification',text:'FALEŠNÉ TVRZENÍ: zaplaceno',category:'receipt',
    evidence:[cite],vehicle:null,system:null,reportedDates:[]}];raw.events=[];
  await f.work.refresh({caseId:f.first.caseId},raw);
  let view=await f.work.attention({});assert.equal(view.signals.length,1);
  assert.equal(view.signals[0].explanation.includes('FALEŠNÉ'),false);
  raw.signals[0].kind='conditional_notice';await f.work.refresh({caseId:f.first.caseId},raw);
  assert.equal((await f.work.attention({})).signals.length,1);
  await f.work.refresh({caseId:f.first.caseId},await f.proposal());await f.accept();
  view=await f.work.attention({});assert.equal(view.signals.length,0);assert.equal(view.workItems.length,1);
});

test('manual creation, replacement, closure and one-year retention execute atomically through real SQL',async()=>{
  const f=await setup();await f.work.refresh({caseId:f.first.caseId},await f.proposal());await f.accept();
  let detail=await f.work.getCase({caseId:f.first.caseId});const oldId=detail.projection.workItems[0].item.id;
  const command={caseId:f.first.caseId,revision:detail.revision,requestId:crypto.randomUUID(),scope:'shared',
    action:'replaced',targetId:oldId,payload:{action:'Zkontrolovat nový návrh',owner:alice},note:'Zadání bylo změněno'};
  await f.work.action(command,'soai_session');detail=await f.work.getCase({caseId:f.first.caseId});
  assert.equal(detail.projection.workItems.length,2);assert.equal(detail.projection.workItems.find(v=>v.item.id===oldId).item.status,'cancelled');
  assert.equal(detail.projection.counts.activeObligations.items,1);
  await f.work.action({caseId:f.first.caseId,revision:detail.revision,requestId:crypto.randomUUID(),scope:'shared',
    action:'close_case',payload:{result:'positive'},note:'Kontrola všech otevřených prací dokončena'},'soai_session');
  detail=await f.work.getCase({caseId:f.first.caseId});assert.equal(detail.projection.counts.activeObligations.items,0);
  assert.equal((await purgeClosedBrainCases(f)).deleted,0);
  f.setTime(f.now()+366*86400000);
  assert.equal((await purgeClosedBrainCases(f)).deleted,1);
  assert.equal((await f.store.first('SELECT COUNT(*) n FROM brain_work_events_v2')).n,0);
  assert.equal((await f.store.first('SELECT COUNT(*) n FROM brain_projection_revisions_v2')).n,0);
});

test('personal dismissal cannot resolve a shared signal; shared resolution requires its own capability',async()=>{
  const f=await setup();await f.work.refresh({caseId:f.first.caseId},{events:[],signals:[]});
  let detail=await f.work.getCase({caseId:f.first.caseId}),targetId=detail.projection.signals[0].signal.id;
  const command={caseId:f.first.caseId,revision:detail.revision,requestId:crypto.randomUUID(),scope:'shared',action:'resolve_signal',targetId};
  await assert.rejects(f.work.action(command,'soai_session'),/WORK_AUTHORITY_REQUIRED/);
  await f.store.run(`INSERT INTO brain_work_authorities_v2
    (tenant_id,principal_id,mailbox_id,capability,enabled,approved_by,approved_at)
    VALUES ('tenant-a','alice','mail-a','signals.manage_shared',1,'admin',?)`,f.now());
  await f.work.action(command,'soai_session');
  assert.equal((await f.work.attention({})).signals.length,0);
  detail=await f.work.getCase({caseId:f.first.caseId});assert.equal(detail.projection.signals[0].signal.status,'resolved');
});

test('source change and a write-grant revocation immediately before publication fail the atomic guard',async()=>{
  const f=await setup();await f.work.refresh({caseId:f.first.caseId},await f.proposal());
  const batch=f.db.batch;
  f.db.batch=async statements=>{await f.store.run("UPDATE grants SET revoked=1 WHERE principal_id='alice' AND action='write'");return batch(statements);};
  await assert.rejects(f.accept(),/WORK_VERSION_CONFLICT/);
  assert.equal((await f.store.first('SELECT COUNT(*) n FROM brain_fact_decisions_v2')).n,0);
  f.db.batch=batch;await f.store.run("UPDATE grants SET revoked=0 WHERE principal_id='alice' AND action='write'");
  f.db.batch=async statements=>{await f.store.run('UPDATE brain_messages SET content_hash=? WHERE id=?',workHash('changed'),f.first.messageId);return batch(statements);};
  await assert.rejects(f.accept(),/WORK_VERSION_CONFLICT/);
  assert.equal((await f.store.first('SELECT COUNT(*) n FROM brain_fact_decisions_v2')).n,0);
});

test('daily model budget and running lease bound extraction independently of accepted decisions',async()=>{
  const f=await setup();f.env.MAIL_BRAIN_V2_DAILY_CALL_LIMIT='1';let calls=0;
  f.work.analyzer=async()=>{calls++;return f.proposal();};
  await f.work.refresh({caseId:f.first.caseId});await f.accept();
  await assert.rejects(f.work.refresh({caseId:f.first.caseId}),/WORK_DAILY_ANALYSIS_LIMIT/);
  assert.equal(calls,1);assert.equal((await f.work.attention({})).counts.activeObligations.items,1);
  await f.store.run('UPDATE brain_work_heads_v2 SET analysis_lease_until=?',f.now()+60000);
  await assert.rejects(f.work.refresh({caseId:f.first.caseId}),/WORK_ANALYSIS_BUSY/);
  assert.equal(calls,1);
});

test('a new source keeps manual publication stale and prevents retention, including a arrival at delete CAS',async()=>{
  for(const concurrent of [false,true]){
    const f=await setup();await f.work.refresh({caseId:f.first.caseId},await f.proposal());await f.accept();
    let d=await f.work.getCase({caseId:f.first.caseId});
    await f.work.action({caseId:f.first.caseId,revision:d.revision,requestId:crypto.randomUUID(),scope:'shared',
      action:'close_case',payload:{result:'positive'},note:'Vše ověřeno'},'soai_session');
    f.setTime(f.now()+366*86400000);
    const add=()=>f.add('Nové zadání čeká na vyhodnocení.',2,'<v2-1@example.test>');
    if(concurrent){const batch=f.db.batch;f.db.batch=async statements=>{f.db.batch=batch;await add();return batch(statements);};}
    else await add();
    assert.equal((await purgeClosedBrainCases(f)).deleted,0);
    d=await f.work.getCase({caseId:f.first.caseId});
    assert.equal(d.mode,'v2_stale');
    await f.work.action({caseId:f.first.caseId,revision:d.revision,requestId:crypto.randomUUID(),scope:'shared',
      action:'reopened',targetId:d.projection.workItems[0].item.id,payload:{releaseProtection:true},note:'Nová kontrola'},'soai_session');
    assert.equal((await f.work.getCase({caseId:f.first.caseId})).mode,'v2_stale');
    await f.work.refresh({caseId:f.first.caseId},{events:[],signals:[]});
    d=await f.work.getCase({caseId:f.first.caseId});assert.equal(d.mode,'v2_current');
    assert.equal(d.projection.signals.some(v=>v.signal.kind==='source_gap'),true);
  }
});

test('conditional work needs accepted condition evidence, and automatic replies cannot satisfy it',async()=>{
  const f=await setup(),raw=await f.proposal();
  raw.events[0].condition={...raw.events[0].condition,kind:'after_response',description:'Věcná odpověď dodavatele'};
  raw.events[0].evidence.condition=[];
  await f.work.refresh({caseId:f.first.caseId},raw);
  await assert.rejects(f.accept(),/WORK_EVIDENCE_REQUIRED/);
  raw.events[0].evidence.condition=raw.events[0].evidence.action;
  await f.work.refresh({caseId:f.first.caseId},raw);
  let detail=await f.work.getCase({caseId:f.first.caseId});
  // Reject the invalid older proposal, then admit the independently checked interpretation.
  await f.work.review({caseId:f.first.caseId,revision:detail.revision,eventId:detail.proposals.find(p=>
    p.facts.some(f=>f.property==='condition'&&f.validation==='invalid')).event.id,outcome:'rejected'},'soai_session');
  await f.accept();
  detail=await f.work.getCase({caseId:f.first.caseId});
  assert.equal(detail.projection.workItems[0].item.activation,'pending_condition');
  const response=await f.add('Potvrzujeme automaticky příjem.',2,'<v2-1@example.test>','vendor@example.test');
  await f.store.run("UPDATE brain_messages SET subject='Automatická odpověď' WHERE id=?",response.messageId);
  const command={caseId:f.first.caseId,revision:detail.revision,requestId:crypto.randomUUID(),scope:'shared',
    action:'condition_evaluated',targetId:detail.projection.workItems[0].item.id,note:'Přečteno',
    conditionEvaluation:{result:'satisfied',contentConfirmed:true,messageId:response.messageId,relevantResponse:true}};
  await assert.rejects(f.work.action(command,'soai_session'),/WORK_AUTOMATIC_RESPONSE/);
  const actual=await f.add('Doplňuji konkrétní odpověď.',3,'<v2-1@example.test>','vendor@example.test');
  await f.work.action({...command,conditionEvaluation:{...command.conditionEvaluation,messageId:actual.messageId}},'soai_session');
  assert.equal((await f.work.getCase({caseId:f.first.caseId})).projection.workItems[0].item.activation,'active');
});

test('document predicate requires the correct correspondent, current attachment hash and explicit content review',async()=>{
  const f=await setup(),raw=await f.proposal();
  raw.events[0].condition={...raw.events[0].condition,kind:'document_received',documentKey:'potvrzení-zůstatku',
    description:'Potvrzení zůstatku od dodavatele'};
  await f.work.refresh({caseId:f.first.caseId},raw);await f.accept();
  let digest=workHash('fixture-pdf');
  f.provider.inspectPdfAttachments=async()=>[{index:0,isPdf:true,sha256:digest,size:12}];
  const attachment={filename:'potvrzeni.pdf',contentType:'application/pdf',size:12};
  const wrong=await f.add('Zde je soubor.',2,'<v2-1@example.test>','somebody@example.test',[attachment]);
  const right=await f.add('Požadovaný dokument přikládám.',3,'<v2-1@example.test>','vendor@example.test',[attachment]);
  const wrongId=(await f.store.first('SELECT id FROM brain_attachments WHERE message_id=?',wrong.messageId)).id;
  const rightId=(await f.store.first('SELECT id FROM brain_attachments WHERE message_id=?',right.messageId)).id;
  let d=await f.work.getCase({caseId:f.first.caseId});
  const command={caseId:f.first.caseId,revision:d.revision,requestId:crypto.randomUUID(),scope:'shared',
    action:'condition_evaluated',targetId:d.projection.workItems[0].item.id,note:'Obsah potvrzení osobně ověřen',
    conditionEvaluation:{result:'satisfied',contentConfirmed:true,attachmentId:wrongId}};
  await assert.rejects(f.work.action(command,'soai_session'),/WORK_COUNTERPARTY_MISMATCH/);
  command.conditionEvaluation.attachmentId=rightId;command.conditionEvaluation.contentConfirmed=false;
  await assert.rejects(f.work.action(command,'soai_session'),/WORK_CONDITION_REVIEW_REQUIRED/);
  command.conditionEvaluation.contentConfirmed=true;digest=workHash('changed-pdf');
  await assert.rejects(f.work.action(command,'soai_session'),/WORK_DOCUMENT_UNAVAILABLE/);
  digest=workHash('fixture-pdf');
  await f.store.run("UPDATE brain_attachments SET scan_status='pending' WHERE id=?",rightId);
  await f.work.action(command,'soai_session');
  d=await f.work.getCase({caseId:f.first.caseId});assert.equal(d.projection.workItems[0].item.activation,'active');
});

test('V2 case response cannot carry contradictory V1 classifications and commitments',async()=>{
  const f=await setup();await f.work.refresh({caseId:f.first.caseId},await f.proposal());await f.accept();
  await f.store.run("UPDATE brain_cases SET state='decision',reason='PRIVATE LEGACY INFERENCE' WHERE id=?",f.first.caseId);
  const detail=await f.brain.getCase({caseId:f.first.caseId,version:'2.2'});
  assert.equal(JSON.stringify(detail).includes('PRIVATE LEGACY INFERENCE'),false);
  assert.equal(Object.hasOwn(detail.case,'state'),false);assert.equal(Object.hasOwn(detail,'commitments'),false);
  assert.equal(detail.work.projection.workItems[0].primarySection,'todo');
  assert.equal((await f.brain.getCase({caseId:f.first.caseId})).work.projection.workItems[0].primarySection,'todo');
  f.env.MAIL_BRAIN_V2_ENABLED='false';
  await assert.rejects(f.brain.getCase({caseId:f.first.caseId}),/WORK_V2_PAUSED/);
  await assert.rejects(f.brain.attention({mailboxId:'mail-a'}),/WORK_V2_PAUSED/);
});
