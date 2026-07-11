import { copyFile, mkdir, readdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const sourceDir = path.join(root, "site");
const distDir = path.join(root, "dist");
const publicDir = path.join(distDir, "server", "public");

async function copyDir(from, to) {
  await mkdir(to, { recursive: true });
  for (const entry of await readdir(from)) {
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

const workerSource = `export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const requestedPath = url.pathname === "/" ? "/index.html" : url.pathname;
    const asset = await env.ASSETS.fetch(new URL(requestedPath, url.origin));
    if (asset.status !== 404) return asset;
    return env.ASSETS.fetch(new URL("/index.html", url.origin));
  }
};
`;

await rm(distDir, { recursive: true, force: true });
await copyDir(sourceDir, publicDir);
await mkdir(path.join(distDir, "server"), { recursive: true });
await writeFile(path.join(distDir, "server", "index.js"), workerSource);
await mkdir(path.join(distDir, ".openai"), { recursive: true });
await copyFile(path.join(root, ".openai", "hosting.json"), path.join(distDir, ".openai", "hosting.json"));

const hosting = JSON.parse(await readFile(path.join(root, ".openai", "hosting.json"), "utf8"));
console.log(`UI pilot preview build hotov (${hosting.project_id || "novy Sites projekt"}).`);
