import { z } from 'zod';
import { id, folder, reference } from './schemas.mjs';
import { requireValue, safeError } from './errors.mjs';

const labelFields = { name: z.string().trim().min(1).max(80), color: z.string().regex(/^#[0-9a-fA-F]{6}$/) };
export const rule = z.object({
  name: z.string().trim().min(1).max(80), enabled: z.boolean(), folder,
  conditions: z.array(z.object({ field: z.enum(['from', 'subject', 'text']),
    contains: z.string().trim().min(1).max(200) }).strict()).min(1).max(10),
  actions: z.object({ labels: z.array(z.string().uuid()).max(10).default([]),
    destination: folder.optional(), seen: z.boolean().optional(), flagged: z.boolean().optional(),
  }).strict().refine(a => a.labels.length || a.destination || a.seen !== undefined || a.flagged !== undefined,
    'At least one action'),
}).strict();
export const organizationSchemas = {
  createLabel: z.object({ mailboxId: id, ...labelFields }).strict(),
  editLabel: z.object({ mailboxId: id, labelId: z.string().uuid(), version: z.number().int().positive(), ...labelFields }).strict(),
  assign: z.object({ mailboxId: id, message: reference, labelId: z.string().uuid(), assigned: z.boolean() }).strict(),
  createRule: z.object({ mailboxId: id, rule }).strict(),
  editRule: z.object({ mailboxId: id, ruleId: z.string().uuid(), version: z.number().int().positive(), rule }).strict(),
  applyRule: z.object({ mailboxId: id, ruleId: z.string().uuid(), version: z.number().int().positive(),
    messages: z.array(reference).min(1).max(20), preview: z.boolean().default(true) }).strict(),
};
export function matchesRule(definition, message) {
  if (!definition.enabled || definition.folder !== message.reference.folder) return false;
  return definition.conditions.every(condition => {
    const value = condition.field === 'from' ? message.from.map(a => `${a.name} ${a.address}`).join(' ') : message[condition.field];
    return String(value ?? '').normalize('NFC').toLocaleLowerCase('cs')
      .includes(condition.contains.normalize('NFC').toLocaleLowerCase('cs'));
  });
}

// Connector-owned organization layer. It does not pretend to update Forpsi webmail settings.
export class Organizer {
  constructor(store) { this.store = store; }
  async listLabels(mailboxId) {
    return { storage: 'connector', labels: await this.store.rows('SELECT id,name,color,version FROM labels WHERE mailbox_id=? ORDER BY name', mailboxId) };
  }
  async label(mailboxId, labelId) {
    const row = await this.store.first('SELECT * FROM labels WHERE id=? AND mailbox_id=?', labelId, mailboxId);
    requireValue(row, 'LABEL_NOT_FOUND'); return row;
  }
  async createLabel(args) {
    const row = await this.store.first('INSERT INTO labels (id,mailbox_id,name,color) VALUES (?,?,?,?) RETURNING id,name,color,version',
      crypto.randomUUID(), args.mailboxId, args.name, args.color);
    return { storage: 'connector', label: row };
  }
  async editLabel(args) {
    const row = await this.store.first('UPDATE labels SET name=?,color=?,version=version+1 WHERE id=? AND mailbox_id=? AND version=? RETURNING id,name,color,version',
      args.name, args.color, args.labelId, args.mailboxId, args.version);
    requireValue(row, 'LABEL_VERSION_CONFLICT'); return { storage: 'connector', label: row };
  }
  async assign(args) {
    await this.label(args.mailboxId, args.labelId);
    const ref = args.message;
    if (args.assigned) await this.store.run('INSERT OR IGNORE INTO message_labels VALUES (?,?,?,?)',
      args.labelId, ref.folder, ref.uidValidity, ref.uid);
    else await this.store.run('DELETE FROM message_labels WHERE label_id=? AND folder=? AND uid_validity=? AND uid=?',
      args.labelId, ref.folder, ref.uidValidity, ref.uid);
    return { storage: 'connector', assigned: args.assigned, labelId: args.labelId };
  }
  async messageLabels(mailboxId, ref) {
    return this.store.rows(`SELECT l.id,l.name,l.color FROM labels l JOIN message_labels ml ON ml.label_id=l.id
      WHERE l.mailbox_id=? AND ml.folder=? AND ml.uid_validity=? AND ml.uid=?`, mailboxId, ref.folder, ref.uidValidity, ref.uid);
  }
  async moved(mailboxId, oldRef, newRef) {
    if (!newRef) return { labelsFollowed: false };
    await this.store.run(`UPDATE OR IGNORE message_labels SET folder=?,uid_validity=?,uid=?
      WHERE folder=? AND uid_validity=? AND uid=? AND label_id IN (SELECT id FROM labels WHERE mailbox_id=?)`,
    newRef.folder, newRef.uidValidity, newRef.uid, oldRef.folder, oldRef.uidValidity, oldRef.uid, mailboxId);
    return { labelsFollowed: true };
  }
  async listRules(mailboxId) {
    const rows = await this.store.rows('SELECT id,version,definition_json FROM rules WHERE mailbox_id=? ORDER BY id', mailboxId);
    return { storage: 'connector', execution: 'explicit', rules: rows.map(row => ({
      id: row.id, version: row.version, rule: JSON.parse(row.definition_json) })) };
  }
  async validateLabels(mailboxId, definition) {
    for (const labelId of definition.actions.labels) await this.label(mailboxId, labelId);
  }
  async saveRule(args, edit = false) {
    await this.validateLabels(args.mailboxId, args.rule);
    const json = JSON.stringify(args.rule);
    const row = edit ? await this.store.first(`UPDATE rules SET definition_json=?,version=version+1
      WHERE id=? AND mailbox_id=? AND version=? RETURNING id,version`, json, args.ruleId, args.mailboxId, args.version)
      : await this.store.first('INSERT INTO rules (id,mailbox_id,definition_json) VALUES (?,?,?) RETURNING id,version',
        crypto.randomUUID(), args.mailboxId, json);
    requireValue(row, 'RULE_VERSION_CONFLICT');
    return { storage: 'connector', execution: 'explicit', ...row, rule: args.rule };
  }
  async apply(args, provider, beforeMutation = async () => {}) {
    const row = await this.store.first('SELECT * FROM rules WHERE id=? AND mailbox_id=?', args.ruleId, args.mailboxId);
    requireValue(row && row.version === args.version, 'RULE_VERSION_CONFLICT');
    const definition = rule.parse(JSON.parse(row.definition_json));
    await this.validateLabels(args.mailboxId, definition);
    const results = [];
    for (const ref of args.messages) {
      const completed = [];
      try {
        const message = await provider.read(ref);
        // Never evaluate body predicates on a truncated body as if it were complete.
        requireValue(!message.truncated || !definition.conditions.some(c => c.field === 'text'), 'RULE_BODY_TRUNCATED');
        const matches = matchesRule(definition, message);
        if (!matches || args.preview) { results.push({ reference: ref, matches, applied: false }); continue; }
        await beforeMutation();
        for (const labelId of definition.actions.labels) {
          await this.assign({ mailboxId: args.mailboxId, labelId, message: ref, assigned: true });
          completed.push(`label:${labelId}`);
        }
        const { seen, flagged, destination } = definition.actions;
        if (seen !== undefined || flagged !== undefined) { await provider.flags(ref, { seen, flagged }); completed.push('flags'); }
        let moved = null;
        if (destination && destination !== ref.folder) {
          moved = await provider.move(ref, destination);
          completed.push('move');
          await this.moved(args.mailboxId, ref, moved.reference);
        }
        results.push({ reference: moved?.reference ?? ref, matches: true, applied: true, completed,
          refreshRequired: !!moved && !moved.reference });
      } catch (error) { results.push({ reference: ref, applied: false, completed, error: safeError(error) }); }
    }
    return { storage: 'connector', preview: args.preview, results };
  }
}
