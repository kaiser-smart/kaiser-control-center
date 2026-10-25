import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { verifyPackage } from "./tools/pwa-package-integrity.mjs";
import { loadRelease, assertLiveBaseline } from "./tools/pwa-release.mjs";
import { checkCloudflare } from "./tools/pwa-cloudflare.mjs";
const bundle=path.dirname(fileURLToPath(import.meta.url));
try {
  verifyPackage(bundle);
  const file=path.join(bundle,"release.json"), release=loadRelease(file);
  assert.ok(process.argv[2],"Usage: node nasadit.mjs /repo --check | --preflight | --schvaleno=<exact-head>");
  const approved=process.argv.includes(`--schvaleno=${release.head}`);
  const preflight=process.argv.includes("--preflight");
  assert.ok(approved || preflight || process.argv.includes("--check"),"Explicit release approval or check mode required");
  const cwd=path.resolve(process.argv[2]);
  const head=execFileSync("git",["rev-parse","HEAD"],{cwd,encoding:"utf8"}).trim();
  assert.equal(head,release.head,"Wrong source checkout");
  const args=["scripts/deploy-pages-production.mjs",`--local-release=${file}`,approved?`--approve-release=${release.head}`:"--check-only"];
  execFileSync(process.execPath,args,{cwd,stdio:"inherit",env:{...process.env,PATH:`${path.dirname(process.execPath)}${path.delimiter}${process.env.PATH || ""}`}});
  if(preflight && !approved) { await assertLiveBaseline(release); console.log(JSON.stringify(await checkCloudflare(release))); }
  if(!approved) console.log("No upload performed. --check verifies local release; --preflight also verifies live target/access.");
} catch(error) { console.error(error.code ? `Release stopped (${error.code}); no successful deployment is claimed. If upload occurred, inspect postdeploy evidence before approved rollback.` : error.message); process.exitCode=1; }
