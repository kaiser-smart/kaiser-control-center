const MS_PER_DAY = 24 * 60 * 60 * 1000;

export const PAYMENT_RATING_CALCULATION_VERSION = "payment-rating-v1";

const FINAL_RATINGS = new Set(["A", "B", "C", "D", "E"]);
const ACCEPTED_MATCH_STATUSES = new Set(["", "matched", "auto_matched", "manual_matched", "confirmed"]);
const CRITICAL_FINAL_FLAGS = new Set([
  "CUSTOMER_LINK_NOT_RELIABLE",
  "MULTIPLE_CUSTOMER_CANDIDATES",
  "MISSING_INVOICE_AMOUNT"
]);

function cleanString(value) {
  return String(value ?? "").trim();
}

function uniqueSorted(values = []) {
  return [...new Set(values.filter(Boolean))].sort((left, right) => left.localeCompare(right));
}

function clamp(value, min = 0, max = 1) {
  const number = Number(value);
  if (!Number.isFinite(number)) return min;
  return Math.min(max, Math.max(min, number));
}

function round(value, digits = 2) {
  if (!Number.isFinite(value)) return 0;
  const factor = 10 ** digits;
  return Math.round((value + Number.EPSILON) * factor) / factor;
}

function parseMoneyNumber(value) {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  let normalized = cleanString(value)
    .replace(/\u00a0/g, "")
    .replace(/\s+/g, "")
    .replace(/[^0-9,.-]/g, "");
  if (!normalized) return null;
  if (normalized.includes(",") && normalized.includes(".")) {
    if (normalized.lastIndexOf(",") > normalized.lastIndexOf(".")) {
      normalized = normalized.replace(/\./g, "").replace(",", ".");
    } else {
      normalized = normalized.replace(/,/g, "");
    }
  } else if (normalized.includes(",")) {
    normalized = normalized.replace(/\./g, "").replace(",", ".");
  }
  const number = Number(normalized);
  return Number.isFinite(number) ? number : null;
}

function toCents(value) {
  const number = parseMoneyNumber(value);
  return number === null ? null : Math.round(number * 100);
}

function fromCents(value) {
  return round((Number(value) || 0) / 100, 2);
}

function firstDefined(object, keys) {
  for (const key of keys) {
    if (object?.[key] !== undefined && object?.[key] !== null && cleanString(object[key]) !== "") {
      return object[key];
    }
  }
  return null;
}

function strictDateKey(value) {
  const text = cleanString(value);
  const match = text.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return "";
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(Date.UTC(year, month - 1, day));
  if (
    date.getUTCFullYear() !== year
    || date.getUTCMonth() !== month - 1
    || date.getUTCDate() !== day
  ) return "";
  return text;
}

function dateFromKey(value) {
  const key = strictDateKey(value);
  return key ? new Date(`${key}T00:00:00.000Z`) : null;
}

function addDays(value, days) {
  const date = dateFromKey(value);
  if (!date) return "";
  date.setUTCDate(date.getUTCDate() + Number(days || 0));
  return date.toISOString().slice(0, 10);
}

function daysBetween(left, right) {
  const leftDate = dateFromKey(left);
  const rightDate = dateFromKey(right);
  if (!leftDate || !rightDate) return null;
  return Math.floor((rightDate.getTime() - leftDate.getTime()) / MS_PER_DAY);
}

function percentile(values, percentileValue) {
  const sorted = values.filter(Number.isFinite).sort((left, right) => left - right);
  if (!sorted.length) return null;
  const index = Math.ceil((percentileValue / 100) * sorted.length) - 1;
  return sorted[Math.min(sorted.length - 1, Math.max(0, index))];
}

function invoiceTotalCents(invoice) {
  return toCents(firstDefined(invoice, ["totalAmount", "total_amount", "amount"]));
}

function invoicePaidCents(invoice) {
  return toCents(firstDefined(invoice, ["paidAmount", "paid_amount"]));
}

function invoiceOpenCents(invoice) {
  return toCents(firstDefined(invoice, ["openAmount", "open_amount", "remainingAmount", "remaining_amount"]));
}

function invoiceDueDate(invoice) {
  return strictDateKey(firstDefined(invoice, ["dueDate", "due_date"]));
}

