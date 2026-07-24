const DEFAULT_PUBLIC_APP_URL = "https://smart-odpady.ai";
const STOP_SENTENCE = "Pro odhlášení odpovězte STOP.";
const TEMPLATE_KEY_PATTERN = /^[a-z]+(?:[.-][a-z]+)*$/;
const VARIABLE_PATTERN = /\{\{([a-zA-Z][a-zA-Z0-9]*)\}\}/g;

function cleanString(value) {
  return String(value ?? "").replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, "").trim();
}

function template(definition) {
  return Object.freeze({
    orientation: "VERTICAL",
    height: "MEDIUM",
    actions: Object.freeze(definition.actions.map((action) => Object.freeze(action))),
    allowedVariables: Object.freeze([...definition.allowedVariables]),
    sampleVariables: Object.freeze({ ...definition.sampleVariables }),
    ...definition
  });
}

/** @type {Readonly<Record<string, Readonly<object>>>} */
export const RCS_TEMPLATE_REGISTRY = Object.freeze({
  "leave.approved": template({
    key: "leave.approved",
    friendlyName: "kaiser_rcs_leave_approved_v1",
    label: "Dovolená schválena",
    assetFilename: "leave-approved.png",
    titleTemplate: "Dovolená schválena",
    bodyTemplate: "Ahoj {{firstName}}, tvoje dovolená od {{dateFrom}} do {{dateTo}} byla schválena.",
    fallbackTemplate: "Dovolená od {{dateFrom}} do {{dateTo}} byla schválena. Detail: {{detailUrl}}",
    allowedVariables: ["firstName", "dateFrom", "dateTo", "detailUrl"],
    actions: [{ type: "URL", title: "Zobrazit detail", urlTemplate: "{{detailUrl}}" }],
    sampleVariables: {
      firstName: "Radime",
      dateFrom: "1. 8. 2026",
      dateTo: "8. 8. 2026",
      detailUrl: "https://smart-odpady.ai/dovolena-nemoc/moje-zadosti"
    }
  }),
  "leave.pending": template({
    key: "leave.pending",
    friendlyName: "kaiser_rcs_leave_pending_v1",
    label: "Žádost čeká na schválení",
    assetFilename: "",
    titleTemplate: "Žádost čeká na schválení",
    bodyTemplate: "Ahoj {{firstName}}, tvoje žádost o dovolenou od {{dateFrom}} do {{dateTo}} byla přijata a čeká na schválení.",
    fallbackTemplate: "Žádost o dovolenou od {{dateFrom}} do {{dateTo}} čeká na schválení. Detail: {{detailUrl}}",
    allowedVariables: ["firstName", "dateFrom", "dateTo", "detailUrl"],
    actions: [{ type: "URL", title: "Zobrazit žádost", urlTemplate: "{{detailUrl}}" }],
    sampleVariables: {
      firstName: "Radime",
      dateFrom: "1. 8. 2026",
      dateTo: "8. 8. 2026",
      detailUrl: "https://smart-odpady.ai/dovolena-nemoc/moje-zadosti"
    }
  }),
  "ds.new": template({
    key: "ds.new",
    friendlyName: "kaiser_rcs_ds_new_v1",
    label: "Nová datová zpráva",
    assetFilename: "ds-new.png",
    titleTemplate: "Nová datová zpráva",
    bodyTemplate: "Do datové schránky {{dataBoxName}} přišla nová zpráva od {{senderName}}. Předmět: {{subject}}.",
    fallbackTemplate: "Nová datová zpráva od {{senderName}}: {{subject}}. Otevřít: {{detailUrl}}",
    allowedVariables: ["dataBoxName", "senderName", "subject", "detailUrl"],
    actions: [{ type: "URL", title: "Otevřít zprávu", urlTemplate: "{{detailUrl}}" }],
    sampleVariables: {
      dataBoxName: "Kaiser servis",
      senderName: "Magistrát města Brna",
      subject: "Oznámení",
      detailUrl: "https://smart-odpady.ai/datove-schranky-plus"
    }
  }),
  "ds.deadline": template({
    key: "ds.deadline",
    friendlyName: "kaiser_rcs_ds_deadline_v1",
    label: "Blíží se termín odpovědi",
    assetFilename: "ds-deadline.png",
    titleTemplate: "Blíží se termín odpovědi",
    bodyTemplate: "U datové zprávy „{{subject}}“ se blíží termín vyřízení {{deadline}}.",
    fallbackTemplate: "Datová zpráva „{{subject}}“ má termín vyřízení {{deadline}}. Detail: {{detailUrl}}",
    allowedVariables: ["subject", "deadline", "detailUrl"],
    actions: [{ type: "URL", title: "Vyřídit zprávu", urlTemplate: "{{detailUrl}}" }],
    sampleVariables: {
      subject: "Výzva k doplnění",
      deadline: "31. 7. 2026",
      detailUrl: "https://smart-odpady.ai/datove-schranky-plus"
    }
  }),
  "task.new": template({
    key: "task.new",
    friendlyName: "kaiser_rcs_task_new_v1",
    label: "Nový úkol",
    assetFilename: "task-new.png",
    titleTemplate: "Nový úkol",
    bodyTemplate: "Ahoj {{firstName}}, byl ti přiřazen nový úkol: {{taskTitle}}. Termín: {{deadline}}.",
    fallbackTemplate: "Nový úkol: {{taskTitle}}. Termín: {{deadline}}. Detail: {{detailUrl}}",
    allowedVariables: ["firstName", "taskTitle", "deadline", "detailUrl"],
    actions: [{ type: "URL", title: "Otevřít úkol", urlTemplate: "{{detailUrl}}" }],
    sampleVariables: {
      firstName: "Radime",
      taskTitle: "Zkontrolovat svozovou trasu",
      deadline: "31. 7. 2026",
      detailUrl: "https://smart-odpady.ai/dashboard"
    }
  }),
  "vehicle.fault": template({
    key: "vehicle.fault",
    friendlyName: "kaiser_rcs_vehicle_fault_v1",
    label: "Nové hlášení vozidla",
    assetFilename: "vehicle-fault.png",
    titleTemplate: "Nové hlášení vozidla",
    bodyTemplate: "U vozidla {{vehicleName}} bylo nahlášeno: {{faultSummary}}.",
    fallbackTemplate: "Vozidlo {{vehicleName}}: {{faultSummary}}. Detail: {{detailUrl}}",
    allowedVariables: ["vehicleName", "faultSummary", "detailUrl"],
    actions: [{ type: "URL", title: "Otevřít hlášení", urlTemplate: "{{detailUrl}}" }],
    sampleVariables: {
      vehicleName: "Mercedes 01",
      faultSummary: "Kontrola brzdového systému",
      detailUrl: "https://smart-odpady.ai/hlaseni-ridicu"
    }
  }),
  "critical.alert": template({
    key: "critical.alert",
    friendlyName: "kaiser_rcs_critical_alert_v1",
    label: "Důležité upozornění",
    assetFilename: "critical-alert.png",
    titleTemplate: "Důležité upozornění",
    bodyTemplate: "{{alertMessage}}",
    fallbackTemplate: "Důležité upozornění: {{alertMessage}} {{detailUrl}}",
    allowedVariables: ["alertMessage", "detailUrl"],
    actions: [{ type: "URL", title: "Zobrazit detail", urlTemplate: "{{detailUrl}}" }],
    sampleVariables: {
      alertMessage: "Provozní událost vyžaduje tvoji pozornost.",
      detailUrl: "https://smart-odpady.ai/nastaveni"
    }
  }),
  "general.info": template({
    key: "general.info",
    friendlyName: "kaiser_rcs_general_info_v1",
    label: "Zpráva od Šarloty",
    assetFilename: "general-info.png",
    titleTemplate: "Zpráva od Šarloty",
    bodyTemplate: "{{message}}",
    fallbackTemplate: "Šarlota: {{message}} {{detailUrl}}",
    allowedVariables: ["message", "detailUrl"],
    actions: [{ type: "URL", title: "Zobrazit detail", urlTemplate: "{{detailUrl}}" }],
    sampleVariables: {
      message: "V KSO je pro tebe nová provozní informace.",
      detailUrl: "https://smart-odpady.ai/nastaveni"
    }
  })
});

