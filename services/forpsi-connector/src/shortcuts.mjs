import { z } from 'zod';
import { id } from './schemas.mjs';
import { requireValue } from './errors.mjs';
import { Workflow, messageKey } from './workflow.mjs';

const uuid=z.string().uuid();
const name=z.string().trim().min(1).max(80);
const definition=z.object({
  kind:z.enum(['invoice_forward','polite_decline','acknowledge','forward']),
  recipient:z.email().nullable().default(null),
  attachmentRule:z.enum(['single_verified_invoice_pdf','none']),
  style:z.string().trim().max(200).default('stručný a zdvořilý'),
  signatureMode:z.enum(['full','short','none']).default('short'),
}).strict().refine(x=>x.kind==='invoice_forward'?
  x.attachmentRule==='single_verified_invoice_pdf':x.attachmentRule==='none',
  {message:'ATTACHMENT_RULE_UNSUPPORTED'});
const fields={mailboxId:id,name,phrases:z.array(name).min(1).max(8),definition};
export const shortcutSchemas={
  list:z.object({mailboxId:id}).strict(),
  propose:z.object(fields).strict(),
  edit:z.object({shortcutId:uuid,version:z.number().int().positive(),...fields}).strict(),
  approve:z.object({mailboxId:id,shortcutId:uuid,version:z.number().int().positive(),approved:z.literal(true)}).strict(),
  remove:z.object({mailboxId:id,shortcutId:uuid,version:z.number().int().positive()}).strict(),
  use:z.object({listId:uuid,number:z.number().int().min(1).max(50),shortcutId:uuid,
    selectedAttachmentIndex:z.number().int().nonnegative().optional(),selectedSha256:z.string().regex(/^[a-f0-9]{64}$/).optional(),
    confirmedInvoice:z.literal(true).optional()}).strict(),
};

const proposals = recipient => [
  {name:'Fakturu účetní',phrases:['fakturu účetní','pošli fakturu účetní'],definition:{
    kind:'invoice_forward',recipient,attachmentRule:'single_verified_invoice_pdf',
    style:'krátký doprovodný text',signatureMode:'short'}},
  {name:'Odmítni slušně',phrases:['odmítni slušně'],definition:{
    kind:'polite_decline',recipient:null,attachmentRule:'none',style:'krátký zdvořilý text bez domyšleného důvodu',signatureMode:'short'}},
  {name:'Potvrď přijetí',phrases:['potvrď přijetí'],definition:{
    kind:'acknowledge',recipient:null,attachmentRule:'none',style:'potvrdit jen doručení, ne souhlas s obsahem',signatureMode:'short'}},
];

