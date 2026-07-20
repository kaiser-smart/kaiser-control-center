import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const handbook = readFileSync(new URL("../PŘÍRUČKA.md", import.meta.url), "utf8");

assert.match(handbook, /celý skutečně aktivní system Prompt/);
assert.match(handbook, /celý obsah všech Knowledge Base dokumentů skutečně připojených/);
assert.match(handbook, /src\/sarlota\/sarlotaSystemPrompt\.js/);
assert.match(handbook, /docs\/SARLOTA_PROMPT_SOURCES\.md/);
assert.match(handbook, /Koncept v KSO a aktivní obsah v ElevenLabs jsou dvě různé verze/);
assert.match(handbook, /práce na Šarlotě se nesmí zahájit ani pokračovat/);
assert.match(handbook, /nesmí chybějící obsah nahradit domněnkou/);
assert.match(handbook, /TEST režim slouží k otestování skutečné funkce, ne k jejímu plošnému vypnutí/);
assert.match(handbook, /je otevřený nedodělek/);

console.log("sarlota mandatory Prompt and Knowledge Base reading handbook test: OK");
