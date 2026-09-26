import { mailboxPassword } from './credentials.mjs';
import { ImapFlow } from 'imapflow';
import nodemailer from 'nodemailer';
import { simpleParser } from 'mailparser';
import { requireValue } from './errors.mjs';
import { smtpSocketFactory } from './smtp-socket.mjs';

const MAX_MESSAGE = 2 * 1024 * 1024;
const publicEnvelope = item => ({ uid: item.uid, subject: item.envelope?.subject ?? '',
  from: (item.envelope?.from ?? []).map(a => ({ name: a.name ?? '', address: a.address ?? '' })),
  to: (item.envelope?.to ?? []).map(a => ({ name: a.name ?? '', address: a.address ?? '' })),
  date: item.envelope?.date?.toISOString() ?? null, size: item.size ?? null,
  flags: [...(item.flags ?? [])] });

export class Forpsi {
  constructor(env, mailbox, dependencies = {}) {
    this.mailbox = mailbox;
    this.env = env;
    this.clientFactory = dependencies.clientFactory ?? (options => new ImapFlow(options));
    this.transportFactory = dependencies.transportFactory ?? (options => nodemailer.createTransport(options));
  }
  async imap(fn) {
    const password = await mailboxPassword(this.env, this.mailbox);
    const client = this.clientFactory({ host: 'imap.forpsi.com', port: 993, secure: true,
      auth: { user: this.mailbox.address, pass: password },
      tls: { rejectUnauthorized: true, minVersion: 'TLSv1.2', servername: 'imap.forpsi.com' },
      logger: false, disableAutoIdle: true, disableCompression: true,
      connectionTimeout: 15000, greetingTimeout: 15000, socketTimeout: 30000 });
    client.on('error', () => {}); // Errors are returned to the caller without protocol/credential logs.
    try { await client.connect(); return await fn(client); }
    finally { client.close(); }
  }
  async locked(client, ref, readOnly, fn) {
    const lock = await client.getMailboxLock(ref.folder, { readOnly });
    try {
      if (ref.uidValidity) requireValue(String(client.mailbox.uidValidity) === ref.uidValidity, 'STALE_MESSAGE_REFERENCE');
      return await fn();
    } finally { lock.release(); }
  }
  async specialFolder(client, type) {
    const configured = this.mailbox[`${type}_folder`];
    const folders = await client.list();
    const flag = { drafts: '\\Drafts', sent: '\\Sent', trash: '\\Trash' }[type];
    const matches = folders.filter(f => (configured ? f.path === configured : f.specialUse === flag) && !f.flags?.has('\\Noselect'));
    requireValue(matches.length === 1, 'SPECIAL_FOLDER_NOT_CONFIGURED');
    return matches[0].path;
  }
  listFolders() {
    return this.imap(async client => ({ folders: (await client.list()).map(f => ({
      path: f.path, name: f.name, delimiter: f.delimiter, specialUse: f.specialUse ?? null,
      selectable: !f.flags?.has('\\Noselect'),
    })), supportsMove: client.capabilities.has('MOVE') }));
  }
  search(args) {
    return this.imap(client => this.locked(client, { folder: args.folder }, true, async () => {
      const last = Math.min(client.mailbox.uidNext - 1, (args.beforeUid ?? 4294967296) - 1);
      if (last < 1) return { messages: [], nextBeforeUid: null, untrustedContent: true };
      // Bound the UID search window instead of returning every UID in a large mailbox.
      const first = Math.max(1, last - 4999);
      const query = { uid: `${first}:${last}` };
      if (args.text) query.body = args.text;
      if (args.from) query.from = args.from;
      if (args.subject) query.subject = args.subject;
      if (args.unread !== undefined) query.seen = !args.unread;
      if (args.since) query.since = new Date(`${args.since}T00:00:00Z`);
      if (args.before) query.before = new Date(`${args.before}T00:00:00Z`);
      const all = (await client.search(query, { uid: true }) || []).sort((a, b) => b - a);
      const uids = all.slice(0, args.limit);
      const messages = [];
      if (uids.length) for await (const item of client.fetch(uids, { envelope: true, flags: true, size: true }, { uid: true })) {
        messages.push({ ...publicEnvelope(item), reference: { folder: args.folder, uid: item.uid,
          uidValidity: String(client.mailbox.uidValidity) } });
      }
      return { messages: messages.sort((a, b) => b.uid - a.uid),
        nextBeforeUid: all.length > args.limit ? uids.at(-1) : (first > 1 ? first : null),
        scannedUidRange: { first, last }, untrustedContent: true };
    }));
  }
  read(ref) {
    return this.imap(client => this.locked(client, ref, true, async () => {
      const item = await client.fetchOne(String(ref.uid), { envelope: true, flags: true, size: true }, { uid: true });
      requireValue(item, 'MESSAGE_NOT_FOUND');
      requireValue(item.size <= MAX_MESSAGE, 'MESSAGE_TOO_LARGE');
      const { content } = await client.download(String(ref.uid), undefined, { uid: true, maxBytes: MAX_MESSAGE + 1 });
      const chunks = []; let size = 0;
      for await (const chunk of content) { size += chunk.length; requireValue(size <= MAX_MESSAGE, 'MESSAGE_TOO_LARGE'); chunks.push(chunk); }
      const parsed = await simpleParser(Buffer.concat(chunks), { skipHtmlToText: false,
        skipTextToHtml: true, skipImageLinks: true });
      return { ...publicEnvelope(item), reference: ref, text: (parsed.text ?? '').slice(0, 100000),
        truncated: (parsed.text?.length ?? 0) > 100000, untrustedContent: true,
        attachments: parsed.attachments.map(a => ({ filename: a.filename ?? '',
          contentType: a.contentType, size: a.size })) };
    }));
  }
  async compose(message, jobId, { keepBcc = false, date = new Date(), senderName = '' } = {}) {
    const transport = nodemailer.createTransport({ streamTransport: true, buffer: true,
      newline: 'windows', disableFileAccess: true, disableUrlAccess: true });
    // Stream transport always preserves Bcc; remove it before composition for SMTP.
    const { bcc, ...visibleMessage } = message;
    const info = await transport.sendMail({ ...(keepBcc ? message : visibleMessage), from: senderName ? {name:senderName,address:this.mailbox.address} : this.mailbox.address,
      messageId: `<${jobId}@${this.mailbox.address.split('@')[1]}>`, date, keepBcc,
      disableFileAccess: true, disableUrlAccess: true });
    return info.message;
  }
  async saveDraft(message, {senderName='',requestId=crypto.randomUUID()} = {}) {
    const raw = await this.compose(message, requestId, { keepBcc: true, senderName });
    return this.imap(async client => {
      const folder = await this.specialFolder(client, 'drafts');
      const result = await client.append(folder, raw, ['\\Draft']);
      requireValue(result, 'DRAFT_SAVE_FAILED');
      return { saved: true, folder, reference: result.uid && result.uidValidity ? {
        folder, uid: result.uid, uidValidity: String(result.uidValidity) } : null };
    });
  }
  move(ref, destination, trash = false) {
    return this.imap(async client => {
      if (trash) destination = await this.specialFolder(client, 'trash');
      requireValue(destination !== ref.folder, 'ALREADY_IN_FOLDER');
      // Avoid library fallback to COPY + broad EXPUNGE on servers without UID MOVE.
      requireValue(client.capabilities.has('MOVE'), 'SAFE_MOVE_UNSUPPORTED');
      return this.locked(client, ref, false, async () => {
        requireValue(await client.fetchOne(String(ref.uid), { uid: true }, { uid: true }), 'MESSAGE_NOT_FOUND');
        const result = await client.messageMove(String(ref.uid), destination, { uid: true });
        requireValue(result, 'MOVE_FAILED');
        const newUid = result.uidMap?.get(ref.uid);
        return { moved: true, destination, reference: newUid && result.uidValidity ? {
          folder: destination, uid: newUid, uidValidity: String(result.uidValidity) } : null };
      });
    });
  }
  flags(ref, changes) {
    return this.imap(client => this.locked(client, ref, false, async () => {
      requireValue(await client.fetchOne(String(ref.uid), { uid: true }, { uid: true }), 'MESSAGE_NOT_FOUND');
      for (const [key, flag] of [['seen', '\\Seen'], ['flagged', '\\Flagged']]) {
        if (changes[key] === undefined) continue;
        const method = changes[key] ? 'messageFlagsAdd' : 'messageFlagsRemove';
        requireValue(await client[method](String(ref.uid), [flag], { uid: true }), 'FLAGS_FAILED');
      }
      return { updated: true, reference: ref };
    }));
  }
  createFolder(path) {
    return this.imap(async client => {
      if ((await client.list()).some(f => f.path === path)) return { path, created: false };
      const result = await client.mailboxCreate(path);
      requireValue(result, 'FOLDER_CREATE_FAILED');
      return { path, created: true };
    });
  }
  async smtp() {
    const password = await mailboxPassword(this.env, this.mailbox);
    return this.transportFactory({ host: 'smtp.forpsi.com', port: 465, secure: true,
      getSocket: smtpSocketFactory(),
      auth: { user: this.mailbox.address, pass: password },
      tls: { rejectUnauthorized: true, minVersion: 'TLSv1.2', servername: 'smtp.forpsi.com' },
      logger: false, debug: false, pool: false, connectionTimeout: 15000,
      greetingTimeout: 15000, socketTimeout: 30000,
      disableFileAccess: true, disableUrlAccess: true });
  }
  async verifySmtp() {
    const transport = await this.smtp();
    try { return await transport.verify(); } finally { transport.close(); }
  }
  async send(message, job) {
    const raw = await this.compose(message, job.id, { date: new Date(job.send_at) });
    const transport = await this.smtp();
    let result;
    try {
      result = await transport.sendMail({ envelope: { from: this.mailbox.address,
        to: [...message.to, ...message.cc, ...message.bcc] }, raw });
    } finally { transport.close(); }
    const accepted = result.accepted?.length ?? 0;
    requireValue(accepted > 0, 'SMTP_NOT_ACCEPTED');
    let sentCopy = 'saved';
    try {
      const archiveRaw = await this.compose(message, job.id, { keepBcc: true, date: new Date(job.send_at) });
      await this.imap(async client => {
        const folder = await this.specialFolder(client, 'sent');
        requireValue(await client.append(folder, archiveRaw, ['\\Seen']), 'SENT_COPY_FAILED');
      });
    } catch { sentCopy = 'failed'; } // SMTP accepted: never resend because saving the copy failed.
    return { accepted, rejected: result.rejected?.length ?? 0, sentCopy,
      messageId: `<${job.id}@${this.mailbox.address.split('@')[1]}>` };
  }
}