export class Shortcuts {
  constructor(ctx){this.ctx=ctx;this.workflow=new Workflow(ctx);this.store=ctx.store;this.principal=ctx.principal;}
  async access(mailboxId){return this.workflow.access(mailboxId);}
  async list({mailboxId}){
    const mailbox=await this.access(mailboxId);
    const rows=await this.store.rows('SELECT * FROM workflow_shortcuts WHERE tenant_id=? AND principal_id=? AND mailbox_id=? ORDER BY name',
      mailbox.tenant_id,this.principal.id,mailboxId);
    // The accountant address is a personal suggestion, never a team default.
    const candidate=this.ctx.env.RADIM_PRINCIPAL_ID===this.principal.id?'faktury@kaiserservis.cz':null;
    return {shortcuts:rows.map(r=>({id:r.id,name:r.name,phrases:JSON.parse(r.phrases_json),
      definition:JSON.parse(r.definition_json),approved:r.approved===1,version:r.version})),
      proposedDefaults:proposals(candidate),proposalRecipientUnverified:candidate!==null};
  }
  async propose(args,edit=false){
    const mailbox=await this.access(args.mailboxId),now=Date.now();
    if(edit){
      const updated=await this.store.first(`UPDATE workflow_shortcuts SET name=?,phrases_json=?,definition_json=?,approved=0,
        version=version+1,updated_at=? WHERE id=? AND tenant_id=? AND principal_id=? AND mailbox_id=? AND version=?
        RETURNING id,version`,args.name,JSON.stringify(args.phrases),JSON.stringify(args.definition),now,
        args.shortcutId,mailbox.tenant_id,this.principal.id,mailbox.id,args.version);
      requireValue(updated,'SHORTCUT_VERSION_CONFLICT');return {...updated,approved:false};
    }
    const shortcutId=crypto.randomUUID();
    await this.store.run('INSERT INTO workflow_shortcuts VALUES (?,?,?,?,?,?,?,0,1,?)',shortcutId,
      mailbox.tenant_id,this.principal.id,mailbox.id,args.name,JSON.stringify(args.phrases),JSON.stringify(args.definition),now);
    return {id:shortcutId,version:1,approved:false};
  }
  async approve(args){
    const mailbox=await this.access(args.mailboxId);
    const updated=await this.store.first(`UPDATE workflow_shortcuts SET approved=1,version=version+1,updated_at=?
      WHERE id=? AND tenant_id=? AND principal_id=? AND mailbox_id=? AND version=? RETURNING id,version`,
      Date.now(),args.shortcutId,mailbox.tenant_id,this.principal.id,mailbox.id,args.version);
    requireValue(updated,'SHORTCUT_VERSION_CONFLICT');return {...updated,approved:true};
  }
  async remove(args){
    const mailbox=await this.access(args.mailboxId);
    const deleted=await this.store.first(`DELETE FROM workflow_shortcuts WHERE id=? AND tenant_id=? AND principal_id=?
      AND mailbox_id=? AND version=? RETURNING id`,args.shortcutId,mailbox.tenant_id,this.principal.id,mailbox.id,args.version);
    requireValue(deleted,'SHORTCUT_VERSION_CONFLICT');return {removed:true,id:deleted.id};
  }
  async use({listId,number,shortcutId,selectedAttachmentIndex,selectedSha256,confirmedInvoice}){
    const {row,mailbox}=await this.workflow.ownedList(listId),item=await this.workflow.item(row,number);
    const saved=await this.store.first(`SELECT * FROM workflow_shortcuts WHERE id=? AND tenant_id=? AND principal_id=?
      AND mailbox_id=? AND approved=1`,shortcutId,row.tenant_id,this.principal.id,row.mailbox_id);
    requireValue(saved,'SHORTCUT_NOT_APPROVED');
    const spec=definition.parse(JSON.parse(saved.definition_json));
    const provider=this.ctx.providerFactory(this.ctx.env,mailbox),source=await provider.read(JSON.parse(item.reference_json));
    requireValue(messageKey(source)===item.message_key,'WORKLIST_STALE');
    if(spec.kind==='invoice_forward'){
      requireValue(spec.recipient,'RECIPIENT_NOT_APPROVED');
      const attachments=await provider.inspectPdfAttachments(source.reference);
      const pdfs=attachments.filter(a=>a.isPdf);
      if(!pdfs.length)return {status:'needs_clarification',reason:'INVOICE_ATTACHMENT_MISSING',number};
      if(selectedAttachmentIndex===undefined || !selectedSha256 || !confirmedInvoice)
        return {status:'needs_clarification',reason:pdfs.length===1?'INVOICE_CONTENT_UNVERIFIED':'INVOICE_ATTACHMENT_AMBIGUOUS',number,
          candidates:pdfs.map(a=>({index:a.index,filename:a.filename,size:a.size,sha256:a.sha256})),
          instruction:'Potvrďte konkrétní PDF fakturu; formát PDF byl ověřen z obsahu, význam dokumentu nelze bezpečně určit.'};
      const chosen=pdfs.find(a=>a.index===selectedAttachmentIndex&&a.sha256===selectedSha256);
      requireValue(chosen,'INVOICE_ATTACHMENT_CHANGED');
      const draft=await this.workflow.saveDraft(row,item,'forward',spec.recipient,source,[chosen],'Dobrý den,\n\nv příloze přeposílám potvrzenou fakturu.',spec.signatureMode);
      return {status:'prepared',number,draft,pdfFormatVerified:true,invoiceIdentification:'user_confirmed',sendable:false};
    }
    if(spec.kind==='forward'){
      requireValue(spec.recipient,'RECIPIENT_NOT_APPROVED');
      const draft=await this.workflow.saveDraft(row,item,'forward',spec.recipient,source,[],'',spec.signatureMode);
      return {status:'prepared',number,draft,sendable:false};
    }
    const recipient=source.from?.[0]?.address;
    requireValue(recipient && z.email().safeParse(recipient).success,'RECIPIENT_UNAVAILABLE');
    const text=spec.kind==='acknowledge'?
      'Dobrý den,\n\npotvrzuji přijetí Vaší zprávy. K jejímu obsahu se zatím nevyjadřuji.\n\nS pozdravem':
      'Dobrý den,\n\nděkuji za zprávu. V této věci Vám nyní nemohu vyhovět.\n\nS pozdravem';
    const draft=await this.workflow.saveDraft(row,item,'reply',recipient,source,[],text,spec.signatureMode);
    return {status:'prepared',number,draft,requiresContextReview:spec.kind==='polite_decline',sendable:false};
  }
}
