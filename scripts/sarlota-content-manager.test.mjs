import assert from "node:assert/strict";

import { __test } from "../functions/api/ai/elevenlabs/sarlota-content.js";
import { SARLOTA_LANGUAGE_KB_CONTENT } from "../src/sarlota/sarlotaLanguagePackage.js";
import { sarlotaSystemPrompt } from "../src/sarlota/sarlotaSystemPrompt.js";

const prompt = sarlotaSystemPrompt();
assert.equal(__test.validateManagedContent("prompt", prompt).valid, true);
assert.equal(__test.validateManagedContent("knowledge_base", SARLOTA_LANGUAGE_KB_CONTENT).valid, true);

const unsafePrompt = prompt.replaceAll("get_driver_report_context", "neověřený kontext");
const unsafeResult = __test.validateManagedContent("prompt", unsafePrompt);
assert.equal(unsafeResult.valid, false);
assert.ok(unsafeResult.errors.some((item) => item.includes("ověřeného kontextu vozidel")));

const incompleteKb = "Krátká znalost bez bezpečnostních pravidel.";
assert.equal(__test.validateManagedContent("knowledge_base", incompleteKb).valid, false);

assert.deepEqual(
  __test.nestedPatch(["conversation_config", "agent", "prompt", "prompt"], "NOVÝ PROMPT"),
  { conversation_config: { agent: { prompt: { prompt: "NOVÝ PROMPT" } } } }
);
assert.match(__test.fingerprint("obsah"), /^fnv1a-[a-f0-9]{8}-5$/);

console.log("sarlota content manager tests: OK");
