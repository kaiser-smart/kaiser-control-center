import { access, mkdir, readdir, rm, stat, copyFile, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { buildMetaModuleSource, resolveBuildMeta } from "./build-meta.mjs";
import { versionModuleImports } from "./version-module-imports.mjs";
import { modules } from "../src/data/modules.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const dist = path.join(root, "dist");
const src = path.join(root, "src");
const publicDir = path.join(root, "public");
const template = await readFile(path.join(root, "index.html"), "utf8");
const buildMeta = await resolveBuildMeta(root);
const buildVersion = buildMeta.version || buildMeta.commit || buildMeta.backupDate || String(Date.now());
const assetVersion = encodeURIComponent(buildVersion);

function runtimeConfigModuleSource(env = process.env) {
  return `export const runtimeConfig = ${JSON.stringify({
    googleMapsApiKey: env.VITE_GOOGLE_MAPS_API_KEY || "",
    dataBoxPlusTriagePreview: ["1", "true"].includes(String(env.DATA_BOX_PLUS_TRIAGE_PREVIEW || "").toLowerCase())
  }, null, 2)};\n`;
}

function versionedTemplate() {
  return template
    .replace('href="src/styles.css"', `href="src/styles.css?v=${assetVersion}"`)
    .replace('href="src/ui-system-pilot.css"', `href="src/ui-system-pilot.css?v=${assetVersion}"`)
    .replace('src="src/app.js"', `src="src/app.js?v=${assetVersion}"`);
}

async function copyDir(from, to) {
  await mkdir(to, { recursive: true });
  const entries = await readdir(from);

  for (const entry of entries) {
    const source = path.join(from, entry);
    const target = path.join(to, entry);
    const info = await stat(source);

    if (info.isDirectory()) {
      await copyDir(source, target);
    } else {
      await copyFile(source, target);
    }
  }
}

async function fileExists(filePath) {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function versionCopiedModuleImports(directory) {
  const entries = await readdir(directory);

  for (const entry of entries) {
    const filePath = path.join(directory, entry);
    const info = await stat(filePath);

    if (info.isDirectory()) {
      await versionCopiedModuleImports(filePath);
      continue;
    }

    if (!entry.endsWith(".js")) {
      continue;
    }

    const sourceText = await readFile(filePath, "utf8");
    const versionedText = versionModuleImports(sourceText, buildVersion);

    if (versionedText !== sourceText) {
      await writeFile(filePath, versionedText);
    }
  }
}

const fixedRouteEntries = [
  { path: "/", moduleKey: "dashboard", label: "Hlavní stránka" },
  { path: "/sarlota", moduleKey: "dashboard", label: "Šarlota" },
  { path: "/pripominky", moduleKey: "feedback", label: "Připomínky" },
  { path: "/dovolena-nemoc/rychle-zadani", moduleKey: "absence", label: "Nepřítomnosti – rychlé zadání" },
  { path: "/dovolena-nemoc/moje-zadosti", moduleKey: "absence", label: "Nepřítomnosti – moje žádosti" },
  { path: "/dovolena-nemoc/nova-zadost", moduleKey: "absence", label: "Nepřítomnosti – nová žádost" },
  { path: "/dovolena-nemoc/ke-schvaleni", moduleKey: "absence", label: "Nepřítomnosti – ke schválení" },
  { path: "/dovolena-nemoc/kalendar", moduleKey: "absence", label: "Nepřítomnosti – kalendář" },
  { path: "/dovolena-nemoc/zamestnanci", moduleKey: "absence", label: "Nepřítomnosti – zaměstnanci" },
  { path: "/dovolena-nemoc/notifikace", moduleKey: "absence", label: "Nepřítomnosti – notifikace" },
  { path: "/dovolena-nemoc/reporty", moduleKey: "absence", label: "Nepřítomnosti – reporty" },
  { path: "/dovolena-nemoc/pravidla-automatizace", moduleKey: "absence", label: "Nepřítomnosti – pravidla" },
  { path: "/dovolena-nemoc/nastaveni", moduleKey: "absence", label: "Nepřítomnosti – nastavení" },
  { path: "/trasy-svozu/test", moduleKey: "collection-routes", label: "Svozové trasy – TEST řidiče" },
  { path: "/pohledavky/settings", moduleKey: "receivables", label: "Pohledávky – nastavení" },
  { path: "/pohledavky/import", moduleKey: "receivables", label: "Pohledávky – import" },
  { path: "/pohledavky/directory-audit", moduleKey: "receivables", label: "Pohledávky – Vistos Directory audit" },
  { path: "/receivables", moduleKey: "receivables", label: "Pohledávky – kompatibilní adresa" },
  { path: "/receivables/settings", moduleKey: "receivables", label: "Pohledávky – kompatibilní nastavení" }
];
const routeEntryByPath = new Map();

for (const entry of [
  ...fixedRouteEntries,
  ...modules.map((moduleItem) => ({
    path: moduleItem.route,
    moduleKey: moduleItem.id,
    label: moduleItem.title
  })),
  ...modules.filter((moduleItem) => Boolean(moduleItem.dashboardRoute)).map((moduleItem) => ({
    path: moduleItem.dashboardRoute,
    moduleKey: moduleItem.id,
    label: `${moduleItem.title} – dashboard`
  }))
]) {
  if (!routeEntryByPath.has(entry.path)) {
    routeEntryByPath.set(entry.path, entry);
  }
}

const routeEntries = [...routeEntryByPath.values()];
const routes = new Set(routeEntries.map((entry) => entry.path));

await rm(dist, { recursive: true, force: true });
await mkdir(dist, { recursive: true });
await copyDir(src, path.join(dist, "src"));
await writeFile(
  path.join(dist, "src/data/buildMeta.js"),
  buildMetaModuleSource(buildMeta)
);
await writeFile(
  path.join(dist, "src/data/runtimeConfig.js"),
  runtimeConfigModuleSource()
);
await versionCopiedModuleImports(path.join(dist, "src"));
await writeFile(
  path.join(dist, "route-manifest.json"),
  `${JSON.stringify({
    schemaVersion: 1,
    build: {
      version: buildMeta.version,
      branch: buildMeta.branch,
      commit: buildMeta.commit,
      backupDate: buildMeta.backupDate
    },
    routes: routeEntries
  }, null, 2)}\n`
);
if (await fileExists(publicDir)) {
  await copyDir(publicDir, dist);
}
await writeFile(path.join(dist, "index.html"), versionedTemplate());
await writeFile(path.join(dist, "404.html"), versionedTemplate());
await writeFile(path.join(dist, "_redirects"), [
  "/sarlota /sarlota/index.html 200",
  "/dovolena-nemoc/* /index.html 200",
  "/vozovy-park/* /index.html 200",
  "/sledovani-vozidel/* /index.html 200",
  "/pohledavky/* /pohledavky/index.html 200",
  "/receivables /pohledavky/index.html 200",
  "/receivables/* /pohledavky/index.html 200"
].join("\n") + "\n");
await writeFile(path.join(dist, "_headers"), [
  "/*",
  "  Cache-Control: no-cache"
].join("\n") + "\n");

for (const route of routes) {
  if (route === "/") {
    continue;
  }

  const routeDir = path.join(dist, route.replace(/^\/+/, ""));
  await mkdir(routeDir, { recursive: true });
  await writeFile(path.join(routeDir, "index.html"), versionedTemplate());
}

console.log(`Build hotov: ${routes.size} rout, vystup ve slozce dist.`);
