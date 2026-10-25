// Exact source decimals. Never round an accounting amount at the API boundary.
export function decimal(value) {
  if (typeof value === "number") {
    if (!Number.isSafeInteger(value)) throw new TypeError("decimal_requires_source_text");
    value = String(value);
  }
  if (typeof value !== "string" || !/^-?\d+(?:\.\d+)?$/.test(value)) throw new TypeError("invalid_decimal");
  const [whole, fraction = ""] = value.split(".");
  return { coefficient: BigInt(whole + fraction), scale: fraction.length, source: value };
}
function aligned(a, b) {
  a = decimal(a); b = decimal(b);
  const scale = Math.max(a.scale, b.scale);
  return [a.coefficient * 10n ** BigInt(scale - a.scale), b.coefficient * 10n ** BigInt(scale - b.scale), scale];
}
export function compareDecimal(a, b) { const [x, y] = aligned(a, b); return x < y ? -1 : x > y ? 1 : 0; }
export function addDecimal(a, b) {
  const [x, y, scale] = aligned(a, b), sum = x + y;
  const digits = (sum < 0n ? -sum : sum).toString().padStart(scale + 1, "0");
  return (sum < 0n ? "-" : "") + (scale ? `${digits.slice(0, -scale)}.${digits.slice(-scale)}` : digits);
}
export function exactJsonParse(text) {
  // Tokenize strings first so numbers inside strings remain untouched.
  return JSON.parse(text.replace(/"(?:[^"\\]|\\.)*"|-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?/g, token => {
    if (token[0] === '"') return token;
    if (/[eE]/.test(token)) throw new TypeError("exponent_decimal_requires_contract");
    return token.includes(".") || !Number.isSafeInteger(Number(token)) ? JSON.stringify(token) : token;
  }));
}
export function numericId(value) {
  if (typeof value === "number" && Number.isSafeInteger(value) && value > 0) return String(value);
  return typeof value === "string" && /^[1-9]\d*$/.test(value) && Number.isSafeInteger(Number(value)) ? value : null;
}
export function referenceIds(row, field, kind = "list") {
  const record = row[`${field}_RecordId`];
  if (numericId(record)) return [numericId(record)];
  const values = Array.isArray(row[field]) ? row[field] : [row[field]];
  return [...new Set(values.flatMap(value => {
    const id = value && typeof value === "object" ? numericId(value.Id ?? value.id)
      : (kind === "detail" || typeof value === "number") ? numericId(value) : null;
    return id ? [id] : [];
  }))];
}
export function sourceTime(value) {
  if (typeof value !== "string") return { raw: value ?? null, instant: null, kind: "unknown" };
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return { raw: value, instant: null, kind: Number.isFinite(Date.parse(value))&&new Date(value).toISOString().slice(0,10)===value?'date':'unknown' };
  const qualified = /T.*(?:Z|[+-]\d{2}:\d{2})$/.test(value) && Number.isFinite(Date.parse(value));
  return { raw: value, instant: qualified ? new Date(value).toISOString() : null, kind: qualified ? "instant" : "zone_unverified" };
}
export function stableJson(value) {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  if (value && typeof value === "object") return `{${Object.keys(value).sort().map(k => `${JSON.stringify(k)}:${stableJson(value[k])}`).join(",")}}`;
  return JSON.stringify(value);
}
export async function fingerprint(value) {
  return [...new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(stableJson(value))))]
    .map(v => v.toString(16).padStart(2, "0")).join("");
}
export function invoiceAccountingState(row, { modelVerified = false, tolerance = "2", protectedStatus = "" } = {}) {
  const amount = key => { try { return decimal(row[key]).source; } catch { return null; } };
  const remaining = amount("RemainToPay"), paid = amount("AmountPaid"), advance = amount("AmountPaidProformaInvoice");
  const total = amount("PriceWithTax");
  let status = "unverified";
  if (!modelVerified || total === null || compareDecimal(total, "0") < 0) status = "accounting_review";
  else if (remaining === null) status = "unverified";
  else if (compareDecimal(remaining, "0") < 0) status = "overpaid";
  else if (compareDecimal(remaining, "0") === 0) status = "paid";
  else if (compareDecimal(remaining, tolerance) < 0) status = "small_balance";
  else if ((paid !== null && compareDecimal(paid, "0") > 0) || (advance !== null && compareDecimal(advance, "0") > 0)) status = "partially_paid";
  else if (paid !== null && advance !== null && compareDecimal(paid, "0") === 0 && compareDecimal(advance, "0") === 0) status = "unpaid";
  let conflict = false;
  if (modelVerified && remaining !== null && typeof row.IsPaid === "boolean") {
    const absolute = remaining.replace(/^-/, "");
    conflict = row.IsPaid !== (compareDecimal(absolute, tolerance) < 0);
  }
  return { authority: "vistos", remaining, paid, advance, total, accountingStatus: status, conflict,
    status: ["disputed", "legal_handoff", "insolvency_hold"].includes(protectedStatus) ? protectedStatus : status,
    paidDate: null, remindersAllowed: false };
}
