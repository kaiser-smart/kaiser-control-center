import assert from "node:assert/strict";
import { buildPagesCloud } from "./pages-cloud-build.mjs";
const sha = "a".repeat(40);
const env = { CF_PAGES: "1", CF_PAGES_BRANCH: "main", CF_PAGES_COMMIT_SHA: sha };
function fixture(overrides = {}) {
  const calls = [];
  const values = { "rev-parse HEAD": sha, "status --porcelain": "", "rev-parse --is-shallow-repository": "false", "rev-parse origin/main": sha, ...overrides };
  return { calls, run(command, args) { const key = args.join(" "); calls.push([command, key]); if (values[key] instanceof Error) throw values[key]; return values[key] ?? ""; } };
}
for (const invalid of [{}, { ...env, CF_PAGES: "0" }, { ...env, CF_PAGES_COMMIT_SHA: "short" }]) {
  const f = fixture(); assert.throws(() => buildPagesCloud(invalid, f.run)); assert(!f.calls.some(([c]) => c === "npm"));
}
for (const changes of [{ "rev-parse HEAD": "b".repeat(40) }, { "status --porcelain": " M package.json" }, { "rev-parse origin/main": "b".repeat(40) }, { "fetch origin +refs/heads/main:refs/remotes/origin/main": new Error("network") }]) {
  const f = fixture(changes); assert.throws(() => buildPagesCloud(env, f.run)); assert(!f.calls.some(([c]) => c === "npm"));
}
const prod = fixture(); assert.equal(buildPagesCloud(env, prod.run), "production-guard-verified");
assert.deepEqual(prod.calls.slice(-2), [["git", "checkout -B main " + sha], ["npm", "run deploy:pages:production -- --check-only"]]);
const shallow = fixture({ "rev-parse --is-shallow-repository": "true" }); buildPagesCloud(env, shallow.run);
assert(shallow.calls.some(([c, a]) => c === "git" && a === "fetch --unshallow origin"));
const rejected = fixture({ "run deploy:pages:production -- --check-only": new Error("guard failed") });
assert.throws(() => buildPagesCloud(env, rejected.run), /guard failed/);
const preview = fixture(); assert.equal(buildPagesCloud({ CF_PAGES: "1", CF_PAGES_BRANCH: "feature" }, preview.run), "preview");
assert.deepEqual(preview.calls, [["npm", "run build"]]);
console.log("Pages cloud build safety: passed; no provider, credentials or production writes used.");
