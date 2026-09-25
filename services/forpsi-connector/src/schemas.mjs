import { z } from 'zod';
export const id = z.string().min(1).max(128).regex(/^[a-zA-Z0-9_-]+$/);
export const folder = z.string().min(1).max(255).regex(/^[^\x00-\x1f\x7f]+$/);
const header = z.string().max(500).regex(/^[^\r\n\x00]*$/);
const address = z.string().email().max(254).regex(/^[^\s<>\r\n]+$/);
export const message = z.object({
  to: z.array(address).min(1).max(50), cc: z.array(address).max(50).default([]),
  bcc: z.array(address).max(50).default([]), subject: header,
  text: z.string().min(1).max(100000),
}).strict().refine(value => value.to.length + value.cc.length + value.bcc.length <= 50,
  'Maximum 50 recipients');
export const reference = z.object({ folder, uid: z.number().int().min(1).max(4294967295),
  uidValidity: z.string().regex(/^[1-9][0-9]{0,19}$/) }).strict();
export const selectors = {
  mailbox: z.object({ mailboxId: id }).strict(),
  search: z.object({ mailboxId: id, folder: folder.default('INBOX'),
    text: z.string().max(500).optional(), from: header.optional(), subject: header.optional(),
    unread: z.boolean().optional(), since: z.string().date().optional(), before: z.string().date().optional(),
    beforeUid: z.number().int().min(2).max(4294967295).optional(),
    limit: z.number().int().min(1).max(50).default(20) }).strict()
    .refine(p=>!p.since || !p.before || p.since<p.before,'End date must be after start date'),
  read: z.object({ mailboxId: id, message: reference }).strict(),
  draft: z.object({ mailboxId: id, message }).strict(),
  move: z.object({ mailboxId: id, message: reference, destination: folder }).strict(),
  flags: z.object({ mailboxId: id, message: reference,
    seen: z.boolean().optional(), flagged: z.boolean().optional() }).strict()
    .refine(value => value.seen !== undefined || value.flagged !== undefined, 'Choose a flag'),
  folder: z.object({ mailboxId: id, path: folder }).strict(),
  send: z.object({ mailboxId: id, message, requestId: z.string().uuid() }).strict(),
  schedule: z.object({ mailboxId: id, message, requestId: z.string().uuid(),
    sendAt: z.string().datetime({ offset: true }) }).strict(),
  job: z.object({ jobId: z.string().uuid() }).strict(),
};