function publicAppUrl(env = {}) {
  const value = cleanString(env.PUBLIC_APP_URL || env.APP_PUBLIC_URL || env.APP_BASE_URL || DEFAULT_PUBLIC_APP_URL);
  try {
    const url = new URL(value);
    return `${url.protocol}//${url.host}`;
  } catch {
    return DEFAULT_PUBLIC_APP_URL;
  }
}

function variableNames(source) {
  return [...String(source || "").matchAll(VARIABLE_PATTERN)].map((match) => match[1]);
}

function validateDefinition(definition) {
  if (!definition || !TEMPLATE_KEY_PATTERN.test(definition.key)) {
    throw new Error("RCS šablona má neplatný interní klíč.");
  }
  const usedVariables = new Set([
    ...variableNames(definition.titleTemplate),
    ...variableNames(definition.bodyTemplate),
    ...variableNames(definition.fallbackTemplate),
    ...definition.actions.flatMap((action) => variableNames(action.urlTemplate))
  ]);
  for (const variable of usedVariables) {
    if (!definition.allowedVariables.includes(variable)) {
      throw new Error(`RCS šablona ${definition.key} používá nepovolenou proměnnou ${variable}.`);
    }
  }
  return definition;
}

export function getRcsTemplate(templateKey) {
  const key = cleanString(templateKey);
  const definition = RCS_TEMPLATE_REGISTRY[key];
  if (!definition) throw new Error(`Neznámý templateKey: ${key || "neuvedeno"}.`);
  return validateDefinition(definition);
}

