const MS_PER_DAY = 24 * 60 * 60 * 1000;

function cleanString(value) {
  return String(value ?? "").trim();
}

function numberValue(value, fallback = 0) {
  const number = Number(String(value ?? "").replace(/\s+/g, "").replace(",", "."));
  return Number.isFinite(number) ? number : fallback;
}

function money(value) {
  return Math.max(0, Math.round(numberValue(value) * 100) / 100);
}

function dateValue(value) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function daysBetween(left, right) {
  const leftDate = dateValue(left);
  const rightDate = dateValue(right);
  if (!leftDate || !rightDate) {
    return 0;
  }
  return Math.floor((rightDate.getTime() - leftDate.getTime()) / MS_PER_DAY);
}

function clamp(value, min = 0, max = 1) {
  const number = Number(value);
  if (!Number.isFinite(number)) {
    return min;
  }
  return Math.min(max, Math.max(min, number));
}

function percentile(values, percentileValue) {
  const sorted = values.filter(Number.isFinite).sort((a, b) => a - b);
  if (!sorted.length) {
    return 0;
  }
  const index = Math.ceil((percentileValue / 100) * sorted.length) - 1;
  return sorted[Math.min(sorted.length - 1, Math.max(0, index))];
}

function invoiceTotal(invoice) {
  return money(invoice?.totalAmount ?? invoice?.total_amount ?? invoice?.amount);
}

function invoicePaid(invoice) {
  return money(invoice?.paidAmount ?? invoice?.paid_amount);
}

function invoiceOpen(invoice) {
  const explicitOpen = invoice?.openAmount ?? invoice?.open_amount;
  return explicitOpen === undefined || explicitOpen === null
    ? Math.max(0, invoiceTotal(invoice) - invoicePaid(invoice))
    : money(explicitOpen);
}

function invoiceDueDate(invoice) {
  return cleanString(invoice?.dueDate || invoice?.due_date);
}

function invoicePaidDate(invoice) {
  return cleanString(invoice?.paidDate || invoice?.paid_date);
}

function invoiceStatus(invoice) {
  return cleanString(invoice?.status).toLowerCase();
}

function isPaid(invoice) {
  return ["paid", "overpaid"].includes(invoiceStatus(invoice)) || invoiceOpen(invoice) <= 0;
}

function inLast365Days(invoice, today) {
  const issueDate = cleanString(invoice?.issueDate || invoice?.issue_date || invoiceDueDate(invoice));
  const age = daysBetween(issueDate, today);
  return age >= 0 && age <= 365;
}

function brokenPromises(promises = []) {
  return promises.filter((promise) => cleanString(promise?.status).toLowerCase() === "broken").length;
}

function activeDisputes(invoices = [], inboxMessages = []) {
  const disputedInvoices = invoices.filter((invoice) => invoiceStatus(invoice) === "disputed").length;
  const disputedMessages = inboxMessages.filter((message) => (
    ["dispute", "legal_threat", "angry_response"].includes(cleanString(message?.classification).toLowerCase())
  )).length;
  return disputedInvoices + disputedMessages;
}

export function receivableRatingCategory(score, options = {}) {
  if (options.insolvency === true) {
    return "INSOLVENCE";
  }

  const value = Math.round(Number(score) || 0);
  if (value >= 90) return "A";
  if (value >= 75) return "B";
  if (value >= 55) return "C";
  if (value >= 35) return "D";
  return "E";
}

