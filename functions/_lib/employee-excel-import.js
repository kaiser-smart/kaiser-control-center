import { parseSpreadsheetRows } from "./collection-route-optimization-preview.js";
import {
  EMPLOYEE_EXCEL_SOURCE,
  EmployeeStoreError,
  listEmployeeCards,
  saveEmployeeHrProfile,
  saveImportedEmployeeCard
} from "./employees-store.js";

export const EMPLOYEE_EXCEL_IMPORT_MAX_FILE_SIZE_BYTES = 2 * 1024 * 1024;

export class EmployeeExcelImportError extends Error {
  constructor(message, status = 400, code = "employee_excel_import_error") {
    super(message);
    this.name = "EmployeeExcelImportError";
    this.status = status;
    this.code = code;
  }
}

const CORE_HEADER_TARGETS = {
  "Jméno": "Jméno a příjmení",
  "Pracovní e-mail": "E-mail",
  "Pracovní pozice": "Pracovní pozice",
  "Středisko": "Středisko / HR profil",
  "Oddělení": "Oddělení",
  "Místo výkonu práce": "Místo výkonu práce",
  "Nadřízený": "Nadřízený",
  "Pracovní mobil": "Telefon",
  "Denní směna": "Týdenní hodiny",
  "FTE": "Pracovní úvazek",
  "Platnost smlouvy": "Typ pracovního vztahu / HR profil",
  "Datum nástupu": "Datum nástupu",
  "Datum odchodu": "Stav zaměstnance",
  "Typ smlouvy": "Typ pracovního vztahu"
};

const HR_HEADER_MAP = {
  "Fotka": ["photo", "Fotka", false],
  "Společnost": ["company", "Společnost", false],
  "Země": ["country", "Země", false],
  "Číslo OP": ["idCardNumber", "Číslo OP", true],
  "Číslo účtu": ["bankAccount", "Číslo účtu", true],
  "Další bonus": ["otherBonus", "Další bonus", false],
  "IČO": ["companyId", "IČO", false],
  "IBAN": ["iban", "IBAN", true],
  "Kontaktní ulice": ["contactStreet", "Kontaktní ulice", true],
  "Kontaktní stát": ["contactCountry", "Kontaktní stát", true],
  "Náklad": ["cost", "Náklad", false],
  "Osobní číslo": ["personalNumber", "Osobní číslo", true],
  "Penzijní připojištění": ["pensionContribution", "Penzijní připojištění", true],
  "Pracovní pevná linka": ["fixedPhone", "Pracovní pevná linka", false],
  "Příspěvek na dopravu": ["transportContribution", "Příspěvek na dopravu", false],
  "Rodinný stav": ["maritalStatus", "Rodinný stav", true],
  "Ulice": ["street", "Ulice", true],
  "Číslo ŘP": ["driverLicenseNumber", "Číslo ŘP", true],
  "Číslo domu": ["houseNumber", "Číslo domu", true],
  "Datum narození": ["dateOfBirth", "Datum narození", true],
  "Povolit e-mailové notifikace": ["emailNotificationsEnabled", "Povolit e-mailové notifikace", false],
  "Hodinová sazba": ["hourlyRate", "Hodinová sazba", true],
  "Jméno nouzového kontaktu": ["emergencyContactName", "Jméno nouzového kontaktu", true],
  "Konec zkušební doby": ["probationEndDate", "Konec zkušební doby", false],
  "Kontaktní PSČ": ["contactZip", "Kontaktní PSČ", true],
  "Měna": ["currency", "Měna", false],
  "Místo narození": ["birthPlace", "Místo narození", true],
  "Obec": ["municipality", "Obec", true],
  "Osobní e-mail": ["personalEmail", "Osobní e-mail", true],
  "Osobní telefon": ["personalPhone", "Osobní telefon", true],
  "Platnost OP do": ["idCardValidUntil", "Platnost OP do", true],
  "Platnost pasu do": ["passportValidUntil", "Platnost pasu do", true],
  "Počet dětí": ["childrenCount", "Počet dětí", true],
  "Práce s počítačem": ["computerWork", "Práce s počítačem", false],
  "Předčíslí účtu": ["accountPrefix", "Předčíslí účtu", true],
  "Rodné číslo": ["birthNumber", "Rodné číslo", true],
  "Skupiny ŘP": ["driverLicenseGroups", "Skupiny ŘP", true],
  "Stát": ["state", "Stát", true],
  "Státní občanství": ["citizenship", "Státní občanství", true],
  "Telefon nouzového kontaktu": ["emergencyContactPhone", "Telefon nouzového kontaktu", true],
  "Vytvořeno": ["originalCreatedAt", "Vytvořeno", false],
  "Začátek prac. smlouvy": ["contractStartDate", "Začátek prac. smlouvy", false],
  "Zdravotní pojišťovna": ["healthInsuranceCompany", "Zdravotní pojišťovna", true],
  "Změněno": ["originalUpdatedAt", "Změněno", false]
};

