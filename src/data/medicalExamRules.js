const DAY_MS = 24 * 60 * 60 * 1000;
const PRAGUE_TIME_ZONE = "Europe/Prague";

export const MEDICAL_EXAM_STATUS_LABELS = {
  ok: "V pořádku",
  due_soon: "Blíží se",
  overdue: "Po termínu",
  not_tracked: "Nehlídá se",
  missing_data: "Chybí údaje"
};

export const MEDICAL_EXAM_STATUS_TONES = {
  ok: "ready",
  due_soon: "warning",
  overdue: "danger",
  not_tracked: "muted",
  missing_data: "waiting"
};

export const MEDICAL_EXAM_RULES = {
  administration_i: {
    label: "administrativa I.",
    fullLabel: "vstupní lékařská prohlídka - administrativa I.",
    required: false,
    noExam: true
  },
  driver_ii: {
    label: "řidič II.",
    fullLabel: "vstupní lékařská prohlídka - řidič II.",
    under50Months: 48,
    over50Months: 24,
    required: true
  },
  wastewater_operator_ii: {
    label: "obsluha ČOV II.",
    fullLabel: "vstupní lékařská prohlídka - obsluha ČOV II.",
    under50Months: 48,
    over50Months: 48,
    required: true
  },
  technician_ii: {
    label: "technik II.",
    fullLabel: "vstupní lékařská prohlídka - technik II.",
    under50Months: 48,
    over50Months: 48,
    required: false,
    note: "není ze zákona povinná"
  }
};

export const MEDICAL_EXAM_CATEGORY_OPTIONS = Object.entries(MEDICAL_EXAM_RULES)
  .map(([value, rule]) => ({ value, label: rule.label }));

function cleanString(value) {
  return String(value ?? "").trim();
}

function normalizeLookupText(value) {
  return cleanString(value)
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

export function normalizeMedicalExamCategory(value) {
  const cleaned = cleanString(value);

  if (MEDICAL_EXAM_RULES[cleaned]) {
    return cleaned;
  }

  const lookup = normalizeLookupText(cleaned);
  const matched = Object.entries(MEDICAL_EXAM_RULES).find(([key, rule]) => (
    normalizeLookupText(key) === lookup ||
    normalizeLookupText(rule.label) === lookup ||
    normalizeLookupText(rule.fullLabel) === lookup
  ));

  return matched?.[0] || "";
}

export function medicalExamDateValue(value) {
  const cleaned = cleanString(value);
  return /^\d{4}-\d{2}-\d{2}$/.test(cleaned) ? cleaned : "";
}

function dateParts(value) {
  const cleaned = medicalExamDateValue(value);
  if (!cleaned) {
    return null;
  }

  const [year, month, day] = cleaned.split("-").map((part) => Number(part));
  if (!Number.isInteger(year) || !Number.isInteger(month) || !Number.isInteger(day)) {
    return null;
  }

  return { year, month, day };
}

function referenceDateParts(value = new Date()) {
  const explicitDate = medicalExamDateValue(value);
  if (explicitDate) {
    return dateParts(explicitDate);
  }

  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) {
    return referenceDateParts(new Date());
  }

  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: PRAGUE_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).formatToParts(date);
  const lookup = Object.fromEntries(parts.map((part) => [part.type, part.value]));

  return {
    year: Number(lookup.year),
    month: Number(lookup.month),
    day: Number(lookup.day)
  };
}

function startOfUtcDateFromParts(parts) {
  if (!parts) {
    return startOfUtcDateFromParts(referenceDateParts(new Date()));
  }

  return new Date(Date.UTC(parts.year, parts.month - 1, parts.day));
}

function isoFromUtcDate(date) {
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  const day = String(date.getUTCDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function addMonthsToMedicalExamDate(value, months) {
  const parts = dateParts(value);
  const intervalMonths = Number(months);

  if (!parts || !Number.isFinite(intervalMonths)) {
    return "";
  }

  const target = new Date(Date.UTC(parts.year, parts.month - 1 + intervalMonths, 1));
  const lastDay = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0)).getUTCDate();
  target.setUTCDate(Math.min(parts.day, lastDay));

  return isoFromUtcDate(target);
}

export function formatMedicalExamDate(value) {
  const cleaned = medicalExamDateValue(value);

  if (!cleaned) {
    return "";
  }

  const [year, month, day] = cleaned.split("-");
  return `${day}. ${month}. ${year}`;
}

export function calculateMedicalExamAge(dateOfBirth, referenceDate = new Date()) {
  const birth = dateParts(dateOfBirth);
  const reference = referenceDateParts(referenceDate);

  if (!birth || !reference) {
    return null;
  }

  let age = reference.year - birth.year;
  const monthDiff = reference.month - birth.month;
  const dayDiff = reference.day - birth.day;

  if (monthDiff < 0 || (monthDiff === 0 && dayDiff < 0)) {
    age -= 1;
  }

  return age >= 0 ? age : null;
}

