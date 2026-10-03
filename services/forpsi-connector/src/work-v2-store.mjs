import { createHmac,timingSafeEqual } from 'node:crypto';
import { requireValue } from './errors.mjs';
import { stableId,workHash,stableJson,eventSchema,factSchema,decisionSchema,signalSchema,
  effectiveDecisions,eventCapability,validateEvidence,resolverVersion,payloadSchema,identityDecisionSchema,correspondentId } from './work-v2-contract.mjs';
import { resolveWorkItems,projectAttention } from './work-v2-resolver.mjs';
import { analyzeWorkCase,extractionInput,normalizeWorkExtraction,extractionSchema,workExtractionInstructions } from './work-v2-extraction.mjs';

const decode=rows=>rows.map(r=>JSON.parse(r.document_json));
const safeCode=e=>/^(WORK|VIEW|ACCESS|BRAIN)_[A-Z0-9_]+$/.test(e?.message??'')?e.message:'WORK_PROJECTION_FAILED';
const keyNames=new Set(['mailboxId','includeHistory','includeDismissed','hideSnoozed','category','section']);
const filtersOf=args=>Object.fromEntries(Object.entries(args).filter(([k,v])=>keyNames.has(k)&&v!==undefined));
const tables={events:'brain_work_events_v2',facts:'brain_work_facts_v2',decisions:'brain_fact_decisions_v2',
  signals:'brain_work_signals_v2',overrides:'brain_work_overrides_v2',conditionEvaluations:'brain_condition_evaluations_v2',
  identityDecisions:'brain_work_identity_decisions_v2'};

