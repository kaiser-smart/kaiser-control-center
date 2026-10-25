import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { target, validateLocalRelease, assertCloudflareTarget, assertLiveBaseline, needsGitFetch, fileHashes, assertBuildFiles } from "./pwa-release.mjs";
const release = { schema:2, head:"a".repeat(40), base:"b".repeat(40), tree:"c".repeat(40), account:target.account, project:target.project, version:"1.0.0", baseVersion:"0.9.0", rollbackDeployment:"11111111-1111-4111-8111-111111111111" };
const state = { head:release.head, branch:target.branch, version:release.version, configChanged:false, clean:true };
assert.equal(validateLocalRelease(release,state),release);
for (const patch of [{head:"c".repeat(40)},{branch:"main"},{version:"old"},{configChanged:true},{clean:false}]) assert.throws(()=>validateLocalRelease(release,{...state,...patch}));
for (const patch of [{account:"wrong"},{project:"wrong"},{schema:1}]) assert.throws(()=>validateLocalRelease({...release,...patch},state));
assert.equal(needsGitFetch({localRelease:release,skipFetch:false}),false,"Local lane must not contact unavailable GitHub");
assert.equal(needsGitFetch({localRelease:null,skipFetch:false}),true,"Normal main protection preserved");
const deployment = { id:release.rollbackDeployment, environment:"production", deployment_trigger:{metadata:{branch:"main",commit_hash:release.base}}, latest_stage:{name:"deploy",status:"success",ended_on:"2026-10-24T10:00:00Z"} };
const project = { name:target.project, production_branch:"main", domains:["smart-odpady.ai"], canonical_deployment:deployment };
assertCloudflareTarget(release,project,deployment);
for (const status of ["1 hour ago","","failure","canceled","idle","active","queued",undefined]) assert.throws(()=>assertCloudflareTarget(release,project,{...deployment,latest_stage:{...deployment.latest_stage,status}}));
for (const patch of [{environment:"preview"},{id:"wrong"},{deployment_trigger:{metadata:{branch:"main",commit_hash:"c".repeat(40)}}}]) assert.throws(()=>assertCloudflareTarget(release,project,{...deployment,...patch}));
for (const patch of [{name:"wrong"},{production_branch:"other"},{domains:[]},{canonical_deployment:{...deployment,id:"changed"}}]) assert.throws(()=>assertCloudflareTarget(release,{...project,...patch},deployment));
await assertLiveBaseline(release,async()=>new Response('{"commit": "bbbbbbb", "version": "0.9.0"}'));
await assert.rejects(()=>assertLiveBaseline(release,async()=>new Response('wrong')));
const temp=mkdtempSync(path.join(tmpdir(),"pwa-hashes-"));
try {
 writeFileSync(path.join(temp,"asset.js"),"reviewed"); release.files=fileHashes(temp); assertBuildFiles(release,temp);
 writeFileSync(path.join(temp,"extra.txt"),"extra"); assert.throws(()=>assertBuildFiles(release,temp)); rmSync(path.join(temp,"extra.txt"));
 writeFileSync(path.join(temp,"asset.js"),"tampered"); assert.throws(()=>assertBuildFiles(release,temp)); rmSync(path.join(temp,"asset.js")); assert.throws(()=>assertBuildFiles(release,temp));
} finally {rmSync(temp,{recursive:true,force:true});}
console.log("Release gates passed: no GitHub dependency, unchanged normal main guard, wrong account/project/source, dirty tree, changed production, explicit successful rollback and exact build inventory.");
