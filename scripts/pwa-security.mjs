// Bounded distribution audit. Reports paths/counts only, never matched values.
import assert from "node:assert/strict";
import { readFileSync, writeFileSync, readdirSync, lstatSync, mkdirSync } from "node:fs";
import { execFileSync } from "node:child_process";
import path from "node:path";
import { sha256 } from "./pwa-release.mjs";
const base="c37cd96b3313ad5d8678e1018f76bf1b9d98f72e";
const files=directory=>readdirSync(directory).flatMap(name=>{const file=path.join(directory,name),info=lstatSync(file);assert.ok(!info.isSymbolicLink(),`Symlink: ${file}`);return info.isDirectory()?files(file):[file];});
const signatures=[/-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/,/\b(?:ghp|gho|ghu|ghs|github_pat)_[A-Za-z0-9_]{30,}/,/\bAKIA[A-Z0-9]{16}\b/,/\bsk-(?:proj-)?[A-Za-z0-9_-]{35,}/];
const findings=[];
const staticFiles=files("dist"), serverFiles=files("functions").filter(p=>p.endsWith(".js"));
for(const file of [...staticFiles,...serverFiles,"output/pwa-functions/index.js"]) {
 if(/\.(?:png|webp|mp4|woff2?|jpe?g|gif|ico)$/.test(file))continue;
 const text=readFileSync(file,"utf8");
 for(let i=0;i<signatures.length;i++) if(signatures[i].test(text)) findings.push({file,rule:i});
 if(file.startsWith("dist/")) assert.ok(!/^dist\/(scripts|functions|services|workers|migrations)\//.test(file),`Private source in static build: ${file}`);
}
assert.deepEqual(findings,[],"Potential secret signatures require review (values withheld)");
const contacts=new Set();
for(const file of ["scripts/serve.mjs","functions/_lib/default-users.js","functions/_lib/contact-users.js"]) {
 const text=readFileSync(file,"utf8");
 for(const match of text.matchAll(/[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}|\+420\d{9}/g))contacts.add(match[0]);
}
const expectedPublicContacts=new Set(["src/app.js","src/sarlota/sarlotaLanguagePackage.js","src/data/absence.js"]);
const retained=[];
for(const file of staticFiles.filter(p=>/\.(js|json|html|md|webmanifest)$/.test(p))) {
 const text=readFileSync(file,"utf8"),matches=[...contacts].filter(v=>text.includes(v));
 if(!matches.length)continue;
 const source=file.slice(5);
 assert.ok(expectedPublicContacts.has(source),`Unexpected private fixture contact in ${file} (values withheld)`);
 const original=execFileSync("git",["show",`${base}:${source}`],{encoding:"utf8",maxBuffer:10*1024*1024});
 assert.ok(matches.every(v=>original.includes(v)),`New private contact in ${file}`);
 retained.push({file,count:matches.length,classification:"existing operational contact text/configuration, unchanged from production source base"});
}
const config=readFileSync("wrangler.toml","utf8");
const browserKey=config.match(/^VITE_GOOGLE_MAPS_API_KEY\s*=\s*"([^"\r\n]+)"/m)?.[1];
assert.ok(browserKey && readFileSync("dist/src/data/runtimeConfig.js","utf8").includes(browserKey),"Existing public browser Maps configuration must be preserved");
const report={checkedAt:new Date().toISOString(),status:"passed",staticFiles:staticFiles.length,serverSourceFiles:serverFiles.length,compiledFunctionsSha256:sha256(readFileSync("output/pwa-functions/index.js")),secretSignatureFindings:findings,privateFixtures:"server-only source retained; whole serve.mjs, account directories, .env, keys and Git history excluded from archive",retainedPublicContacts:retained,browserMapsKey:"public browser configuration, preserved; value withheld; provider restrictions not changed or audited",limits:"Pattern scan plus targeted fixture review, not a proof of absence of every possible vulnerability. Package integrity is checked separately."};
mkdirSync("output/pwa-final",{recursive:true});writeFileSync("output/pwa-final/security.json",JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report));
