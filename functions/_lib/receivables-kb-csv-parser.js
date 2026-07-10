function cleanString(value) {
  return String(value ?? "").replace(/^\uFEFF/, "").trim();
}

function normalizedHeader(value) {
  return cleanString(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

function parseCsvRows(text, delimiter = ";") {
  const rows = [];
  let row = [];
  let field = "";
  let quoted = false;
  const source = String(text ?? "").replace(/^\uFEFF/, "");
  for (let index = 0; index < source.length; index += 1) {
    const character = source[index];
    if (character === '"') {
      if (quoted && source[index + 1] === '"') {
        field += '"';
        index += 1;
      } else {
        quoted = !quoted;
      }
      continue;
    }
    if (!quoted && character === delimiter) {
      row.push(field);
      field = "";
      continue;
    }
    if (!quoted && (character === "\n" || character === "\r")) {
      if (character === "\r" && source[index + 1] === "\n") index += 1;
      row.push(field);
      if (row.some((value) => cleanString(value))) rows.push(row);
      row = [];
      field = "";
      continue;
    }
    field += character;
  }
  row.push(field);
  if (row.some((value) => cleanString(value))) rows.push(row);
  return rows;
}

function parseCzechMoney(value) {
  const normalized = cleanString(value)
    .replace(/\u00a0/g, "")
    .replace(/\s+/g, "")
    .replace(/\./g, "")
    .replace(",", ".")
    .replace(/[^0-9+.-]/g, "");
  if (!normalized) return null;
  const number = Number(normalized);
  return Number.isFinite(number) ? Math.round(number * 100) / 100 : null;
}

function isoDate(value) {
  const match = cleanString(value).match(/^(\d{2})\.(\d{2})\.(\d{4})$/);
  if (!match) return "";
  const candidate = `${match[3]}-${match[2]}-${match[1]}`;
  const date = new Date(`${candidate}T00:00:00.000Z`);
  return Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== candidate ? "" : candidate;
}

function normalizeSymbol(value) {
  const digits = cleanString(value).replace(/\D/g, "");
  return !digits || Number(digits) === 0 ? "" : digits;
}

function normalizeAccount(value) {
  return cleanString(value).replace(/\s+/g, "").toUpperCase();
}

function valueGetter(header, row) {
  const indexByHeader = new Map(header.map((value, index) => [normalizedHeader(value), index]));
  return (...aliases) => {
    for (const alias of aliases) {
      const index = indexByHeader.get(normalizedHeader(alias));
      if (index !== undefined) return cleanString(row[index]);
    }
    return "";
  };
}

function transactionMessage(get) {
  return [
    get("Popis prikazce", "Popis příkazce"),
    get("Popis pro prijemce", "Popis pro příjemce"),
    get("AV pole 1"),
    get("AV pole 2"),
    get("AV pole 3"),
    get("AV pole 4")
  ].filter(Boolean).join(" ");
}

function transactionFingerprint(transaction) {
  return [
    transaction.bookingDate,
    transaction.amount,
    transaction.variableSymbol,
    transaction.counterpartyAccount
  ].join("|");
}

function countFlags(transactions) {
  const counts = new Map();
  for (const transaction of transactions) {
    for (const flag of transaction.dataQualityFlags || []) {
      counts.set(flag, (counts.get(flag) || 0) + 1);
    }
  }
  return [...counts.entries()]
    .map(([code, count]) => ({ code, count }))
    .sort((left, right) => right.count - left.count || left.code.localeCompare(right.code));
}

function fnv1a32(value) {
  let hash = 0x811c9dc5;
  const text = String(value ?? "");
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

export async function kbCsvContentSha256(text) {
  if (!globalThis.crypto?.subtle) return `fnv1a32:${fnv1a32(text)}`;
  const bytes = new TextEncoder().encode(String(text ?? ""));
  const digest = await globalThis.crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

export function isKbBankCsvText(text) {
  const normalized = String(text ?? "").slice(0, 20000).normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  return normalized.includes("Identifikace transakce") && normalized.includes("Protiucet/Kod banky");
}

export function parseKbBankCsvText(text, options = {}) {
  const rows = parseCsvRows(text, ";");
  const headerIndex = rows.findIndex((row) => row.some((value) => normalizedHeader(value) === "identifikace transakce"));
  if (headerIndex < 0) {
    return {
      source: options.source || "kb_csv",
      filename: cleanString(options.filename),
      parserMode: "kb_csv_v1",
      apiStatus: "invalid",
      transactionCount: 0,
      incomingPaymentCount: 0,
      emptyVariableSymbolCount: 0,
      transactions: [],
      incomingPayments: [],
      dataQualityFlags: ["KB_CSV_HEADER_NOT_FOUND"]
    };
  }

  const header = rows[headerIndex].map(cleanString);
  const internalAccounts = new Set((options.internalAccounts || []).map(normalizeAccount).filter(Boolean));
  const transactions = [];
  for (const row of rows.slice(headerIndex + 1)) {
    const get = valueGetter(header, row);
    const amount = parseCzechMoney(get("Castka", "Částka"));
    const bookingDate = isoDate(get("Datum zuctovani", "Datum zúčtování"));
    const bankTransactionId = get("Identifikace transakce");
    if (amount === null && !bookingDate && !bankTransactionId) continue;
    const counterpartyAccount = normalizeAccount(get("Protiucet/Kod banky", "Protiúčet/Kód banky"));
    const variableSymbol = normalizeSymbol(get("VS"));
    const dataQualityFlags = [];
    if (!bankTransactionId) dataQualityFlags.push("MISSING_BANK_TRANSACTION_ID");
    if (!bookingDate) dataQualityFlags.push("MISSING_BOOKING_DATE");
    if (amount === null) dataQualityFlags.push("MISSING_PAYMENT_AMOUNT");
    if (amount > 0 && !variableSymbol) dataQualityFlags.push("PAYMENT_WITHOUT_VS");
    const internal = counterpartyAccount && internalAccounts.has(counterpartyAccount);
    if (internal) dataQualityFlags.push("INTERNAL_COMPANY_CANDIDATE");
    transactions.push({
      source: options.source || "kb_csv",
      filename: cleanString(options.filename),
      bankTransactionId,
      bookingDate,
      valueDate: isoDate(get("Datum splatnosti")) || bookingDate,
      transactionType: get("Systemovy popis", "Systémový popis"),
      counterpartyName: get("Nazev protiuctu", "Název protiúčtu"),
      counterpartyAccount,
      variableSymbol,
      constantSymbol: normalizeSymbol(get("KS")),
      specificSymbol: normalizeSymbol(get("SS")),
      amount: amount ?? 0,
      amountIn: amount && amount > 0 ? amount : 0,
      amountOut: amount && amount < 0 ? Math.abs(amount) : 0,
      message: transactionMessage(get),
      isIncoming: Boolean(amount && amount > 0),
      isReceivableCandidate: Boolean(amount && amount > 0 && !internal),
      excludedReason: internal ? "internal_company_account" : "",
      dataQualityFlags,
      raw: Object.fromEntries(header.map((name, index) => [name || `column_${index + 1}`, cleanString(row[index])]))
    });
  }

  const byId = new Map();
  const byFingerprint = new Map();
  for (const transaction of transactions) {
    if (transaction.bankTransactionId) {
      const current = byId.get(transaction.bankTransactionId) || [];
      current.push(transaction);
      byId.set(transaction.bankTransactionId, current);
    }
    const fingerprint = transactionFingerprint(transaction);
    const current = byFingerprint.get(fingerprint) || [];
    current.push(transaction);
    byFingerprint.set(fingerprint, current);
  }
  for (const group of byId.values()) {
    if (group.length > 1) group.forEach((transaction) => transaction.dataQualityFlags.push("DUPLICATE_PAYMENT_CANDIDATE"));
  }
  for (const group of byFingerprint.values()) {
    if (group.length > 1) group.forEach((transaction) => transaction.dataQualityFlags.push("DUPLICATE_PAYMENT_CANDIDATE"));
  }
  transactions.forEach((transaction) => {
    transaction.dataQualityFlags = [...new Set(transaction.dataQualityFlags)].sort();
  });

  const incomingPayments = transactions.filter((transaction) => transaction.isReceivableCandidate);
  const dates = transactions.map((transaction) => transaction.bookingDate).filter(Boolean).sort();
  return {
    source: options.source || "kb_csv",
    filename: cleanString(options.filename),
    parserMode: "kb_csv_v1",
    apiStatus: "ready",
    inputFingerprint: `fnv1a32:${fnv1a32(text)}`,
    headerRow: headerIndex + 1,
    columnCount: header.length,
    transactionCount: transactions.length,
    incomingPaymentCount: incomingPayments.length,
    outgoingPaymentCount: transactions.filter((transaction) => transaction.amountOut > 0).length,
    emptyVariableSymbolCount: incomingPayments.filter((transaction) => !transaction.variableSymbol).length,
    uniqueTransactionIdCount: byId.size,
    duplicateTransactionIdCount: [...byId.values()].filter((group) => group.length > 1).length,
    dateFrom: dates[0] || "",
    dateTo: dates.at(-1) || "",
    dataQualitySummary: countFlags(transactions),
    transactions,
    incomingPayments
  };
}
