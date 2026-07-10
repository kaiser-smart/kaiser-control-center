export const RECEIVABLE_INVOICE_STATUSES = new Set([
  "unpaid",
  "partially_paid",
  "paid",
  "overpaid",
  "disputed",
  "legal_handoff",
  "insolvency_hold"
]);

export const PAYMENT_MATCH_REVIEW_THRESHOLD = 0.85;

function cleanString(value) {
  return String(value ?? "").trim();
}

function numberValue(value, fallback = 0) {
  const number = Number(String(value ?? "").replace(/\s+/g, "").replace(",", "."));
  return Number.isFinite(number) ? number : fallback;
}

function money(value) {
  return Math.round(numberValue(value) * 100) / 100;
}

function normalizeDigits(value) {
  return cleanString(value).replace(/\D/g, "");
}

function normalizeKey(value) {
  return cleanString(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeAccount(value) {
  return cleanString(value).replace(/\s+/g, "").toUpperCase();
}

function dateValue(value) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function dayKey(value) {
  const date = dateValue(value);
  return date ? date.toISOString().slice(0, 10) : "";
}

function tokenSet(value) {
  return new Set(normalizeKey(value).split(" ").filter((token) => token.length > 1));
}

function jaccard(left, right) {
  const a = tokenSet(left);
  const b = tokenSet(right);
  if (!a.size || !b.size) {
    return 0;
  }
  let intersection = 0;
  for (const token of a) {
    if (b.has(token)) {
      intersection += 1;
    }
  }
  return intersection / new Set([...a, ...b]).size;
}

function amountClose(left, right, tolerance = 1) {
  return Math.abs(money(left) - money(right)) <= Math.max(1, tolerance);
}

function invoiceAmount(invoice) {
  return money(invoice?.totalAmount ?? invoice?.total_amount ?? invoice?.amount);
}

function invoiceOpenAmount(invoice) {
  const open = invoice?.openAmount ?? invoice?.open_amount;
  return open === undefined || open === null ? invoiceAmount(invoice) : money(open);
}

function paymentAmount(payment) {
  return money(payment?.amountIn ?? payment?.amount_in ?? payment?.amount);
}

function customerForInvoice(invoice, customersById) {
  return customersById.get(cleanString(invoice?.customerId || invoice?.customer_id)) || {};
}

function knownCustomerAccounts(customer) {
  return [
    customer?.counterpartyAccount,
    customer?.counterparty_account,
    customer?.bankAccount,
    customer?.bank_account,
    ...(Array.isArray(customer?.bankAccounts) ? customer.bankAccounts : []),
    ...(Array.isArray(customer?.bank_accounts) ? customer.bank_accounts : [])
  ].map(normalizeAccount).filter(Boolean);
}

function invoiceIdentifiers(invoice) {
  return [
    normalizeDigits(invoice?.variableSymbol || invoice?.variable_symbol),
    normalizeDigits(invoice?.invoiceNumber || invoice?.invoice_number)
  ].filter(Boolean);
}

function paymentMessage(payment) {
  return [
    payment?.message,
    payment?.counterpartyName,
    payment?.counterparty_name,
    payment?.transactionType,
    payment?.transaction_type
  ].map(cleanString).filter(Boolean).join(" ");
}

function paymentMatchesInvoiceText(payment, invoice) {
  const message = normalizeDigits(paymentMessage(payment));
  return invoiceIdentifiers(invoice).some((identifier) => identifier && message.includes(identifier));
}

function candidateScore(invoice, payment, customer) {
  const invoiceVs = normalizeDigits(invoice?.variableSymbol || invoice?.variable_symbol);
  const paymentVs = normalizeDigits(payment?.variableSymbol || payment?.variable_symbol);
  const paymentAccount = normalizeAccount(payment?.counterpartyAccount || payment?.counterparty_account);
  const invoiceTotal = invoiceAmount(invoice);
  const openAmount = invoiceOpenAmount(invoice);
  const amount = paymentAmount(payment);
  const tolerance = receivableToleranceAmount(invoiceTotal);

  if (invoiceVs && paymentVs && invoiceVs === paymentVs) {
    return {
      confidence: 0.98,
      matchMethod: "variable_symbol_exact",
      reason: "Přesná shoda variabilního symbolu."
    };
  }

  if (paymentMatchesInvoiceText(payment, invoice)) {
    return {
      confidence: 0.92,
      matchMethod: "invoice_number_in_message",
      reason: "Číslo faktury nebo VS je ve zprávě platby."
    };
  }

  const accounts = knownCustomerAccounts(customer);
  if (paymentAccount && accounts.includes(paymentAccount)) {
    const amountBonus = amountClose(amount, openAmount || invoiceTotal, tolerance) ? 0.08 : 0;
    return {
      confidence: Math.min(0.9, 0.82 + amountBonus),
      matchMethod: amountBonus ? "counterparty_account_amount" : "counterparty_account",
      reason: amountBonus
        ? "Shoduje se známý protiúčet zákazníka a částka."
        : "Shoduje se známý protiúčet zákazníka."
    };
  }

  const nameSimilarity = jaccard(
    payment?.counterpartyName || payment?.counterparty_name,
    customer?.companyName || customer?.company_name || invoice?.companyName || invoice?.company_name
  );
  if (nameSimilarity >= 0.72) {
    const amountBonus = amountClose(amount, openAmount || invoiceTotal, tolerance) ? 0.07 : 0;
    return {
      confidence: Math.min(0.88, 0.78 + amountBonus),
      matchMethod: amountBonus ? "counterparty_name_amount" : "counterparty_name",
      reason: amountBonus
        ? "Shoduje se název protiúčtu a částka."
        : "Shoduje se název protiúčtu."
    };
  }

  if (amountClose(amount, openAmount || invoiceTotal, tolerance)) {
    return {
      confidence: paymentVs ? 0.7 : 0.55,
      matchMethod: "amount_only",
      reason: "Shoduje se částka, ale chybí bezpečný identifikátor."
    };
  }

  return {
    confidence: 0,
    matchMethod: "no_match",
    reason: "Platba nemá dostatečnou shodu s fakturou."
  };
}

function sortCandidates(left, right) {
  if (right.confidence !== left.confidence) {
    return right.confidence - left.confidence;
  }
  return Math.abs(left.openAmount - left.paymentAmount) - Math.abs(right.openAmount - right.paymentAmount);
}

export function receivableToleranceAmount(totalAmount) {
  const total = Math.abs(money(totalAmount));
  return Math.max(1, Math.round(total * 0.001 * 100) / 100);
}

export function calculateInvoicePaymentState(invoice, matches = [], options = {}) {
  const total = invoiceAmount(invoice);
  const tolerance = options.toleranceAmount ?? receivableToleranceAmount(total);
  const protectedStatus = cleanString(invoice?.status).toLowerCase();
  if (["legal_handoff", "insolvency_hold"].includes(protectedStatus)) {
    return {
      status: protectedStatus,
      paidAmount: money(invoice?.paidAmount ?? invoice?.paid_amount),
      openAmount: Math.max(0, money(invoice?.openAmount ?? invoice?.open_amount)),
      paidDate: cleanString(invoice?.paidDate || invoice?.paid_date)
    };
  }

  const paidMatches = matches
    .filter((match) => !["rejected", "needs_review"].includes(cleanString(match?.status).toLowerCase()))
    .map((match) => ({
      amount: money(match?.matchedAmount ?? match?.matched_amount ?? match?.amount),
      date: dayKey(match?.bookingDate || match?.booking_date || match?.matchedAt || match?.matched_at)
    }))
    .sort((left, right) => cleanString(left.date).localeCompare(cleanString(right.date)));

  let cumulative = 0;
  let paidDate = "";
  for (const match of paidMatches) {
    cumulative = money(cumulative + match.amount);
    if (!paidDate && cumulative >= total - tolerance) {
      paidDate = match.date;
    }
  }

  const paidAmount = money(cumulative);
  const openAmount = money(total - paidAmount);
  const status = paidAmount > total + tolerance
    ? "overpaid"
    : paidAmount >= total - tolerance
      ? "paid"
      : paidAmount > 0
        ? "partially_paid"
        : "unpaid";

  return {
    status,
    paidAmount,
    openAmount: status === "overpaid" ? 0 : Math.max(0, openAmount),
    paidDate: status === "paid" || status === "overpaid" ? paidDate : ""
  };
}

export function matchReceivablePayments(invoices = [], payments = [], customers = [], options = {}) {
  const reviewThreshold = Number(options.reviewThreshold ?? PAYMENT_MATCH_REVIEW_THRESHOLD);
  const includePaidInvoices = options.includePaidInvoices === true;
  const ambiguousVariableSymbols = new Set((options.ambiguousVariableSymbols || []).map(normalizeDigits).filter(Boolean));
  const customersById = new Map(customers.map((customer) => [cleanString(customer.id), customer]));
  const candidates = [];

  for (const payment of payments) {
    if (paymentAmount(payment) <= 0) {
      continue;
    }

    for (const invoice of invoices) {
      const status = cleanString(invoice?.status).toLowerCase();
      if (["legal_handoff", "insolvency_hold"].includes(status) || (!includePaidInvoices && ["paid", "overpaid"].includes(status))) {
        continue;
      }

      const customer = customerForInvoice(invoice, customersById);
      const score = candidateScore(invoice, payment, customer);
      if (score.confidence <= 0) {
        continue;
      }

      const invoiceVs = normalizeDigits(invoice?.variableSymbol || invoice?.variable_symbol);
      const ambiguousVs = invoiceVs && ambiguousVariableSymbols.has(invoiceVs);
      const confidence = ambiguousVs && score.matchMethod === "variable_symbol_exact" ? 0.7 : score.confidence;
      candidates.push({
        invoiceId: cleanString(invoice.id),
        paymentTransactionId: cleanString(payment.id),
        bookingDate: dayKey(payment?.bookingDate || payment?.booking_date),
        customerId: cleanString(invoice?.customerId || invoice?.customer_id),
        matchedAmount: Math.min(paymentAmount(payment), Math.max(invoiceOpenAmount(invoice), 0) || paymentAmount(payment)),
        paymentAmount: paymentAmount(payment),
        openAmount: invoiceOpenAmount(invoice),
        confidence,
        matchMethod: score.matchMethod,
        reason: ambiguousVs
          ? "Variabilní symbol používá více faktur nebo zákazníků a vyžaduje ruční kontrolu."
          : score.reason,
        status: confidence >= reviewThreshold ? "auto_matched" : "needs_review"
      });
    }
  }

  const matches = [];
  const reviewQueue = [];
  const candidatesByPayment = new Map();
  for (const candidate of candidates) {
    const current = candidatesByPayment.get(candidate.paymentTransactionId) || [];
    current.push(candidate);
    candidatesByPayment.set(candidate.paymentTransactionId, current);
  }
  const allocatedByInvoice = new Map();
  const orderedPayments = [...candidatesByPayment.entries()].sort((left, right) => {
    const leftDate = cleanString(left[1][0]?.bookingDate);
    const rightDate = cleanString(right[1][0]?.bookingDate);
    return leftDate.localeCompare(rightDate) || left[0].localeCompare(right[0]);
  });

  for (const [, paymentCandidates] of orderedPayments) {
    const ranked = paymentCandidates.sort(sortCandidates);
    const top = ranked[0];
    const second = ranked[1];
    const ambiguousTop = Boolean(second && Math.abs(top.confidence - second.confidence) < 0.05);
    if (top.status !== "auto_matched" || ambiguousTop) {
      reviewQueue.push(...ranked.map((candidate) => ({
        ...candidate,
        status: "needs_review",
        reason: ambiguousTop
          ? "Platba má více srovnatelných kandidátů a vyžaduje ruční kontrolu."
          : candidate.reason
      })));
      continue;
    }

    const alreadyAllocated = allocatedByInvoice.get(top.invoiceId) || 0;
    const remainingOpen = Math.max(0, money(top.openAmount - alreadyAllocated));
    if (remainingOpen <= 0) {
      reviewQueue.push({
        ...top,
        status: "needs_review",
        reason: "Faktura je již pokryta dříve přiřazenými platbami."
      });
      continue;
    }
    const matchedAmount = Math.min(top.paymentAmount, remainingOpen);
    allocatedByInvoice.set(top.invoiceId, money(alreadyAllocated + matchedAmount));
    matches.push({
      ...top,
      matchedAmount,
      unallocatedAmount: Math.max(0, money(top.paymentAmount - matchedAmount)),
      matchConfidence: top.confidence
    });
  }

  return {
    matches,
    reviewQueue,
    threshold: reviewThreshold
  };
}
