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
const incompleteKbResult = __test.validateManagedContent("knowledge_base", incompleteKb);
assert.equal(incompleteKbResult.valid, false);
assert.ok(incompleteKbResult.errors.some((item) => item.includes("Jazyková KB je neúplná")));

const truncatedKb = SARLOTA_LANGUAGE_KB_CONTENT.slice(0, 7000);
const truncatedKbResult = __test.validateManagedContent("knowledge_base", truncatedKb);
assert.equal(truncatedKbResult.valid, false);
assert.ok(truncatedKbResult.errors.some((item) => item.includes("minimum je 12500")));

const kbWithoutUnverifiedDataRule = SARLOTA_LANGUAGE_KB_CONTENT.replace(
  "## PRAVDIVOST A STAV AKCE",
  "## ODSTRANĚNÁ POVINNÁ ČÁST"
);
const kbWithoutUnverifiedDataResult = __test.validateManagedContent("knowledge_base", kbWithoutUnverifiedDataRule);
assert.equal(kbWithoutUnverifiedDataResult.valid, false);
assert.ok(
  kbWithoutUnverifiedDataResult.errors.some((item) => item.includes("## PRAVDIVOST A STAV AKCE"))
);

assert.deepEqual(
  __test.nestedPatch(["conversation_config", "agent", "prompt", "prompt"], "NOVÝ PROMPT"),
  { conversation_config: { agent: { prompt: { prompt: "NOVÝ PROMPT" } } } }
);
assert.match(__test.fingerprint("obsah"), /^fnv1a-[a-f0-9]{8}-5$/);

const attachedFile = {
  conversation_config: {
    agent: {
      prompt: {
        knowledge_base: [{
          type: "file",
          id: "kb-live-file",
          name: "02_Sarlota_KB_jazyk_vyslovnost_sloucena.txt"
        }]
      }
    }
  }
};
const selectedAttachedFile = __test.selectKnowledgeDocument(attachedFile, {
  documents: [{
    type: "file",
    id: "kb-live-file",
    name: "02_Sarlota_KB_jazyk_vyslovnost_sloucena.txt"
  }, {
    type: "text",
    id: "kb-unrelated",
    name: "Jiný dokument"
  }]
});
assert.equal(selectedAttachedFile.id, "kb-live-file");

assert.throws(
  () => __test.selectKnowledgeDocument({
    conversation_config: {
      agent: {
        prompt: {
          knowledge_base: [
            { type: "file", id: "kb-a", name: "Obecné provozní informace" },
            { type: "file", id: "kb-b", name: "Kontakty" }
          ]
        }
      }
    }
  }, { documents: [] }),
  /ambiguous_attached_knowledge_base/
);

console.log("sarlota content manager tests: OK");
