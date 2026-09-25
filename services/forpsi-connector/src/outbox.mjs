import { seal, unseal, digest } from './crypto.mjs';
import { requireValue } from './errors.mjs';

export const publicJob = row => ({ id: row.id, mailboxId: row.mailbox_id,
  sendAt: new Date(row.send_at).toISOString(), state: row.state,
  result: row.result_json ? JSON.parse(row.result_json) : null });
export class Outbox {
  constructor(store, env, providerFactory, now = () => Date.now()) {
    Object.assign(this, { store, env, providerFactory, now });
  }
  async enqueue(principal, args, scheduled) {
    const mailbox = await this.store.access(principal, args.mailboxId, 'send');
    if (scheduled) await this.store.access(principal, args.mailboxId, 'schedule');
    const now = this.now();
    const sendAt = scheduled ? Date.parse(args.sendAt) : now;
    const hash = await digest({ message: args.message, sendAt: scheduled ? sendAt : 'now' });
    const previous = await this.store.first('SELECT * FROM outbox WHERE principal_id=? AND mailbox_id=? AND request_id=?',
      principal.id, args.mailboxId, args.requestId);
    if (previous) { requireValue(previous.payload_hash === hash, 'IDEMPOTENCY_CONFLICT'); return publicJob(previous); }
    requireValue(!scheduled || (sendAt > now && sendAt <= now + 366 * 86400000), 'INVALID_SEND_TIME');
    const id = crypto.randomUUID();
    const cipher = await seal({ message: args.message, from: mailbox.address }, this.env.OUTBOX_KEY, `${mailbox.tenant_id}:${id}`);
    await this.store.run(`INSERT INTO outbox
      (id,tenant_id,principal_id,mailbox_id,request_id,payload_hash,payload_cipher,send_at,scheduled,state,created_at,updated_at)
      VALUES (?,?,?,?,?,?,?,?,?,'queued',?,?) ON CONFLICT(principal_id,mailbox_id,request_id) DO NOTHING`,
    id, mailbox.tenant_id, principal.id, mailbox.id, args.requestId, hash, cipher, sendAt, +scheduled, now, now);
    const job = await this.store.first('SELECT * FROM outbox WHERE principal_id=? AND mailbox_id=? AND request_id=?',
      principal.id, mailbox.id, args.requestId);
    requireValue(job.payload_hash === hash, 'IDEMPOTENCY_CONFLICT');
    if (!scheduled) await this.process(job.id);
    return publicJob(await this.store.first('SELECT * FROM outbox WHERE id=?', job.id));
  }
  async process(id) {
    // Atomic claim: two cron invocations cannot both send a job.
    const job = await this.store.first(`UPDATE outbox SET state='sending', updated_at=?
      WHERE id=? AND state='queued' AND send_at<=? RETURNING *`, this.now(), id, this.now());
    if (!job) return;
    const actor = { id: job.principal_id, scopes: ['forpsi:send', 'forpsi:schedule'] };
    let mailbox, message;
    try {
      mailbox = await this.store.access(actor, job.mailbox_id, 'send');
      requireValue(mailbox.tenant_id === job.tenant_id, 'ACCESS_DENIED');
      if (job.scheduled) await this.store.access(actor, job.mailbox_id, 'schedule');
      const payload = await unseal(job.payload_cipher, this.env.OUTBOX_KEY, `${job.tenant_id}:${job.id}`);
      requireValue(payload.from === mailbox.address, 'MAILBOX_IDENTITY_CHANGED');
      message = payload.message;
      await this.store.audit(actor, mailbox.id, 'send', 'started');
    } catch {
      await this.finish(job, 'blocked', { code: 'AUTHORIZATION_OR_CONFIGURATION_CHANGED' }); return;
    }
    let result;
    try { result = await this.providerFactory(this.env, mailbox).send(message, job); }
    catch { await this.finish(job, 'uncertain', { code: 'DELIVERY_UNCERTAIN_NO_AUTOMATIC_RETRY' }); return; }
    await this.finish(job, result.rejected ? 'partial' : 'sent', result);
  }
  async finish(job, state, result) {
    await this.store.run(`UPDATE outbox SET state=?, updated_at=?, result_json=?, payload_cipher=NULL
      WHERE id=? AND state='sending'`, state, this.now(), JSON.stringify(result), job.id);
    await this.store.audit({ id: job.principal_id }, job.mailbox_id, 'send', state);
  }
  async tick() {
    // A process crash after SMTP acceptance is ambiguous. Do not requeue these jobs.
    await this.store.run(`UPDATE outbox SET state='uncertain', updated_at=?, payload_cipher=NULL,
      result_json=? WHERE state='sending' AND updated_at<?`, this.now(),
    JSON.stringify({ code: 'INTERRUPTED_DELIVERY_NO_AUTOMATIC_RETRY' }), this.now() - 15 * 60000);
    const due = await this.store.rows("SELECT id FROM outbox WHERE state='queued' AND send_at<=? ORDER BY send_at LIMIT 10", this.now());
    for (const row of due) await this.process(row.id);
  }
  async cancel(principal, jobId) {
    const row = await this.store.jobFor(principal, jobId);
    await this.store.access(principal, row.mailbox_id, 'schedule');
    const updated = await this.store.first(`UPDATE outbox SET state='cancelled', updated_at=?, payload_cipher=NULL
      WHERE id=? AND principal_id=? AND state='queued' RETURNING *`, this.now(), row.id, principal.id);
    requireValue(updated || row.state === 'cancelled', 'JOB_NOT_CANCELLABLE');
    return publicJob(updated ?? row);
  }
}
