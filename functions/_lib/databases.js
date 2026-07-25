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

export class LegacyDatabaseWriteError extends Error {
  constructor(moduleName, operation) {
    super(`Legacy databáze je pouze pro auditované čtení. Zápis ${operation} modulu ${moduleName} byl zablokován.`);
    this.name = "LegacyDatabaseWriteError";
    this.code = "legacy_database_write_forbidden";
    this.status = 503;
    this.moduleName = moduleName;
    this.operation = operation;
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

function randomAuditId() {
  const suffix = globalThis.crypto?.randomUUID
    ? globalThis.crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  return `legacy-db-audit-${suffix}`;
}

function normalizeSql(sql) {
  return String(sql || "")
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .replace(/--[^\r\n]*/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

const LEGACY_WRITE_PATTERN = /\b(?:INSERT|UPDATE|DELETE|REPLACE|CREATE|ALTER|DROP|TRUNCATE|VACUUM|REINDEX|ANALYZE|ATTACH|DETACH|BEGIN|COMMIT|ROLLBACK|SAVEPOINT|RELEASE)\b/i;
const LEGACY_READ_PREFIX = /^(?:SELECT|WITH|EXPLAIN)\b/i;
const LEGACY_READ_PRAGMA = /^PRAGMA\s+(?:page_count|page_size|freelist_count|table_list|table_info|index_list|index_info|index_xinfo)\b/i;

export function legacySqlAccess(sql) {
  const normalized = normalizeSql(sql);
  const operation = normalized.match(/^([A-Z]+)/i)?.[1]?.toUpperCase() || "UNKNOWN";
  const write = LEGACY_WRITE_PATTERN.test(normalized);
  const read = !write && (LEGACY_READ_PREFIX.test(normalized) || LEGACY_READ_PRAGMA.test(normalized));
  return {
    allowed: read,
    operation,
    normalized
  };
}

async function sha256Text(value) {
  const bytes = new TextEncoder().encode(String(value || ""));
  const digest = await globalThis.crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function auditLegacyDatabaseAccess(env, context, sql, method, outcome) {
  const auditDb = getDatabase(env, "audit");
  const access = legacySqlAccess(sql);
  const statementHash = await sha256Text(access.normalized);
  const createdAt = new Date().toISOString();
  await auditDb.prepare(`
    INSERT INTO audit_events (
      id, event_type, module_key, severity, actor_type, actor_id,
      entity_type, entity_id, idempotency_key, detail, metadata_json, created_at
    ) VALUES (?, 'legacy_database_access', ?, ?, 'system', ?, 'database_binding',
      'SMART_ODPADY_DB', NULL, ?, ?, ?)
  `).bind(
    randomAuditId(),
    context.moduleName,
    outcome === "allowed_read" ? "warning" : "error",
    context.actorId || context.moduleName,
    outcome === "allowed_read"
      ? "Auditované čtení legacy databáze bylo povoleno."
      : "Pokus o nepovolené použití legacy databáze byl zablokován.",
    JSON.stringify({
      binding: "SMART_ODPADY_DB",
      purpose: context.purpose,
      method,
      operation: access.operation,
      outcome,
      statementHash
    }),
    createdAt
  ).run();
  return access;
}

class LegacyReadOnlyPreparedStatement {
  constructor(env, context, statement, sql) {
    this.env = env;
    this.context = context;
    this.statement = statement;
    this.sql = sql;
    this.legacyReadOnlyStatement = true;
  }

  bind(...values) {
    return new LegacyReadOnlyPreparedStatement(
      this.env,
      this.context,
      this.statement.bind(...values),
      this.sql
    );
  }

  async execute(method, args = []) {
    const access = legacySqlAccess(this.sql);
    const outcome = access.allowed ? "allowed_read" : "blocked_write";
    await auditLegacyDatabaseAccess(this.env, this.context, this.sql, method, outcome);
    if (!access.allowed) {
      throw new LegacyDatabaseWriteError(this.context.moduleName, access.operation);
    }
    return this.statement[method](...args);
  }

  first(column) {
    return this.execute("first", column === undefined ? [] : [column]);
  }

  run() {
    return this.execute("run");
  }

  all() {
    return this.execute("all");
  }

  raw(options) {
    return this.execute("raw", options === undefined ? [] : [options]);
  }
}

class LegacyReadOnlyDatabase {
  constructor(env, database, context) {
    this.env = env;
    this.database = database;
    this.context = context;
  }

  prepare(sql) {
    return new LegacyReadOnlyPreparedStatement(
      this.env,
      this.context,
      this.database.prepare(sql),
      sql
    );
  }

  async batch(statements) {
    const scoped = Array.isArray(statements) ? statements : [];
    if (!scoped.length || scoped.some((statement) => !(statement instanceof LegacyReadOnlyPreparedStatement))) {
      await auditLegacyDatabaseAccess(this.env, this.context, "", "batch", "blocked_write");
      throw new LegacyDatabaseWriteError(this.context.moduleName, "BATCH_UNKNOWN");
    }
    for (const statement of scoped) {
      const access = legacySqlAccess(statement.sql);
      await auditLegacyDatabaseAccess(
        this.env,
        this.context,
        statement.sql,
        "batch",
        access.allowed ? "allowed_read" : "blocked_write"
      );
      if (!access.allowed) {
        throw new LegacyDatabaseWriteError(this.context.moduleName, access.operation);
      }
    }
    return this.database.batch(scoped.map((statement) => statement.statement));
  }

  async exec(sql) {
    await auditLegacyDatabaseAccess(this.env, this.context, sql, "exec", "blocked_write");
    throw new LegacyDatabaseWriteError(this.context.moduleName, "EXEC");
  }

  async dump() {
    await auditLegacyDatabaseAccess(this.env, this.context, "DUMP", "dump", "blocked_write");
    throw new LegacyDatabaseWriteError(this.context.moduleName, "DUMP");
  }
}

export function getLegacyDatabase(env, options = {}) {
  const moduleName = String(options.moduleName || "").trim();
  const purpose = String(options.purpose || "").trim();
  if (!moduleName || !purpose) {
    throw new TypeError("Legacy databáze vyžaduje explicitní moduleName a purpose.");
  }
  const database = getDatabase(env, "legacy", options);
  if (!database) return null;
  return new LegacyReadOnlyDatabase(env, database, {
    moduleName,
    purpose,
    actorId: String(options.actorId || "").trim()
  });
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
