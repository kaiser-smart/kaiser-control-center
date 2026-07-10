function cleanText(value) {
  return String(value || "").trim();
}

function eventTime(value) {
  const time = Date.parse(cleanText(value));
  return Number.isFinite(time) ? time : 0;
}

const SIMPLE_CHAT_HELP = "Napište mi, co mám s touto datovou zprávou udělat. Můžu ji archivovat, označit jako vyřízenou, připravit odpověď nebo předat kolegovi.";

function simpleChatWords(value) {
  return cleanText(value)
    .toLocaleLowerCase("cs-CZ")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function isUnclearChatInstruction(value) {
  const words = simpleChatWords(value);
  return !words
    || ["ahoj", "co", "test", "zkouska", "ano", "souhlasim", "souhlas", "proved", "potvrzuji"].includes(words)
    || words.includes("tvoje poslani")
    || words.includes("jake je tvoje poslani")
    || words.includes("co umis");
}

function humanAssistantText(event, payload, instruction) {
  const outcome = cleanText(payload.outcome || event?.result).toLowerCase();
  const explicitAssistantText = cleanText(payload.assistantText);
  if (isUnclearChatInstruction(instruction)
    && (!explicitAssistantText || !["done", "cancelled", "expired", "failed", "waiting_confirmation"].includes(outcome))) {
    return SIMPLE_CHAT_HELP;
  }
  if (outcome === "draft_ready") {
    return "Připravím návrh odpovědi. Odeslání musí potvrdit člověk.";
  }
  const raw = cleanText(payload.assistantText || event?.assistantText || event?.auditNote || payload.performedAction);
  const performed = raw.match(/Systém provedl:\s*(.+?)(?:\.\s*Nový stav:|$)/i)?.[1];
  const missingWords = simpleChatWords(performed || raw);
  const missingRecipient = missingWords.includes("chybi adresat") || missingWords.includes("adresat chybi");
  if (missingRecipient) {
    return "Chybí adresát. Komu to mám předat nebo přeposlat?";
  }
  if (outcome === "needs_input") {
    return raw.replace(/^Hotovo\.\s*/i, "") || "Potřebuji doplnit chybějící údaj.";
  }
  if (missingWords.includes("chybi")) {
    const missingDetail = cleanText(performed || raw).replace(/[.\s]+$/, "");
    return `${missingDetail}. Potřebuji doplnit chybějící údaj.`;
  }
  if (performed) return `Hotovo. ${performed.replace(/[.\s]+$/, "")}.`;
  if (/^(intent|result|no_action|changedstate)\b/i.test(raw)) return SIMPLE_CHAT_HELP;
  return raw || SIMPLE_CHAT_HELP;
}

export function dataBoxPlusHistoryChatEntries(history = []) {
  return (Array.isArray(history) ? history : [])
    .filter((event) => cleanText(event?.actionType).toLocaleLowerCase("cs-CZ") === "chatový pokyn")
    .sort((left, right) => eventTime(left?.createdAt) - eventTime(right?.createdAt))
    .flatMap((event) => {
      const payload = event?.payload && typeof event.payload === "object" ? event.payload : {};
      const instruction = cleanText(payload.originalInstruction || payload.userInstruction);
      if (!instruction) return [];
      const assistantText = humanAssistantText(event, payload, instruction);
      const auditId = cleanText(event.id);
      const createdAt = cleanText(event.createdAt);
      const eventResult = cleanText(event.result);
      const payloadOutcome = cleanText(payload.outcome);
      const activeConfirmation = eventResult === "waiting_confirmation";
      const outcome = payloadOutcome === "waiting_confirmation" && eventResult && !activeConfirmation
        ? eventResult
        : payloadOutcome || eventResult;
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
          outcome,
          intent: cleanText(payload.intent),
          statusLabel: cleanText(payload.statusLabel),
          confirmationId: activeConfirmation ? cleanText(payload.proposedAction?.confirmationId || payload.confirmationId) : "",
          proposedAction: activeConfirmation && payload.proposedAction && typeof payload.proposedAction === "object"
            ? payload.proposedAction
            : undefined
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