function missingState(category, rule, missingReason, age = null) {
  return {
    category,
    categoryLabel: rule?.label || "",
    fullCategoryLabel: rule?.fullLabel || "",
    age,
    ageGroupLabel: age === null ? "Nelze určit – chybí datum narození" : (age > 50 ? "nad 50 roků" : "do 50 roků"),
    intervalMonths: null,
    intervalLabel: "neuvedeno",
    nextExamDate: "",
    status: "missing_data",
    statusLabel: MEDICAL_EXAM_STATUS_LABELS.missing_data,
    statusTone: MEDICAL_EXAM_STATUS_TONES.missing_data,
    missingReason,
    ruleNote: rule?.note || "",
    optional: rule?.required === false,
    required: rule?.required !== false
  };
}

export function calculateMedicalExamState(input = {}, referenceDate = new Date()) {
  const category = normalizeMedicalExamCategory(input.category || input.medicalExamCategory);
  const rule = MEDICAL_EXAM_RULES[category] || null;

  if (!category || !rule) {
    return missingState("", null, "Vyberte kategorii prohlídky");
  }

  const dateOfBirth = medicalExamDateValue(input.dateOfBirth || input.medicalExamDateOfBirth);
  const lastExamDate = medicalExamDateValue(input.lastExamDate || input.medicalExamLastDate);
  const age = calculateMedicalExamAge(dateOfBirth, referenceDate);

  if (rule.noExam) {
    return {
      category,
      categoryLabel: rule.label,
      fullCategoryLabel: rule.fullLabel,
      age,
      ageGroupLabel: age === null ? "nevyžaduje se" : (age > 50 ? "nad 50 roků" : "do 50 roků"),
      intervalMonths: null,
      intervalLabel: "nechodí se",
      nextExamDate: "",
      status: "not_tracked",
      statusLabel: MEDICAL_EXAM_STATUS_LABELS.not_tracked,
      statusTone: MEDICAL_EXAM_STATUS_TONES.not_tracked,
      missingReason: "",
      ruleNote: rule.note || "",
      optional: true,
      required: false
    };
  }

  if (age === null) {
    return missingState(category, rule, "Nelze určit – chybí datum narození", null);
  }

  const intervalMonths = age > 50 ? rule.over50Months : rule.under50Months;
  const ageGroupLabel = age > 50 ? "nad 50 roků" : "do 50 roků";

  if (!intervalMonths) {
    return {
      category,
      categoryLabel: rule.label,
      fullCategoryLabel: rule.fullLabel,
      age,
      ageGroupLabel,
      intervalMonths: null,
      intervalLabel: "nechodí se",
      nextExamDate: "",
      status: "not_tracked",
      statusLabel: MEDICAL_EXAM_STATUS_LABELS.not_tracked,
      statusTone: MEDICAL_EXAM_STATUS_TONES.not_tracked,
      missingReason: "",
      ruleNote: rule.note || "",
      optional: rule.required === false,
      required: rule.required !== false
    };
  }

  if (!lastExamDate) {
    const state = missingState(category, rule, "Chybí datum poslední prohlídky", age);
    return {
      ...state,
      ageGroupLabel,
      intervalMonths,
      intervalLabel: `po ${intervalMonths} měsících`
    };
  }

  const nextExamDate = addMonthsToMedicalExamDate(lastExamDate, intervalMonths);

  if (!nextExamDate) {
    const state = missingState(category, rule, "Chybí datum poslední prohlídky", age);
    return {
      ...state,
      ageGroupLabel,
      intervalMonths,
      intervalLabel: `po ${intervalMonths} měsících`
    };
  }

  const referenceStart = startOfUtcDateFromParts(referenceDateParts(referenceDate));
  const nextStart = startOfUtcDateFromParts(dateParts(nextExamDate));
  const daysToDue = Math.floor((nextStart.getTime() - referenceStart.getTime()) / DAY_MS);
  const status = daysToDue < 0 ? "overdue" : (daysToDue <= 60 ? "due_soon" : "ok");

  return {
    category,
    categoryLabel: rule.label,
    fullCategoryLabel: rule.fullLabel,
    age,
    ageGroupLabel,
    intervalMonths,
    intervalLabel: `po ${intervalMonths} měsících`,
    nextExamDate,
    status,
    statusLabel: MEDICAL_EXAM_STATUS_LABELS[status],
    statusTone: MEDICAL_EXAM_STATUS_TONES[status],
    missingReason: "",
    ruleNote: rule.note || "",
    optional: rule.required === false,
    required: rule.required !== false,
    daysToDue
  };
}
