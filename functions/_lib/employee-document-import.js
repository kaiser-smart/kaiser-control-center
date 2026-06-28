import {
  EmployeeStoreError,
  canEditEmployee,
  employeeApiStatus,
  employeeDocumentStorageKey,
  employeeDocumentsBucket,
  listEmployeeCards,
  saveEmployeeDocument
} from "./employees-store.js";

export const EMPLOYEE_DOCUMENT_IMPORT_MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024;
export const EMPLOYEE_DOCUMENT_IMPORT_MAX_FILES = 80;
export const EMPLOYEE_DOCUMENT_IMPORT_MAX_TOTAL_BYTES = 80 * 1024 * 1024;
const READY_SCORE = 70;
const REVIEW_SCORE = 45;

export class EmployeeDocumentImportError extends Error {
  constructor(message, status = 400, code = "employee_document_import_error") {
    super(message);
    this.name = "EmployeeDocumentImportError";
    this.status = status;
    this.code = code;
  }
}

function cleanString(value) {
  return String(value ?? "").trim();
}

function fileSize(value) {
  const size = Number(value?.size ?? value?.buffer?.length ?? 0);
  return Number.isFinite(size) ? size : 0;
}

export function isEmployeeDocumentImportFile(value) {
  return Boolean(
    value &&
    typeof value === "object" &&
    cleanString(value.name) &&
    fileSize(value) > 0 &&
    (typeof value.stream === "function" || typeof value.arrayBuffer === "function" || value.buffer)
  );
}