const DATE_HR_KEYS = new Set([
  "dateOfBirth",
  "departureDate",
  "probationEndDate",
  "idCardValidUntil",
  "passportValidUntil",
  "contractStartDate"
]);
const NUMBER_HR_KEYS = new Set([
  "otherBonus",
  "dailyShiftHours",
  "fte",
  "cost",
  "pensionContribution",
  "transportContribution",
  "hourlyRate",
  "childrenCount"
]);
const BOOLEAN_HR_KEYS = new Set(["emailNotificationsEnabled"]);

function cleanValue(value) {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

function normalizeKey(value) {
  return cleanValue(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function slugPart(value) {
  return normalizeKey(value)
    .replace(/\s+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 70);
}

function normalizeEmail(value) {
  return cleanValue(value).toLowerCase();
}

function numberValue(value) {
  if (value === "" || value === null || value === undefined) {
    return null;
  }

  const normalized = cleanValue(value).replace(/\s+/g, "").replace(",", ".");
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : null;
}

function booleanValue(value) {
  const normalized = normalizeKey(value);
  if (["ano", "true", "yes", "1", "zapnuto"].includes(normalized)) {
    return true;
  }
  if (["ne", "false", "no", "0", "vypnuto"].includes(normalized)) {
    return false;
  }
  return null;
}

function excelSerialToIsoDate(value) {
  const numeric = numberValue(value);
  if (numeric === null || numeric < 20000 || numeric > 90000) {
    return "";
  }

  const date = new Date(Date.UTC(1899, 11, 30) + Math.floor(numeric) * 24 * 60 * 60 * 1000);
  return date.toISOString().slice(0, 10);
}

function isoDateValue(value) {
  const text = cleanValue(value);
  if (!text) {
    return "";
  }

  const iso = /^(\d{4})-(\d{2})-(\d{2})/.exec(text);
  if (iso) {
    return `${iso[1]}-${iso[2]}-${iso[3]}`;
  }

  const czech = /^(\d{1,2})\.(\d{1,2})\.(\d{4})/.exec(text);
  if (czech) {
    return `${czech[3]}-${czech[2].padStart(2, "0")}-${czech[1].padStart(2, "0")}`;
  }

  return excelSerialToIsoDate(text);
}

function splitExcelName(value) {
  const text = cleanValue(value)
    .replace(/\b(Ing|Bc|Mgr|DiS|Diš|MUDr|JUDr)\.?,?/gi, "")
    .replace(/\s+-\s+/g, " ")
    .replace(/,+/g, " ");
  const parts = text.split(/\s+/).filter(Boolean);

  if (parts.length <= 1) {
    return {
      firstName: parts[0] || "",
      lastName: "",
      displayName: parts[0] || "",
      reversedName: parts[0] || ""
    };
  }

  const lastName = parts[0];
  const firstName = parts.slice(1).join(" ");
  return {
    firstName,
    lastName,
    displayName: [firstName, lastName].filter(Boolean).join(" "),
    reversedName: [lastName, firstName].filter(Boolean).join(" ")
  };
}

function employeeFullName(employee) {
  return [employee?.firstName, employee?.lastName].map(cleanValue).filter(Boolean).join(" ") ||
    cleanValue(employee?.name);
}

function reversedEmployeeName(employee) {
  return [employee?.lastName, employee?.firstName].map(cleanValue).filter(Boolean).join(" ");
}

function headerLookup(headers) {
  const lookup = new Map();
  headers.forEach((header, index) => {
    const key = normalizeKey(header);
    if (key) {
      lookup.set(key, index);
    }
  });
  return lookup;
}

function rowValue(row, headers, header) {
  const index = headers.get(normalizeKey(header));
  return index === undefined ? "" : cleanValue(row[index]);
}

function normalizePhone(value) {
  return cleanValue(value).replace(/\s+/g, " ");
}

function mapRole(position) {
  const normalized = normalizeKey(position);
  if (normalized.includes("ridic")) {
    return "ridic";
  }
  if (normalized.includes("dispecer")) {
    return "dispecer";
  }
  if (normalized.includes("technik")) {
    return "garazmistr";
  }
  if (normalized.includes("manager") || normalized.includes("jednatel")) {
    return "management";
  }
  if (normalized.includes("administrativ") || normalized.includes("evidence") || normalized.includes("fakturant")) {
    return "kancelar";
  }
  return "readonly";
}

function employmentType(type, validity) {
  const normalized = normalizeKey(`${type} ${validity}`);
  if (normalized.includes("hpp") || normalized.includes("hlavni")) {
    return "Hlavní pracovní poměr";
  }
  if (normalized.includes("dohoda")) {
    return "Dohoda";
  }
  if (normalized.includes("extern")) {
    return "Externí spolupráce";
  }
  return "";
}

function currentEmployeeIndexes(employees) {
  const byName = new Map();
  const byEmail = new Map();
  const byId = new Set();

  for (const employee of employees) {
    const id = cleanValue(employee.id || employee.userId);
    if (id) {
      byId.add(id.toLowerCase());
    }
    const email = normalizeEmail(employee.email);
    if (email) {
      byEmail.set(email, employee);
    }
    for (const name of [employeeFullName(employee), reversedEmployeeName(employee)]) {
      const key = normalizeKey(name);
      if (key && !byName.has(key)) {
        byName.set(key, employee);
      }
    }
  }

  return { byName, byEmail, byId };
}

function findManager(managerName, indexes) {
  const parsed = splitExcelName(managerName);
  const candidates = [
    managerName,
    parsed.displayName,
    parsed.reversedName
  ].map(normalizeKey).filter(Boolean);

  for (const candidate of candidates) {
    const match = indexes.byName.get(candidate);
    if (match) {
      return match;
    }
  }

  return null;
}

function findEmployeeMatch(row, indexes) {
  const email = normalizeEmail(row.workEmail);
  if (email && indexes.byEmail.has(email)) {
    return { employee: indexes.byEmail.get(email), method: "email" };
  }

  for (const candidate of [row.displayName, row.reversedName, row.excelName]) {
    const key = normalizeKey(candidate);
    if (key && indexes.byName.has(key)) {
      return { employee: indexes.byName.get(key), method: "name" };
    }
  }

  return { employee: null, method: "" };
}

function uniqueEmployeeId(base, usedIds) {
  const slug = slugPart(base) || "zamestnanec";
  let candidate = `hr-${slug}`;
  let counter = 2;

  while (usedIds.has(candidate.toLowerCase())) {
    candidate = `hr-${slug}-${counter}`;
    counter += 1;
  }

  usedIds.add(candidate.toLowerCase());
  return candidate;
}

function normalizeHrValue(key, value) {
  if (DATE_HR_KEYS.has(key)) {
    return isoDateValue(value);
  }
  if (NUMBER_HR_KEYS.has(key)) {
    return numberValue(value);
  }
  if (BOOLEAN_HR_KEYS.has(key)) {
    return booleanValue(value);
  }
  return cleanValue(value);
}

function buildColumnMappings(headers) {
  const mapped = [];
  const knownHeaders = new Set([...Object.keys(CORE_HEADER_TARGETS), ...Object.keys(HR_HEADER_MAP)]);

  for (const header of headers) {
    const label = cleanValue(header);
    if (!label) {
      continue;
    }

    const hrTarget = HR_HEADER_MAP[label];
    mapped.push({
      excelColumn: label,
      target: CORE_HEADER_TARGETS[label] || hrTarget?.[1] || "Neznámý sloupec",
      targetKey: hrTarget?.[0] || "",
      status: knownHeaders.has(label) ? "mapped" : "unknown",
      sensitive: Boolean(hrTarget?.[2])
    });
  }

  return mapped;
}

function auditRowJson(headers, row) {
  const result = {};
  const omittedColumns = [];

  headers.forEach((header, index) => {
    const key = cleanValue(header);
    if (!key) {
      return;
    }

    const hrTarget = HR_HEADER_MAP[key];
    if (hrTarget?.[2] || (!CORE_HEADER_TARGETS[key] && !hrTarget)) {
      omittedColumns.push(key);
      return;
    }

    result[key] = cleanValue(row[index]);
  });

  if (omittedColumns.length) {
    result.__omittedColumns = omittedColumns;
  }

  return result;
}

function employeeRowFromExcel(row, headers, source) {
  const excelName = rowValue(row, headers.lookup, "Jméno");
  const parsedName = splitExcelName(excelName);
  const workEmail = rowValue(row, headers.lookup, "Pracovní e-mail");
  const position = rowValue(row, headers.lookup, "Pracovní pozice");
  const center = rowValue(row, headers.lookup, "Středisko");
  const department = rowValue(row, headers.lookup, "Oddělení");
  const dailyShiftHours = numberValue(rowValue(row, headers.lookup, "Denní směna"));
  const fte = numberValue(rowValue(row, headers.lookup, "FTE"));
  const startDate = isoDateValue(rowValue(row, headers.lookup, "Datum nástupu"));
  const departureDate = isoDateValue(rowValue(row, headers.lookup, "Datum odchodu"));
  const managerName = rowValue(row, headers.lookup, "Nadřízený");
  const phone = normalizePhone(rowValue(row, headers.lookup, "Pracovní mobil") || rowValue(row, headers.lookup, "Pracovní pevná linka"));
  const hrProfile = {
    sourceFile: source.filename,
    sourceSheet: source.sheetName,
    sourceRow: source.rowNumber,
    excelName,
    workCenter: center,
    dailyShiftHours,
    fte,
    departureDate,
    contractValidity: rowValue(row, headers.lookup, "Platnost smlouvy"),
    contractType: rowValue(row, headers.lookup, "Typ smlouvy"),
    rawJson: JSON.stringify(auditRowJson(headers.original, row))
  };

  for (const [header, [key]] of Object.entries(HR_HEADER_MAP)) {
    if (key === "photo") {
      continue;
    }
    hrProfile[key] = normalizeHrValue(key, rowValue(row, headers.lookup, header));
  }

  return {
    excelName,
    firstName: parsedName.firstName,
    lastName: parsedName.lastName,
    displayName: parsedName.displayName,
    reversedName: parsedName.reversedName,
    workEmail,
    position,
    center,
    department,
    workplace: rowValue(row, headers.lookup, "Místo výkonu práce"),
    managerName,
    phone,
    startDate,
    departureDate,
    fte,
    dailyShiftHours,
    employmentType: employmentType(rowValue(row, headers.lookup, "Typ smlouvy"), rowValue(row, headers.lookup, "Platnost smlouvy")),
    sourceEmployeeKey: slugPart(workEmail || excelName),
    role: mapRole(position),
    hrProfile
  };
}

function employeePayloadFromPlan(plan) {
  const weeklyHours = plan.row.dailyShiftHours
    ? plan.row.dailyShiftHours * 5
    : (plan.row.fte ? plan.row.fte * 40 : 40);

  return {
    id: plan.employeeId,
    userId: plan.employeeId,
    firstName: plan.row.firstName,
    lastName: plan.row.lastName,
    email: plan.row.workEmail,
    phone: plan.row.phone,
    role: plan.row.role,
    department: plan.row.department || plan.row.center,
    position: plan.row.position,
    workplace: plan.row.workplace,
    managerId: plan.manager?.id || "",
    managerName: plan.manager ? employeeFullName(plan.manager) : plan.row.managerName,
    employmentStatus: plan.row.departureDate ? "inactive" : "active",
    startDate: plan.row.startDate,
    employmentType: plan.row.employmentType,
    workload: plan.row.fte ?? 1,
    weeklyHours,
    isHrOnly: plan.action === "create",
    sourceSystem: EMPLOYEE_EXCEL_SOURCE,
    sourceEmployeeKey: plan.row.sourceEmployeeKey,
    currentAbsenceStatus: "v práci"
  };
}

function summarizeIssues(row, manager) {
  const issues = [];
  if (!row.excelName) {
    issues.push("missing-name");
  }
  if (!row.workEmail) {
    issues.push("missing-work-email");
  }
  if (row.managerName && !manager) {
    issues.push("manager-not-matched");
  }
  if (!row.firstName || !row.lastName) {
    issues.push("name-needs-review");
  }
  return issues;
}

function buildPlan({ parsed, employees, filename }) {
  const sheets = Array.isArray(parsed.sheets) && parsed.sheets.length
    ? parsed.sheets
    : [{ rows: parsed.rows || [], sheetName: parsed.sheetName || "Sheet1" }];
  const sheet = sheets.find((item) => (item.rows || []).length) || sheets[0] || { rows: [], sheetName: "" };
  const sourceRows = sheet.rows || [];
  const headers = sourceRows[0] || [];
  const lookup = headerLookup(headers);
  const indexes = currentEmployeeIndexes(employees);
  const usedIds = new Set(indexes.byId);
  const plans = [];
  const matchedEmployeeIds = new Set();

  sourceRows.slice(1).forEach((row, index) => {
    if (!row.some((cell) => cleanValue(cell))) {
      return;
    }

    const employeeRow = employeeRowFromExcel(row, { original: headers, lookup }, {
      filename,
      sheetName: sheet.sheetName || parsed.sheetName || "",
      rowNumber: index + 2
    });
    const match = findEmployeeMatch(employeeRow, indexes);
    const manager = findManager(employeeRow.managerName, indexes);
    const employeeId = match.employee?.id || uniqueEmployeeId(employeeRow.displayName || employeeRow.excelName, usedIds);
    const action = employeeRow.excelName ? (match.employee ? "update" : "create") : "skip";

    if (match.employee?.id) {
      matchedEmployeeIds.add(String(match.employee.id).toLowerCase());
    }

    plans.push({
      sourceRow: index + 2,
      action,
      matchMethod: match.method,
      employeeId,
      currentEmployeeName: match.employee ? employeeFullName(match.employee) : "",
      row: employeeRow,
      manager,
      issues: summarizeIssues(employeeRow, manager),
      status: action === "skip" ? "skipped" : "ready"
    });
  });

  const columnMappings = buildColumnMappings(headers);
  const sensitiveFieldCount = columnMappings.filter((item) => item.sensitive).length;
  const summary = {
    filename,
    sheetName: sheet.sheetName || parsed.sheetName || "",
    excelRows: plans.length,
    excelColumns: headers.filter((header) => cleanValue(header)).length,
    currentEmployees: employees.length,
    matchedCount: plans.filter((item) => item.action === "update").length,
    createCount: plans.filter((item) => item.action === "create").length,
    skippedCount: plans.filter((item) => item.action === "skip").length,
    appOnlyCount: employees.filter((employee) => !matchedEmployeeIds.has(String(employee.id || "").toLowerCase())).length,
    issueCount: plans.filter((item) => item.issues.length).length,
    sensitiveFieldCount
  };
  const previewRows = plans.slice(0, 120).map((plan) => ({
    sourceRow: plan.sourceRow,
    action: plan.action,
    status: plan.status,
    employeeId: plan.employeeId,
    excelName: plan.row.excelName,
    displayName: plan.row.displayName,
    currentEmployeeName: plan.currentEmployeeName,
    matchMethod: plan.matchMethod,
    managerName: plan.row.managerName,
    managerMatched: Boolean(plan.manager),
    issues: plan.issues
  }));

  return {
    preview: {
      summary,
      columnMappings,
      rows: previewRows,
      apiStatus: "ready"
    },
    plans
  };
}

export async function createEmployeeExcelImportPlan(env, users, currentUser, file) {
  if (!file?.buffer) {
    throw new EmployeeExcelImportError("Nahrajte Excel export zaměstnanců.", 400, "employee_excel_file_missing");
  }

  const parsed = await parseSpreadsheetRows(file);
  const employees = await listEmployeeCards(env, users, currentUser);

  if (!parsed.rows?.length && !parsed.sheets?.some((sheet) => sheet.rows?.length)) {
    throw new EmployeeExcelImportError("Excel neobsahuje čitelné řádky.", 400, "employee_excel_empty");
  }

  return buildPlan({
    parsed,
    employees,
    filename: cleanValue(file.filename || "Employees.xlsx")
  });
}

export async function createEmployeeExcelImportPreview(env, users, currentUser, file) {
  const plan = await createEmployeeExcelImportPlan(env, users, currentUser, file);
  return plan.preview;
}

function randomId(prefix) {
  const suffix = globalThis.crypto?.randomUUID
    ? globalThis.crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  return `${prefix}-${suffix}`;
}

async function writeImportBatch(env, currentUser, preview, results) {
  const db = env?.SMART_ODPADY_DB;
  if (!db) {
    throw new EmployeeStoreError("Databáze zaměstnanců není nastavená.", 503, "employees_database_missing");
  }

  const batchId = randomId("employee-import");
  const now = new Date().toISOString();
  await db
    .prepare(`
      INSERT INTO employee_import_batches (
        id,
        source_filename,
        sheet_name,
        row_count,
        matched_count,
        created_count,
        updated_count,
        skipped_count,
        sensitive_field_count,
        imported_by_user_id,
        imported_at,
        summary_json
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `)
    .bind(
      batchId,
      preview.summary.filename,
      preview.summary.sheetName,
      preview.summary.excelRows,
      preview.summary.matchedCount,
      results.createdCount,
      results.updatedCount,
      results.skippedCount,
      preview.summary.sensitiveFieldCount,
      currentUser?.id || "",
      now,
      JSON.stringify(preview.summary)
    )
    .run();

  for (const result of results.rows) {
    await db
      .prepare(`
        INSERT INTO employee_import_batch_rows (
          id,
          batch_id,
          source_row,
          employee_id,
          employee_name,
          action,
          status,
          issues_json,
          raw_json,
          created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `)
      .bind(
        randomId("employee-import-row"),
        batchId,
        result.sourceRow,
        result.employeeId || "",
        result.employeeName || "",
        result.action,
        result.status,
        JSON.stringify(result.issues || []),
        result.rawJson || "",
        now
      )
      .run();
  }

  return { batchId, importedAt: now };
}

export async function applyEmployeeExcelImport(env, users, currentUser, file) {
  const { preview, plans } = await createEmployeeExcelImportPlan(env, users, currentUser, file);
  const results = {
    createdCount: 0,
    updatedCount: 0,
    skippedCount: 0,
    rows: []
  };

  for (const plan of plans) {
    if (plan.action === "skip" || plan.issues.includes("missing-name")) {
      results.skippedCount += 1;
      results.rows.push({
        sourceRow: plan.sourceRow,
        employeeId: plan.employeeId,
        employeeName: plan.row.displayName,
        action: plan.action,
        status: "skipped",
        issues: plan.issues,
        rawJson: plan.row.hrProfile.rawJson
      });
      continue;
    }

    const employee = await saveImportedEmployeeCard(env, users, currentUser, employeePayloadFromPlan(plan));
    await saveEmployeeHrProfile(env, employee.id, plan.row.hrProfile, currentUser?.id || "");

    if (plan.action === "create") {
      results.createdCount += 1;
    } else {
      results.updatedCount += 1;
    }

    results.rows.push({
      sourceRow: plan.sourceRow,
      employeeId: employee.id,
      employeeName: plan.row.displayName,
      action: plan.action,
      status: "imported",
      issues: plan.issues,
      rawJson: plan.row.hrProfile.rawJson
    });
  }

  const batch = await writeImportBatch(env, currentUser, preview, results);
  return {
    batch,
    summary: {
      ...preview.summary,
      createdCount: results.createdCount,
      updatedCount: results.updatedCount,
      skippedCount: results.skippedCount
    },
    rows: results.rows.map((row) => ({
      sourceRow: row.sourceRow,
      employeeId: row.employeeId,
      employeeName: row.employeeName,
      action: row.action,
      status: row.status,
      issues: row.issues
    })),
    apiStatus: "ready"
  };
}
