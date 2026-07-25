import {
  RCS_SMS_TOOLS,
  validateRcsSmsToolArguments
} from "./rcs-sms-autopilot-openai.js";
import {
  appendRcsSmsEvent,
  createRcsSmsRequest,
  findRcsSmsActionGrant,
  findRcsSmsRequestByIdempotency,
  findRcsSmsToolRunByIdempotency,
  recordRcsSmsToolRun,
  setRcsSmsConversationState,
  setRcsSmsRequestStatus,
  useRcsSmsActionGrant
} from "./rcs-sms-autopilot-store.js";

const READ_ONLY_TOOLS = new Set([
  "none",
  "get_conversation_context",
  "get_user_context",
  "get_customer_context"
]);

const READ_TOOLS_REQUIRING_FUTURE_CONNECTOR = new Set([
  "get_collection_schedule",
  "get_open_tasks"
]);

const REQUEST_TOOLS = new Set([
  "create_missed_collection_report",
  "create_customer_request",
  "create_vehicle_report",
  "request_callback"
]);

const CUSTOMER_SCOPED_REQUEST_TOOLS = new Set([
  "create_missed_collection_report",
  "create_customer_request",
  "request_callback"
]);

const GRANT_REQUIRED_TOOLS = new Set([
  "accept_task",
  "decline_task",
  "add_task_note"
]);

const CONFIRMATION_REQUIRED_INTENTS = new Set([
  "change_date",
  "service_order"
]);

function cleanString(value) {
  return String(value ?? "").trim();
}

function toolIdempotencyKey(messageId, toolName) {
  return `rcs-sms:${cleanString(messageId)}:${cleanString(toolName)}:v1`;
}

function requestScopeVerified(toolName, args = {}, context = {}) {
  if (CUSTOMER_SCOPED_REQUEST_TOOLS.has(toolName)) {
    const requestedCustomerId = cleanString(args.customerId);
    const verifiedCustomerIds = new Set([
      cleanString(context.customerId),
      cleanString(context.lastOutboundCustomerId)
    ].filter(Boolean));
    return Boolean(requestedCustomerId && verifiedCustomerIds.has(requestedCustomerId));
  }
  if (toolName === "create_vehicle_report") {
    return ["vehicle", "fleet_vehicle"].includes(cleanString(context.relatedEntityType))
      && cleanString(args.vehicleId) === cleanString(context.relatedEntityId);
  }
  return true;
}

function taskReplyIdentityVerified(context = {}) {
  return context.senderType === "employee"
    && (
      !cleanString(context.lastOutboundUserId)
      || cleanString(context.lastOutboundUserId) === cleanString(context.userId)
    );
}

function publicContext(context = {}) {
  return {
    senderType: cleanString(context.senderType || "unknown"),
    userId: cleanString(context.userId),
    customerId: cleanString(context.customerId),
    relatedEntityType: cleanString(context.relatedEntityType),
    relatedEntityId: cleanString(context.relatedEntityId),
    hasOriginalOutbound: Boolean(context.lastOutboundMessageSid),
    hasActionGrant: context.hasActionGrant === true
  };
}

async function verifiedReadResult(env, toolName, args, context) {
  const db = env?.SMART_ODPADY_DB;
  if (toolName === "none" || toolName === "get_conversation_context") {
    return {
      verified: true,
      source: "rcs_sms_conversation",
      context: publicContext(context)
    };
  }
  if (!db) {
    return {
      verified: false,
      source: "SMART_ODPADY_DB",
      errorCode: "read_context_database_missing"
    };
  }
  if (toolName === "get_user_context") {
    const userId = cleanString(args.userId || context.userId);
    const row = userId
      ? await db.prepare(
        "SELECT id, name, role, status, active FROM users WHERE id = ? LIMIT 1"
      ).bind(userId).first()
      : null;
    return {
      verified: Boolean(row?.id && row.id === context.userId),
      source: "users",
      user: row?.id === context.userId ? {
        id: cleanString(row.id),
        name: cleanString(row.name),
        role: cleanString(row.role),
        status: cleanString(row.status),
        active: Boolean(Number(row.active || 0))
      } : null
    };
  }
  if (toolName === "get_customer_context") {
    const customerId = cleanString(args.customerId || context.customerId);
    const row = customerId
      ? await db.prepare(
        "SELECT id, company_name, automation_status FROM receivable_customers WHERE id = ? LIMIT 1"
      ).bind(customerId).first()
      : null;
    return {
      verified: Boolean(row?.id && row.id === context.customerId),
      source: "receivable_customers",
      customer: row?.id === context.customerId ? {
        id: cleanString(row.id),
        companyName: cleanString(row.company_name),
        automationStatus: cleanString(row.automation_status)
      } : null
    };
  }
  return { verified: false, source: "", errorCode: "read_context_not_supported" };
}

