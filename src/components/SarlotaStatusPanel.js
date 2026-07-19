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
    review: "kontrola",
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

function promptSafetyDiagnostics(prompt = null) {
  if (!prompt) {
    return "";
  }

  const missing = safeArray(prompt.missingRequirements);
  const missingText = missing.length
    ? missing.map((item) => `<li>${escapeHtml(item?.label || "povinné bezpečnostní pravidlo")}</li>`).join("")
    : "<li>žádné povinné bezpečnostní pravidlo nechybí</li>";

  return `
    <section class="sarlota-status__diagnostic">
      <h3>Kontrola bezpečnosti promptu</h3>
      <dl>
        ${diagnosticLine("Bezpečnostní pravidla", escapeHtml(prompt.rulePresent === true ? "nalezena" : prompt.rulePresent === false ? "neúplná" : "neověřena"))}
        ${diagnosticLine("Shoda s verzí KSO", escapeHtml(prompt.canonicalRulePresent === true ? "ano" : prompt.canonicalRulePresent === false ? "ne" : "neověřena"))}
        ${diagnosticLine("Obsah ve stavové diagnostice", escapeHtml(prompt.promptTextReturned ? "vrácen" : "nevrací se; je dostupný jen v chráněném editoru"))}
      </dl>
      <strong>Chybějící povinné body</strong>
      <ul class="sarlota-status__diagnostic-list">${missingText}</ul>
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

function voiceWebhookSelfCheckDiagnostics(check = null) {
  if (!check) {
    return "";
  }

  return `
    <section class="sarlota-status__diagnostic">
      <h3>Webhook self-test</h3>
      <dl>
        ${diagnosticLine("Zdroj", escapeHtml(check.source || "server_side_voice_webhook_self_check"))}
        ${diagnosticLine("Token v Cloudflare", escapeHtml(check.tokenPresent ? "ano" : "ne"))}
        ${diagnosticLine("HTTP", escapeHtml(String(check.httpStatus || 0)))}
        ${diagnosticLine("vehiclesVerified", escapeHtml(check.vehiclesVerified ? "true" : "false"))}
        ${diagnosticLine("Počet vozidel", escapeHtml(String(check.vehiclesCount ?? 0)))}
        ${diagnosticLine("Odpověď", escapeHtml(check.assistantMessage || ""))}
        ${diagnosticLine("Důvod", escapeHtml(check.reason || ""))}
        ${diagnosticLine("Bezpečnost", escapeHtml("hodnota tokenu, VIN, secrets a signed URL se nevrací"))}
      </dl>
    </section>
  `;
}

function diagnosticDetails(data) {
  const details = [
    promptSafetyDiagnostics(data.driverReportPrompt),
    toolDiagnostics(data.tools),
    knowledgeDiagnostics(data.knowledgeBase),
    vehicleContextDiagnostics(data.driverReportVehicleContext),
    backendVehicleContextDiagnostics(data.backendDriverReportContext),
    voiceWebhookSelfCheckDiagnostics(data.voiceWebhookSelfCheck)
  ].filter(Boolean).join("");

  if (!details) {
    return "";
  }

  return `
    <details class="sarlota-status__details">
      <summary>Technické podrobnosti</summary>
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
    return `nalezeny nebezpečné zastaralé formulace: ${forbidden.length}`;
  }

  if (prompt.rulePresent === true && prompt.canonicalRulePresent === true) {
    return "povinná bezpečnostní pravidla jsou ověřena a odpovídají KSO";
  }

  if (prompt.rulePresent === true) {
    return "bezpečnostní pravidla nalezena; prompt se liší od verze KSO";
  }

  if (prompt.rulePresent === false) {
    const missingCount = safeArray(prompt.missingRequirements).length;
    return missingCount
      ? `chybí ${missingCount} povinných bezpečnostních bodů`
      : "povinná bezpečnostní pravidla nejsou úplná";
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

function voiceWebhookSelfCheckDetail(check = null) {
  if (!check) {
    return "webhook self-test neověřen";
  }

  if (check.vehiclesVerified === true) {
    return `HTTP ${check.httpStatus || 0}, ${check.vehiclesCount || 0} ověřených vozidel`;
  }

  return `HTTP ${check.httpStatus || 0}, ${check.reason || check.assistantMessage || "neověřeno"}`;
}

function voiceWriteTestControls(test = {}, syncing = false) {
  const plan = test.plan || null;
  if (!plan?.ready) {
    return "";
  }

  const vehicles = safeArray(plan.vehicles).filter((vehicle) => vehicle?.vehicleId);
  const selectedVehicleId = test.selectedVehicleId || (vehicles.length === 1 ? vehicles[0].vehicleId : "");
  const vehicleOptions = vehicles.map((vehicle) => `
    <option value="${escapeHtml(vehicle.vehicleId)}" ${vehicle.vehicleId === selectedVehicleId ? "selected" : ""}>
      ${escapeHtml(vehicle.label || vehicle.vehicleId)}
    </option>
  `).join("");
  const selectionHelp = vehicles.length > 1
    ? `${vehicles.length} ověřená vozidla z backendu`
    : "1 ověřené vozidlo z backendu";

  return `
    <form class="sarlota-status__voice-write" data-sarlota-voice-write-form>
      <div>
        <h3>Kontrolní voice zápis</h3>
        <p>${escapeHtml(selectionHelp)}. Bez potvrzení se nic nezapíše.</p>
      </div>
      <label>
        <span>Vozidlo</span>
        <select name="vehicleId" data-sarlota-voice-write-vehicle ${syncing ? "disabled" : ""}>
          <option value="">Vyber vozidlo</option>
          ${vehicleOptions}
        </select>
      </label>
      <label>
        <span>Potvrzení</span>
        <input name="confirm" data-sarlota-voice-write-confirm type="text" autocomplete="off" placeholder="${escapeHtml(plan.confirmPhrase || "ZAPSAT TEST")}" ${syncing ? "disabled" : ""}>
      </label>
      <div class="sarlota-status__voice-write-actions">
        <button class="primary-action" type="submit" data-sarlota-voice-write-submit ${syncing ? "disabled" : ""}>
          Provést zápis
        </button>
        <button class="secondary-link" type="button" data-sarlota-voice-write-cancel ${syncing ? "disabled" : ""}>
          Zrušit
        </button>
      </div>
    </form>
  `;
}

function contentVersionLabel(version = {}) {
  const number = Number(version.version_number || version.versionNumber || 0);
  const createdAt = version.created_at || version.createdAt;
  const date = createdAt ? new Date(createdAt).toLocaleString("cs-CZ") : "čas neuveden";
  const source = {
    live_snapshot: "záloha před změnou",
    published_draft: "publikovaný koncept",
    rollback: "obnovená historická verze"
  }[version.source] || "uložená verze";
  return `Verze ${number || "–"} · ${source} · ${date}`;
}

function sarlotaContentEditor(editor = {}, syncing = false) {
  if (editor.loading) {
    return `<section class="sarlota-content-editor"><p>Načítám Prompt a Knowledge Base z ElevenLabs…</p></section>`;
  }
  if (editor.error && !editor.data) {
    return `<section class="sarlota-content-editor"><p class="module-feedback__error" role="alert">${escapeHtml(editor.error)}</p><button class="secondary-link" type="button" data-sarlota-content-refresh>ZKUSIT ZNOVU</button></section>`;
  }
  if (!editor.data?.documents) {
    return "";
  }

  const kind = editor.activeKind === "knowledge_base" ? "knowledge_base" : "prompt";
  const document = editor.data.documents[kind] || {};
  const draft = String(editor.drafts?.[kind] ?? document.draftContent ?? document.liveContent ?? "");
  const liveContent = String(document.liveContent ?? "");
  const validation = editor.validation?.[kind] || document.validation || { valid: false, errors: [] };
  const versions = safeArray(document.versions);
  const hasChanges = document.draftFingerprint
    ? document.draftFingerprint !== document.liveFingerprint
    : draft !== liveContent;
  const publishDisabled = syncing
    || editor.saving
    || editor.publishing
    || document.conflict
    || document.hasSavedDraft !== true
    || !hasChanges
    || validation.valid !== true;
  const versionsHtml = versions.length
    ? versions.map((version) => `
      <li>
        <span>${escapeHtml(contentVersionLabel(version))}</span>
        <button class="text-action" type="button" data-sarlota-content-rollback="${escapeHtml(version.id || "")}" data-sarlota-content-kind="${escapeHtml(kind)}" ${syncing || editor.publishing || version.content_fingerprint === document.liveFingerprint ? "disabled" : ""}>VRÁTIT TUTO VERZI</button>
      </li>
    `).join("")
    : "<li>Zatím není uložená žádná historická verze.</li>";
  const validationHtml = validation.valid
    ? '<p class="sarlota-content-editor__valid">Bezpečnostní kontrola: připraveno</p>'
    : `<div class="sarlota-content-editor__invalid"><strong>Nelze publikovat</strong><ul>${safeArray(validation.errors).map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul></div>`;

  return `
    <section class="sarlota-content-editor" aria-labelledby="sarlota-content-editor-title">
      <div class="sarlota-content-editor__head">
        <div>
          <span class="module-feedback__eyebrow">Zdroj pravdy v KSO</span>
          <h3 id="sarlota-content-editor-title">Prompt a Knowledge Base</h3>
          <p>Nejdřív uprav a ulož koncept. Produkční ElevenLabs se změní až samostatným potvrzením publikování.</p>
        </div>
        <button class="secondary-link" type="button" data-sarlota-content-refresh ${syncing || editor.saving || editor.publishing ? "disabled" : ""}>NAČÍST Z ELEVENLABS</button>
      </div>
      <div class="sarlota-content-editor__tabs" role="tablist" aria-label="Obsah Šarloty">
        <button type="button" role="tab" aria-selected="${kind === "prompt"}" class="${kind === "prompt" ? "is-active" : ""}" data-sarlota-content-tab="prompt">HLAVNÍ PROMPT</button>
        <button type="button" role="tab" aria-selected="${kind === "knowledge_base"}" class="${kind === "knowledge_base" ? "is-active" : ""}" data-sarlota-content-tab="knowledge_base">KNOWLEDGE BASE</button>
      </div>
      ${document.conflict ? '<p class="module-feedback__error" role="alert">Obsah v ElevenLabs se od uloženého konceptu změnil. Publikování je zablokované; nejdřív změny bezpečně porovnej a spoj.</p>' : ""}
      ${editor.message ? `<p class="module-feedback__success" role="status">${escapeHtml(editor.message)}</p>` : ""}
      ${editor.error ? `<p class="module-feedback__error" role="alert">${escapeHtml(editor.error)}</p>` : ""}
      <div class="sarlota-content-editor__status">
        <span><strong>Živá verze:</strong> ${escapeHtml(document.liveAvailable ? `${Number(document.liveLength || 0)} znaků` : "chybí")}</span>
        <span><strong>Koncept:</strong> ${escapeHtml(document.hasSavedDraft ? (document.draftStatus === "published" ? "publikovaný" : "uložený v KSO") : "načtený z ElevenLabs")}</span>
      </div>
      <label class="sarlota-content-editor__field">
        <span>${escapeHtml(document.title || (kind === "prompt" ? "Hlavní prompt Šarloty" : "Knowledge Base"))}</span>
        <textarea rows="24" spellcheck="true" data-sarlota-content-textarea data-sarlota-content-kind="${escapeHtml(kind)}" ${syncing || editor.publishing ? "disabled" : ""}>${escapeHtml(draft)}</textarea>
        <small data-sarlota-content-count>${escapeHtml(`${draft.length} znaků · úpravy se automaticky neposílají do ElevenLabs`)}</small>
      </label>
      ${validationHtml}
      <details class="sarlota-content-editor__comparison">
        <summary>${hasChanges ? "Porovnat koncept s živou verzí ElevenLabs" : "Koncept odpovídá živé verzi ElevenLabs"}</summary>
        ${hasChanges ? `
          <div>
            <section><strong>ŽIVĚ V ELEVENLABS</strong><pre>${escapeHtml(liveContent)}</pre></section>
            <section><strong>KONCEPT V KSO</strong><pre>${escapeHtml(draft)}</pre></section>
          </div>
        ` : '<p>Mezi konceptem a právě načteným živým obsahem není rozdíl.</p>'}
      </details>
      <div class="sarlota-content-editor__actions">
        <button class="secondary-link" type="button" data-sarlota-content-save data-sarlota-content-kind="${escapeHtml(kind)}" ${syncing || editor.saving || editor.publishing ? "disabled" : ""}>${editor.saving ? "UKLÁDÁM…" : "ULOŽIT KONCEPT V KSO"}</button>
        <button class="primary-action" type="button" data-sarlota-content-publish data-sarlota-content-kind="${escapeHtml(kind)}" ${publishDisabled ? "disabled" : ""}>${editor.publishing ? "PUBLIKUJI…" : "PUBLIKOVAT DO ELEVENLABS"}</button>
      </div>
      <details class="sarlota-content-editor__history">
        <summary>Historie a návrat k předchozí verzi</summary>
        <ul>${versionsHtml}</ul>
      </details>
    </section>
  `;
}

function promptSyncBlockLabels(prompt = {}) {
  if (prompt.willReplaceEntirePrompt) {
    return ["Jeden kanonický prompt: identita, bezpečnost, jazyk, nástroje a modulová pravidla"];
  }

  return [
    [prompt.willAppendDriverReportVehicleRule, "Hlášení řidičů a vozidla"],
    [prompt.willAppendDataBoxContextRule, "Datová schránka"],
    [prompt.willAppendCollectionRoutesCrewTabletRule, "Svozové trasy: tablet osádky a úvodní hlášení"],
    [prompt.willAppendCollectionRoutesContextRule, "Svozové trasy: kontext, počasí, zprávy a paměť"],
    [prompt.willAppendCollectionRoutesGpsRule, "Svozové trasy: GPS stanoviště"],
    [prompt.willAppendCollectionRoutesIncidentRule, "Svozové trasy: hlášení stanoviště"],
    [prompt.willAppendCollectionRoutesDriverActionRule, "Svozové trasy: pracovní kroky řidiče"]
  ].filter(([missing]) => missing).map(([, label]) => label);
}

function promptSyncPreview(plan = null, syncing = false, confirmationPending = false) {
  if (!plan) {
    return "";
  }

  const prompt = plan.prompt || {};
  const agent = plan.agent || {};
  const plannedBlocks = promptSyncBlockLabels(prompt);
  const alreadyApplied = plan.alreadyApplied === true;
  const ready = plan.ready === true;
  const badgeTone = alreadyApplied ? "ok" : ready ? "waiting" : "error";
  const badgeLabel = alreadyApplied ? "SYNCHRONIZOVÁNO" : ready ? "NÁHLED · BEZ ZÁPISU" : "NELZE BEZPEČNĚ ZAPSAT";
  const matchLabel = (value, okText) => value === true ? okText : value === false ? "nesedí" : "neověřeno";
  const blocks = plannedBlocks.length
    ? plannedBlocks.map((label) => `<li>${escapeHtml(label)}</li>`).join("")
    : alreadyApplied
      ? "<li>Žádný chybějící spravovaný blok</li>"
      : ready
        ? "<li>Spravované bloky budou pouze sjednocené na aktuální bezpečnou verzi.</li>"
        : "<li>Plán bloků není bez ověřené konfigurace dostupný.</li>";

  return `
    <section class="sarlota-status__prompt-plan" data-sarlota-prompt-plan>
      <div class="sarlota-status__prompt-plan-head">
        <div>
          <span class="sarlota-status__badge sarlota-status__badge--${escapeHtml(badgeTone)}">${escapeHtml(badgeLabel)}</span>
          <h3>Porovnání promptu · KSO → ElevenLabs</h3>
          <p>Tento krok je pouze čtecí. Až samostatné potvrzení nahradí celý text promptu v ElevenLabs verzí uloženou v KSO; first message, model ani tools se nezmění.</p>
        </div>
      </div>
      <dl class="sarlota-status__prompt-plan-grid">
        ${diagnosticLine("Agent", escapeHtml(`${plan.assistant?.assistantDisplayName || agent.expectedName || "Šarlota"} · ${matchLabel(agent.nameMatches, "ověřen")}`))}
        ${diagnosticLine("First message", escapeHtml(matchLabel(agent.firstMessageMatches, "{{intro_announcement}} ověřeno")))}
        ${diagnosticLine("Cesta promptu", escapeHtml(prompt.path || "nenalezena"))}
        ${diagnosticLine("Délka nyní", escapeHtml(`${Number(prompt.currentLength || 0)} znaků`))}
        ${diagnosticLine("Délka nové verze", escapeHtml(`${Number(prompt.targetLength || 0)} znaků`))}
        ${diagnosticLine("Verze promptu", escapeHtml(prompt.targetVersion || "neuvedena"))}
      </dl>
      <div class="sarlota-status__prompt-plan-blocks">
        <strong>Rozsah kanonické synchronizace</strong>
        <ul>${blocks}</ul>
        ${prompt.legacyRulePresent ? "<p>Starý blok vozidel bude odstraněný.</p>" : ""}
        ${safeArray(prompt.forbiddenPhrasesPresent).length ? `<p>Budou odstraněné zakázané zastaralé fráze: ${escapeHtml(safeArray(prompt.forbiddenPhrasesPresent).length)}.</p>` : ""}
      </div>
      <p class="sarlota-status__prompt-plan-safety">Do prohlížeče se nevrací text promptu, API klíč, Agent ID ani signed URL. Zápis znovu načte živého agenta a projde backendovou bezpečnostní kontrolou.</p>
      ${confirmationPending ? `<p class="module-feedback__warning" role="status">Poslední kontrola před zápisem: druhé kliknutí provede změnu pouze při shodném aktuálním otisku.</p>` : ""}
      <div class="sarlota-status__prompt-plan-actions">
        ${ready ? `<button class="primary-action" type="button" data-sarlota-prompt-apply ${syncing ? "disabled" : ""}>${confirmationPending ? "POTVRDIT NAHRAZENÍ PROMPTU" : "NAHRADIT PROMPT V ELEVENLABS"}</button>` : ""}
        <button class="secondary-link" type="button" data-sarlota-prompt-plan-cancel ${syncing ? "disabled" : ""}>${alreadyApplied ? "ZAVŘÍT NÁHLED" : "ZRUŠIT NÁHLED"}</button>
      </div>
    </section>
  `;
}

function languageSyncPreview(plan = null, syncing = false) {
  if (!plan) return "";

  const knowledge = plan.knowledgeBase || {};
  const dictionary = plan.pronunciationDictionary || {};
  const alreadyApplied = plan.alreadyApplied === true;
  const ready = plan.ready === true;
  const badgeTone = alreadyApplied ? "ok" : ready ? "waiting" : "error";
  const badgeLabel = alreadyApplied ? "SYNCHRONIZOVÁNO" : ready ? "NÁHLED · BEZ ZÁPISU" : "NELZE BEZPEČNĚ ZAPSAT";
  const actionLabel = (action) => ({
    create: "vytvořit a připojit",
    update: "aktualizovat a připojit",
    attach: "připojit existující",
    replace_rules: "nahradit pravidla a připojit",
    blocked_permission: "čeká na oprávnění API klíče",
    none: "beze změny"
  })[action] || "neověřeno";

  return `
    <section class="sarlota-status__prompt-plan" data-sarlota-language-plan>
      <div class="sarlota-status__prompt-plan-head">
        <div>
          <span class="sarlota-status__badge sarlota-status__badge--${escapeHtml(badgeTone)}">${escapeHtml(badgeLabel)}</span>
          <h3>Porovnání KB a výslovnosti · KSO → ElevenLabs</h3>
          <p>Tento krok je pouze čtecí. Až samostatné potvrzení aktualizuje dva přesně pojmenované zdroje Šarloty v ElevenLabs.</p>
        </div>
      </div>
      <dl class="sarlota-status__prompt-plan-grid">
        ${diagnosticLine("Balík", escapeHtml(plan.packageVersion || "neuveden"))}
        ${diagnosticLine("Jazyková KB", escapeHtml(`${knowledge.name || "neuvedena"} · ${actionLabel(knowledge.action)}`))}
        ${diagnosticLine("KB rozsah", escapeHtml(`${Number(knowledge.currentLength || 0)} → ${Number(knowledge.targetLength || 0)} znaků`))}
        ${diagnosticLine("Výslovnost", escapeHtml(`${dictionary.name || "neuvedena"} · ${actionLabel(dictionary.action)}`))}
        ${diagnosticLine("Pravidla", escapeHtml(`${Number(dictionary.currentRuleCount || 0)} → ${Number(dictionary.targetRuleCount || 0)}`))}
        ${diagnosticLine("Agent", escapeHtml(plan.agent?.nameMatches && plan.agent?.firstMessageMatches ? "ověřen" : "nesedí"))}
      </dl>
      <p class="sarlota-status__prompt-plan-safety">Prompt, první zpráva, model a tools se nemění. Cizí KB ani cizí výslovnostní slovníky se nemažou. Text KB, API klíč a plná ID se do prohlížeče nevracejí.</p>
      <div class="sarlota-status__prompt-plan-actions">
        ${ready ? `<button class="primary-action" type="button" data-sarlota-language-apply ${syncing ? "disabled" : ""}>AKTUALIZOVAT KB A VÝSLOVNOST V ELEVENLABS</button>` : ""}
        <button class="secondary-link" type="button" data-sarlota-language-plan-cancel ${syncing ? "disabled" : ""}>${alreadyApplied ? "ZAVŘÍT NÁHLED" : "ZRUŠIT NÁHLED"}</button>
      </div>
    </section>
  `;
}

export function SarlotaStatusPanel({
  status = null,
  loading = false,
  error = "",
  syncing = false,
  syncMessage = "",
  syncError = "",
  selectedAssistantKey = "sarlota",
  voiceDiagnostics = {},
  voiceWriteTest = {},
  promptSyncPlan = null,
  promptSyncConfirmationPending = false,
  languageSyncPlan = null,
  contentEditor = {}
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
    statusRow("Bezpečnost promptu", data.driverReportPrompt?.status || "unverified", driverReportPromptDetail(data.driverReportPrompt)),
    statusRow("Tools", data.tools?.status || "unverified", toolDetail(data.tools)),
    statusRow("Knowledge Base", data.knowledgeBase?.status || "unverified", knowledgeBaseDetail(data.knowledgeBase)),
    statusRow("Kontext vozidel", data.driverReportVehicleContext?.status ? "ok" : "unverified", vehicleContextDetail(data.driverReportVehicleContext)),
    statusRow("Backend kontext vozidel", data.backendDriverReportContext?.status || "unverified", backendVehicleContextDetail(data.backendDriverReportContext)),
    statusRow("Webhook self-test", data.voiceWebhookSelfCheck?.status || "unverified", voiceWebhookSelfCheckDetail(data.voiceWebhookSelfCheck)),
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
  const diagnosticSyncDisabled = loading || syncing || selectedConfig.assistantKey !== "sarlota";
  const smart2RepairDisabled = loading || syncing || selectedConfig.assistantKey !== "sarlota-smart-2";
  const smart2DeleteDisabled = loading || syncing || selectedConfig.assistantKey !== "sarlota-smart-2";
  const voiceWriteTestDisabled = loading || syncing || selectedConfig.assistantKey !== "sarlota";

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
          <button class="primary-action" type="button" data-sarlota-status-refresh ${loading || syncing ? "disabled" : ""}>
            ${loading ? "OVĚŘUJI..." : "OVĚŘIT ELEVENLABS"}
          </button>
        </div>
      </div>
      <section class="sarlota-status__read-only-note" aria-label="Bezpečné ověření ElevenLabs">
        <strong>Bezpečné čtení</strong>
        <span>Tlačítko Ověřit ElevenLabs pouze načte aktuální stav agenta, promptu, tools a připojené Knowledge Base. Nic nemění.</span>
      </section>
      ${sarlotaContentEditor(contentEditor, syncing)}
      <details class="sarlota-status__service-actions sarlota-status__service-actions--write">
        <summary>Tools v ElevenLabs</summary>
        <p class="sarlota-status__service-warning">Aktualizace tools zapisuje jedním směrem z KSO do ElevenLabs a před provedením má vlastní potvrzení.</p>
        <div class="sarlota-status__actions sarlota-status__actions--service">
          <button class="primary-action sarlota-status__sync" type="button" data-sarlota-tools-sync ${loading || syncing ? "disabled" : ""}>
            ${syncing ? "Synchronizuji..." : "AKTUALIZOVAT TOOLS · KSO → ELEVENLABS"}
          </button>
        </div>
        <p>Prompt a Knowledge Base se publikují výhradně z verzovaného editoru výše.</p>
      </details>
      <details class="sarlota-status__service-actions">
        <summary>Technické servisní nástroje</summary>
        <div class="sarlota-status__actions sarlota-status__actions--service">
          <button class="secondary-link sarlota-status__sync" type="button" data-sarlota-smart-2-repair ${smart2RepairDisabled ? "disabled" : ""}>Opravit Smart 2 základ</button>
          <button class="secondary-link sarlota-status__sync" type="button" data-sarlota-smart-2-delete ${smart2DeleteDisabled ? "disabled" : ""}>Smazat test Smart 2</button>
          <button class="secondary-link sarlota-status__sync" type="button" data-sarlota-tools-diagnostic ${diagnosticSyncDisabled ? "disabled" : ""}>Odpojit tools pro diagnostiku</button>
          <button class="secondary-link sarlota-status__sync" type="button" data-sarlota-vehicle-context-diagnostic ${loading || syncing ? "disabled" : ""}>${omitDriverReportVehicleContext ? "Vypnout test bez vozidel" : "Test bez vozidel v hlasu"}</button>
          <button class="secondary-link sarlota-status__sync" type="button" data-sarlota-voice-write-test ${voiceWriteTestDisabled ? "disabled" : ""}>
            Test voice zápisu
          </button>
          <button class="secondary-link sarlota-status__sync" type="button" data-sarlota-test-call ${loading || syncing ? "disabled" : ""}>
            Testovací hovor
          </button>
        </div>
        <p>Určeno pro diagnostiku. Některé kroky mění testovací nebo produkční napojení a vždy mají vlastní potvrzení.</p>
      </details>
      ${error ? `<p class="module-feedback__error" role="alert">${escapeHtml(error)}</p>` : ""}
      ${syncError ? `<p class="module-feedback__error" role="alert">${escapeHtml(syncError)}</p>` : ""}
      ${syncMessage ? `<p class="module-feedback__success" role="status">${escapeHtml(syncMessage)}</p>` : ""}
      ${promptSyncPreview(promptSyncPlan, syncing, promptSyncConfirmationPending)}
      ${languageSyncPreview(languageSyncPlan, syncing)}
      ${voiceWriteTestControls(voiceWriteTest, syncing)}
      <dl class="sarlota-status__grid">
        ${rows}
      </dl>
      ${diagnosticDetails(data)}
      <p class="sarlota-status__meta">
        Ověřeno: ${escapeHtml(generatedAt)}. Běžné ověření je pouze čtecí. Zápisy z KSO do ElevenLabs jsou oddělené a vyžadují vlastní potvrzení.
      </p>
    </section>
  `;
}
