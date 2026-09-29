import { mailboxPassword } from './credentials.mjs';
import { ImapFlow } from 'imapflow';
import nodemailer from 'nodemailer';
import { simpleParser } from 'mailparser';
import { createHash } from 'node:crypto';
import { encodePath } from 'imapflow/lib/tools.js';
import { requireValue } from './errors.mjs';
import { smtpSocketFactory } from './smtp-socket.mjs';

const MAX_MESSAGE = 2 * 1024 * 1024;
const MAX_BRAIN_TEXT = 512 * 1024;
const MAX_BRAIN_MIME_NODES = 200;
const MAX_BRAIN_MIME_DEPTH = 20;
const MAX_BRAIN_HEADERS = 16 * 1024;
const publicEnvelope = item => ({ uid: item.uid, subject: item.envelope?.subject ?? '',
  from: (item.envelope?.from ?? []).map(a => ({ name: a.name ?? '', address: a.address ?? '' })),
  to: (item.envelope?.to ?? []).map(a => ({ name: a.name ?? '', address: a.address ?? '' })),
  cc: (item.envelope?.cc ?? []).map(a => ({ name: a.name ?? '', address: a.address ?? '' })),
  date: item.envelope?.date?.toISOString() ?? null, size: item.size ?? null,
  flags: [...(item.flags ?? [])], messageId: item.envelope?.messageId ?? null,
  inReplyTo: item.envelope?.inReplyTo ?? null });

