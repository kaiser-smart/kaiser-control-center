import { seal, unseal, digest } from './crypto.mjs';
import { requireValue } from './errors.mjs';
import { publicJob } from './outbox.mjs';

const DAY=86400000;
const preview=(row,mailbox,payload)=>({
  proposalId:row.id,version:row.version,state:row.state,
  from:mailbox.address,to:payload.message.to,cc:payload.message.cc,
  bcc:payload.message.bcc,subject:payload.message.subject,text:payload.message.text,
  inReplyTo:payload.message.inReplyTo??null,
  attachments:[],sendAt:payload.sendAt??null,
  expiresAt:new Date(row.expires_at).toISOString(),
  approvalUrl:`https://smart-odpady.ai/forpsi-send/?proposalId=${encodeURIComponent(row.id)}`,
  jobId:row.job_id??null,
});

export class SendApproval {
  constructor(store,env,outbox,now=()=>Date.now()){
    Object.assign(this,{store,env,outbox,now});
  }
  async prepare(principal,args,scheduled){
    const mailbox=await this.store.access(principal,args.mailboxId,'send');
    if(scheduled)await this.store.access(principal,args.mailboxId,'schedule');
    const sendAt=scheduled?Date.parse(args.sendAt):null,now=this.now();
    requireValue(!scheduled||(Number.isFinite(sendAt)&&sendAt>now&&sendAt<=now+366*DAY),
      'INVALID_SEND_TIME');
    requireValue(this.env.OUTBOX_KEY,'SEND_NOT_CONFIGURED');
    const payload={message:args.message,sendAt:scheduled?args.sendAt:null};
    const hash=await digest(payload),id=crypto.randomUUID();
    const cipher=await seal(payload,this.env.OUTBOX_KEY,`${mailbox.tenant_id}:${id}`);
    await this.store.run(`INSERT INTO send_proposals
      (id,tenant_id,principal_id,mailbox_id,request_id,payload_hash,payload_cipher,
       scheduled,send_at,created_at,expires_at)
      VALUES (?,?,?,?,?,?,?,?,?,?,?)
      ON CONFLICT(principal_id,mailbox_id,request_id) DO NOTHING`,
    id,mailbox.tenant_id,principal.id,mailbox.id,args.requestId,hash,cipher,
    +scheduled,sendAt,now,now+DAY);
    const row=await this.store.first(`SELECT * FROM send_proposals
      WHERE principal_id=? AND mailbox_id=? AND request_id=?`,
    principal.id,mailbox.id,args.requestId);
    requireValue(row?.payload_hash===hash,'IDEMPOTENCY_CONFLICT');
    requireValue(row.state==='pending'&&row.expires_at>now,'PROPOSAL_NOT_PENDING');
    const saved=row.id===id?payload:await unseal(row.payload_cipher,this.env.OUTBOX_KEY,
      `${row.tenant_id}:${row.id}`);
    await this.store.audit(principal,mailbox.id,'send.prepare','completed');
    return preview(row,mailbox,saved);
  }
  async load(principal,proposalId){
    const row=await this.store.first(`SELECT * FROM send_proposals
      WHERE id=? AND principal_id=?`,proposalId,principal.id);
    requireValue(row,'PROPOSAL_NOT_FOUND');
    const mailbox=await this.store.access(principal,row.mailbox_id,'send');
    requireValue(row.tenant_id===mailbox.tenant_id,'ACCESS_DENIED');
    if(row.scheduled)await this.store.access(principal,row.mailbox_id,'schedule');
    const payload=await unseal(row.payload_cipher,this.env.OUTBOX_KEY,
      `${row.tenant_id}:${row.id}`);
    return {row,mailbox,payload};
  }
  async status(principal,proposalId){
    const {row,mailbox,payload}=await this.load(principal,proposalId);
    const result=preview(row,mailbox,payload);
    if(row.job_id){
      const job=await this.store.jobFor(principal,row.job_id);
      result.job=publicJob(job);
    }
    return result;
  }
  async approve(principal,proposalId,version){
    requireValue(this.env.SEND_ENABLED==='true','SEND_DISABLED');
    let {row,payload}=await this.load(principal,proposalId);
    requireValue(row.version===version,'PROPOSAL_VERSION_CONFLICT');
    if(row.state==='pending'){
      requireValue(row.expires_at>this.now(),'PROPOSAL_EXPIRED');
      const claimed=await this.store.first(`UPDATE send_proposals SET state='approved',approved_at=?
        WHERE id=? AND principal_id=? AND version=? AND state='pending' AND expires_at>?
        RETURNING *`,this.now(),proposalId,principal.id,version,this.now());
      if(claimed)row=claimed;
      else row=(await this.load(principal,proposalId)).row;
    }
    requireValue(row.state==='approved','PROPOSAL_NOT_PENDING');
    // The proposal ID is the outbox idempotency key. If an HTTP retry arrives
    // after SMTP accepted the message, enqueue returns the same immutable job.
    const job=await this.outbox.enqueue(principal,{mailboxId:row.mailbox_id,
      message:payload.message,requestId:row.id,
      ...(row.scheduled?{sendAt:payload.sendAt}:{})},!!row.scheduled);
    await this.store.run(`UPDATE send_proposals SET job_id=? WHERE id=? AND principal_id=?
      AND state='approved' AND (job_id IS NULL OR job_id=?)`,
    job.id,row.id,principal.id,job.id);
    await this.store.audit(principal,row.mailbox_id,'send.approve',job.state);
    return {proposalId:row.id,job};
  }
  async cancel(principal,proposalId,version){
    const {row}=await this.load(principal,proposalId);
    requireValue(row.version===version,'PROPOSAL_VERSION_CONFLICT');
    const changed=await this.store.first(`UPDATE send_proposals SET state='cancelled'
      WHERE id=? AND principal_id=? AND state='pending' AND version=? RETURNING id`,
    row.id,principal.id,version);
    requireValue(changed||row.state==='cancelled','PROPOSAL_NOT_PENDING');
    return {proposalId:row.id,state:'cancelled'};
  }
}
