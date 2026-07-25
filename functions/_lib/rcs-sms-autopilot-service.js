import {
  customerMessagingStatus,
  sendCustomerMessage
} from "./customer-messaging-service.js";
import { addCustomerMessageOptOut } from "./customer-message-store.js";
import {
  classifyRcsSmsMessage,
  rcsSmsAutopilotOpenAiStatus
} from "./rcs-sms-autopilot-openai.js";
import {
  appendRcsSmsEvent,
  getRcsSmsRuntimeConfig,
  getRcsSmsMessageForProcessing,
  ingestRcsSmsInbound,
  insertRcsSmsOutboundMessage,
  listRcsSmsMessageHistory,
  listRcsSmsRetryCandidates,
  rcsSmsAutopilotOperationalStatus,
  setRcsSmsConversationState,
  setRcsSmsMessageState
} from "./rcs-sms-autopilot-store.js";
import { executeRcsSmsAutopilotTool } from "./rcs-sms-autopilot-tools.js";
import { getAuditDatabase, getCoreDatabase } from "./databases.js";

const MODULE_KEY = "rcs-sms-autopilot";
const RUNNER_NAME = "rcs-sms-autopilot-retry-5m";
const RULE_ID = "rcs-sms-autopilot-retry-runner";
const ASYNC_RULE_ID = "rcs-sms-autopilot-async-processing";
const TIME_ZONE = "Europe/Prague";
const RETRY_CRON = "*/5 * * * *";
const TERMINAL_MESSAGE_STATUSES = new Set([
  "blocked",
  "closed",
  "duplicate",
  "replied",
  "review_ready",
  "autopilot_disabled",
  "human_takeover",
  "awaiting_confirmation",
  "awaiting_field"
]);
function cleanString(value) {
  return String(value ?? "").trim();
}

function randomId(prefix) {
  const suffix = globalThis.crypto?.randomUUID
    ? globalThis.crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  return `${prefix}-${suffix}`;
}

function modeFromEnv(env = {}) {
  const mode = cleanString(env.RCS_SMS_AUTOPILOT_MODE || "off").toLowerCase();
  return ["off", "review", "live"].includes(mode) ? mode : "off";
}

function effectiveModeFromRuntime(env = {}, runtimeConfig = {}) {
  const configuredMode = modeFromEnv(env);
  if (configuredMode === "off" || runtimeConfig.autopilotEnabled !== true) return "off";
  if (configuredMode === "review" || runtimeConfig.outboundEnabled !== true) return "review";
  return "live";
}

async function automationRuleActive(env, ruleId) {
  const db = getCoreDatabase(env, { required: false });
  if (!db) return false;
  try {
    const row = await db.prepare(`
      SELECT status, is_automation
      FROM module_rules
      WHERE module_key = ? AND id = ?
      LIMIT 1
    `).bind(MODULE_KEY, cleanString(ruleId)).first();
    return row?.status === "active" && Boolean(Number(row.is_automation || 0));
  } catch {
    return false;
  }
}

