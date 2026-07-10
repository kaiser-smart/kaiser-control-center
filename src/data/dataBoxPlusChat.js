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
          createdAt,
          outcome: cleanText(payload.outcome || event.result),
          intent: cleanText(payload.intent),
          statusLabel: cleanText(payload.statusLabel)
        }] : [])
      ];
    });
}

export function dataBoxPlusLatestActionState(history = [], localEntries = []) {
  const persistedEvent = [...(Array.isArray(history) ? history : [])]
    .filter((item) => cleanText(item?.actionType).toLocaleLowerCase("cs-CZ") === "chatový pokyn")
    .sort((left, right) => eventTime(right?.createdAt) - eventTime(left?.createdAt))[0];
  const localEvent = [...(Array.isArray(localEntries) ? localEntries : [])]
    .filter((item) => item?.role === "assistant" && !item?.pending && cleanText(item?.outcome))
    .sort((left, right) => eventTime(right?.createdAt) - eventTime(left?.createdAt))[0];
  const event = localEvent && eventTime(localEvent.createdAt) >= eventTime(persistedEvent?.createdAt)
    ? {
        createdAt: localEvent.createdAt,
        result: localEvent.outcome,
        payload: {
          outcome: localEvent.outcome,
          intent: localEvent.intent,
          statusLabel: localEvent.statusLabel,
          understoodAs: localEvent.understoodAs,
          performedAction: localEvent.performedAction,
          proposedAction: localEvent.proposedAction
        }
      }
    : persistedEvent;
  if (!event) {
    return {
      tone: "info",
      label: "Informativní",
      understoodAs: "Zatím nebyl zadán žádný pokyn.",
      actionText: "Nebylo provedeno nic.",
      createdAt: ""
    };
  }
  const payload = event.payload && typeof event.payload === "object" ? event.payload : {};
  const result = cleanText(payload.outcome || event.result).toLowerCase();
  const state = result === "done" || result === "sent"
    ? { tone: "done", label: "Provedeno" }
    : result === "waiting_confirmation"
      ? { tone: "confirmation", label: "Čeká na potvrzení" }
      : result === "needs_input"
        ? { tone: "input", label: "Potřebuji doplnit" }
        : result === "failed" || result === "cannot_execute"
          ? { tone: "error", label: "Nelze provést" }
          : { tone: "info", label: "Informativní" };
  const actionText = result === "waiting_confirmation"
    ? cleanText(payload.proposedAction?.actionSummary || payload.understoodAs)
    : cleanText(payload.performedAction) && payload.performedAction !== "Nebylo provedeno nic"
      ? payload.performedAction
      : "Nebylo provedeno nic.";
  return {
    ...state,
    understoodAs: cleanText(payload.understoodAs || payload.intent || "Nejasný pokyn"),
    actionText,
    createdAt: cleanText(event.createdAt),
    intent: cleanText(payload.intent),
    result
  };
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

export function dataBoxPlusResolvePendingChatEntries(localEntries = [], requestId = "", assistantText = "", auditId = "", error = false, details = {}) {
  const id = cleanText(requestId);
  const reply = cleanText(assistantText) || "Zprávu se nepodařilo zpracovat.";
  return (Array.isArray(localEntries) ? localEntries : []).map((entry) => {
    if (cleanText(entry?.requestId) !== id) return entry;
    if (entry.role === "assistant") {
      return {
        ...entry,
        text: reply,
        pending: false,
        error: Boolean(error),
        auditId: cleanText(auditId),
        createdAt: cleanText(details.createdAt) || entry.createdAt,
        outcome: cleanText(details.outcome) || (error ? "failed" : cleanText(entry.outcome)),
        intent: cleanText(details.intent),
        statusLabel: cleanText(details.statusLabel),
        understoodAs: cleanText(details.understoodAs),
        performedAction: cleanText(details.performedAction),
        proposedAction: details.proposedAction && typeof details.proposedAction === "object" ? details.proposedAction : undefined
      };
    }
    return { ...entry, auditId: cleanText(auditId) };
  });
}
