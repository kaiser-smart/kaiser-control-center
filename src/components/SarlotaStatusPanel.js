import { ELEVENLABS_ASSISTANT_CONFIGS } from "../elevenLabsAssistants.js";

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function statusMeta(status) {
  const normalized = String(status || "unverified").trim().toLowerCase();
  const labels = {
    configured: "nakonfigurováno",
    ok: "OK",
    error: "chyba",
    unverified: "neověřeno",
    waiting: "neověřeno"
  };

  return {
    status: normalized,
    label: labels[normalized] || "neověřeno"
  };
}

function statusBadge(status) {
  const meta = statusMeta(status);
  const tone = meta.status === "configured" ? "ok" : meta.status;

  return `<span class="sarlota-status__badge sarlota-status__badge--${escapeHtml(tone)}">${escapeHtml(meta.label)}</span>`;
}

function statusRow(label, status, detail = "") {
  return `
    <div class="sarlota-status__row">
      <dt>${escapeHtml(label)}</dt>
      <dd>
        ${statusBadge(status)}
        <span>${escapeHtml(detail || "neověřeno")}</span>
      </dd>
    </div>
  `;
}

function safeArray(value) {
  return Array.isArray(value) ? value : [];
}

function shortList(items, emptyText = "nic") {
  const values = safeArray(items)
    .map((item) => String(item ?? "").trim())
    .filter(Boolean);

  if (!values.length) {
    return escapeHtml(emptyText);
  }

  return values
    .slice(0, 12)
    .map((item) => `<code>${escapeHtml(item)}</code>`)
    .join(" ");
}

function diagnosticLine(label, value) {
  return `
    <div class="sarlota-status__diagnostic-line">
      <dt>${escapeHtml(label)}</dt>
      <dd>${value || escapeHtml("neověřeno")}</dd>
    </div>
  `;
}

function toolEntryLabel(entry) {
  const label = String(entry?.label || entry?.name || entry?.type || "tool").trim();
  const type = String(entry?.type || "").trim();
  const id = entry?.idMasked ? `, id ${entry.idMasked}` : "";
  const path = entry?.path ? `, ${entry.path}` : "";

  return `${label}${type ? ` (${type}${id})` : id}${path}`;
}

function toolDiagnostics(tools = null) {
  if (!tools) {
    return "";
  }

  const configured = safeArray(tools.configuredClientToolNames);
  const missing = safeArray(tools.missingTools);
  const extra = safeArray(tools.extraTools);
  const entries = safeArray(tools.configuredToolEntries);
  const entryText = entries.length
    ? entries.slice(0, 12).map((entry) => `<li>${escapeHtml(toolEntryLabel(entry))}</li>`).join("")
    : "<li>žádné tool entries z live agenta</li>";

  return `
    <section class="sarlota-status__diagnostic">
      <h3>ElevenLabs tools detail</h3>
      <dl>
        ${diagnosticLine("V agentovi", escapeHtml(`${configured.length} toolů`))}
        ${diagnosticLine("Chybí KSO tools", shortList(missing, "nechybí"))}
        ${diagnosticLine("Extra tools", shortList(extra, "žádné"))}
      </dl>
      <ul class="sarlota-status__diagnostic-list">
        ${entryText}
      </ul>
    </section>
  `;
}

function knowledgeDiagnostics(knowledgeBase = null) {
  if (!knowledgeBase) {
    return "";
  }

  const entries = safeArray(knowledgeBase.entries);
  const entryText = entries.length
    ? entries.slice(0, 12).map((entry) => {
      const id = entry.idMasked ? `, id ${entry.idMasked}` : "";
      const path = entry.path ? `, ${entry.path}` : "";
      return `<li>${escapeHtml(`${entry.label || "knowledge"} (${entry.type || "unknown"}${id})${path}`)}</li>`;
    }).join("")
    : "<li>žádné Knowledge Base položky v agent konfiguraci nenalezené</li>";

  return `
    <section class="sarlota-status__diagnostic">
      <h3>ElevenLabs Knowledge Base</h3>
      <dl>
        ${diagnosticLine("Stav", escapeHtml(knowledgeBase.verifiedInElevenLabs ? "ověřeno read-only z agent konfigurace" : "neověřeno"))}
        ${diagnosticLine("Obsah dokumentů", escapeHtml(knowledgeBase.contentReturned ? "vrácen" : "nevrací se"))}
      </dl>
      <ul class="sarlota-status__diagnostic-list">
        ${entryText}
      </ul>
    </section>
  `;
}

