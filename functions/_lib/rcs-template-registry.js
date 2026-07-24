const DEFAULT_PUBLIC_APP_URL = "https://smart-odpady.ai";
const STOP_SENTENCE = "Pro odhlášení odpovězte STOP.";
const MAX_BODY_LENGTH = 140;
const TEMPLATE_KEY_PATTERN = /^[a-z]+(?:[.-][a-z]+)*$/;
const VARIABLE_PATTERN = /\{\{([a-zA-Z][a-zA-Z0-9]*)\}\}/g;
const CZECH_MONTHS = Object.freeze([
  "ledna",
  "února",
  "března",
  "dubna",
  "května",
  "června",
  "července",
  "srpna",
  "září",
  "října",
  "listopadu",
  "prosince"
]);

function cleanString(value) {
  return String(value ?? "").replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, "").trim();
}

function template(definition) {
  return Object.freeze({
    orientation: "VERTICAL",
    height: "MEDIUM",
    actions: Object.freeze(definition.actions.map((action) => Object.freeze(action))),
    allowedVariables: Object.freeze([...definition.allowedVariables]),
    optionalVariables: Object.freeze([...(definition.optionalVariables || [])]),
    derivedVariables: Object.freeze([...(definition.derivedVariables || [])]),
    shortVariables: Object.freeze({ ...(definition.shortVariables || {}) }),
    sampleVariables: Object.freeze({ ...definition.sampleVariables }),
    ...definition
  });
}

