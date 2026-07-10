function cleanString(value) {
  return String(value ?? "").trim();
}

function normalizeKey(value) {
  return cleanString(value)
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function parseCzechNumber(value, fallback = 0) {
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : fallback;
  }
  const normalized = cleanString(value)
    .replace(/\s+/g, "")
    .replace(/Kc|CZK|EUR|Kč/gi, "")
    .replace(/\.(?=\d{3}(?:\D|$))/g, "")
    .replace(",", ".");
  const number = Number(normalized);
  return Number.isFinite(number) ? Math.round(number * 100) / 100 : fallback;
}

function normalizeDate(value) {
  const text = cleanString(value);
  if (!text) return "";
  const iso = text.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;
  const czech = text.match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})$/);
  if (czech) {
    return `${czech[3]}-${czech[2].padStart(2, "0")}-${czech[1].padStart(2, "0")}`;
  }
  return text;
}

function compactSymbol(value) {
  const digits = cleanString(value).replace(/\D/g, "");
  return digits === "0" ? "" : digits;
}

function splitDelimitedLine(line, delimiter) {
  const cells = [];
  let current = "";
  let quoted = false;
  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    const next = line[index + 1];
    if (char === '"' && quoted && next === '"') {
      current += '"';
      index += 1;
      continue;
    }
    if (char === '"') {
      quoted = !quoted;
      continue;
    }
    if (char === delimiter && !quoted) {
      cells.push(current.trim());
      current = "";
      continue;
    }
    current += char;
  }
  cells.push(current.trim());
  return cells;
}

function csvDelimiter(line) {
  const semicolons = (line.match(/;/g) || []).length;
  const commas = (line.match(/,/g) || []).length;
  return semicolons >= commas ? ";" : ",";
}

const INVOICE_ALIASES = {
  vistoInvoiceId: ["visto_invoice_id", "vistoid", "id_vistos", "id_faktury_vistos"],
  invoiceNumber: ["invoice_number", "cislo_faktury", "faktura", "faktura_cislo", "doklad"],
  variableSymbol: ["variable_symbol", "variabilni_symbol", "vs", "var_symbol"],
  customerId: ["customer_id", "company_id", "visto_company_id", "id_zakaznika"],
  customerName: ["company_name", "customer_name", "firma", "zakaznik", "odberatel", "nazev"],
  ico: ["ico", "ic", "ic_firmy"],
  dic: ["dic", "dic_firmy"],
  issueDate: ["issue_date", "invoice_date", "datum_vystaveni", "vystaveno"],
  dueDate: ["due_date", "datum_splatnosti", "splatnost"],
  totalAmount: ["total_amount", "castka", "celkem", "castka_celkem", "fakturovano"],
  paidAmount: ["paid_amount", "uhrazeno", "zaplaceno"],
  openAmount: ["open_amount", "zbyva", "zbyva_uhradit", "otevreno"],
  currency: ["currency", "mena"],
  status: ["status", "stav"],
  paidDate: ["paid_date", "datum_uhrady", "uhrazeno_dne"],
  pdfUrl: ["pdf_url", "invoice_pdf_url", "url_pdf"],
  contactEmail: ["contact_email", "email", "fakturacni_email"],
  contactPhone: ["contact_phone", "telefon"],
  preferredContactPerson: ["preferred_contact_person", "kontaktni_osoba", "kontakt"]
};

function valueByAlias(row, canonicalKey) {
  const aliases = INVOICE_ALIASES[canonicalKey] || [canonicalKey];
  for (const alias of [canonicalKey, ...aliases]) {
    if (row[alias] !== undefined && row[alias] !== null && cleanString(row[alias]) !== "") {
      return row[alias];
    }
  }

  const normalizedRow = Object.fromEntries(Object.entries(row || {}).map(([key, value]) => [normalizeKey(key), value]));
  for (const alias of [canonicalKey, ...aliases].map(normalizeKey)) {
    if (normalizedRow[alias] !== undefined && normalizedRow[alias] !== null && cleanString(normalizedRow[alias]) !== "") {
      return normalizedRow[alias];
    }
  }
  return "";
}

