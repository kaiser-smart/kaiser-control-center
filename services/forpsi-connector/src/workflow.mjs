import { z } from 'zod';
import { folder, id } from './schemas.mjs';
import { requireValue } from './errors.mjs';
import { seal, unseal } from './crypto.mjs';
import { newsletterSeriesKey } from './newsletter-series.mjs';
import { contentSamples, analyzeContent, openAiEvidenceAnalyzer } from './content-evidence.mjs';

const uuid = z.string().uuid();
const timeZone = z.string().min(1).max(80).default('Europe/Prague');
const email=z.email().max(254);
const editableDraft=z.object({to:z.array(email).max(50),cc:z.array(email).max(50),bcc:z.array(email).max(50),
  subject:z.string().max(500).regex(/^[^\r\n\x00]*$/),text:z.string().max(100000)}).strict()
  .refine(x=>x.to.length+x.cc.length+x.bcc.length<=50);
export const workflowSchemas = {
  start: z.object({ mailboxId: id, folder: folder.default('INBOX'), limit: z.number().int().min(1).max(20).default(10),
    view:z.enum(['recent','priority']).default('recent') }).strict(),
  current: z.object({ listId: uuid.optional() }).strict(),
  command: z.object({ listId: uuid.optional(), command: z.string().trim().min(1).max(1000), timeZone }).strict(),
  review: z.object({ listId: uuid.optional(), action: z.enum(['start','next','previous','reply','done','waiting','snooze','end']),
    until: z.string().trim().max(100).optional(), timeZone }).strict(),
  refresh: z.object({ mailboxId: id, limit: z.number().int().min(1).max(50).default(50) }).strict(),
  previewDraft:z.object({draftId:uuid}).strict(),
  updateDraft:z.object({draftId:uuid,revision:z.number().int().positive(),message:editableDraft}).strict(),
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
    if (/^vyřízeno(?:\s+telefonicky)?$/iu.test(instruction))
      return { number, action: 'done', note: /telefonicky/iu.test(instruction) ? 'Vyřízeno telefonicky' : '' };
    if (/^čekám na odpověď$/iu.test(instruction)) return { number, action: 'waiting' };
    const snooze = instruction.match(/^odlož\s+(?:na\s+)?(.+)$/iu);
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
  async start({ mailboxId, folder: path = 'INBOX', limit = 10, view='recent' }) {
    const mailbox = await this.access(mailboxId);
    const provider = this.providerFactory(this.env, mailbox);
    const scanLimit=view==='priority'?200:limit,pageSize=view==='priority'?50:limit;
    const summaries=[];let beforeUid=null,olderUnscanned=false;
    do{
      const found=await provider.search({folder:path,limit:Math.min(pageSize,scanLimit-summaries.length),
        ...(beforeUid?{beforeUid}:{})});
      requireValue(found.messages.length<=Math.min(pageSize,scanLimit-summaries.length),'MAIL_LIMIT_EXCEEDED');
      summaries.push(...found.messages);
      beforeUid=found.nextBeforeUid??null;
      olderUnscanned=beforeUid!=null;
    }while(view==='priority'&&beforeUid&&summaries.length<scanLimit);
    const profileRow=view==='priority'?await this.store.first(`SELECT profile_json FROM workflow_profile_versions
      WHERE tenant_id=? AND principal_id=? AND mailbox_id=? AND active=1`,mailbox.tenant_id,this.principal.id,mailbox.id):null;
    const profile=profileRow?JSON.parse(profileRow.profile_json):null;
    const items = [], seenThreads=new Set();
    const candidates=view==='priority'?[...summaries].sort((a,b)=>
      String(b.date??'').localeCompare(String(a.date??'')) ||
      Number(b.reference?.uid??0)-Number(a.reference?.uid??0)):summaries;
    const analyzer=this.semanticAnalyzer??(this.env.FORPSI_ANALYSIS_API_KEY&&this.env.FORPSI_ANALYSIS_MODEL?
      input=>openAiEvidenceAnalyzer(input,this.env):null);
    const detailCache=new Map();let semantic={status:'unavailable',findings:[],examined:0};
    if(view==='priority'&&analyzer){
      const selected=new Map([...candidates.slice(0,16),...candidates.slice(-8)].map(m=>[messageKey(m),m]));
      for(const summary of selected.values()){
        try{detailCache.set(messageKey(summary),await provider.read(summary.reference));}catch{/* Per-message failure is reported by coverage. */}
      }
      const samples=contentSamples([...detailCache.values()].map(x=>({...x,sentFolder:mailbox.sent_folder})),mailbox.address,24);
      try{semantic=await analyzeContent(samples,{analyzer});}catch{semantic={status:'unavailable',findings:[],examined:samples.length};}
      semantic.examined=samples.length;
    }
    const findings=new Map();
    for(const finding of semantic.findings)if(['request','waiting_user','resolved','cancelled','marketing','newsletter'].includes(finding.kind))
      findings.set(finding.sourceKey,finding);
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
      const newsletter=profile?.newsletterRules?.some(x=>x.action==='exclude_from_high_priority' &&
        x.sender.toLowerCase()===sender.toLowerCase() &&
        (x.subject===message.subject || (x.seriesKey&&x.seriesKey===newsletterSeriesKey(message.subject))));
      const semanticFinding=findings.get(messageKey(detail));
      const direct=profile?.directVsCc==='direct_first' &&
        detail.to?.some(x=>x.address?.toLowerCase()===mailbox.address.toLowerCase());
      const semanticHigh=['request','waiting_user'].includes(semanticFinding?.kind);
      const semanticLow=['resolved','cancelled','marketing','newsletter'].includes(semanticFinding?.kind);
      const priority=override?.priority??(newsletter||semanticLow?'review':semanticHigh||important?'high':'review');
      const reason=override?'Výslovná osobní oprava pro tuto zprávu.':newsletter?
        'Uživatelem schválené pravidlo newsletteru; není automaticky prioritní.':semanticLow?
        'Modelový návrh s citací obsahu; ověřte před akcí.':semanticHigh?
        'Modelový návrh požadavku s citací obsahu; ověřte před akcí.':
        important?'Uživatelem schválený důležitý kontakt.':direct?
        'Přímo adresováno; konkrétní požadavek je nutné ověřit.':'Neověřená priorita; zpráva není skrytá.';
      items.push({ reference: message.reference, threadKey: threadKey(detail), messageKey: messageKey(detail),
        sender, subject: message.subject ?? '', receivedAt: message.date ?? null,priority,reason,
        contentType:newsletter||semanticFinding?.kind==='newsletter'?'newsletter':'unclassified',
        semanticEvidence:semanticFinding??null });
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
        position,active,created_at,expires_at,scanned_count,scan_limit,semantic_examined_count,semantic_status)
        VALUES (?,?,?,?,?,?,?,?,1,1,?,?,?,?,?,?)`).bind(
        listId,mailbox.tenant_id,this.principal.id,mailbox.id,path,view,knownRemainingPriority,
        olderUnscanned?1:0,now,now+30*86400000,summaries.length,scanLimit,semantic.examined??0,semantic.status),
      ...visible.map((item,index)=>this.store.db.prepare(`INSERT INTO workflow_list_items
        (list_id,number,reference_json,thread_key,message_key,sender,subject,received_at,priority,priority_reason,content_type,semantic_evidence_json)
        VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`).bind(
        listId,index+1,JSON.stringify(item.reference),item.threadKey,item.messageKey,item.sender,item.subject,item.receivedAt,
        item.priority,item.reason,item.contentType,item.semanticEvidence?JSON.stringify(item.semanticEvidence):null)),
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
      priority:item.priority,priorityReason:item.priority_reason,contentType:item.content_type,
      semanticEvidence:item.semantic_evidence_json?JSON.parse(item.semantic_evidence_json):null,
      state:item.state==='snoozed' && item.due_date<=localDate(this.now(),item.time_zone) ? 'todo' : item.state??'todo',
      dueDate:item.due_date, note:item.note??'',
      newerReply:item.latest_inbound_key!=null && item.latest_inbound_key!==item.message_key,
      newerReplyReference:item.latest_inbound_key!=null && item.latest_inbound_key!==item.message_key &&
        item.latest_inbound_reference_json?JSON.parse(item.latest_inbound_reference_json):null }));
    return { listId:row.id, mailboxId:row.mailbox_id, folder:row.folder, view:row.view,
      knownRemainingPriority:row.known_remaining_priority,olderUnscanned:row.older_unscanned===1,
      scannedCount:row.scanned_count,scanLimit:row.scan_limit,displayedCount:items.length,
      semanticExaminedCount:row.semantic_examined_count,semanticStatus:row.semantic_status,
      position:row.position,
      active:row.active===1, expiresAt:row.expires_at, items, pending:items.filter(i=>i.state==='todo').length,
      untrustedContent:true };
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
  async review({listId,action,until,timeZone:zone='Europe/Prague'}) {
    const {row,mailbox}=await this.ownedList(listId);
    if(action==='end') {await this.store.run('UPDATE workflow_lists SET active=0 WHERE id=?',row.id);return {listId:row.id,ended:true};}
    const count=(await this.store.first('SELECT COUNT(*) AS n FROM workflow_list_items WHERE list_id=?',row.id)).n;
    let position=action==='start'?1:action==='next'?Math.min(count+1,row.position+1):action==='previous'?Math.max(1,row.position-1):row.position;
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
  async refresh({mailboxId,limit=50}) {
    const mailbox=await this.access(mailboxId),provider=this.providerFactory(this.env,mailbox);
    const found=await provider.search({folder:'INBOX',limit}),reopened=[];
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
      complete:found.nextBeforeUid==null,untrustedContent:true};
  }
}
