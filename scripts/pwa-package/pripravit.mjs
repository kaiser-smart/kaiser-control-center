import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { verifyPackage } from "./tools/pwa-package-integrity.mjs";
import { loadRelease, target, sha256 } from "./tools/pwa-release.mjs";
const bundle = path.dirname(fileURLToPath(import.meta.url));
try {
  verifyPackage(bundle);
  const release = loadRelease(path.join(bundle,"release.json"));
  assert.ok(process.argv[2], "Usage: node pripravit.mjs /existing/clean/private/repository");
  const cwd=path.resolve(process.argv[2]);
  const git=(args, input)=>execFileSync("git",args,{cwd,encoding:"utf8",input,stdio:["pipe","pipe","pipe"]}).trim();
  assert.equal(git(["status","--porcelain"]),"","Existing checkout must be clean");
  if (git(["rev-parse","HEAD"]) === release.head) { console.log("Exact release already present; no changes needed."); process.exit(0); }
  assert.equal(git(["rev-parse","HEAD"]),release.base,"Wrong base; no changes made");
  const patch=path.join(bundle,"changes.patch");
  assert.equal(sha256(readFileSync(patch)),release.patchSha256);
  git(["apply","--check","--index","--unidiff-zero",patch]);
  if(git(["branch","--show-current"])!==target.branch) git(["switch","-c",target.branch]);
  git(["apply","--index","--unidiff-zero",patch]);
  assert.equal(git(["write-tree"]),release.tree,"Restored tree mismatch");
  const commit=Buffer.from(release.commitObject,"base64");
  assert.equal(git(["hash-object","-t","commit","-w","--stdin"],commit),release.head,"Restored commit mismatch");
  git(["update-ref",`refs/heads/${target.branch}`,release.head,release.base]);
  assert.equal(git(["status","--porcelain"]),"");
  console.log(`Restored exact release ${release.head}; no network or deployment performed.`);
} catch(error) { console.error(error.code ? `Preparation stopped (${error.code}); original checkout must be inspected before retry.` : error.message); process.exitCode=1; }
