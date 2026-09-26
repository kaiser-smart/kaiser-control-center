import { z } from 'zod';
import { id, folder } from './schemas.mjs';
import { requireValue } from './errors.mjs';
import { messageKey } from './workflow.mjs';
import { SOAI_ISSUER } from './admin-access.mjs';
import { interpretSetupAnswer } from './setup-preferences.mjs';
import { contentSamples, analyzeContent, openAiEvidenceAnalyzer, signatureFromSent } from './content-evidence.mjs';
import { newsletterSeriesKey } from './newsletter-series.mjs';

const uuid=z.string().uuid();
export const onboardingSchemas={
  begin:z.object({mailboxId:id,consent:z.boolean(),days:z.number().int().min(1).max(90).default(90),
    folders:z.array(folder).max(8).optional()}).strict(),
  session:z.object({sessionId:uuid}).strict(),
  answer:z.object({sessionId:uuid,questionId:z.string().max(60),answer:z.string().trim().max(500)}).strict(),
  approve:z.object({sessionId:uuid,proposalVersion:z.number().int().positive(),confirmed:z.literal(true)}).strict(),
  preferences:z.object({mailboxId:id}).strict(),
  revert:z.object({mailboxId:id,version:z.number().int().positive(),confirmed:z.literal(true)}).strict(),
  remove:z.object({mailboxId:id,confirmed:z.literal(true)}).strict(),
  signature:z.object({mailboxId:id,fullText:z.string().max(2000),shortText:z.string().max(1000),
    confirmed:z.literal(true),expectedRevision:z.number().int().nonnegative()}).strict(),
};

const safeHtml=text=>text.replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;')
  .replaceAll('"','&quot;').replaceAll('\n','<br>');
const profileDefaults=()=>({importantContacts:[],messageOverrides:[],directVsCc:'review',newsletterRules:[],
  synchronization:{mode:'manual'},priorityRecalculation:'manual',notifications:'unavailable',
  workingHours:null,timeZone:'Europe/Prague',automaticMoves:false,automaticSend:false});
function questions(observations,answers,proposal={}){
  const result=[];
  if(observations.twoWay.length)result.push({id:'important_contacts',title:
    `V omezeném vzorku proběhla oboustranná komunikace s ${observations.twoWay.map(x=>x.address).join(', ')}. Které kontakty mají být prioritní?`,
    options:['žádný',...observations.twoWay.map(x=>x.address),'přeskočit'],evidence:observations.twoWay});
  if(observations.directCount||observations.ccCount)result.push({id:'direct_vs_cc',title:
    `Vzorek obsahuje ${observations.directCount} přímých zpráv a ${observations.ccCount} zpráv v kopii. Mají být kopie běžně méně výrazné?`,
    options:['ano','ne','přeskočit']});
  result.push({id:'loading_mode',title:'Jak často chcete poštu načítat? Například každých 15 minut, nebo jen ručně. Jde zatím o návrh.',
    options:['ručně','každých 15 minut','přeskočit']});
  result.push({id:'notification_window',title:proposal.notificationPreference?.window?.days===null?
    'Čas upozornění mám uložený jako přání. Které dny platí? Upozornění do ChatGPT nejsou dostupná.':
    'Přejete si časové okno pro upozornění? Upozornění do ChatGPT nyní nejsou dostupná.',
    options:proposal.notificationPreference?.window?.days===null?['Po–Pá','každý den','přeskočit']:
      ['bez upozornění','přeskočit']});
  result.push({id:'working_hours',title:'Jaké pracovní dny a hodiny chcete zobrazit v nastavení? Z časů odesílání je nelze spolehlivě odvodit.',
    options:['Po–Pá 8:00–16:00','jen ruční režim','přeskočit']});
  result.push({id:'signature',title:observations.signatureCandidate?
    `V novějších odeslaných zprávách se opakuje podpis „${observations.signatureCandidate.fullText.slice(0,180)}“. Potvrďte, že patří vám, nebo jej upravte. Autor není automaticky ověřen.`:
    'V odeslané poště nebyl doložen opakovaný podpis. Napište plnou i krátkou variantu, nebo ponechte bez podpisu.',
    options:observations.signatureCandidate?['použít doložený návrh','ponechat bez podpisu','přeskočit']:
      ['ponechat bez podpisu','přeskočit']});
  for(const [index,item] of (observations.reviewExamples??[]).entries())result.push({
    id:`review_${index+1}`,title:`Zpráva od ${item.sender}: „${(item.subject||'(bez předmětu)').replace(/\s+/g,' ').slice(0,160)}“. Jak ji zařadit? `+
      'Jde o návrh, který začne platit až po schválení celého profilu.',
    options:['prioritní jen tato zpráva','běžná jen tato zpráva','prioritní tento odesílatel',
      'newsletter jen tento odesílatel a přesný předmět',
      ...(newsletterSeriesKey(item.subject)?['newsletterová série tohoto odesílatele']:[]),'přeskočit'],evidence:item});
  result.push({id:'practical_review',title:'Zkontrolujte vzorek priorit. Má být návrh zatím jen čtecí, bez přesunů a upozornění?',
    options:['ano, jen čtecí','přeskočit']});
  return result.filter(q=>!Object.hasOwn(answers,q.id));
}

