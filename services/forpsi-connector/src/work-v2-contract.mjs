import { createHash } from 'node:crypto';
import { z } from 'zod';
import { requireValue } from './errors.mjs';

export const workContractVersion='work-items.v2.2';
export const resolverVersion='work-resolver.v2.2.1';
export const attentionVersion='mail-brain-attention.v2.2';
export const stableJson=value=>JSON.stringify(value,(_,v)=>v&&typeof v==='object'&&!Array.isArray(v)
  ?Object.fromEntries(Object.entries(v).sort(([a],[b])=>a.localeCompare(b))):v);
export const workHash=value=>createHash('sha256').update(typeof value==='string'?value:stableJson(value)).digest('hex');
export const stableId=(kind,...values)=>`${kind}_${workHash(values).slice(0,40)}`;
// An address reference identifies a correspondent, never a principal or a permission.
export const correspondentId=(tenantId,address)=>stableId('correspondent',tenantId,address.toLowerCase());
const key=z.string().min(1).max(160);
export const entitySchema=z.object({kind:z.enum(['person','team','organization','external','unknown']),
  id:key.nullable(),label:z.string().max(240),address:z.email().nullable()}).strict();
export const unknownEntity=()=>({kind:'unknown',id:null,label:'Neurčený vlastník',address:null});
export const dateValueSchema=z.object({kind:z.literal('date'),value:z.iso.date(),
  timeZone:z.literal('Europe/Prague')}).strict();
export const conditionSchema=z.object({kind:z.enum(['none','after_completion','after_response',
  'document_received','explicit_condition','unknown']),dependsOnWorkItemIds:z.array(key).max(20),
  requiredResult:z.enum(['any','positive']).default('any'),description:z.string().max(500),
  documentKey:key.nullable(),counterpartyId:key.nullable(),
  onDependencyCancelled:z.literal('block_and_review').default('block_and_review')}).strict();
export const noCondition=()=>conditionSchema.parse({kind:'none',dependsOnWorkItemIds:[],
  description:'',documentKey:null,counterpartyId:null});
export const categories=['audit','receipt','invoice','contract','newsletter','marketing','summary','other','unknown'];
export const eventKinds=['requested','promised','delegated','accepted','completed','cancelled',
  'replaced','due_changed','due_removed','offered','delivered','informed','created_manually','reopened','overridden'];
export const eventCapability={requested:'request_work',promised:'promise_self',delegated:'delegate_work',
  accepted:'accept_work',completed:'complete_work',cancelled:'cancel_work',replaced:'replace_work',
  due_changed:'change_due',due_removed:'change_due',offered:'offer_work',delivered:'confirm_delivery',
  informed:'inform',created_manually:'create_work',reopened:'reopen_work',overridden:'override_work'};
export const evidenceSchema=z.object({messageId:key,scope:z.enum(['authored_text','subject',
  'quoted_history','attachment_metadata']),quote:z.string().min(1).max(500),
  start:z.number().int().nonnegative(),end:z.number().int().positive(),
  sourceHash:z.string().regex(/^[a-f0-9]{64}$/),sourceLevel:z.enum(['1','2','3','unknown'])}).strict();
export const propertyNames=['actor','owner','counterparty','action','category','dueDate','condition','result','existence'];
export const payloadSchema=z.object({actor:entitySchema.optional(),owner:entitySchema.optional(),
  counterparty:entitySchema.optional(),action:z.string().min(1).max(500).optional(),
  category:z.enum(categories).optional(),dueDate:dateValueSchema.nullable().optional(),
  condition:conditionSchema.optional(),result:z.enum(['positive','negative','unspecified']).optional(),
  retainDue:z.boolean().optional(),releaseProtection:z.boolean().optional(),
  property:z.enum(['owner','action','category','dueDate','condition']).optional(),
  operation:z.enum(['set','release']).optional(),replacementWorkItemId:key.optional(),
  acceptanceKind:z.enum(['assignment','offer']).optional(),
  requiresDecision:z.boolean().optional()}).strict();
export const eventSchema=z.object({id:key,logicalEventId:key,workItemId:key,caseId:key,tenantId:key,
  kind:z.enum(eventKinds),at:z.number().int().nonnegative(),sequence:z.number().int().nonnegative().default(0),sourceMessageId:key.nullable(),
  sourceActId:key,taskSlotId:key,sourceLevel:z.enum(['1','2','3','unknown']),
  payload:payloadSchema,factBindings:z.partialRecord(z.enum(propertyNames),z.array(key).max(10)),
  readRequirements:z.array(key).min(1).max(40),manual:z.boolean().default(false),note:z.string().max(500).default('')}).strict();
export const factSchema=z.object({id:key,tenantId:key,caseId:key,workItemId:key,
  property:z.enum(propertyNames),value:z.unknown(),evidence:z.array(evidenceSchema).max(10),
  validation:z.enum(['valid','context_only','invalid']),supersedesFactId:key.nullable()}).strict().superRefine((fact,ctx)=>{
    const schema=fact.property==='existence'?z.boolean():payloadSchema.shape[fact.property];
    if(!schema?.safeParse(fact.value).success)ctx.addIssue({code:'custom',path:['value'],message:'Invalid typed fact'});
  });
