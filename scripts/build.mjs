import { access, mkdir, readdir, rm, stat, copyFile, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { buildMetaModuleSource, resolveBuildMeta } from "./build-meta.mjs";
import { modules } from "../src/data/modules.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const dist = path.join(root, "dist");
const src = path.join(root, "src");
const publicDir = path.join(root, "public");
const template = await readFile(path.join(root, "index.html"), "utf8");
const buildMeta = await resolveBuildMeta(root);
const assetVersion = encodeURIComponent(buildMeta.version || buildMeta.commit || buildMeta.backupDate || String(Date.now()));

function versionedTemplate() {
  return template
    .replace('href="src/styles.css"', `href="src/styles.css?v=${assetVersion}"`)
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

const routes = new Set([
  "/",
  "/pripominky",
  "/dovolena-nemoc/rychle-zadani",
  "/dovolena-nemoc/moje-zadosti",
  "/dovolena-nemoc/nova-zadost",
  "/dovolena-nemoc/ke-schvaleni",
  "/dovolena-nemoc/kalendar",
  "/dovolena-nemoc/zamestnanci",
  "/dovolena-nemoc/notifikace",
  "/dovolena-nemoc/reporty",
  "/dovolena-nemoc/nastaveni",
  ...modules.map((moduleItem) => moduleItem.route),
  ...modules.map((moduleItem) => moduleItem.dashboardRoute).filter(Boolean)
]);

await rm(dist, { recursive: true, force: true });
await mkdir(dist, { recursive: true });
await copyDir(src, path.join(dist, "src"));
await writeFile(
  path.join(dist, "src/data/buildMeta.js"),
  buildMetaModuleSource(buildMeta)
);
if (await fileExists(publicDir)) {
  await copyDir(publicDir, dist);
}
await writeFile(path.join(dist, "index.html"), versionedTemplate());
await writeFile(path.join(dist, "404.html"), versionedTemplate());

for (const route of routes) {
  if (route === "/") {
    continue;
  }

  const routeDir = path.join(dist, route.replace(/^\/+/, ""));
  await mkdir(routeDir, { recursive: true });
  await writeFile(path.join(routeDir, "index.html"), versionedTemplate());
}

console.log(`Build hotov: ${routes.size} rout, vystup ve slozce dist.`);
