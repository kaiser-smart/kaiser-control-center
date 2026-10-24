import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

export const target = Object.freeze({
  account: "3b25838c1e15dbfe5f3ac0c273826576",
  project: "kaiser-control-center-legacy",
  origin: "https://smart-odpady.ai",
  branch: "codex/smart-odpady-iphone-pwa"
});

// An explicit, reviewed local-release lane. Normal main/origin guard is unchanged.
export function validateLocalRelease(release, state) {
  assert.equal(release.schema, 1, "Unknown release format");
  assert.match(release.head, /^[a-f0-9]{40}$/);
  assert.match(release.base, /^[a-f0-9]{40}$/);
  assert.equal(state.head, release.head, "Release commit changed");
  assert.equal(state.originMain, release.base, "main moved; review/rebase is required");
  assert.equal(state.branch, target.branch, "Wrong source branch");
  assert.equal(release.account, target.account, "Wrong Cloudflare account");
  assert.equal(release.project, target.project, "Wrong Cloudflare project");
  assert.equal(release.version, state.version, "Wrong version");
  assert.match(release.rollbackDeployment, /^[a-f0-9-]{36}$/);
  assert.equal(state.configChanged, false, "Release must preserve Cloudflare bindings/config");
  assert.equal(state.clean, true, "Dirty source tree");
  return release;
}
export function loadRelease(file) { return JSON.parse(readFileSync(file, "utf8")); }

export async function assertLiveBaseline(release, request = fetch) {
  const response = await request(`${target.origin}/src/data/buildMeta.js?release-check=${Date.now()}`, { cache: "no-store", signal: AbortSignal.timeout(15000) });
  assert.equal(response.status, 200, "Production identity unavailable");
  const text = await response.text();
  assert.ok(text.includes(`"commit": "${release.base.slice(0, 7)}"`), "Production changed; stop and re-review");
}
export function assertCloudflareTarget(release, deployments) {
  assert.ok(Array.isArray(deployments));
  const rollback = deployments.find(item => item.Id === release.rollbackDeployment);
  assert.ok(rollback, "Rollback deployment unavailable in selected account/project");
  assert.equal(rollback.Environment, "Production");
  assert.equal(rollback.Branch, "main");
  assert.equal(rollback.Source, release.base.slice(0, 7));
  assert.equal(typeof rollback.Status, "string");
  assert.ok(rollback.Status.length > 0);
  assert.ok(!/fail|cancel|active|queued|running/i.test(rollback.Status), "Rollback target is not a completed build");
  assert.equal(rollback.Build, `https://dash.cloudflare.com/${target.account}/pages/view/${target.project}/${release.rollbackDeployment}`);
}
