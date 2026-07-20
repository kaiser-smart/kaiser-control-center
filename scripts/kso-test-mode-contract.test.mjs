import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const handbook = readFileSync(new URL("../PŘÍRUČKA.md", import.meta.url), "utf8");
const audit = readFileSync(new URL("../docs/KSO_TEST_MODE_AUDIT.md", import.meta.url), "utf8");

assert.match(handbook, /TEST musí dovolit skutečně projít funkci; zakázané mají být jen produkční účinky/);
assert.match(handbook, /Musí být nahrazený bezpečným TEST adaptérem/);
assert.match(handbook, /pozitivní funkční průchod i negativní bezpečnostní hranici/);
assert.match(handbook, /Kvůli průchodu TESTU je zakázané dočasně povolit produkční zápis/);

assert.match(audit, /Pracovní paměť Šarloty v administrátorském TESTU/);
assert.match(audit, /Pravidla a automatizace ve třech modulech/);
assert.match(audit, /Kontextový Tool Šarloty v administrátorském TESTU/);
assert.match(audit, /Správně zakázané produkční účinky/);

console.log("KSO TEST mode contract: OK");