function parseInvoiceCsv(text) {
  const lines = cleanString(text)
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  if (!lines.length) return [];

  const delimiter = csvDelimiter(lines[0]);
  const headers = splitDelimitedLine(lines[0], delimiter).map(normalizeKey);
  return lines.slice(1).map((line) => {
    const cells = splitDelimitedLine(line, delimiter);
    const row = {};
    headers.forEach((header, index) => {
      row[header] = cells[index] ?? "";
    });
    return row;
  });
}

function parseInvoiceInput(payload = {}) {
  if (Array.isArray(payload.invoices)) return payload.invoices;
  if (Array.isArray(payload.rows)) return payload.rows;

  const text = cleanString(payload.text || payload.csv || payload.json);
  if (!text) return [];

  try {
    const parsed = JSON.parse(text);
    if (Array.isArray(parsed)) return parsed;
    if (Array.isArray(parsed.invoices)) return parsed.invoices;
    if (Array.isArray(parsed.rows)) return parsed.rows;
  } catch {
    // CSV is the intended fallback for non-JSON text.
  }

  return parseInvoiceCsv(text);
}

function invoiceIssueCode(issues) {
  if (!issues.length) return "";
  if (issues.includes("missing_invoice_number")) return "missing_invoice_number";
  if (issues.includes("missing_customer")) return "missing_customer";
  if (issues.includes("missing_amount")) return "missing_amount";
  return issues[0];
}

export function normalizeInvoicePreviewRow(input = {}, index = 0) {
  const totalAmount = parseCzechNumber(valueByAlias(input, "totalAmount"));
  const paidAmount = parseCzechNumber(valueByAlias(input, "paidAmount"));
  const explicitOpenAmount = valueByAlias(input, "openAmount");
  const openAmount = cleanString(explicitOpenAmount)
    ? parseCzechNumber(explicitOpenAmount)
    : Math.max(0, Math.round((totalAmount - paidAmount) * 100) / 100);
  const invoiceNumber = cleanString(valueByAlias(input, "invoiceNumber"));
  const variableSymbol = compactSymbol(valueByAlias(input, "variableSymbol")) || compactSymbol(invoiceNumber);
  const customerName = cleanString(valueByAlias(input, "customerName"));
  const customerId = cleanString(valueByAlias(input, "customerId"));
  const dueDate = normalizeDate(valueByAlias(input, "dueDate"));
  const issueDate = normalizeDate(valueByAlias(input, "issueDate"));

  const issues = [];
  if (!invoiceNumber && !cleanString(valueByAlias(input, "vistoInvoiceId"))) issues.push("missing_invoice_number");
  if (!customerName && !customerId && !cleanString(valueByAlias(input, "ico"))) issues.push("missing_customer");
  if (!totalAmount || totalAmount <= 0) issues.push("missing_amount");
  if (!dueDate) issues.push("missing_due_date");

  const normalized = {
    vistoInvoiceId: cleanString(valueByAlias(input, "vistoInvoiceId")),
    invoiceNumber,
    variableSymbol,
    customerId,
    customerName,
    ico: compactSymbol(valueByAlias(input, "ico")),
    dic: cleanString(valueByAlias(input, "dic")),
    issueDate,
    dueDate,
    totalAmount,
    paidAmount,
    openAmount,
    currency: cleanString(valueByAlias(input, "currency")) || "CZK",
    status: cleanString(valueByAlias(input, "status")) || (openAmount > 0 ? "unpaid" : "paid"),
    paidDate: normalizeDate(valueByAlias(input, "paidDate")),
    pdfUrl: cleanString(valueByAlias(input, "pdfUrl")),
    contactEmail: cleanString(valueByAlias(input, "contactEmail")),
    contactPhone: cleanString(valueByAlias(input, "contactPhone")),
    preferredContactPerson: cleanString(valueByAlias(input, "preferredContactPerson"))
  };

  const previewStatus = issues.length ? "needs_review" : "ready";
  const confidence = issues.length ? Math.max(0.35, 0.85 - issues.length * 0.15) : 0.96;

  return {
    rowNumber: index + 1,
    entityKind: "invoice",
    previewStatus,
    confidence: Math.round(confidence * 100) / 100,
    issueCode: invoiceIssueCode(issues),
    issueMessage: issues.join(", "),
    normalized,
    raw: input
  };
}