function invoiceIssueDate(invoice) {
  return strictDateKey(firstDefined(invoice, ["issueDate", "issue_date"]));
}

function invoiceProvidedPaidDate(invoice) {
  return strictDateKey(firstDefined(invoice, ["paidDate", "paid_date"]));
}

function invoiceStatus(invoice) {
  return cleanString(invoice?.status).toLowerCase();
}

function acceptedMatchedPayments(invoice = {}) {
  const source = Array.isArray(invoice.matchedPayments)
    ? invoice.matchedPayments
    : Array.isArray(invoice.matched_payments) ? invoice.matched_payments : [];
  return source
    .filter((payment) => ACCEPTED_MATCH_STATUSES.has(cleanString(payment?.status || payment?.matchStatus).toLowerCase()))
    .map((payment) => ({
      id: cleanString(payment?.paymentId || payment?.payment_id || payment?.id || payment?.paymentTransactionId),
      date: strictDateKey(payment?.bookingDate || payment?.booking_date || payment?.matchedAt || payment?.matched_at),
      cents: toCents(firstDefined(payment, ["matchedAmount", "matched_amount", "amountIn", "amount_in", "amount"]))
    }))
    .filter((payment) => payment.date && payment.cents !== null && payment.cents !== 0)
    .sort((left, right) => left.date.localeCompare(right.date) || left.id.localeCompare(right.id));
}

export function receivableToleranceAmount(totalAmount) {
  const cents = Math.abs(toCents(totalAmount) || 0);
  return fromCents(Math.max(100, Math.round(cents * 0.001)));
}

export function deriveInvoicePaidDate(invoice = {}, options = {}) {
  const totalCents = invoiceTotalCents(invoice);
  if (!totalCents || totalCents <= 0) {
    return { paidDate: "", paidAmount: 0, openAmount: 0, status: "unknown", source: "none" };
  }
  const toleranceCents = toCents(options.toleranceAmount) ?? Math.max(100, Math.round(totalCents * 0.001));
  const providedPaidDate = invoiceProvidedPaidDate(invoice);
  const paidDateReliable = invoice.paidDateReliable !== false && invoice.paid_date_reliable !== false;
  const payments = acceptedMatchedPayments(invoice);
  let cumulativeCents = 0;
  let derivedPaidDate = "";
  for (const payment of payments) {
    cumulativeCents += payment.cents;
    if (!derivedPaidDate && cumulativeCents >= totalCents - toleranceCents) derivedPaidDate = payment.date;
  }

  const explicitPaidCents = invoicePaidCents(invoice);
  const explicitOpenCents = invoiceOpenCents(invoice);
  const paidCents = payments.length ? cumulativeCents : Math.max(0, explicitPaidCents ?? 0);
  const calculatedOpenCents = Math.max(0, totalCents - paidCents);
  // Once matched payments are available, their cumulative amount is the
  // authoritative source for partial/full settlement in this calculation.
  const openCents = payments.length
    ? calculatedOpenCents
    : explicitOpenCents === null ? calculatedOpenCents : Math.max(0, explicitOpenCents);
  const statusText = invoiceStatus(invoice);
  const settled = payments.length
    ? Boolean(derivedPaidDate || (paidDateReliable && providedPaidDate))
    : Boolean(
      (paidDateReliable && providedPaidDate)
      || paidCents >= totalCents - toleranceCents
      || openCents <= toleranceCents
      || ["paid", "overpaid"].includes(statusText)
    );
  const overpaid = paidCents > totalCents + toleranceCents || statusText === "overpaid";
  const paidDate = derivedPaidDate || (paidDateReliable && providedPaidDate ? providedPaidDate : "");
  const status = settled
    ? (overpaid ? "overpaid" : "paid")
    : paidCents > 0 || (explicitPaidCents || 0) > 0 ? "partially_paid" : "unpaid";
  return {
    paidDate,
    paidAmount: fromCents(Math.max(0, paidCents)),
    openAmount: status === "paid" || status === "overpaid" ? 0 : fromCents(openCents),
    status,
    source: derivedPaidDate ? "matched_payments" : paidDate ? "provided_paid_date" : "payment_state",
    toleranceAmount: fromCents(toleranceCents),
    matchedPaymentCount: payments.length
  };
}