export class Onboarding {
  constructor({store,principal,providerFactory,env,now=Date.now,approvalSource=null,semanticAnalyzer=null}){
    this.store=store;this.principal=principal;this.providerFactory=providerFactory;this.env=env;this.now=now;
    this.approvalSource=approvalSource;this.semanticAnalyzer=semanticAnalyzer;
  }
  access(mailboxId){requireValue(this.principal.scopes.includes('forpsi:read'),'INSUFFICIENT_SCOPE');
    return this.store.access(this.principal,mailboxId,'read');}
  async owned(sessionId){
    const row=await this.store.first('SELECT * FROM workflow_onboarding WHERE id=? AND principal_id=?',sessionId,this.principal.id);
    requireValue(row,'ONBOARDING_NOT_FOUND');
    const mailbox=await this.access(row.mailbox_id);requireValue(mailbox.tenant_id===row.tenant_id,'ACCESS_DENIED');
    return {row,mailbox};
  }
  async begin({mailboxId,consent,days=90,folders}){
    const mailbox=await this.access(mailboxId);
    const selected=folders??['INBOX',mailbox.sent_folder].filter(Boolean);
    if(consent){
      const listed=await this.providerFactory(this.env,mailbox).listFolders();
      const allowed=new Set(listed.folders.filter(f=>f.selectable!==false && !['\\Trash','\\Junk'].includes(f.specialUse)).map(f=>f.path));
      requireValue(selected.length>0 && selected.every(f=>allowed.has(f)),'ONBOARDING_SCOPE_INVALID');
    }
    const id=crypto.randomUUID(),now=this.now(),status=consent?'consented':'deferred';
    await this.store.run('INSERT INTO workflow_onboarding VALUES (?,?,?,?,?,?,?,?,?,?)',id,mailbox.tenant_id,
      this.principal.id,mailbox.id,status,JSON.stringify({days,folders:selected}),1,'{}',now,now);
    return {sessionId:id,status,scope:{days,folders:selected},questionCount:1,
      analysisAllowed:consent,mailboxAddress:mailbox.address};
  }
  async analyze({sessionId}){
    const {row,mailbox}=await this.owned(sessionId);
    requireValue(row.status==='consented' || row.status==='analyzed','ONBOARDING_CONSENT_REQUIRED');
    if(row.status==='analyzed')return this.status({sessionId});
    const scope=JSON.parse(row.scope_json),provider=this.providerFactory(this.env,mailbox),now=this.now();
    const samples=[],coverage=[];
    // Three bounded windows avoid a latest-100-only bias. No attachment download.
    for(const path of scope.folders){
      for(let start=0;start<scope.days;start+=30){
        const newer=new Date(now-start*86400000+(start===0?86400000:0)).toISOString().slice(0,10);
        const older=new Date(now-Math.min(scope.days,start+30)*86400000).toISOString().slice(0,10);
        const page=await provider.search({folder:path,since:older,before:newer,limit:20});
        samples.push(...page.messages.map(m=>({...m,folder:path})));
        coverage.push({folder:path,since:older,before:newer,examined:page.messages.length,
          incomplete:page.nextBeforeUid!=null});
      }
    }
    const incoming=samples.filter(m=>m.folder!==mailbox.sent_folder),sent=samples.filter(m=>m.folder===mailbox.sent_folder);
    const sentTo=new Set(sent.flatMap(m=>(m.to??[]).map(a=>a.address?.toLowerCase())).filter(Boolean));
    const senderCounts=new Map();
    for(const m of incoming){const address=m.from?.[0]?.address?.toLowerCase();if(!address)continue;
      const record=senderCounts.get(address)??{address,count:0,evidence:[]};record.count++;
      if(record.evidence.length<3)record.evidence.push(m.reference);senderCounts.set(address,record);}
    const twoWay=[...senderCounts.values()].filter(x=>sentTo.has(x.address)).slice(0,8);
    const directCount=incoming.filter(m=>(m.to??[]).some(a=>a.address?.toLowerCase()===mailbox.address.toLowerCase())).length;
    const ccCount=incoming.filter(m=>(m.cc??[]).some(a=>a.address?.toLowerCase()===mailbox.address.toLowerCase())).length;
    const unique=new Map();
    for(const item of incoming){
      if(!item.reference)continue;
      const key=messageKey(item);
      if(!unique.has(key))unique.set(key,item);
    }
    const candidates=[...unique.values()].sort((a,b)=>String(b.date??'').localeCompare(String(a.date??'')));
    const selected=new Map();
    const include=predicate=>{const item=candidates.find(x=>predicate(x) && !selected.has(messageKey(x)));
      if(item)selected.set(messageKey(item),item);};
    include(m=>sentTo.has(m.from?.[0]?.address?.toLowerCase()));
    include(m=>!sentTo.has(m.from?.[0]?.address?.toLowerCase()));
    include(m=>(m.cc??[]).some(a=>a.address?.toLowerCase()===mailbox.address.toLowerCase()));
    include(m=>(m.to??[]).some(a=>a.address?.toLowerCase()===mailbox.address.toLowerCase()));
    for(const item of candidates){if(selected.size>=4)break;selected.set(messageKey(item),item);}
    const reviewExamples=[...selected.values()].slice(0,4).map(m=>({messageKey:messageKey(m),reference:m.reference,
      sender:m.from?.[0]?.address??'',subject:m.subject??'',receivedAt:m.date??null,
      evidenceKind:sentTo.has(m.from?.[0]?.address?.toLowerCase())?'mailbox_two_way':'unclassified_incoming'}));
    const readTargets=new Map();
    for(const m of [...candidates.slice(0,8),...sent.sort((a,b)=>String(b.date??'').localeCompare(String(a.date??''))).slice(0,8)])
      if(m.reference)readTargets.set(messageKey(m),m);
    const details=[];
    for(const item of [...readTargets.values()].slice(0,12)){
      try{const detail=await provider.read(item.reference);details.push({...detail,sentFolder:mailbox.sent_folder});}
      catch { /* Incomplete content is reported; metadata analysis remains usable. */ }
    }
    const content=contentSamples(details,mailbox.address),signatureCandidate=signatureFromSent(content);
    let semantic;
    try{semantic=await analyzeContent(content,{analyzer:this.semanticAnalyzer??
      (this.env.FORPSI_ANALYSIS_API_KEY&&this.env.FORPSI_ANALYSIS_MODEL?
        input=>openAiEvidenceAnalyzer(input,this.env):null)});}
    catch{semantic={status:'unavailable',reason:'MODEL_ANALYSIS_UNAVAILABLE',findings:[]};}
    const observations={twoWay,directCount,ccCount,sampleCount:new Set(samples.map(messageKey)).size,
      sampledRecords:samples.length,reviewExamples,
      contentCoverage:{attempted:readTargets.size,read:details.length,boundedAt:12},semantic,
      signatureCandidate,signatureLimit:signatureCandidate?'AUTHOR_UNVERIFIED':'REPEATED_SIGNATURE_NOT_FOUND',
      newsletterCandidates:[],unknownSenderCount:[...senderCounts.values()].filter(x=>x.count===1).length};
    const proposal=profileDefaults();
    const statements=[
      this.store.db.prepare('INSERT INTO workflow_observations VALUES (?,?,?,?)').bind(sessionId,JSON.stringify(coverage),JSON.stringify(observations),now+30*86400000),
      this.store.db.prepare('INSERT INTO workflow_proposals VALUES (?,1,?,?)').bind(sessionId,JSON.stringify(proposal),now),
      this.store.db.prepare("UPDATE workflow_onboarding SET status='analyzed',updated_at=? WHERE id=?").bind(now,sessionId),
    ];await this.store.db.batch(statements);
    return this.status({sessionId});
  }
  async status({sessionId}){
    const {row,mailbox}=await this.owned(sessionId),observation=await this.store.first('SELECT * FROM workflow_observations WHERE onboarding_id=?',sessionId);
    const proposal=await this.store.first('SELECT * FROM workflow_proposals WHERE onboarding_id=?',sessionId);
    const owner=await this.store.first('SELECT issuer FROM principals WHERE id=? AND tenant_id=?',this.principal.id,row.tenant_id);
    const approvalAvailable=owner?.issuer===SOAI_ISSUER && !!this.env.SOAI_PUBLIC_URL;
    const answers=JSON.parse(row.answers_json),facts=observation?JSON.parse(observation.observations_json):null;
    const profile=proposal?JSON.parse(proposal.proposal_json):null;
    const remaining=facts?questions(facts,answers,profile):[];
    const syncRequested=profile?.synchronization?.mode==='interval';
    const syncCursor=syncRequested?await this.store.first(`SELECT last_run,last_outcome,next_due FROM workflow_sync_cursors
      WHERE tenant_id=? AND principal_id=? AND mailbox_id=?`,row.tenant_id,this.principal.id,mailbox.id):null;
    const schedulerConfigured=this.env.CONNECTOR_ENABLED==='true'&&this.env.WORKFLOW_SYNC_ENABLED==='true';
    const services={loading:{savedWish:syncRequested,implemented:true,schedulerConfigured,
      enabled:row.status==='approved'&&schedulerConfigured&&['completed','partial'].includes(syncCursor?.last_outcome),
      lastRun:syncCursor?.last_run??null,lastOutcome:syncCursor?.last_outcome??null},
    priorityRecalculation:{savedWish:profile?.priorityRecalculation??'manual',implemented:'on_demand',enabled:false},
    chatNotifications:{savedWish:profile?.notificationPreference??null,implemented:false,enabled:false}};
    return {sessionId,status:row.status,mailboxAddress:mailbox.address,scope:JSON.parse(row.scope_json),
      questionCount:row.question_count,maxQuestions:20,coverage:observation?JSON.parse(observation.coverage_json):null,
      observations:facts,proposal:proposal?{version:proposal.version,data:profile}:null,services,
      signaturePreview:profile?.signature?.fullText?
        {plain:`Dobrý den,\n\nDěkuji za zprávu.\n\n${profile.signature.fullText}`,
          html:`<p>Dobrý den,</p><p>Děkuji za zprávu.</p><p>${safeHtml(profile.signature.fullText)}</p>`}:null,
      nextQuestion:remaining[0]??null,readyToApprove:!!proposal && remaining.length===0 && row.question_count<20,
      untrustedContent:true,
      approvalAvailable,approvalUrl:approvalAvailable?new URL(`/forpsi-setup/?session=${encodeURIComponent(sessionId)}`,
        this.env.SOAI_PUBLIC_URL).href:null,
      approvalBlock:approvalAvailable?null:owner?.issuer===SOAI_ISSUER?'APPROVAL_URL_NOT_CONFIGURED':'SOAI_IDENTITY_LINK_REQUIRED',
      completeCoverage:observation?JSON.parse(observation.coverage_json).every(x=>!x.incomplete):false};
  }
  async answer({sessionId,questionId,answer}){
    const {row,mailbox}=await this.owned(sessionId);
    requireValue(['analyzed','questioning','ready'].includes(row.status),'ONBOARDING_NOT_READY');
    requireValue(row.question_count<19,'QUESTION_LIMIT_REACHED');
    const observed=await this.store.first('SELECT observations_json FROM workflow_observations WHERE onboarding_id=?',sessionId);
    const proposal=await this.store.first('SELECT * FROM workflow_proposals WHERE onboarding_id=?',sessionId);
    const answers=JSON.parse(row.answers_json),remaining=questions(JSON.parse(observed.observations_json),answers,
      JSON.parse(proposal.proposal_json));
    requireValue(remaining[0]?.id===questionId,'QUESTION_OUT_OF_SEQUENCE');
    const q=remaining[0],observations=JSON.parse(observed.observations_json);
    const data=JSON.parse(proposal.proposal_json);
    let interpretation={interpreted:[],ambiguities:[]};
    if(!q.options.includes(answer)){
      interpretation=interpretSetupAnswer(answer,{questionId,observations,proposal:data,
        mailboxAddress:mailbox.address,question:q});
      requireValue(Object.keys(interpretation.answers).length>0,'ANSWER_NEEDS_CLARIFICATION');
      Object.assign(answers,interpretation.answers);
      Object.assign(data,interpretation.changes);
    }else answers[questionId]=answer;
    if(questionId==='important_contacts' && q.options.includes(answer) && answer!=='žádný' && answer!=='přeskočit')
      data.importantContacts=[...new Set([...data.importantContacts,answer])];
    if(questionId==='direct_vs_cc' && ['ano','ne'].includes(answer))data.directVsCc=answer==='ano'?'direct_first':'equal';
    if(questionId==='working_hours' && answer==='Po–Pá 8:00–16:00')data.workingHours={days:[1,2,3,4,5],start:'08:00',end:'16:00'};
    if(questionId==='loading_mode' && answer==='každých 15 minut')data.synchronization={mode:'interval',minutes:15};
    if(questionId==='loading_mode' && answer==='ručně')data.synchronization={mode:'manual'};
    if(questionId==='notification_window' && answer==='bez upozornění')
      data.notificationPreference={requested:false,status:'stored_wish_not_implemented'};
    if(questionId==='notification_window' && ['Po–Pá','každý den'].includes(answer) &&
      data.notificationPreference?.window?.days===null)
      data.notificationPreference.window.days=answer==='Po–Pá'?[1,2,3,4,5]:[1,2,3,4,5,6,7];
    if(questionId==='signature' && answer==='použít doložený návrh'){
      requireValue(observations.signatureCandidate,'SIGNATURE_EVIDENCE_UNAVAILABLE');
      data.signature={...observations.signatureCandidate,confirmedAuthor:true};
    }
    if(questionId==='signature' && answer==='ponechat bez podpisu')data.signature=null;
    if(questionId.startsWith('review_') && answer!=='přeskočit'){
      const item=q.evidence;
      if(answer==='prioritní jen tato zpráva'||answer==='běžná jen tato zpráva'){
        data.messageOverrides=[...(data.messageOverrides??[]).filter(x=>x.messageKey!==item.messageKey),
          {messageKey:item.messageKey,priority:answer.startsWith('prioritní')?'high':'review',
            evidence:item.reference,source:'explicit_setup_answer'}];
      }
      if(answer==='prioritní tento odesílatel'){
        requireValue(item.sender,'SENDER_UNAVAILABLE');
        data.importantContacts=[...new Set([...data.importantContacts,item.sender])];
      }
      if(answer==='newsletter jen tento odesílatel a přesný předmět'){
        requireValue(item.sender && item.subject,'NEWSLETTER_RULE_TOO_BROAD');
        data.newsletterRules=[...data.newsletterRules,{sender:item.sender,subject:item.subject,
          action:'exclude_from_high_priority',evidence:item.reference,source:'explicit_setup_answer'}];
      }
      if(answer==='newsletterová série tohoto odesílatele'){
        const seriesKey=newsletterSeriesKey(item.subject);
        requireValue(item.sender && seriesKey,'NEWSLETTER_SERIE_NEURČENA');
        data.newsletterRules=[...data.newsletterRules,{sender:item.sender,seriesKey,
          action:'exclude_from_high_priority',evidence:item.reference,source:'explicit_setup_answer'}];
      }
    }
    const next=questions(JSON.parse(observed.observations_json),answers,data)[0];
    await this.store.db.batch([
      this.store.db.prepare('UPDATE workflow_proposals SET version=version+1,proposal_json=?,updated_at=? WHERE onboarding_id=?').bind(JSON.stringify(data),this.now(),sessionId),
      this.store.db.prepare('UPDATE workflow_onboarding SET answers_json=?,question_count=question_count+1,status=?,updated_at=? WHERE id=?')
        .bind(JSON.stringify(answers),next?'questioning':'ready',this.now(),sessionId),
    ]);
    return {...await this.status({sessionId}),interpretation};
  }
  async approve({sessionId,proposalVersion}){
    requireValue(this.approvalSource==='soai_session','APPROVAL_UI_REQUIRED');
    const {row,mailbox}=await this.owned(sessionId);
    requireValue(row.status==='ready' && row.question_count<20,'ONBOARDING_NOT_READY');
    const proposal=await this.store.first('SELECT * FROM workflow_proposals WHERE onboarding_id=?',sessionId);
    requireValue(proposal?.version===proposalVersion,'PROFILE_VERSION_CONFLICT');
    const last=await this.store.first('SELECT MAX(version) AS version FROM workflow_profile_versions WHERE tenant_id=? AND principal_id=? AND mailbox_id=?',
      mailbox.tenant_id,this.principal.id,mailbox.id);
    const version=(last?.version??0)+1,now=this.now();
    const statements=[
      this.store.db.prepare('UPDATE workflow_profile_versions SET active=0 WHERE tenant_id=? AND principal_id=? AND mailbox_id=?').bind(mailbox.tenant_id,this.principal.id,mailbox.id),
      this.store.db.prepare('INSERT INTO workflow_profile_versions VALUES (?,?,?,?,?,?,1)').bind(mailbox.tenant_id,this.principal.id,mailbox.id,version,proposal.proposal_json,now),
      this.store.db.prepare("UPDATE workflow_onboarding SET status='approved',question_count=question_count+1,updated_at=? WHERE id=?")
        .bind(now,sessionId),
    ];
    const approvedProfile=JSON.parse(proposal.proposal_json);
    if(approvedProfile.signature?.confirmedAuthor){
      const signature=approvedProfile.signature;
      requireValue(signature.senderAddress?.toLowerCase()===mailbox.address.toLowerCase(),'SIGNATURE_IDENTITY_MISMATCH');
      statements.push(this.store.db.prepare(`INSERT INTO workflow_signatures VALUES (?,?,?,?,?,?,?,?)
        ON CONFLICT(tenant_id,principal_id,mailbox_id,sender_address) DO UPDATE SET
        full_text=excluded.full_text,short_text=excluded.short_text,revision=workflow_signatures.revision+1,
        approved_at=excluded.approved_at`).bind(mailbox.tenant_id,this.principal.id,mailbox.id,
        mailbox.address,signature.fullText,signature.shortText,1,now));
    }
    await this.store.db.batch(statements);
    return {approved:true,version,profile:JSON.parse(proposal.proposal_json)};
  }
  async preferences({mailboxId}){
    const mailbox=await this.access(mailboxId);
    const row=await this.store.first('SELECT * FROM workflow_profile_versions WHERE tenant_id=? AND principal_id=? AND mailbox_id=? AND active=1',
      mailbox.tenant_id,this.principal.id,mailbox.id);
    if(!row)return {status:'not_configured'};
    const profile=JSON.parse(row.profile_json),cursor=await this.store.first(`SELECT last_run,last_outcome,next_due
      FROM workflow_sync_cursors WHERE tenant_id=? AND principal_id=? AND mailbox_id=?`,mailbox.tenant_id,this.principal.id,mailbox.id);
    const schedulerConfigured=this.env.CONNECTOR_ENABLED==='true'&&this.env.WORKFLOW_SYNC_ENABLED==='true';
    return {status:'approved',version:row.version,profile,services:{
      loading:{savedWish:profile.synchronization?.mode==='interval',implemented:true,schedulerConfigured,
        enabled:schedulerConfigured&&['completed','partial'].includes(cursor?.last_outcome),
        lastRun:cursor?.last_run??null,lastOutcome:cursor?.last_outcome??null,nextDue:cursor?.next_due??null},
      priorityRecalculation:{savedWish:profile.priorityRecalculation??'manual',implemented:'on_demand',enabled:false},
      chatNotifications:{savedWish:profile.notificationPreference??null,implemented:false,enabled:false}}};
  }
  async revert({mailboxId,version}){
    requireValue(this.approvalSource==='soai_session','APPROVAL_UI_REQUIRED');
    const mailbox=await this.access(mailboxId),previous=await this.store.first('SELECT profile_json FROM workflow_profile_versions WHERE tenant_id=? AND principal_id=? AND mailbox_id=? AND version=?',
      mailbox.tenant_id,this.principal.id,mailbox.id,version);
    requireValue(previous,'PROFILE_VERSION_NOT_FOUND');
    const current=await this.store.first('SELECT MAX(version) AS version FROM workflow_profile_versions WHERE tenant_id=? AND principal_id=? AND mailbox_id=?',
      mailbox.tenant_id,this.principal.id,mailbox.id),newVersion=current.version+1;
    await this.store.db.batch([
      this.store.db.prepare('UPDATE workflow_profile_versions SET active=0 WHERE tenant_id=? AND principal_id=? AND mailbox_id=?').bind(mailbox.tenant_id,this.principal.id,mailbox.id),
      this.store.db.prepare('INSERT INTO workflow_profile_versions VALUES (?,?,?,?,?,?,1)').bind(mailbox.tenant_id,this.principal.id,mailbox.id,newVersion,previous.profile_json,this.now()),
    ]);
    return {restoredFrom:version,version:newVersion,profile:JSON.parse(previous.profile_json)};
  }
  async remove({mailboxId}){
    requireValue(this.approvalSource==='soai_session','APPROVAL_UI_REQUIRED');
    const mailbox=await this.access(mailboxId);
    const sessions=await this.store.rows('SELECT id FROM workflow_onboarding WHERE tenant_id=? AND principal_id=? AND mailbox_id=?',
      mailbox.tenant_id,this.principal.id,mailbox.id);
    const statements=[];
    for(const session of sessions){
      statements.push(this.store.db.prepare('DELETE FROM workflow_observations WHERE onboarding_id=?').bind(session.id));
      statements.push(this.store.db.prepare('DELETE FROM workflow_proposals WHERE onboarding_id=?').bind(session.id));
      statements.push(this.store.db.prepare('DELETE FROM workflow_onboarding WHERE id=?').bind(session.id));
    }
    statements.push(this.store.db.prepare('DELETE FROM workflow_profile_versions WHERE tenant_id=? AND principal_id=? AND mailbox_id=?')
      .bind(mailbox.tenant_id,this.principal.id,mailbox.id));
    await this.store.db.batch(statements);
    return {removed:true,onboardingSessions:sessions.length,mailboxId:mailbox.id,mailMessagesUnchanged:true,
      personalSignatureUnchanged:true};
  }
  async cleanupExpired(){
    const expired=await this.store.rows('SELECT onboarding_id FROM workflow_observations WHERE expires_at<? LIMIT 100',this.now());
    for(const item of expired){
      await this.store.db.batch([
        this.store.db.prepare('DELETE FROM workflow_proposals WHERE onboarding_id=?').bind(item.onboarding_id),
        this.store.db.prepare('DELETE FROM workflow_observations WHERE onboarding_id=?').bind(item.onboarding_id),
        this.store.db.prepare('DELETE FROM workflow_onboarding WHERE id=?').bind(item.onboarding_id),
      ]);
    }
    return {expiredSessionsRemoved:expired.length};
  }
  async signature({mailboxId,fullText,shortText,expectedRevision}){
    requireValue(this.approvalSource==='soai_session','APPROVAL_UI_REQUIRED');
    const mailbox=await this.access(mailboxId),current=await this.store.first('SELECT revision FROM workflow_signatures WHERE tenant_id=? AND principal_id=? AND mailbox_id=? AND sender_address=?',
      mailbox.tenant_id,this.principal.id,mailbox.id,mailbox.address);
    requireValue((current?.revision??0)===expectedRevision,'SIGNATURE_VERSION_CONFLICT');
    const revision=expectedRevision+1;
    await this.store.run(`INSERT INTO workflow_signatures VALUES (?,?,?,?,?,?,?,?) ON CONFLICT(tenant_id,principal_id,mailbox_id,sender_address)
      DO UPDATE SET full_text=excluded.full_text,short_text=excluded.short_text,revision=excluded.revision,approved_at=excluded.approved_at`,
      mailbox.tenant_id,this.principal.id,mailbox.id,mailbox.address,fullText,shortText,revision,this.now());
    return this.getSignature({mailboxId});
  }
  async getSignature({mailboxId}){
    const mailbox=await this.access(mailboxId),row=await this.store.first('SELECT * FROM workflow_signatures WHERE tenant_id=? AND principal_id=? AND mailbox_id=? AND sender_address=?',
      mailbox.tenant_id,this.principal.id,mailbox.id,mailbox.address);
    if(!row)return {configured:false,senderAddress:mailbox.address};
    return {configured:true,revision:row.revision,senderAddress:mailbox.address,fullText:row.full_text,shortText:row.short_text,
      sample:{plain:`Dobrý den,\n\nDěkuji za zprávu.\n\n${row.full_text}`,
        html:`<p>Dobrý den,</p><p>Děkuji za zprávu.</p><p>${safeHtml(row.full_text)}</p>`},
      previewFidelity:'connector_plain_text_and_simple_html_only'};
  }
}