function requestSummary(toolName, args = {}, context = {}) {
  const detail = cleanString(args.note || args.reason);
  const labels = {
    create_missed_collection_report: "Hlášení neprovedeného svozu",
    create_customer_request: "Zákaznický požadavek",
    create_vehicle_report: "Hlášení závady vozidla",
    request_callback: "Žádost o zpětné zavolání",
    accept_task: "Potvrzení přijetí úkolu",
    decline_task: "Odmítnutí úkolu",
    add_task_note: "Poznámka k úkolu"
  };
  return [
    labels[toolName] || toolName,
    detail,
    context.contactName
  ].filter(Boolean).join(" · ").slice(0, 500);
}

async function recordResult(env, input, result) {
  const run = await recordRcsSmsToolRun(env, {
    conversationId: input.conversationId,
    messageId: input.messageId,
    toolName: input.toolName,
    arguments: input.arguments,
    executionMode: result.executionMode || "automatic",
    status: result.status,
    idempotencyKey: toolIdempotencyKey(input.messageId, input.toolName),
    result,
    errorCode: result.errorCode,
    errorMessage: result.errorMessage,
    actorType: "system"
  });
  await appendRcsSmsEvent(env, {
    conversationId: input.conversationId,
    messageId: input.messageId,
    eventType: "tool_evaluated",
    status: result.status,
    detail: `Nástroj ${input.toolName}: ${result.status}.`,
    metadata: {
      toolName: input.toolName,
      executionMode: result.executionMode || "automatic",
      duplicate: run.duplicate === true,
      errorCode: result.errorCode || ""
    }
  });
  return { ...result, runId: run.id, duplicate: run.duplicate === true };
}

