import { createHash } from 'node:crypto';
import { z } from 'zod';
import { authoredText } from './content-evidence.mjs';
import { requireValue } from './errors.mjs';
import { id, message as sendMessage } from './schemas.mjs';
import { openAiBrainAnalyzer } from './brain-analyzer.mjs';
import { createAnalysisAudit, analysisErrorCode, analysisOutcome, safeAnalysisAudit }
  from './brain-analysis-audit.mjs';
import { seal, unseal, digest } from './crypto.mjs';
import { SendApproval } from './send-approval.mjs';
import { Outbox } from './outbox.mjs';

const uuid = z.string().uuid();
const state = z.enum(['todo','decision','waiting','information','done']);
const ruleAction=z.enum(['prioritize','deprioritize','assign','forward']);
const day = 86400000;
const skippedSentRecovery=Object.freeze({tenant:'kaiser-servis',
  mailboxId:'mail_d4cfaf87-2357-4586-97a3-b9ec1782af8f',folder:'INBOX.Sent Items',
  uid:74324,uidValidity:'1381849700',nextBeforeUid:74317,
  scannedCount:9,indexedCount:8});
const hash = value => createHash('sha256').update(value).digest('hex');
const normId = value => typeof value === 'string' && /^<[^<>\s]{1,500}>$/.test(value.trim())
  ? value.trim().toLowerCase() : null;
const messageKey = message => normId(message.messageId) ||
  `${message.reference.folder}:${message.reference.uidValidity}:${message.reference.uid}`;
const safeDate = (value, fallback) => Number.isFinite(Date.parse(value)) ? Date.parse(value) : fallback;
const isoDay = instant => new Date(instant).toISOString().slice(0, 10);
const pragueDay=instant=>{const parts=new Intl.DateTimeFormat('en-CA',{
  timeZone:'Europe/Prague',year:'numeric',month:'2-digit',day:'2-digit'})
  .formatToParts(new Date(instant));
  const fields=Object.fromEntries(parts.map(p=>[p.type,p.value]));
  return `${fields.year}-${fields.month}-${fields.day}`;};