function normalizedText(value) {
  return cleanString(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[.!?,;:]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function isRcsSmsStopMessage(value) {
  return /^(stop|stop sms|konec|odhlasit|odhlasit me|nechci|neposilat|neposilat sms)$/.test(normalizedText(value));
}

export function hasImmediateDanger(value) {
  const text = normalizedText(value);
  if (!text) return false;
  return /\b(hori|pozar|unik plynu|vybuch|nehoda|srazka|zranen|krvaci|bezvedomi|ohrozeni zivota|okamzite nebezpeci|volam hasice|volejte zachranku)\b/.test(text);
}

function nextRetryAt(attempts) {
  const minutes = Math.min(5 * (2 ** Math.max(0, Number(attempts || 1) - 1)), 60);
  return new Date(Date.now() + minutes * 60 * 1000).toISOString();
}

function humanReply(context = {}) {
  return context.senderType === "employee"
    ? "Rozumím. Předala jsem zprávu člověku k vyřízení."
    : "Děkujeme. Zprávu jsme předali pracovníkovi Kaiser servisu k vyřízení.";
}

function emptyMessageReply(context = {}) {
  return context.senderType === "employee"
    ? "Pošli mi prosím jednou krátkou větou, co potřebuješ vyřešit."
    : "Prosíme, napište jednou krátkou větou, co potřebujete vyřešit.";
}

function confirmationReply(context = {}) {
  return context.senderType === "employee"
    ? "Tato akce čeká na potvrzení oprávněným uživatelem v KSO."
    : "Požadavek jsme předali oprávněnému pracovníkovi k potvrzení.";
}

function toolSuccessReply(toolName, context = {}, fallback = "") {
  const employee = context.senderType === "employee";
  const replies = {
    request_callback: employee
      ? "Žádost o zavolání jsem uložila."
      : "Žádost o zpětné zavolání jsme přijali.",
    create_missed_collection_report: employee
      ? "Hlášení neprovedeného svozu jsem uložila k vyřízení."
      : "Hlášení neprovedeného svozu jsme přijali k vyřízení.",
    create_customer_request: employee
      ? "Požadavek jsem uložila k vyřízení."
      : "Váš požadavek jsme přijali k vyřízení.",
    create_vehicle_report: "Hlášení závady jsem uložila k vyřízení.",
    accept_task: "Potvrzení přijetí úkolu jsem uložila.",
    decline_task: "Odmítnutí úkolu jsem uložila k vyřízení.",
    add_task_note: "Poznámku k úkolu jsem uložila."
  };
  return replies[toolName] || cleanString(fallback);
}

async function sendAutopilotReply(env, { message, context, text, intent }) {
  const replyText = cleanString(text);
  if (!replyText) return { sent: false, status: "skipped", errorMessage: "Prázdná odpověď." };
  const result = await sendCustomerMessage(env, {
    phone: context.phone,
    template: "autopilot_reply",
    variables: { replyText },
    channelPreference: message.channel,
    customerId: context.customerId,
    relatedEntityType: context.relatedEntityType || "rcs_sms_conversation",
    relatedEntityId: context.relatedEntityId || message.conversationId,
    reason: "provozní odpověď na příchozí RCS/SMS požadavek",
    legalBasis: "odpověď na příchozí provozní požadavek",
    consent: true,
    dedupeWindowSeconds: 60
  });
  await insertRcsSmsOutboundMessage(env, {
    conversationId: message.conversationId,
    channel: message.channel,
    twilioMessageSid: result.twilioMessageSid,
    body: result.messageBody || replyText,
    status: result.sent ? (result.status || "pending") : (result.status || "blocked"),
    intent
  });
  await appendRcsSmsEvent(env, {
    conversationId: message.conversationId,
    messageId: message.id,
    eventType: "reply_dispatch",
    status: result.sent ? "provider_accepted" : (result.status || "blocked"),
    detail: result.sent
      ? "Odpověď Autopilota byla předaná stávající zákaznické messaging vrstvě."
      : "Odpověď Autopilota nebyla odeslaná.",
    metadata: {
      twilioMessageSid: cleanString(result.twilioMessageSid),
      providerStatus: cleanString(result.status),
      errorMessage: cleanString(result.errorMessage)
    }
  });
  return result;
}

async function stopBeforeAi(env, record, mode) {
  const { message, context } = record;
  if (cleanString(context.phone)) {
    await addCustomerMessageOptOut(env, {
      phone: context.phone,
      source: "rcs_sms_autopilot",
      reason: cleanString(message.body || "STOP")
    });
  }
  await setRcsSmsMessageState(env, message.id, {
    status: "blocked",
    senderType: "opted_out",
    intent: "unsubscribe",
    confidence: 1,
    responseMode: "none",
    requestedTool: "unsubscribe_contact",
    requiresHuman: false,
    reason: "Pevné STOP pravidlo před OpenAI.",
    processed: true
  });
  await setRcsSmsConversationState(env, message.conversationId, {
    status: "blocked",
    contactType: "opted_out",
    consentStatus: "opted_out",
    humanTakeover: false,
    openIntent: "unsubscribe",
    awaitingField: ""
  });
  await appendRcsSmsEvent(env, {
    conversationId: message.conversationId,
    messageId: message.id,
    eventType: "fixed_rule_stop",
    status: "blocked",
    detail: "STOP odpověď byla zpracovaná bez OpenAI.",
    metadata: { mode, phoneStoredAsOptOut: true }
  });
  return { status: "blocked", fixedRule: "stop", context };
}

async function dangerBeforeAi(env, record, mode) {
  const { message, context } = record;
  await setRcsSmsMessageState(env, message.id, {
    status: "human_takeover",
    intent: "human_handoff",
    confidence: 1,
    responseMode: "human",
    requestedTool: "handoff_to_human",
    requiresHuman: true,
    reason: "Pevné bezpečnostní pravidlo: možné bezprostřední nebezpečí.",
    processed: true
  });
  await setRcsSmsConversationState(env, message.conversationId, {
    status: "human_takeover",
    humanTakeover: true,
    openIntent: "immediate_danger",
    awaitingField: ""
  });
  await appendRcsSmsEvent(env, {
    conversationId: message.conversationId,
    messageId: message.id,
    eventType: "fixed_rule_immediate_danger",
    status: "human_takeover",
    detail: "Zpráva byla bez OpenAI předaná člověku kvůli možnému bezprostřednímu nebezpečí.",
    metadata: { mode, automaticOperationalTool: false }
  });
  return { status: "human_takeover", fixedRule: "immediate_danger", context };
}

async function blankBeforeAi(env, record, mode, { replyAllowed = false } = {}) {
  const { message, context } = record;
  const replyText = emptyMessageReply(context);
  let reply = { sent: false, status: "not_sent" };
  if (replyAllowed) {
    reply = await sendAutopilotReply(env, {
      message,
      context,
      text: replyText,
      intent: "unclear"
    });
  }
  await setRcsSmsMessageState(env, message.id, {
    status: replyAllowed && reply.sent ? "replied" : "awaiting_field",
    intent: "unclear",
    confidence: 1,
    responseMode: replyAllowed ? "automatic" : "none",
    replyText,
    requestedTool: "none",
    requiresHuman: false,
    reason: "Pevné pravidlo pro prázdnou zprávu nebo samotnou přílohu.",
    processed: true
  });
  await setRcsSmsConversationState(env, message.conversationId, {
    status: "awaiting_field",
    humanTakeover: false,
    openIntent: "unclear",
    awaitingField: "short_description"
  });
  await appendRcsSmsEvent(env, {
    conversationId: message.conversationId,
    messageId: message.id,
    eventType: "fixed_rule_empty_message",
    status: replyAllowed && reply.sent ? "replied" : "awaiting_field",
    detail: "Prázdná zpráva nebo samotná příloha byla zpracovaná bez OpenAI.",
    metadata: { mode, replyAllowed, replySent: reply.sent === true }
  });
  return { status: "awaiting_field", fixedRule: "empty_message", reply };
}

export async function processRcsSmsAutopilotMessage(env, messageId, options = {}) {
  const runtimeConfig = await getRcsSmsRuntimeConfig(env);
  const mode = effectiveModeFromRuntime(env, runtimeConfig);
  const record = await getRcsSmsMessageForProcessing(env, messageId);
  const { message, context } = record;
  if (TERMINAL_MESSAGE_STATUSES.has(message.status) && options.force !== true) {
    return { status: message.status, duplicate: true, messageId: message.id };
  }

  await setRcsSmsMessageState(env, message.id, {
    status: "processing",
    incrementAttempts: true,
    nextRetryAt: "",
    errorCode: "",
    errorMessage: ""
  });
  await setRcsSmsConversationState(env, message.conversationId, {
    status: "ai_processing",
    openIntent: context.openIntent || "",
    awaitingField: ""
  });

  if (isRcsSmsStopMessage(message.body)) return stopBeforeAi(env, record, mode);
  if (hasImmediateDanger(message.body)) return dangerBeforeAi(env, record, mode);
  const asyncActive = mode !== "off" && await automationRuleActive(env, ASYNC_RULE_ID);
  if (!cleanString(message.body)) {
    return blankBeforeAi(env, record, mode, {
      replyAllowed: mode === "live" && asyncActive
    });
  }
  if (context.senderType === "opted_out") return stopBeforeAi(env, record, mode);
  if (context.humanTakeover) {
    await setRcsSmsMessageState(env, message.id, {
      status: "human_takeover",
      responseMode: "human",
      requestedTool: "handoff_to_human",
      requiresHuman: true,
      reason: "Konverzaci už převzal člověk.",
      processed: true
    });
    return { status: "human_takeover", existingTakeover: true };
  }

  if (mode === "off") {
    await setRcsSmsMessageState(env, message.id, {
      status: "autopilot_disabled",
      responseMode: "none",
      requestedTool: "none",
      requiresHuman: false,
      reason: "RCS_SMS_AUTOPILOT_MODE je vypnutý.",
      processed: true
    });
    await setRcsSmsConversationState(env, message.conversationId, {
      status: "open",
      humanTakeover: false
    });
    await appendRcsSmsEvent(env, {
      conversationId: message.conversationId,
      messageId: message.id,
      eventType: "autopilot_disabled",
      status: "skipped",
      detail: "Autopilot je vypnutý. OpenAI, nástroje ani odpověď nebyly spuštěné.",
      metadata: { mode }
    });
    return { status: "autopilot_disabled", mode };
  }
  if (!asyncActive) {
    await setRcsSmsMessageState(env, message.id, {
      status: "autopilot_disabled",
      responseMode: "none",
      requestedTool: "none",
      requiresHuman: false,
      reason: "Asynchronní automatizace Autopilota není aktivní.",
      processed: true
    });
    await setRcsSmsConversationState(env, message.conversationId, {
      status: "open",
      humanTakeover: false
    });
    await appendRcsSmsEvent(env, {
      conversationId: message.conversationId,
      messageId: message.id,
      eventType: "autopilot_automation_inactive",
      status: "skipped",
      detail: "Režim ENV není off, ale asynchronní automatizace není aktivní; OpenAI, nástroje ani odpověď nebyly spuštěné.",
      metadata: { mode, ruleId: ASYNC_RULE_ID }
    });
    return { status: "autopilot_disabled", mode, automationActive: false };
  }

  try {
    const history = await listRcsSmsMessageHistory(env, message.conversationId, 10);
    const ai = await classifyRcsSmsMessage(env, {
      message: {
        body: message.body,
        channel: message.channel,
        mediaCount: message.media.length
      },
      context,
      history
    }, options);
    let plan = ai.plan;

    if (context.senderType === "unknown") {
      plan = {
        ...plan,
        responseMode: "human",
        requestedTool: {
          name: "handoff_to_human",
          arguments: { reason: cleanString(plan.reason || "Neověřená identita.") }
        },
        requiresHuman: true,
        reason: cleanString(plan.reason) || "Neověřená identita vyžaduje předání člověku."
      };
    }

    if (mode === "review") {
      await setRcsSmsMessageState(env, message.id, {
        status: "review_ready",
        senderType: context.senderType,
        intent: plan.intent,
        confidence: plan.confidence,
        responseMode: "human",
        replyText: plan.replyText,
        requestedTool: plan.requestedTool.name,
        toolArguments: plan.requestedTool.arguments,
        requiresHuman: true,
        reason: "Review režim: návrh nebyl proveden ani odeslán.",
        openAiResponseId: ai.responseId,
        openAiModel: ai.model,
        processed: true
      });
      await setRcsSmsConversationState(env, message.conversationId, {
        status: "human_takeover",
        humanTakeover: true,
        openIntent: plan.intent
      });
      await appendRcsSmsEvent(env, {
        conversationId: message.conversationId,
        messageId: message.id,
        eventType: "openai_plan_review_ready",
        status: "review_ready",
        detail: "OpenAI návrh je uložený pro člověka; nástroj ani odpověď nebyly spuštěné.",
        metadata: {
          responseId: ai.responseId,
          model: ai.model,
          intent: plan.intent,
          requestedTool: plan.requestedTool.name
        }
      });
      return { status: "review_ready", mode, plan };
    }

    if (plan.requiresHuman || plan.responseMode === "human") {
      plan = {
        ...plan,
        requestedTool: {
          name: "handoff_to_human",
          arguments: { reason: cleanString(plan.reason || "Vyžaduje lidské posouzení.") }
        }
      };
    }

    const tool = await executeRcsSmsAutopilotTool(env, {
      conversationId: message.conversationId,
      messageId: message.id,
      toolName: plan.requestedTool.name,
      arguments: plan.requestedTool.arguments,
      intent: plan.intent,
      context
    });

    const requiresHuman = plan.requiresHuman || tool.requiresHuman === true;
    const awaitingConfirmation = tool.status === "awaiting_confirmation";
    const finalReplyText = requiresHuman
      ? (awaitingConfirmation ? confirmationReply(context) : humanReply(context))
      : toolSuccessReply(plan.requestedTool.name, context, plan.replyText);
    let reply = { sent: false, status: "skipped" };
    if (finalReplyText) {
      reply = await sendAutopilotReply(env, {
        message,
        context,
        text: finalReplyText,
        intent: plan.intent
      });
    }

    const messageStatus = awaitingConfirmation
      ? "awaiting_confirmation"
      : requiresHuman
        ? "human_takeover"
        : reply.sent
          ? "replied"
          : "processing_failed";
    const conversationStatus = awaitingConfirmation
      ? "awaiting_confirmation"
      : requiresHuman
        ? "human_takeover"
        : reply.sent
          ? (plan.responseMode === "confirmation" ? "awaiting_confirmation" : "open")
          : "error";

    await setRcsSmsMessageState(env, message.id, {
      status: messageStatus,
      senderType: context.senderType,
      intent: plan.intent,
      confidence: plan.confidence,
      responseMode: requiresHuman ? "human" : plan.responseMode,
      replyText: finalReplyText,
      requestedTool: plan.requestedTool.name,
      toolArguments: plan.requestedTool.arguments,
      requiresHuman,
      reason: plan.reason,
      openAiResponseId: ai.responseId,
      openAiModel: ai.model,
      nextRetryAt: messageStatus === "processing_failed" ? nextRetryAt(message.processingAttempts + 1) : "",
      errorCode: reply.sent || requiresHuman || awaitingConfirmation ? "" : "reply_not_sent",
      errorMessage: reply.sent || requiresHuman || awaitingConfirmation
        ? ""
        : cleanString(reply.errorMessage || "Odpověď nebyla přijatá messaging vrstvou."),
      processed: messageStatus !== "processing_failed"
    });
    await setRcsSmsConversationState(env, message.conversationId, {
      status: conversationStatus,
      humanTakeover: requiresHuman && !awaitingConfirmation,
      openIntent: plan.intent,
      awaitingField: awaitingConfirmation ? "authenticated_kso_confirmation" : ""
    });
    return {
      status: messageStatus,
      mode,
      plan,
      tool,
      reply
    };
  } catch (error) {
    const attempts = message.processingAttempts + 1;
    const terminal = attempts >= 3;
    await setRcsSmsMessageState(env, message.id, {
      status: terminal ? "human_takeover" : "processing_failed",
      responseMode: terminal ? "human" : "none",
      requiresHuman: terminal,
      reason: terminal ? "Zpracování třikrát selhalo a bylo předané člověku." : "",
      nextRetryAt: terminal ? "" : nextRetryAt(attempts),
      errorCode: cleanString(error.code || "rcs_sms_processing_failed"),
      errorMessage: cleanString(error.message).slice(0, 500),
      processed: terminal
    });
    await setRcsSmsConversationState(env, message.conversationId, {
      status: terminal ? "human_takeover" : "error",
      humanTakeover: terminal,
      openIntent: terminal ? "human_handoff" : ""
    });
    await appendRcsSmsEvent(env, {
      conversationId: message.conversationId,
      messageId: message.id,
      eventType: "processing_failed",
      status: terminal ? "human_takeover" : "retry_scheduled",
      detail: terminal
        ? "Zpracování třikrát selhalo a konverzace byla předaná člověku."
        : "Zpracování selhalo; uložená zpráva čeká na cloudový retry.",
      metadata: {
        errorCode: cleanString(error.code || "rcs_sms_processing_failed"),
        attempts,
        nextRetryAt: terminal ? "" : nextRetryAt(attempts)
      }
    });
    return {
      status: terminal ? "human_takeover" : "processing_failed",
      errorCode: cleanString(error.code || "rcs_sms_processing_failed"),
      retryScheduled: !terminal
    };
  }
}

export async function ingestAndScheduleRcsSmsAutopilot(env, payload, waitUntil) {
  const result = await ingestRcsSmsInbound(env, payload);
  if (result.duplicate) {
    await appendRcsSmsEvent(env, {
      conversationId: result.conversationId,
      messageId: result.message?.id,
      eventType: "duplicate_webhook_ignored",
      status: "duplicate",
      detail: "Duplicitní Twilio webhook byl ignorovaný.",
      metadata: { twilioMessageSid: cleanString(result.message?.twilioMessageSid) }
    });
    return { ...result, scheduled: false };
  }
  if (typeof waitUntil === "function") {
    waitUntil(processRcsSmsAutopilotMessage(env, result.message.id).catch((error) => {
      console.error("rcs_sms_autopilot.wait_until_failed", {
        messageId: result.message.id,
        message: cleanString(error?.message).slice(0, 300)
      });
    }));
    return { ...result, scheduled: true };
  }
  return { ...result, scheduled: false };
}

async function insertRunnerRun(db, run) {
  await db.prepare(`
    INSERT INTO module_automation_runner_runs (
      id, module_key, runner_name, started_at, scheduled_at, finished_at,
      triggered_by, status, rules_total, dry_run_count, skipped_count,
      failed_count, message, error_code, d1_binding, database_name, cron,
      time_zone, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(
    run.id,
    MODULE_KEY,
    RUNNER_NAME,
    run.startedAt,
    run.scheduledAt,
    run.finishedAt,
    run.triggeredBy,
    run.status,
    1,
    run.dryRunCount,
    run.skippedCount,
    run.failedCount,
    run.message,
    run.errorCode || null,
    "DB_AUDIT",
    "SMART_ODPADY_AUDIT",
    RETRY_CRON,
    TIME_ZONE,
    run.startedAt
  ).run();
}

async function insertAutomationRun(db, run) {
  await db.prepare(`
    INSERT OR IGNORE INTO module_automation_runs (
      id, rule_id, module_key, started_at, finished_at, status,
      message, error_code, triggered_by, dedupe_key
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(
    randomId("rcs-sms-automation"),
    RULE_ID,
    MODULE_KEY,
    run.startedAt,
    run.finishedAt,
    run.status,
    run.message,
    run.errorCode || null,
    run.triggeredBy,
    `rcs-sms-autopilot:${run.scheduledAt.slice(0, 16)}`
  ).run();
}

export async function runRcsSmsAutopilotRetry(env, options = {}) {
  const db = getAuditDatabase(env);
  const runtimeConfig = await getRcsSmsRuntimeConfig(env);
  const startedAt = new Date().toISOString();
  const mode = effectiveModeFromRuntime(env, runtimeConfig);
  const run = {
    id: randomId("rcs-sms-runner"),
    startedAt,
    scheduledAt: new Date(options.scheduledTime || Date.now()).toISOString(),
    finishedAt: "",
    triggeredBy: cleanString(options.triggeredBy || "cloudflare-cron"),
    status: "running",
    dryRunCount: 0,
    skippedCount: 0,
    failedCount: 0,
    processedCount: 0,
    message: "",
    errorCode: ""
  };

  if (mode === "off") {
    run.status = "skipped";
    run.skippedCount = 1;
    run.finishedAt = new Date().toISOString();
    run.message = "Autopilot je vypnutý; retry runner nic nezpracoval ani neodeslal.";
    await insertRunnerRun(db, run);
    await insertAutomationRun(db, run);
    return { ...run, mode };
  }
  if (!(await automationRuleActive(env, RULE_ID))) {
    run.status = "skipped";
    run.skippedCount = 1;
    run.finishedAt = new Date().toISOString();
    run.message = "Retry automatizace není aktivní; runner nic nezpracoval ani neodeslal.";
    await insertRunnerRun(db, run);
    await insertAutomationRun(db, run);
    return { ...run, mode, automationActive: false };
  }

  const candidates = await listRcsSmsRetryCandidates(env, 20);
  for (const messageId of candidates) {
    try {
      const result = await processRcsSmsAutopilotMessage(env, messageId, { force: true });
      if (result.status === "processing_failed") {
        run.failedCount += 1;
      } else {
        run.processedCount += 1;
      }
    } catch (error) {
      run.failedCount += 1;
      console.error("rcs_sms_autopilot.retry_item_failed", {
        messageId,
        message: cleanString(error?.message).slice(0, 300)
      });
    }
  }
  run.status = run.failedCount ? "partial" : "completed";
  run.finishedAt = new Date().toISOString();
  run.message = `Retry zkontroloval ${candidates.length} zpráv; dokončeno ${run.processedCount}, selhalo ${run.failedCount}.`;
  await insertRunnerRun(db, run);
  await insertAutomationRun(db, run);
  return { ...run, mode };
}

export async function rcsSmsAutopilotStatus(env) {
  const [operational, asyncActive, retryActive] = await Promise.all([
    rcsSmsAutopilotOperationalStatus(env),
    automationRuleActive(env, ASYNC_RULE_ID),
    automationRuleActive(env, RULE_ID)
  ]);
  const configuredMode = modeFromEnv(env);
  const mode = effectiveModeFromRuntime(env, operational.runtimeConfig);
  return {
    apiStatus: "ready",
    moduleKey: MODULE_KEY,
    mode,
    configuredMode,
    cloudProcessing: "Cloudflare Pages Functions waitUntil",
    asyncProcessing: {
      ruleId: ASYNC_RULE_ID,
      active: mode !== "off" && asyncActive
    },
    retryRunner: {
      runner: RUNNER_NAME,
      cron: RETRY_CRON,
      ruleId: RULE_ID,
      active: mode !== "off" && retryActive
    },
    openAi: rcsSmsAutopilotOpenAiStatus(env),
    twilio: customerMessagingStatus(env),
    permissionsSource: "KSO backend; telefon není zdroj oprávnění",
    outboundEffects: mode === "live" && asyncActive && operational.runtimeConfig?.outboundEnabled
      ? "enabled_with_server_gates"
      : "disabled",
    ...operational
  };
}

export const __test = {
  ASYNC_RULE_ID,
  RETRY_CRON,
  TERMINAL_MESSAGE_STATUSES,
  automationRuleActive,
  confirmationReply,
  emptyMessageReply,
  hasImmediateDanger,
  effectiveModeFromRuntime,
  humanReply,
  isRcsSmsStopMessage,
  modeFromEnv,
  nextRetryAt,
  toolSuccessReply
};
