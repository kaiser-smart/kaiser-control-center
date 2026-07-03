import { copyFile, mkdir, rm } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const sourceDir = path.join(root, "design", "smart-design-preview");
const distDir = path.join(root, "dist-smart-design-preview");

await rm(distDir, { recursive: true, force: true });
await mkdir(distDir, { recursive: true });

await copyFile(path.join(sourceDir, "index.html"), path.join(distDir, "index.html"));
await copyFile(path.join(root, "src", "styles", "theme.css"), path.join(distDir, "theme.css"));

console.log("Smart design preview build hotov: dist-smart-design-preview");