function validateDetailUrl(value, env = {}) {
  const candidate = cleanString(value);
  let url;
  try {
    url = new URL(candidate, publicAppUrl(env));
  } catch {
    throw new Error("detailUrl není platná URL.");
  }
  if (url.origin !== publicAppUrl(env)) {
    throw new Error("detailUrl musí vést na povolenou doménu KSO.");
  }
  if (!url.pathname || url.pathname === "/") {
    throw new Error("detailUrl musí vést na konkrétní detail v KSO.");
  }
  return url.toString();
}

export function validateRcsVariables(definition, variables = {}, env = {}) {
  const source = variables && typeof variables === "object" && !Array.isArray(variables) ? variables : {};
  const unknown = Object.keys(source).filter((key) => !definition.allowedVariables.includes(key));
  if (unknown.length) throw new Error(`Nepovolené proměnné: ${unknown.join(", ")}.`);

  const normalized = {};
  for (const key of definition.allowedVariables) {
    const rawValue = cleanString(source[key]);
    if (!rawValue) throw new Error(`Chybí povinná proměnná: ${key}.`);
    if (rawValue.length > 1200) throw new Error(`Proměnná ${key} je příliš dlouhá.`);
    if (rawValue.includes("{{") || rawValue.includes("}}")) {
      throw new Error(`Proměnná ${key} obsahuje nepovolenou šablonovou značku.`);
    }
    normalized[key] = key === "detailUrl" ? validateDetailUrl(rawValue, env) : rawValue;
  }
  return normalized;
}

function renderText(source, values) {
  return String(source || "").replace(VARIABLE_PATTERN, (_, key) => values[key]);
}

export function renderRcsTemplate(templateKey, variables, env = {}) {
  const definition = getRcsTemplate(templateKey);
  if (!definition.assetFilename) {
    const error = new Error(`Šablona ${definition.key} nemá schválený banner.`);
    error.code = "asset_missing";
    throw error;
  }
  const values = validateRcsVariables(definition, variables, env);
  const fallback = `${renderText(definition.fallbackTemplate, values)} ${STOP_SENTENCE}`;
  return {
    key: definition.key,
    friendlyName: definition.friendlyName,
    title: renderText(definition.titleTemplate, values),
    body: renderText(definition.bodyTemplate, values),
    fallback,
    bannerUrl: `${publicAppUrl(env)}/rcs/templates/${definition.assetFilename}`,
    actions: definition.actions.map((action) => ({
      type: action.type,
      title: action.title,
      url: renderText(action.urlTemplate, values)
    })),
    variables: values
  };
}