/** @type {Readonly<Record<string, Readonly<object>>>} */
export const RCS_TEMPLATE_REGISTRY = Object.freeze({
  "leave.approved": template({
    key: "leave.approved",
    friendlyName: "kaiser_rcs_leave_approved_v2",
    label: "Dovolená schválena",
    assetFilename: "leave-approved.png",
    titleTemplate: "Dovolená schválena",
    bodyTemplate: "{{bodyPrefix}} {{dateRange}} je schválená.",
    fallbackTemplate: "{{fallbackPrefix}} {{dateRange}} je schválená.",
    allowedVariables: ["firstName", "dateFrom", "dateTo", "detailUrl"],
    optionalVariables: ["firstName"],
    derivedVariables: ["bodyPrefix", "fallbackPrefix", "dateRange"],
    bodyPrefixWithName: "Ahoj {{firstName}}, dovolená",
    bodyPrefixWithoutName: "Dovolená",
    fallbackPrefixWithName: "Ahoj {{firstName}}, dovolená",
    fallbackPrefixWithoutName: "Dovolená",
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
    friendlyName: "kaiser_rcs_leave_pending_v2",
    label: "Žádost čeká",
    assetFilename: "",
    titleTemplate: "Žádost čeká",
    bodyTemplate: "{{bodyPrefix}} {{dateRange}} čeká na schválení.",
    fallbackTemplate: "{{fallbackPrefix}} {{dateRange}} čeká na schválení.",
    allowedVariables: ["firstName", "dateFrom", "dateTo", "detailUrl"],
    optionalVariables: ["firstName"],
    derivedVariables: ["bodyPrefix", "fallbackPrefix", "dateRange"],
    bodyPrefixWithName: "Ahoj {{firstName}}, žádost o dovolenou",
    bodyPrefixWithoutName: "Žádost o dovolenou",
    fallbackPrefixWithName: "Ahoj {{firstName}}, žádost o dovolenou",
    fallbackPrefixWithoutName: "Žádost o dovolenou",
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
    friendlyName: "kaiser_rcs_ds_new_v2",
    label: "Nová datová zpráva",
    assetFilename: "ds-new.png",
    titleTemplate: "Nová datová zpráva",
    bodyTemplate: "{{bodyPrefix}} od {{senderName}}: {{subjectShort}}.",
    fallbackTemplate: "{{fallbackPrefix}} od {{senderName}}: {{subjectShort}}.",
    allowedVariables: ["firstName", "senderName", "subject", "detailUrl"],
    optionalVariables: ["firstName"],
    derivedVariables: ["bodyPrefix", "fallbackPrefix", "subjectShort"],
    bodyPrefixWithName: "Ahoj {{firstName}}, přišla zpráva",
    bodyPrefixWithoutName: "Přišla zpráva",
    fallbackPrefixWithName: "Ahoj {{firstName}}, nová datová zpráva",
    fallbackPrefixWithoutName: "Nová datová zpráva",
    shortVariables: { subjectShort: { source: "subject", maxLength: 45 } },
    actions: [{ type: "URL", title: "Otevřít zprávu", urlTemplate: "{{detailUrl}}" }],
    sampleVariables: {
      firstName: "Radime",
      senderName: "Magistrát města Brna",
      subject: "Oznámení",
      detailUrl: "https://smart-odpady.ai/datove-schranky-plus"
    }
  }),
  "ds.deadline": template({
    key: "ds.deadline",
    friendlyName: "kaiser_rcs_ds_deadline_v2",
    label: "Blíží se termín",
    assetFilename: "ds-deadline.png",
    titleTemplate: "Blíží se termín",
    bodyTemplate: "{{bodyPrefix}} „{{subjectShort}}“ je potřeba vyřídit do {{deadlineShort}}.",
    fallbackTemplate: "{{fallbackPrefix}} „{{subjectShort}}“ je potřeba vyřídit do {{deadlineShort}}.",
    allowedVariables: ["firstName", "subject", "deadline", "detailUrl"],
    optionalVariables: ["firstName"],
    derivedVariables: ["bodyPrefix", "fallbackPrefix", "subjectShort", "deadlineShort"],
    bodyPrefixWithName: "Ahoj {{firstName}}, zprávu",
    bodyPrefixWithoutName: "Zprávu",
    fallbackPrefixWithName: "Ahoj {{firstName}}, zprávu",
    fallbackPrefixWithoutName: "Zprávu",
    shortVariables: { subjectShort: { source: "subject", maxLength: 45 } },
    actions: [{ type: "URL", title: "Vyřídit zprávu", urlTemplate: "{{detailUrl}}" }],
    sampleVariables: {
      firstName: "Radime",
      subject: "Výzva k doplnění",
      deadline: "31. 7. 2026",
      detailUrl: "https://smart-odpady.ai/datove-schranky-plus"
    }
  }),
  "task.new": template({
    key: "task.new",
    friendlyName: "kaiser_rcs_task_new_v2",
    label: "Nový úkol",
    assetFilename: "task-new.png",
    titleTemplate: "Nový úkol",
    bodyTemplate: "{{bodyPrefix}}: {{taskTitleShort}}. Termín {{deadlineShort}}.",
    fallbackTemplate: "{{fallbackPrefix}}: {{taskTitleShort}}. Termín {{deadlineShort}}.",
    allowedVariables: ["firstName", "taskTitle", "deadline", "detailUrl"],
    optionalVariables: ["firstName"],
    derivedVariables: ["bodyPrefix", "fallbackPrefix", "taskTitleShort", "deadlineShort"],
    bodyPrefixWithName: "Ahoj {{firstName}}, nový úkol",
    bodyPrefixWithoutName: "Nový úkol",
    fallbackPrefixWithName: "Ahoj {{firstName}}, nový úkol",
    fallbackPrefixWithoutName: "Nový úkol",
    shortVariables: { taskTitleShort: { source: "taskTitle", maxLength: 45 } },
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
    friendlyName: "kaiser_rcs_vehicle_fault_v2",
    label: "Nové hlášení vozidla",
    assetFilename: "vehicle-fault.png",
    titleTemplate: "Nové hlášení vozidla",
    bodyTemplate: "{{bodyPrefix}} {{vehicleName}} bylo nahlášeno: {{faultSummaryShort}}.",
    fallbackTemplate: "{{fallbackPrefix}}{{vehicleName}}: {{faultSummaryShort}}.",
    allowedVariables: ["firstName", "vehicleName", "faultSummary", "detailUrl"],
    optionalVariables: ["firstName"],
    derivedVariables: ["bodyPrefix", "fallbackPrefix", "faultSummaryShort"],
    bodyPrefixWithName: "Ahoj {{firstName}}, u",
    bodyPrefixWithoutName: "U",
    fallbackPrefixWithName: "Ahoj {{firstName}}, ",
    fallbackPrefixWithoutName: "",
    shortVariables: { faultSummaryShort: { source: "faultSummary", maxLength: 55 } },
    actions: [{ type: "URL", title: "Otevřít hlášení", urlTemplate: "{{detailUrl}}" }],
    sampleVariables: {
      firstName: "Radime",
      vehicleName: "Mercedes 01",
      faultSummary: "Kontrola brzdového systému",
      detailUrl: "https://smart-odpady.ai/hlaseni-ridicu"
    }
  }),
  "critical.alert": template({
    key: "critical.alert",
    friendlyName: "kaiser_rcs_critical_alert_v2",
    label: "Důležité upozornění",
    assetFilename: "critical-alert.png",
    titleTemplate: "Důležité upozornění",
    bodyTemplate: "{{bodyPrefix}}{{alertMessageShort}}",
    fallbackTemplate: "{{fallbackPrefix}}{{alertMessageShort}}",
    allowedVariables: ["firstName", "alertMessage", "detailUrl"],
    optionalVariables: ["firstName"],
    derivedVariables: ["bodyPrefix", "fallbackPrefix", "alertMessageShort"],
    bodyPrefixWithName: "Ahoj {{firstName}}, ",
    bodyPrefixWithoutName: "",
    fallbackPrefixWithName: "Ahoj {{firstName}}, ",
    fallbackPrefixWithoutName: "",
    shortVariables: { alertMessageShort: { source: "alertMessage", maxLength: 80 } },
    actions: [{ type: "URL", title: "Zobrazit detail", urlTemplate: "{{detailUrl}}" }],
    sampleVariables: {
      firstName: "Radime",
      alertMessage: "Provozní událost vyžaduje tvoji pozornost.",
      detailUrl: "https://smart-odpady.ai/nastaveni"
    }
  }),
  "general.info": template({
    key: "general.info",
    friendlyName: "kaiser_rcs_general_info_v2",
    label: "Zpráva od Šarloty",
    assetFilename: "general-info.png",
    titleTemplate: "Zpráva od Šarloty",
    bodyTemplate: "{{bodyPrefix}}{{messageShort}}",
    fallbackTemplate: "{{fallbackPrefix}}{{messageShort}}",
    allowedVariables: ["firstName", "message", "detailUrl"],
    optionalVariables: ["firstName"],
    derivedVariables: ["bodyPrefix", "fallbackPrefix", "messageShort"],
    bodyPrefixWithName: "Ahoj {{firstName}}, ",
    bodyPrefixWithoutName: "",
    fallbackPrefixWithName: "Ahoj {{firstName}}, ",
    fallbackPrefixWithoutName: "",
    shortVariables: { messageShort: { source: "message", maxLength: 80 } },
    actions: [{ type: "URL", title: "Zobrazit detail", urlTemplate: "{{detailUrl}}" }],
    sampleVariables: {
      firstName: "Radime",
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

function uniqueVariableNames(definition) {
  return [...new Set([
    ...variableNames(definition.titleTemplate),
    ...variableNames(definition.bodyTemplate),
    ...variableNames(definition.fallbackTemplate),
    ...definition.actions.flatMap((action) => variableNames(action.urlTemplate))
  ])];
}

function graphemes(value) {
  const text = String(value ?? "");
  if (typeof Intl?.Segmenter === "function") {
    const segmenter = new Intl.Segmenter("cs", { granularity: "grapheme" });
    return [...segmenter.segment(text)].map((part) => part.segment);
  }
  return Array.from(text);
}

export function rcsTextLength(value) {
  return graphemes(value).length;
}

function protectedTextParts(value) {
  const text = cleanString(value);
  const pattern = /(https?:\/\/[^\s]+|&(?:#\d+|#x[0-9a-f]+|[a-z][a-z0-9]+);)/giu;
  const parts = [];
  let cursor = 0;
  for (const match of text.matchAll(pattern)) {
    const index = match.index ?? 0;
    if (index > cursor) parts.push(...graphemes(text.slice(cursor, index)));
    parts.push(match[0]);
    cursor = index + match[0].length;
  }
  if (cursor < text.length) parts.push(...graphemes(text.slice(cursor)));
  return parts;
}

export function shortenRcsText(value, maxLength) {
  const text = cleanString(value);
  const limit = Math.max(1, Number(maxLength) || 1);
  if (rcsTextLength(text) <= limit) return text;
  const parts = protectedTextParts(text);
  const kept = [];
  let length = 0;
  for (const part of parts) {
    const partLength = rcsTextLength(part);
    if (length + partLength > limit - 1) break;
    kept.push(part);
    length += partLength;
  }
  return `${kept.join("").trimEnd()}…`;
}

function parseCzechDate(value) {
  const text = cleanString(value);
  let match = text.match(/^(\d{4})-(\d{2})-(\d{2})(?:T.*)?$/);
  if (match) {
    return { year: Number(match[1]), month: Number(match[2]), day: Number(match[3]) };
  }
  match = text.match(/^(\d{1,2})\.\s*(\d{1,2})\.\s*(\d{4})$/);
  if (match) {
    return { year: Number(match[3]), month: Number(match[2]), day: Number(match[1]) };
  }
  return null;
}

function validDateParts(parts) {
  if (!parts || parts.month < 1 || parts.month > 12 || parts.day < 1 || parts.day > 31) return false;
  const date = new Date(Date.UTC(parts.year, parts.month - 1, parts.day));
  return date.getUTCFullYear() === parts.year
    && date.getUTCMonth() === parts.month - 1
    && date.getUTCDate() === parts.day;
}

function formatCzechDateParts(parts) {
  return `${parts.day}. ${CZECH_MONTHS[parts.month - 1]} ${parts.year}`;
}

export function formatCzechDateShort(value) {
  const parts = parseCzechDate(value);
  return validDateParts(parts) ? formatCzechDateParts(parts) : cleanString(value);
}

export function formatCzechDateRange(dateFrom, dateTo) {
  const from = parseCzechDate(dateFrom);
  const to = parseCzechDate(dateTo);
  if (!validDateParts(from) || !validDateParts(to)) {
    return `${cleanString(dateFrom)}–${cleanString(dateTo)}`;
  }
  if (from.year === to.year && from.month === to.month && from.day === to.day) {
    return formatCzechDateParts(from);
  }
  if (from.year === to.year && from.month === to.month) {
    return `${from.day}.–${to.day}. ${CZECH_MONTHS[from.month - 1]} ${from.year}`;
  }
  if (from.year === to.year) {
    return `${from.day}. ${CZECH_MONTHS[from.month - 1]}–${to.day}. ${CZECH_MONTHS[to.month - 1]} ${from.year}`;
  }
  return `${formatCzechDateParts(from)}–${formatCzechDateParts(to)}`;
}

function validateDefinition(definition) {
  if (!definition || !TEMPLATE_KEY_PATTERN.test(definition.key)) {
    throw new Error("RCS šablona má neplatný interní klíč.");
  }
  if (definition.actions.length !== 1
    || definition.actions[0].type !== "URL"
    || !cleanString(definition.actions[0].title)
    || !cleanString(definition.actions[0].urlTemplate)) {
    throw new Error(`RCS šablona ${definition.key} musí obsahovat právě jedno platné URL tlačítko.`);
  }
  const permitted = new Set([...definition.allowedVariables, ...definition.derivedVariables]);
  const usedVariables = new Set(uniqueVariableNames(definition));
  for (const variable of usedVariables) {
    if (!permitted.has(variable)) {
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
    if (!rawValue && !definition.optionalVariables.includes(key)) {
      throw new Error(`Chybí povinná proměnná: ${key}.`);
    }
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

function derivedValues(definition, values) {
  const result = {
    ...values
  };
  if (definition.derivedVariables.includes("bodyPrefix")) {
    result.bodyPrefix = renderText(
      values.firstName ? definition.bodyPrefixWithName : definition.bodyPrefixWithoutName,
      values
    );
  }
  if (definition.derivedVariables.includes("fallbackPrefix")) {
    result.fallbackPrefix = renderText(
      values.firstName ? definition.fallbackPrefixWithName : definition.fallbackPrefixWithoutName,
      values
    );
  }
  if (definition.derivedVariables.includes("dateRange")) {
    result.dateRange = formatCzechDateRange(values.dateFrom, values.dateTo);
  }
  if (definition.derivedVariables.includes("deadlineShort")) {
    result.deadlineShort = formatCzechDateShort(values.deadline);
  }
  for (const [target, config] of Object.entries(definition.shortVariables)) {
    result[target] = shortenRcsText(values[config.source], config.maxLength);
  }
  return result;
}

function fitBodyToLimit(definition, sourceValues, values) {
  let body = renderText(definition.bodyTemplate, values);
  if (rcsTextLength(body) <= MAX_BODY_LENGTH) return { values, body };
  const fitted = { ...values };
  for (const [target, config] of Object.entries(definition.shortVariables)) {
    const overflow = rcsTextLength(body) - MAX_BODY_LENGTH;
    if (overflow <= 0) break;
    const currentLength = rcsTextLength(fitted[target]);
    const nextLimit = Math.max(1, currentLength - overflow);
    fitted[target] = shortenRcsText(sourceValues[config.source], nextLimit);
    body = renderText(definition.bodyTemplate, fitted);
  }
  if (rcsTextLength(body) > MAX_BODY_LENGTH) {
    throw new Error(`Body šablony ${definition.key} překračuje limit ${MAX_BODY_LENGTH} znaků.`);
  }
  return { values: fitted, body };
}

function renderTemplateContent(definition, variables, env = {}) {
  const sourceValues = validateRcsVariables(definition, variables, env);
  const derived = derivedValues(definition, sourceValues);
  const fitted = fitBodyToLimit(definition, sourceValues, derived);
  const title = renderText(definition.titleTemplate, fitted.values);
  const fallbackText = renderText(definition.fallbackTemplate, fitted.values);
  const fallback = `${fallbackText} ${sourceValues.detailUrl} ${STOP_SENTENCE}`;
  const actions = definition.actions.map((action) => ({
    type: action.type,
    title: action.title,
    url: renderText(action.urlTemplate, fitted.values)
  }));
  if (!actions[0]?.title || !actions[0]?.url) {
    throw new Error(`RCS šablona ${definition.key} nemá platné tlačítko.`);
  }
  return {
    key: definition.key,
    friendlyName: definition.friendlyName,
    title,
    body: fitted.body,
    fallback,
    bannerUrl: `${publicAppUrl(env)}/rcs/templates/${definition.assetFilename}`,
    actions,
    variables: sourceValues,
    contentVariables: {
      ...fitted.values,
      bodyText: fitted.body,
      fallbackText
    },
    titleLength: rcsTextLength(title),
    bodyLength: rcsTextLength(fitted.body),
    bodyLengthStatus: rcsTextLength(fitted.body) <= MAX_BODY_LENGTH ? "ok" : "too_long"
  };
}

export function renderRcsTemplate(templateKey, variables, env = {}) {
  const definition = getRcsTemplate(templateKey);
  if (!definition.assetFilename) {
    const error = new Error(`Šablona ${definition.key} nemá schválený banner.`);
    error.code = "asset_missing";
    throw error;
  }
  return renderTemplateContent(definition, variables, env);
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
  const preview = renderTemplateContent(definition, sampleVariablesForEnv(definition, env), env);
  if (preview.bodyLength > MAX_BODY_LENGTH) {
    throw new Error(`Body šablony ${definition.key} překračuje limit ${MAX_BODY_LENGTH} znaků.`);
  }
  const contentVariableNames = ["bodyText", "fallbackText", "detailUrl"];
  const variableIndexes = Object.fromEntries(contentVariableNames.map((key, index) => [key, index + 1]));
  const variables = Object.fromEntries(contentVariableNames.map((key, index) => [
    String(index + 1),
    preview.contentVariables[key]
  ]));
  return {
    key: definition.key,
    friendly_name: definition.friendlyName,
    language: "cs",
    variables,
    types: {
      "twilio/card": {
        title: definition.titleTemplate,
        body: numberedSource("{{bodyText}}", variableIndexes),
        media: [`${publicAppUrl(env)}/rcs/templates/${definition.assetFilename}`],
        orientation: definition.orientation,
        height: definition.height,
        actions: definition.actions.map((action) => ({
          type: action.type,
          title: action.title,
          url: numberedSource("{{detailUrl}}", variableIndexes)
        }))
      },
      "twilio/text": {
        body: `${numberedSource("{{fallbackText}}", variableIndexes)} ${numberedSource("{{detailUrl}}", variableIndexes)} ${STOP_SENTENCE}`
      }
    }
  };
}

export function rcsContentVariables(templateKey, variables, env = {}) {
  const definition = getRcsTemplate(templateKey);
  const rendered = renderTemplateContent(definition, variables, env);
  const contentVariableNames = ["bodyText", "fallbackText", "detailUrl"];
  return Object.fromEntries(contentVariableNames.map((key, index) => [
    String(index + 1),
    rendered.contentVariables[key]
  ]));
}

export function rcsTemplatePreviewList(env = {}, syncRows = []) {
  const syncByKey = new Map(syncRows.map((row) => [row.templateKey, row]));
  return Object.values(RCS_TEMPLATE_REGISTRY).map((definition) => {
    const sync = syncByKey.get(definition.key) || {};
    if (!definition.assetFilename) {
      const sampleVariables = sampleVariablesForEnv(definition, env);
      const preview = renderTemplateContent(definition, sampleVariables, env);
      return {
        key: definition.key,
        label: definition.label,
        friendlyName: definition.friendlyName,
        bannerUrl: "",
        sampleTitle: preview.title,
        sampleBody: preview.body,
        sampleFallback: preview.fallback,
        sampleVariables,
        actions: preview.actions,
        allowedVariables: [...definition.allowedVariables],
        titleLength: preview.titleLength,
        bodyLength: preview.bodyLength,
        bodyLengthStatus: preview.bodyLengthStatus,
        actionStatus: preview.actions[0]?.title && preview.actions[0]?.url ? "ok" : "missing",
        synchronizable: false,
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
      titleLength: preview.titleLength,
      bodyLength: preview.bodyLength,
      bodyLengthStatus: preview.bodyLengthStatus,
      actionStatus: preview.actions[0]?.title && preview.actions[0]?.url ? "ok" : "missing",
      synchronizable: preview.bodyLength <= MAX_BODY_LENGTH && Boolean(preview.actions[0]?.title && preview.actions[0]?.url),
      contentSid: cleanString(sync.contentSid),
      syncStatus: cleanString(sync.syncStatus) || "content_sid_missing",
      enabled: Boolean(sync.contentSid && sync.syncStatus === "ready"),
      lastSyncedAt: cleanString(sync.lastSyncedAt),
      errorMessage: cleanString(sync.errorMessage)
    };
  });
}

export const __test = {
  MAX_BODY_LENGTH,
  STOP_SENTENCE,
  derivedValues,
  publicAppUrl,
  renderText,
  sampleVariablesForEnv,
  validateDetailUrl,
  variableNames
};
