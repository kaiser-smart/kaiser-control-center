function cleanText(value) {
  return String(value || "").trim();
}

function eventTime(value) {
  const time = Date.parse(cleanText(value));
  return Number.isFinite(time) ? time : 0;
}

export function dataBoxPlusHistoryChatEntries(history = []) {
  return (Array.isArray(history) ? history : [])
    .filter((event) => cleanText(event?.actionType).toLocaleLowerCase("cs-CZ") === "chatový pokyn")
    .sort((left, right) => eventTime(left?.createdAt) - eventTime(right?.createdAt))
    .flatMap((event) => {
      const payload = event?.payload && typeof event.payload === "object" ? event.payload : {};
      const instruction = cleanText(payload.originalInstruction || payload.userInstruction);
      if (!instruction) return [];
      const assistantText = cleanText(
        payload.assistantText
        || event.assistantText
        || event.auditNote
        || payload.performedAction
      );
      const auditId = cleanText(event.id);
      const createdAt = cleanText(event.createdAt);
      return [
        {
          id: `${auditId || createdAt}-user`,
          auditId,
          role: "user",
          text: instruction,
          createdAt
        },
        ...(assistantText ? [{
          id: `${auditId || createdAt}-assistant`,
          auditId,
          role: "assistant",
          text: assistantText,
          createdAt
        }] : [])
      ];
    });
}

export function dataBoxPlusConversationEntries(history = [], localEntries = []) {
  const persisted = dataBoxPlusHistoryChatEntries(history);
  const persistedAuditIds = new Set(persisted.map((entry) => entry.auditId).filter(Boolean));
  const local = (Array.isArray(localEntries) ? localEntries : [])
    .filter((entry) => cleanText(entry?.text))
    .filter((entry) => !entry.auditId || !persistedAuditIds.has(cleanText(entry.auditId)));
  return [...persisted, ...local];
}

export function dataBoxPlusPendingChatEntries(localEntries = [], instruction = "", requestId = "") {
  const text = cleanText(instruction);
  const id = cleanText(requestId) || `ds-plus-chat-${Date.now()}`;
  if (!text) return Array.isArray(localEntries) ? [...localEntries] : [];
  return [
    ...(Array.isArray(localEntries) ? localEntries : []),
    {
      id: `${id}-user`,
      requestId: id,
      role: "user",
      text,
      createdAt: new Date().toISOString()
    },
    {
      id: `${id}-assistant`,
      requestId: id,
      role: "assistant",
      text: "Autopilot pracuje...",
      pending: true,
      createdAt: new Date().toISOString()
    }
  ];
}

export function dataBoxPlusResolvePendingChatEntries(localEntries = [], requestId = "", assistantText = "", auditId = "", error = false) {
  const id = cleanText(requestId);
  const reply = cleanText(assistantText) || "Zprávu se nepodařilo zpracovat.";
  return (Array.isArray(localEntries) ? localEntries : []).map((entry) => {
    if (cleanText(entry?.requestId) !== id) return entry;
    if (entry.role === "assistant") {
      return { ...entry, text: reply, pending: false, error: Boolean(error), auditId: cleanText(auditId) };
    }
    return { ...entry, auditId: cleanText(auditId) };
  });
}
