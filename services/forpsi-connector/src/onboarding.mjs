import { z } from 'zod';
import { id, folder } from './schemas.mjs';
import { requireValue } from './errors.mjs';
import { messageKey } from './workflow.mjs';
import { SOAI_ISSUER } from './admin-access.mjs';
import { interpretSetupAnswer } from './setup-preferences.mjs';
import { contentSamples, analyzeContent, openAiEvidenceAnalyzer, signatureFromSent, authoredText,
  validateContentFindings } from './content-evidence.mjs';
import { newsletterSeriesKey } from './newsletter-series.mjs';

const uuid=z.string().uuid();
export const onboardingSchemas={
  begin:z.object({mailboxId:id,consent:z.boolean(),days:z.number().int().min(1).max(90).optional(),
    folders:z.array(folder).max(8).optional()}).strict(),
  session:z.object({sessionId:uuid}).strict(),
  answer:z.object({sessionId:uuid,questionId:z.string().max(60),answer:z.string().trim().max(500)}).strict(),
  sample:z.object({sessionId:uuid,offset:z.number().int().min(0).max(49).default(0),
    limit:z.number().int().min(1).max(5).default(5)}).strict(),
  submitAnalysis:z.object({sessionId:uuid,proposalVersion:z.number().int().positive(),
    acknowledgeIncomplete:z.boolean().default(false),
    findings:z.array(z.object({kind:z.enum(['request','waiting_user','waiting_other','resolved','changed',
      'cancelled','agenda','signature_style','marketing','newsletter']),sourceKey:z.string().min(1).max(500),
      quote:z.string().min(4).max(500),summary:z.string().max(240),threadKey:z.string().max(200).nullable().optional()}).strict()).max(30),
    priorities:z.array(z.object({sourceKey:z.string().min(1).max(500),priority:z.enum(['high','review']),
      reason:z.string().min(1).max(240),quote:z.string().min(4).max(500)}).strict()).max(50),
    importantContacts:z.array(z.object({address:z.email(),sourceKey:z.string().min(1).max(500)}).strict()).max(8).default([]),
    signature:z.object({fullText:z.string().trim().min(1).max(500),shortText:z.string().trim().min(1).max(300),
      sourceKeys:z.array(z.string().min(1).max(500)).min(1).max(3)}).strict().nullable().optional(),
  }).strict(),
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
  workingHours:null,timeZone:'Europe/Prague',automaticMoves:false,automaticSend:false,
  agendaRecommendations:[]});
