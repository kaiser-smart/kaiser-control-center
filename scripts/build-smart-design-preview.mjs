import { copyFile, mkdir, readdir, rm, stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const sourceDir = path.join(root, "design", "smart-design-preview");
const distDir = path.join(root, "dist-smart-design-preview");
const iconSourceDir = path.join(root, "public", "design-icons");
const iconDistDir = path.join(distDir, "icons");

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

await rm(distDir, { recursive: true, force: true });
await mkdir(distDir, { recursive: true });

await copyFile(path.join(sourceDir, "index.html"), path.join(distDir, "index.html"));
await copyFile(path.join(root, "src", "styles", "theme.css"), path.join(distDir, "theme.css"));
await copyDir(iconSourceDir, iconDistDir);

console.log("Smart design preview build hotov: dist-smart-design-preview");