export class WorkStoreV2 {
  constructor(brain,{analyzer=analyzeWorkCase}={}){this.brain=brain;this.store=brain.store;
    this.env=brain.env;this.principal=brain.principal;this.now=brain.now;this.analyzer=analyzer;}
  enabled(){requireValue(this.env.MAIL_BRAIN_ENABLED==='true'&&this.env.MAIL_BRAIN_V2_ENABLED==='true',
    'WORK_V2_DISABLED');}
  analysisMode(){return this.env.MAIL_BRAIN_V2_ANALYSIS_MODE==='api'?'api':'chatgpt';}
  async access(caseId){this.enabled();return this.brain.caseAccess(caseId);}
  async analysisQueue({mailboxId,limit=5,afterCaseId}={}){
    const view=await this.attention({mailboxId,limit:1});
    const pending=view.projectionSelections.filter(s=>s.mode!=='v2_current');
    const page=pending.filter(s=>!afterCaseId||s.caseId>afterCaseId).slice(0,limit);
    return {analysisSource:'chatgpt',cases:page.map(s=>({caseId:s.caseId,mode:s.mode})),
      totalPending:pending.length,nextAfterCaseId:page.length&&pending.some(s=>s.caseId>page.at(-1).caseId)?page.at(-1).caseId:null,
      coverage:view.coverage,mailboxes:view.mailboxes.map(b=>({id:b.id,address:b.address,coverage:b.coverage})),
      nextStep:'For each selected case call prepare_work_analysis, interpret the returned untrusted messages in this conversation, then submit_work_analysis. Render the saved overview with render_attention. No separate model API is called.'};
  }
  async analysisContext(caseId){
    const {row,mailbox}=await this.access(caseId),head=await this.head(row),context=await this.sourceContext(row);
    const authorization=await this.authorizationState();
    requireValue(context.messages.every(m=>m.tenant_id===authorization.tenantId&&
      authorization.mailboxIds.includes(m.mailbox_id)),'ACCESS_DENIED');
    const docs=await this.documents(caseId),selected=await this.loadProjection(row,head,{context,
      revision:head.published_revision?await this.store.first('SELECT * FROM brain_projection_revisions_v2 WHERE id=?',head.published_revision):null});
    const projection=selected.projection??{workItems:[],signals:[]};
    const canRead=await this.readRequirements({workItems:[...projection.workItems,...docs.events],signals:projection.signals},authorization);
    requireValue([...projection.workItems,...projection.signals,...docs.events].every(item=>
      item.readRequirements.every(canRead)),'ACCESS_DENIED');
    const entities=await this.entities(row.tenant_id),input=extractionInput(context.messages,
      {mailboxAddress:mailbox.address,knownItems:projection.workItems,entities});
    requireValue(Buffer.byteLength(JSON.stringify(input))<=60000,'WORK_CONTEXT_LIMIT');
    return {row,mailbox,head,context,docs,selected,entities,authorization,input};
  }
  analysisSignature(payload){
    requireValue(typeof this.env.OUTBOX_KEY==='string','WORK_CURSOR_NOT_CONFIGURED');
    return createHmac('sha256',this.env.OUTBOX_KEY).update(`work-v2-analysis:${payload}`).digest('base64url');
  }
  readAnalysisToken(token,caseId){
    const parts=token.split('.');requireValue(parts.length===2,'WORK_ANALYSIS_CONTEXT_INVALID');
    const signature=this.analysisSignature(parts[0]);
    requireValue(Buffer.byteLength(signature)===Buffer.byteLength(parts[1])&&
      timingSafeEqual(Buffer.from(signature),Buffer.from(parts[1])),'WORK_ANALYSIS_CONTEXT_INVALID');
    let binding;try{binding=JSON.parse(Buffer.from(parts[0],'base64url').toString('utf8'));}
    catch{requireValue(false,'WORK_ANALYSIS_CONTEXT_INVALID');}
    requireValue(binding.version===1&&binding.caseId===caseId&&binding.principalId===this.principal.id,
      'WORK_ANALYSIS_CONTEXT_INVALID');
    requireValue(binding.expiresAt>this.now(),'WORK_ANALYSIS_CONTEXT_EXPIRED');return binding;
  }
  assertAnalysisBinding(binding,prepared){
    const {row,head,context,authorization,input}=prepared;
    requireValue(binding.tenantId===row.tenant_id&&binding.authorizationDigest===authorization.digest,'WORK_ANALYSIS_CONTEXT_CHANGED');
    requireValue(binding.caseRevision===context.inputRevision&&binding.sourceDigest===context.inputDigest,
      'WORK_SOURCE_CHANGED');
    requireValue(binding.revision===head.revision&&binding.inputHash===workHash(input),'WORK_ANALYSIS_CONTEXT_CHANGED');
  }
  async prepareAnalysis({caseId}){
    const prepared=await this.analysisContext(caseId),{row,head,context,authorization,input}=prepared;
    const binding={version:1,requestId:crypto.randomUUID(),caseId,principalId:this.principal.id,
      tenantId:row.tenant_id,revision:head.revision,caseRevision:context.inputRevision,sourceDigest:context.inputDigest,
      authorizationDigest:authorization.digest,inputHash:workHash(input),expiresAt:this.now()+900000};
    const payload=Buffer.from(JSON.stringify(binding)).toString('base64url');
    await this.access(caseId);
    requireValue((await this.authorizationState()).digest===authorization.digest,'WORK_ANALYSIS_CONTEXT_CHANGED');
    requireValue(await this.sourceBindingsCurrent(context.messages.map(m=>
      ({id:m.id,hash:m.content_hash,mailboxId:m.mailbox_id,caseId}))),'WORK_SOURCE_CHANGED');
    return {caseId,analysisSource:'chatgpt',analysisToken:`${payload}.${this.analysisSignature(payload)}`,
      expiresAt:binding.expiresAt,instructions:workExtractionInstructions,input,untrustedContent:true,
      nextStep:'Use this conversation to interpret input. Submit only proposals with submit_work_analysis and the unchanged analysisToken. Never call a separate model API or claim that a proposal is human-approved.'};
  }
  async submitAnalysis({caseId,analysisToken,analysis}){
    const binding=this.readAnalysisToken(analysisToken,caseId),raw=extractionSchema.parse(analysis);
    requireValue(Buffer.byteLength(JSON.stringify(raw))<=120000,'WORK_ANALYSIS_INVALID_OUTPUT');
    const prepared=await this.analysisContext(caseId),requestId=`analysis:${binding.requestId}`,
      requestHash=workHash({kind:'chatgpt_analysis',analysisToken,analysis:raw});
    const prior=await this.store.first(`SELECT * FROM brain_work_commands_v2 WHERE principal_id=? AND request_id=?`,
      this.principal.id,requestId);
    if(prior){
      requireValue(prior.case_id===caseId&&prior.request_hash===requestHash,'WORK_REQUEST_CONFLICT');
      requireValue(binding.authorizationDigest===prepared.authorization.digest,'WORK_ANALYSIS_CONTEXT_CHANGED');
      requireValue(binding.sourceDigest===prepared.context.inputDigest,'WORK_SOURCE_CHANGED');
      return JSON.parse(prior.result_json);
    }
    this.assertAnalysisBinding(binding,prepared);
    const result={caseId,revision:prepared.head.revision+1,analysisSource:'chatgpt',saved:true,
      nextStep:'Read the saved result with case_get or render_attention. Proposals are not accepted work; semantic approval still requires an authorized person in SO.ai.'};
    const receipt=this.documentInsert('brain_work_commands_v2',['principal_id','request_id','case_id',
      'request_hash','result_json','created_at'],[this.principal.id,requestId,caseId,requestHash,stableJson(result),this.now()]);
    await this.refresh({caseId},raw,{binding,prepared,statements:[receipt],runKind:'chatgpt'});return result;
  }
  async authority(mailbox,capability){
    this.brain.requirePilotMutations();
    await this.brain.access(mailbox.id,'write');
    const row=await this.store.first(`SELECT * FROM brain_work_authorities_v2 WHERE tenant_id=?
      AND principal_id=? AND mailbox_id=? AND capability=? AND enabled=1`,
    mailbox.tenant_id,this.principal.id,mailbox.id,capability);
    requireValue(row,'WORK_AUTHORITY_REQUIRED');return row;
  }
  async head(row){
    await this.store.run(`INSERT OR IGNORE INTO brain_work_heads_v2(case_id,tenant_id,updated_at)
      VALUES (?,?,?)`,row.id,row.tenant_id,this.now());
    return this.store.first('SELECT * FROM brain_work_heads_v2 WHERE case_id=? AND tenant_id=?',row.id,row.tenant_id);
  }
  async sourceContext(row){
    const messages=await this.store.rows(`SELECT * FROM brain_messages WHERE tenant_id=? AND case_id=?
      ORDER BY received_at,id LIMIT 201`,row.tenant_id,row.id);
    requireValue(messages.length<=200,'WORK_CONTEXT_LIMIT');
    return {messages,inputDigest:workHash(messages.map(m=>[m.id,m.content_hash,m.mailbox_id,m.case_id])),
      inputRevision:row.revision};
  }
  async documents(caseId){
    const result={};
    for(const [key,table] of Object.entries(tables))result[key]=decode(await this.store.rows(
      `SELECT document_json FROM ${table} WHERE case_id=? ORDER BY created_at,id`,caseId));
    const selections=decode(await this.store.rows(`SELECT document_json FROM brain_signal_selections_v2
      WHERE case_id=? ORDER BY revision DESC,id DESC`,caseId));
    result.signals=result.signals.filter(s=>{const latest=selections.find(x=>x.sourceMessageId===s.sourceMessageId);
      return !latest||latest.signalIds.includes(s.id);});
    return result;
  }
  async entities(tenantId){return this.store.rows(`SELECT id,kind,label,address FROM brain_entities_v2
    WHERE tenant_id=? ORDER BY id LIMIT 500`,tenantId);}
  async loadProjection(row,head,prefetched){
    if(!head?.published_revision)return {mode:head?.ever_published?'v2_unavailable':'legacy',projection:null};
    const revision=prefetched?prefetched.revision:await this.store.first(`SELECT * FROM brain_projection_revisions_v2
      WHERE id=? AND case_id=? AND tenant_id=?`,head.published_revision,row.id,row.tenant_id);
    if(!revision||revision.guard_revision!==head.guard_revision||workHash(revision.document_json)!==revision.document_hash)
      return {mode:'v2_unavailable',projection:null};
    let projection;try{projection=JSON.parse(revision.document_json);}catch{return {mode:'v2_unavailable',projection:null};}
    const context=prefetched?.context??await this.sourceContext(row);
    if((projection.sourceDigests??[]).some(source=>!context.messages.some(m=>m.id===source.id&&
      m.content_hash===source.hash&&m.mailbox_id===source.mailboxId)))
      return {mode:'v2_unavailable',projection:null};
    const failed=prefetched?prefetched.failed:await this.store.first(`SELECT id FROM brain_projection_runs_v2
      WHERE case_id=? AND run_kind IN ('extraction','chatgpt') AND state='failed' AND decision_revision>=? LIMIT 1`,row.id,revision.decision_revision);
    const mode=revision.input_digest===context.inputDigest&&projection.analyzedInputDigest===context.inputDigest&&
      revision.decision_revision===head.revision&&!failed?
      'v2_current':'v2_stale';
    return {mode,projection,revision:revision.id,at:revision.created_at};
  }
  async publish(row,base,documents,runId,context,{guardChange=false,statements=[],requiredCapabilities=[],analysisComplete=false,
    sourceAuthorizations=[]}={}){
    for(const decision of effectiveDecisions(documents.decisions).filter(d=>d.outcome==='accepted')){
      const event=documents.events.find(e=>e.id===decision.eventId);if(event?.manual)continue;
      for(const factId of decision.acceptedFactIds){const fact=documents.facts.find(f=>f.id===factId);
        requireValue(fact&&fact.validation==='valid'&&fact.evidence.length>0&&fact.evidence.every(ref=>
          validateEvidence(ref,context.messages,{property:fact.property,eventKind:event.kind})==='valid'),'WORK_SOURCE_CHANGED');
      }
    }
    const resolved=resolveWorkItems(documents),revision=crypto.randomUUID(),token=crypto.randomUUID();
    const pending=new Set(resolved.pendingEventIds);
    const signals=resolved.signals.filter(s=>s.kind!=='proposal_review');
    for(const event of documents.events.filter(e=>pending.has(e.id)))signals.push({
      id:stableId('review',event.id),tenantId:row.tenant_id,caseId:row.id,kind:'proposal_review',status:'active',
      text:'Nový výklad zprávy čeká na ověření vlastníka, činnosti a pravomoci.',category:'unknown',
      sourceMessageId:event.sourceMessageId,at:event.at,evidence:[],readRequirements:event.readRequirements,
      grouping:null,reportedDates:[]});
    for(const issue of resolved.issues){const event=documents.events.find(e=>e.id===issue.eventId);
      if(event)signals.push({id:stableId('issue',event.id,issue.code),tenantId:row.tenant_id,caseId:row.id,
        kind:'source_gap',status:'active',text:'Změnu práce nelze bezpečně použít. Otevřete podklady případu.',
        category:'unknown',sourceMessageId:event.sourceMessageId,at:event.at,evidence:[],
        readRequirements:event.readRequirements,grouping:null,reportedDates:[]});}
    const prior=base.published_revision?await this.store.first('SELECT document_json FROM brain_projection_revisions_v2 WHERE id=?',base.published_revision):null;
    const previous=prior?JSON.parse(prior.document_json):{};
    const projection={...resolved,signals,analyzedInputDigest:analysisComplete?context.inputDigest:previous.analyzedInputDigest??null,
      analyzedInputRevision:analysisComplete?context.inputRevision:previous.analyzedInputRevision??null,
      sourceDigests:context.messages.map(m=>
      ({id:m.id,hash:m.content_hash,mailboxId:m.mailbox_id}))};
    const document=stableJson(projection),next=base.revision+1,guard=base.guard_revision+(guardChange?1:0);
    const db=this.store.db;
    const unchanged=`EXISTS (SELECT 1 FROM brain_cases WHERE id=? AND revision=?)`;
    const sourcesUnchanged=`(SELECT COUNT(*) FROM brain_messages WHERE case_id=?)=?
      AND NOT EXISTS (SELECT 1 FROM brain_messages m LEFT JOIN json_each(?) s ON json_extract(s.value,'$.id')=m.id
        WHERE m.case_id=? AND (s.value IS NULL OR m.content_hash!=json_extract(s.value,'$.hash')
          OR m.mailbox_id!=json_extract(s.value,'$.mailboxId')))`;
    const authorized=`EXISTS (SELECT 1 FROM principals p JOIN grants g ON g.principal_id=p.id
      JOIN mailboxes m ON m.id=g.mailbox_id AND m.tenant_id=p.tenant_id
      JOIN brain_consents c ON c.mailbox_id=m.id AND c.principal_id=p.id AND c.tenant_id=p.tenant_id
      WHERE p.id=? AND p.active=1 AND m.id=? AND m.active=1 AND g.action='read' AND g.revoked=0
      AND c.revoked_at IS NULL)`;
    const capabilities=requiredCapabilities.map(()=>`EXISTS (SELECT 1 FROM brain_work_authorities_v2 a
      JOIN grants g ON g.principal_id=a.principal_id AND g.mailbox_id=a.mailbox_id AND g.action='write' AND g.revoked=0
      WHERE a.tenant_id=? AND a.principal_id=? AND a.mailbox_id=? AND a.capability=? AND a.enabled=1)`).join(' AND ');
    const allSourcesAuthorized=`NOT EXISTS (SELECT 1 FROM json_each(?) required WHERE NOT EXISTS (
      SELECT 1 FROM principals p JOIN grants g ON g.principal_id=p.id
      JOIN mailboxes m ON m.id=g.mailbox_id AND m.tenant_id=p.tenant_id
      JOIN brain_consents c ON c.mailbox_id=m.id AND c.principal_id=p.id AND c.tenant_id=p.tenant_id
      WHERE p.id=? AND p.active=1 AND m.id=json_extract(required.value,'$.id') AND m.active=1
        AND g.action='read' AND g.revoked=0 AND c.revoked_at IS NULL
        AND c.consented_at=json_extract(required.value,'$.consentedAt')))`;
    const owns=`EXISTS (SELECT 1 FROM brain_work_heads_v2 WHERE case_id=? AND mutation_token=?)`;
    await this.store.run(`UPDATE brain_projection_runs_v2 SET state='validated',candidate_revision=? WHERE id=?`,revision,runId);
    const batch=[db.prepare(`UPDATE brain_work_heads_v2 SET revision=?,guard_revision=?,
      published_revision=?,ever_published=1,mutation_token=?,updated_at=? WHERE case_id=? AND revision=?
      AND guard_revision=? AND ${unchanged} AND ${sourcesUnchanged} AND ${authorized}
      AND ${allSourcesAuthorized}${capabilities?` AND ${capabilities}`:''}`)
      .bind(next,guard,revision,token,this.now(),row.id,base.revision,base.guard_revision,row.id,
        context.inputRevision,row.id,context.messages.length,stableJson(context.messages.map(m=>
          ({id:m.id,hash:m.content_hash,mailboxId:m.mailbox_id}))),row.id,this.principal.id,row.mailbox_id,
        stableJson(sourceAuthorizations),this.principal.id,...requiredCapabilities.flatMap(cap=>
          [row.tenant_id,this.principal.id,row.mailbox_id,cap]))];
    // Every statement is guarded by the winning CAS token. A failed CAS leaves no partial facts or revision.
    for(const statement of statements)batch.push(statement({owns,args:[row.id,token],revision:next}));
    batch.push(db.prepare(`INSERT INTO brain_projection_revisions_v2
      (id,tenant_id,case_id,input_revision,input_digest,decision_revision,guard_revision,
      document_json,document_hash,created_at) SELECT ?,?,?,?,?,?,?,?,?,? WHERE ${owns}`)
      .bind(revision,row.tenant_id,row.id,context.inputRevision,context.inputDigest,next,guard,
        document,workHash(document),this.now(),row.id,token));
    batch.push(db.prepare(`UPDATE brain_projection_runs_v2 SET state='published',published_revision=?,
      finished_at=? WHERE id=? AND ${owns}`).bind(revision,this.now(),runId,row.id,token));
    const results=await db.batch(batch);
    if(results[0]?.meta?.changes!==1){await this.failRun(runId,'WORK_VERSION_CONFLICT','aborted');
      requireValue(false,'WORK_VERSION_CONFLICT');}
    await this.access(row.id);const auth=await this.authorizationState(),canRead=await this.readRequirements(projection,auth);
    const view=projectAttention({projection,principalId:this.principal.id,asOf:this.now(),canRead,overrides:documents.overrides});
    return {caseId:row.id,revision:next,projectionRevision:revision,
      mode:projection.analyzedInputDigest===context.inputDigest?'v2_current':'v2_stale',
      proposedEvents:documents.events.filter(e=>pending.has(e.id)&&e.readRequirements.every(canRead)).length,
      workItems:view.workItems.length,signals:view.signals.length};
  }
  async startRun(row,head,context,kind='projection'){const id=crypto.randomUUID();
    const limit=Math.max(0,Math.min(500,Number(this.env.MAIL_BRAIN_V2_DAILY_CALL_LIMIT??0)||0));
    const result=await this.store.run(`INSERT INTO brain_projection_runs_v2
      (id,tenant_id,case_id,input_revision,input_digest,resolver_version,decision_revision,state,started_at,run_kind)
      SELECT ?,?,?,?,?,?,?,'running',?,? WHERE ?!='extraction' OR
        (SELECT COUNT(*) FROM brain_projection_runs_v2 WHERE tenant_id=? AND run_kind='extraction' AND started_at>=?)<?`,
    id,row.tenant_id,row.id,context.inputRevision,context.inputDigest,resolverVersion,head.revision,
    this.now(),kind,kind,row.tenant_id,Math.floor(this.now()/86400000)*86400000,limit);
    requireValue(result.meta?.changes===1,'WORK_DAILY_ANALYSIS_LIMIT');return id;}
  async failRun(id,code,state='failed'){await this.store.run(`UPDATE brain_projection_runs_v2
    SET state=?,finished_at=?,failure_code=? WHERE id=? AND state!='published'`,state,this.now(),code,id);}
  documentInsert(table,columns,values){return ({owns,args})=>this.store.db.prepare(
    `INSERT OR IGNORE INTO ${table} (${columns.join(',')}) SELECT ${values.map(()=>'?').join(',')} WHERE ${owns}`)
    .bind(...values,...args);}
  proposalStatements(bundle,row){const now=this.now(),statements=[];
    for(const event of bundle.events)statements.push(this.documentInsert(tables.events,
      ['id','tenant_id','case_id','work_item_id','logical_event_id','document_json','created_at'],
      [event.id,row.tenant_id,row.id,event.workItemId,event.logicalEventId,stableJson(event),now]));
    for(const fact of bundle.facts)statements.push(this.documentInsert(tables.facts,
      ['id','tenant_id','case_id','work_item_id','document_json','created_at'],
      [fact.id,row.tenant_id,row.id,fact.workItemId,stableJson(fact),now]));
    for(const signal of bundle.signals)statements.push(this.documentInsert(tables.signals,
      ['id','tenant_id','case_id','document_json','created_at'],[signal.id,row.tenant_id,row.id,stableJson(signal),now]));
    return statements;
  }
  async refresh({caseId},provided,{binding,prepared,statements:extraStatements=[],runKind}={}){
    requireValue(provided!==undefined||this.analysisMode()==='api','WORK_CHATGPT_ANALYSIS_REQUIRED');
    const {row,mailbox}=prepared??await this.access(caseId),head=prepared?.head??await this.head(row),
      context=prepared?.context??await this.sourceContext(row);
    const leaseToken=crypto.randomUUID();
    const lease=await this.store.run(`UPDATE brain_work_heads_v2 SET analysis_token=?,analysis_lease_until=?
      WHERE case_id=? AND analysis_lease_until<=?`,leaseToken,this.now()+120000,caseId,this.now());
    requireValue(lease.meta?.changes===1,'WORK_ANALYSIS_BUSY');
    let runId;
    try{
      if(binding)this.assertAnalysisBinding(binding,prepared);
      runId=await this.startRun(row,head,context,runKind??(provided===undefined?'extraction':'projection'));
      const docs=prepared?.docs??await this.documents(caseId),selected=prepared?.selected??await this.loadProjection(row,head),
        entities=prepared?.entities??await this.entities(row.tenant_id);
      const raw=provided??await this.analyzer(extractionInput(context.messages,{mailboxAddress:mailbox.address,
        knownItems:selected.projection?.workItems??[],entities}),this.env);
      await this.access(caseId);
      const bundle=normalizeWorkExtraction(raw,context.messages,{tenantId:row.tenant_id,caseId,
        mailboxId:mailbox.id,knownItems:selected.projection?.workItems??[],
        knownSourceIds:[...docs.events,...docs.signals].map(e=>e.sourceMessageId),entities});
      for(const key of ['events','facts','signals'])for(const item of bundle[key]){
        const prior=docs[key].find(x=>x.id===item.id);
        requireValue(!prior||stableJson(prior)===stableJson(item),'WORK_IDENTITY_CONFLICT');
        if(!prior)docs[key].push(item);
      }
      // Each extraction has one current notice per source. Old immutable signal rows stay in the audit.
      // The selection is persisted atomically with the full revision and never rewrites shared work.
      const replacedSources=new Set([...bundle.signals,...bundle.events].map(s=>s.sourceMessageId));
      const currentSignalIds=new Set(bundle.signals.map(s=>s.id));
      docs.signals=docs.signals.filter(s=>!replacedSources.has(s.sourceMessageId)||currentSignalIds.has(s.id));
      const statements=[...this.proposalStatements(bundle,row),...extraStatements];
      for(const sourceMessageId of replacedSources){const selection={id:crypto.randomUUID(),sourceMessageId,
        signalIds:bundle.signals.filter(s=>s.sourceMessageId===sourceMessageId).map(s=>s.id)};
        statements.push(this.documentInsert('brain_signal_selections_v2',
          ['id','tenant_id','case_id','source_message_id','revision','document_json','created_at'],
          [selection.id,row.tenant_id,caseId,sourceMessageId,head.revision+1,stableJson(selection),this.now()]));}
      if(binding){
        requireValue((await this.authorizationState()).digest===binding.authorizationDigest,'WORK_ANALYSIS_CONTEXT_CHANGED');
        requireValue(workHash(extractionInput(context.messages,{mailboxAddress:mailbox.address,
          knownItems:selected.projection?.workItems??[],entities:await this.entities(row.tenant_id)}))===binding.inputHash,
          'WORK_ANALYSIS_CONTEXT_CHANGED');
      }
      return await this.publish(row,head,docs,runId,context,{statements,analysisComplete:true,
        sourceAuthorizations:prepared?.authorization.consents.filter(c=>context.messages.some(m=>m.mailbox_id===c.id))??[]});
    }catch(error){if(runId)await this.failRun(runId,safeCode(error));throw error;}
    finally{await this.store.run(`UPDATE brain_work_heads_v2 SET analysis_lease_until=0,analysis_token=NULL
      WHERE case_id=? AND analysis_token=?`,caseId,leaseToken);}
  }
  async refreshNext(mailbox){
    if(this.analysisMode()==='chatgpt')return {attempted:0,errorCode:null,analysisSource:'chatgpt'};
    const row=await this.store.first(`SELECT c.id FROM brain_cases c
      LEFT JOIN brain_work_heads_v2 h ON h.case_id=c.id
      LEFT JOIN brain_projection_revisions_v2 r ON r.id=h.published_revision
      WHERE c.tenant_id=? AND c.mailbox_id=? AND c.merged_into_case_id IS NULL
      AND (r.id IS NULL OR COALESCE(json_extract(r.document_json,'$.analyzedInputRevision'),-1)!=c.revision)
      AND COALESCE(h.analysis_lease_until,0)<=? AND NOT EXISTS (
        SELECT 1 FROM brain_projection_runs_v2 run WHERE run.case_id=c.id AND run.run_kind='extraction'
          AND run.state IN ('failed','running','validated') AND run.started_at>?)
      ORDER BY CASE WHEN r.id IS NOT NULL THEN 0 ELSE 1 END,c.latest_at DESC,c.id LIMIT 1`,
    mailbox.tenant_id,mailbox.id,this.now(),this.now()-1800000);
    if(!row)return {attempted:0,errorCode:null};
    try{return {attempted:1,result:await this.refresh({caseId:row.id}),errorCode:null};}
    catch(error){return {attempted:1,caseId:row.id,errorCode:safeCode(error)};}
  }
  async review({caseId,revision,eventId,outcome,authorityConfirmed,replacesEventIds=[],
    canonicalWorkItemId,identityRelation,manualBinding},approvalSource){
    requireValue(approvalSource==='soai_session','WORK_REVIEW_UI_REQUIRED');
    const {row,mailbox}=await this.access(caseId);
    const authority=await this.authority(mailbox,'facts.review');
    const head=await this.head(row);requireValue(head.revision===revision,'WORK_VERSION_CONFLICT');
    const context=await this.sourceContext(row),docs=await this.documents(caseId);
    const event=docs.events.find(e=>e.id===eventId);requireValue(event,'WORK_EVENT_NOT_FOUND');
    requireValue(!event.manual,'WORK_MANUAL_REVIEW_FORBIDDEN');
    requireValue(['accepted','rejected','disputed'].includes(outcome),'WORK_INVALID_DECISION');
    const active=effectiveDecisions(docs.decisions),statements=[],decisions=[];
    const current=resolveWorkItems(docs),acceptedEvents=docs.events.filter(e=>
      active.some(d=>d.eventId===e.id&&d.outcome==='accepted'));
    const replacementEvents=replacesEventIds.map(id=>acceptedEvents.find(e=>e.id===id));
    requireValue(replacementEvents.every(e=>e&&!e.manual&&e.id!==eventId&&e.sourceMessageId===event.sourceMessageId),
      'WORK_REPLACEMENT_INVALID');
    const related=acceptedEvents.filter(e=>e.id!==eventId&&e.logicalEventId===event.logicalEventId);
    const canonicalId=canonicalWorkItemId??event.workItemId;
    const oldItem=current.workItems.find(i=>i.id===canonicalId);
    const originConflict=['requested','promised','offered','informed','delivered'].includes(event.kind)&&
      !current.workItems.some(i=>i.id===event.workItemId)&&acceptedEvents.some(e=>
        !e.manual&&e.sourceMessageId===event.sourceMessageId&&e.id!==event.id);
    const manualEvents=acceptedEvents.filter(e=>e.manual&&oldItem?.basisEventIds.includes(e.id));
    requireValue(outcome==='accepted'||(!replacesEventIds.length&&!canonicalWorkItemId&&!identityRelation&&!manualBinding),
      'WORK_CORRECTION_REQUIRES_ACCEPTANCE');
    if(outcome==='accepted'){
      await this.authority(mailbox,'work.manage');
      requireValue(authorityConfirmed===true,'WORK_AUTHORITY_CONFIRMATION_REQUIRED');
      requireValue(related.every(e=>replacesEventIds.includes(e.id)),'WORK_INTERPRETATION_REVIEW_REQUIRED');
      if(originConflict)requireValue(['same_work','distinct_work'].includes(identityRelation),'WORK_IDENTITY_REVIEW_REQUIRED');
      if(replacementEvents.length||canonicalId!==event.workItemId){
        requireValue(identityRelation==='same_work'&&oldItem,'WORK_IDENTITY_REVIEW_REQUIRED');
        requireValue(replacementEvents.every(e=>oldItem.basisEventIds.includes(e.id)),'WORK_IDENTITY_SCOPE_MISMATCH');
        requireValue(!manualEvents.length||['retain','release'].includes(manualBinding),'WORK_MANUAL_BINDING_REQUIRED');
        const identity=identityDecisionSchema.parse({id:crypto.randomUUID(),tenantId:row.tenant_id,caseId,
          eventId,sourceActIds:[...new Set([event,...replacementEvents].map(e=>e.sourceActId))],
          taskSlotIds:[...new Set([event,...replacementEvents].map(e=>e.taskSlotId))],relation:'same_work',
          canonicalWorkItemId:canonicalId,relatedWorkItemIds:[...new Set([event,...replacementEvents].map(e=>e.workItemId))],
          replacedEventIds:replacesEventIds,manualEventIds:manualEvents.map(e=>e.id),manualBinding:manualBinding??null,
          reviewerId:this.principal.id,expectedRevision:revision,at:this.now(),
          readRequirements:[...new Set([event,...replacementEvents,...manualEvents].flatMap(e=>e.readRequirements))]});
        docs.identityDecisions.push(identity);
        statements.push(this.documentInsert(tables.identityDecisions,['id','tenant_id','case_id','document_json','created_at'],
          [identity.id,row.tenant_id,caseId,stableJson(identity),this.now()]));
        for(const old of [...replacementEvents,...(manualBinding==='release'?manualEvents:[])]){
          const replaced=decisionSchema.parse({id:crypto.randomUUID(),eventId:old.id,outcome:'superseded',
            acceptedFactIds:[],replacesDecisionIds:active.filter(d=>d.eventId===old.id).map(d=>d.id),
            reviewerId:this.principal.id,semanticBasis:'human_review',policyId:'mailbox-explicit-correction',
            policyVersion:String(authority.revision),authorization:{outcome:'allow',capability:eventCapability[old.kind],
              actorId:this.principal.id,workItemId:old.workItemId},at:this.now()});
          decisions.push(replaced);
        }
      }else if(identityRelation==='distinct_work'){
        const identity=identityDecisionSchema.parse({id:crypto.randomUUID(),tenantId:row.tenant_id,caseId,eventId,
          sourceActIds:[event.sourceActId],taskSlotIds:[event.taskSlotId],relation:'distinct_work',
          canonicalWorkItemId:event.workItemId,relatedWorkItemIds:[],replacedEventIds:[],manualEventIds:[],
          manualBinding:null,reviewerId:this.principal.id,expectedRevision:revision,at:this.now(),
          readRequirements:event.readRequirements});docs.identityDecisions.push(identity);
        statements.push(this.documentInsert(tables.identityDecisions,['id','tenant_id','case_id','document_json','created_at'],
          [identity.id,row.tenant_id,caseId,stableJson(identity),this.now()]));
      }
      const required=['requested','promised','offered','delivered','informed'].includes(event.kind)?
        ['existence','actor','action']:event.kind==='delegated'?['actor','owner']:
        event.kind==='due_changed'?['actor','dueDate']:event.kind==='due_removed'?['actor','dueDate']:['actor'];
      if(event.payload.condition?.kind!=='none'&&event.payload.condition)required.push('condition');
      for(const property of required)requireValue(event.factBindings[property]?.length,'WORK_EVIDENCE_REQUIRED');
      for(const factId of Object.values(event.factBindings).flat()){
        const fact=docs.facts.find(f=>f.id===factId);requireValue(fact,'WORK_FACT_NOT_FOUND');
        // Invalid optional findings are omitted; critical findings cannot be waved through by a model.
        if(required.includes(fact.property))requireValue(fact.validation==='valid','WORK_EVIDENCE_REQUIRED');
        if(fact.validation==='valid')requireValue(fact.evidence.every(r=>
          validateEvidence(r,context.messages,{property:fact.property,eventKind:event.kind})==='valid'),
        'WORK_SOURCE_CHANGED');
      }
    }
    const decision=decisionSchema.parse({id:crypto.randomUUID(),eventId,outcome,
      acceptedFactIds:outcome==='accepted'?Object.values(event.factBindings).flat().filter(id=>
        docs.facts.find(f=>f.id===id)?.validation==='valid'):[],
      replacesDecisionIds:effectiveDecisions(docs.decisions).filter(d=>d.eventId===eventId).map(d=>d.id),
      reviewerId:this.principal.id,semanticBasis:'human_review',policyId:'mailbox-explicit-review',
      policyVersion:String(authority.revision),authorization:{outcome:outcome==='accepted'?'allow':'unknown',
        capability:eventCapability[event.kind],actorId:event.payload.actor?.id??event.payload.actor?.address??'unknown',
        workItemId:event.workItemId},at:this.now()});
    decisions.push(decision);docs.decisions.push(...decisions);
    if(outcome==='accepted')requireValue(!resolveWorkItems(docs).issues.some(i=>i.eventId===eventId),'WORK_INVALID_TRANSITION');
    const runId=await this.startRun(row,head,context);
    try{
      await this.authority(mailbox,'facts.review');await this.access(caseId);
      for(const d of decisions)statements.push(({owns,args,revision:next})=>this.store.db.prepare(`INSERT INTO brain_fact_decisions_v2
        (id,tenant_id,case_id,event_id,revision,document_json,created_at) SELECT ?,?,?,?,?,?,? WHERE ${owns}`)
        .bind(d.id,row.tenant_id,row.id,d.eventId,next,stableJson(d),this.now(),...args));
      return await this.publish(row,head,docs,runId,context,{guardChange:true,statements,
        requiredCapabilities:outcome==='accepted'?['facts.review','work.manage']:['facts.review']});
    }catch(error){await this.failRun(runId,safeCode(error));throw error;}
  }
  async action(command,approvalSource='model'){
    const {caseId,revision,requestId,scope,action,targetId,payload={},until,note='',conditionEvaluation}=command;
    const {row,mailbox}=await this.access(caseId);this.brain.requirePilotMutations();
    const requestHash=workHash(command),prior=await this.store.first(`SELECT * FROM brain_work_commands_v2
      WHERE principal_id=? AND request_id=?`,this.principal.id,requestId);
    if(prior){requireValue(prior.case_id===caseId&&prior.request_hash===requestHash,'WORK_REQUEST_CONFLICT');
      return JSON.parse(prior.result_json);}
    const head=await this.head(row);requireValue(head.revision===revision,'WORK_VERSION_CONFLICT');
    const docs=await this.documents(caseId),context=await this.sourceContext(row);
    const selected=await this.loadProjection(row,head),item=selected.projection?.workItems.find(i=>i.id===targetId);
    const signal=selected.projection?.signals.find(s=>s.id===targetId),statements=[];
    const projection=selected.projection??{workItems:[],signals:[]},auth=await this.authorizationState();
    const canRead=await this.readRequirements(projection,auth);
    requireValue(!(item||signal)||(item??signal).readRequirements.every(canRead),'ACCESS_DENIED');
    let requiredCapabilities=[];
    const signalAction=['acknowledge','dismiss','restore_signal','resolve_signal','reopen_signal'].includes(action);
    if(scope==='personal'||signalAction){
      if(scope==='shared'){
        requireValue(approvalSource==='soai_session','WORK_SHARED_ACTION_UI_REQUIRED');
        await this.authority(mailbox,'signals.manage_shared');requiredCapabilities=['signals.manage_shared'];
      }
      requireValue(['snooze','unsnooze','acknowledge','dismiss','restore_signal'].includes(action)||
        scope==='shared'&&['resolve_signal','reopen_signal'].includes(action),'WORK_PERSONAL_SCOPE_INVALID');
      requireValue(['snooze','unsnooze'].includes(action)?item:signal,'WORK_TARGET_NOT_FOUND');
      if(action==='snooze')requireValue(Number.isSafeInteger(until)&&until>this.now()&&until<=this.now()+366*86400000,'WORK_SNOOZE_INVALID');
      const override={id:stableId('override',this.principal.id,requestId),tenantId:row.tenant_id,caseId,
        targetId,principalId:this.principal.id,scope,revision:head.revision+1,
        property:['snooze','unsnooze'].includes(action)?'snoozedUntil':
          ['resolve_signal','reopen_signal'].includes(action)?'resolution':'disposition',
        operation:['unsnooze','restore_signal'].includes(action)?'release':'set',
        value:action==='snooze'?until:action==='acknowledge'?'acknowledged':action==='dismiss'?'dismissed':
          action==='resolve_signal'?'resolved':action==='reopen_signal'?'active':null,
        startsAt:this.now(),expiresAt:action==='snooze'?until:null,authorityRef:`principal:${this.principal.id}`,note};
      docs.overrides.push(override);
      statements.push(this.documentInsert(tables.overrides,['id','tenant_id','case_id','target_id','principal_id',
        'scope','revision','document_json','created_at'],[override.id,row.tenant_id,caseId,targetId,this.principal.id,
        scope,override.revision,stableJson(override),this.now()]));
    }else if(action==='condition_evaluated'){
      requireValue(scope==='shared'&&approvalSource==='soai_session','WORK_SHARED_ACTION_UI_REQUIRED');
      await this.authority(mailbox,'work.manage');requiredCapabilities=['work.manage'];
      requireValue(item&&item.condition.kind!=='none'&&conditionEvaluation&&note.trim(),'WORK_CONDITION_REVIEW_REQUIRED');
      const input=conditionEvaluation,requirements=[...item.readRequirements];let documentAvailable=false;
      const counterparts=await this.entities(row.tenant_id);
      const counterpart=counterparts.find(e=>e.id===item.condition.counterpartyId)??
        (item.counterparty.address&&correspondentId(row.tenant_id,item.counterparty.address)===item.condition.counterpartyId
          ?item.counterparty:null);
      if(input.result==='satisfied'){
        requireValue(input.contentConfirmed===true,'WORK_CONDITION_REVIEW_REQUIRED');
        if(item.condition.kind==='document_received'){
          requireValue(input.attachmentId&&item.condition.documentKey&&item.condition.counterpartyId,'WORK_DOCUMENT_REQUIRED');
          const attachment=await this.brain.getAttachment({attachmentId:input.attachmentId});
          requireValue(attachment.caseId===caseId&&attachment.sourceUnchanged===true&&attachment.scanStatus!=='blocked',
            'WORK_DOCUMENT_UNAVAILABLE');
          const source=await this.store.first(`SELECT m.id,m.sender FROM brain_attachments a
            JOIN brain_messages m ON m.id=a.message_id WHERE a.id=?`,input.attachmentId);
          requireValue(counterpart?.address?.toLowerCase()===source?.sender?.toLowerCase(),'WORK_COUNTERPARTY_MISMATCH');
          requirements.push(`message:${source.id}`);documentAvailable=true;
        }
        if(item.condition.kind==='after_response'){
          requireValue(input.messageId&&input.relevantResponse===true,'WORK_RELEVANT_RESPONSE_REQUIRED');
          const source=context.messages.find(m=>m.id===input.messageId);
          requireValue(source&&counterpart?.address?.toLowerCase()===source.sender.toLowerCase(),'WORK_COUNTERPARTY_MISMATCH');
          requireValue(!/automatic reply|auto.?reply|out of office|automatick[aá] odpov[eě][dď]/iu.test(source.subject),
            'WORK_AUTOMATIC_RESPONSE');requirements.push(`message:${source.id}`);
        }
      }
      const evaluation={id:stableId('condition-review',this.principal.id,requestId),workItemId:item.id,
        conditionDigest:stableId('condition',item.condition),authorized:true,result:input.result,
        documentKey:item.condition.documentKey,counterpartyId:item.condition.counterpartyId,
        documentAvailable,contentConfirmed:input.contentConfirmed===true,relevantResponse:input.relevantResponse===true,
        automaticReply:false,readRequirements:[...new Set(requirements)],at:this.now(),revision:head.revision+1,
        reviewerId:this.principal.id,attachmentId:input.attachmentId??null,messageId:input.messageId??null,note};
      docs.conditionEvaluations.push(evaluation);
      statements.push(this.documentInsert(tables.conditionEvaluations,['id','tenant_id','case_id','work_item_id',
        'document_json','created_at'],[evaluation.id,row.tenant_id,caseId,item.id,stableJson(evaluation),this.now()]));
    }else{
      requireValue(scope==='shared'&&approvalSource==='soai_session','WORK_SHARED_ACTION_UI_REQUIRED');
      const authority=await this.authority(mailbox,'work.manage');
      requiredCapabilities=['work.manage'];
      requireValue(['created_manually','completed','cancelled','reopened','due_changed','due_removed','delegated',
        'overridden','accepted','replaced','close_case'].includes(action),
        'WORK_ACTION_INVALID');
      requireValue(['created_manually','close_case'].includes(action)||item,'WORK_TARGET_NOT_FOUND');
      if(['reopened','replaced','close_case'].includes(action))requireValue(note.trim(),'WORK_REASON_REQUIRED');
      const values=payloadSchema.parse(payload),entities=await this.entities(row.tenant_id);
      if(values.condition){
        requireValue(values.condition.dependsOnWorkItemIds.every(id=>id!==targetId&&
          projection.workItems.some(i=>i.id===id&&i.readRequirements.every(canRead))),'WORK_CONDITION_TARGET_INVALID');
        if(values.condition.kind!=='none')requireValue(values.condition.description.trim(),'WORK_CONDITION_REVIEW_REQUIRED');
        if(['document_received','after_response'].includes(values.condition.kind))requireValue(
          entities.some(e=>e.id===values.condition.counterpartyId&&e.address)||item?.counterparty.address&&
          correspondentId(row.tenant_id,item.counterparty.address)===values.condition.counterpartyId,'WORK_COUNTERPARTY_MISMATCH');
        if(values.condition.kind==='document_received')requireValue(values.condition.documentKey,'WORK_DOCUMENT_REQUIRED');
        if(values.condition.kind==='after_completion')requireValue(values.condition.dependsOnWorkItemIds.length>0,
          'WORK_CONDITION_TARGET_INVALID');
      }
      for(const property of ['owner','actor','counterparty'])if(values[property]?.id)
        requireValue(entities.some(e=>stableJson(e)===stableJson(values[property])),'WORK_ENTITY_NOT_VERIFIED');
      if(['created_manually','replaced'].includes(action))requireValue(values.action&&values.owner,'WORK_MANUAL_DETAILS_REQUIRED');
      const createdId=stableId('work',row.tenant_id,'manual',this.principal.id,requestId);
      const operations=action==='close_case'?projection.workItems.filter(i=>i.status==='open').map(i=>
        ({kind:'completed',workItemId:i.id,payload:{result:values.result??'unspecified'},requirements:i.readRequirements})):
        action==='replaced'?[
          {kind:'created_manually',workItemId:createdId,payload:values,requirements:item.readRequirements},
          {kind:'replaced',workItemId:targetId,payload:{replacementWorkItemId:createdId},requirements:item.readRequirements}]:
          [{kind:action,workItemId:action==='created_manually'?createdId:targetId,payload:values,requirements:item?.readRequirements??[]}];
      if(action==='close_case')requireValue(operations.length>0&&!projection.workItems.some(i=>i.status==='unresolved'),
        'WORK_CASE_UNRESOLVED');
      const newEvents=[];
      for(const [index,operation] of operations.entries()){
        requireValue(operation.requirements.every(canRead),'ACCESS_DENIED');
        const event=eventSchema.parse({id:stableId('event',this.principal.id,requestId,index),
          logicalEventId:stableId('logical',this.principal.id,requestId,index),workItemId:operation.workItemId,
          tenantId:row.tenant_id,caseId,kind:operation.kind,at:this.now(),sequence:(head.revision+1)*100+index,
          sourceMessageId:null,sourceActId:stableId('manual',this.principal.id,requestId),taskSlotId:`slot-${index}`,
          sourceLevel:'1',payload:operation.payload,factBindings:{},
          readRequirements:[...new Set([`mailbox:${mailbox.id}`,...operation.requirements])],manual:true,note});
        const decision=decisionSchema.parse({id:stableId('decision',this.principal.id,requestId,index),eventId:event.id,
          outcome:'accepted',acceptedFactIds:[],replacesDecisionIds:[],reviewerId:this.principal.id,
          semanticBasis:'human_review',policyId:'mailbox-explicit-action',policyVersion:String(authority.revision),
          authorization:{outcome:'allow',capability:eventCapability[operation.kind],actorId:this.principal.id,
            workItemId:operation.workItemId},at:this.now()});
        newEvents.push(event);docs.events.push(event);docs.decisions.push(decision);
        statements.push(...this.proposalStatements({events:[event],facts:[],signals:[]},row));
        statements.push(({owns,args,revision:next})=>this.store.db.prepare(`INSERT INTO brain_fact_decisions_v2
          (id,tenant_id,case_id,event_id,revision,document_json,created_at) SELECT ?,?,?,?,?,?,? WHERE ${owns}`)
          .bind(decision.id,row.tenant_id,caseId,event.id,next,stableJson(decision),this.now(),...args));
      }
      const trial=resolveWorkItems(docs);requireValue(!trial.issues.some(i=>newEvents.some(e=>i.eventId===e.id)),
        'WORK_INVALID_TRANSITION');
    }
    const result={caseId,revision:head.revision+1,requestId,action,scope};
    statements.push(this.documentInsert('brain_work_commands_v2',['principal_id','request_id','case_id',
      'request_hash','result_json','created_at'],[this.principal.id,requestId,caseId,requestHash,stableJson(result),this.now()]));
    const runId=await this.startRun(row,head,context);
    try{await this.access(caseId);
      for(const capability of requiredCapabilities)await this.authority(mailbox,capability);
      await this.publish(row,head,docs,runId,context,{guardChange:scope==='shared',statements,
        requiredCapabilities});return result;
    }catch(error){await this.failRun(runId,safeCode(error));throw error;}
  }
  async authorizationState(){
    const principal=await this.store.first('SELECT id,tenant_id,active FROM principals WHERE id=?',this.principal.id);
    requireValue(principal?.active===1&&this.principal.scopes.includes('forpsi:read'),'ACCESS_DENIED');
    const boxes=(await this.store.mailboxes(this.principal)).filter(b=>!this.env.MAIL_BRAIN_PILOT_MAILBOX_ID||
      b.id===this.env.MAIL_BRAIN_PILOT_MAILBOX_ID);
    const authorized=[];
    for(const entry of boxes){const box=await this.brain.access(entry.id);
      const consent=await this.store.first(`SELECT consented_at,revoked_at FROM brain_consents
        WHERE tenant_id=? AND principal_id=? AND mailbox_id=? AND revoked_at IS NULL`,
      box.tenant_id,this.principal.id,box.id);
      if(consent)authorized.push({id:box.id,consentedAt:consent.consented_at});}
    const authorities=await this.store.rows(`SELECT mailbox_id,capability,enabled,revision
      FROM brain_work_authorities_v2 WHERE tenant_id=? AND principal_id=? ORDER BY mailbox_id,capability`,
    principal.tenant_id,principal.id);
    return {tenantId:principal.tenant_id,mailboxIds:authorized.map(b=>b.id),consents:authorized,
      digest:workHash({principal,scopes:[...this.principal.scopes].sort(),authorized,authorities})};
  }
  async guardDigest(caseIds){if(!caseIds.length)return workHash([]);
    const heads=[],overlays=[];
    for(let start=0;start<caseIds.length;start+=80){const ids=caseIds.slice(start,start+80),placeholders=ids.map(()=>'?').join(',');
      heads.push(...await this.store.rows(`SELECT case_id,guard_revision FROM brain_work_heads_v2
        WHERE case_id IN (${placeholders}) ORDER BY case_id`,...ids));
      overlays.push(...await this.store.rows(`SELECT id FROM brain_work_overrides_v2 WHERE case_id IN (${placeholders})
        AND (scope='shared' OR principal_id=?) ORDER BY id`,...ids,this.principal.id));}
    return workHash({heads,overlays});
  }
  async readRequirements(projection,authorization){
    const can=new Set(authorization.mailboxIds.map(id=>`mailbox:${id}`));
    const all=[...projection.workItems,...projection.signals].flatMap(i=>i.readRequirements);
    const ids=[...new Set(all.filter(r=>r.startsWith('message:')).map(r=>r.slice(8)))];
    for(let start=0;start<ids.length;start+=80){const batch=ids.slice(start,start+80);
      const sources=await this.store.rows(`SELECT id,tenant_id,mailbox_id FROM brain_messages WHERE id IN (${batch.map(()=>'?').join(',')})`,...batch);
      for(const source of sources)if(source.tenant_id===authorization.tenantId&&authorization.mailboxIds.includes(source.mailbox_id))
        can.add(`message:${source.id}`);
    }
    return requirement=>can.has(requirement);
  }
  async sourceBindingsCurrent(bindings){
    for(let start=0;start<bindings.length;start+=80){const batch=bindings.slice(start,start+80);
      const sources=await this.store.rows(`SELECT id,content_hash,mailbox_id,case_id FROM brain_messages
        WHERE id IN (${batch.map(()=>'?').join(',')})`,...batch.map(s=>s.id));
      if(batch.some(b=>!sources.some(s=>s.id===b.id&&s.content_hash===b.hash&&s.mailbox_id===b.mailboxId&&
        (!b.caseId||s.case_id===b.caseId))))return false;
    }return true;
  }
  cursor(manifestId,offset){requireValue(typeof this.env.OUTBOX_KEY==='string','WORK_CURSOR_NOT_CONFIGURED');
    const value=`${manifestId}.${offset}`,signature=createHmac('sha256',this.env.OUTBOX_KEY)
      .update(`work-v2-view:${this.principal.id}:${value}`).digest('base64url');return `${value}.${signature}`;}
  parseCursor(value){const match=/^([a-f0-9-]{36})\.(\d{1,8})\.([A-Za-z0-9_-]{43})$/.exec(value??'');
    requireValue(match,'VIEW_EXPIRED');const expected=this.cursor(match[1],Number(match[2]));
    requireValue(Buffer.byteLength(expected)===Buffer.byteLength(value)&&timingSafeEqual(Buffer.from(expected),Buffer.from(value)),
      'VIEW_EXPIRED');return {id:match[1],offset:Number(match[2])};}
  page(manifest,offset,limit){
    const groups=manifest.view.signalGroups;
    const cards=[...manifest.view.workItems.map(v=>({kind:'work',id:v.item.id,section:v.primarySection})),
      ...groups.map(g=>({kind:'group',id:g.id,section:'review'}))].sort((a,b)=>
        ['todo','decision','waiting','information','review'].indexOf(a.section)-
        ['todo','decision','waiting','information','review'].indexOf(b.section));
    const selected=cards.slice(offset,offset+limit),workIds=new Set(selected.filter(c=>c.kind==='work').map(c=>c.id)),
      groupIds=new Set(selected.filter(c=>c.kind==='group').map(c=>c.id));
    const signalGroups=groups.filter(g=>groupIds.has(g.id)),signalIds=new Set(signalGroups.flatMap(g=>g.memberSignalIds));
    const view=manifest.view;
    return {...view,workItems:view.workItems.filter(v=>workIds.has(v.item.id)),
      signals:view.signals.filter(v=>signalIds.has(v.signal.id)),signalGroups,
      sections:Object.fromEntries(Object.entries(view.sections).map(([key,value])=>[key,
        {workItemIds:value.workItemIds.filter(id=>workIds.has(id)),signalGroupIds:value.signalGroupIds.filter(id=>groupIds.has(id))}])),
      deadlineFacet:{...view.deadlineFacet,workItemIds:view.deadlineFacet.workItemIds.filter(id=>workIds.has(id))},
      pagination:{nextCursor:offset+limit<cards.length?this.cursor(manifest.id,offset+limit):null,
        pageSize:limit,totalCards:cards.length}};
  }
  async attention(args={}){
    this.enabled();const authorization=await this.authorizationState(),filters=filtersOf(args),filterDigest=workHash(filters);
    const limit=args.limit??20;
    if(args.cursor){const cursor=this.parseCursor(args.cursor);
      const row=await this.store.first(`SELECT * FROM brain_view_manifests_v2 WHERE id=? AND tenant_id=?
        AND principal_id=? AND expires_at>?`,cursor.id,authorization.tenantId,this.principal.id,this.now());
      requireValue(row&&row.filter_digest===filterDigest&&row.authorization_digest===authorization.digest,'VIEW_EXPIRED');
      const manifest=JSON.parse(row.document_json);
      requireValue(row.guard_digest===await this.guardDigest(manifest.caseIds),'VIEW_EXPIRED');
      requireValue(await this.sourceBindingsCurrent(manifest.sourceBindings??[]),'VIEW_EXPIRED');
      const result=this.page(manifest,cursor.offset,limit);
      requireValue((await this.authorizationState()).digest===authorization.digest,'VIEW_EXPIRED');return result;
    }
    if(filters.mailboxId&&!authorization.mailboxIds.includes(filters.mailboxId)){
      const old=await this.brain.legacyAttention({mailboxId:filters.mailboxId});
      requireValue(old.mailboxes.length===1&&!old.mailboxes[0].consented,'ACCESS_DENIED');
      return {...projectAttention({projection:{workItems:[],signals:[]},principalId:this.principal.id,
        asOf:this.now(),canRead:()=>false}),viewRevision:null,appliedFilters:filters,projectionSelections:[],legacyFallback:[],
        mailboxes:old.mailboxes,coverage:{complete:false,scope:'not_consented'},notice:old.notice,
        pagination:{nextCursor:null,pageSize:limit,totalCards:0}};
    }
    const boxIds=filters.mailboxId?[filters.mailboxId]:authorization.mailboxIds;
    const cases=[];
    for(let start=0;start<boxIds.length;start+=80){const batch=boxIds.slice(start,start+80);
      cases.push(...await this.store.rows(`SELECT * FROM brain_cases WHERE tenant_id=?
        AND mailbox_id IN (${batch.map(()=>'?').join(',')}) AND merged_into_case_id IS NULL ORDER BY id LIMIT 501`,
      authorization.tenantId,...batch));}
    cases.sort((a,b)=>a.id.localeCompare(b.id));
    requireValue(cases.length<=500,'WORK_VIEW_LIMIT');
    const caseIds=cases.map(c=>c.id),initialGuard=await this.guardDigest(caseIds);
    const projection={workItems:[],signals:[]},projectionSelections=[],legacyFallback=[],overrides=[],sourceBindings=[];
    const heads=[],revisions=[],sources=[],failures=[];
    for(let start=0;start<caseIds.length;start+=80){const ids=caseIds.slice(start,start+80),list=ids.map(()=>'?').join(',');
      heads.push(...await this.store.rows(`SELECT * FROM brain_work_heads_v2 WHERE case_id IN (${list})`,...ids));
      revisions.push(...await this.store.rows(`SELECT r.* FROM brain_projection_revisions_v2 r
        JOIN brain_work_heads_v2 h ON h.published_revision=r.id WHERE h.case_id IN (${list})`,...ids));
      failures.push(...await this.store.rows(`SELECT DISTINCT run.case_id FROM brain_projection_runs_v2 run
        JOIN brain_work_heads_v2 h ON h.case_id=run.case_id JOIN brain_projection_revisions_v2 r ON r.id=h.published_revision
        WHERE run.case_id IN (${list}) AND run.run_kind IN ('extraction','chatgpt') AND run.state='failed'
          AND run.decision_revision>=r.decision_revision`,...ids));
      sources.push(...await this.store.rows(`SELECT id,tenant_id,case_id,mailbox_id,content_hash FROM brain_messages
        WHERE case_id IN (${list}) ORDER BY received_at,id`,...ids));
      overrides.push(...decode(await this.store.rows(`SELECT document_json FROM brain_work_overrides_v2
        WHERE case_id IN (${list}) AND (scope='shared' OR principal_id=?) ORDER BY revision`,...ids,this.principal.id)));
    }
    for(const row of cases){
      const head=heads.find(h=>h.case_id===row.id),messages=sources.filter(s=>s.case_id===row.id);
      const context={messages,inputRevision:row.revision,
        inputDigest:workHash(messages.map(m=>[m.id,m.content_hash,m.mailbox_id,m.case_id]))};
      const selected=await this.loadProjection(row,head,{context,revision:revisions.find(r=>r.id===head?.published_revision),
        failed:failures.some(f=>f.case_id===row.id)});
      projectionSelections.push({caseId:row.id,mode:selected.mode,revision:selected.revision??null,at:selected.at??null});
      if(selected.projection){projection.workItems.push(...selected.projection.workItems);projection.signals.push(...selected.projection.signals);
        sourceBindings.push(...selected.projection.sourceDigests.map(s=>({...s,caseId:row.id})));}
      else if(selected.mode==='legacy')legacyFallback.push({caseId:row.id,title:row.title,state:row.state,
        category:row.category,reason:row.reason,analysisStatus:row.analysis_status,mailboxId:row.mailbox_id});
    }
    const canRead=await this.readRequirements(projection,authorization),asOf=this.now();
    const view=projectAttention({projection,principalId:this.principal.id,asOf,canRead,overrides,...filters});
    const mailboxes=[];
    for(const id of boxIds){const box=await this.brain.access(id),consent=await this.brain.activeConsent(box);
      const cursors=await this.store.rows(`SELECT folder,status,window_start,window_end,scanned_count,indexed_count,
        last_complete_at,error_code FROM brain_sync_cursors WHERE tenant_id=? AND mailbox_id=?
        AND folder IN (?,?)`,box.tenant_id,id,consent.inbox_folder,consent.sent_folder);
      const complete=cursors.length===2&&cursors.every(c=>c.status==='complete'&&c.scanned_count===c.indexed_count&&
        c.window_end>=asOf-900000);
      mailboxes.push({id,address:box.address,consented:true,coverage:complete?'complete':'partial',folders:cursors,
        canWrite:this.env.MAIL_BRAIN_PILOT_READ_ONLY!=='true'&&await this.hasAuthority(box,'work.manage'),
        canReview:this.env.MAIL_BRAIN_PILOT_READ_ONLY!=='true'&&await this.hasAuthority(box,'facts.review'),
        canSend:this.env.MAIL_BRAIN_PILOT_READ_ONLY!=='true'&&await this.hasGrant(box,'send')});
    }
    const full={...view,analysisSource:this.analysisMode(),viewRevision:crypto.randomUUID(),appliedFilters:filters,projectionSelections,legacyFallback,mailboxes,
      coverage:{complete:mailboxes.length>0&&mailboxes.every(b=>b.coverage==='complete')&&
        projectionSelections.every(s=>s.mode==='v2_current'),scope:'authorized_indexed_mail'},
      notice:'Přehled rozlišuje přijatou práci, upozornění a výklady čekající na ověření.'};
    const guard=await this.guardDigest(caseIds),manifest={id:full.viewRevision,caseIds,sourceBindings,view:full};
    requireValue(guard===initialGuard,'VIEW_EXPIRED');
    requireValue(await this.sourceBindingsCurrent(sourceBindings),'VIEW_EXPIRED');
    requireValue((await this.authorizationState()).digest===authorization.digest,'VIEW_EXPIRED');
    await this.store.run(`INSERT INTO brain_view_manifests_v2
      (id,tenant_id,principal_id,filter_digest,authorization_digest,guard_digest,document_json,expires_at)
      VALUES (?,?,?,?,?,?,?,?)`,manifest.id,authorization.tenantId,this.principal.id,filterDigest,
    authorization.digest,guard,stableJson(manifest),asOf+900000);
    return this.page(manifest,0,limit);
  }
  async hasGrant(box,action){try{await this.brain.access(box.id,action);return true;}catch{return false;}}
  async hasAuthority(box,capability){try{await this.authority(box,capability);return true;}catch{return false;}}
  async getCase({caseId}){
    const {row,mailbox}=await this.access(caseId),head=await this.store.first('SELECT * FROM brain_work_heads_v2 WHERE case_id=?',caseId);
    const selected=await this.loadProjection(row,head),docs=await this.documents(caseId);
    const authorization=await this.authorizationState();
    const projection=selected.projection??{workItems:[],signals:[]},canRead=await this.readRequirements(
      {workItems:[...projection.workItems,...docs.events],signals:projection.signals},authorization);
    const allowed=projection.workItems.every(i=>i.readRequirements.every(canRead))&&
      projection.signals.every(i=>i.readRequirements.every(canRead));
    requireValue(allowed,'ACCESS_DENIED');
    const result={caseId,analysisSource:this.analysisMode(),revision:head?.revision??0,mode:selected.mode,
      projection:projectAttention({projection,principalId:this.principal.id,asOf:this.now(),canRead,
        overrides:docs.overrides,includeHistory:true,includeDismissed:true}),
      proposals:docs.events.filter(e=>e.readRequirements.every(canRead)&&!effectiveDecisions(docs.decisions).some(d=>d.eventId===e.id&&
        ['accepted','rejected','superseded'].includes(d.outcome))).map(e=>({
        event:{id:e.id,workItemId:e.workItemId,sourceMessageId:e.sourceMessageId,sourceActId:e.sourceActId,
          logicalEventId:e.logicalEventId,kind:e.kind,at:e.at,payload:e.payload},
        facts:docs.facts.filter(f=>Object.values(e.factBindings).flat().includes(f.id)).map(f=>
          ({id:f.id,property:f.property,value:f.value,evidence:f.evidence,validation:f.validation}))})),
      acceptedInterpretations:docs.events.filter(e=>!e.manual&&e.readRequirements.every(canRead)&&
        effectiveDecisions(docs.decisions).some(d=>d.eventId===e.id&&d.outcome==='accepted')).map(e=>
        ({id:e.id,workItemId:projection.workItems.find(i=>i.basisEventIds.includes(e.id))?.id??e.workItemId,
          sourceMessageId:e.sourceMessageId,sourceActId:e.sourceActId,
          logicalEventId:e.logicalEventId,kind:e.kind,payload:e.payload})),
      entities:await this.entities(row.tenant_id),
      manualProtections:projection.workItems.filter(i=>docs.events.some(e=>e.manual&&i.basisEventIds.includes(e.id)))
        .map(i=>i.id),
      canPersonal:this.env.MAIL_BRAIN_PILOT_READ_ONLY!=='true',
      canManageSignals:await this.hasAuthority(mailbox,'signals.manage_shared'),
      canReview:await this.hasAuthority(mailbox,'facts.review'),canManage:await this.hasAuthority(mailbox,'work.manage')};
    await this.access(caseId);requireValue((await this.authorizationState()).digest===authorization.digest,'VIEW_EXPIRED');
    const latest=await this.store.first('SELECT revision FROM brain_work_heads_v2 WHERE case_id=?',caseId);
    requireValue((latest?.revision??0)===(head?.revision??0),'VIEW_EXPIRED');
    requireValue(await this.sourceBindingsCurrent(selected.projection?.sourceDigests??[]),'VIEW_EXPIRED');
    return result;
  }
}
