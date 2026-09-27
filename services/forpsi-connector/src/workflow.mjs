import { z } from 'zod';
import { folder, id, reference } from './schemas.mjs';
import { requireValue } from './errors.mjs';
import { seal, unseal } from './crypto.mjs';
import { newsletterSeriesKey } from './newsletter-series.mjs';
import { contentSamples, analyzeContent, openAiEvidenceAnalyzer, authoredText } from './content-evidence.mjs';

const uuid = z.string().uuid();
const timeZone = z.string().min(1).max(80).default('Europe/Prague');
const email=z.email().max(254);
const editableDraft=z.object({to:z.array(email).max(50),cc:z.array(email).max(50),bcc:z.array(email).max(50),
  subject:z.string().max(500).regex(/^[^\r\n\x00]*$/),text:z.string().max(100000)}).strict()
  .refine(x=>x.to.length+x.cc.length+x.bcc.length<=50);
export const workflowSchemas = {
  start: z.object({ mailboxId: id, folder: folder.default('INBOX'), limit: z.number().int().min(1).max(20).default(10),
    view:z.enum(['recent','priority']).default('recent') }).strict(),
  mailStart:z.object({mailboxId:id,folder:folder.default('INBOX'),
    limit:z.number().int().min(1).max(20).default(20),
    scanLimit:z.number().int().min(1).max(200).default(50),
    since:z.string().date().optional()}).strict(),
  current: z.object({ listId: uuid.optional() }).strict(),
  command: z.object({ listId: uuid.optional(), command: z.string().trim().min(1).max(1000), timeZone }).strict(),
  review: z.object({ listId: uuid.optional(), action: z.enum(['start','open','next','previous','reply','done','waiting','snooze','end']),
    number:z.number().int().min(1).max(20).optional(),
    until: z.string().trim().max(100).optional(), timeZone }).strict(),
  refresh: z.object({ mailboxId: id, limit: z.number().int().min(1).max(50).default(50) }).strict(),
  previewDraft:z.object({draftId:uuid}).strict(),
  updateDraft:z.object({draftId:uuid,revision:z.number().int().positive(),message:editableDraft}).strict(),
  batch:z.object({listId:uuid.optional(),offset:z.number().int().min(0).max(19).default(0),
    limit:z.number().int().min(1).max(5).default(5)}).strict(),
  thread:z.object({mailboxId:id,message:reference}).strict(),
  viewAnalysis:z.object({listId:uuid,expectedRevision:z.number().int().min(0),
    coverageComplete:z.boolean().default(false),evaluations:z.array(z.object({
      number:z.number().int().min(1).max(20),priority:z.enum(['high','review']),
      reason:z.string().trim().min(4).max(240),quote:z.string().trim().min(4).max(500),
      evidenceReference:reference.optional(),
    }).strict()).min(1).max(20)}).strict(),
  draftReply:z.object({listId:uuid.optional(),number:z.number().int().min(1).max(20),
    text:z.string().max(100000),signatureMode:z.enum(['full','short','none']).default('short')}).strict(),
  draftForward:z.object({listId:uuid.optional(),number:z.number().int().min(1).max(20),
    recipient:z.string().trim().min(1).max(254),text:z.string().max(100000),
    signatureMode:z.enum(['full','short','none']).default('short')}).strict(),
};

const normId = value => typeof value === 'string' && /^<[^<>\s]{1,500}>$/.test(value.trim()) ? value.trim().toLowerCase() : null;
export const messageKey = message => normId(message.messageId) ||
  `${message.reference.folder}:${message.reference.uidValidity}:${message.reference.uid}`;
const threadKey = message => normId(message.references?.[0]) || normId(message.inReplyTo) || messageKey(message);
const localDate = (now, zone) => new Intl.DateTimeFormat('en-CA', {
  timeZone: zone, year: 'numeric', month: '2-digit', day: '2-digit',
}).format(new Date(now));
function validZone(zone) {
  try { new Intl.DateTimeFormat('en-US', { timeZone: zone }); return zone; }
  catch { throw new Error('INVALID_TIME_ZONE'); }
}
export function dueDate(text, now = Date.now(), zone = 'Europe/Prague') {
  validZone(zone);
  const value = text.trim().toLocaleLowerCase('cs');
  const today = localDate(now, zone);
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    const date = new Date(`${value}T12:00:00Z`);
    requireValue(!Number.isNaN(date.getTime()) && date.toISOString().slice(0,10) === value && value > today, 'INVALID_DUE_DATE');
    return value;
  }
  const weekdays = { neděli:0, pondělí:1, úterý:2, středu:3, čtvrtek:4, pátek:5, sobotu:6 };
  const target = weekdays[value.replace(/^na\s+/, '')];
  requireValue(target !== undefined, 'INVALID_DUE_DATE');
  const base = new Date(`${today}T12:00:00Z`);
  let offset = (target - base.getUTCDay() + 7) % 7;
  if (!offset) offset = 7;
  base.setUTCDate(base.getUTCDate() + offset);
  return base.toISOString().slice(0,10);
}

export function parseCommands(text) {
  const parts = [...text.matchAll(/(?:^|[.;]\s*|\n\s*)(\d{1,2})\s+([^.;\n]+)(?=[.;\n]|$)/gu)];
  requireValue(parts.length > 0 && parts.length <= 20, 'COMMAND_AMBIGUOUS');
  const consumed = parts.map(match => match[0]).join('');
  requireValue(consumed.replace(/[.;\s]/g,'') === text.replace(/[.;\s]/g,''), 'COMMAND_AMBIGUOUS');
  const seen = new Set();
  return parts.map(match => {
    const number = Number(match[1]);
    requireValue(number > 0 && !seen.has(number), 'COMMAND_AMBIGUOUS'); seen.add(number);
    const instruction = match[2].trim();
    if (/^(?:vyřízeno|hotovo)(?:\s+telefonicky)?$/iu.test(instruction))
      return { number, action: 'done', note: /telefonicky/iu.test(instruction) ? 'Vyřízeno telefonicky' : '' };
    if (/^čekám na odpověď$/iu.test(instruction)) return { number, action: 'waiting' };
    const snooze = instruction.match(/^odlož\s+(?:(?:na|do)\s+)?(.+)$/iu);
    if (snooze) return { number, action: 'snooze', until: snooze[1] };
    const forward = instruction.match(/^přepošli\s+(.+)$/iu);
    if (forward) return { number, action: 'forward', recipient: forward[1].trim() };
    return { number, action: 'unknown', instruction };
  });
}

