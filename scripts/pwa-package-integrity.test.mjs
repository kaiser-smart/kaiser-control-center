import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, rmSync, symlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileHashes } from "./pwa-release.mjs";
import { verifyPackage } from "./pwa-package-integrity.mjs";
const dir=mkdtempSync(path.join(tmpdir(),"pwa-package-"));
const write=(file,body)=>writeFileSync(path.join(dir,file),body);
function inventory() {rmSync(path.join(dir,"SHA256SUMS"),{force:true});write("SHA256SUMS",Object.entries(fileHashes(dir)).map(([p,h])=>`${h}  ${p}`).join('\n')+'\n');}
try {
 write("release.json","{}");write("changes.patch","reviewed");inventory();assert.equal(verifyPackage(dir).status,"passed");
 write("changes.patch","changed");assert.throws(()=>verifyPackage(dir));write("changes.patch","reviewed");
 write("unexpected.txt","extra");assert.throws(()=>verifyPackage(dir));rmSync(path.join(dir,"unexpected.txt"));
 write(".env","synthetic");inventory();assert.throws(()=>verifyPackage(dir));rmSync(path.join(dir,".env"));inventory();
 symlinkSync("changes.patch",path.join(dir,"alias"));assert.throws(()=>verifyPackage(dir));rmSync(path.join(dir,"alias"));
 rmSync(path.join(dir,"changes.patch"));assert.throws(()=>verifyPackage(dir));
} finally {rmSync(dir,{recursive:true,force:true});}
console.log("Package integrity passed: tampering, missing/extra files, secret containers and symlinks rejected.");