function invoiceDataQualityFlags(invoice, paymentState) {
  const flags = Array.isArray(invoice?.dataQualityFlags)
    ? [...invoice.dataQualityFlags]
    : Array.isArray(invoice?.data_quality_flags) ? [...invoice.data_quality_flags] : [];
  const totalCents = invoiceTotalCents(invoice);
  const paidCents = invoicePaidCents(invoice);
  const openCents = invoiceOpenCents(invoice);
  if (!invoiceDueDate(invoice)) flags.push("MISSING_DUE_DATE");
  if (!cleanString(invoice?.variableSymbol || invoice?.variable_symbol)) flags.push("MISSING_VARIABLE_SYMBOL");
  if (totalCents === null || totalCents === 0) flags.push("MISSING_INVOICE_AMOUNT");
  if (totalCents !== null && totalCents < 0) flags.push("CREDIT_NOTE_PRESENT");
  if (paidCents === null) flags.push("MISSING_PAID_AMOUNT");
  if (openCents === null) flags.push("MISSING_REMAINING_AMOUNT");
  if (["paid", "overpaid"].includes(paymentState.status) && !paymentState.paidDate) flags.push("MISSING_PAID_DATE");
  if (paymentState.status === "partially_paid") flags.push("PARTIAL_PAYMENT_OPEN");
  if (totalCents !== null && paidCents !== null && openCents !== null) {
    const toleranceCents = Math.max(100, Math.round(Math.abs(totalCents) * 0.001));
    if (Math.abs(totalCents - paidCents - openCents) > toleranceCents) flags.push("INVOICE_AMOUNT_MISMATCH");
  }
  if (invoice.disputeActive === true || invoiceStatus(invoice) === "disputed") flags.push("DISPUTE_ACTIVE");
  return flags;
}

function normalizeInvoices(invoices = []) {
  return invoices.map((invoice, index) => {
    const paymentState = deriveInvoicePaidDate(invoice);
    const totalCents = invoiceTotalCents(invoice);
    const explicitPaidCents = invoicePaidCents(invoice);
    const explicitOpenCents = invoiceOpenCents(invoice);
    const paidCents = toCents(paymentState.paidAmount) ?? Math.max(0, explicitPaidCents ?? 0);
    const openCents = toCents(paymentState.openAmount) ?? Math.max(0, explicitOpenCents ?? 0);
    return {
      raw: invoice,
      id: cleanString(invoice?.invoiceId || invoice?.invoice_id || invoice?.id || `invoice-${index + 1}`),
      issueDate: invoiceIssueDate(invoice),
      dueDate: invoiceDueDate(invoice),
      totalCents,
      paidCents,
      openCents,
      paymentState,
      status: paymentState.status,
      flags: invoiceDataQualityFlags(invoice, paymentState),
      payments: acceptedMatchedPayments(invoice)
    };
  });
}

function paymentQualityFlags(payments = []) {
  const flags = [];
  for (const payment of payments) {
    const sourceFlags = Array.isArray(payment?.dataQualityFlags)
      ? payment.dataQualityFlags
      : Array.isArray(payment?.data_quality_flags) ? payment.data_quality_flags : [];
    flags.push(...sourceFlags);
    const variableSymbol = cleanString(payment?.variableSymbol || payment?.variable_symbol).replace(/\D/g, "");
    if (!variableSymbol || Number(variableSymbol) === 0) flags.push("PAYMENT_WITHOUT_VS");
    if (cleanString(payment?.status || payment?.matchStatus).toLowerCase() === "needs_review") {
      flags.push("PAYMENT_MATCH_LOW_CONFIDENCE");
    }
    if (!cleanString(payment?.matchedInvoiceId || payment?.matched_invoice_id) && payment?.matched !== true) {
      flags.push("UNMATCHED_PAYMENT");
    }
    if (payment?.duplicateCandidate === true || payment?.duplicate_candidate === true) {
      flags.push("DUPLICATE_PAYMENT_CANDIDATE");
    }
  }
  return flags;
}

