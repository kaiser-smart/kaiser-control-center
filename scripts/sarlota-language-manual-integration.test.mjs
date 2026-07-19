import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import {
  SARLOTA_SAFE_EXAMPLES_PROMPT_RULE,
  sarlotaSystemPrompt
} from "../src/sarlota/sarlotaSystemPrompt.js";

const kbReference = readFileSync(new URL("../docs/SARLOTA_LANGUAGE_REFERENCE_KB.md", import.meta.url), "utf8");
const pronunciationSource = readFileSync(new URL("../docs/SARLOTA_PRONUNCIATION_DICTIONARY_SOURCE.md", import.meta.url), "utf8");
const integrationRecord = readFileSync(new URL("../docs/SARLOTA_LANGUAGE_MANUAL_INTEGRATION.md", import.meta.url), "utf8");
const promptSources = readFileSync(new URL("../docs/SARLOTA_PROMPT_SOURCES.md", import.meta.url), "utf8");
const prompt = sarlotaSystemPrompt();

assert.match(kbReference, /není zdroj provozních faktů ani oprávnění/);
assert.match(kbReference, /bezpečnostní pravidla hlavního system promptu/);
assert.match(kbReference, /Připravený formulář nebo otevřený krok není uložená akce/);
assert.match(kbReference, /Hlasové `ano` není fyzické potvrzení v KSO/);
assert.match(kbReference, /Hranaté závorky lze nahradit jen aktuálním ověřeným údajem/);
assert.doesNotMatch(kbReference, /Patrik|Mercedes|Atego|Econic|Míra|1BP 8373|3BN 3558/);
assert.doesNotMatch(kbReference, /Hotovo, hlášení je uložené|Označila jsem zastávku jako hotovou/);

assert.match(pronunciationSource, /Alias smí ovlivnit pouze TTS výstup/);
assert.match(pronunciationSource, /připojeno k živému ElevenLabs agentovi/);
assert.match(pronunciationSource, /Kaiser servis \| kajzr servis/);
assert.match(pronunciationSource, /Kaiser \| kajzr/);
assert.match(pronunciationSource, /GPS \| gé, pé, es/);
assert.match(pronunciationSource, /SPZ \| es pé zet/);
assert.match(pronunciationSource, /Každý alias musí projít poslechovým testem/);

assert.match(integrationRecord, /SARLOTA_LANGUAGE_REFERENCE_KB\.md/);
assert.match(integrationRecord, /SARLOTA_PRONUNCIATION_DICTIONARY_SOURCE\.md/);
assert.match(promptSources, /SARLOTA_LANGUAGE_REFERENCE_KB\.md/);
assert.match(promptSources, /SARLOTA_PRONUNCIATION_DICTIONARY_SOURCE\.md/);

assert.match(SARLOTA_SAFE_EXAMPLES_PROMPT_RULE, /NEJSOU TO PROVOZNÍ DATA/);
assert.match(SARLOTA_SAFE_EXAMPLES_PROMPT_RULE, /Na potvrzení trasy se znovu neptej/);
assert.match(SARLOTA_SAFE_EXAMPLES_PROMPT_RULE, /říká výhradně HERE/);
assert.equal(prompt.includes(SARLOTA_SAFE_EXAMPLES_PROMPT_RULE), true);

console.log("Šarlota language manual integration tests passed.");