const pragueStart=date=>{const utc=Date.parse(`${date}T00:00:00Z`);
  const parts=new Intl.DateTimeFormat('en-GB',{timeZone:'Europe/Prague',
    hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).formatToParts(new Date(utc));
  const value=Object.fromEntries(parts.map(p=>[p.type,p.value]));
  return utc-(Number(value.hour)*60+Number(value.minute))*60000;};
const failureCode = error => /^[A-Z][A-Z0-9_]{2,70}$/.test(error?.message ?? '')
  ? error.message : 'PROVIDER_UNAVAILABLE';
const readBrainMessage=(provider,reference)=>typeof provider.readForBrain==='function'
  ?provider.readForBrain(reference):provider.read(reference);
const sourceReadCode = error => {
  const code=error?.code??error?.message;
  return ['MESSAGE_NOT_FOUND','STALE_MESSAGE_REFERENCE','MESSAGE_TOO_LARGE',
    'MIME_STRUCTURE_INVALID','MIME_TEXT_UNAVAILABLE','MIME_PART_INCOMPLETE',
    'MIME_PART_UNAVAILABLE','MIME_PART_MISMATCH','MIME_TEXT_UNREADABLE',
    'MIME_HEADERS_TOO_LARGE','SOURCE_CHANGED_DURING_READ']
    .includes(code)?code:'PROVIDER_UNAVAILABLE';
};
const explicitDate=quote=>{
  const iso=quote.match(/\b(\d{4}-\d{2}-\d{2})\b/u)?.[1];
  const cz=quote.match(/\b(\d{1,2})\.\s*(\d{1,2})\.\s*(\d{4})\b/u);
  const value=iso??(cz?`${cz[3]}-${cz[2].padStart(2,'0')}-${cz[1].padStart(2,'0')}`:null);
  if(!value)return null;
  const instant=Date.parse(`${value}T12:00:00Z`);
  return Number.isFinite(instant)&&isoDay(instant)===value?value:null;
};

export const brainSchemas = {
  attention: z.object({mailboxId:id.optional(),limit:z.number().int().min(1).max(50).default(20)}).strict(),
  getCase: z.object({caseId:uuid}).strict(),
  search: z.object({query:z.string().trim().min(2).max(200).optional(),mailboxId:id.optional(),
    category:z.string().min(1).max(80).optional(),state:state.optional(),
    from:z.email().optional(),since:z.iso.date().optional(),before:z.iso.date().optional(),
    attachmentName:z.string().trim().min(2).max(100).optional(),
    commitmentActor:z.enum(['us','them']).optional(),olderThanDays:z.number().int().min(1).max(3650).optional(),
    limit:z.number().int().min(1).max(30).default(10)}).strict().refine(value=>
      ['query','category','state','from','since','before','attachmentName','commitmentActor','olderThanDays']
        .some(key=>value[key]!==undefined),'At least one search condition is required'),
  action: z.object({caseId:uuid,revision:z.number().int().positive(),
    action:z.enum(['todo','decision','waiting','information','done','snooze','assign','merge','split']),
    until:z.string().datetime({offset:true}).optional(),ownerPrincipalId:id.optional(),
    targetCaseId:uuid.optional(),targetRevision:z.number().int().positive().optional(),
    messageIds:z.array(uuid).min(1).max(50).optional(),
    note:z.string().max(500).default('')}).strict(),
  sync: z.object({mailboxId:id,limit:z.number().int().min(1).max(50).default(10)}).strict(),
  rule: z.discriminatedUnion('operation',[
    z.object({operation:z.literal('list'),mailboxId:id}).strict(),
    z.object({operation:z.literal('propose'),mailboxId:id,category:z.string().min(1).max(80),
      senderAddress:z.email().optional(),action:ruleAction,destination:z.string().max(254).optional()}).strict(),
    z.object({operation:z.literal('disable'),mailboxId:id,ruleId:uuid,version:z.number().int().positive()}).strict(),
  ]),
  draft: z.object({caseId:uuid,caseRevision:z.number().int().positive(),requestId:uuid,
    message:sendMessage}).strict(),
  send: z.object({draftId:uuid}).strict(),
  attachment: z.object({attachmentId:uuid}).strict(),
};

function analysisEvidence(raw,message) {
  const text = authoredText(message.text ?? '');
  const quote = typeof raw?.quote === 'string' ? raw.quote.trim().slice(0, 500) : '';
  const validState = state.safeParse(raw?.state);
  return {quotePresent:quote.length>0,quoteLength:quote.length,
    quoteMatchesAuthoredText:quote.length>0&&text.includes(quote),
    stateValid:validState.success&&validState.data!=='done'};
}

function normalizeAnalysis(raw, message, direction) {
  const text = authoredText(message.text ?? '');
  const quote = typeof raw?.quote === 'string' ? raw.quote.trim().slice(0, 500) : '';
  const evidence=analysisEvidence(raw,message);
  const validState = state.safeParse(raw?.state);
  const base = {state:direction==='inbound'?'todo':'waiting',category:'unclassified',
    reason:direction==='inbound'?'Přijatá zpráva čeká na posouzení.':'Odeslaná zpráva; čekáme na další vývoj.',
    quote:null,nextAction:null,commitments:[],amountMinor:null,currency:null,
    analysisStatus:'unreviewed'};
  // Only a person or an explicit case action can close a case.
  if (evidence.quoteLength<4 || !evidence.quoteMatchesAuthoredText || !evidence.stateValid) return base;
  const commitments=[];
  for (const candidate of Array.isArray(raw.commitments) ? raw.commitments.slice(0, 10) : []) {
    const cQuote=String(candidate.quote??'').trim().slice(0,500);
    if(cQuote.length<4 || !text.includes(cQuote) || !['us','them'].includes(candidate.actor))continue;
    const due=explicitDate(cQuote)===candidate.dueDate?candidate.dueDate:null;
    if(candidate.actor!==(direction==='inbound'?'them':'us'))continue;
    commitments.push({actor:candidate.actor,actionText:String(candidate.actionText??'').trim().slice(0,240),
      quote:cQuote,dueDate:due,dueStatus:due?'resolved':candidate.dueStatus==='ambiguous'?'ambiguous':'unknown'});
  }
  const numericQuote=quote.replace(/\s/g,'');
  const amount=Number.isSafeInteger(raw.amountMinor)&&raw.amountMinor>=0&&
    numericQuote.includes(String(Math.floor(raw.amountMinor/100)))?raw.amountMinor:null;
  return {state:validState.data,category:String(raw.category??'unclassified').slice(0,80),
    reason:String(raw.reason??'').trim().slice(0,240)||base.reason,quote,
    nextAction:String(raw.nextAction??'').trim().slice(0,240)||null,
    commitments:commitments.filter(c=>c.actionText),amountMinor:amount,
    currency:amount!==null && /^[A-Z]{3}$/.test(raw.currency??'')?raw.currency:null,
    analysisStatus:'evidence_backed'};
}

function searchTerms(query) {
  const terms=String(query).normalize('NFC').match(/[\p{L}\p{N}][\p{L}\p{N}.-]*/gu)?.slice(0,10)??[];
  requireValue(terms.length>0,'SEARCH_QUERY_EMPTY');
  return terms.map(term=>`"${term.replaceAll('"','""')}"`).join(' AND ');
}

export class MailBrain {
  constructor({store,principal,providerFactory,env,now=Date.now,analyzer}) {
    Object.assign(this,{store,principal,providerFactory,env,now,
      analyzer:analyzer===undefined?((input,options)=>openAiBrainAnalyzer(input,env,options)):analyzer});
  }

  async analyzeMessage(input) {
    const audit=createAnalysisAudit(this.env);
    let proposed=null;
    if(!this.analyzer)audit.errorCode='ANALYZER_UNAVAILABLE';
    else if(this.analysisBudget===0)audit.errorCode='ANALYSIS_BUDGET_EXHAUSTED';
    else {
      if(Number.isFinite(this.analysisBudget))this.analysisBudget--;
      audit.analyzerInvoked=true;
      try{proposed=await this.analyzer(input,{audit});}
      catch(error){audit.errorCode=analysisErrorCode(error);}
    }
    audit.proposalReturned=proposed!==null&&proposed!==undefined;
    const analysis=normalizeAnalysis(proposed,input.message,input.direction);
    analysisOutcome(audit,analysisEvidence(proposed,input.message),analysis);
    return {analysis,audit,errorCode:audit.errorCode};
  }

  async recordAnalysis({tenantId,caseId,messageId,path,audit,eventId,errorCode,sourceStatus}) {
    const details={messageId,path,...safeAnalysisAudit(audit),
      ...(errorCode?{errorCode}:{}),...(sourceStatus?{sourceStatus}:{})};
    try{
      if(eventId)await this.store.run(`UPDATE brain_case_events SET details_json=? WHERE id=?`,
        JSON.stringify(details),eventId);
      else await this.store.run(`INSERT INTO brain_case_events VALUES (?,?,?,?,?,?,?)`,
        crypto.randomUUID(),tenantId,caseId,this.principal.id,
        'analysis.result',JSON.stringify(details),this.now());
      return true;
    }catch{console.warn('mail_brain.analysis.audit_failed',JSON.stringify({caseId,messageId}));
      return false;}
  }

  async access(mailboxId,action='read') {
    requireValue(!this.env.MAIL_BRAIN_PILOT_MAILBOX_ID||
      mailboxId===this.env.MAIL_BRAIN_PILOT_MAILBOX_ID,'PILOT_ACCESS_DENIED');
    return this.store.access(this.principal,mailboxId,action);
  }

  requirePilotMutations(){
    requireValue(this.env.MAIL_BRAIN_PILOT_READ_ONLY!=='true','BRAIN_PILOT_READ_ONLY');
  }

  async consent({mailboxId,lookbackDays=90}) {
    const mailbox=await this.access(mailboxId);
    requireValue(Number.isInteger(lookbackDays)&&lookbackDays>=1&&lookbackDays<=90,'INVALID_LOOKBACK');
    let sentFolder=mailbox.sent_folder;
    if(!sentFolder){
      const folders=await this.providerFactory(this.env,mailbox).listFolders();
      await this.access(mailbox.id);
      const matches=folders.folders.filter(folder=>folder.specialUse==='\\Sent'&&
        folder.selectable!==false&&folder.path!=='INBOX');
      requireValue(matches.length===1,'SENT_FOLDER_NOT_CONFIGURED');
      sentFolder=matches[0].path;
    }
    requireValue(sentFolder!=='INBOX','SENT_FOLDER_NOT_CONFIGURED');
    const now=this.now();
    await this.store.run(`INSERT INTO brain_consents
      (tenant_id,principal_id,mailbox_id,lookback_days,sent_folder,consented_at)
      VALUES (?,?,?,?,?,?) ON CONFLICT(tenant_id,principal_id,mailbox_id) DO UPDATE SET
      lookback_days=excluded.lookback_days,sent_folder=excluded.sent_folder,
      consented_at=excluded.consented_at,revoked_at=NULL`,
    mailbox.tenant_id,this.principal.id,mailbox.id,lookbackDays,sentFolder,now);
    await this.store.run(`UPDATE brain_sync_cursors SET window_start=?,window_end=?,
      next_before_uid=NULL,status='pending',scanned_count=0,indexed_count=0,
      last_complete_at=NULL,error_code=NULL,lease_until=0 WHERE tenant_id=? AND mailbox_id=?
      AND folder IN ('INBOX',?) AND window_start>?`,now-lookbackDays*day,now,mailbox.tenant_id,mailbox.id,
    sentFolder,now-lookbackDays*day);
    await this.store.audit(this.principal,mailbox.id,'brain.consent','completed');
    return {mailboxId,lookbackDays,sentFolder,consentedAt:now};
  }

  async revoke({mailboxId}) {
    const mailbox=await this.access(mailboxId);
    await this.store.run(`UPDATE brain_consents SET revoked_at=? WHERE tenant_id=? AND principal_id=?
      AND mailbox_id=? AND revoked_at IS NULL`,this.now(),mailbox.tenant_id,this.principal.id,mailbox.id);
    await this.store.audit(this.principal,mailbox.id,'brain.consent.revoke','completed');
    return {mailboxId,revoked:true};
  }

  async activeConsent(mailbox) {
    const consent=await this.store.first(`SELECT * FROM brain_consents WHERE tenant_id=? AND principal_id=?
      AND mailbox_id=? AND revoked_at IS NULL`,mailbox.tenant_id,this.principal.id,mailbox.id);
    requireValue(consent,'BRAIN_CONSENT_REQUIRED');
    return consent;
  }

  async rules({operation,mailboxId,category,senderAddress,action,destination,ruleId,version}) {
    requireValue(this.env.MAIL_BRAIN_ENABLED==='true','MAIL_BRAIN_DISABLED');
    const mailbox=await this.access(mailboxId);
    await this.activeConsent(mailbox);
    if(operation==='list'){
      const rows=await this.store.rows(`SELECT id,source,category,sender_address,action,destination,
        enabled,evidence_count,version,approved_at FROM brain_rules WHERE tenant_id=?
        AND (mailbox_id IS NULL OR mailbox_id=?)
        AND (source='company' OR owner_principal_id=?)
        ORDER BY CASE source WHEN 'company' THEN 0 WHEN 'user' THEN 1 ELSE 2 END,
          created_at,id`,mailbox.tenant_id,mailbox.id,this.principal.id);
      await this.access(mailbox.id);
      return {rules:rows,precedence:['company','user','learned','ai']};
    }
    this.requirePilotMutations();
    await this.store.access(this.principal,mailbox.id,'write');
    if(operation==='propose'){
      requireValue(['prioritize','deprioritize'].includes(action),'RULE_ACTION_NOT_READY');
      const now=this.now(),newId=crypto.randomUUID();
      await this.store.run(`INSERT INTO brain_rules
        (id,tenant_id,mailbox_id,owner_principal_id,source,category,sender_address,action,
         destination,enabled,created_at,updated_at) VALUES (?,?,?,?,'user',?,?,?,?,0,?,?)`,
      newId,mailbox.tenant_id,mailbox.id,this.principal.id,category,
      senderAddress?.toLowerCase()??null,action,destination??null,now,now);
      await this.store.audit(this.principal,mailbox.id,'brain.rule.propose','completed');
      return {ruleId:newId,version:1,enabled:false,approval:'soai_required'};
    }
    requireValue(operation==='disable','INVALID_RULE_OPERATION');
    const changed=await this.store.first(`UPDATE brain_rules SET enabled=0,version=version+1,updated_at=?
      WHERE id=? AND tenant_id=? AND mailbox_id=? AND owner_principal_id=?
      AND source IN ('user','learned') AND version=? RETURNING version`,this.now(),
    ruleId,mailbox.tenant_id,mailbox.id,this.principal.id,version);
    requireValue(changed,'RULE_VERSION_CONFLICT');
    await this.store.audit(this.principal,mailbox.id,'brain.rule.disable','completed');
    return {ruleId,version:changed.version,enabled:false};
  }

  async createDraft({caseId,caseRevision,requestId,message}) {
    requireValue(this.env.MAIL_BRAIN_ENABLED==='true','MAIL_BRAIN_DISABLED');
    this.requirePilotMutations();
    const {row,mailbox}=await this.caseAccess(caseId);
    requireValue(row.revision===caseRevision,'CASE_VERSION_CONFLICT');
    await this.store.access(this.principal,mailbox.id,'send');
    requireValue(this.env.OUTBOX_KEY,'SEND_NOT_CONFIGURED');
    const latest=await this.store.first(`SELECT message_key FROM brain_messages WHERE case_id=?
      AND direction='inbound' ORDER BY received_at DESC,id DESC LIMIT 1`,caseId);
    const replyTo=normId(latest?.message_key);
    const exact=sendMessage.parse({...message,inReplyTo:replyTo??undefined,
      references:replyTo?[replyTo]:undefined});
    const payload={caseId,caseRevision,message:exact};
    const payloadHash=await digest(payload),draftId=crypto.randomUUID(),now=this.now();
    const cipher=await seal(payload,this.env.OUTBOX_KEY,`${mailbox.tenant_id}:${draftId}`);
    await this.store.run(`INSERT INTO brain_drafts
      (id,tenant_id,principal_id,mailbox_id,case_id,case_revision,request_id,payload_hash,
        payload_cipher,created_at,expires_at) VALUES (?,?,?,?,?,?,?,?,?,?,?)
      ON CONFLICT(principal_id,case_id,request_id) DO NOTHING`,draftId,mailbox.tenant_id,
    this.principal.id,mailbox.id,caseId,caseRevision,requestId,payloadHash,cipher,now,now+86400000);
    const rowDraft=await this.store.first(`SELECT * FROM brain_drafts WHERE principal_id=?
      AND case_id=? AND request_id=?`,this.principal.id,caseId,requestId);
    requireValue(rowDraft?.payload_hash===payloadHash,'IDEMPOTENCY_CONFLICT');
    requireValue(rowDraft.expires_at>now,'DRAFT_EXPIRED');
    await this.store.audit(this.principal,mailbox.id,'brain.draft.create','completed');
    return {draftId:rowDraft.id,caseId,caseRevision,from:mailbox.address,
      message:exact,expiresAt:new Date(rowDraft.expires_at).toISOString(),
      state:'unsent',attachments:[]};
  }

  async sendDraft({draftId}) {
    requireValue(this.env.MAIL_BRAIN_ENABLED==='true','MAIL_BRAIN_DISABLED');
    this.requirePilotMutations();
    const draft=await this.store.first(`SELECT * FROM brain_drafts WHERE id=? AND principal_id=?`,
      draftId,this.principal.id);
    requireValue(draft,'DRAFT_NOT_FOUND');
    const {row,mailbox}=await this.caseAccess(draft.case_id);
    requireValue(row.revision===draft.case_revision,'CASE_VERSION_CONFLICT');
    await this.store.access(this.principal,mailbox.id,'send');
    requireValue(draft.expires_at>this.now(),'DRAFT_EXPIRED');
    const payload=await unseal(draft.payload_cipher,this.env.OUTBOX_KEY,
      `${draft.tenant_id}:${draft.id}`);
    requireValue(payload.caseId===row.id&&payload.caseRevision===row.revision,
      'DRAFT_CONTEXT_CHANGED');
    const approval=new SendApproval(this.store,this.env,
      new Outbox(this.store,this.env,this.providerFactory,this.now),this.now);
    const proposal=await approval.prepare(this.principal,{mailboxId:mailbox.id,
      message:payload.message,requestId:draft.id},false);
    await this.store.run(`UPDATE brain_drafts SET approval_proposal_id=? WHERE id=?
      AND (approval_proposal_id IS NULL OR approval_proposal_id=?)`,proposal.proposalId,
    draft.id,proposal.proposalId);
    return {...proposal,caseId:row.id,draftId,requiresExactUiApproval:true};
  }

  async getAttachment({attachmentId}) {
    requireValue(this.env.MAIL_BRAIN_ENABLED==='true','MAIL_BRAIN_DISABLED');
    const attachment=await this.store.first(`SELECT a.*,m.case_id,m.reference_json,m.mailbox_id
      FROM brain_attachments a JOIN brain_messages m ON m.id=a.message_id WHERE a.id=?`,attachmentId);
    requireValue(attachment,'ATTACHMENT_NOT_FOUND');
    const {mailbox}=await this.caseAccess(attachment.case_id);
    requireValue(attachment.tenant_id===mailbox.tenant_id&&attachment.mailbox_id===mailbox.id,
      'ACCESS_DENIED');
    if(!attachment.sha256){await this.access(mailbox.id);await this.activeConsent(mailbox);
      return {id:attachmentId,caseId:attachment.case_id,
      filename:attachment.filename,sizeBytes:attachment.size_bytes,
      declaredType:attachment.declared_type,verifiedType:null,sha256:null,
      sourceUnchanged:null,scanStatus:attachment.scan_status,previewAvailable:false,
      reason:'NOT_VERIFIED'};}
    const provider=this.providerFactory(this.env,mailbox);
    requireValue(typeof provider.inspectPdfAttachments==='function','ATTACHMENT_INSPECTION_UNAVAILABLE');
    const observed=(await provider.inspectPdfAttachments(JSON.parse(attachment.reference_json)))
      .find(a=>a.index===attachment.part_index);
    await this.access(mailbox.id);await this.activeConsent(mailbox);
    const matches=observed?.isPdf&&attachment.sha256&&observed.sha256===attachment.sha256&&
      observed.size===attachment.size_bytes;
    if(!matches)await this.store.run(`UPDATE brain_attachments SET scan_status='blocked',updated_at=?
      WHERE id=?`,this.now(),attachmentId);
    return {id:attachmentId,caseId:attachment.case_id,filename:attachment.filename,
      sizeBytes:attachment.size_bytes,declaredType:attachment.declared_type,
      verifiedType:matches?'application/pdf':null,sha256:attachment.sha256,
      sourceUnchanged:!!matches,scanStatus:matches?attachment.scan_status:'blocked',
      previewAvailable:!!matches&&attachment.scan_status==='safe',
      reason:!matches?'SOURCE_CHANGED_OR_UNSAFE':attachment.scan_status==='safe'?null:
        attachment.scan_status==='blocked'?'BLOCKED':'SCAN_PENDING'};
  }

  async activateRule({mailboxId,ruleId,version},approvalSource) {
    this.requirePilotMutations();
    requireValue(approvalSource==='soai_session','APPROVAL_UI_REQUIRED');
    const mailbox=await this.access(mailboxId);await this.activeConsent(mailbox);
    await this.store.access(this.principal,mailbox.id,'write');
    const rule=await this.store.first(`SELECT * FROM brain_rules WHERE id=? AND tenant_id=?
      AND mailbox_id=? AND owner_principal_id=? AND source='user'`,ruleId,
    mailbox.tenant_id,mailbox.id,this.principal.id);
    requireValue(rule?.version===version,'RULE_VERSION_CONFLICT');
    // Personal rules only change this user's view. Assignment and forwarding
    // would mutate shared state or send mail and need a separate workflow.
    requireValue(['prioritize','deprioritize'].includes(rule.action),'RULE_ACTION_NOT_READY');
    const changed=await this.store.first(`UPDATE brain_rules SET enabled=1,approved_by=?,approved_at=?,
      version=version+1,updated_at=? WHERE id=? AND version=? AND enabled=0 RETURNING version`,
    this.principal.id,this.now(),this.now(),ruleId,version);
    requireValue(changed,'RULE_VERSION_CONFLICT');
    await this.store.audit(this.principal,mailbox.id,'brain.rule.activate','completed');
    return {ruleId,version:changed.version,enabled:true};
  }

  async decisionRule(mailbox,analysis,sender){
    const rules=await this.store.rows(`SELECT * FROM brain_rules WHERE tenant_id=? AND enabled=1
      AND (mailbox_id IS NULL OR mailbox_id=?) AND category=?
      AND (sender_address IS NULL OR LOWER(sender_address)=?)
      AND source='company'
      ORDER BY CASE WHEN sender_address IS NULL THEN 1 ELSE 0 END,created_at,id LIMIT 10`,
    mailbox.tenant_id,mailbox.id,analysis.category,sender.toLowerCase());
    for(const rule of rules){
      if(rule.action==='forward')continue;
      if(rule.action==='assign'){
        try{await this.store.access({id:rule.destination,scopes:['forpsi:read']},mailbox.id,'read');}
        catch{continue;}
      }
      return rule;
    }
    return null;
  }

  async personalRules(mailbox){
    return this.store.rows(`SELECT id,source,category,sender_address,action FROM brain_rules
      WHERE tenant_id=? AND (mailbox_id IS NULL OR mailbox_id=?)
      AND owner_principal_id=? AND source IN ('user','learned') AND enabled=1
      AND action IN ('prioritize','deprioritize')
      ORDER BY CASE source WHEN 'user' THEN 0 ELSE 1 END,
        CASE WHEN sender_address IS NULL THEN 1 ELSE 0 END,id`,
    mailbox.tenant_id,mailbox.id,this.principal.id);
  }

  applyPersonalRule(row,sender,rules){
    if(row.decision_source==='company')return row;
    const rule=rules.find(candidate=>candidate.category===row.category&&
      (!candidate.sender_address||candidate.sender_address.toLowerCase()===sender.toLowerCase()));
    if(!rule)return row;
    return {...row,base_state:row.state,
      state:rule.action==='prioritize'?'todo':'information',
      reason:`${rule.source==='user'?'Osobní':'Naučené'} pravidlo ${rule.action}; ${row.reason}`,
      decision_source:rule.source,decision_rule_id:rule.id};
  }

  async reanalyzePending(mailbox,provider,consent,limit=2,targetCaseId=null){
    if(!this.env.FORPSI_ANALYSIS_MODEL||this.analysisBudget===0){
      const audit=createAnalysisAudit(this.env);
      audit.errorCode=!this.env.FORPSI_ANALYSIS_MODEL?'MODEL_NOT_CONFIGURED':'ANALYSIS_BUDGET_EXHAUSTED';
      audit.finalReason=audit.errorCode;
      return {attempted:0,verified:0,skipReason:audit.errorCode,configuration:safeAnalysisAudit(audit)};
    }
    const pending=await this.store.rows(`SELECT m.id AS message_id,m.folder,m.reference_json,m.message_key,
      m.content_hash,
      c.id AS case_id,c.revision FROM brain_cases c JOIN brain_messages m
      ON m.id=c.reason_message_id WHERE c.tenant_id=? AND c.mailbox_id=?
      AND c.analysis_status!='evidence_backed' AND c.state!='done'
      AND c.decision_source='ai' AND c.merged_into_case_id IS NULL
      AND (? IS NULL OR c.id=?)
      AND m.received_at>=?
      AND NOT EXISTS (SELECT 1 FROM brain_case_events e WHERE e.case_id=c.id
        AND e.event_type LIKE 'case.%')
      ORDER BY (SELECT COUNT(*) FROM brain_case_events e WHERE e.case_id=c.id
        AND e.event_type='analysis.attempt'),c.latest_at DESC LIMIT ?`,
    mailbox.tenant_id,mailbox.id,targetCaseId,targetCaseId,
    this.now()-consent.lookback_days*day,limit);
    let verified=0,errorCode=null;
    const audits=[];
    for(const row of pending){
      await this.access(mailbox.id);await this.activeConsent(mailbox);
      const attemptId=crypto.randomUUID();
      let audit=createAnalysisAudit(this.env);
      await this.store.run(`INSERT INTO brain_case_events VALUES (?,?,?,?,?,?,?)`,
        attemptId,mailbox.tenant_id,row.case_id,this.principal.id,
        'analysis.attempt',JSON.stringify({messageId:row.message_id}),this.now());
      const recordReason=async(code=null,sourceStatus)=>{
        if(code){audit.errorCode=code;audit.finalReason=sourceStatus??code;}
        const auditPersisted=await this.recordAnalysis({tenantId:mailbox.tenant_id,
          caseId:row.case_id,messageId:row.message_id,path:'reanalysis',audit,
          eventId:attemptId,errorCode:code,sourceStatus});
        audits.push({caseId:row.case_id,messageId:row.message_id,
          ...safeAnalysisAudit(audit),auditPersisted});
      };
      let message;
      let reference;
      try{reference=JSON.parse(row.reference_json);}
      catch{await recordReason('SOURCE_REFERENCE_INVALID');continue;}
      if(targetCaseId&&![consent.inbox_folder,consent.sent_folder].includes(reference.folder)){
        await recordReason('SOURCE_OUTSIDE_CONSENT');continue;
      }
      try{message=await readBrainMessage(provider,reference);}
      catch(error){
        const code=sourceReadCode(error);
        await recordReason(code,
          ['MESSAGE_NOT_FOUND','STALE_MESSAGE_REFERENCE'].includes(code)
            ?'SOURCE_MOVED_OR_UNAVAILABLE':undefined);
        continue;
      }
      if(message?.reference?.folder!==reference.folder||
        message.reference.uid!==reference.uid||
        String(message.reference.uidValidity)!==String(reference.uidValidity)){
        await recordReason('SOURCE_REFERENCE_MISMATCH');continue;
      }
      const storedMessageId=normId(row.message_key);
      if(storedMessageId && normId(message.messageId)!==storedMessageId){
        await recordReason('SOURCE_IDENTITY_MISMATCH');continue;
      }
      const sourceHash=hash(JSON.stringify([message.subject??'',message.from,
        String(message.text??'').slice(0,100000)]));
      if(sourceHash!==row.content_hash){await recordReason('SOURCE_HASH_CHANGED');continue;}
      const direction=message.reference.folder===consent.sent_folder?'outbound':'inbound';
      const analyzed=await this.analyzeMessage({message,direction,mailboxAddress:mailbox.address});
      audit=analyzed.audit;
      if(analyzed.errorCode){
        errorCode=analyzed.errorCode;
        await recordReason();
        break;
      }
      try{await this.access(mailbox.id);await this.activeConsent(mailbox);}
      catch(error){await recordReason(analysisErrorCode(error));throw error;}
      const analysis=analyzed.analysis;
      if(analysis.analysisStatus!=='evidence_backed'){
        // Keep the legacy error code while exposing the precise common evidence reason.
        if(audit.quoteLength<4||!audit.quoteMatchesAuthoredText)
          audit.errorCode='EVIDENCE_QUOTE_UNVERIFIED';
        await recordReason();
        continue;
      }
      const rule=await this.decisionRule(mailbox,analysis,message.from?.[0]?.address??'');
      const resultingState=rule?.action==='prioritize'?'todo':
        rule?.action==='deprioritize'?'information':analysis.state;
      const resultingReason=rule?`Firemní pravidlo ${rule.action}; zdroj: ${analysis.reason}`:
        analysis.reason;
      const updated=await this.store.run(`UPDATE brain_cases SET state=?,category=?,next_action=?,
        reason=?,reason_quote=?,amount_minor=COALESCE(?,amount_minor),
        currency=COALESCE(?,currency),analysis_status='evidence_backed',
        decision_source=?,decision_rule_id=?,revision=revision+1,updated_at=?
        WHERE id=? AND revision=? AND reason_message_id=? AND state!='done'
        AND analysis_status!='evidence_backed' AND decision_source='ai'
        AND NOT EXISTS (SELECT 1 FROM brain_case_events e WHERE e.case_id=brain_cases.id
          AND e.event_type LIKE 'case.%')`,
      resultingState,analysis.category,analysis.nextAction,resultingReason,analysis.quote,
      analysis.amountMinor,analysis.currency,rule?.source??'ai',rule?.id??null,
      this.now(),row.case_id,row.revision,row.message_id);
      if(updated.meta?.changes!==1){audit.finalReason='CASE_UPDATE_CONFLICT';
        await recordReason();continue;}
      for(const commitment of analysis.commitments)await this.store.run(`INSERT OR IGNORE INTO
        brain_commitments (id,tenant_id,case_id,message_id,actor,action_text,due_date,
        due_status,evidence_quote,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?)`,
      crypto.randomUUID(),mailbox.tenant_id,row.case_id,row.message_id,commitment.actor,
      commitment.actionText,commitment.dueDate,commitment.dueStatus,commitment.quote,
      this.now(),this.now());
      verified++;
      audit.caseEvidenceBacked=true;
      await recordReason();
    }
    return {attempted:pending.length,verified,errorCode,audits};
  }

  async reanalyzeOne({mailboxId,caseId}) {
    requireValue(this.env.MAIL_BRAIN_ENABLED==='true'&&
      this.env.MAIL_BRAIN_PILOT_READ_ONLY==='true'&&
      this.env.MAIL_BRAIN_SCHEDULED_SYNC_ENABLED==='false'&&
      this.env.MAIL_BRAIN_ANALYSIS_CASE_ID===caseId&&uuid.safeParse(caseId).success&&
      mailboxId===this.env.MAIL_BRAIN_PILOT_MAILBOX_ID,'TARGETED_ANALYSIS_DISABLED');
    const mailbox=await this.access(mailboxId),consent=await this.activeConsent(mailbox);
    requireValue(mailbox.tenant_id===this.env.FORPSI_TENANT_ID,'ACCESS_DENIED');
    const eligible=await this.store.first(`SELECT c.id FROM brain_cases c JOIN brain_messages m
      ON m.id=c.reason_message_id AND m.case_id=c.id WHERE c.id=? AND c.tenant_id=?
      AND c.mailbox_id=? AND c.analysis_status!='evidence_backed' AND c.state!='done'
      AND c.decision_source='ai' AND c.merged_into_case_id IS NULL
      AND m.folder IN (?,?) AND m.received_at>=?
      AND NOT EXISTS(SELECT 1 FROM brain_case_events e WHERE e.case_id=c.id
        AND e.event_type LIKE 'case.%')`,caseId,mailbox.tenant_id,mailboxId,
    consent.inbox_folder,consent.sent_folder,this.now()-consent.lookback_days*day);
    requireValue(eligible,'TARGET_CASE_NOT_ELIGIBLE');
    requireValue((await this.store.first('SELECT COUNT(*) AS n FROM outbox')).n===0,
      'TARGET_OUTBOX_NOT_EMPTY');
    // One atomic statement makes repeated or concurrent triggers fail before the provider/model.
    const eventId=crypto.randomUUID();
    const claimed=await this.store.run(`INSERT INTO brain_case_events
      (id,tenant_id,case_id,actor_principal_id,event_type,details_json,created_at)
      SELECT ?,?,?,?,'analysis.targeted',?,? WHERE NOT EXISTS
      (SELECT 1 FROM brain_case_events WHERE case_id=? AND event_type='analysis.targeted')`,
    eventId,mailbox.tenant_id,caseId,this.principal.id,JSON.stringify({status:'claimed'}),
    this.now(),caseId);
    requireValue(claimed.meta?.changes===1,'TARGET_ANALYSIS_ALREADY_ATTEMPTED');
    this.analysisBudget=1;
    const result=await this.reanalyzePending(mailbox,this.providerFactory(this.env,mailbox),consent,1,caseId);
    const outboxCount=(await this.store.first('SELECT COUNT(*) AS n FROM outbox')).n;
    await this.store.run('UPDATE brain_case_events SET details_json=? WHERE id=?',
      JSON.stringify({status:'completed',verified:result.verified,outboxCount}),eventId);
    const output={mailboxId,targetCaseId:caseId,reanalysis:result,outboxCount};
    console.info('mail_brain.analysis.targeted',JSON.stringify(output));
    return output;
  }

  async sync({mailboxId,limit=10}) {
    requireValue(this.env.MAIL_BRAIN_ENABLED==='true','MAIL_BRAIN_DISABLED');
    // Temporary, server-selected one-case execution through the existing authenticated transport.
    // It returns before any history search, indexMessage call or cursor access.
    if(this.env.MAIL_BRAIN_ANALYSIS_CASE_ID)
      return this.reanalyzeOne({mailboxId,caseId:this.env.MAIL_BRAIN_ANALYSIS_CASE_ID});
    if(this.env.MAIL_BRAIN_RECOVER_SENT_UID74324==='true')
      return this.recoverSkippedSent({mailboxId});
    const mailbox=await this.access(mailboxId),consent=await this.activeConsent(mailbox);
    const provider=this.providerFactory(this.env,mailbox),now=this.now(),leaseUntil=now+600000;
    this.analysisBudget=this.env.FORPSI_ANALYSIS_PROXY_URL?1:Infinity;
    const result={mailboxId,folders:[],indexed:0,scanned:0,complete:true,
      reanalysis:await this.reanalyzePending(mailbox,provider,consent,
        this.env.FORPSI_ANALYSIS_PROXY_URL?1:2)};
    for(const folder of [consent.inbox_folder,consent.sent_folder]) {
      const windowStart=now-consent.lookback_days*day;
      await this.store.run(`INSERT OR IGNORE INTO brain_sync_cursors
        (tenant_id,mailbox_id,folder,window_start,window_end)
        VALUES (?,?,?,?,?)`,mailbox.tenant_id,mailbox.id,folder,windowStart,now);
      const claimed=await this.store.first(`UPDATE brain_sync_cursors SET lease_until=?,last_attempt_at=?,
        status='partial' WHERE tenant_id=? AND mailbox_id=? AND folder=?
        AND lease_until<=? RETURNING *`,leaseUntil,now,mailbox.tenant_id,mailbox.id,folder,now);
      if(!claimed){result.complete=false;result.folders.push({folder,status:'busy'});continue;}
      let scanned=0,indexed=0,errorCode=null,nextBeforeUid=claimed.next_before_uid;
      let stickyError=claimed.error_code==='MESSAGE_TOO_LARGE'?'MESSAGE_TOO_LARGE':null;
      let uidValidity=claimed.uid_validity,finished=false;
      try {
        const page=await provider.search({folder,limit:Math.min(limit,
          this.env.FORPSI_ANALYSIS_PROXY_URL?2:10),since:isoDay(claimed.window_start),
          ...(nextBeforeUid?{beforeUid:nextBeforeUid}:{})});
        if(uidValidity && page.uidValidity && String(page.uidValidity)!==String(uidValidity)) {
          nextBeforeUid=null;uidValidity=String(page.uidValidity);
          throw new Error('UID_VALIDITY_CHANGED');
        }
        uidValidity=page.uidValidity?String(page.uidValidity):uidValidity;
        for(const summary of page.messages) {
          scanned++;
          try {
            await this.access(mailbox.id);
            await this.activeConsent(mailbox);
            const detail=await readBrainMessage(provider,summary.reference);
            await this.access(mailbox.id);
            await this.activeConsent(mailbox);
            await this.indexMessage(mailbox,detail,folder,provider,consent.sent_folder);
            const checkpoint=await this.store.run(`UPDATE brain_sync_cursors SET
              uid_validity=?,next_before_uid=?,scanned_count=scanned_count+1,
              indexed_count=indexed_count+1 WHERE tenant_id=? AND mailbox_id=?
              AND folder=? AND lease_until=?`,uidValidity,summary.reference.uid,
            mailbox.tenant_id,mailbox.id,folder,leaseUntil);
            requireValue(checkpoint.meta?.changes===1,'SYNC_LEASE_LOST');
            nextBeforeUid=summary.reference.uid;
            indexed++;
          } catch(error) {
            if(failureCode(error)==='MESSAGE_TOO_LARGE'){
              try{
                await this.access(mailbox.id);await this.activeConsent(mailbox);
                const skipped=await this.store.run(`UPDATE brain_sync_cursors SET
                  uid_validity=?,next_before_uid=?,scanned_count=scanned_count+1,
                  error_code='MESSAGE_TOO_LARGE' WHERE tenant_id=? AND mailbox_id=?
                  AND folder=? AND lease_until=?`,uidValidity,summary.reference.uid,
                mailbox.tenant_id,mailbox.id,folder,leaseUntil);
                requireValue(skipped.meta?.changes===1,'SYNC_LEASE_LOST');
                nextBeforeUid=summary.reference.uid;
                stickyError='MESSAGE_TOO_LARGE';
                continue;
              }catch(checkpointError){errorCode=failureCode(checkpointError);break;}
            }
            errorCode=failureCode(error);break;
          }
        }
        finished=page.nextBeforeUid==null && !errorCode;
        if(!errorCode)nextBeforeUid=page.nextBeforeUid;
      } catch(error) { errorCode=failureCode(error); }
      const status=errorCode?'failed':finished&&!stickyError?'complete':'partial';
      const saved=await this.store.run(`UPDATE brain_sync_cursors SET uid_validity=?,next_before_uid=?,
        status=?,
        last_complete_at=CASE WHEN ?='complete' THEN ? ELSE last_complete_at END,
        window_end=CASE WHEN ?='complete' THEN ? ELSE window_end END,
        error_code=?,lease_until=0 WHERE tenant_id=? AND mailbox_id=? AND folder=?
        AND lease_until=?`,uidValidity,nextBeforeUid,status,status,now,status,now,
      errorCode??stickyError,mailbox.tenant_id,mailbox.id,folder,leaseUntil);
      if(saved.meta?.changes!==1){result.complete=false;
        result.folders.push({folder,status:'superseded',scanned,indexed,errorCode});continue;}
      result.scanned+=scanned;result.indexed+=indexed;
      result.complete &&= finished&&!stickyError;
      result.folders.push({folder,status,scanned,indexed,errorCode:errorCode??stickyError,
        nextBeforeUid});
    }
    result.analysisErrorCode=this.analysisErrorCode??result.reanalysis.errorCode??null;
    await this.store.audit(this.principal,mailbox.id,'brain.sync',result.complete?'complete':'partial');
    if(this.env.MAIL_BRAIN_PILOT_READ_ONLY==='true')console.info('mail_brain.sync.summary',
      JSON.stringify({mailboxId,scanned:result.scanned,indexed:result.indexed,
        folders:result.folders.map(({folder,status,scanned,indexed,errorCode})=>
          ({folder,status,scanned,indexed,errorCode})),
        reanalysis:result.reanalysis,analysisErrorCode:result.analysisErrorCode}));
    return result;
  }

  async recoverSkippedSent({mailboxId}) {
    const target=skippedSentRecovery,now=this.now(),leaseUntil=now+600000;
    requireValue(this.env.MAIL_BRAIN_ENABLED==='true'&&
      this.env.MAIL_BRAIN_PILOT_READ_ONLY==='true'&&
      this.env.MAIL_BRAIN_SCHEDULED_SYNC_ENABLED!=='true'&&
      this.env.FORPSI_TENANT_ID===target.tenant&&
      this.env.MAIL_BRAIN_PILOT_MAILBOX_ID===target.mailboxId&&
      mailboxId===target.mailboxId,'RECOVERY_DISABLED');
    const mailbox=await this.access(mailboxId),consent=await this.activeConsent(mailbox);
    requireValue(mailbox.active===1&&mailbox.tenant_id===target.tenant&&
      consent.sent_folder===target.folder,'RECOVERY_PRECONDITION_FAILED');
    const cursor=await this.store.first(`SELECT * FROM brain_sync_cursors
      WHERE tenant_id=? AND mailbox_id=? AND folder=?`,target.tenant,mailboxId,target.folder);
    requireValue(cursor?.status==='partial'&&cursor.uid_validity===target.uidValidity&&
      cursor.next_before_uid===target.nextBeforeUid&&
      cursor.scanned_count===target.scannedCount&&
      cursor.indexed_count===target.indexedCount&&
      cursor.error_code==='MESSAGE_TOO_LARGE'&&cursor.lease_until<=now,
    'RECOVERY_PRECONDITION_FAILED');
    const indexed=async key=>this.store.first(`SELECT id FROM brain_messages WHERE tenant_id=?
      AND mailbox_id=? AND (message_key=? OR (folder=?
      AND json_extract(reference_json,'$.uid')=?
      AND json_extract(reference_json,'$.uidValidity')=?)) LIMIT 1`,
    target.tenant,mailboxId,key,target.folder,target.uid,target.uidValidity);
    const ref={folder:target.folder,uid:target.uid,uidValidity:target.uidValidity};
    requireValue(!(await indexed(`${target.folder}:${target.uidValidity}:${target.uid}`)),
      'RECOVERY_PRECONDITION_FAILED');
    requireValue((await this.store.first('SELECT COUNT(*) AS n FROM outbox WHERE mailbox_id=?',
      mailboxId)).n===0,'RECOVERY_PRECONDITION_FAILED');
    const provider=this.providerFactory(this.env,mailbox);
    requireValue(typeof provider.readForBrain==='function','RECOVERY_READER_UNAVAILABLE');
    const message=await provider.readForBrain(ref);
    requireValue(message?.reference?.folder===target.folder&&
      message.reference.uid===target.uid&&
      String(message.reference.uidValidity)===target.uidValidity,
    'SOURCE_REFERENCE_MISMATCH');
    const key=messageKey(message);
    await this.access(mailboxId);
    const currentConsent=await this.activeConsent(mailbox);
    requireValue(currentConsent.sent_folder===target.folder&&!(await indexed(key)),
      'RECOVERY_PRECONDITION_FAILED');
    const claimed=await this.store.first(`UPDATE brain_sync_cursors SET lease_until=?
      WHERE tenant_id=? AND mailbox_id=? AND folder=? AND status='partial'
      AND uid_validity=? AND next_before_uid=? AND scanned_count=? AND indexed_count=?
      AND error_code='MESSAGE_TOO_LARGE' AND lease_until<=?
      AND NOT EXISTS (SELECT 1 FROM brain_messages WHERE tenant_id=? AND mailbox_id=?
        AND message_key=?) RETURNING *`,leaseUntil,target.tenant,mailboxId,target.folder,
    target.uidValidity,target.nextBeforeUid,target.scannedCount,target.indexedCount,now,
    target.tenant,mailboxId,key);
    requireValue(claimed,'RECOVERY_PRECONDITION_FAILED');
    let committed=false;
    try{
      this.analysisBudget=this.env.FORPSI_ANALYSIS_PROXY_URL?1:Infinity;
      const result=await this.indexMessage(mailbox,message,target.folder,provider,
        consent.sent_folder);
      requireValue(!result.unchanged,'RECOVERY_PRECONDITION_FAILED');
      await this.access(mailboxId);
      const finalConsent=await this.activeConsent(mailbox);
      requireValue(finalConsent.sent_folder===target.folder,'RECOVERY_PRECONDITION_FAILED');
      const update=this.store.db.prepare(`UPDATE brain_sync_cursors SET
        indexed_count=indexed_count+1,error_code=NULL,lease_until=0
        WHERE tenant_id=? AND mailbox_id=? AND folder=? AND lease_until=?
        AND uid_validity=? AND next_before_uid=? AND scanned_count=? AND indexed_count=?
        AND error_code='MESSAGE_TOO_LARGE'`).bind(target.tenant,mailboxId,target.folder,
      leaseUntil,target.uidValidity,target.nextBeforeUid,target.scannedCount,
      target.indexedCount);
      const audit=this.store.db.prepare(`INSERT INTO audit SELECT ?,?,?,?,?,?
        WHERE EXISTS (SELECT 1 FROM brain_sync_cursors WHERE tenant_id=? AND mailbox_id=?
          AND folder=? AND indexed_count=? AND error_code IS NULL AND lease_until=0)`)
        .bind(crypto.randomUUID(),this.now(),this.principal.id,mailboxId,
          'brain.recovery.skipped_sent','completed',target.tenant,mailboxId,target.folder,
          target.indexedCount+1);
      const saved=await this.store.db.batch([update,audit]);
      requireValue(saved[0].meta?.changes===1&&saved[1].meta?.changes===1,
        'RECOVERY_CURSOR_CONFLICT');
      committed=true;
      const outbox=(await this.store.first('SELECT COUNT(*) AS n FROM outbox WHERE mailbox_id=?',
        mailboxId)).n;
      requireValue(outbox===0,'RECOVERY_OUTBOX_CHANGED');
      console.info('mail_brain.recovery.summary',JSON.stringify({mailboxId,
        scannedCount:target.scannedCount,indexedCount:target.indexedCount+1,
        nextBeforeUid:target.nextBeforeUid,analysisErrorCode:this.analysisErrorCode??null,
        outboxCount:outbox}));
      return {mailboxId,scanned:0,indexed:1,complete:false,folders:[{
        folder:target.folder,status:'partial',scanned:0,indexed:1,errorCode:null,
        nextBeforeUid:target.nextBeforeUid}],reanalysis:{attempted:0,verified:0},
      analysisErrorCode:this.analysisErrorCode??null,recovery:{status:'recovered',
        messageId:result.messageId,caseId:result.caseId,
        scannedCount:target.scannedCount,indexedCount:target.indexedCount+1,
        nextBeforeUid:target.nextBeforeUid},outboxCount:outbox};
    }finally{
      if(!committed)await this.store.run(`UPDATE brain_sync_cursors SET lease_until=0
        WHERE tenant_id=? AND mailbox_id=? AND folder=? AND lease_until=?`,
      target.tenant,mailboxId,target.folder,leaseUntil);
    }
  }

  async indexMessage(mailbox,message,folder,provider,sentFolder=mailbox.sent_folder) {
    const now=this.now(),key=messageKey(message),ref=message.reference;
    requireValue(ref?.folder===folder,'SOURCE_FOLDER_MISMATCH');
    const sourceText=String(message.text??'').slice(0,100000),written=authoredText(sourceText);
    const direction=folder===sentFolder?'outbound':'inbound';
    const sourceHash=hash(JSON.stringify([message.subject??'',message.from,sourceText]));
    const prior=await this.store.first(`SELECT id,case_id,content_hash FROM brain_messages
      WHERE tenant_id=? AND mailbox_id=? AND message_key=?`,mailbox.tenant_id,mailbox.id,key);
    if(prior?.content_hash===sourceHash){
      await this.store.run(`UPDATE brain_messages SET reference_json=?,folder=?,indexed_at=? WHERE id=?`,
        JSON.stringify(ref),folder,now,prior.id);
      return {messageId:prior.id,caseId:prior.case_id,unchanged:true};
    }
    requireValue(!prior,'MESSAGE_ID_COLLISION');
    const parents=[...(Array.isArray(message.references)?message.references:[]),message.inReplyTo]
      .map(normId).filter(Boolean);
    let related=null;
    for(const parent of [...parents].reverse()) {
      related=await this.store.first(`SELECT case_id FROM brain_messages WHERE tenant_id=? AND mailbox_id=?
        AND message_key=?`,mailbox.tenant_id,mailbox.id,parent);
      if(related)break;
    }
    const threadKey=parents[0]??key;
    let caseRow=related?await this.store.first(`SELECT * FROM brain_cases WHERE id=?`,related.case_id):
      await this.store.first(`SELECT * FROM brain_cases WHERE tenant_id=? AND mailbox_id=? AND thread_key=?`,
        mailbox.tenant_id,mailbox.id,threadKey);
    if(caseRow?.merged_into_case_id)caseRow=await this.store.first(`SELECT * FROM brain_cases WHERE id=?
      AND tenant_id=? AND mailbox_id=?`,caseRow.merged_into_case_id,mailbox.tenant_id,mailbox.id);
    const at=safeDate(message.date,now),caseId=caseRow?.id??crypto.randomUUID();
    if(!caseRow){
      await this.store.run(`INSERT INTO brain_cases
        (id,tenant_id,mailbox_id,thread_key,title,latest_at,created_at,updated_at)
        VALUES (?,?,?,?,?,?,?,?)`,caseId,mailbox.tenant_id,mailbox.id,threadKey,
        String(message.subject??'(bez předmětu)').slice(0,500),at,now,now);
      caseRow=await this.store.first('SELECT * FROM brain_cases WHERE id=?',caseId);
    }
    const messageId=crypto.randomUUID();
    const analyzed=await this.analyzeMessage({message,caseRow,direction,mailboxAddress:mailbox.address});
    if(analyzed.errorCode&&!['ANALYZER_UNAVAILABLE','ANALYSIS_BUDGET_EXHAUSTED']
      .includes(analyzed.errorCode))this.analysisErrorCode=analyzed.errorCode;
    try{await this.access(mailbox.id);await this.activeConsent(mailbox);}
    catch(error){analyzed.audit.errorCode=analysisErrorCode(error);
      analyzed.audit.finalReason=analyzed.audit.errorCode;
      await this.recordAnalysis({tenantId:mailbox.tenant_id,caseId,messageId,path:'index',audit:analyzed.audit});
      throw error;}
    const analysis=analyzed.analysis;
    const rule=await this.decisionRule(mailbox,analysis,message.from?.[0]?.address??'');
    const resultingState=rule?.action==='prioritize'?'todo':
      rule?.action==='deprioritize'?'information':analysis.state;
    const resultingReason=rule?`${{company:'Firemní',user:'Osobní',learned:'Naučené'}[rule.source]}
      pravidlo ${rule.action}; zdroj: ${analysis.reason}`:analysis.reason;
    await this.store.run(`INSERT INTO brain_messages
      (id,tenant_id,mailbox_id,case_id,message_key,reference_json,folder,sender,recipients_json,
       subject,body_text,authored_text,received_at,direction,size_bytes,content_hash,indexed_at)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,messageId,mailbox.tenant_id,mailbox.id,caseId,key,
      JSON.stringify(ref),folder,message.from?.[0]?.address??'',
      JSON.stringify([...(message.to??[]),...(message.cc??[])]),String(message.subject??''),
      sourceText,written,at,direction,message.size??null,sourceHash,now);
    for(const commitment of analysis.commitments)await this.store.run(`INSERT OR IGNORE INTO brain_commitments
      (id,tenant_id,case_id,message_id,actor,action_text,due_date,due_status,evidence_quote,created_at,updated_at)
      VALUES (?,?,?,?,?,?,?,?,?,?,?)`,crypto.randomUUID(),mailbox.tenant_id,caseId,messageId,
      commitment.actor,commitment.actionText,commitment.dueDate,commitment.dueStatus,
      commitment.quote,now,now);
    let inspected=[];
    if((message.attachments??[]).some(a=>/pdf/i.test(a.contentType??'')||/\.pdf$/i.test(a.filename??'')) &&
      typeof provider.inspectPdfAttachments==='function') {
      try { inspected=await provider.inspectPdfAttachments(ref); } catch {/* Record unavailable metadata. */}
    }
    for(const [index,attachment] of (message.attachments??[]).entries()){
      const observed=inspected.find(a=>a.index===index);
      await this.store.run(`INSERT INTO brain_attachments
        (id,tenant_id,message_id,part_index,filename,declared_type,size_bytes,sha256,
         verified_type,scan_status,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?)`,
      crypto.randomUUID(),mailbox.tenant_id,messageId,index,String(attachment.filename??'').slice(0,255),
      String(attachment.contentType??'application/octet-stream').slice(0,100),
      attachment.size??observed?.size??0,observed?.sha256??null,
      observed?.isPdf?'application/pdf':null,observed?'pending':'unavailable',now);
    }
    let caseUpdate;
    if(at>=caseRow.latest_at)caseUpdate=await this.store.run(`UPDATE brain_cases SET state=?,category=?,next_action=?,reason=?,
      reason_message_id=?,reason_quote=?,amount_minor=COALESCE(?,amount_minor),
      currency=COALESCE(?,currency),latest_at=?,done_at=NULL,analysis_status=?,
      owner_principal_id=COALESCE(?,owner_principal_id),decision_source=?,decision_rule_id=?,
      revision=revision+1,updated_at=? WHERE id=?`,resultingState,analysis.category,
      analysis.nextAction,resultingReason,messageId,analysis.quote,analysis.amountMinor,
      analysis.currency,at,analysis.analysisStatus,rule?.action==='assign'?rule.destination:null,
      rule?.source??'ai',rule?.id??null,now,caseId);
    await this.store.run(`INSERT INTO brain_case_events VALUES (?,?,?,?,?,?,?)`,crypto.randomUUID(),
      mailbox.tenant_id,caseId,this.principal.id,'message.indexed',JSON.stringify({messageId,direction}),now);
    analyzed.audit.caseEvidenceBacked=caseUpdate?.meta?.changes===1&&analysis.analysisStatus==='evidence_backed';
    if(at<caseRow.latest_at)analyzed.audit.finalReason='CASE_NOT_LATEST_MESSAGE';
    else if(caseUpdate?.meta?.changes!==1)analyzed.audit.finalReason='CASE_UPDATE_CONFLICT';
    await this.recordAnalysis({tenantId:mailbox.tenant_id,caseId,messageId,path:'index',audit:analyzed.audit});
    return {messageId,caseId,unchanged:false};
  }

  async caseAccess(caseId) {
    const row=await this.store.first('SELECT * FROM brain_cases WHERE id=?',caseId);
    requireValue(row,'CASE_NOT_FOUND');
    const mailbox=await this.access(row.mailbox_id);
    requireValue(row.tenant_id===mailbox.tenant_id,'ACCESS_DENIED');
    await this.activeConsent(mailbox);
    return {row,mailbox};
  }

  async attention({mailboxId,limit=20}={}) {
    requireValue(this.env.MAIL_BRAIN_ENABLED==='true','MAIL_BRAIN_DISABLED');
    const accessible=(await this.store.mailboxes(this.principal))
      .filter(box=>(!mailboxId||box.id===mailboxId)&&
        (!this.env.MAIL_BRAIN_PILOT_MAILBOX_ID||
          box.id===this.env.MAIL_BRAIN_PILOT_MAILBOX_ID));
    requireValue(!mailboxId||accessible.length===1,'ACCESS_DENIED');
    const mailboxes=[];const cases=[];const counts={decision:0,todo:0,waiting:0,information:0,
      invoices:0,deadlines:0,overdue:0,review:0};
    for(const entry of accessible){
      const mailbox=await this.access(entry.id),consent=await this.store.first(`SELECT * FROM brain_consents
        WHERE tenant_id=? AND principal_id=? AND mailbox_id=? AND revoked_at IS NULL`,
      mailbox.tenant_id,this.principal.id,mailbox.id);
      const coverage=consent?await this.store.rows(`SELECT folder,status,window_start,window_end,
        scanned_count,indexed_count,last_complete_at,error_code FROM brain_sync_cursors
        WHERE tenant_id=? AND mailbox_id=? AND folder IN (?,?)`,mailbox.tenant_id,mailbox.id,
        consent.inbox_folder,consent.sent_folder):[];
      const complete=!!consent&&coverage.length===2&&coverage.every(x=>x.status==='complete'&&
        x.indexed_count===x.scanned_count&&x.window_end>=this.now()-900000);
      const stale=!!consent&&coverage.length===2&&coverage.every(x=>x.status==='complete'&&
        x.indexed_count===x.scanned_count)&&!complete;
      const permitted=async action=>{try{await this.store.access(this.principal,mailbox.id,action);
        return true;}catch{return false;}};
      mailboxes.push({id:mailbox.id,address:mailbox.address,consented:!!consent,
        canWrite:this.env.MAIL_BRAIN_PILOT_READ_ONLY!=='true'&&await permitted('write'),
        canSend:this.env.MAIL_BRAIN_PILOT_READ_ONLY!=='true'&&await permitted('send'),
        coverage:complete?'complete':!consent?'not_consented':stale?'stale':'partial',
        folders:coverage});
      if(!consent)continue;
      const rules=await this.personalRules(mailbox);
      const rows=await this.store.rows(`SELECT c.id,c.mailbox_id,c.title,c.state,c.category,c.next_action,
        c.reason,c.reason_quote,c.latest_at,c.snoozed_until,c.analysis_status,c.amount_minor,
        c.currency,c.revision,c.decision_source,c.decision_rule_id,
        (SELECT m.sender FROM brain_messages m WHERE m.case_id=c.id
          ORDER BY m.received_at DESC,m.id DESC LIMIT 1) AS latest_sender
        FROM brain_cases c WHERE c.tenant_id=? AND c.mailbox_id=?
        AND (c.owner_principal_id IS NULL OR c.owner_principal_id=?)
        AND c.state!='done' AND (c.snoozed_until IS NULL OR c.snoozed_until<=?)`,
        mailbox.tenant_id,mailbox.id,this.principal.id,this.now());
      for(const entry of rows){
        const effective=this.applyPersonalRule(entry,entry.latest_sender??'',rules);
        delete effective.latest_sender;
        if(effective.analysis_status!=='evidence_backed')counts.review++;
        else {
          counts[effective.state]++;
          if(effective.category==='invoice')counts.invoices++;
        }
        cases.push(effective);
      }
    }
    cases.sort((a,b)=>Number(a.analysis_status!=='evidence_backed')-
      Number(b.analysis_status!=='evidence_backed')||
      ['decision','todo','waiting','information'].indexOf(a.state)-
      ['decision','todo','waiting','information'].indexOf(b.state)||b.latest_at-a.latest_at);
    const visible=cases.slice(0,limit);
    for(const box of mailboxes.filter(x=>x.consented)){
      const mailbox=await this.access(box.id);
      const due=await this.store.first(`SELECT COUNT(DISTINCT c.id) AS count FROM brain_commitments k
        JOIN brain_cases c ON c.id=k.case_id WHERE k.status='open' AND k.due_date<?
        AND c.state!='done' AND c.tenant_id=? AND c.mailbox_id=?
        AND (c.owner_principal_id IS NULL OR c.owner_principal_id=?)`,pragueDay(this.now()),
        mailbox.tenant_id,mailbox.id,this.principal.id);
      counts.overdue+=due?.count??0;
      const upcoming=await this.store.first(`SELECT COUNT(DISTINCT c.id) AS count FROM brain_commitments k
        JOIN brain_cases c ON c.id=k.case_id WHERE k.status='open' AND k.due_date>=? AND k.due_date<=?
        AND c.state!='done' AND c.tenant_id=? AND c.mailbox_id=?
        AND (c.owner_principal_id IS NULL OR c.owner_principal_id=?)`,pragueDay(this.now()),
        pragueDay(this.now()+7*day),mailbox.tenant_id,mailbox.id,this.principal.id);
      counts.deadlines+=upcoming?.count??0;
    }
    for(const box of mailboxes){const mailbox=await this.access(box.id);
      if(box.consented)await this.activeConsent(mailbox);}
    return {counts,cases:visible,mailboxes,coverageComplete:mailboxes.length>0&&
      mailboxes.every(x=>x.coverage==='complete'),
      notice:mailboxes.length>0&&mailboxes.every(x=>x.coverage==='complete')?
        'Přehled zahrnuje dokončené synchronizační okno uvedené u schránek.':
        'Část pošty nebyla ověřena; zbývající zprávy nelze označit za nedůležité.'};
  }

  async getCase({caseId}) {
    requireValue(this.env.MAIL_BRAIN_ENABLED==='true','MAIL_BRAIN_DISABLED');
    const {row,mailbox}=await this.caseAccess(caseId);
    const messages=await this.store.rows(`SELECT id,reference_json,sender,recipients_json,subject,
      body_text,received_at,direction FROM brain_messages WHERE case_id=? ORDER BY received_at,id LIMIT 100`,caseId);
    const totalMessages=await this.store.first(`SELECT COUNT(*) AS count FROM brain_messages WHERE case_id=?`,caseId);
    const latestMessage=await this.store.first(`SELECT sender FROM brain_messages WHERE case_id=?
      ORDER BY received_at DESC,id DESC LIMIT 1`,caseId);
    const commitments=await this.store.rows(`SELECT id,message_id,actor,action_text,due_date,
      due_status,status,evidence_quote FROM brain_commitments WHERE case_id=? ORDER BY created_at`,caseId);
    const attachments=await this.store.rows(`SELECT a.id,a.message_id,a.part_index,a.filename,
      a.declared_type,a.verified_type,a.size_bytes,a.sha256,a.scan_status,a.extracted_json,
      a.evidence_json FROM brain_attachments a JOIN brain_messages m ON m.id=a.message_id
      WHERE m.case_id=? ORDER BY m.received_at,a.part_index`,caseId);
    const events=await this.store.rows(`SELECT event_type,actor_principal_id,details_json,created_at
      FROM brain_case_events WHERE case_id=? ORDER BY created_at,id LIMIT 200`,caseId);
    await this.access(mailbox.id);
    const rules=await this.personalRules(mailbox);
    const effective=this.applyPersonalRule(row,latestMessage?.sender??'',rules);
    return {case:effective,mailbox:{id:mailbox.id,address:mailbox.address},
      events:events.map(e=>({...e,details:JSON.parse(e.details_json),details_json:undefined})),
      messages:messages.map(m=>({...m,reference:JSON.parse(m.reference_json),
        recipients:JSON.parse(m.recipients_json),reference_json:undefined})),commitments,
      messagesTruncated:totalMessages.count>messages.length,
      attachments:attachments.map(a=>({...a,extracted:a.extracted_json?JSON.parse(a.extracted_json):null,
        evidence:a.evidence_json?JSON.parse(a.evidence_json):null,
        extracted_json:undefined,evidence_json:undefined})),untrustedContent:true};
  }

  async search({query,mailboxId,category,state:caseState,from,since,before,attachmentName,
    commitmentActor,olderThanDays,limit=10}) {
    requireValue(this.env.MAIL_BRAIN_ENABLED==='true','MAIL_BRAIN_DISABLED');
    const granted=(await this.store.mailboxes(this.principal)).filter(x=>
      (!mailboxId||x.id===mailboxId)&&
      (!this.env.MAIL_BRAIN_PILOT_MAILBOX_ID||
        x.id===this.env.MAIL_BRAIN_PILOT_MAILBOX_ID));
    const accessible=[];
    for(const box of granted){const mailbox=await this.access(box.id);
      try{await this.activeConsent(mailbox);accessible.push(box);}catch{}}
    requireValue(!mailboxId||accessible.length===1,'ACCESS_DENIED');
    if(!accessible.length)return {results:[],coverage:'no_access'};
    const tenant=(await this.access(accessible[0].id)).tenant_id;
    const terms=['m.tenant_id=?',`m.mailbox_id IN (${accessible.map(()=>'?').join(',')})`];
    const values=[tenant,...accessible.map(x=>x.id)];
    if(query){terms.push('m.rowid IN (SELECT rowid FROM brain_message_fts WHERE brain_message_fts MATCH ?)');
      values.push(searchTerms(query));}
    if(category){terms.push('c.category=?');values.push(category);}
    if(caseState){terms.push('c.state=?');values.push(caseState);}
    if(from){terms.push('LOWER(m.sender)=?');values.push(from.toLowerCase());}
    if(since){terms.push('m.received_at>=?');values.push(pragueStart(since));}
    if(before){terms.push('m.received_at<?');values.push(pragueStart(before));}
    if(olderThanDays){terms.push("c.latest_at<? AND c.state!='done'");
      values.push(this.now()-olderThanDays*day);}
    if(attachmentName){terms.push(`EXISTS (SELECT 1 FROM brain_attachments a WHERE a.message_id=m.id
      AND LOWER(a.filename) LIKE ? ESCAPE '\\')`);
      values.push(`%${attachmentName.toLowerCase().replace(/[\\%_]/g,'\\$&')}%`);}
    if(commitmentActor){terms.push(`EXISTS (SELECT 1 FROM brain_commitments k WHERE k.case_id=c.id
      AND k.actor=? AND k.status='open')`);values.push(commitmentActor);}
    const results=await this.store.rows(`SELECT m.id,m.case_id,m.mailbox_id,m.subject,m.sender,
      m.received_at,c.state,c.category,c.title FROM brain_messages m
      JOIN brain_cases c ON c.id=m.case_id WHERE ${terms.join(' AND ')}
      ORDER BY m.received_at DESC LIMIT ?`,...values,limit);
    // Recheck each grant after the query; revocation during search cannot expose content.
    const safe=[];
    for(const row of results){try{await this.access(row.mailbox_id);safe.push(row);}catch{}}
    return {results:safe,coverage:'indexed_messages_only'};
  }

  async mergeCases(source,targetId,targetRevision,note){
    requireValue(targetId&&targetRevision&&source.id!==targetId,'MERGE_TARGET_REQUIRED');
    const {row:target}=await this.caseAccess(targetId);
    requireValue(source.tenant_id===target.tenant_id&&source.mailbox_id===target.mailbox_id,
      'CROSS_MAILBOX_MERGE_REQUIRES_APPROVAL');
    requireValue(!source.merged_into_case_id&&!target.merged_into_case_id,'CASE_ALREADY_MERGED');
    const token=crypto.randomUUID(),now=this.now(),db=this.store.db;
    const statements=[
      db.prepare(`UPDATE brain_cases SET state='done',done_at=?,merged_into_case_id=?,
        mutation_token=?,revision=revision+1,updated_at=? WHERE id=? AND revision=?
        AND merged_into_case_id IS NULL AND EXISTS (SELECT 1 FROM brain_cases
          WHERE id=? AND revision=? AND merged_into_case_id IS NULL)`).bind(now,targetId,token,now,
          source.id,source.revision,targetId,targetRevision),
      db.prepare(`UPDATE brain_cases SET latest_at=MAX(latest_at,?),revision=revision+1,
        updated_at=? WHERE id=? AND revision=? AND EXISTS
        (SELECT 1 FROM brain_cases WHERE id=? AND mutation_token=?)`).bind(source.latest_at,
        now,targetId,targetRevision,source.id,token),
      db.prepare(`UPDATE brain_messages SET case_id=? WHERE case_id=? AND EXISTS
        (SELECT 1 FROM brain_cases WHERE id=? AND mutation_token=?)`).bind(targetId,
        source.id,source.id,token),
      db.prepare(`UPDATE brain_commitments SET case_id=? WHERE case_id=? AND EXISTS
        (SELECT 1 FROM brain_cases WHERE id=? AND mutation_token=?)`).bind(targetId,
        source.id,source.id,token),
      db.prepare(`INSERT INTO brain_case_events (id,tenant_id,case_id,actor_principal_id,
        event_type,details_json,created_at) SELECT ?,?,?,?,?,?,? FROM brain_cases
        WHERE id=? AND mutation_token=?`).bind(crypto.randomUUID(),source.tenant_id,targetId,
        this.principal.id,'case.merge',JSON.stringify({sourceCaseId:source.id,note}),now,
        source.id,token),
    ];
    const results=await db.batch(statements);
    requireValue(results[0]?.meta?.changes===1,'CASE_VERSION_CONFLICT');
    return {caseId:targetId,mergedCaseId:source.id,revision:targetRevision+1};
  }

  async splitCase(source,messageIds,note){
    requireValue(Array.isArray(messageIds)&&messageIds.length>0,'SPLIT_MESSAGES_REQUIRED');
    const unique=[...new Set(messageIds)];
    requireValue(unique.length===messageIds.length,'SPLIT_DUPLICATE_MESSAGE');
    const all=await this.store.rows('SELECT id FROM brain_messages WHERE case_id=?',source.id);
    const selected=await this.store.rows(`SELECT id,subject,received_at FROM brain_messages WHERE case_id=?
      AND id IN (${unique.map(()=>'?').join(',')}) ORDER BY received_at,id`,source.id,...unique);
    requireValue(selected.length===unique.length&&selected.length<all.length,'SPLIT_SELECTION_INVALID');
    const newId=crypto.randomUUID(),token=crypto.randomUUID(),now=this.now(),db=this.store.db;
    const selectedLatest=Math.max(...selected.map(m=>m.received_at));
    const whereToken='EXISTS (SELECT 1 FROM brain_cases WHERE id=? AND mutation_token=?)';
    const placeholders=unique.map(()=>'?').join(',');
    const statements=[
      db.prepare(`UPDATE brain_cases SET mutation_token=?,revision=revision+1,updated_at=?
        WHERE id=? AND revision=? AND merged_into_case_id IS NULL`).bind(token,now,
        source.id,source.revision),
      db.prepare(`INSERT INTO brain_cases
        (id,tenant_id,mailbox_id,thread_key,title,state,owner_principal_id,latest_at,
          created_at,updated_at) SELECT ?,tenant_id,mailbox_id,?,?,'todo',owner_principal_id,
          ?,?,? FROM brain_cases WHERE id=? AND mutation_token=?`).bind(newId,
        `manual:${newId}`,selected[0].subject,selectedLatest,now,now,source.id,token),
      db.prepare(`UPDATE brain_messages SET case_id=? WHERE case_id=? AND id IN (${placeholders})
        AND ${whereToken}`).bind(newId,source.id,...unique,source.id,token),
      db.prepare(`UPDATE brain_commitments SET case_id=? WHERE case_id=? AND message_id IN
        (${placeholders}) AND ${whereToken}`).bind(newId,source.id,...unique,source.id,token),
      db.prepare(`UPDATE brain_cases SET latest_at=(SELECT MAX(received_at) FROM brain_messages
        WHERE case_id=?),updated_at=? WHERE id=? AND mutation_token=?`).bind(source.id,now,
        source.id,token),
      db.prepare(`INSERT INTO brain_case_events (id,tenant_id,case_id,actor_principal_id,
        event_type,details_json,created_at) SELECT ?,?,?,?,?,?,? FROM brain_cases
        WHERE id=? AND mutation_token=?`).bind(crypto.randomUUID(),source.tenant_id,newId,
        this.principal.id,'case.split',JSON.stringify({sourceCaseId:source.id,messageIds:unique,note}),
        now,source.id,token),
    ];
    const results=await db.batch(statements);
    requireValue(results[0]?.meta?.changes===1,'CASE_VERSION_CONFLICT');
    return {caseId:newId,sourceCaseId:source.id,revision:1};
  }

  async action({caseId,revision,action,until,ownerPrincipalId,targetCaseId,targetRevision,
    messageIds,note=''},approvalSource='model') {
    requireValue(this.env.MAIL_BRAIN_ENABLED==='true','MAIL_BRAIN_DISABLED');
    this.requirePilotMutations();
    const {row,mailbox}=await this.caseAccess(caseId),now=this.now();
    await this.store.access(this.principal,mailbox.id,'write');
    requireValue(row.revision===revision,'CASE_VERSION_CONFLICT');
    if(action==='merge'||action==='split')requireValue(approvalSource==='soai_session',
      'CASE_RESTRUCTURE_UI_REQUIRED');
    if(action==='merge')return this.mergeCases(row,targetCaseId,targetRevision,note);
    if(action==='split')return this.splitCase(row,messageIds,note);
    if(action==='assign'){
      requireValue(ownerPrincipalId,'OWNER_REQUIRED');
      const owner=await this.store.first(`SELECT id FROM principals WHERE id=? AND tenant_id=? AND active=1`,
        ownerPrincipalId,mailbox.tenant_id);
      requireValue(owner,'OWNER_NOT_FOUND');
      await this.store.access({id:ownerPrincipalId,scopes:['forpsi:read']},mailbox.id,'read');
    }
    if(action==='snooze')requireValue(until&&Date.parse(until)>now,'INVALID_SNOOZE_DATE');
    const changed=await this.store.first(`UPDATE brain_cases SET state=?,snoozed_until=?,
      owner_principal_id=?,done_at=?,revision=revision+1,updated_at=?
      WHERE id=? AND tenant_id=? AND revision=? RETURNING revision`,
      ['assign','snooze'].includes(action)?row.state:action,
      action==='snooze'?Date.parse(until):row.snoozed_until,
      action==='assign'?ownerPrincipalId:row.owner_principal_id,
      action==='done'?now:null,now,row.id,row.tenant_id,revision);
    requireValue(changed,'CASE_VERSION_CONFLICT');
    await this.store.run('INSERT INTO brain_case_events VALUES (?,?,?,?,?,?,?)',crypto.randomUUID(),
      row.tenant_id,row.id,this.principal.id,`case.${action}`,JSON.stringify({note,
        ...(action==='assign'?{ownerPrincipalId}:{}),...(action==='snooze'?{until}:{})}),now);
    return {caseId,state:['assign','snooze'].includes(action)?row.state:action,
      revision:changed.revision};
  }
}