function signatureStatements(store,tenantId,principalId,mailbox,profile,now){
  if(!Object.hasOwn(profile,'signature'))return []; // Skipped is not removal.
  if(profile.signature===null)return [store.db.prepare(`DELETE FROM workflow_signatures
    WHERE tenant_id=? AND principal_id=? AND mailbox_id=? AND sender_address=?`)
    .bind(tenantId,principalId,mailbox.id,mailbox.address)];
  const signature=profile.signature;
  if(!signature?.confirmedAuthor)return [];
  requireValue(signature.senderAddress?.toLowerCase()===mailbox.address.toLowerCase(),
    'SIGNATURE_IDENTITY_MISMATCH');
  return [store.db.prepare(`INSERT INTO workflow_signatures VALUES (?,?,?,?,?,?,?,?)
    ON CONFLICT(tenant_id,principal_id,mailbox_id,sender_address) DO UPDATE SET
    full_text=excluded.full_text,short_text=excluded.short_text,revision=workflow_signatures.revision+1,
    approved_at=excluded.approved_at`).bind(tenantId,principalId,mailbox.id,mailbox.address,
    signature.fullText,signature.shortText,1,now)];
}
function questions(observations,answers,proposal={},interactive=false,loadingAvailable=true){
  const result=[];
  const contactCandidates=[...new Set([...(interactive?[]:(observations.twoWay??[])).map(x=>x.address),
    ...(observations.modelContactSuggestions??[]).map(x=>x.address)])];
  if(contactCandidates.length)result.push({id:'important_contacts',title:
    interactive?'Které z těchto kontaktů chcete dlouhodobě upřednostňovat?':
      `Ve vzorku se objevily kontakty ${contactCandidates.join(', ')}. Které mají být prioritní? `+
      'Návrh modelu není schváleným pravidlem.',
    options:['žádný',...contactCandidates,'přeskočit'],
    evidence:[...(observations.twoWay??[]),...(observations.modelContactSuggestions??[])]});
  if(!interactive && observations.directCount>0 && observations.ccCount>0)result.push({id:'direct_vs_cc',title:
    `Vzorek obsahuje ${observations.directCount} přímých zpráv a ${observations.ccCount} zpráv v kopii. Mají být kopie běžně méně výrazné?`,
    options:['ano','ne','přeskočit']});
  if(!interactive||loadingAvailable)result.push({id:'loading_mode',title:interactive?
    'Má se pošta kontrolovat průběžně, nebo jen když o ni požádáte?':
    'Jak často chcete poštu načítat? Například každých 15 minut, nebo jen ručně. Jde zatím o návrh.',
    options:['ručně','každých 15 minut','přeskočit']});
  if(!interactive)result.push({id:'notification_window',title:proposal.notificationPreference?.window?.days===null?
    'Čas upozornění mám uložený jako přání. Které dny platí? Upozornění do ChatGPT nejsou dostupná.':
    'Přejete si časové okno pro upozornění? Upozornění do ChatGPT nyní nejsou dostupná.',
    options:proposal.notificationPreference?.window?.days===null?['Po–Pá','každý den','přeskočit']:
      ['bez upozornění','přeskočit']});
  if(!interactive)result.push({id:'working_hours',title:'Jaké pracovní dny a hodiny chcete zobrazit v nastavení? Z časů odesílání je nelze spolehlivě odvodit.',
    options:['Po–Pá 8:00–16:00','jen ruční režim','přeskočit']});
  result.push({id:'signature',title:observations.signatureCandidate?
    interactive?`Našel jsem podpis „${observations.signatureCandidate.fullText.slice(0,180)}“. Je váš?`:
      `V novějších odeslaných zprávách se opakuje podpis „${observations.signatureCandidate.fullText.slice(0,180)}“. Potvrďte, že patří vám, nebo jej upravte. Autor není automaticky ověřen.`:
    proposal.signature?.fullText?
      `Dosavadní schválený podpis „${proposal.signature.fullText.slice(0,180)}“ zůstane zachován, pokud otázku přeskočíte. Chcete jej změnit nebo odstranit?`:
    interactive?'Nemám dost podkladů pro váš podpis. Chcete jej nyní doplnit, nebo pokračovat bez něj?':
      'V odeslané poště nebyl doložen opakovaný podpis. Napište plnou i krátkou variantu, nebo ponechte bez podpisu.',
    options:observations.signatureCandidate?['použít doložený návrh','ponechat bez podpisu','přeskočit']:
      ['ponechat bez podpisu','přeskočit']});
  for(const [index,item] of (proposal.agendaRecommendations??[]).entries())result.push({
    id:`agenda_${index+1}`,title:interactive?
      `Zdá se, že řešíte „${item.summary}“. Patří to k vaší běžné práci?`:
      `Model navrhl agendu „${item.summary}“ na základě citace „${item.quote}“. `+
      'Je pro vás tato agenda relevantní? Zatím se nevytváří pravidlo ani zásah do pošty.',
    options:['ano, relevantní','ne, nerelevantní','přeskočit'],evidence:item});
  if(interactive){
    const byKey=new Map((observations.pilotMessages??[]).map(m=>[messageKey(m),m]));
    for(const priority of ['high','review']){
      const item=(observations.chatgptPriorities??[]).find(x=>x.priority===priority&&byKey.has(x.sourceKey));
      if(!item)continue;
      const source=byKey.get(item.sourceKey),sender=source.from?.[0]?.address??'neznámého odesílatele';
      result.push({id:`priority_example_${priority}`,
        title:`Zprávu od ${sender} „${source.subject||'(bez předmětu)'}“ bych ${priority==='high'?
          'dala mezi priority':'nechala mimo hlavní priority'}, protože ${item.reason} Sedí to?`,
        options:priority==='high'?['ano, tato zpráva je prioritní','ne, jen tato zpráva je běžná','přeskočit']:
          ['ano, tato zpráva je běžná','ne, jen tato zpráva je prioritní','přeskočit'],
        evidence:{messageKey:item.sourceKey,reference:source.reference,quote:item.quote}});
    }
  }
  for(const [index,item] of (interactive?[]:(observations.reviewExamples??[])).entries())result.push({
    id:`review_${index+1}`,title:`Zpráva od ${item.sender}: „${(item.subject||'(bez předmětu)').replace(/\s+/g,' ').slice(0,160)}“. Jak ji zařadit? `+
      'Jde o návrh, který začne platit až po schválení celého profilu.',
    options:['prioritní jen tato zpráva','běžná jen tato zpráva','prioritní tento odesílatel',
      'newsletter jen tento odesílatel a přesný předmět',
      ...(newsletterSeriesKey(item.subject)?['newsletterová série tohoto odesílatele']:[]),'přeskočit'],evidence:item});
  if(!interactive)result.push({id:'practical_review',title:'Zkontrolujte vzorek priorit. Má být návrh zatím jen čtecí, bez přesunů a upozornění?',
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
  interactive(){return this.env.PERSONAL_PILOT_READ_ONLY==='true'||
    this.env.CHATGPT_INTERACTIVE_SETUP_ENABLED==='true';}
  async owned(sessionId){
    const row=await this.store.first('SELECT * FROM workflow_onboarding WHERE id=? AND principal_id=?',sessionId,this.principal.id);
    requireValue(row,'ONBOARDING_NOT_FOUND');
    const mailbox=await this.access(row.mailbox_id);requireValue(mailbox.tenant_id===row.tenant_id,'ACCESS_DENIED');
    return {row,mailbox};
  }
  async begin({mailboxId,consent,days,folders}){
    const mailbox=await this.access(mailboxId);
    days??=30;
    let selected=folders??['INBOX',mailbox.sent_folder].filter(Boolean);
    if(this.env.PERSONAL_PILOT_READ_ONLY==='true')requireValue(days<=30 && selected.length<=2 &&
      selected.every(path=>path==='INBOX'||path===mailbox.sent_folder), 'PILOT_SCOPE_EXCEEDED');
    if(consent){
      const listed=await this.providerFactory(this.env,mailbox).listFolders();
      const allowed=new Set(listed.folders.filter(f=>f.selectable!==false && !['\\Trash','\\Junk'].includes(f.specialUse)).map(f=>f.path));
      if(!folders)selected=selected.filter(path=>allowed.has(path));
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
    const interactive=this.interactive();
    if(row.status==='analyzed'){
      const previous=await this.store.first('SELECT observations_json FROM workflow_observations WHERE onboarding_id=?',sessionId);
      const facts=previous?JSON.parse(previous.observations_json):null;
      if(!interactive||facts?.pilotMessages)return this.status({sessionId});
      requireValue(Object.keys(JSON.parse(row.answers_json)).length===0,'SETUP_ALREADY_ANSWERED');
    }
    const scope=JSON.parse(row.scope_json),provider=this.providerFactory(this.env,mailbox),now=this.now();
    const pilot=this.env.PERSONAL_PILOT_READ_ONLY==='true';
    if(pilot){
      requireValue(scope.days<=30 && scope.folders.length<=2 &&
        scope.folders.every(path=>path==='INBOX'||path===mailbox.sent_folder),'PILOT_SCOPE_EXCEEDED');
    }
    const samples=[],coverage=[];
    // Three bounded windows avoid a latest-100-only bias. No attachment download.
    for(const path of scope.folders){
      const folderLimit=interactive&&!pilot?Math.ceil(50/scope.folders.length):50;
      let folderCount=0;
      for(let start=0;start<scope.days;start+=30){
        const newer=new Date(now-start*86400000+(start===0?86400000:0)).toISOString().slice(0,10);
        const older=new Date(now-Math.min(scope.days,start+30)*86400000).toISOString().slice(0,10);
        if(interactive&&(samples.length>=50||folderCount>=folderLimit)){
          coverage.push({folder:path,since:older,before:newer,examined:0,incomplete:true});continue;
        }
        let beforeUid=null,examined=0,incomplete=false;
        do{
          const limit=interactive?Math.min(20,50-samples.length,folderLimit-folderCount):20;
          const page=await provider.search({folder:path,since:older,before:newer,limit,
            ...(beforeUid?{beforeUid}:{})});
          samples.push(...page.messages.map(m=>({...m,folder:path})));
          examined+=page.messages.length;folderCount+=page.messages.length;
          beforeUid=page.nextBeforeUid??null;
          incomplete=beforeUid!=null;
        }while(interactive&&!pilot&&beforeUid&&samples.length<50&&folderCount<folderLimit);
        coverage.push({folder:path,since:older,before:newer,examined,incomplete});
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
    if(!interactive)for(const m of [...candidates.slice(0,8),...sent.sort((a,b)=>String(b.date??'').localeCompare(String(a.date??''))).slice(0,8)])
      if(m.reference)readTargets.set(messageKey(m),m);
    const details=[];
    for(const item of [...readTargets.values()].slice(0,12)){
      try{const detail=await provider.read(item.reference);details.push({...detail,sentFolder:mailbox.sent_folder});}
      catch { /* Incomplete content is reported; metadata analysis remains usable. */ }
    }
    const content=contentSamples(details,mailbox.address),signatureCandidate=signatureFromSent(content);
    const verifiedAliases=await this.store.verifiedAliases(mailbox);
    let semantic;
    if(interactive)semantic={status:'awaiting_chatgpt',findings:[],examined:0,requiresUserReview:true};
    else try{semantic=await analyzeContent(content,{perspective:{mailboxAddress:mailbox.address,
      verifiedAliases,aliasesStatus:verifiedAliases.length?'server_verified':'not_configured'},analyzer:this.semanticAnalyzer??
      (this.env.FORPSI_ANALYSIS_API_KEY&&this.env.FORPSI_ANALYSIS_MODEL?
        input=>openAiEvidenceAnalyzer(input,this.env):null)});}
    catch{semantic={status:'unavailable',reason:'MODEL_ANALYSIS_UNAVAILABLE',findings:[]};}
    const observations={twoWay,directCount,ccCount,sampleCount:new Set(samples.map(messageKey)).size,
      sampledRecords:samples.length,reviewExamples,
      ...(interactive?{pilotMessages:samples.map(m=>({reference:m.reference,from:m.from,to:m.to,cc:m.cc,
        subject:m.subject,date:m.date,messageId:m.messageId,inReplyTo:m.inReplyTo,references:m.references})),
        sampleReadKeys:[],chatgptPriorities:[]}:{}),
      contentCoverage:{attempted:readTargets.size,read:details.length,boundedAt:12},semantic,
      signatureCandidate,signatureLimit:signatureCandidate?'AUTHOR_UNVERIFIED':'REPEATED_SIGNATURE_NOT_FOUND',
      newsletterCandidates:[],unknownSenderCount:[...senderCounts.values()].filter(x=>x.count===1).length};
    const proposal=profileDefaults();
    const retainedSignature=await this.store.first(`SELECT full_text,short_text FROM workflow_signatures
      WHERE tenant_id=? AND principal_id=? AND mailbox_id=? AND sender_address=?`,
    mailbox.tenant_id,this.principal.id,mailbox.id,mailbox.address);
    if(retainedSignature)proposal.signature={senderAddress:mailbox.address,
      fullText:retainedSignature.full_text,shortText:retainedSignature.short_text,
      source:'retained_previous_approval',confirmedAuthor:true};
    proposal.agendaRecommendations=(semantic.findings??[])
      .filter(x=>['agenda','request','waiting_user'].includes(x.kind) && x.quote && x.reference)
      .filter((x,index,all)=>all.findIndex(y=>y.summary===x.summary)===index).slice(0,2)
      .map(x=>({summary:x.summary,quote:x.quote,sourceKey:x.sourceKey,reference:x.reference,
        provenance:'model_proposal_with_exact_quote',userMarkedRelevant:null,priorityRuleActive:false}));
    const statements=[
      this.store.db.prepare(`INSERT INTO workflow_observations VALUES (?,?,?,?)
        ON CONFLICT(onboarding_id) DO UPDATE SET coverage_json=excluded.coverage_json,
        observations_json=excluded.observations_json,expires_at=excluded.expires_at`)
        .bind(sessionId,JSON.stringify(coverage),JSON.stringify(observations),now+30*86400000),
      this.store.db.prepare(`INSERT INTO workflow_proposals VALUES (?,1,?,?)
        ON CONFLICT(onboarding_id) DO UPDATE SET version=workflow_proposals.version+1,
        proposal_json=excluded.proposal_json,updated_at=excluded.updated_at`)
        .bind(sessionId,JSON.stringify(proposal),now),
      this.store.db.prepare("UPDATE workflow_onboarding SET status='analyzed',updated_at=? WHERE id=?").bind(now,sessionId),
    ];await this.store.db.batch(statements);
    return this.status({sessionId});
  }
  async readSetupSample({sessionId,offset=0,limit=5}){
    requireValue(this.interactive(),'INTERACTIVE_SETUP_DISABLED');
    const {row,mailbox}=await this.owned(sessionId);
    requireValue(['analyzed','questioning','ready','approved'].includes(row.status),'ONBOARDING_NOT_READY');
    const observed=await this.store.first('SELECT observations_json,coverage_json FROM workflow_observations WHERE onboarding_id=?',sessionId);
    requireValue(observed,'PILOT_SAMPLE_NOT_FOUND');
    const facts=JSON.parse(observed.observations_json),summaries=facts.pilotMessages??[];
    requireValue(summaries.length<=50,'PILOT_SCOPE_EXCEEDED');
    const provider=this.providerFactory(this.env,mailbox),messages=[],readKeys=new Set(facts.sampleReadKeys??[]);
    const aliases=await this.store.verifiedAliases(mailbox),own=new Set([mailbox.address.toLowerCase(),...aliases]);
    for(const summary of summaries.slice(offset,offset+limit)){
      const sourceKey=messageKey(summary);
      try{
        const raw=await provider.read(summary.reference);
        const content=contentSamples([{...raw,reference:summary.reference,
          messageId:summary.messageId??raw.messageId,sentFolder:mailbox.sent_folder}],mailbox.address,1)[0];
        readKeys.add(sourceKey);
        messages.push({...content,key:sourceKey,
          senderRole:own.has(content.from.toLowerCase())?'mailbox_owner':'external',
          recipientRole:content.to.some(x=>own.has(x.toLowerCase()))?'to':
            content.cc.some(x=>own.has(x.toLowerCase()))?'cc':'other',
          contentTruncated:raw.truncated===true||authoredText(raw.text).length>=4000,
          untrustedContent:true});
      }catch{messages.push({key:sourceKey,reference:summary.reference,status:'unavailable'});}
    }
    facts.sampleReadKeys=[...readKeys];
    await this.store.run('UPDATE workflow_observations SET observations_json=? WHERE onboarding_id=?',
      JSON.stringify(facts),sessionId);
    return {sessionId,mailboxAddress:mailbox.address,verifiedAliases:aliases,
      offset,nextOffset:Math.min(offset+limit,summaries.length),total:summaries.length,
      deliveredCount:readKeys.size,coverage:JSON.parse(observed.coverage_json),messages,
      incomplete:readKeys.size<summaries.length||JSON.parse(observed.coverage_json).some(x=>x.incomplete),
      untrustedContent:true};
  }
  async submitAnalysis({sessionId,proposalVersion,acknowledgeIncomplete=false,findings,priorities,
    importantContacts=[],signature}){
    requireValue(this.interactive(),'INTERACTIVE_SETUP_DISABLED');
    const {row,mailbox}=await this.owned(sessionId);
    requireValue(row.status==='analyzed','ANALYSIS_ALREADY_SUBMITTED');
    const observed=await this.store.first('SELECT observations_json,coverage_json FROM workflow_observations WHERE onboarding_id=?',sessionId);
    const proposal=await this.store.first('SELECT * FROM workflow_proposals WHERE onboarding_id=?',sessionId);
    requireValue(observed&&proposal?.version===proposalVersion,'PROFILE_VERSION_CONFLICT');
    const facts=JSON.parse(observed.observations_json),summaries=facts.pilotMessages??[];
    const delivered=new Set(facts.sampleReadKeys??[]),byKey=new Map(summaries.map(m=>[messageKey(m),m]));
    const coverage=JSON.parse(observed.coverage_json);
    requireValue(acknowledgeIncomplete||delivered.size===summaries.length&&coverage.every(x=>!x.incomplete),
      'PILOT_COVERAGE_INCOMPLETE');
    const needed=new Set([...findings.map(x=>x.sourceKey),...priorities.map(x=>x.sourceKey),
      ...importantContacts.map(x=>x.sourceKey),...(signature?.sourceKeys??[])]);
    requireValue([...needed].every(key=>delivered.has(key)&&byKey.has(key)),'ANALYSIS_EVIDENCE_INVALID');
    requireValue(new Set(priorities.map(x=>x.sourceKey)).size===priorities.length,'ANALYSIS_EVIDENCE_INVALID');
    const provider=this.providerFactory(this.env,mailbox),samples=[];
    for(const key of needed){
      const summary=byKey.get(key),detail=await provider.read(summary.reference);
      const sample=contentSamples([{...detail,reference:summary.reference,
        messageId:summary.messageId??detail.messageId,sentFolder:mailbox.sent_folder}],mailbox.address,1)[0];
      samples.push({...sample,key});
    }
    const bySample=new Map(samples.map(x=>[x.key,x]));
    const validated=validateContentFindings(findings,samples);
    requireValue(validated.length===findings.length,'ANALYSIS_EVIDENCE_INVALID');
    for(const item of priorities){
      const source=bySample.get(item.sourceKey);
      requireValue(source&&source.reference.folder!==mailbox.sent_folder&&source.text.includes(item.quote),
        'ANALYSIS_EVIDENCE_INVALID');
    }
    for(const item of importantContacts){
      const source=bySample.get(item.sourceKey);
      requireValue(source&&source.reference.folder!==mailbox.sent_folder&&
        source.from.toLowerCase()===item.address.toLowerCase(),'ANALYSIS_EVIDENCE_INVALID');
    }
    if(signature){
      requireValue(signature.shortText.length<=signature.fullText.length&&
        signature.fullText.includes(signature.shortText)&&signature.sourceKeys.every(key=>{
          const source=bySample.get(key);
          return source?.sent&&source.senderIdentity==='mailbox_address'&&
            source.text.includes(signature.fullText);
        }),'SIGNATURE_EVIDENCE_INVALID');
      facts.signatureCandidate={senderAddress:mailbox.address,fullText:signature.fullText,
        shortText:signature.shortText,sourceKeys:signature.sourceKeys,authorVerified:false,
        warning:'Autor a kontaktní údaje vyžadují potvrzení uživatele.'};
    }
    facts.semantic={status:'chatgpt_proposal',findings:validated,examined:delivered.size,
      requiresUserReview:true};
    facts.chatgptPriorities=priorities.map(item=>({sourceKey:item.sourceKey,priority:item.priority,
      reason:item.reason,quote:item.quote,provenance:'chatgpt_proposal_with_exact_quote'}));
    facts.modelContactSuggestions=importantContacts;
    const data=JSON.parse(proposal.proposal_json);
    data.agendaRecommendations=validated.filter(x=>['agenda','request','waiting_user'].includes(x.kind))
      .filter((x,index,all)=>all.findIndex(y=>y.summary===x.summary)===index).slice(0,2)
      .map(x=>({summary:x.summary,quote:x.quote,sourceKey:x.sourceKey,reference:x.reference,
        provenance:'chatgpt_proposal_with_exact_quote',userMarkedRelevant:null,priorityRuleActive:false}));
    const results=await this.store.db.batch([
      this.store.db.prepare(`UPDATE workflow_proposals SET version=version+1,proposal_json=?,updated_at=?
        WHERE onboarding_id=? AND version=?`).bind(JSON.stringify(data),this.now(),sessionId,proposalVersion),
      this.store.db.prepare(`UPDATE workflow_observations SET observations_json=? WHERE onboarding_id=?
        AND EXISTS(SELECT 1 FROM workflow_proposals WHERE onboarding_id=? AND version=?)`)
        .bind(JSON.stringify(facts),sessionId,sessionId,proposalVersion+1),
    ]);
    requireValue(Number(results[0].meta.changes)===1,'PROFILE_VERSION_CONFLICT');
    return this.status({sessionId});
  }
  async status({sessionId}){
    const {row,mailbox}=await this.owned(sessionId),observation=await this.store.first('SELECT * FROM workflow_observations WHERE onboarding_id=?',sessionId);
    const proposal=await this.store.first('SELECT * FROM workflow_proposals WHERE onboarding_id=?',sessionId);
    const owner=await this.store.first('SELECT issuer FROM principals WHERE id=? AND tenant_id=?',this.principal.id,row.tenant_id);
    const approvalAvailable=owner?.issuer===SOAI_ISSUER && !!this.env.SOAI_PUBLIC_URL;
    const answers=JSON.parse(row.answers_json),facts=observation?JSON.parse(observation.observations_json):null;
    const profile=proposal?JSON.parse(proposal.proposal_json):null;
    const remaining=facts&&(!this.interactive()||
      facts.semantic?.status==='chatgpt_proposal')?questions(facts,answers,profile,this.interactive(),
        this.env.CONNECTOR_ENABLED==='true'&&this.env.WORKFLOW_SYNC_ENABLED==='true'):[];
    const syncRequested=profile?.synchronization?.mode==='interval';
    const syncCursor=syncRequested?await this.store.first(`SELECT last_run,last_outcome,next_due,scan_before_uid FROM workflow_sync_cursors
      WHERE tenant_id=? AND principal_id=? AND mailbox_id=?`,row.tenant_id,this.principal.id,mailbox.id):null;
    const schedulerConfigured=this.env.CONNECTOR_ENABLED==='true'&&this.env.WORKFLOW_SYNC_ENABLED==='true';
    const services={loading:{savedWish:syncRequested,implemented:true,schedulerConfigured,
      enabled:row.status==='approved'&&schedulerConfigured&&['completed','partial'].includes(syncCursor?.last_outcome),
      lastRun:syncCursor?.last_run??null,lastOutcome:syncCursor?.last_outcome??null,
      caughtUp:syncCursor?.last_outcome==='completed'&&syncCursor?.scan_before_uid==null},
    priorityRecalculation:{savedWish:profile?.priorityRecalculation??'manual',implemented:'on_demand',enabled:false},
    chatNotifications:{savedWish:profile?.notificationPreference??null,implemented:false,enabled:false}};
    return {sessionId,status:row.status,mailboxAddress:mailbox.address,scope:JSON.parse(row.scope_json),
      questionCount:row.question_count,maxQuestions:20,coverage:observation?JSON.parse(observation.coverage_json):null,
      observations:facts,proposal:proposal?{version:proposal.version,data:profile}:null,services,
      analysisStatus:facts?.semantic?.status??'not_started',
      sampleProgress:facts?.pilotMessages?{total:facts.pilotMessages.length,
        delivered:(facts.sampleReadKeys??[]).length}:null,
      signaturePreview:profile?.signature?.fullText?
        {plain:`Dobrý den,\n\nDěkuji za zprávu.\n\n${profile.signature.fullText}`,
          html:`<p>Dobrý den,</p><p>Děkuji za zprávu.</p><p>${safeHtml(profile.signature.fullText)}</p>`}:null,
      nextQuestion:remaining[0]??null,readyToApprove:!!proposal && remaining.length===0 && row.question_count<20 &&
        (!this.interactive()||facts?.semantic?.status==='chatgpt_proposal'),
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
    if(this.interactive())requireValue(
      JSON.parse(observed.observations_json).semantic?.status==='chatgpt_proposal','ANALYSIS_NOT_SUBMITTED');
    const proposal=await this.store.first('SELECT * FROM workflow_proposals WHERE onboarding_id=?',sessionId);
    const loadingAvailable=this.env.CONNECTOR_ENABLED==='true'&&this.env.WORKFLOW_SYNC_ENABLED==='true';
    const answers=JSON.parse(row.answers_json),remaining=questions(JSON.parse(observed.observations_json),answers,
      JSON.parse(proposal.proposal_json),this.interactive(),loadingAvailable);
    requireValue(remaining[0]?.id===questionId,'QUESTION_OUT_OF_SEQUENCE');
    const q=remaining[0],observations=JSON.parse(observed.observations_json);
    const data=JSON.parse(proposal.proposal_json);
    let interpretation={interpreted:[],ambiguities:[]};
    if(!q.options.includes(answer)){
      interpretation=interpretSetupAnswer(answer,{questionId,observations,proposal:data,
        mailboxAddress:mailbox.address,question:q});
      requireValue(Object.keys(interpretation.answers).length>0 ||
        Object.keys(interpretation.changes).length>0,'ANSWER_NEEDS_CLARIFICATION');
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
    if(questionId.startsWith('agenda_') && ['ano, relevantní','ne, nerelevantní'].includes(answer)){
      const index=Number(questionId.slice(7))-1;
      data.agendaRecommendations[index].userMarkedRelevant=answer==='ano, relevantní';
    }
    if(questionId.startsWith('priority_example_') && answer.startsWith('ne, jen tato zpráva')){
      const item=q.evidence;
      data.messageOverrides=[...(data.messageOverrides??[]).filter(x=>x.messageKey!==item.messageKey),
        {messageKey:item.messageKey,priority:answer.endsWith('prioritní')?'high':'review',
          evidence:item.reference,source:'explicit_setup_answer'}];
    }
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
    const next=questions(JSON.parse(observed.observations_json),answers,data,this.interactive(),loadingAvailable)[0];
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
    const approvedProfile=JSON.parse(proposal.proposal_json);
    if(!Object.hasOwn(approvedProfile,'signature')){
      const retained=await this.store.first(`SELECT full_text,short_text FROM workflow_signatures
        WHERE tenant_id=? AND principal_id=? AND mailbox_id=? AND sender_address=?`,
      mailbox.tenant_id,this.principal.id,mailbox.id,mailbox.address);
      approvedProfile.signature=retained?{senderAddress:mailbox.address,fullText:retained.full_text,
        shortText:retained.short_text,source:'retained_previous_approval',confirmedAuthor:true}:null;
    }
    const statements=[
      this.store.db.prepare('UPDATE workflow_profile_versions SET active=0 WHERE tenant_id=? AND principal_id=? AND mailbox_id=?').bind(mailbox.tenant_id,this.principal.id,mailbox.id),
      this.store.db.prepare('INSERT INTO workflow_profile_versions VALUES (?,?,?,?,?,?,1)').bind(mailbox.tenant_id,this.principal.id,mailbox.id,version,JSON.stringify(approvedProfile),now),
      this.store.db.prepare("UPDATE workflow_onboarding SET status='approved',question_count=question_count+1,updated_at=? WHERE id=?")
        .bind(now,sessionId),
    ];
    statements.push(...signatureStatements(this.store,mailbox.tenant_id,this.principal.id,mailbox,
      approvedProfile,now));
    await this.store.db.batch(statements);
    return {approved:true,version,profile:approvedProfile};
  }
  async preferences({mailboxId}){
    const mailbox=await this.access(mailboxId);
    const row=await this.store.first('SELECT * FROM workflow_profile_versions WHERE tenant_id=? AND principal_id=? AND mailbox_id=? AND active=1',
      mailbox.tenant_id,this.principal.id,mailbox.id);
    if(!row)return {status:'not_configured'};
    const profile=JSON.parse(row.profile_json),cursor=await this.store.first(`SELECT last_run,last_outcome,next_due,scan_before_uid
      FROM workflow_sync_cursors WHERE tenant_id=? AND principal_id=? AND mailbox_id=?`,mailbox.tenant_id,this.principal.id,mailbox.id);
    const schedulerConfigured=this.env.CONNECTOR_ENABLED==='true'&&this.env.WORKFLOW_SYNC_ENABLED==='true';
    return {status:'approved',version:row.version,profile,services:{
      loading:{savedWish:profile.synchronization?.mode==='interval',implemented:true,schedulerConfigured,
        enabled:schedulerConfigured&&['completed','partial'].includes(cursor?.last_outcome),
        lastRun:cursor?.last_run??null,lastOutcome:cursor?.last_outcome??null,nextDue:cursor?.next_due??null,
        caughtUp:cursor?.last_outcome==='completed'&&cursor?.scan_before_uid==null},
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
    const restoredProfile=JSON.parse(previous.profile_json),now=this.now();
    await this.store.db.batch([
      this.store.db.prepare('UPDATE workflow_profile_versions SET active=0 WHERE tenant_id=? AND principal_id=? AND mailbox_id=?').bind(mailbox.tenant_id,this.principal.id,mailbox.id),
      this.store.db.prepare('INSERT INTO workflow_profile_versions VALUES (?,?,?,?,?,?,1)').bind(mailbox.tenant_id,this.principal.id,mailbox.id,newVersion,previous.profile_json,this.now()),
      ...signatureStatements(this.store,mailbox.tenant_id,this.principal.id,mailbox,restoredProfile,now),
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
