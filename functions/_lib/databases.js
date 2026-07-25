export const DATABASE_DOMAINS = Object.freeze({
  core: "DB_CORE",
  messages: "DB_MESSAGES",
  audit: "DB_AUDIT",
  archive: "DB_ARCHIVE",
  legacy: "SMART_ODPADY_DB"
});

export class DatabaseBindingError extends Error {
  constructor(domain, binding) {
    super(`Databáze ${domain} není dostupná. Chybí Cloudflare D1 binding ${binding}.`);
    this.name = "DatabaseBindingError";
    this.code = "database_binding_missing";
    this.status = 503;
    this.domain = domain;
    this.binding = binding;
  }
}

export function getDatabase(env, domain, { required = true } = {}) {
  const binding = DATABASE_DOMAINS[domain];
  if (!binding) {
    throw new TypeError(`Neznámá databázová doména: ${String(domain || "")}`);
  }

  const database = env?.[binding] || null;
  if (!database && required) throw new DatabaseBindingError(domain, binding);
  return database;
}

export function getCoreDatabase(env, options) {
  return getDatabase(env, "core", options);
}

export function getMessagesDatabase(env, options) {
  return getDatabase(env, "messages", options);
}

export function getAuditDatabase(env, options) {
  return getDatabase(env, "audit", options);
}

export function getArchiveDatabase(env, options) {
  return getDatabase(env, "archive", options);
}

export function getLegacyDatabase(env, options) {
  return getDatabase(env, "legacy", options);
}

export function databaseAvailability(env) {
  return Object.fromEntries(
    Object.entries(DATABASE_DOMAINS).map(([domain, binding]) => [
      domain,
      { binding, available: Boolean(env?.[binding]) }
    ])
  );
}