export class Workflow {
  constructor({ store, principal, providerFactory, env, now = Date.now, semanticAnalyzer=null }) {
    this.store = store; this.principal = principal; this.providerFactory = providerFactory;
    this.env = env; this.now = now; this.semanticAnalyzer=semanticAnalyzer;
  }
  async access(mailboxId) {
    requireValue(this.principal.scopes.includes('forpsi:read'), 'INSUFFICIENT_SCOPE');
    return this.store.access(this.principal, mailboxId, 'read');
  }
  async ownedList(listId) {
    const row = listId ? await this.store.first('SELECT * FROM workflow_lists WHERE id=? AND principal_id=?', listId, this.principal.id)
      : await this.store.first('SELECT * FROM workflow_lists WHERE principal_id=? AND active=1 ORDER BY created_at DESC LIMIT 1', this.principal.id);
    requireValue(row && row.expires_at > this.now(), 'WORKLIST_NOT_FOUND');
    const mailbox = await this.access(row.mailbox_id);
    requireValue(mailbox.tenant_id === row.tenant_id, 'ACCESS_DENIED');
    return { row, mailbox };
  }
  async reconcileInbound(mailbox,message,reference,current) {
    if(!current || message.from?.some(a=>a.address?.toLowerCase()===mailbox.address.toLowerCase()) ||
      !message.date || !current.last_processed_at ||
      message.date<=(current.latest_inbound_at??current.last_processed_at) ||
      messageKey(message)===current.last_processed_key ||
      messageKey(message)===current.latest_inbound_key)return false;
    await this.store.run(`UPDATE workflow_states SET state='todo',due_date=NULL,latest_inbound_key=?,
      latest_inbound_at=?,latest_inbound_reference_json=?,updated_at=?
      WHERE tenant_id=? AND principal_id=? AND mailbox_id=? AND thread_key=?`,
      messageKey(message),message.date,JSON.stringify(reference),this.now(),
      mailbox.tenant_id,this.principal.id,mailbox.id,threadKey(message));
    return true;
  }
  async start({ mailboxId, folder: path = 'INBOX', limit = 10, view='recent',freshAnalysis=false,
    scanLimitOverride=null,since=null }) {
    const mailbox = await this.access(mailboxId);
    const provider = this.providerFactory(this.env, mailbox);
    const pilot=this.env.PERSONAL_PILOT_READ_ONLY==='true';
    const modelDriven=pilot||this.env.CHATGPT_INTERACTIVE_SETUP_ENABLED==='true';
    if(pilot&&view==='priority')requireValue(path==='INBOX','PILOT_SCOPE_EXCEEDED');
    let scanLimit=view==='priority'?(scanLimitOverride??200):limit,pageSize=view==='priority'?50:limit;
    const summaries=[];let beforeUid=null,olderUnscanned=false,pilotMessages=[],pilotFacts=null;
    let approvedSample=null;
    if(modelDriven && view==='priority' && !freshAnalysis){
      const approved=await this.store.first(`SELECT version FROM workflow_profile_versions
        WHERE tenant_id=? AND principal_id=? AND mailbox_id=? AND active=1`,
      mailbox.tenant_id,this.principal.id,mailbox.id);
      approvedSample=approved?await this.store.first(`SELECT o.observations_json,o.coverage_json,s.scope_json
        FROM workflow_onboarding s JOIN workflow_observations o ON o.onboarding_id=s.id
        WHERE s.tenant_id=? AND s.principal_id=? AND s.mailbox_id=? AND s.status='approved'
        ORDER BY s.updated_at DESC LIMIT 1`,mailbox.tenant_id,this.principal.id,mailbox.id):null;
      // Preserve the bounded legacy pilot's existing approved sample and its
      // fixed numbers; the new daily-mail path does not depend on that sample.
      if(pilot&&approvedSample){
        const existing=await this.store.first(`SELECT id FROM workflow_lists WHERE tenant_id=?
          AND principal_id=? AND mailbox_id=? AND folder=? AND active=1 AND expires_at>?
          AND semantic_status='chatgpt_proposal' AND analysis_revision=0
          AND semantic_context_status IN ('chatgpt_partial_sample','chatgpt_submitted_sample')
          ORDER BY created_at DESC LIMIT 1`,mailbox.tenant_id,this.principal.id,mailbox.id,path,this.now());
        if(existing)return this.current({listId:existing.id});
      }
      if(approvedSample){
        const scope=JSON.parse(approvedSample.scope_json),observation=JSON.parse(approvedSample.observations_json);
        if(scope.folders.includes(path)&&observation.semantic?.status==='chatgpt_proposal'){
          pilotFacts=observation;
          pilotMessages=observation.pilotMessages??[];
          requireValue(pilotMessages.length<=50,'PILOT_SCOPE_EXCEEDED');
          if(pilot)requireValue(scope.days<=30 && pilotMessages.every(m=>
            m.reference?.folder==='INBOX'||m.reference?.folder===mailbox.sent_folder),'PILOT_SCOPE_EXCEEDED');
          const earliest=this.now()-scope.days*86400000;
          summaries.push(...pilotMessages.filter(m=>m.reference.folder===path &&
            Date.parse(m.date)>=earliest && Date.parse(m.date)<=this.now()));
          scanLimit=summaries.length;
          olderUnscanned=JSON.parse(approvedSample.coverage_json).some(x=>x.incomplete);
        }else approvedSample=null;
      }
    }
    if(!approvedSample){
      do{
        const found=await provider.search({folder:path,limit:Math.min(pageSize,scanLimit-summaries.length),
          ...(since?{since}:{}),
          ...(beforeUid?{beforeUid}:{})});
        requireValue(found.messages.length<=Math.min(pageSize,scanLimit-summaries.length),'MAIL_LIMIT_EXCEEDED');
        summaries.push(...found.messages);
        beforeUid=found.nextBeforeUid??null;
        olderUnscanned=beforeUid!=null;
      }while(view==='priority'&&beforeUid&&summaries.length<scanLimit);
    }
    const profileRow=view==='priority'&&!freshAnalysis?await this.store.first(`SELECT profile_json FROM workflow_profile_versions
      WHERE tenant_id=? AND principal_id=? AND mailbox_id=? AND active=1`,mailbox.tenant_id,this.principal.id,mailbox.id):null;
    const profile=profileRow?JSON.parse(profileRow.profile_json):null;
    const items = [], seenThreads=new Set();
    const candidates=view==='priority'?[...summaries].sort((a,b)=>
      String(b.date??'').localeCompare(String(a.date??'')) ||
      Number(b.reference?.uid??0)-Number(a.reference?.uid??0)):summaries;
    const analyzer=modelDriven?null:this.semanticAnalyzer??(this.env.FORPSI_ANALYSIS_API_KEY&&this.env.FORPSI_ANALYSIS_MODEL?
      input=>openAiEvidenceAnalyzer(input,this.env):null);
    const verifiedAliases=view==='priority'?await this.store.verifiedAliases(mailbox):[];
    const detailCache=new Map();let semantic={status:modelDriven?'awaiting_chatgpt':'unavailable',findings:[],examined:0};
    let semanticContextStatus='not_analyzed';
    if(approvedSample && view==='priority'){
      semantic=pilotFacts.semantic;
      semanticContextStatus=olderUnscanned?'chatgpt_partial_sample':'chatgpt_submitted_sample';
    }
    if(view==='priority'&&analyzer){
      const selected=new Map([...candidates.slice(0,12),...candidates.slice(-4)].map(m=>[messageKey(m),m]));
      for(const summary of selected.values()){
        try{detailCache.set(messageKey(summary),await provider.read(summary.reference));}catch{/* Per-message failure is reported by coverage. */}
      }
      // A bounded Sent search can show that a later own reply closed an inbound
      // request. If older Sent mail was not searched, expose that uncertainty.
      semanticContextStatus='bounded_inbound_and_sent';
      if(path!==mailbox.sent_folder && mailbox.sent_folder){
        try{
          const sent=pilot?{messages:pilotMessages.filter(m=>m.reference.folder===mailbox.sent_folder),
            nextBeforeUid:olderUnscanned?1:null}:await provider.search({folder:mailbox.sent_folder,limit:50});
          if(sent.nextBeforeUid!=null)semanticContextStatus='partial_sent_window';
          const roots=new Set([...selected.values(),...detailCache.values()].flatMap(m=>
            [messageKey(m),threadKey(m)].filter(Boolean)));
          const related=sent.messages.filter(m=>[m.inReplyTo,...(m.references??[])]
            .some(ref=>roots.has(normId(ref)))).slice(0,8);
          for(const summary of related){
            try{detailCache.set(messageKey(summary),await provider.read(summary.reference));}
            catch{semanticContextStatus='partial_sent_read';}
          }
        }catch{semanticContextStatus='sent_unavailable';}
      }else if(!mailbox.sent_folder)semanticContextStatus='sent_not_configured';
      const samples=contentSamples([...detailCache.values()].map(x=>({...x,sentFolder:mailbox.sent_folder})),mailbox.address,24);
      try{semantic=await analyzeContent(samples,{analyzer,perspective:{mailboxAddress:mailbox.address,
        verifiedAliases,aliasesStatus:verifiedAliases.length?'server_verified':'not_configured'}});}
      catch{semantic={status:'unavailable',findings:[],examined:samples.length};}
      semantic.examined=samples.length;
    }
    const findings=new Map();
    for(const finding of semantic.findings)if(['request','waiting_user','waiting_other','resolved','changed','cancelled','marketing','newsletter'].includes(finding.kind))
      findings.set(finding.sourceKey,[...(findings.get(finding.sourceKey)??[]),finding]);
    for(const [key,entries] of findings)findings.set(key,entries.sort((a,b)=>
      a.kind.localeCompare(b.kind)||a.quote.localeCompare(b.quote)));
    const threadFindings=new Map();
    for(const detail of detailCache.values()){
      const entries=findings.get(messageKey(detail))??[];
      if(!entries.length)continue;
      const key=threadKey(detail);
      threadFindings.set(key,[...(threadFindings.get(key)??[]),{date:detail.date??'',entries}]);
    }
    for(const [key,events] of threadFindings)threadFindings.set(key,events.sort((a,b)=>
      a.date.localeCompare(b.date)));
    for (const message of candidates) {
      const detail = detailCache.get(messageKey(message))??await provider.read(message.reference);
      const key=threadKey(detail);
      if(view==='priority' && seenThreads.has(key))continue;
      seenThreads.add(key);
      const state=view==='priority'?await this.store.first(`SELECT * FROM workflow_states
        WHERE tenant_id=? AND principal_id=? AND mailbox_id=? AND thread_key=?`,
        mailbox.tenant_id,this.principal.id,mailbox.id,key):null;
      const reopened=view==='priority' && await this.reconcileInbound(mailbox,detail,message.reference,state);
      if(view==='priority' && !reopened && (state?.state==='done'||state?.state==='waiting'||
        (state?.state==='snoozed'&&state.due_date>localDate(this.now(),state.time_zone))))continue;
      const sender=message.from?.[0]?.address??'';
      const important=profile?.importantContacts?.some(x=>x.toLowerCase()===sender.toLowerCase());
      const override=profile?.messageOverrides?.find(x=>x.messageKey===messageKey(detail) &&
        x.evidence?.folder===message.reference.folder &&
        String(x.evidence?.uidValidity)===String(message.reference.uidValidity) &&
        Number(x.evidence?.uid)===Number(message.reference.uid));
      const newsletterRules=(profile?.newsletterRules??[]).filter(x=>
        x.sender?.toLowerCase()===sender.toLowerCase() &&
        (x.subject===message.subject || (x.seriesKey&&x.seriesKey===newsletterSeriesKey(message.subject))));
      const keepNewsletter=newsletterRules.some(x=>x.action==='keep_visible');
      const newsletter=newsletterRules.some(x=>x.action==='exclude_from_high_priority');
      const relatedFindings=findings.get(messageKey(detail))??[];
      const chatgptPriority=modelDriven?pilotFacts?.chatgptPriorities?.find(x=>x.sourceKey===messageKey(detail)):null;
      const threadEvents=threadFindings.get(key)??[];
      let threadDisposition=null,threadEvidence=null;
      for(const event of threadEvents){
        const open=event.entries.find(x=>['request','waiting_user'].includes(x.kind));
        const closed=event.entries.find(x=>['resolved','cancelled','waiting_other'].includes(x.kind));
        if(open){threadDisposition='open';threadEvidence=open;}
        else if(closed){threadDisposition='closed';threadEvidence=closed;}
      }
      // An open individual request wins over a resolved older issue or marketing
      // classification in the same message, regardless of model output order.
      const highFinding=relatedFindings.find(x=>['request','waiting_user'].includes(x.kind));
      const lowFinding=relatedFindings.find(x=>['resolved','cancelled','waiting_other','marketing','newsletter'].includes(x.kind));
      const semanticFinding=threadEvidence??highFinding??lowFinding??relatedFindings[0]??null;
      const direct=profile?.directVsCc==='direct_first' &&
        detail.to?.some(x=>x.address?.toLowerCase()===mailbox.address.toLowerCase());
      const semanticHigh=threadDisposition==='open'||(threadDisposition===null&&!!highFinding);
      const semanticLow=threadDisposition==='closed'||(!semanticHigh&&!!lowFinding);
      const priority=modelDriven&&view==='priority'?override?.priority??
        (keepNewsletter?'high':newsletter&&!semanticHigh?'review':chatgptPriority?.priority??'review'):
        override?.priority??(semanticHigh?'high':keepNewsletter?'high':newsletter||semanticLow?'review':important?'high':'review');
      const reason=modelDriven&&view==='priority'?(override?'Výslovná osobní oprava pro tuto zprávu.':
        keepNewsletter?'Uživatelem vybraný newsletter zůstává na očích.':
        newsletter&&!semanticHigh?'Uživatelem vybraný newsletter zůstává mimo hlavní priority.':
        chatgptPriority?.reason??'ChatGPT tento vzorek nevyhodnotil; vyžaduje ruční kontrolu.'):
        override?'Výslovná osobní oprava pro tuto zprávu.':semanticHigh?
        'Modelový návrh otevřeného požadavku s citací; ověřte před akcí.':keepNewsletter?
        'Uživatelem vybraný newsletter zůstává na očích.':newsletter?
        'Uživatelem schválené pravidlo newsletteru; není automaticky prioritní.':semanticLow?
        'Modelový návrh s citací obsahu; ověřte před akcí.':
        important?'Uživatelem schválený důležitý kontakt.':direct?
        'Přímo adresováno; konkrétní požadavek je nutné ověřit.':'Neověřená priorita; zpráva není skrytá.';
      items.push({ reference: message.reference, threadKey: threadKey(detail), messageKey: messageKey(detail),
        sender, subject: message.subject ?? '', receivedAt: message.date ?? null,priority,reason,
        attachmentCount:detail.attachments?.length??null,
        contentType:newsletter||keepNewsletter||semanticFinding?.kind==='newsletter'?'newsletter':'unclassified',
        semanticEvidence:modelDriven&&view==='priority'?chatgptPriority?{...chatgptPriority,
          findings:relatedFindings,contextStatus:semanticContextStatus}:null:
          semanticFinding?{...semanticFinding,
            findings:threadEvents.flatMap(x=>x.entries),contextStatus:semanticContextStatus}:null });
    }
    if(view==='priority')items.sort((a,b)=>Number(b.priority==='high')-Number(a.priority==='high') ||
      String(b.receivedAt??'').localeCompare(String(a.receivedAt??'')));
    const knownRemainingPriority=view==='priority'?items.slice(limit).filter(x=>x.priority==='high').length:0;
    const visible=items.slice(0,limit);
    const listId = crypto.randomUUID(), now = this.now();
    const statements = [
      this.store.db.prepare('UPDATE workflow_lists SET active=0 WHERE tenant_id=? AND principal_id=? AND active=1').bind(mailbox.tenant_id,this.principal.id),
      this.store.db.prepare(`INSERT INTO workflow_lists
        (id,tenant_id,principal_id,mailbox_id,folder,view,known_remaining_priority,older_unscanned,
        position,active,created_at,expires_at,scanned_count,scan_limit,semantic_examined_count,semantic_status,
        semantic_context_status)
        VALUES (?,?,?,?,?,?,?,?,1,1,?,?,?,?,?,?,?)`).bind(
        listId,mailbox.tenant_id,this.principal.id,mailbox.id,path,view,knownRemainingPriority,
        olderUnscanned?1:0,now,now+30*86400000,summaries.length,scanLimit,semantic.examined??0,
        semantic.status,semanticContextStatus),
      ...visible.map((item,index)=>this.store.db.prepare(`INSERT INTO workflow_list_items
        (list_id,number,reference_json,thread_key,message_key,sender,subject,received_at,priority,priority_reason,content_type,semantic_evidence_json,attachment_count)
        VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`).bind(
        listId,index+1,JSON.stringify(item.reference),item.threadKey,item.messageKey,item.sender,item.subject,item.receivedAt,
        item.priority,item.reason,item.contentType,item.semanticEvidence?JSON.stringify(item.semanticEvidence):null,
        item.attachmentCount)),
    ];
    await this.store.db.batch(statements);
    return this.current({ listId });
  }
  async current({ listId } = {}) {
    const { row } = await this.ownedList(listId);
    const raw = await this.store.rows(`SELECT i.*,s.state,s.due_date,s.time_zone,s.note,
      s.latest_inbound_key,s.latest_inbound_reference_json FROM workflow_list_items i
      LEFT JOIN workflow_states s ON s.tenant_id=? AND s.principal_id=? AND s.mailbox_id=? AND s.thread_key=i.thread_key
      WHERE i.list_id=? ORDER BY i.number`,row.tenant_id,this.principal.id,row.mailbox_id,row.id);
    const items = raw.map(item => ({ number:item.number, reference:JSON.parse(item.reference_json),
      from:item.sender, subject:item.subject, receivedAt:item.received_at,
      attachmentCount:item.attachment_count,
      priority:item.priority,priorityReason:item.priority_reason,contentType:item.content_type,
      semanticEvidence:item.semantic_evidence_json?JSON.parse(item.semantic_evidence_json):null,
      state:item.state==='snoozed' && item.due_date<=localDate(this.now(),item.time_zone) ? 'todo' : item.state??'todo',
      dueDate:item.due_date, note:item.note??'',
      newerReply:item.latest_inbound_key!=null && item.latest_inbound_key!==item.message_key,
      newerReplyReference:item.latest_inbound_key!=null && item.latest_inbound_key!==item.message_key &&
        item.latest_inbound_reference_json?JSON.parse(item.latest_inbound_reference_json):null }));
    const savedDraft=await this.store.first(`SELECT id,revision,kind,item_number FROM workflow_drafts
      WHERE tenant_id=? AND principal_id=? AND mailbox_id=? AND list_id=?
      ORDER BY updated_at DESC LIMIT 1`,row.tenant_id,this.principal.id,row.mailbox_id,row.id);
    return { listId:row.id, mailboxId:row.mailbox_id, folder:row.folder, view:row.view,
      knownRemainingPriority:row.known_remaining_priority,olderUnscanned:row.older_unscanned===1,
      scannedCount:row.scanned_count,scanLimit:row.scan_limit,displayedCount:items.length,
      semanticExaminedCount:row.semantic_examined_count,semanticStatus:row.semantic_status,
      semanticContextStatus:row.semantic_context_status,
      position:row.position,analysisRevision:row.analysis_revision??0,
      active:row.active===1, expiresAt:row.expires_at, items, draft:savedDraft?{
        id:savedDraft.id,revision:savedDraft.revision,kind:savedDraft.kind,
        itemNumber:savedDraft.item_number}:null,pending:items.filter(i=>i.state==='todo').length,
      untrustedContent:true };
  }
  async readBatch({listId,offset=0,limit=5}){
    const {row,mailbox}=await this.ownedList(listId);
    const items=await this.store.rows(`SELECT * FROM workflow_list_items WHERE list_id=?
      ORDER BY number LIMIT ? OFFSET ?`,row.id,limit,offset);
    const provider=this.providerFactory(this.env,mailbox),messages=[];
    for(const item of items){
      const reference=JSON.parse(item.reference_json),detail=await provider.read(reference);
      requireValue(messageKey(detail)===item.message_key,'WORKLIST_STALE');
      messages.push({number:item.number,reference,messageKey:item.message_key,
        threadKey:item.thread_key,from:detail.from,to:detail.to??[],cc:detail.cc??[],
        subject:detail.subject,date:detail.date,text:authoredText(detail.text??''),
        textExcerptLimit:4000,truncated:!!detail.truncated||authoredText(detail.text??'').length<
          (detail.text??'').length,attachments:detail.attachments??[],untrustedContent:true});
    }
    const count=(await this.store.first('SELECT COUNT(*) AS n FROM workflow_list_items WHERE list_id=?',row.id)).n;
    return {listId:row.id,mailboxId:row.mailbox_id,offset,count,messages,
      nextOffset:offset+messages.length<count?offset+messages.length:null,
      scannedCount:row.scanned_count,olderUnscanned:row.older_unscanned===1,
      coverage:'Only the saved numbered list was read; older unlisted mail may remain unexamined.',
      untrustedContent:true};
  }
  async thread({mailboxId,message}){
    const mailbox=await this.access(mailboxId),provider=this.providerFactory(this.env,mailbox);
    const base=await provider.read(message),root=threadKey(base),baseId=messageKey(base);
    const paths=[...new Set(['INBOX',mailbox.sent_folder].filter(Boolean))];
    const summaries=[],coverage={sentFolder:mailbox.sent_folder??null,folders:[]};
    for(const path of paths){
      try{
        const page=await provider.search({folder:path,limit:50});
        summaries.push(...page.messages);
        coverage.folders.push({path,examined:page.messages.length,
          olderUnscanned:page.nextBeforeUid!=null});
      }catch{
        coverage.folders.push({path,unavailable:true});
      }
    }
    const knownIds=new Set([root,baseId]),selected=new Map([[baseId,base]]);
    for(let pass=0;pass<2&&selected.size<20;pass++){
      for(const summary of summaries){
        const key=messageKey(summary);
        if(selected.has(key)||selected.size>=20)continue;
        const related=[key,summary.inReplyTo,...(summary.references??[])]
          .some(value=>knownIds.has(normId(value)));
        if(!related)continue;
        try{
          const detail=await provider.read(summary.reference);
          if(threadKey(detail)!==root && ![detail.inReplyTo,...(detail.references??[])]
            .some(value=>knownIds.has(normId(value))))continue;
          selected.set(messageKey(detail),detail);knownIds.add(messageKey(detail));
        }catch{coverage.readError=true;}
      }
    }
    return {mailboxId,threadKey:root,messages:[...selected.values()].sort((a,b)=>
      String(a.date??'').localeCompare(String(b.date??''))).map(detail=>({
      reference:detail.reference,messageKey:messageKey(detail),from:detail.from,to:detail.to??[],
      cc:detail.cc??[],date:detail.date,subject:detail.subject,text:detail.text,
      truncated:!!detail.truncated,attachments:detail.attachments??[],untrustedContent:true})),
    coverage:{...coverage,complete:false,note:'Only a bounded recent window in Inbox and Sent was searched.'},
    untrustedContent:true};
  }
  async submitViewAnalysis({listId,expectedRevision,coverageComplete=false,evaluations}){
    const {row,mailbox}=await this.ownedList(listId);
    requireValue(row.analysis_revision===expectedRevision,'ANALYSIS_VERSION_CONFLICT');
    const items=await this.store.rows('SELECT * FROM workflow_list_items WHERE list_id=? ORDER BY number',row.id);
    requireValue(!coverageComplete||evaluations.length===items.length,'ANALYSIS_COVERAGE_MISMATCH');
    const byNumber=new Map(items.map(item=>[item.number,item])),seen=new Set();
    const provider=this.providerFactory(this.env,mailbox);
    for(const evaluation of evaluations){
      requireValue(!seen.has(evaluation.number),'ANALYSIS_DUPLICATE_NUMBER');
      seen.add(evaluation.number);
      const item=byNumber.get(evaluation.number);
      requireValue(item,'WORKLIST_NUMBER_NOT_FOUND');
      const selected=await provider.read(JSON.parse(item.reference_json));
      requireValue(messageKey(selected)===item.message_key,'WORKLIST_STALE');
      let evidence=selected;
      if(evaluation.evidenceReference){
        requireValue(['INBOX',mailbox.sent_folder].includes(evaluation.evidenceReference.folder),
          'ANALYSIS_EVIDENCE_SCOPE');
        evidence=await provider.read(evaluation.evidenceReference);
        const related=threadKey(evidence)===item.thread_key||
          [evidence.inReplyTo,...(evidence.references??[])].some(value=>
            [item.message_key,item.thread_key].includes(normId(value)));
        requireValue(related,'ANALYSIS_EVIDENCE_UNRELATED');
      }
      requireValue(authoredText(evidence.text??'').includes(evaluation.quote),
        'ANALYSIS_EVIDENCE_MISMATCH');
    }
    const nonce=crypto.randomUUID();
    const statements=[
      this.store.db.prepare(`UPDATE workflow_lists SET analysis_revision=analysis_revision+1,
        analysis_nonce=?,semantic_status='chatgpt_proposal',semantic_examined_count=?,
        semantic_context_status=? WHERE id=? AND tenant_id=? AND principal_id=? AND analysis_revision=?`)
        .bind(nonce,evaluations.length,coverageComplete?'chatgpt_list_complete':'chatgpt_list_partial',
          row.id,row.tenant_id,this.principal.id,expectedRevision),
      this.store.db.prepare(`UPDATE workflow_list_items SET priority='review',priority_reason=?,
        semantic_evidence_json=NULL WHERE list_id=? AND EXISTS
        (SELECT 1 FROM workflow_lists WHERE id=? AND analysis_nonce=?)`)
        .bind('Tato zpráva zatím nebyla v aktuálním přehledu posouzena.',row.id,row.id,nonce),
      ...evaluations.map(e=>this.store.db.prepare(`UPDATE workflow_list_items SET priority=?,
        priority_reason=?,semantic_evidence_json=? WHERE list_id=? AND number=? AND EXISTS
        (SELECT 1 FROM workflow_lists WHERE id=? AND analysis_nonce=?)`).bind(
        e.priority,e.reason,JSON.stringify({source:'chatgpt_current_view',quote:e.quote,
          reference:e.evidenceReference??JSON.parse(byNumber.get(e.number).reference_json)}),
        row.id,e.number,row.id,nonce)),
    ];
    await this.store.db.batch(statements);
    const updated=await this.store.first('SELECT analysis_revision,analysis_nonce FROM workflow_lists WHERE id=?',row.id);
    requireValue(updated.analysis_nonce===nonce,'ANALYSIS_VERSION_CONFLICT');
    return this.current({listId:row.id});
  }
  async item(row, number) {
    const item = await this.store.first('SELECT * FROM workflow_list_items WHERE list_id=? AND number=?',row.id,number);
    requireValue(item,'WORKLIST_NUMBER_NOT_FOUND'); return item;
  }
  async setState(row,item,state,{ due=null,zone='Europe/Prague',note='' }={}) {
    validZone(zone);
    const latest=await this.store.first(`SELECT latest_inbound_key FROM workflow_states
      WHERE tenant_id=? AND principal_id=? AND mailbox_id=? AND thread_key=?`,
      row.tenant_id,this.principal.id,row.mailbox_id,item.thread_key);
    requireValue(!latest?.latest_inbound_key || latest.latest_inbound_key===item.message_key,
      'NEW_REPLY_REQUIRES_NEW_LIST');
    await this.store.run(`INSERT INTO workflow_states
      (tenant_id,principal_id,mailbox_id,thread_key,state,due_date,time_zone,note,last_processed_key,last_processed_at,
       latest_inbound_key,latest_inbound_at,latest_inbound_reference_json,updated_at)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(tenant_id,principal_id,mailbox_id,thread_key) DO UPDATE SET
      state=excluded.state,due_date=excluded.due_date,time_zone=excluded.time_zone,note=excluded.note,
      last_processed_key=excluded.last_processed_key,last_processed_at=excluded.last_processed_at,
      latest_inbound_key=excluded.latest_inbound_key,latest_inbound_at=excluded.latest_inbound_at,
      latest_inbound_reference_json=excluded.latest_inbound_reference_json,updated_at=excluded.updated_at`,
      row.tenant_id,this.principal.id,row.mailbox_id,item.thread_key,state,due,zone,note,
      item.message_key,item.received_at,item.message_key,item.received_at,item.reference_json,this.now());
    return { state, dueDate:due, timeZone:zone, note };
  }
  async saveDraft(row,item,kind,recipient,source,selectedAttachments=[],intro='',signatureMode='short') {
    requireValue(this.env.OUTBOX_KEY, 'DRAFT_STORAGE_UNAVAILABLE');
    const draftId=crypto.randomUUID(),now=this.now();
    const sender=(await this.store.first('SELECT address FROM mailboxes WHERE id=?',row.mailbox_id)).address;
    const signature=signatureMode==='none'?null:await this.store.first(`SELECT full_text,short_text FROM workflow_signatures
      WHERE tenant_id=? AND principal_id=? AND mailbox_id=? AND sender_address=?`,
      row.tenant_id,this.principal.id,row.mailbox_id,sender);
    const signatureText=signature?(signatureMode==='full'?signature.full_text:signature.short_text).trim():'';
    const newPart=[intro.trimEnd(),signatureText && !intro.trimEnd().endsWith(signatureText)?signatureText:'']
      .filter(Boolean).join('\n\n');
    const message={ from:sender, to:recipient?[recipient]:[],cc:[],bcc:[],
      subject:`${kind==='reply'?'Re':'Fwd'}: ${source.subject??item.subject}`,
      text:kind==='forward'?`${newPart}\n\n---------- Původní zpráva ----------\n${source.text??''}`:newPart,
      attachments:selectedAttachments,excludedAttachments:(source.attachments??[])
        .filter((_,index)=>!selectedAttachments.some(a=>a.index===index)).map(a=>({filename:a.filename,size:a.size})),
      sendable:false };
    const ciphertext=await seal(message,this.env.OUTBOX_KEY,`${row.tenant_id}:${this.principal.id}:${row.mailbox_id}:${draftId}`);
    await this.store.run('INSERT INTO workflow_drafts VALUES (?,?,?,?,?,?,?,?,1,?,?)',draftId,row.tenant_id,
      this.principal.id,row.mailbox_id,row.id,item.number,kind,ciphertext,now,now);
    return { draftId, kind, recipient:recipient??null, sendable:false, excludedAttachments:message.excludedAttachments.length };
  }
  async draftReply({listId,number,text,signatureMode='short'}){
    const {row,mailbox}=await this.ownedList(listId),item=await this.item(row,number);
    const source=await this.providerFactory(this.env,mailbox).read(JSON.parse(item.reference_json));
    requireValue(messageKey(source)===item.message_key,'WORKLIST_STALE');
    const recipient=source.from?.[0]?.address;
    requireValue(z.email().safeParse(recipient).success,'REPLY_RECIPIENT_UNKNOWN');
    return {listId:row.id,number,...await this.saveDraft(row,item,'reply',recipient,source,
      [],text,signatureMode)};
  }
  async draftForward({listId,number,recipient,text,signatureMode='short'}){
    const {row,mailbox}=await this.ownedList(listId),item=await this.item(row,number);
    requireValue(z.email().safeParse(recipient).success,'RECIPIENT_NOT_APPROVED');
    const source=await this.providerFactory(this.env,mailbox).read(JSON.parse(item.reference_json));
    requireValue(messageKey(source)===item.message_key,'WORKLIST_STALE');
    return {listId:row.id,number,...await this.saveDraft(row,item,'forward',recipient,source,
      [],text,signatureMode)};
  }
  async command({ listId, command, timeZone:zone='Europe/Prague' }) {
    const { row, mailbox }=await this.ownedList(listId);
    validZone(zone);
    const commands=parseCommands(command),provider=this.providerFactory(this.env,mailbox),results=[];
    for(const step of commands){
      try {
        const item=await this.item(row,step.number);
        await this.access(row.mailbox_id);
        if(step.action==='unknown'){results.push({number:step.number,status:'needs_clarification',reason:'UNKNOWN_COMMAND'});continue;}
        if(step.action==='forward'){
          let recipient=step.recipient;
          if(!z.email().safeParse(recipient).success){
            const shortcut=await this.store.first('SELECT definition_json FROM workflow_shortcuts WHERE tenant_id=? AND principal_id=? AND mailbox_id=? AND approved=1 AND name=?',
              row.tenant_id,this.principal.id,row.mailbox_id,recipient);
            recipient=shortcut?JSON.parse(shortcut.definition_json).recipient:null;
          }
          if(!recipient || !z.email().safeParse(recipient).success){results.push({number:step.number,status:'needs_clarification',reason:'RECIPIENT_NOT_APPROVED'});continue;}
          const source=await provider.read(JSON.parse(item.reference_json));
          requireValue(messageKey(source)===item.message_key,'WORKLIST_STALE');
          results.push({number:step.number,status:'prepared',...await this.saveDraft(row,item,'forward',recipient,source)});
          continue;
        }
        if(step.action==='snooze'){
          const source=await provider.read(JSON.parse(item.reference_json));
          requireValue(messageKey(source)===item.message_key,'WORKLIST_STALE');
          const due=dueDate(step.until,this.now(),zone);
          results.push({number:step.number,status:'completed',...await this.setState(row,item,'snoozed',{due,zone})});continue;
        }
        const source=await provider.read(JSON.parse(item.reference_json));
        requireValue(messageKey(source)===item.message_key,'WORKLIST_STALE');
        results.push({number:step.number,status:'completed',...await this.setState(row,item,step.action==='done'?'done':'waiting',{zone,note:step.note})});
      } catch(error) { results.push({number:step.number,status:'failed',reason:error?.code??'WORKFLOW_UNAVAILABLE'}); }
    }
    return { listId:row.id,results,allCompleted:results.every(r=>r.status==='completed'||r.status==='prepared') };
  }
  async review({listId,action,number,until,timeZone:zone='Europe/Prague'}) {
    const {row,mailbox}=await this.ownedList(listId);
    if(action==='end') {await this.store.run('UPDATE workflow_lists SET active=0 WHERE id=?',row.id);return {listId:row.id,ended:true};}
    const count=(await this.store.first('SELECT COUNT(*) AS n FROM workflow_list_items WHERE list_id=?',row.id)).n;
    if(action==='open')requireValue(Number.isInteger(number)&&number>=1&&number<=count,
      'WORKLIST_NUMBER_NOT_FOUND');
    let position=action==='start'?1:action==='open'?number:
      action==='next'?Math.min(count+1,row.position+1):
      action==='previous'?Math.max(1,row.position-1):row.position;
    if(position!==row.position)await this.store.run('UPDATE workflow_lists SET position=? WHERE id=?',position,row.id);
    if(position>count)return {listId:row.id,position,finished:true};
    const item=await this.item(row,position),reference=JSON.parse(item.reference_json);
    const detail=await this.providerFactory(this.env,mailbox).read(reference);
    requireValue(messageKey(detail)===item.message_key,'WORKLIST_STALE');
    if(['done','waiting','snooze'].includes(action)) {
      const due=action==='snooze'?dueDate(until??'',this.now(),zone):null;
      await this.setState(row,item,action==='done'?'done':action==='waiting'?'waiting':'snoozed',{due,zone});
    }
    let draft=null;
    if(action==='reply')draft=await this.saveDraft(row,item,'reply',detail.from?.[0]?.address??null,detail);
    return {listId:row.id,position,count,message:{reference,from:detail.from,subject:detail.subject,
      text:detail.text,truncated:detail.truncated,untrustedContent:true},draft,
      requestSummary:null,requestSummaryReason:'USER_OR_MODEL_MUST_VERIFY_FROM_MESSAGE' };
  }
  async resume({listId}={}) {
    const list=await this.current({listId});
    const {row}=await this.ownedList(list.listId);
    const saved=await this.store.first('SELECT * FROM workflow_drafts WHERE list_id=? AND tenant_id=? AND principal_id=? ORDER BY updated_at DESC LIMIT 1',
      row.id,row.tenant_id,this.principal.id);
    const draft=saved?{id:saved.id,revision:saved.revision,kind:saved.kind,itemNumber:saved.item_number,
      message:await unseal(saved.ciphertext,this.env.OUTBOX_KEY,`${row.tenant_id}:${this.principal.id}:${row.mailbox_id}:${saved.id}`)}:null;
    return {...list,draft};
  }
  async ownedDraft(draftId){
    const row=await this.store.first('SELECT * FROM workflow_drafts WHERE id=? AND principal_id=?',draftId,this.principal.id);
    requireValue(row,'WORKFLOW_DRAFT_NOT_FOUND');
    const mailbox=await this.access(row.mailbox_id);requireValue(mailbox.tenant_id===row.tenant_id,'ACCESS_DENIED');
    return row;
  }
  async previewDraft({draftId}){
    const row=await this.ownedDraft(draftId);
    const message=await unseal(row.ciphertext,this.env.OUTBOX_KEY,
      `${row.tenant_id}:${this.principal.id}:${row.mailbox_id}:${row.id}`);
    return {draftId:row.id,revision:row.revision,kind:row.kind,message,
      warning:'Návrh není odeslaný ani schválený k odeslání.',sendable:false};
  }
  async updateDraft({draftId,revision,message}){
    const row=await this.ownedDraft(draftId);
    requireValue(row.revision===revision,'WORKFLOW_DRAFT_VERSION_CONFLICT');
    const current=await this.previewDraft({draftId});
    const next={...current.message,...message,sendable:false};
    const ciphertext=await seal(next,this.env.OUTBOX_KEY,
      `${row.tenant_id}:${this.principal.id}:${row.mailbox_id}:${row.id}`);
    const updated=await this.store.first(`UPDATE workflow_drafts SET ciphertext=?,revision=revision+1,updated_at=?
      WHERE id=? AND principal_id=? AND revision=? RETURNING revision`,ciphertext,this.now(),draftId,this.principal.id,revision);
    requireValue(updated,'WORKFLOW_DRAFT_VERSION_CONFLICT');
    return {draftId,revision:updated.revision,message:next,sendable:false,
      confirmationInvalidated:true};
  }
  async refresh({mailboxId,limit=50,beforeUid=null,expectedUidValidity=null}) {
    const mailbox=await this.access(mailboxId),provider=this.providerFactory(this.env,mailbox);
    let found=await provider.search({folder:'INBOX',limit,...(beforeUid?{beforeUid}:{})});
    const uidValidity=found.uidValidity??found.messages[0]?.reference?.uidValidity??null;
    const uidValidityChanged=!!(expectedUidValidity&&uidValidity&&expectedUidValidity!==uidValidity);
    if(uidValidityChanged)found=await provider.search({folder:'INBOX',limit});
    const currentUidValidity=found.uidValidity??found.messages[0]?.reference?.uidValidity??null;
    const reopened=[];
    const candidates=[...found.messages].sort((a,b)=>String(b.date??'').localeCompare(String(a.date??'')) ||
      Number(b.reference?.uid??0)-Number(a.reference?.uid??0));
    const examinedThreads=new Set();
    for(const summary of candidates){
      if(summary.from?.some(a=>a.address?.toLowerCase()===mailbox.address.toLowerCase()))continue;
      const message=await provider.read(summary.reference),key=threadKey(message),current=await this.store.first(
        'SELECT * FROM workflow_states WHERE tenant_id=? AND principal_id=? AND mailbox_id=? AND thread_key=?',
        mailbox.tenant_id,this.principal.id,mailbox.id,key);
      if(examinedThreads.has(key))continue;
      examinedThreads.add(key);
      if(!current || messageKey(message)===current.last_processed_key || messageKey(message)===current.latest_inbound_key)continue;
      if(!message.date || !current.last_processed_at ||
        message.date<=(current.latest_inbound_at??current.last_processed_at))continue;
      if(await this.reconcileInbound(mailbox,message,summary.reference,current))
        reopened.push({threadKey:key,reference:summary.reference});
    }
    return {reopened,examined:found.messages.length,nextBeforeUid:found.nextBeforeUid??null,
      uidValidity:currentUidValidity,uidValidityChanged,
      complete:found.nextBeforeUid==null,untrustedContent:true};
  }
}