function vehicleContextDiagnostics(context = null) {
  if (!context) {
    return "";
  }

  const options = context.optionsPreview || context.singleVehiclePreview || "žádný ověřený text";

  return `
    <section class="sarlota-status__diagnostic">
      <h3>Hlasový kontext vozidel</h3>
      <dl>
        ${diagnosticLine("Zdroj", escapeHtml(context.source || "signed_url_dynamic_variables"))}
        ${diagnosticLine("Stav", escapeHtml(context.status || "neověřeno"))}
        ${diagnosticLine("Počet možností", escapeHtml(String(context.optionsCount ?? 0)))}
        ${diagnosticLine("Náhled", escapeHtml(options))}
        ${diagnosticLine("Bezpečnost", escapeHtml("signed URL, secrets a celé VIN se nevrací"))}
      </dl>
    </section>
  `;
}

function backendVehicleContextDiagnostics(context = null) {
  if (!context) {
    return "";
  }

  const diagnostics = context.diagnostics || {};
  const preview = context.vehiclesPreview || context.assistantMessage || "žádný ověřený text";

  return `
    <section class="sarlota-status__diagnostic">
      <h3>Backend kontext vozidel</h3>
      <dl>
        ${diagnosticLine("Zdroj", escapeHtml(context.source || "driver_report_context_backend"))}
        ${diagnosticLine("HTTP", escapeHtml(String(context.httpStatus || 0)))}
        ${diagnosticLine("vehiclesVerified", escapeHtml(context.vehiclesVerified ? "true" : "false"))}
        ${diagnosticLine("Počet vozidel", escapeHtml(String(context.vehiclesCount ?? 0)))}
        ${diagnosticLine("Náhled", escapeHtml(preview))}
        ${diagnosticLine("Důvod", escapeHtml(context.reason || ""))}
        ${diagnosticLine("Data source", escapeHtml(diagnostics.dataSource || ""))}
        ${diagnosticLine("Před/po filtru", escapeHtml(`${diagnostics.vehiclesCountBeforeFilter ?? 0}/${diagnostics.vehiclesCountAfterFilter ?? 0}`))}
        ${diagnosticLine("Unsafe vynecháno", escapeHtml(String(diagnostics.unsafeVoiceVehicleCount ?? 0)))}
        ${diagnosticLine("Bezpečnost", escapeHtml("bez VIN, bez secrets, bez signed URL"))}
      </dl>
    </section>
  `;
}

function diagnosticDetails(data) {
  const details = [
    toolDiagnostics(data.tools),
    knowledgeDiagnostics(data.knowledgeBase),
    vehicleContextDiagnostics(data.driverReportVehicleContext),
    backendVehicleContextDiagnostics(data.backendDriverReportContext)
  ].filter(Boolean).join("");

  if (!details) {
    return "";
  }

  return `
    <details class="sarlota-status__details" open>
      <summary>Diagnostický detail bez změn v ElevenLabs</summary>
      <div class="sarlota-status__diagnostics">
        ${details}
      </div>
    </details>
  `;
}

function toolDetail(tools = null) {
  if (!tools) {
    return "neověřeno";
  }

  const count = Array.isArray(tools.configuredClientToolNames) ? tools.configuredClientToolNames.length : 0;
  const missingCount = Array.isArray(tools.missingTools) ? tools.missingTools.length : 0;

  if (tools.verifiedInElevenLabs && tools.status === "ok") {
    return `ElevenLabs OK, ${count} toolů ověřeno`;
  }

  if (tools.verifiedInElevenLabs && missingCount) {
    return `ElevenLabs chyba, chybí ${missingCount} toolů`;
  }

  const localStatus = tools.localSchemaStatus === "ok" ? "lokální schémata OK" : "lokální schémata mají rozdíl";

  return `${localStatus}, ElevenLabs dashboard neověřen, ${count} toolů v kódu`;
}

function modelDetail(model = null) {
  if (!model) {
    return "Qwen3.5-397B-A17B / neověřeno";
  }

  const expected = model.expectedModel || "Qwen3.5-397B-A17B";
  if (model.verifiedInElevenLabs && model.status === "ok") {
    return `${expected} ověřeno v ElevenLabs`;
  }

  if (model.verifiedInElevenLabs && model.status === "error") {
    return `očekáváno ${expected}, v ElevenLabs nesedí`;
  }

  return `${expected} / neověřeno`;
}

function driverReportPromptDetail(prompt = null) {
  if (!prompt) {
    return "ElevenLabs prompt neověřen";
  }

  const forbidden = safeArray(prompt.forbiddenPhrasesPresent);
  if (forbidden.length) {
    return `v promptu zůstává starý blok: ${forbidden.length} zakázaných frází`;
  }

  if (prompt.rulePresent === true) {
    return "tvrdé pravidlo UI výběru je v ElevenLabs promptu";
  }

  if (prompt.rulePresent === false) {
    return "pravidlo zatím v ElevenLabs promptu není";
  }

  return "ElevenLabs prompt neověřen";
}