function customerQualityFlags(input = {}) {
  const flags = [];
  const confidence = cleanString(input.customerLinkConfidence || input.customer_link_confidence).toUpperCase();
  if (input.customerLinkReliable === false || ["", "NONE", "LOW"].includes(confidence)) {
    flags.push("CUSTOMER_LINK_NOT_RELIABLE");
  }
  if (input.customerMatchByNameOnly === true) flags.push("CUSTOMER_MATCH_BY_NAME_ONLY");
  if (input.multipleCustomerCandidates === true) flags.push("MULTIPLE_CUSTOMER_CANDIDATES");
  if (input.internalCompanyCandidate === true) flags.push("INTERNAL_COMPANY_CANDIDATE");
  return flags;
}

function communicationQualityFlags(messages = []) {
  const flags = [];
  for (const message of messages) {
    const classification = cleanString(message?.classification).toLowerCase();
    if (classification === "angry_response") flags.push("ANGRY_RESPONSE");
    if (classification === "legal_response" || classification === "legal_threat") flags.push("LEGAL_RESPONSE");
    if (classification === "dispute") flags.push("DISPUTE_ACTIVE");
  }
  return flags;
}

function baseRatingResult(input, options = {}) {
  const periodTo = strictDateKey(input.periodTo || input.period_to || input.asOfDate || input.today)
    || new Date().toISOString().slice(0, 10);
  const periodFrom = strictDateKey(input.periodFrom || input.period_from) || addDays(periodTo, -365);
  return {
    customerId: cleanString(input.customerId || input.customer_id),
    periodFrom,
    periodTo,
    ratingMode: options.ratingMode || "FINAL_RATING",
    rating: options.rating || "N",
    score: options.score ?? null,
    paymentMoralityScore: options.score ?? null,
    confidence: options.confidence || "NONE",
    automationStatus: options.automationStatus || "DRY_RUN_ONLY",
    recommendedAutomationStatus: options.recommendedAutomationStatus || options.automationStatus || "DRY_RUN_ONLY",
    invoiceCount: 0,
    paidInvoiceCount: 0,
    openInvoiceCount: 0,
    invoiceAmountTotal: 0,
    paidAmountTotal: 0,
    openAmountTotal: 0,
    overdueAmountTotal: 0,
    weightedAvgDelay: null,
    p90Delay: null,
    onTimeAmountRate: null,
    currentOverdueBalance: 0,
    avgMonthlyBilling: 0,
    currentMaxDaysOverdue: 0,
    partialPaymentRisk: 0,
    brokenPromiseRate: 0,
    disputeRate: 0,
    unmatchedPaymentRate: 0,
    penalties: {
      weightedAvgDelayPenalty: 0,
      p90DelayPenalty: 0,
      onTimeAmountPenalty: 0,
      currentOverdueBalancePenalty: 0,
      currentMaxDaysOverduePenalty: 0,
      brokenPromisePenalty: 0,
      partialPaymentPenalty: 0,
      disputePenalty: 0,
      unmatchedPaymentPenalty: 0
    },
    dataQualityFlags: uniqueSorted(options.dataQualityFlags || []),
    blockingReasons: options.blockingReasons || [],
    explanation: options.explanation || "Málo dat pro výpočet ostrého ratingu.",
    calculatedAt: cleanString(input.calculatedAt || input.calculated_at) || new Date().toISOString(),
    calculationVersion: PAYMENT_RATING_CALCULATION_VERSION
  };
}

function withCompatibility(result) {
  return {
    ...result,
    metrics: {
      weightedAvgDelay: result.weightedAvgDelay,
      p90Delay: result.p90Delay,
      onTimeAmountRate: result.onTimeAmountRate,
      currentOverdueBalance: result.currentOverdueBalance,
      avgMonthlyBilling: result.avgMonthlyBilling,
      currentMaxDaysOverdue: result.currentMaxDaysOverdue,
      brokenPromiseRate: result.brokenPromiseRate,
      partialPaymentRisk: result.partialPaymentRisk,
      disputeRate: result.disputeRate,
      unmatchedPaymentRate: result.unmatchedPaymentRate,
      unmatchedPaymentPenalty: result.penalties.unmatchedPaymentPenalty
    }
  };
}