function normalizeText(value) {
  return cleanString(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function tokenSet(value) {
  return new Set(normalizeText(value).split(/\s+/).filter((token) => token.length >= 2));
}

function baseFilename(name) {
  return cleanString(name).replace(/\.[^.]+$/, "");
}

function employeeName(employee) {
  return [employee?.firstName, employee?.lastName].map(cleanString).filter(Boolean).join(" ") ||
    cleanString(employee?.name);
}

function employeeReversedName(employee) {
  return [employee?.lastName, employee?.firstName].map(cleanString).filter(Boolean).join(" ");
}

function employeeAliases(employee) {
  const emailLocal = cleanString(employee?.email).split("@")[0] || "";
  return [
    ["jmeno", employeeName(employee), 100],
    ["prijmeni-jmeno", employeeReversedName(employee), 96],
    ["email", emailLocal, 78],
    ["id", employee?.id, 74],
    ["zdrojovy-klic", employee?.sourceEmployeeKey, 72]
  ]
    .map(([method, value, score]) => ({ method, normalized: normalizeText(value), score }))
    .filter((item) => item.normalized.length >= 4);
}

function scoreFileForEmployee(filename, employee) {
  const fileText = normalizeText(baseFilename(filename));
  const fileTokens = tokenSet(filename);
  const nameTokens = tokenSet(employeeName(employee));

  for (const alias of employeeAliases(employee)) {
    if (fileText.includes(alias.normalized)) {
      return { score: alias.score, method: alias.method };
    }
  }

  if (nameTokens.size >= 2 && [...nameTokens].every((token) => fileTokens.has(token))) {
    return { score: 86, method: "jmeno-tokeny" };
  }

  const firstName = normalizeText(employee?.firstName);
  const lastName = normalizeText(employee?.lastName);
  if (firstName.length >= 3 && lastName.length >= 4 && fileTokens.has(firstName) && fileTokens.has(lastName)) {
    return { score: 82, method: "jmeno-prijmeni" };
  }

  if (lastName.length >= 5 && fileTokens.has(lastName)) {
    return { score: 46, method: "prijmeni" };
  }

  return { score: 0, method: "" };
}

function documentTypeFromFilename(filename) {
  const text = normalizeText(filename);
  if (text.includes("dodatek")) {
    return "Dodatek";
  }
  if (text.includes("skoleni") || text.includes("certifikat")) {
    return "Školení";
  }
  if (text.includes("prohlidka") || text.includes("lekarsk") || text.includes("zdravotni")) {
    return "Lékařská prohlídka";
  }
  if (text.includes("smlouva") || text.includes("dohoda") || text.includes("contract")) {
    return "Pracovní smlouva";
  }
  return "Ostatní";
}

function matchFileToEmployee(file, employees) {
  const candidates = employees
    .map((employee) => {
      const match = scoreFileForEmployee(file.name, employee);
      return {
        employeeId: employee.id,
        employeeName: employeeName(employee),
        score: match.score,
        method: match.method
      };
    })
    .filter((item) => item.score >= REVIEW_SCORE)
    .sort((a, b) => b.score - a.score || a.employeeName.localeCompare(b.employeeName, "cs"))
    .slice(0, 5);

  const best = candidates[0] || null;
  const second = candidates[1] || null;

  if (best && best.score >= READY_SCORE && (!second || best.score - second.score >= 8)) {
    return {
      status: "ready",
      employeeId: best.employeeId,
      employeeName: best.employeeName,
      matchMethod: best.method,
      candidates
    };
  }

  if (best) {
    return {
      status: "review",
      employeeId: "",
      employeeName: "",
      matchMethod: best.method,
      candidates
    };
  }

  return {
    status: "unmatched",
    employeeId: "",
    employeeName: "",
    matchMethod: "",
    candidates: []
  };
}

function validateImportFiles(files) {
  if (!files.length) {
    throw new EmployeeDocumentImportError("Nahrajte dokumenty exportované nebo stažené z Pinya.", 400, "employee_document_import_no_files");
  }

  if (files.length > EMPLOYEE_DOCUMENT_IMPORT_MAX_FILES) {
    throw new EmployeeDocumentImportError(`Najednou nahrajte nejvýše ${EMPLOYEE_DOCUMENT_IMPORT_MAX_FILES} souborů.`, 400, "employee_document_import_too_many_files");
  }

  let totalSize = 0;
  for (const file of files) {
    const size = fileSize(file);
    totalSize += size;

    if (size > EMPLOYEE_DOCUMENT_IMPORT_MAX_FILE_SIZE_BYTES) {
      throw new EmployeeDocumentImportError(`Soubor ${cleanString(file.name)} je příliš velký. Maximum je 10 MB.`, 400, "employee_document_import_file_too_large");
    }
  }

  if (totalSize > EMPLOYEE_DOCUMENT_IMPORT_MAX_TOTAL_BYTES) {
    throw new EmployeeDocumentImportError("Soubory jsou dohromady příliš velké. Maximum je 80 MB.", 400, "employee_document_import_total_too_large");
  }
}

export function buildEmployeeDocumentImportPreview(files, employees) {
  const rows = files.map((file, index) => {
    const match = matchFileToEmployee(file, employees);
    return {
      index,
      filename: cleanString(file.name),
      sizeBytes: fileSize(file),
      contentType: cleanString(file.type) || "application/octet-stream",
      documentType: documentTypeFromFilename(file.name),
      documentName: cleanString(file.name),
      status: match.status,
      employeeId: match.employeeId,
      employeeName: match.employeeName,
      matchMethod: match.matchMethod,
      candidates: match.candidates
    };
  });

  const summary = {
    fileCount: rows.length,
    readyCount: rows.filter((row) => row.status === "ready").length,
    reviewCount: rows.filter((row) => row.status === "review").length,
    unmatchedCount: rows.filter((row) => row.status === "unmatched").length,
    totalSizeBytes: rows.reduce((total, row) => total + row.sizeBytes, 0)
  };

  return {
    summary,
    rows,
    apiStatus: "ready"
  };
}

export async function createEmployeeDocumentImportPreview(env, users, currentUser, files) {
  if (!canEditEmployee(currentUser)) {
    throw new EmployeeStoreError("Nemáte oprávnění importovat dokumenty zaměstnanců.", 403, "employee_document_import_forbidden");
  }

  const safeFiles = files.filter(isEmployeeDocumentImportFile);
  validateImportFiles(safeFiles);

  const employees = await listEmployeeCards(env, users, currentUser);
  return buildEmployeeDocumentImportPreview(safeFiles, employees);
}

function randomDocumentId() {
  const suffix = globalThis.crypto?.randomUUID
    ? globalThis.crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  return `employee-document-${suffix}`;
}

export async function applyEmployeeDocumentImport(env, users, currentUser, files) {
  const bucket = employeeDocumentsBucket(env, true);
  const safeFiles = files.filter(isEmployeeDocumentImportFile);
  const preview = await createEmployeeDocumentImportPreview(env, users, currentUser, safeFiles);
  const storageKeys = [];
  const documents = [];
  let skippedCount = 0;

  try {
    for (const row of preview.rows) {
      const file = safeFiles[row.index];
      if (!file || row.status !== "ready" || !row.employeeId) {
        skippedCount += 1;
        continue;
      }

      const documentId = randomDocumentId();
      const storageKey = employeeDocumentStorageKey(row.employeeId, documentId, row.filename);
      const contentType = row.contentType || cleanString(file.type) || "application/octet-stream";

      await bucket.put(storageKey, file.stream(), {
        httpMetadata: {
          contentType
        },
        customMetadata: {
          employeeId: row.employeeId,
          documentId,
          importSource: "pinya-export",
          uploadedByUserId: currentUser?.id || ""
        }
      });
      storageKeys.push(storageKey);

      const document = await saveEmployeeDocument(env, row.employeeId, {
        id: documentId,
        type: row.documentType,
        name: row.documentName,
        storageKey,
        contentType,
        sizeBytes: row.sizeBytes,
        uploadedByUserId: currentUser?.id,
        note: `Hromadný import dokumentů z Pinya exportu. Párování: ${row.matchMethod || "název souboru"}.`
      });

      documents.push({
        ...document,
        employeeName: row.employeeName,
        importStatus: "imported"
      });
    }
  } catch (error) {
    await Promise.all(storageKeys.map((storageKey) => bucket.delete(storageKey).catch(() => {})));
    throw error;
  }

  return {
    preview,
    documents,
    summary: {
      ...preview.summary,
      importedCount: documents.length,
      skippedCount
    },
    apiStatus: employeeApiStatus(env)
  };
}
