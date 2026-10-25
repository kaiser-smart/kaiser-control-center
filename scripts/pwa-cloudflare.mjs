// Use Wrangler's supported credential interface; never print or persist credentials.
import { spawnSync } from "node:child_process";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { target, assertCloudflareTarget } from "./pwa-release.mjs";
export const wranglerVersion = "4.142.0";
export function wranglerCommand(args) {
  if (process.env.PWA_WRANGLER_PATH) {
    const packageFile=path.resolve(path.dirname(process.env.PWA_WRANGLER_PATH),"../package.json");
    assert.equal(JSON.parse(readFileSync(packageFile,"utf8")).version,wranglerVersion,"Pinned Wrangler version required");
  }
  return process.env.PWA_WRANGLER_PATH
    ? [process.execPath, [process.env.PWA_WRANGLER_PATH, ...args]]
    : ["pnpm", ["dlx", `wrangler@${wranglerVersion}`, ...args]];
}
export function cloudflareClient() {
  assert.ok(!process.env.CLOUDFLARE_ACCOUNT_ID || process.env.CLOUDFLARE_ACCOUNT_ID === target.account, "Wrong Cloudflare account in environment");
  const [command, args] = wranglerCommand(["auth", "token", "--json"]);
  const result = spawnSync(command, args, { encoding: "utf8", timeout: 60000, env: { ...process.env, CI: "true", WRANGLER_SEND_METRICS: "false", CLOUDFLARE_ACCOUNT_ID: target.account }, stdio: ["ignore", "pipe", "pipe"] });
  if (result.status !== 0) {
    const keychain = /Keychain|keychain|exit 51|-25293/.test(result.stderr || "");
    throw new Error(keychain ? "Cloudflare credential access blocked by macOS Keychain (exit 51). No login retried; administrator must repair the login Keychain." : "Cloudflare credentials unavailable through Wrangler; no login attempted. Check existing authorized CLI access.");
  }
  let credentials;
  try { credentials = JSON.parse(result.stdout); } catch { throw new Error("Unsupported Wrangler credential response (contents withheld)"); }
  assert.ok(["api_token", "oauth"].includes(credentials.type) && credentials.token, "Existing scoped OAuth/API token required");
  const headers = { Authorization: `Bearer ${credentials.token}` };
  return async (endpoint, method = "GET") => {
    assert.ok(/^\/(?:deployments(?:\/[a-f0-9-]+(?:\/rollback)?)?)?$/.test(endpoint), "Unexpected Cloudflare endpoint");
    assert.ok(method === "GET" || (method === "POST" && endpoint.endsWith("/rollback")), "Unexpected mutation");
    const response = await fetch(`https://api.cloudflare.com/client/v4/accounts/${target.account}/pages/projects/${target.project}${endpoint === "/" ? "" : endpoint}`, { method, headers, redirect: "error", signal: AbortSignal.timeout(30000) });
    if (!response.ok) throw new Error(`Cloudflare request failed: HTTP ${response.status} (response withheld)`);
    const data = await response.json();
    assert.equal(data.success, true, "Cloudflare API did not confirm success");
    return data.result;
  };
}
export async function checkCloudflare(release, api = cloudflareClient()) {
  const project = await api("/");
  const rollback = await api(`/deployments/${release.rollbackDeployment}`);
  assertCloudflareTarget(release, project, rollback);
  return { account: target.account, project: project.name, production: project.canonical_deployment.id, rollback: rollback.id, status: "verified" };
}