export const decisionSchema=z.object({id:key,eventId:key,outcome:z.enum(['accepted','rejected','disputed','superseded']),
  acceptedFactIds:z.array(key),replacesDecisionIds:z.array(key),reviewerId:key,
  semanticBasis:z.enum(['human_review','approved_parser']),policyId:key,policyVersion:key,
  authorization:z.object({outcome:z.enum(['allow','deny','unknown']),capability:key,
    actorId:key,workItemId:key}).strict(),at:z.number().int().nonnegative()}).strict();
export const identityDecisionSchema=z.object({id:key,tenantId:key,caseId:key,
  eventId:key,sourceActIds:z.array(key).min(1),taskSlotIds:z.array(key).min(1),
  relation:z.enum(['same_work','distinct_work']),canonicalWorkItemId:key,relatedWorkItemIds:z.array(key),
  replacedEventIds:z.array(key),manualEventIds:z.array(key),manualBinding:z.enum(['retain','release']).nullable(),
  reviewerId:key,expectedRevision:z.number().int().nonnegative(),at:z.number().int().nonnegative(),
  readRequirements:z.array(key).min(1)}).strict();
export const signalSchema=z.object({id:key,tenantId:key,caseId:key,
  kind:z.enum(['notification','conditional_notice','source_gap','proposal_review']),
  status:z.enum(['active','resolved']),text:z.string().min(1).max(500),category:z.enum(categories),
  sourceMessageId:key.nullable(),at:z.number().int().nonnegative(),
  evidence:z.array(evidenceSchema).max(20),readRequirements:z.array(key).min(1).max(40),
  grouping:z.object({system:key,vehicle:key,at:z.number().int(),
    timeBasis:z.enum(['event_time','received_at'])}).strict().nullable(),
  reportedDates:z.array(dateValueSchema).max(10)}).strict();

// Offsets address the persisted normalized field. Quoted text never becomes an act.
export function validateEvidence(ref,sources,{property,eventKind}={}) {
  const parsed=evidenceSchema.safeParse(ref);if(!parsed.success)return 'invalid';
  const r=parsed.data,s=sources.find(x=>x.id===r.messageId);
  if(!s||s.content_hash!==r.sourceHash)return 'invalid';
  const source=r.scope==='authored_text'?s.authored_text:r.scope==='subject'?s.subject:
    r.scope==='quoted_history'?s.body_text:null;
  if(typeof source!=='string'||r.end<=r.start||source.slice(r.start,r.end)!==r.quote)return 'invalid';
  if(r.scope==='quoted_history'||r.scope==='attachment_metadata'||r.sourceLevel==='unknown')return 'context_only';
  if(r.sourceLevel==='3'&&!['category'].includes(property)&&eventKind!=='informed')return 'context_only';
  // A subject may supply the date of an independently admitted act, never its existence/owner.
  if(r.scope==='subject'&&!['dueDate','category'].includes(property))return 'context_only';
  return 'valid';
}

export function dateIsSupported(date,evidence) {
  if(!dateValueSchema.safeParse(date).success)return false;
  const [year,month,day]=date.value.split('-').map(Number);
  return evidence.some(ref=>ref.quote.includes(date.value)||
    new RegExp(`\\b${day}\\.\\s*${month}\\.\\s*${year}\\b`,'u').test(ref.quote));
}

export function sourceSegments(message) {
  const text=message.authored_text??'',segments=[];
  // Versioned, server-defined paragraph/sentence anchors; neither summaries nor owner/date enter IDs.
  for(const match of text.matchAll(/[^\n.!?]+(?:[.!?]+(?=\s|$)|(?=\n|$))/gu)){
    const start=match.index+match[0].search(/\S/u),quote=match[0].trim();
    if(!quote)continue;
    segments.push({id:stableId('act',message.id,message.content_hash,'segments.v1',start),
      start,end:start+quote.length,text:quote});
  }
  return segments;
}

export function effectiveDecisions(decisions) {
  const replaced=new Set(decisions.flatMap(d=>d.replacesDecisionIds));
  return decisions.filter(d=>!replaced.has(d.id));
}

export function validateDecisionGraph(decisions,events,facts) {
  const ids=new Set(),byId=new Map(decisions.map(d=>[d.id,d]));
  for(const raw of decisions){const d=decisionSchema.parse(raw);
    requireValue(!ids.has(d.id),'WORK_DUPLICATE_DECISION');ids.add(d.id);
    const event=events.find(e=>e.id===d.eventId);requireValue(event,'WORK_EVENT_NOT_FOUND');
    requireValue(d.authorization.workItemId===event.workItemId&&
      d.authorization.capability===eventCapability[event.kind],'WORK_AUTHORITY_MISMATCH');
    for(const target of d.replacesDecisionIds){
      requireValue(byId.has(target)&&byId.get(target).eventId===d.eventId,'WORK_DECISION_REPLACEMENT_INVALID');
      const visit=(id,seen=new Set())=>{requireValue(!seen.has(id),'WORK_DECISION_CYCLE');
        for(const next of byId.get(id)?.replacesDecisionIds??[])visit(next,new Set([...seen,id]));};visit(d.id);
    }
    for(const id of d.acceptedFactIds){const f=facts.find(f=>f.id===id);
      requireValue(f&&f.tenantId===event.tenantId&&f.caseId===event.caseId&&f.workItemId===event.workItemId&&
        event.factBindings[f.property]?.includes(id),
        'WORK_FACT_SCOPE_MISMATCH');}
  }
}
