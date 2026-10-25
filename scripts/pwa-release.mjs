import assert from "node:assert/strict";
import { readFileSync, readdirSync, lstatSync } from "node:fs";
import { createHash } from "node:crypto";
import path from "node:path";

export const target = Object.freeze({ account: "3b25838c1e15dbfe5f3ac0c273826576", project: "kaiser-control-center-legacy", origin: "https://smart-odpady.ai", branch: "codex/smart-odpady-iphone-pwa" });
export const sha256 = bytes => createHash("sha256").update(bytes).digest("hex");
export function fileHashes(directory) {
  const result = {};
  function visit(relative = "") {
    for (const name of readdirSync(path.join(directory, relative)).sort()) {
      const next = path.posix.join(relative, name);
      const info = lstatSync(path.join(directory, next));
      assert.ok(!info.isSymbolicLink(), `Symlink forbidden: ${next}`);
      if (info.isDirectory()) visit(next);
      else { assert.ok(info.isFile(), `Not a regular file: ${next}`); result[next] = sha256(readFileSync(path.join(directory, next))); }
    }
  }
  visit(); return result;
}
export function assertBuildFiles(release, directory) {
  assert.ok(Object.keys(release.files || {}).length > 0, "Missing build inventory");
  assert.deepEqual(fileHashes(directory), release.files, "Build differs from reviewed package (missing, extra or changed file)");
}
export function needsGitFetch({ localRelease, skipFetch }) { return !localRelease && !skipFetch; }
export function validateLocalRelease(release, state) {
  assert.equal(release.schema, 2, "Unknown release format");
  for (const key of ["head", "base", "tree"]) assert.match(release[key], /^[a-f0-9]{40}$/);
  assert.equal(state.head, release.head, "Release commit changed");
  assert.equal(state.branch, target.branch, "Wrong source branch");
  assert.equal(release.account, target.account, "Wrong Cloudflare account");
  assert.equal(release.project, target.project, "Wrong Cloudflare project");
  assert.equal(release.version, state.version, "Wrong version");
  assert.match(release.rollbackDeployment, /^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/);
  assert.equal(state.configChanged, false, "Release must preserve Cloudflare bindings/config");
  assert.equal(state.clean, true, "Dirty source tree");
  return release;
}
export function loadRelease(file) { return JSON.parse(readFileSync(file, "utf8")); }
export async function assertLiveBaseline(release, request = fetch) {
  const response = await request(`${target.origin}/src/data/buildMeta.js?release-check=${Date.now()}`, { cache: "no-store", redirect: "error", signal: AbortSignal.timeout(15000) });
  assert.equal(response.status, 200, "Production identity unavailable");
  const text = await response.text();
  assert.ok(text.includes(`"commit": "${release.base.slice(0, 7)}"`), "Production changed; stop and re-review");
  assert.ok(text.includes(`"version": "${release.baseVersion}"`), "Production version changed");
}
export function assertSuccessfulDeployment(deployment, commit) {
  assert.equal(deployment?.environment, "production", "Not a production deployment");
  assert.equal(deployment?.deployment_trigger?.metadata?.branch, "main", "Wrong deployment branch");
  assert.equal(deployment?.deployment_trigger?.metadata?.commit_hash, commit, "Wrong deployment source");
  assert.equal(deployment?.latest_stage?.name, "deploy", "Deployment did not finish deploy stage");
  assert.equal(deployment?.latest_stage?.status, "success", "Deployment is not confirmed successful");
  assert.ok(Number.isFinite(Date.parse(deployment?.latest_stage?.ended_on)), "Missing completion timestamp");
}
export function assertCloudflareTarget(release, project, rollback) {
  assert.equal(project?.name, target.project, "Wrong project");
  assert.equal(project?.production_branch, "main", "Wrong production branch");
  assert.ok(project?.domains?.includes(new URL(target.origin).hostname), "Production domain not bound to project");
  assert.equal(rollback?.id, release.rollbackDeployment, "Wrong rollback deployment");
  assertSuccessfulDeployment(rollback, release.base);
  assert.equal(project?.canonical_deployment?.id, release.rollbackDeployment, "Active production changed");
  assertSuccessfulDeployment(project.canonical_deployment, release.base);
}