function preRating(input, flags = [], blockingReasons = []) {
  if (input.excluded === true || input.internalCompanyCandidate === true) {
    return withCompatibility(baseRatingResult(input, {
      ratingMode: "PRE_RATING",
      rating: "X",
      confidence: "NONE",
      automationStatus: "EXCLUDED",
      dataQualityFlags: [...flags, "INTERNAL_COMPANY_CANDIDATE"],
      blockingReasons,
      explanation: "Interní nebo technická platební aktivita je z ratingu vyloučena."
    }));
  }
  const payments = (Array.isArray(input.bankPayments) ? input.bankPayments : Array.isArray(input.payments) ? input.payments : [])
    .filter((payment) => (toCents(firstDefined(payment, ["amountIn", "amount_in", "amount"])) || 0) > 0);
  const activeMonths = new Set(payments.map((payment) => strictDateKey(payment.bookingDate || payment.booking_date).slice(0, 7)).filter(Boolean));
  const criticalQuality = flags.includes("CUSTOMER_LINK_NOT_RELIABLE")
    || flags.includes("MULTIPLE_CUSTOMER_CANDIDATES")
    || flags.includes("DUPLICATE_PAYMENT_CANDIDATE");
  let rating = "N";
  let confidence = payments.length ? "LOW" : "LOW";
  let automationStatus = "DRY_RUN_ONLY";
  if (criticalQuality) {
    rating = "Q";
    confidence = "NONE";
    automationStatus = "HUMAN_REVIEW";
  } else if (payments.length >= 6 && activeMonths.size >= 6) {
    rating = "A0";
    confidence = "HIGH";
  } else if (payments.length >= 3 && activeMonths.size >= 2) {
    rating = "B0";
    confidence = "MEDIUM";
  } else if (payments.length >= 1) {
    rating = "C0";
    confidence = "LOW";
  }
  const explanation = rating === "Q"
    ? "Bankovní pre-rating vyžaduje ruční kontrolu kvůli kvalitě nebo vazbě dat."
    : rating === "N"
      ? "Nový zákazník nebo málo bankovních dat pro pre-rating."
      : `Bankovní pre-rating ${rating}. Jde pouze o platební aktivitu, nikoliv finální platební morálku.`;
  return withCompatibility(baseRatingResult(input, {
    ratingMode: "PRE_RATING",
    rating,
    confidence,
    automationStatus,
    dataQualityFlags: flags,
    blockingReasons,
    explanation
  }));
}

export function receivableRatingCategory(score, options = {}) {
  if (options.insolvency === true) return "INSOLVENCE";
  const value = Math.round(Number(score) || 0);
  if (value >= 90) return "A";
  if (value >= 75) return "B";
  if (value >= 55) return "C";
  if (value >= 35) return "D";
  return "E";
}

function recommendedAutomationStatus(rating, confidence, hasHumanReviewFlag) {
  if (hasHumanReviewFlag) return "HUMAN_REVIEW";
  if (rating === "A" && confidence === "HIGH") return "READY_FOR_AUTOMATION";
  if (rating === "B" && ["HIGH", "MEDIUM"].includes(confidence)) return "READY_AFTER_REVIEW";
  if (rating === "C") return "DRY_RUN_ONLY";
  if (["D", "E"].includes(rating)) return "HUMAN_REVIEW";
  return "DRY_RUN_ONLY";
}

function czechNumber(value, maximumFractionDigits = 2) {
  return Number(value || 0).toLocaleString("cs-CZ", { maximumFractionDigits });
}

function czechDays(value) {
  const number = Number(value || 0);
  const absolute = Math.abs(number);
  const unit = absolute === 1 ? "den" : Number.isInteger(absolute) && absolute >= 2 && absolute <= 4 ? "dny" : "dnů";
  return `${czechNumber(number)} ${unit}`;
}

