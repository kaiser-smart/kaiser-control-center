import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join, relative } from "node:path";

const rootUrl = new URL("../", import.meta.url);
const root = fileURLToPath(rootUrl);
const handbook = readFileSync(new URL("../docs/D1_MODULAR_ARCHITECTURE.md", import.meta.url), "utf8");
const sectionBounds = {
  core: ["### CORE", "### MESSAGES"],
  messages: ["### MESSAGES", "### AUDIT"],
  audit: ["### AUDIT", "### ARCHIVE a R2"],
  archive: ["### ARCHIVE a R2", "## Stav fází"]
};

const domainTables = {};
for (const [domain, [startMarker, endMarker]] of Object.entries(sectionBounds)) {
  const section = handbook.slice(handbook.indexOf(startMarker), handbook.indexOf(endMarker));
  domainTables[domain] = [...new Set(
    [...section.matchAll(/`([a-z][a-z0-9_]*)`/g)].map((match) => match[1])
  )].filter((name) => !["d1_migrations", "r2_object_key"].includes(name));
}

const tableDomain = new Map();
for (const [domain, tables] of Object.entries(domainTables)) {
  for (const table of tables) {
    if (tableDomain.has(table) && tableDomain.get(table) !== domain) {
      throw new Error(`Tabulka ${table} je namapovaná do více domén.`);
    }
    tableDomain.set(table, domain);
  }
}

function javascriptFiles(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) return javascriptFiles(path);
    return entry.isFile() && entry.name.endsWith(".js") ? [path] : [];
  });
}

const files = ["functions", "workers"]
  .flatMap((directory) => javascriptFiles(join(root, directory)))
  .filter((file) => /SMART_ODPADY_DB|getLegacyDatabase\(/.test(readFileSync(file, "utf8")))
  .map((file) => relative(root, file));

const tablePattern = /\b(?:FROM|JOIN|INTO|UPDATE|TABLE(?:\s+IF\s+NOT\s+EXISTS)?)\s+["'`]?([a-z][a-z0-9_]*)/gi;
const results = files.map((file) => {
  const source = readFileSync(join(root, file), "utf8");
  const tables = [...new Set(
    [...source.matchAll(tablePattern)]
      .map((match) => match[1])
      .filter((name) => !["set", "select", "values"].includes(name.toLowerCase()))
  )];
  const domains = [...new Set(tables.map((table) => tableDomain.get(table) || "unmapped"))];
  return { file, tables, domains };
});

for (const result of results) {
  console.log(`${result.file}\t${result.domains.join(",")}\t${result.tables.join(",")}`);
}

const crossDomain = results.filter((result) => result.domains.length > 1);
const unmapped = results.filter((result) => result.domains.includes("unmapped"));
console.log(JSON.stringify({
  legacyFiles: results.length,
  crossDomainFiles: crossDomain.map((result) => result.file),
  unmappedFiles: unmapped.map((result) => result.file),
  tableCounts: Object.fromEntries(Object.entries(domainTables).map(([domain, tables]) => [domain, tables.length]))
}, null, 2));