export function buildInvoiceImportPreview(payload = {}) {
  const rows = parseInvoiceInput(payload).map((row, index) => normalizeInvoicePreviewRow(row, index));
  return {
    source: cleanString(payload.source) || "vistos_invoice_preview",
    importKind: "invoices",
    filename: cleanString(payload.filename),
    inputType: Array.isArray(payload.invoices) || Array.isArray(payload.rows) ? "json" : "text",
    rows,
    summary: summarizeImportPreviewRows(rows)
  };
}

export function bankTransactionToPreviewRow(transaction = {}, index = 0) {
  const dataQualityFlags = Array.isArray(transaction.dataQualityFlags) ? transaction.dataQualityFlags : [];
  let previewStatus = "ignored";
  let issueCode = "";
  let issueMessage = "";
  if (transaction.isReceivableCandidate) {
    if (dataQualityFlags.includes("DUPLICATE_PAYMENT_CANDIDATE")) {
      previewStatus = "needs_review";
      issueCode = "duplicate_payment_candidate";
      issueMessage = "Transakce má duplicitní otisk a vyžaduje kontrolu bankovního ID.";
    } else if (transaction.variableSymbol) {
      previewStatus = "ready";
    } else {
      previewStatus = "needs_review";
      issueCode = "missing_variable_symbol";
      issueMessage = "Příchozí úhrada nemá VS.";
    }
  } else {
    issueCode = transaction.excludedReason || "not_incoming_receivable";
    issueMessage = "Transakce není kandidát na úhradu faktury.";
  }

  return {
    rowNumber: index + 1,
    entityKind: "payment_transaction",
    previewStatus,
    confidence: previewStatus === "ready" ? 0.92 : previewStatus === "needs_review" ? 0.55 : 0,
    issueCode,
    issueMessage,
    normalized: {
      source: transaction.source,
      filename: transaction.filename,
      bankTransactionId: transaction.bankTransactionId,
      bookingDate: transaction.bookingDate,
      valueDate: transaction.valueDate,
      transactionType: transaction.transactionType,
      counterpartyName: transaction.counterpartyName,
      counterpartyAccount: transaction.counterpartyAccount,
      variableSymbol: transaction.variableSymbol,
      constantSymbol: transaction.constantSymbol,
      specificSymbol: transaction.specificSymbol,
      amount: transaction.amount,
      amountIn: transaction.amountIn,
      amountOut: transaction.amountOut,
      currency: "CZK",
      message: transaction.message,
      isIncoming: transaction.isIncoming,
      isReceivableCandidate: transaction.isReceivableCandidate,
      dataQualityFlags
    },
    raw: transaction
  };
}

export function buildBankImportPreview(parsed, payload = {}) {
  const rows = (parsed.transactions || []).map((transaction, index) => bankTransactionToPreviewRow(transaction, index));
  return {
    source: cleanString(payload.source) || parsed.source || "kb_pdf_text",
    importKind: "bank_transactions",
    filename: cleanString(payload.filename || parsed.filename),
    inputType: parsed.parserMode === "kb_csv_v1" ? "kb_csv" : "kb_pdf_text",
    rows,
    summary: {
      ...summarizeImportPreviewRows(rows),
      transactionCount: parsed.transactionCount || rows.length,
      incomingPaymentCount: parsed.incomingPaymentCount || 0,
      emptyVariableSymbolCount: parsed.emptyVariableSymbolCount || 0,
      parserMode: parsed.parserMode || "text_preview",
      pdfBinarySupported: parsed.pdfBinarySupported === true,
      dateFrom: parsed.dateFrom || "",
      dateTo: parsed.dateTo || "",
      uniqueTransactionIdCount: parsed.uniqueTransactionIdCount || 0,
      duplicateTransactionIdCount: parsed.duplicateTransactionIdCount || 0,
      dataQualitySummary: parsed.dataQualitySummary || [],
      contentSha256: parsed.contentSha256 || ""
    }
  };
}

export function summarizeImportPreviewRows(rows = []) {
  const summary = {
    rowCount: rows.length,
    acceptedCount: 0,
    reviewCount: 0,
    ignoredCount: 0
  };
  for (const row of rows) {
    if (row.previewStatus === "ready") summary.acceptedCount += 1;
    else if (row.previewStatus === "ignored") summary.ignoredCount += 1;
    else summary.reviewCount += 1;
  }
  return summary;
}
