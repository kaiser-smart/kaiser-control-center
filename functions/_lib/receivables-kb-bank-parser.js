function cleanString(value) {
  return String(value ?? "").trim();
}

function normalizeWhitespace(value) {
  return cleanString(value).replace(/\s+/g, " ");
}

function parseCzechMoney(value) {
  const normalized = cleanString(value)
    .replace(/\s+/g, "")
    .replace(/\./g, "")
    .replace(",", ".");
  const number = Number(normalized);
  return Number.isFinite(number) ? Math.round(number * 100) / 100 : 0;
}

function toIsoDate(value) {
  const match = cleanString(value).match(/^(\d{2})\.(\d{2})\.(\d{4})$/);
  if (!match) {
    return "";
  }
  return `${match[3]}-${match[2]}-${match[1]}`;
}

function normalizeSymbol(value) {
  const digits = cleanString(value).replace(/\D/g, "");
  return digits === "0" ? "" : digits;
}

function extractSymbol(blockText, labels) {
  for (const label of labels) {
    const pattern = new RegExp(`(?:${label})\\s*[:\\-]?\\s*(\\d{1,20})`, "i");
    const match = blockText.match(pattern);
    if (match) {
      return normalizeSymbol(match[1]);
    }
  }
  return "";
}

function extractAccount(blockText) {
  const iban = blockText.match(/\bCZ\d{2}\s*(?:\d{4}\s*){5}\b/i);
  if (iban) {
    return iban[0].replace(/\s+/g, "").toUpperCase();
  }

  const account = blockText.match(/\b\d{1,6}-?\d{2,10}\/\d{4}\b/);
  return account ? account[0] : "";
}

function isExcludedTransaction(type, blockText) {
  const normalized = normalizeWhitespace(`${type} ${blockText}`).toLowerCase();
  return [
    "poplatek",
    "úvěr",
    "uver",
    "splátka úvěru",
    "splatka uveru",
    "odchozí úhrada",
    "odchozi uhrada",
    "výběr",
    "vyber"
  ].some((word) => normalized.includes(word));
}

function isIncoming(type, amount) {
  const normalized = normalizeWhitespace(type).toLowerCase();
  return amount > 0 && (
    normalized.includes("příchozí") ||
    normalized.includes("prichozi") ||
    normalized.includes("připsáno") ||
    normalized.includes("pripsano")
  );
}

function transactionTypeFromLead(lead) {
  return normalizeWhitespace(lead)
    .replace(/\b\d{3,}\b/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function variableSymbolFromLead(lead) {
  const match = cleanString(lead).match(/\b(\d{4,12})\b/);
  return match ? normalizeSymbol(match[1]) : "";
}

function counterpartyName(blockLines) {
  const joined = blockLines.map(normalizeWhitespace).filter(Boolean);
  const skip = /^(vs|ks|ss|variabilní|variabilni|konstantní|konstantni|specifický|specificky|protiúčet|protiucet|zpráva|zprava|poznámka|poznamka)/i;
  return joined.find((line) => !skip.test(line) && !/\d{1,6}-?\d{2,10}\/\d{4}/.test(line) && !/\bCZ\d{2}/i.test(line)) || "";
}

function transactionIdFromBlock(blockText, fallback) {
  const explicit = blockText.match(/(?:id|identifikace|transakce)\s*[:\-]?\s*([A-Z0-9_-]{6,})/i);
  if (explicit) {
    return explicit[1];
  }
  return fallback;
}

function parseTransactionBlock(block, index, options = {}) {
  const firstLine = normalizeWhitespace(block[0]);
  const dateMatch = firstLine.match(/^(\d{2}\.\d{2}\.\d{4})\s+(.+)$/);
  if (!dateMatch) {
    return null;
  }

  const rest = dateMatch[2];
  const moneyMatches = [...rest.matchAll(/[+-]?(?:\d{1,3}(?:\s\d{3})+|\d+),\d{2}/g)];
  const amountMatch = moneyMatches.at(-1);
  if (!amountMatch) {
    return null;
  }

  const bookingDate = toIsoDate(dateMatch[1]);
  const lead = normalizeWhitespace(rest.slice(0, amountMatch.index));
  const amount = parseCzechMoney(amountMatch[0]);
  const blockText = normalizeWhitespace(block.join(" "));
  const type = transactionTypeFromLead(lead);
  const amountIn = isIncoming(type, amount) ? amount : 0;
  const amountOut = amountIn ? 0 : amount;
  const variableSymbol = extractSymbol(blockText, ["VS", "Variabilní symbol", "Variabilni symbol"]) ||
    variableSymbolFromLead(lead);
  const constantSymbol = extractSymbol(blockText, ["KS", "Konstantní symbol", "Konstantni symbol"]);
  const specificSymbol = extractSymbol(blockText, ["SS", "Specifický symbol", "Specificky symbol"]);
  const transactionId = transactionIdFromBlock(blockText, `${options.source || "kb_pdf"}-${bookingDate}-${index + 1}`);
  const excluded = isExcludedTransaction(type, blockText);

  return {
    source: options.source || "kb_pdf_text",
    filename: cleanString(options.filename),
    bankTransactionId: transactionId,
    bookingDate,
    valueDate: bookingDate,
    transactionType: type,
    counterpartyName: counterpartyName(block.slice(1)),
    counterpartyAccount: extractAccount(blockText),
    variableSymbol,
    constantSymbol,
    specificSymbol,
    amount,
    amountIn,
    amountOut,
    message: block.slice(1).map(normalizeWhitespace).filter(Boolean).join(" "),
    isIncoming: amountIn > 0,
    isReceivableCandidate: amountIn > 0 && !excluded,
    excludedReason: excluded ? "excluded_transaction_type" : "",
    rawText: block.join("\n")
  };
}

export function parseKbBankStatementText(text, options = {}) {
  const lines = cleanString(text)
    .split(/\r?\n/)
    .map((line) => line.replace(/\u00a0/g, " ").trim())
    .filter(Boolean);
  const blocks = [];
  let current = [];
  const startPattern = /^\d{2}\.\d{2}\.\d{4}\s+/;

  for (const line of lines) {
    if (startPattern.test(line) && current.length) {
      blocks.push(current);
      current = [line];
      continue;
    }
    current.push(line);
  }
  if (current.length) {
    blocks.push(current);
  }

  const transactions = blocks
    .map((block, index) => parseTransactionBlock(block, index, options))
    .filter(Boolean);
  const incomingPayments = transactions.filter((transaction) => transaction.isReceivableCandidate);

  return {
    source: options.source || "kb_pdf_text",
    filename: cleanString(options.filename),
    parserMode: "text_preview",
    pdfBinarySupported: false,
    transactionCount: transactions.length,
    incomingPaymentCount: incomingPayments.length,
    emptyVariableSymbolCount: incomingPayments.filter((transaction) => !transaction.variableSymbol).length,
    transactions,
    incomingPayments
  };
}
