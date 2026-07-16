const DB_BINDING = "SMART_ODPADY_DB";

export class CustomerMessageConsentStoreError extends Error {
  constructor(message, status = 400, code = "customer_message_consent_store_error") {
    super(message);
    this.name = "CustomerMessageConsentStoreError";
    this.status = status;
    this.code = code;
  }
}

function cleanString(value) {
  return String(value ?? "").trim();
}

function database(env) {
  const db = env?.[DB_BINDING] || null;
  if (!db) {
    throw new CustomerMessageConsentStoreError(
      "Databáze RCS souhlasů není nastavená.",
      503,
      "customer_message_consent_database_missing"
    );
  }
  return db;
}

function safeJson(value) {
  try {
    return JSON.stringify(value ?? {});
  } catch {
    return "{}";
  }
}

function randomId() {
  const suffix = globalThis.crypto?.randomUUID
    ? globalThis.crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  return `customer-consent-${suffix}`;
}

function nowIso() {
  return new Date().toISOString();
}

function storeError(error) {
  const message = cleanString(error?.message);
  if (/no such table|customer_message_consent/i.test(message)) {
    return new CustomerMessageConsentStoreError(
      "Tabulka RCS souhlasů není v D1 připravená.",
      503,
      "customer_message_consent_migration_missing"
    );
  }

  console.error("customer_message_consent.store_failed", { message });
  return new CustomerMessageConsentStoreError(
    "Souhlas se teď nepodařilo bezpečně uložit.",
    500,
    "customer_message_consent_store_failed"
  );
}

async function removeOptOut(db, phone) {
  await db
    .prepare("DELETE FROM customer_message_opt_out WHERE phone = ?")
    .bind(phone)
    .run();
}

export async function recordCustomerRcsConsent(env, input = {}) {
  const db = database(env);
  const phone = cleanString(input.phone);
  const consentVersion = cleanString(input.consentVersion);
  const createdAt = cleanString(input.createdAt) || nowIso();
  const duplicateCutoff = new Date(new Date(createdAt).getTime() - 5 * 60 * 1000).toISOString();

  try {
    const duplicate = await db
      .prepare(`
        SELECT id, created_at
        FROM customer_message_consent
        WHERE phone = ?
          AND status = 'granted'
          AND consent_version = ?
          AND created_at >= ?
        ORDER BY created_at DESC
        LIMIT 1
      `)
      .bind(phone, consentVersion, duplicateCutoff)
      .first();

    if (duplicate) {
      await removeOptOut(db, phone);
      return {
        id: cleanString(duplicate.id),
        phone,
        createdAt: cleanString(duplicate.created_at),
        duplicate: true
      };
    }

    const id = cleanString(input.id) || randomId();
    await db
      .prepare(`
        INSERT INTO customer_message_consent (
          id,
          phone,
          consent_type,
          status,
          consent_version,
          consent_text,
          terms_url,
          privacy_url,
          source_url,
          source_origin,
          metadata_json,
          created_at
        ) VALUES (?, ?, 'operational_rcs', 'granted', ?, ?, ?, ?, ?, ?, ?, ?)
      `)
      .bind(
        id,
        phone,
        consentVersion,
        cleanString(input.consentText),
        cleanString(input.termsUrl),
        cleanString(input.privacyUrl),
        cleanString(input.sourceUrl),
        cleanString(input.sourceOrigin),
        safeJson(input.metadata),
        createdAt
      )
      .run();

    // Výslovný nový souhlas bezpečně ruší dřívější STOP blokaci.
    // Pokud by smazání selhalo, odesílání zůstane zablokované (fail-safe).
    await removeOptOut(db, phone);

    return { id, phone, createdAt, duplicate: false };
  } catch (error) {
    if (error instanceof CustomerMessageConsentStoreError) throw error;
    throw storeError(error);
  }
}
