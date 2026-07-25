import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  RCS_TEMPLATE_REGISTRY,
  twilioContentDefinition
} from "../functions/_lib/rcs-template-registry.js";

const ASSET_DIR = new URL("../public/rcs/templates/", import.meta.url);
const ASSET_DIR_PATH = fileURLToPath(ASSET_DIR);
const EXPECTED_KEYS = Object.freeze([
  "general.info",
  "critical.alert",
  "vehicle.fault",
  "task.new",
  "ds.deadline",
  "ds.new",
  "leave.pending",
  "leave.approved"
]);

function assetPath(filename) {
  return join(ASSET_DIR_PATH, filename);
}

function readJson(filename) {
  return JSON.parse(readFileSync(new URL(filename, ASSET_DIR), "utf8"));
}

function pngSize(filename) {
  const buffer = readFileSync(assetPath(filename));
  assert.equal(buffer.toString("ascii", 1, 4), "PNG", `${filename} není PNG`);
  return {
    width: buffer.readUInt32BE(16),
    height: buffer.readUInt32BE(20)
  };
}

function sha256(filename) {
  return createHash("sha256").update(readFileSync(assetPath(filename))).digest("hex");
}

const manifest = readJson("manifest.json");
const assetMap = readJson("template-asset-map.json");
const manifestByKey = new Map(manifest.templates.map((item) => [item.templateKey, item]));

assert.equal(manifest.version, "4.0.0");
assert.deepEqual(Object.keys(assetMap), EXPECTED_KEYS);
assert.deepEqual(Object.keys(RCS_TEMPLATE_REGISTRY), [
  "leave.approved",
  "leave.pending",
  "ds.new",
  "ds.deadline",
  "task.new",
  "vehicle.fault",
  "critical.alert",
  "general.info"
]);

for (const templateKey of EXPECTED_KEYS) {
  const mappedAsset = assetMap[templateKey];
  const manifestTemplate = manifestByKey.get(templateKey);
  const registryTemplate = RCS_TEMPLATE_REGISTRY[templateKey];
  assert.ok(manifestTemplate, `${templateKey} chybí v manifestu`);
  assert.equal(manifestTemplate.enabled, true);
  assert.equal(manifestTemplate.assetFile, mappedAsset);
  assert.equal(registryTemplate.assetFilename, mappedAsset);
  assert.equal(registryTemplate.orientation, "VERTICAL");
  assert.equal(registryTemplate.height, "MEDIUM");
  assert.equal(twilioContentDefinition(templateKey).types["twilio/card"].media[0], `https://smart-odpady.ai/rcs/templates/${mappedAsset}`);

  const size = pngSize(mappedAsset);
  assert.equal(size.width, 1200, `${mappedAsset} nemá šířku 1200 px`);
  assert.equal(size.height, 600, `${mappedAsset} nemá výšku 600 px`);
  assert.equal(sha256(mappedAsset), manifestTemplate.asset.sha256);
  assert.equal(statSync(assetPath(mappedAsset)).size, manifestTemplate.asset.pngBytes);
  assert.equal(statSync(assetPath(mappedAsset.replace(/\.png$/u, ".jpg"))).size, manifestTemplate.asset.jpgBytes);
}

const activeAssets = new Set(Object.values(assetMap));
assert.equal(activeAssets.size, EXPECTED_KEYS.length);
assert.ok(!activeAssets.has("ds-new-alt.png"));
assert.equal(manifest.alternates.length, 1);
assert.equal(manifest.alternates[0].assetFile, "ds-new-alt.png");
assert.equal(manifest.alternates[0].enabled, false);
assert.equal(pngSize("ds-new-alt.png").width, 1200);
assert.equal(pngSize("ds-new-alt.png").height, 600);
assert.equal(sha256("ds-new-alt.png"), manifest.alternates[0].asset.sha256);

console.log("rcs-template-assets.test.mjs: OK");
