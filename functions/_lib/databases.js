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

export class CrossDatabaseQueryError extends Error {
  constructor(moduleName, domains, sql) {
    super(`Modul ${moduleName} se pokusil provést jednu SQL operaci přes více D1 databází: ${domains.join(", ")}.`);
    this.name = "CrossDatabaseQueryError";
    this.code = "cross_database_query_forbidden";
    this.status = 500;
    this.moduleName = moduleName;
    this.domains = domains;
    this.sqlPreview = String(sql || "").replace(/\s+/g, " ").trim().slice(0, 180);
  }
}

function referencedTables(sql) {
  const tables = [];
  const pattern = /\b(?:FROM|JOIN|INTO|UPDATE|TABLE|REFERENCES)\s+["`[]?([a-z][a-z0-9_]*)/gi;
  for (const match of String(sql || "").matchAll(pattern)) tables.push(match[1].toLowerCase());
  return [...new Set(tables)];
}

export function databaseDomainForSql(sql, { moduleName = "unknown", allowedDomains = [], defaultDomain = "" } = {}) {
  const allowed = new Set(allowedDomains);
  const domains = [...new Set(
    referencedTables(sql)
      .map((table) => DATABASE_TABLE_DOMAINS[table])
      .filter(Boolean)
  )];
  if (domains.length > 1) throw new CrossDatabaseQueryError(moduleName, domains, sql);
  const domain = domains[0] || defaultDomain;
  if (!domain) {
    const error = new Error(`SQL modulu ${moduleName} nelze přiřadit k databázové doméně.`);
    error.code = "database_query_domain_unknown";
    throw error;
  }
  if (!allowed.has(domain)) {
    const error = new Error(`Modul ${moduleName} nemá povolený přístup do databáze ${domain}.`);
    error.code = "database_domain_forbidden";
    error.status = 500;
    throw error;
  }
  return domain;
}

class ScopedPreparedStatement {
  constructor(domain, statement) {
    this.databaseDomain = domain;
    this.statement = statement;
  }

  bind(...values) {
    return new ScopedPreparedStatement(this.databaseDomain, this.statement.bind(...values));
  }

  first(column) {
    return this.statement.first(column);
  }

  run() {
    return this.statement.run();
  }

  all() {
    return this.statement.all();
  }

  raw(options) {
    return this.statement.raw(options);
  }
}

export function getModuleDatabase(
  env,
  { moduleName, allowedDomains, defaultDomain = "", required = true } = {}
) {
  const domains = [...new Set(allowedDomains || [])];
  if (!moduleName || !domains.length) throw new TypeError("Scoped databáze vyžaduje moduleName a allowedDomains.");
  const databases = Object.fromEntries(
    domains.map((domain) => [domain, getDatabase(env, domain, { required })])
  );
  if (!required && domains.some((domain) => !databases[domain])) return null;

  const resolveDomain = (sql) => databaseDomainForSql(sql, {
    moduleName,
    allowedDomains: domains,
    defaultDomain
  });

  return {
    prepare(sql) {
      const domain = resolveDomain(sql);
      return new ScopedPreparedStatement(domain, databases[domain].prepare(sql));
    },
    async batch(statements) {
      const scoped = statements || [];
      const batchDomains = [...new Set(scoped.map((statement) => statement?.databaseDomain).filter(Boolean))];
      if (batchDomains.length !== 1 || scoped.some((statement) => !(statement instanceof ScopedPreparedStatement))) {
        throw new CrossDatabaseQueryError(moduleName, batchDomains, "D1 batch");
      }
      return databases[batchDomains[0]].batch(scoped.map((statement) => statement.statement));
    },
    exec(sql) {
      const domain = resolveDomain(sql);
      return databases[domain].exec(sql);
    }
  };
}

export function databaseAvailability(env) {
  return Object.fromEntries(
    Object.entries(DATABASE_DOMAINS).map(([domain, binding]) => [
      domain,
      { binding, available: Boolean(env?.[binding]) }
    ])
  );
}
import { DATABASE_TABLE_DOMAINS } from "./database-table-domains.js";
