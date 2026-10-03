import { z } from 'zod';
import { id } from './schemas.mjs';
import { categories,payloadSchema } from './work-v2-contract.mjs';
import { extractionSchema } from './work-v2-extraction.mjs';
export const workAttentionSchema=z.object({version:z.literal('2.2'),mailboxId:id.optional(),
  limit:z.number().int().min(1).max(50).default(20),cursor:z.string().max(200).optional(),
  includeHistory:z.boolean().optional(),includeDismissed:z.boolean().optional(),hideSnoozed:z.boolean().optional(),
  category:z.enum(categories).optional(),section:z.enum(['todo','decision','waiting','information','review']).optional()}).strict();
const key=z.string().min(1).max(160);
export const workSchemas={
  attention:workAttentionSchema,
  case:z.object({caseId:z.string().uuid(),version:z.literal('2.2')}).strict(),
  refresh:z.object({caseId:z.string().uuid()}).strict(),
  analysisQueue:z.object({mailboxId:id.optional(),limit:z.number().int().min(1).max(10).default(5),
    afterCaseId:z.string().uuid().optional()}).strict(),
  prepareAnalysis:z.object({caseId:z.string().uuid()}).strict(),
  submitAnalysis:z.object({caseId:z.string().uuid(),analysisToken:z.string().min(1).max(4096),
    analysis:extractionSchema}).strict(),
  review:z.object({caseId:z.string().uuid(),revision:z.number().int().nonnegative(),eventId:key,
    outcome:z.enum(['accepted','rejected','disputed']),authorityConfirmed:z.boolean().default(false),
    replacesEventIds:z.array(key).max(24).default([]),canonicalWorkItemId:key.optional(),
    identityRelation:z.enum(['same_work','distinct_work']).optional(),
    manualBinding:z.enum(['retain','release']).optional()}).strict(),
  action:z.object({caseId:z.string().uuid(),revision:z.number().int().nonnegative(),requestId:z.string().uuid(),
    scope:z.enum(['personal','shared']),action:z.enum(['snooze','unsnooze','acknowledge','dismiss','restore_signal',
      'resolve_signal','reopen_signal','condition_evaluated','created_manually','completed','cancelled',
      'reopened','due_changed','due_removed','delegated','overridden','accepted','replaced','close_case']),
    targetId:key.optional(),payload:payloadSchema.optional(),until:z.number().int().optional(),
    conditionEvaluation:z.object({result:z.enum(['satisfied','failed','unknown']),
      contentConfirmed:z.boolean(),messageId:z.string().uuid().optional(),attachmentId:z.string().uuid().optional(),
      relevantResponse:z.boolean().optional()}).strict().optional(),
    note:z.string().max(500).default('')}).strict(),
};