function brainMimeParts(root) {
  const plain=[],html=[],attachments=[],seen=new Set();
  let count=0;
  const visit=(node,depth,isRoot=false)=>{
    requireValue(node&&typeof node==='object'&&++count<=MAX_BRAIN_MIME_NODES&&
      depth<=MAX_BRAIN_MIME_DEPTH,'MIME_STRUCTURE_INVALID');
    const type=typeof node.type==='string'?node.type.toLowerCase():'';
    requireValue(type.length<=100&&/^[a-z0-9!#$&^_.+-]+\/[a-z0-9!#$&^_.+-]+$/.test(type),
      'MIME_STRUCTURE_INVALID');
    if(type.startsWith('multipart/')){
      requireValue(Array.isArray(node.childNodes)&&node.childNodes.length>0,
        'MIME_STRUCTURE_INVALID');
      for(const child of node.childNodes)visit(child,depth+1);
      return;
    }
    requireValue((!node.childNodes?.length||type==='message/rfc822')&&
      Number.isSafeInteger(node.size)&&node.size>=0,
      'MIME_STRUCTURE_INVALID');
    const part=node.part??(isRoot?'1':null);
    requireValue(typeof part==='string'&&/^\d+(?:\.\d+)*$/.test(part)&&!seen.has(part),
      'MIME_STRUCTURE_INVALID');
    seen.add(part);
    const filename=String(node.dispositionParameters?.filename??node.parameters?.name??'').slice(0,255);
    const disposition=String(node.disposition??'').toLowerCase();
    const candidate={part,type,size:node.size,
      encoding:String(node.encoding??'').toLowerCase(),
      charset:String(node.parameters?.charset??'').toLowerCase(),
      flowed:String(node.parameters?.format??'').toLowerCase()==='flowed'};
    if(!filename&&disposition!=='attachment'&&(type==='text/plain'||type==='text/html')){
      (type==='text/plain'?plain:html).push(candidate);
    } else {
      attachments.push({filename,contentType:type,size:node.size});
    }
  };
  visit(root,0,true);
  return {textParts:plain.length?plain:html,attachments,htmlOnly:plain.length===0,
    textPartsFound:plain.length+html.length};
}

async function brainTextPart(client,uid,part,remaining,diagnostics) {
  requireValue(part.size<=remaining,'MESSAGE_TOO_LARGE');
  const downloaded=await client.download(String(uid),part.part,{uid:true,maxBytes:remaining+1});
  requireValue(downloaded?.content,'MIME_PART_UNAVAILABLE');
  requireValue(!downloaded.meta?.contentType||
    downloaded.meta.contentType.toLowerCase()===part.type,'MIME_PART_MISMATCH');
  requireValue(downloaded.meta?.disposition!=='attachment'&&!downloaded.meta?.filename,
    'MIME_PART_MISMATCH');
  const chunks=[];
  let size=0;
  for await(const chunk of downloaded.content){
    size+=chunk.length;
    if(diagnostics)diagnostics.downloadedBytes+=chunk.length;
    requireValue(size<=remaining,'MESSAGE_TOO_LARGE');
    chunks.push(chunk);
  }
  requireValue(size>0||part.size===0,'MIME_PART_UNAVAILABLE');
  if(['','7bit','8bit','binary'].includes(part.encoding)&&!part.flowed&&
    ['', 'utf-8','us-ascii'].includes(part.charset))
    requireValue(size===part.size,'MIME_PART_INCOMPLETE');
  return Buffer.concat(chunks,size);
}

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
    return this.imap(async client => {
      const folders=await client.list();
      const drafts=folders.filter(f=>!f.flags?.has('\\Noselect') &&
        (this.mailbox.drafts_folder?f.path===this.mailbox.drafts_folder:f.specialUse==='\\Drafts'));
      return {folders:folders.map(f=>({
        path:f.path,name:f.name,delimiter:f.delimiter,specialUse:f.specialUse??null,
        selectable:!f.flags?.has('\\Noselect')
      })),draftFolder:drafts.length===1?drafts[0].path:null,
        supportsMove:client.capabilities.has('MOVE'),
        supportsReplace:client.capabilities.has('REPLACE')&&client.capabilities.has('UIDPLUS')};
    });
  }
  search(args) {
    return this.imap(client => this.locked(client, { folder: args.folder }, true, async () => {
      const last = Math.min(client.mailbox.uidNext - 1, (args.beforeUid ?? 4294967296) - 1);
      if (last < 1) return { messages: [], nextBeforeUid: null,
        uidValidity:String(client.mailbox.uidValidity),untrustedContent: true };
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
        scannedUidRange: { first, last },uidValidity:String(client.mailbox.uidValidity),untrustedContent: true };
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
        messageId: parsed.messageId ?? item.envelope?.messageId ?? null,
        inReplyTo: parsed.inReplyTo ?? item.envelope?.inReplyTo ?? null,
        references: Array.isArray(parsed.references) ? parsed.references : parsed.references ? [parsed.references] : [],
        attachments: parsed.attachments.map(a => ({ filename: a.filename ?? '',
          contentType: a.contentType, size: a.size })) };
    }));
  }
  async readForBrain(ref,diagnostics=null) {
    if(diagnostics)Object.assign(diagnostics,{subject:null,messageId:null,rawMessageSize:null,
      textPartsFound:0,downloadedTextParts:0,downloadedBytes:0,textSource:null,
      attachments:[],downloadedBinaryAttachments:0});
    return this.imap(client=>this.locked(client,ref,true,async()=>{
      const initial=await client.fetchOne(String(ref.uid),
        {envelope:true,flags:true,size:true},{uid:true});
      requireValue(initial,'MESSAGE_NOT_FOUND');
      requireValue(Number.isSafeInteger(initial.size)&&initial.size>=0,'MIME_STRUCTURE_INVALID');
      if(diagnostics){
        requireValue(initial.uid===ref.uid,'SOURCE_REFERENCE_MISMATCH');
        diagnostics.subject=initial.envelope?.subject??'';
        diagnostics.messageId=initial.envelope?.messageId??null;
        diagnostics.rawMessageSize=initial.size;
        // A raw small-message download could include attachments, so a diagnostic
        // claiming zero binary downloads must use the selective MIME path.
        requireValue(initial.size>MAX_MESSAGE,'DIAGNOSTIC_REQUIRES_SELECTIVE_MIME');
      }
      if(initial.size<=MAX_MESSAGE){
        // The ordinary reader remains the source of truth for small messages.
        // Read under this lock so another client cannot change the selected folder.
        const {content}=await client.download(String(ref.uid),undefined,
          {uid:true,maxBytes:MAX_MESSAGE+1});
        const chunks=[];let size=0;
        for await(const chunk of content){size+=chunk.length;
          requireValue(size<=MAX_MESSAGE,'MESSAGE_TOO_LARGE');chunks.push(chunk);}
        const parsed=await simpleParser(Buffer.concat(chunks),{skipHtmlToText:false,
          skipTextToHtml:true,skipImageLinks:true});
        return {...publicEnvelope(initial),reference:ref,text:(parsed.text??'').slice(0,100000),
          truncated:(parsed.text?.length??0)>100000,untrustedContent:true,
          messageId:parsed.messageId??initial.envelope?.messageId??null,
          inReplyTo:parsed.inReplyTo??initial.envelope?.inReplyTo??null,
          references:Array.isArray(parsed.references)?parsed.references:
            parsed.references?[parsed.references]:[],
          attachments:parsed.attachments.map(a=>({filename:a.filename??'',
            contentType:a.contentType,size:a.size}))};
      }
      const item=await client.fetchOne(String(ref.uid),
        {envelope:true,flags:true,size:true,bodyStructure:true,headers:['References']},
        {uid:true});
      requireValue(item,'MESSAGE_NOT_FOUND');
      requireValue(item.uid===initial.uid&&item.size===initial.size&&
        item.envelope?.messageId===initial.envelope?.messageId,'SOURCE_CHANGED_DURING_READ');
      const {textParts,attachments,htmlOnly,textPartsFound}=brainMimeParts(item.bodyStructure);
      if(diagnostics)Object.assign(diagnostics,{textPartsFound,
        textSource:htmlOnly?'html':'plain',attachments});
      requireValue(textParts.length>0,'MIME_TEXT_UNAVAILABLE');
      requireValue(!item.headers||Buffer.byteLength(item.headers)<=MAX_BRAIN_HEADERS,
        'MIME_HEADERS_TOO_LARGE');
      const chunks=[];let size=0;
      for(const part of textParts){
        const content=await brainTextPart(client,ref.uid,part,MAX_BRAIN_TEXT-size,diagnostics);
        if(diagnostics)diagnostics.downloadedTextParts++;
        size+=content.length;chunks.push(content);
      }
      let decoded;
      try{decoded=new TextDecoder('utf-8',{fatal:true}).decode(Buffer.concat(chunks,size));}
      catch{throw new Error('MIME_TEXT_UNREADABLE');}
      let text=decoded;
      if(htmlOnly){
        const parsed=await simpleParser(Buffer.concat([
          Buffer.from('MIME-Version: 1.0\r\nContent-Type: text/html; charset=utf-8\r\n\r\n'),
          Buffer.from(decoded)]),{skipHtmlToText:false,skipTextToHtml:true,skipImageLinks:true});
        requireValue(typeof parsed.text==='string','MIME_TEXT_UNAVAILABLE');
        text=parsed.text;
      }
      requireValue(Buffer.byteLength(text,'utf8')<=MAX_BRAIN_TEXT,'MESSAGE_TOO_LARGE');
      const headers=item.headers?.toString('utf8').replace(/\r?\n[\t ]+/g,' ')??'';
      const refs=headers.match(/^References:\s*([^\r\n]*)/im)?.[1]
        ?.match(/<[^<>\s]{1,500}>/g)??[];
      return {...publicEnvelope(item),reference:ref,text:text.slice(0,100000),
        truncated:text.length>100000,untrustedContent:true,
        messageId:item.envelope?.messageId??null,inReplyTo:item.envelope?.inReplyTo??null,
        references:refs,attachments};
    }));
  }
  inspectPdfAttachments(ref) {
    return this.imap(client => this.locked(client, ref, true, async () => {
      const item = await client.fetchOne(String(ref.uid), { size: true }, { uid: true });
      requireValue(item, 'MESSAGE_NOT_FOUND');
      requireValue(item.size <= MAX_MESSAGE, 'MESSAGE_TOO_LARGE');
      const { content } = await client.download(String(ref.uid), undefined, { uid: true, maxBytes: MAX_MESSAGE + 1 });
      const chunks=[]; let size=0;
      for await (const chunk of content) { size+=chunk.length; requireValue(size<=MAX_MESSAGE,'MESSAGE_TOO_LARGE'); chunks.push(chunk); }
      const parsed=await simpleParser(Buffer.concat(chunks),{skipHtmlToText:true,skipTextToHtml:true,skipImageLinks:true});
      return parsed.attachments.map((a,index)=>{
        const bytes=a.content;
        const isPdf=Buffer.isBuffer(bytes) && bytes.subarray(0,8).toString('latin1').startsWith('%PDF-') &&
          bytes.subarray(Math.max(0,bytes.length-1024)).toString('latin1').includes('%%EOF');
        return {index,filename:a.filename??'',contentType:a.contentType,size:bytes?.length??0,
          isPdf,sha256:isPdf?createHash('sha256').update(bytes).digest('hex'):null};
      });
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
  async editableDraft(client, ref) {
    requireValue((await this.specialFolder(client, 'drafts'))===ref.folder,'NOT_DRAFT_FOLDER');
    const item=await client.fetchOne(String(ref.uid),{flags:true,size:true},{uid:true});
    requireValue(item,'MESSAGE_NOT_FOUND');
    requireValue(item.flags?.has('\\Draft') && !item.flags.has('\\Deleted'),'NOT_EDITABLE_DRAFT');
    requireValue(item.size<=MAX_MESSAGE,'MESSAGE_TOO_LARGE');
    const {content}=await client.download(String(ref.uid),undefined,{uid:true,maxBytes:MAX_MESSAGE+1});
    const chunks=[];let size=0;
    for await(const chunk of content){size+=chunk.length;requireValue(size<=MAX_MESSAGE,'MESSAGE_TOO_LARGE');chunks.push(chunk);}
    const raw=Buffer.concat(chunks);
    const parsed=await simpleParser(raw,{skipHtmlToText:true,skipTextToHtml:true,skipImageLinks:true});
    requireValue(!parsed.html && !parsed.attachments.length && typeof parsed.text==='string','DRAFT_FORMAT_UNSUPPORTED');
    requireValue(parsed.from?.value?.length===1 && parsed.from.value[0].address?.toLowerCase()===this.mailbox.address.toLowerCase(),'DRAFT_SENDER_UNSUPPORTED');
    const addresses=field=>(field?.value??[]).map(a=>a.address);
    const message={to:addresses(parsed.to),cc:addresses(parsed.cc),bcc:addresses(parsed.bcc),subject:parsed.subject??'',text:parsed.text};
    const senderName=parsed.from.value[0].name??'';
    requireValue(senderName.length<=100 && !/[\x00-\x1f\x7f]/.test(senderName),'DRAFT_SENDER_UNSUPPORTED');
    return {message,senderName,etag:createHash('sha256').update(raw).digest('hex')};
  }
  readEditableDraft(ref) {
    return this.imap(client=>this.locked(client,ref,true,async()=>{
      const draft=await this.editableDraft(client,ref);
      return {...draft,reference:ref,canReplace:client.capabilities.has('REPLACE')&&client.capabilities.has('UIDPLUS')};
    }));
  }
  copyDraft(ref,expectedEtag,message,{requestId=crypto.randomUUID()}={}) {
    return this.imap(client=>this.locked(client,ref,false,async()=>{
      const source=await this.editableDraft(client,ref);
      requireValue(source.etag===expectedEtag,'DRAFT_CHANGED');
      const raw=await this.compose(message,requestId,{keepBcc:true,senderName:source.senderName});
      const result=await client.append(ref.folder,raw,['\\Draft']);
      requireValue(result,'DRAFT_SAVE_FAILED');
      const reference=result.uid && result.uidValidity?{
        folder:ref.folder,uid:result.uid,uidValidity:String(result.uidValidity)
      }:null;
      // APPEND may succeed without UIDPLUS. Never append again merely because
      // the provider omitted an exact UID or a subsequent readback fails.
      let verified=false;
      if(reference){
        try {
          const saved=await this.editableDraft(client,reference);
          verified=saved.etag===createHash('sha256').update(raw).digest('hex');
        } catch { /* APPEND was confirmed; readback is best effort and must not repeat it. */ }
      }
      return {saved:true,folder:ref.folder,reference,verified,sourceRetained:true};
    }));
  }
  async replaceDraft(ref,expectedEtag,message,{senderName='',requestId=crypto.randomUUID()}={}) {
    const raw=await this.compose(message,requestId,{keepBcc:true,senderName});
    return this.imap(client=>this.locked(client,ref,false,async()=>{
      requireValue(client.capabilities.has('REPLACE')&&client.capabilities.has('UIDPLUS'),'SAFE_REPLACE_UNSUPPORTED');
      const current=await this.editableDraft(client,ref);
      requireValue(current.etag===expectedEtag,'DRAFT_CHANGED');
      // RFC 8508 UID REPLACE is one atomic provider command. ImapFlow 2.0.6 has
      // no public wrapper; its pinned command encoder is used only when advertised.
      let replacement=null;
      const captureAppendUid=response=>{
        const section=response.attributes?.[0]?.section;
        if(section?.[0]?.value?.toUpperCase()!=='APPENDUID')return;
        if(!/^[1-9][0-9]{0,19}$/.test(section[1]?.value??'') || !/^[1-9][0-9]{0,9}$/.test(section[2]?.value??''))return;
        const uid=Number(section[2].value);
        if(uid<=4294967295)replacement={folder:ref.folder,uid,uidValidity:section[1].value};
      };
      const reply=await client.exec('UID REPLACE',[
        {type:'SEQUENCE',value:String(ref.uid)},
        {type:'ATOM',value:encodePath(client,ref.folder)},
        [{type:'ATOM',value:'\\Draft'}],
        {type:'LITERAL',value:raw}
      ],{untagged:{OK:captureAppendUid}});
      captureAppendUid(reply.response);
      reply.next();
      requireValue(replacement,'DRAFT_REPLACE_UNCERTAIN');
      return {saved:true,folder:ref.folder,reference:replacement};
    }));
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