function firstMessageDetail(firstMessage = null) {
  if (!firstMessage) {
    return "intro_announcement";
  }

  if (firstMessage.verifiedInElevenLabs && firstMessage.status === "ok") {
    return "intro_announcement ověřeno v ElevenLabs";
  }

  if (firstMessage.verifiedInElevenLabs && firstMessage.status === "error") {
    return "first message v ElevenLabs nesedí";
  }

  return firstMessage.variable || "intro_announcement";
}

function knowledgeBaseDetail(knowledgeBase = null) {
  if (!knowledgeBase) {
    return "neověřeno";
  }

  if (!knowledgeBase.verifiedInElevenLabs) {
    return "Knowledge Base neověřená";
  }

  return `${knowledgeBase.entriesCount || 0} položek v agent konfiguraci, obsah se nevrací`;
}

function vehicleContextDetail(context = null) {
  if (!context) {
    return "neověřeno";
  }

  if (context.omittedByDefault === true) {
    return "běžná signed-url neposílá driver_report_vehicle_*";
  }

  const count = Number(context.optionsCount || 0);
  return `${context.status || "neověřeno"}, ${count} možností ze signed-url dynamic variables`;
}

function backendVehicleContextDetail(context = null) {
  if (!context) {
    return "backend kontext neověřen";
  }

  if (context.vehiclesVerified === true) {
    return `${context.vehiclesCount || 0} ověřených vozidel z backendu`;
  }

  return `${context.reason || "bez ověřených vozidel"} · ${context.assistantMessage || "fallback"}`;
}

