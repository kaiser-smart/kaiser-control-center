import { readFile, writeFile } from "node:fs/promises";

import { importLegacyTyres } from "../functions/_lib/tyres-store.js";

const [, , inputPath, outputPath] = process.argv;

if (!inputPath || !outputPath) {
  throw new Error("Použití: node scripts/generate-tyres-legacy-import.mjs <invoice-data.js> <output.sql>");
}

function importedTireCount(label) {
  const match = String(label || "").match(/^\s*(\d+)\s*x/i);
  return Math.max(1, Math.round(Number(match?.[1]) || 1));
}

function cleanImportedTireLabel(label) {
  return String(label || "")
    .replace(/^\s*\d+\s*x\s*/i, "")
    .replace(/\*\*/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function extractTireSize(value) {
  const text = String(value || "").toUpperCase().replace(/\s+/g, "");
  const match = text.match(/\d{3}\/\d{2}R\d{2}(?:[.,]5|[.,]50)?/) || text.match(/\d{2}R\d{2}(?:[.,]5|[.,]50)?/) || text.match(/\d{3}\/\d{2}R\d{2}/) || text.match(/\d{1,2}[.,]\d{2}-\d{2}/);
  if (!match) return "nezjisteny rozmer";
  return match[0]
    .replace(".", ",")
    .replace(/^(\d{3})\/(\d{2})R/, "$1/$2 R")
    .replace(/^(\d{2})R/, "$1 R")
    .replace(/,50$/, ",5");
}

function importedTireManufacturer(label) {
  const text = String(label || "").toUpperCase();
  const knownBrands = ["HANKOOK", "PIRELLI", "SAILUN", "LAUFENN", "POINTS", "BRIDGESTONE", "CONTINENTAL", "TOURADOR", "ADVANCE", "GOODRIDE", "BARUM", "BKT"];
  return knownBrands.find((brand) => text.includes(brand)) || "PNEU";
}

function importedTireKind(label) {
  const text = String(label || "").toLowerCase();
  if (/protektor|retread|obnova/.test(text)) return "protektor";
  if (/pouz|použ|jet[aáeé]/.test(text)) return "pouzita";
  return "nova";
}

function importedTreadFor(type) {
  return type === "protektor" ? 14 : type === "pouzita" ? 8 : 16;
}

function importedTireModel(label, manufacturer, size) {
  const compactSize = String(size || "").toUpperCase().replace(/\s+/g, "").replace(",", "[,.]").replace("/", "\\/?");
  const model = cleanImportedTireLabel(label)
    .replace(new RegExp(`^${manufacturer}\\s*`, "i"), "")
    .replace(compactSize && compactSize !== "NEZJISTENYROZMER" ? new RegExp(compactSize, "i") : /$^/, "")
    .replace(/\b(TL|TT)\b/gi, "")
    .replace(/[;,]+$/g, "")
    .replace(/\s+/g, " ")
    .trim();
  return model || "bez modelu";
}

function importedTireIndex(label) {
  return String(label || "").match(/\b\d{2,3}\/\d{2,3}[A-Z]\b|\b\d{2,3}[A-Z]\b/i)?.[0] || "";
}

function importedTireId(service, serviceIndex, typeIndex, unitIndex, size) {
  const prefix = String(size || "PNE").match(/\d{2,3}/)?.[0] || "PNE";
  const source = String(service.id || service.invoice || `IMPORT${serviceIndex + 1}`).replace(/[^a-z0-9]/gi, "").toUpperCase().slice(-10);
  return `KS-${prefix}-${source}-${String(typeIndex + 1).padStart(2, "0")}${String(unitIndex + 1).padStart(2, "0")}`;
}

function buildTiresFromServiceInvoices(services) {
  const tyres = [];
  services.forEach((service, serviceIndex) => {
    const tireTypes = Array.isArray(service?.tireTypes) ? service.tireTypes : [];
    const totalCount = tireTypes.reduce((sum, label) => sum + importedTireCount(label), 0);
    const unitPrice = (Number(service?.tireCost) || 0) / Math.max(totalCount, 1);
    tireTypes.forEach((label, typeIndex) => {
      const count = importedTireCount(label);
      const cleanLabel = cleanImportedTireLabel(label);
      const size = extractTireSize(cleanLabel);
      const manufacturer = importedTireManufacturer(cleanLabel);
      const type = importedTireKind(cleanLabel);
      const model = importedTireModel(cleanLabel, manufacturer, size);
      for (let unitIndex = 0; unitIndex < count; unitIndex += 1) {
        tyres.push({
          id: importedTireId(service, serviceIndex, typeIndex, unitIndex, size),
          manufacturer,
          model,
          size,
          index: importedTireIndex(cleanLabel),
          dot: "",
          type,
          priceEx: Math.round(unitPrice),
          supplier: service?.supplier || "Pneuservis",
          purchaseDate: service?.date || "",
          invoice: service?.invoice || "",
          state: "sklad",
          vehicle: "",
          position: "",
          mounted: "",
          mountedOdo: 0,
          currentTread: importedTreadFor(type),
          pressure: 0,
          mileage: 0,
          defects: 0,
          importedFromInvoice: true,
          sourceServiceId: service?.id || "",
          sourceLabel: cleanLabel
        });
      }
    });
  });
  return tyres.sort((a, b) => String(b.purchaseDate || "").localeCompare(String(a.purchaseDate || "")));
}

function sqlLiteral(value) {
  if (value == null) return "NULL";
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw new Error("Neplatné číselné datum pro SQL převod.");
    return String(value);
  }
  if (typeof value === "boolean") return value ? "1" : "0";
  return `'${String(value).replaceAll("'", "''")}'`;
}

function bindSql(sql, values) {
  let index = 0;
  const bound = String(sql).replace(/\?/g, () => {
    if (index >= values.length) throw new Error("SQL příkaz má méně hodnot než parametrů.");
    return sqlLiteral(values[index++]);
  });
  if (index !== values.length) throw new Error("SQL příkaz má více hodnot než parametrů.");
  return `${bound.trim()};`;
}

const invoiceScript = await readFile(inputPath, "utf8");
const assignment = invoiceScript.match(/window\.kaiserInvoiceData\s*=\s*([\s\S]*);\s*$/);
if (!assignment) throw new Error("Vstup neobsahuje window.kaiserInvoiceData.");
const invoiceData = JSON.parse(assignment[1]);
const services = Array.isArray(invoiceData.services) ? invoiceData.services : [];
const knownVehicles = [...new Set(services.map((service) => String(service?.vehicle || "").trim()).filter((vehicle) => vehicle && vehicle !== "nezjisteno" && vehicle !== "bez SPZ"))];
const legacyState = {
  vehicles: knownVehicles.map((spz) => ({ spz })),
  tires: buildTiresFromServiceInvoices(services),
  measurements: [],
  services
};

const statements = [];
const db = {
  prepare(sql) {
    return {
      bind(...values) {
        return {
          async run() {
            statements.push({ sql, values });
            return { success: true };
          }
        };
      }
    };
  }
};

const result = await importLegacyTyres(
  { SMART_ODPADY_DB: db },
  { id: "system-tyres-migration", name: "Jednorázový převod Pneumatik" },
  {
    source: "legacy-kaiser-pneu-evidence-public-static-20260622",
    sourceUpdatedAt: "2026-06-22",
    state: legacyState
  }
);

await writeFile(outputPath, [
  "-- Auditovaný jednorázový převod veřejně publikované evidence Pneumatik.",
  ...statements.map(({ sql, values }) => bindSql(sql, values)),
  ""
].join("\n"), { mode: 0o600 });

console.log(JSON.stringify({ ...result.summary, statements: statements.length, outputPath }));
