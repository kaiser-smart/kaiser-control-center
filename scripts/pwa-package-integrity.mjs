import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileHashes } from "./pwa-release.mjs";
export function verifyPackage(directory) {
  const expected = {};
  for (const line of readFileSync(path.join(directory,"SHA256SUMS"),"utf8").trim().split("\n")) {
    const match = line.match(/^([a-f0-9]{64})  ([^\r\n]+)$/);
    assert.ok(match, "Malformed checksum inventory");
    assert.ok(!expected[match[2]] && match[2] !== "SHA256SUMS", "Duplicate or recursive checksum");
    expected[match[2]] = match[1];
  }
  const actual = fileHashes(directory); delete actual.SHA256SUMS;
  assert.deepEqual(actual, expected, "Package missing, extra or modified files");
  assert.ok(actual["release.json"] && actual["changes.patch"], "Incomplete package");
  for (const file of Object.keys(actual)) {
    assert.ok(!/(^|\/)(\.git|\.env(?:\..*)?|node_modules|\.dev.vars)(\/|$)|\.(?:pem|key|p12|pfx)$|(^|\/)serve\.mjs$/.test(file), `Forbidden package file: ${file}`);
    if (file.startsWith("dist/")) assert.ok(!/^dist\/(?:functions|scripts|services|workers|migrations)\//.test(file), `Server source in public assets: ${file}`);
    if (!/\.(?:png|webp|mp4|woff2?|jpg|jpeg|gif|ico)$/.test(file)) {
      const text = readFileSync(path.join(directory,file),"utf8");
      assert.ok(!/-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----|\b(?:ghp|gho|ghu|ghs|github_pat)_[A-Za-z0-9_]{30,}|\bAKIA[A-Z0-9]{16}\b/.test(text), `Credential signature in ${file} (value withheld)`);
    }
  }
  return { status:"passed", files:Object.keys(actual).length };
}