export async function executeRcsSmsAutopilotTool(env, input = {}) {
  const toolName = cleanString(input.toolName || "none");
  const args = input.arguments && typeof input.arguments === "object" ? input.arguments : {};
  const context = input.context || {};
  const base = {
    conversationId: cleanString(input.conversationId),
    messageId: cleanString(input.messageId),
    toolName,
    arguments: args
  };
  const existingRun = await findRcsSmsToolRunByIdempotency(
    env,
    toolIdempotencyKey(base.messageId, base.toolName)
  );
  if (existingRun) {
    return {
      ...(existingRun.result || {}),
      runId: existingRun.id,
      duplicate: true
    };
  }

  if (!RCS_SMS_TOOLS.includes(toolName)) {
    return recordResult(env, base, {
      ok: false,
      status: "blocked",
      executionMode: "human",
      requiresHuman: true,
      errorCode: "tool_not_allowed",
      errorMessage: "Model navrhl nástroj mimo povolený seznam."
    });
  }

  const validatedArguments = validateRcsSmsToolArguments(toolName, args);
  if (!validatedArguments.ok) {
    return recordResult(env, base, {
      ok: false,
      status: "blocked",
      executionMode: "human",
      requiresHuman: true,
      errorCode: validatedArguments.errorCode,
      errorMessage: "Argumenty nástroje neodpovídají povolenému JSON schématu."
    });
  }
  base.arguments = validatedArguments.arguments;

  if (READ_ONLY_TOOLS.has(toolName)) {
    const result = await verifiedReadResult(env, toolName, validatedArguments.arguments, context);
    if (!result.verified && toolName !== "none") {
      return recordResult(env, base, {
        ok: false,
        status: "blocked",
        executionMode: "human",
        requiresHuman: true,
        errorCode: result.errorCode || "verified_context_not_found",
        errorMessage: "Požadovaný kontext se nepodařilo bezpečně ověřit.",
        source: result.source
      });
    }
    return recordResult(env, base, {
      ok: true,
      status: "completed",
      executionMode: "automatic",
      requiresHuman: false,
      readOnly: true,
      ...result
    });
  }

  if (READ_TOOLS_REQUIRING_FUTURE_CONNECTOR.has(toolName)) {
    return recordResult(env, base, {
      ok: false,
      status: "blocked",
      executionMode: "human",
      requiresHuman: true,
      errorCode: "verified_read_connector_unavailable",
      errorMessage: "Pro tento read-only dotaz zatím není zapojený ověřený produkční zdroj."
    });
  }

  if (toolName === "handoff_to_human") {
    await setRcsSmsConversationState(env, input.conversationId, {
      status: "human_takeover",
      humanTakeover: true,
      openIntent: cleanString(input.intent || "human_handoff")
    });
    return recordResult(env, base, {
      ok: true,
      status: "completed",
      executionMode: "automatic",
      requiresHuman: true,
      humanTakeover: true
    });
  }

  if (toolName === "unsubscribe_contact") {
    return recordResult(env, base, {
      ok: false,
      status: "blocked",
      executionMode: "human",
      requiresHuman: true,
      errorCode: "unsubscribe_requires_fixed_rule",
      errorMessage: "Odhlášení provádí pouze pevné STOP pravidlo před OpenAI."
    });
  }

  if (context.senderType === "unknown" || context.senderType === "opted_out") {
    await setRcsSmsConversationState(env, input.conversationId, {
      status: "human_takeover",
      humanTakeover: true,
      openIntent: cleanString(input.intent || "human_handoff")
    });
    return recordResult(env, base, {
      ok: false,
      status: "blocked",
      executionMode: "human",
      requiresHuman: true,
      errorCode: "identity_not_verified",
      errorMessage: "Zapisující nástroj je pro neověřenou nebo odhlášenou identitu zakázaný."
    });
  }

  if (CONFIRMATION_REQUIRED_INTENTS.has(cleanString(input.intent))) {
    await setRcsSmsConversationState(env, input.conversationId, {
      status: "awaiting_confirmation",
      humanTakeover: false,
      openIntent: cleanString(input.intent),
      awaitingField: "authenticated_kso_confirmation"
    });
    return recordResult(env, base, {
      ok: false,
      status: "awaiting_confirmation",
      executionMode: "confirmation",
      requiresHuman: true,
      errorCode: "intent_requires_confirmation",
      errorMessage: "Změna termínu nebo objednávka služby vyžaduje potvrzení oprávněným uživatelem v KSO."
    });
  }

  if (REQUEST_TOOLS.has(toolName)) {
    if (!requestScopeVerified(toolName, args, context)) {
      await setRcsSmsConversationState(env, input.conversationId, {
        status: "human_takeover",
        humanTakeover: true,
        openIntent: cleanString(input.intent),
        awaitingField: ""
      });
      return recordResult(env, base, {
        ok: false,
        status: "blocked",
        executionMode: "human",
        requiresHuman: true,
        errorCode: "request_scope_not_verified",
        errorMessage: "Požadavek není navázaný na zákazníka nebo vozidlo ověřené serverovým kontextem."
      });
    }
    const request = await createRcsSmsRequest(env, {
      conversationId: input.conversationId,
      messageId: input.messageId,
      requestType: toolName,
      status: "open",
      contactType: context.senderType,
      userId: context.userId,
      customerId: context.customerId,
      relatedEntityType: context.relatedEntityType,
      relatedEntityId: context.relatedEntityId,
      summary: requestSummary(toolName, args, context),
      details: args,
      idempotencyKey: toolIdempotencyKey(input.messageId, toolName)
    });
    return recordResult(env, base, {
      ok: true,
      status: "completed",
      executionMode: "automatic",
      requiresHuman: false,
      requestId: request.id,
      requestStatus: request.status,
      requestCreated: request.duplicate !== true
    });
  }

  if (GRANT_REQUIRED_TOOLS.has(toolName)) {
    if (!taskReplyIdentityVerified(context)) {
      return recordResult(env, base, {
        ok: false,
        status: "blocked",
        executionMode: "human",
        requiresHuman: true,
        errorCode: "task_reply_identity_mismatch",
        errorMessage: "Odpověď na úkol není navázaná na ověřeného uživatele původní zprávy."
      });
    }
    const requestKey = toolIdempotencyKey(input.messageId, toolName);
    const existingRequest = await findRcsSmsRequestByIdempotency(env, requestKey);
    if (existingRequest?.status === "confirmed") {
      return recordResult(env, base, {
        ok: true,
        status: "completed",
        executionMode: "automatic",
        requiresHuman: false,
        scopedGrantUsed: true,
        requestId: existingRequest.id,
        requestStatus: existingRequest.status,
        requestCreated: false
      });
    }
    const grant = await findRcsSmsActionGrant(env, {
      outboundMessageSid: context.lastOutboundMessageSid,
      phone: context.phone,
      actionName: toolName
    });
    if (!grant) {
      await setRcsSmsConversationState(env, input.conversationId, {
        status: "awaiting_confirmation",
        humanTakeover: false,
        openIntent: cleanString(input.intent),
        awaitingField: "authenticated_kso_confirmation"
      });
      return recordResult(env, base, {
        ok: false,
        status: "awaiting_confirmation",
        executionMode: "confirmation",
        requiresHuman: true,
        errorCode: "scoped_action_grant_missing",
        errorMessage: "Původní zpráva neobsahuje platné serverové oprávnění k této akci."
      });
    }
    const grantArguments = grant.arguments && typeof grant.arguments === "object"
      ? grant.arguments
      : {};
    const grantScopeMismatch = cleanString(grant.objectType) !== "task"
      || cleanString(grant.objectId) !== cleanString(args.taskId)
      || Object.entries(grantArguments)
        .some(([name, value]) => cleanString(args[name]) !== cleanString(value));
    if (grantScopeMismatch) {
      await setRcsSmsConversationState(env, input.conversationId, {
        status: "human_takeover",
        humanTakeover: true,
        openIntent: cleanString(input.intent),
        awaitingField: ""
      });
      return recordResult(env, base, {
        ok: false,
        status: "blocked",
        executionMode: "human",
        requiresHuman: true,
        errorCode: "scoped_action_grant_arguments_mismatch",
        errorMessage: "Odpověď neodpovídá objektu a argumentům původního serverového oprávnění."
      });
    }

    const request = existingRequest || await createRcsSmsRequest(env, {
      conversationId: input.conversationId,
      messageId: input.messageId,
      requestType: toolName,
      status: "pending_confirmation",
      contactType: context.senderType,
      userId: context.userId,
      customerId: context.customerId,
      relatedEntityType: grant.objectType || context.relatedEntityType,
      relatedEntityId: grant.objectId || context.relatedEntityId,
      summary: requestSummary(toolName, args, context),
      details: { ...grant.arguments, ...args, grantId: grant.id },
      idempotencyKey: requestKey
    });
    const used = await useRcsSmsActionGrant(env, grant.id);
    if (!used) {
      await setRcsSmsRequestStatus(env, request.id, "blocked");
      return recordResult(env, base, {
        ok: false,
        status: "blocked",
        executionMode: "human",
        requiresHuman: true,
        errorCode: "scoped_action_grant_already_used",
        errorMessage: "Serverové oprávnění už bylo použité nebo vypršelo."
      });
    }

    await setRcsSmsRequestStatus(env, request.id, "confirmed");
    return recordResult(env, base, {
      ok: true,
      status: "completed",
      executionMode: "automatic",
      requiresHuman: false,
      scopedGrantUsed: true,
      requestId: request.id,
      requestStatus: "confirmed"
    });
  }

  return recordResult(env, base, {
    ok: false,
    status: "blocked",
    executionMode: "human",
    requiresHuman: true,
    errorCode: "tool_policy_missing",
    errorMessage: "Pro nástroj není definovaná bezpečná serverová politika."
  });
}

export const __test = {
  CONFIRMATION_REQUIRED_INTENTS,
  CUSTOMER_SCOPED_REQUEST_TOOLS,
  GRANT_REQUIRED_TOOLS,
  READ_ONLY_TOOLS,
  READ_TOOLS_REQUIRING_FUTURE_CONNECTOR,
  REQUEST_TOOLS,
  requestScopeVerified,
  requestSummary,
  taskReplyIdentityVerified,
  toolIdempotencyKey
};