function ratingExplanation(result) {
  const scoreText = result.score === null ? "bez skóre" : `${result.score} bodů`;
  const delayText = result.weightedAvgDelay === null ? "nelze určit" : czechDays(result.weightedAvgDelay);
  const p90Text = result.p90Delay === null ? "nelze určit" : czechDays(result.p90Delay);
  const onTimeText = result.onTimeAmountRate === null ? "nelze určit" : `${Math.round(result.onTimeAmountRate * 100)} %`;
  return `Rating ${result.rating} / ${scoreText}. Průměrné vážené zpoždění je ${delayText}, P90 zpoždění je ${p90Text} a včas bylo uhrazeno ${onTimeText} částky. Aktuálně je po splatnosti ${czechNumber(result.currentOverdueBalance)} Kč. Režim zůstává read-only/dry-run.`;
}

export function calculateCustomerPaymentRating(input = {}) {
  const periodTo = strictDateKey(input.periodTo || input.period_to || input.asOfDate || input.today)
    || new Date().toISOString().slice(0, 10);
  const periodFrom = strictDateKey(input.periodFrom || input.period_from) || addDays(periodTo, -365);
  const invoices = normalizeInvoices(Array.isArray(input.invoices) ? input.invoices : []);
  const promises = Array.isArray(input.promises) ? input.promises : [];
  const messages = Array.isArray(input.inboxMessages) ? input.inboxMessages : [];
  const payments = Array.isArray(input.payments) ? input.payments : [];
  const insolvencyStatus = cleanString(input.insolvencyStatus || input.insolvency_status).toLowerCase();
  const insolvency = input.insolvency === true || ["found", "insolvence", "insolvency"].includes(insolvencyStatus);
  const allFlags = uniqueSorted([
    ...invoices.flatMap((invoice) => invoice.flags),
    ...paymentQualityFlags(payments),
    ...customerQualityFlags(input),
    ...communicationQualityFlags(messages),
    ...(Array.isArray(input.dataQualityFlags) ? input.dataQualityFlags : [])
  ]);

  if (insolvency) {
    return withCompatibility(baseRatingResult({ ...input, periodFrom, periodTo }, {
      ratingMode: "FINAL_RATING",
      rating: "INSOLVENCE",
      score: 0,
      confidence: "HIGH",
      automationStatus: "STOP",
      recommendedAutomationStatus: "STOP",
      dataQualityFlags: [...allFlags, "INSOLVENCY_FOUND"],
      blockingReasons: ["Zákazník je v insolvenci. Automatizace zastavena."],
      explanation: "Zákazník je v insolvenci. Automatizace zastavena."
    }));
  }

  const historyInvoices = invoices.filter((invoice) => (
    invoice.issueDate && invoice.issueDate >= periodFrom && invoice.issueDate <= periodTo && (invoice.totalCents || 0) > 0
  ));
  const currentOpenInvoices = invoices.filter((invoice) => invoice.openCents > 0 && (!invoice.issueDate || invoice.issueDate <= periodTo));
  const dueDateCoverage = historyInvoices.length
    ? historyInvoices.filter((invoice) => invoice.dueDate).length / historyInvoices.length
    : 0;
  const paidInvoices = historyInvoices.filter((invoice) => ["paid", "overpaid"].includes(invoice.status));
  const paidDateCoverage = paidInvoices.length
    ? paidInvoices.filter((invoice) => invoice.paymentState.paidDate).length / paidInvoices.length
    : 1;
  const blockingReasons = [];
  if (historyInvoices.length < 2) blockingReasons.push("Málo dat pro výpočet ostrého ratingu.");
  if (historyInvoices.length && dueDateCoverage < 0.7) {
    blockingReasons.push("Chybí datum splatnosti, nelze spolehlivě měřit platební morálku.");
  }
  if (paidInvoices.length && paidDateCoverage < 0.7) {
    blockingReasons.push("Chybí datum úhrady u významné části zaplacených faktur.");
  }
  if (allFlags.some((flag) => CRITICAL_FINAL_FLAGS.has(flag))) {
    blockingReasons.push("Vazba zákazníka nebo povinná fakturační data nejsou spolehlivá.");
  }
  const requestedMode = cleanString(input.ratingMode || input.rating_mode).toUpperCase();
  if (requestedMode === "PRE_RATING" || blockingReasons.length) {
    return preRating({ ...input, periodFrom, periodTo, bankPayments: input.bankPayments || payments }, allFlags, uniqueSorted(blockingReasons));
  }

  const invoiceAmountCents = historyInvoices.reduce((sum, invoice) => sum + Math.max(0, invoice.totalCents || 0), 0);
  const paidAmountCents = historyInvoices.reduce((sum, invoice) => sum + Math.max(0, Math.min(invoice.paidCents, invoice.totalCents || invoice.paidCents)), 0);
  const openAmountCents = currentOpenInvoices.reduce((sum, invoice) => sum + Math.max(0, invoice.openCents), 0);
  let overdueAmountCents = 0;
  let currentMaxDaysOverdue = 0;
  let openOverdueInvoiceCount = 0;
  let partialOverdueInvoiceCount = 0;
  for (const invoice of currentOpenInvoices) {
    const overdueDays = invoice.dueDate ? Math.max(0, daysBetween(invoice.dueDate, periodTo) || 0) : 0;
    if (overdueDays > 0) {
      overdueAmountCents += invoice.openCents;
      currentMaxDaysOverdue = Math.max(currentMaxDaysOverdue, overdueDays);
      openOverdueInvoiceCount += 1;
      if (invoice.status === "partially_paid") partialOverdueInvoiceCount += 1;
    }
  }

  const paidWithDates = paidInvoices.filter((invoice) => invoice.dueDate && invoice.paymentState.paidDate);
  const delayRows = paidWithDates.map((invoice) => ({
    cents: Math.max(0, invoice.totalCents || 0),
    delay: Math.max(0, daysBetween(invoice.dueDate, invoice.paymentState.paidDate) || 0)
  }));
  const delayWeightCents = delayRows.reduce((sum, row) => sum + row.cents, 0);
  const weightedAvgDelay = delayWeightCents
    ? delayRows.reduce((sum, row) => sum + row.cents * row.delay, 0) / delayWeightCents
    : null;
  const p90Delay = percentile(delayRows.map((row) => row.delay), 90);

  let onTimePaidCents = 0;
  let datedPaidCents = 0;
  for (const invoice of historyInvoices) {
    if (!invoice.dueDate) continue;
    if (invoice.payments.length) {
      for (const payment of invoice.payments) {
        if (payment.cents <= 0) continue;
        datedPaidCents += payment.cents;
        if (payment.date <= invoice.dueDate) onTimePaidCents += payment.cents;
      }
    } else if (invoice.paymentState.paidDate && invoice.paidCents > 0) {
      datedPaidCents += invoice.paidCents;
      if (invoice.paymentState.paidDate <= invoice.dueDate) onTimePaidCents += invoice.paidCents;
    }
  }
  const onTimeAmountRate = datedPaidCents > 0
    ? clamp(onTimePaidCents / datedPaidCents)
    : overdueAmountCents > 0 ? 0 : null;
  const activeMonths = new Set(historyInvoices.map((invoice) => invoice.issueDate.slice(0, 7)).filter(Boolean));
  const avgMonthlyBillingCents = invoiceAmountCents / Math.max(activeMonths.size, 1);
  const partialPaymentRisk = partialOverdueInvoiceCount / Math.max(openOverdueInvoiceCount, 1);
  const brokenPromiseCount = promises.filter((promise) => cleanString(promise?.status).toLowerCase() === "broken").length;
  const brokenPromiseRate = brokenPromiseCount / Math.max(promises.length, 1);
  const disputedInvoiceCount = historyInvoices.filter((invoice) => invoice.flags.includes("DISPUTE_ACTIVE")).length;
  const disputeRate = disputedInvoiceCount / Math.max(historyInvoices.length, 1);
  const unmatchedPaymentCount = payments.filter((payment) => (
    cleanString(payment?.status || payment?.matchStatus).toLowerCase() === "unmatched"
    || (!cleanString(payment?.matchedInvoiceId || payment?.matched_invoice_id) && payment?.matched !== true)
  )).length;
  const unmatchedPaymentRate = unmatchedPaymentCount / Math.max(payments.length, 1);

  const penalties = {
    weightedAvgDelayPenalty: 24 * clamp((weightedAvgDelay ?? 0) / 30),
    p90DelayPenalty: 18 * clamp((p90Delay ?? 0) / 45),
    onTimeAmountPenalty: 16 * (1 - clamp(onTimeAmountRate ?? (overdueAmountCents > 0 ? 0 : 1))),
    currentOverdueBalancePenalty: 14 * clamp(overdueAmountCents / Math.max(avgMonthlyBillingCents, 1)),
    currentMaxDaysOverduePenalty: 10 * clamp(currentMaxDaysOverdue / 60),
    brokenPromisePenalty: 8 * clamp(brokenPromiseRate),
    partialPaymentPenalty: 5 * clamp(partialPaymentRisk),
    disputePenalty: 3 * clamp(disputeRate),
    unmatchedPaymentPenalty: 2 * clamp(unmatchedPaymentRate)
  };
  for (const key of Object.keys(penalties)) penalties[key] = round(penalties[key], 2);
  const score = Math.min(100, Math.max(0, Math.round(100 - Object.values(penalties).reduce((sum, value) => sum + value, 0))));
  const rating = receivableRatingCategory(score);
  const paymentMatchRate = payments.length ? 1 - unmatchedPaymentRate : null;
  const customerLinkConfidence = cleanString(input.customerLinkConfidence || input.customer_link_confidence || "MEDIUM").toUpperCase();
  const hasCriticalFlag = allFlags.some((flag) => CRITICAL_FINAL_FLAGS.has(flag));
  let confidence = "LOW";
  if (
    (historyInvoices.length >= 5 || invoiceAmountCents >= 5_000_000)
    && (paymentMatchRate === null || paymentMatchRate > 0.9)
    && dueDateCoverage > 0.95
    && paidDateCoverage > 0.95
    && ["HIGH", "MEDIUM"].includes(customerLinkConfidence)
    && !hasCriticalFlag
  ) confidence = "HIGH";
  else if (
    historyInvoices.length >= 2
    && dueDateCoverage >= 0.7
    && paidDateCoverage >= 0.7
    && (paymentMatchRate === null || paymentMatchRate >= 0.7)
    && !hasCriticalFlag
  ) confidence = "MEDIUM";

  const hasHumanReviewFlag = allFlags.some((flag) => ["DISPUTE_ACTIVE", "ANGRY_RESPONSE", "LEGAL_RESPONSE"].includes(flag));
  const recommendedStatus = recommendedAutomationStatus(rating, confidence, hasHumanReviewFlag);
  const automationStatus = recommendedStatus === "HUMAN_REVIEW" ? "HUMAN_REVIEW" : "DRY_RUN_ONLY";
  const result = {
    ...baseRatingResult({ ...input, periodFrom, periodTo }, {
      ratingMode: "FINAL_RATING",
      rating,
      score,
      confidence,
      automationStatus,
      recommendedAutomationStatus: recommendedStatus,
      dataQualityFlags: allFlags,
      blockingReasons: []
    }),
    invoiceCount: historyInvoices.length,
    paidInvoiceCount: paidInvoices.length,
    openInvoiceCount: currentOpenInvoices.length,
    invoiceAmountTotal: fromCents(invoiceAmountCents),
    paidAmountTotal: fromCents(paidAmountCents),
    openAmountTotal: fromCents(openAmountCents),
    overdueAmountTotal: fromCents(overdueAmountCents),
    weightedAvgDelay: weightedAvgDelay === null ? null : round(weightedAvgDelay, 2),
    p90Delay,
    onTimeAmountRate: onTimeAmountRate === null ? null : round(onTimeAmountRate, 3),
    currentOverdueBalance: fromCents(overdueAmountCents),
    avgMonthlyBilling: fromCents(avgMonthlyBillingCents),
    currentMaxDaysOverdue,
    partialPaymentRisk: round(partialPaymentRisk, 3),
    brokenPromiseRate: round(brokenPromiseRate, 3),
    disputeRate: round(disputeRate, 3),
    unmatchedPaymentRate: round(unmatchedPaymentRate, 3),
    penalties
  };
  result.explanation = ratingExplanation(result);
  return withCompatibility(result);
}

export function isFinalPaymentRating(result = {}) {
  return result.ratingMode === "FINAL_RATING" && FINAL_RATINGS.has(result.rating) && result.score !== null;
}
