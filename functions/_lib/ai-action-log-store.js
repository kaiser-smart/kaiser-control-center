const AI_ACTION_LOG_DB_BINDING = "SMART_ODPADY_DB";

function cleanString(value) {
  return String(value ?? "").trim();
}

function safeJson(value) {
  try {
    return JSON.stringify(value ?? null);
  } catch {
    return JSON.stringify({ error: "unserializable" });
  }
}

function randomId() {
  const suffix = globalThis.crypto?.randomUUID
    ? globalThis.crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2)}`;

  return `ai-action-${suffix}`;
}

export async function recordAiAction(env, currentUser, input = {}) {
  const db = env?.[AI_ACTION_LOG_DB_BINDING] || null;

  if (!db) {
    return { logged: false, reason: "database_missing" };
  }

  const log = {
    id: randomId(),
    userId: cleanString(currentUser?.id),
    userName: cleanString(currentUser?.name || currentUser?.email || "Uživatel"),
    assistantId: cleanString(input.assistantId),
    assistantName: cleanString(input.assistantName),
    actionType: cleanString(input.actionType),
    toolName: cleanString(input.toolName),
    input: safeJson(input.input),
    result: safeJson(input.result),
    status: cleanString(input.status || "ok"),
    createdAt: new Date().toISOString()
  };

  try {
    await db
      .prepare(`
        INSERT INTO ai_action_logs (
          id,
          user_id,
          user_name,
          assistant_id,
          assistant_name,
          action_type,
          tool_name,
          input,
          result,
          status,
          created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `)
      .bind(
        log.id,
        log.userId,
        log.userName,
        log.assistantId,
        log.assistantName,
        log.actionType,
        log.toolName,
        log.input,
        log.result,
        log.status,
        log.createdAt
      )
      .run();
    return { logged: true, id: log.id };
  } catch (error) {
    console.error("ai_action_log.failed", { message: error.message });
    return { logged: false, reason: "write_failed" };
  }
}