function numberedSource(source, variableIndexes) {
  return String(source || "").replace(VARIABLE_PATTERN, (_, key) => `{{${variableIndexes[key]}}}`);
}

function sampleVariablesForEnv(definition, env = {}) {
  const samples = { ...definition.sampleVariables };
  if (samples.detailUrl) {
    const sampleUrl = new URL(samples.detailUrl);
    samples.detailUrl = `${publicAppUrl(env)}${sampleUrl.pathname}${sampleUrl.search}${sampleUrl.hash}`;
  }
  return samples;
}

export function twilioContentDefinition(templateKey, env = {}) {
  const definition = getRcsTemplate(templateKey);
  if (!definition.assetFilename) {
    return { key: definition.key, status: "asset_missing", enabled: false };
  }
  const variableIndexes = Object.fromEntries(definition.allowedVariables.map((key, index) => [key, index + 1]));
  const samples = validateRcsVariables(definition, sampleVariablesForEnv(definition, env), env);
  const variables = Object.fromEntries(definition.allowedVariables.map((key, index) => [
    String(index + 1),
    samples[key]
  ]));
  return {
    key: definition.key,
    friendly_name: definition.friendlyName,
    language: "cs",
    variables,
    types: {
      "twilio/card": {
        title: numberedSource(definition.titleTemplate, variableIndexes),
        body: numberedSource(definition.bodyTemplate, variableIndexes),
        media: [`${publicAppUrl(env)}/rcs/templates/${definition.assetFilename}`],
        orientation: definition.orientation,
        height: definition.height,
        actions: definition.actions.map((action) => ({
          type: action.type,
          title: action.title,
          url: numberedSource(action.urlTemplate, variableIndexes)
        }))
      },
      "twilio/text": {
        body: `${numberedSource(definition.fallbackTemplate, variableIndexes)} ${STOP_SENTENCE}`
      }
    }
  };
}

export function rcsContentVariables(templateKey, variables, env = {}) {
  const definition = getRcsTemplate(templateKey);
  const values = validateRcsVariables(definition, variables, env);
  return Object.fromEntries(definition.allowedVariables.map((key, index) => [String(index + 1), values[key]]));
}

export function rcsTemplatePreviewList(env = {}, syncRows = []) {
  const syncByKey = new Map(syncRows.map((row) => [row.templateKey, row]));
  return Object.values(RCS_TEMPLATE_REGISTRY).map((definition) => {
    const sync = syncByKey.get(definition.key) || {};
    if (!definition.assetFilename) {
      return {
        ...definition,
        bannerUrl: "",
        contentSid: "",
        syncStatus: "asset_missing",
        enabled: false,
        lastSyncedAt: "",
        errorMessage: "Schválený banner v dodaném balíčku chybí."
      };
    }
    const sampleVariables = sampleVariablesForEnv(definition, env);
    const preview = renderRcsTemplate(definition.key, sampleVariables, env);
    return {
      key: definition.key,
      label: definition.label,
      friendlyName: definition.friendlyName,
      bannerUrl: preview.bannerUrl,
      sampleTitle: preview.title,
      sampleBody: preview.body,
      sampleFallback: preview.fallback,
      sampleVariables,
      actions: preview.actions,
      allowedVariables: [...definition.allowedVariables],
      contentSid: cleanString(sync.contentSid),
      syncStatus: cleanString(sync.syncStatus) || "content_sid_missing",
      enabled: Boolean(sync.contentSid && sync.syncStatus === "ready"),
      lastSyncedAt: cleanString(sync.lastSyncedAt),
      errorMessage: cleanString(sync.errorMessage)
    };
  });
}

export const __test = {
  STOP_SENTENCE,
  publicAppUrl,
  renderText,
  sampleVariablesForEnv,
  validateDetailUrl,
  variableNames
};
