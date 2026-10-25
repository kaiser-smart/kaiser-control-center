import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { verifyPackage } from "./tools/pwa-package-integrity.mjs";
import { loadRelease, target, assertSuccessfulDeployment, assertLiveBaseline } from "./tools/pwa-release.mjs";
import { cloudflareClient } from "./tools/pwa-cloudflare.mjs";
const bundle=path.dirname(fileURLToPath(import.meta.url));
try {
  verifyPackage(bundle); const release=loadRelease(path.join(bundle,"release.json"));
  assert.ok(process.argv.includes(`--schvaleno=${release.head}`),"Rollback requires explicit approval of this release");
  const api=cloudflareClient(); const project=await api("/");
  assert.equal(project.name,target.project); assert.equal(project.production_branch,"main");
  assert.ok(project.domains.includes(new URL(target.origin).hostname));
  assertSuccessfulDeployment(project.canonical_deployment,release.head);
  const rollback=await api(`/deployments/${release.rollbackDeployment}`);
  assertSuccessfulDeployment(rollback,release.base);
  await api(`/deployments/${release.rollbackDeployment}/rollback`,"POST");
  const restored=await api("/");
  assert.equal(restored.canonical_deployment.id,release.rollbackDeployment);
  assertSuccessfulDeployment(restored.canonical_deployment,release.base);
  await assertLiveBaseline(release);
  for (const [route,status] of [["/",200],["/api/me",401],["/api/users",401]]) {
    const response=await fetch(`${target.origin}${route}?rollback-check=${Date.now()}`,{cache:"no-store",redirect:"error",signal:AbortSignal.timeout(15000)});
    assert.equal(response.status,status); assert.match(response.headers.get("cache-control")||"",route.startsWith("/api/")?/no-store/:/no-cache|no-store/);
  }
  console.log("Pages rollback and anonymous readback passed. No D1/R2 writes performed. Authenticated phone verification remains separate.");
} catch(error) { console.error(error.message); process.exitCode=1; }
