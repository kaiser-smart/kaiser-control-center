import { readdir } from "node:fs/promises";
import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const sourceRoots = ["src", "functions", "scripts"];
const mode = process.argv.includes("--typecheck") ? "typecheck" : "lint";

async function collectJavaScriptFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];

  for (const entry of entries) {
    const fullPath = path.join(directory, entry.name);

    if (entry.isDirectory()) {
      files.push(...await collectJavaScriptFiles(fullPath));
      continue;
    }

    if (entry.isFile() && (entry.name.endsWith(".js") || entry.name.endsWith(".mjs"))) {
      files.push(fullPath);
    }
  }

  return files;
}

function checkFile(file) {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, ["--check", file], {
      cwd: root,
      stdio: ["ignore", "pipe", "pipe"]
    });
    let output = "";

    child.stdout.on("data", (chunk) => {
      output += chunk;
    });
    child.stderr.on("data", (chunk) => {
      output += chunk;
    });
    child.on("close", (code) => {
      resolve({
        file: path.relative(root, file),
        ok: code === 0,
        output: output.trim()
      });
    });
  });
}

const files = (await Promise.all(
  sourceRoots.map((directory) => collectJavaScriptFiles(path.join(root, directory)))
)).flat();

const results = await Promise.all(files.map(checkFile));
const failures = results.filter((result) => !result.ok);

if (failures.length) {
  for (const failure of failures) {
    console.error(`\n${failure.file}`);
    console.error(failure.output);
  }
  process.exit(1);
}

const label = mode === "typecheck"
  ? "Typecheck fallback"
  : "Lint";
console.log(`${label} hotov: ${files.length} JS/MJS souboru proslo node --check.`);