export function calculateCustomerPaymentRating(input = {}) {
  const today = cleanString(input.today) || new Date().toISOString().slice(0, 10);
  const invoices365 = (Array.isArray(input.invoices) ? input.invoices : []).filter((invoice) => inLast365Days(invoice, today));
  const promises = Array.isArray(input.promises) ? input.promises : [];
  const inboxMessages = Array.isArray(input.inboxMessages) ? input.inboxMessages : [];
  const insolvency = input.insolvency === true || input.insolvencyStatus === "found";

  if (insolvency) {
    return {
      paymentMoralityScore: null,
      rating: "INSOLVENCE",
      automationStatus: "STOP",
      metrics: {
        weightedAvgDelay: 0,
        p90Delay: 0,
        onTimeAmountRate: 0,
        currentOverdueBalance: 0,
        avgMonthlyBilling: 0,
        brokenPromiseRate: 0,
        partialPaymentRisk: 0,
        disputeRate: 0,
        unmatchedPaymentPenalty: 0
      }
    };
  }

  const totalAmount = invoices365.reduce((sum, invoice) => sum + invoiceTotal(invoice), 0);
  const paidOnTimeAmount = invoices365.reduce((sum, invoice) => {
    if (!isPaid(invoice)) {
      return sum;
    }
    return daysBetween(invoiceDueDate(invoice), invoicePaidDate(invoice)) <= 0
      ? sum + invoiceTotal(invoice)
      : sum;
  }, 0);
  const delayValues = invoices365.map((invoice) => {
    const dueDate = invoiceDueDate(invoice);
    const resolvedDate = isPaid(invoice) ? invoicePaidDate(invoice) : today;
    return Math.max(0, daysBetween(dueDate, resolvedDate));
  });
  const weightedAvgDelay = invoices365.reduce((sum, invoice, index) => {
    const weight = totalAmount > 0 ? invoiceTotal(invoice) / totalAmount : 0;
    return sum + weight * delayValues[index];
  }, 0);
  const p90Delay = percentile(delayValues, 90);
  const onTimeAmountRate = totalAmount > 0 ? paidOnTimeAmount / totalAmount : 1;
  const currentOverdueBalance = invoices365.reduce((sum, invoice) => {
    const overdueDays = Math.max(0, daysBetween(invoiceDueDate(invoice), today));
    return overdueDays > 0 && !isPaid(invoice) ? sum + invoiceOpen(invoice) : sum;
  }, 0);
  const avgMonthlyBilling = totalAmount / 12;
  const promiseCount = promises.length;
  const brokenPromiseRate = promiseCount > 0 ? brokenPromises(promises) / promiseCount : 0;
  const openInvoices = invoices365.filter((invoice) => !isPaid(invoice));
  const partialPaymentRisk = openInvoices.length
    ? openInvoices.filter((invoice) => invoicePaid(invoice) > 0 && invoiceOpen(invoice) > 0).length / openInvoices.length
    : 0;
  const disputeRate = invoices365.length ? activeDisputes(invoices365, inboxMessages) / invoices365.length : 0;
  const unmatchedPaymentPenalty = clamp(input.unmatchedPaymentPenalty ?? input.unmatched_payment_penalty ?? 0, 0, 1);

  const score = 100
    - 28 * clamp(weightedAvgDelay / 30)
    - 18 * clamp(p90Delay / 45)
    - 16 * (1 - clamp(onTimeAmountRate))
    - 12 * clamp(currentOverdueBalance / Math.max(avgMonthlyBilling, 1))
    - 10 * clamp(partialPaymentRisk)
    - 8 * clamp(brokenPromiseRate)
    - 5 * clamp(disputeRate)
    - 3 * unmatchedPaymentPenalty;
  const paymentMoralityScore = Math.max(0, Math.min(100, Math.round(score)));

  return {
    paymentMoralityScore,
    rating: receivableRatingCategory(paymentMoralityScore),
    automationStatus: "dry_run",
    metrics: {
      weightedAvgDelay: Math.round(weightedAvgDelay * 100) / 100,
      p90Delay,
      onTimeAmountRate: Math.round(onTimeAmountRate * 1000) / 1000,
      currentOverdueBalance: Math.round(currentOverdueBalance * 100) / 100,
      avgMonthlyBilling: Math.round(avgMonthlyBilling * 100) / 100,
      brokenPromiseRate: Math.round(brokenPromiseRate * 1000) / 1000,
      partialPaymentRisk: Math.round(partialPaymentRisk * 1000) / 1000,
      disputeRate: Math.round(disputeRate * 1000) / 1000,
      unmatchedPaymentPenalty
    }
  };
}
