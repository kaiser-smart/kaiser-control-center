import { readFile, writeFile, stat } from "node:fs/promises";
import { gunzipSync } from "node:zlib";
import { createHash } from "node:crypto";
import { dirname, resolve, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { buildLeadHubImportManifest } from "../functions/_lib/vistos-leadhub-profile-sync.js";

const [sourcePath, exportPath, outputPath, jobId, verifiedExportCount] = process.argv.slice(2);
if (!sourcePath || !exportPath || !outputPath || !jobId || !/^\d+$/.test(verifiedExportCount || "")) {
  throw new Error("Usage: node scripts/vistos-leadhub-manifest.mjs SOURCE_JSON EXPORT_JSONL_GZ PRIVATE_OUTPUT JOB_ID VERIFIED_TOTAL");
}
const repo = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const output = resolve(outputPath);
if (!relative(repo, output).startsWith("../") || ((await stat(dirname(output))).mode & 0o077)) {
  throw new Error("Manifest requires an owner-only directory outside the repository.");
}
const [sourceBytes, exportBytes] = await Promise.all([readFile(sourcePath), readFile(exportPath)]);
const source = JSON.parse(sourceBytes);
if (source.status !== "COMPLETE" || source.cleanup?.status !== "COMPLETE"
  || !Array.isArray(source.cleanup?.dataOnly)) throw new Error("Completed protected DATA_ONLY source required.");
const profiles = gunzipSync(exportBytes).toString("utf8").split(/\r?\n/).filter(Boolean).map(line => JSON.parse(line));
const hash = bytes => createHash("sha256").update(bytes).digest("hex");
const manifest = buildLeadHubImportManifest(source.cleanup.dataOnly, profiles, {
  workspaceId: "8d8bf07372ad4244877308cbd94c8e78",
  sourceRunId: source.runId,
  sourceCount: source.cleanup.dataOnlyUniqueEmails,
  exportJobId: jobId,
  exportState: "done",
  exportCount: Number(verifiedExportCount),
  allProfiles: true,
  sourceSha256: hash(sourceBytes),
  exportSha256: hash(exportBytes),
  snapshotCreatedAt: source.snapshotCreatedAt,
  finalizedAt: source.finalizedAt,
  plannedAt: new Date().toISOString()
});
await writeFile(output, JSON.stringify(manifest), { mode: 0o600, flag: "wx" });
const reasons = {};
manifest.items.forEach(item => { if (item.action === "SKIP") reasons[item.reason] = (reasons[item.reason] || 0) + 1; });
console.log(JSON.stringify({ status: manifest.status, reason: manifest.reason, sourceContacts: source.cleanup.sourceContactRecords,
  eligibleEmails: source.cleanup.dataOnlyUniqueEmails, exportProfiles: profiles.length,
  counts: manifest.counts, skipReasons: reasons, readyForImport: false, sendAllowed: false,
  output, sourceSha256: hash(sourceBytes), exportSha256: hash(exportBytes) }, null, 2));