export function SarlotaStatusPanel({
  status = null,
  loading = false,
  error = "",
  syncing = false,
  syncMessage = "",
  syncError = "",
  selectedAssistantKey = "sarlota",
  voiceDiagnostics = {}
} = {}) {
  const data = status || {};
  const selectedConfig = ELEVENLABS_ASSISTANT_CONFIGS[selectedAssistantKey] || ELEVENLABS_ASSISTANT_CONFIGS.sarlota;
  const omitDriverReportVehicleContext = voiceDiagnostics.omitDriverReportVehicleContext === true;
  const generatedAt = data.generatedAt ? new Date(data.generatedAt).toLocaleString("cs-CZ") : "neověřeno";
  const assistantLabel = data.agent?.assistantDisplayName || selectedConfig.displayName;
  const assistantBadge = selectedConfig.isProduction
    ? `<span class="sarlota-status__badge sarlota-status__badge--ok">PRODUKCE</span>`
    : selectedConfig.isTest
      ? `<span class="sarlota-status__badge sarlota-status__badge--waiting">TEST</span>`
      : `<span class="sarlota-status__badge sarlota-status__badge--unverified">ASISTENT</span>`;
  const assistantOptions = Object.values(ELEVENLABS_ASSISTANT_CONFIGS).map((assistant) => `
    <option value="${escapeHtml(assistant.assistantKey)}" ${assistant.assistantKey === selectedConfig.assistantKey ? "selected" : ""}>
      ${escapeHtml(assistant.displayName)}
    </option>
  `).join("");
  const elevenLabsDetail = data.elevenLabs
    ? (data.elevenLabs.upstreamVerified
      ? "agent ověřen read-only přes ElevenLabs API"
      : (data.elevenLabs.configured ? "server má potřebnou konfiguraci" : "chybí serverová konfigurace"))
    : "neověřeno";
  const vocativeDetail = data.vocative
    ? (data.vocative.radimFixtureOk ? "test vocativu OK" : "čeká na ověření")
    : "neověřeno";
  const rows = [
    statusRow("Assistant key", data.agent?.assistantKey ? "ok" : "unverified", data.agent?.assistantKey || selectedConfig.assistantKey),
    statusRow("Agent ID", data.agent?.assistantAgentIdPresent ? "ok" : "error", data.agent?.assistantAgentIdMasked || `${selectedConfig.envVariableName} chybí`),
    statusRow(
      "ElevenLabs",
      data.elevenLabs?.status || "unverified",
      elevenLabsDetail
    ),
    statusRow("Agent", data.agent?.status || "unverified", data.agent?.name || assistantLabel),
    statusRow("První zpráva", data.firstMessage?.status || "unverified", firstMessageDetail(data.firstMessage)),
    statusRow("Personalizace", data.personalization?.status || "unverified", data.personalization?.source || "přihlášený uživatel"),
    statusRow("Vocativ uživatele", data.vocative?.status || "unverified", vocativeDetail),
    statusRow("LLM model v EL", data.openAiModelInElevenLabs?.status || "unverified", modelDetail(data.openAiModelInElevenLabs)),
    statusRow("Prompt Hlášení řidičů", data.driverReportPrompt?.status || "unverified", driverReportPromptDetail(data.driverReportPrompt)),
    statusRow("Tools", data.tools?.status || "unverified", toolDetail(data.tools)),
    statusRow("Knowledge Base", data.knowledgeBase?.status || "unverified", knowledgeBaseDetail(data.knowledgeBase)),
    statusRow("Kontext vozidel", data.driverReportVehicleContext?.status ? "ok" : "unverified", vehicleContextDetail(data.driverReportVehicleContext)),
    statusRow("Backend kontext vozidel", data.backendDriverReportContext?.status || "unverified", backendVehicleContextDetail(data.backendDriverReportContext)),
    statusRow(
      "Hlasový test bez vozidel",
      omitDriverReportVehicleContext ? "configured" : "ok",
      omitDriverReportVehicleContext
        ? "zapnuto pro další novou hlasovou session, driver_report_vehicle_* se nepošle"
        : "vypnuto, běžná signed-url už driver_report_vehicle_* neposílá"
    ),
    statusRow(
      "Signed-url endpoint",
      data.signedUrlEndpoint?.status || "unverified",
      data.signedUrlEndpoint?.exists ? (data.signedUrlEndpoint?.pathForAssistant || `/api/ai/elevenlabs/signed-url?assistant=${selectedConfig.assistantKey}`) : "neověřeno"
    )
  ].join("");
  const promptSyncDisabled = loading || syncing || data.driverReportPrompt?.syncAllowed === false || selectedConfig.promptSyncAllowed === false;
  const diagnosticSyncDisabled = loading || syncing || selectedConfig.assistantKey !== "sarlota";
  const smart2RepairDisabled = loading || syncing || selectedConfig.assistantKey !== "sarlota-smart-2";
  const smart2DeleteDisabled = loading || syncing || selectedConfig.assistantKey !== "sarlota-smart-2";

  return `
    <section class="sarlota-status users-panel" aria-labelledby="sarlota-status-title">
      <div class="users-panel__head sarlota-status__head">
        <div>
          <h2 id="sarlota-status-title">Šarlota</h2>
          <p>Read-only stav pro ElevenLabs agenta a signed-url napojení. ${assistantBadge}</p>
        </div>
        <div class="sarlota-status__actions">
          <label class="sarlota-status__assistant-select">
            <span>Asistent</span>
            <select data-sarlota-assistant-select ${loading || syncing ? "disabled" : ""}>
              ${assistantOptions}
            </select>
          </label>
          <button class="secondary-link" type="button" data-sarlota-status-refresh ${loading || syncing ? "disabled" : ""}>
            ${loading ? "Načítám..." : "Obnovit"}
          </button>
          <button class="primary-action sarlota-status__sync" type="button" data-sarlota-tools-sync ${loading || syncing ? "disabled" : ""}>
            ${syncing ? "Synchronizuji..." : "Synchronizovat tools"}
          </button>
          <button class="secondary-link sarlota-status__sync" type="button" data-sarlota-smart-2-repair ${smart2RepairDisabled ? "disabled" : ""}>
            Opravit Smart 2 základ
          </button>
          <button class="secondary-link sarlota-status__sync" type="button" data-sarlota-smart-2-delete ${smart2DeleteDisabled ? "disabled" : ""}>
            Smazat Smart 2
          </button>
          <button class="secondary-link sarlota-status__sync" type="button" data-sarlota-tools-diagnostic ${diagnosticSyncDisabled ? "disabled" : ""}>
            Diagnostika: odpojit tools
          </button>
          <button class="secondary-link sarlota-status__sync" type="button" data-sarlota-vehicle-context-diagnostic ${loading || syncing ? "disabled" : ""}>
            ${omitDriverReportVehicleContext ? "Vypnout test bez vozidel" : "Test: bez vozidel v hlasu"}
          </button>
          <button class="secondary-link sarlota-status__sync" type="button" data-sarlota-prompt-sync ${promptSyncDisabled ? "disabled" : ""}>
            Doplnit prompt
          </button>
          <button class="secondary-link sarlota-status__sync" type="button" data-sarlota-test-call ${loading || syncing ? "disabled" : ""}>
            Testovací hovor
          </button>
        </div>
      </div>
      ${error ? `<p class="module-feedback__error" role="alert">${escapeHtml(error)}</p>` : ""}
      ${syncError ? `<p class="module-feedback__error" role="alert">${escapeHtml(syncError)}</p>` : ""}
      ${syncMessage ? `<p class="module-feedback__success" role="status">${escapeHtml(syncMessage)}</p>` : ""}
      <dl class="sarlota-status__grid">
        ${rows}
      </dl>
      ${diagnosticDetails(data)}
      <p class="sarlota-status__meta">
        Aktualizováno: ${escapeHtml(generatedAt)}. Tools a prompt se synchronizují odděleně; Smart 2 základ opravuje jen first message a model. Hlasový test bez vozidel je jen v této otevřené stránce.
      </p>
    </section>
  `;
}
