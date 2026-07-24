import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { calculateMedicalExamState } from "../src/data/medicalExamRules.js";

const appSource = await readFile(new URL("../src/app.js", import.meta.url), "utf8");
const styleSource = await readFile(new URL("../src/styles.css", import.meta.url), "utf8");

for (const label of [
  "Přehled",
  "Pracovní údaje",
  "Absence",
  "Lékařské prohlídky",
  "Dokumenty",
  "Historie",
  "Citlivé údaje"
]) {
  assert.ok(appSource.includes(`label: "${label}"`), `Chybí záložka ${label}.`);
}

assert.ok(
  appSource.includes('activeDetailTab: "overview"'),
  "Detail zaměstnance musí být výchozí read-only přehled."
);
assert.ok(
  appSource.includes("data-employee-edit-open") &&
  appSource.includes("data-employee-medical-exam-edit"),
  "Obě editace musí začínat explicitní akcí Upravit."
);
assert.ok(
  appSource.includes('medicalExamEditorStep: 1') &&
  appSource.includes('data-employee-medical-exam-step-panel="3"'),
  "Editor prohlídky musí mít přesně tři logické kroky."
);
assert.equal(
  (appSource.match(/Uložit prohlídku/g) || []).length,
  1,
  "Editor prohlídky smí mít jen jedno tlačítko Uložit prohlídku."
);

const medicalStart = appSource.indexOf("function employeeMedicalExamDisplayStatus");
const medicalEnd = appSource.indexOf("function employeeDocumentsSection", medicalStart);
const medicalUiSource = appSource.slice(medicalStart, medicalEnd);
for (const forbidden of ["API aktivní", "Dry-run", "Rozhodný věk"]) {
  assert.equal(
    medicalUiSource.includes(forbidden),
    false,
    `Běžné UI prohlídky nesmí obsahovat technický text ${forbidden}.`
  );
}
for (const status of ["Chybí údaje", "Platná", "Brzy končí", "Po termínu"]) {
  assert.ok(medicalUiSource.includes(status), `Chybí uživatelský stav ${status}.`);
}

assert.ok(
  appSource.includes("dateOfBirth: defaults.dateOfBirth || source.dateOfBirth"),
  "Datum narození z HR karty musí mít přednost před starším lékařským záznamem."
);
assert.ok(
  appSource.includes("const baseline = normalizeEmployeeMedicalExamFormData(employeeMedicalExamWithDefaults("),
  "Výchozí hodnoty editoru nesmí po pouhém otevření vytvářet falešné neuložené změny."
);

const validExam = calculateMedicalExamState({
  category: "driver_ii",
  dateOfBirth: "1988-05-12",
  lastExamDate: "2025-05-12"
}, "2026-07-24");
assert.equal(validExam.age, 38);
assert.equal(validExam.nextExamDate, "2029-05-12");
assert.equal(validExam.status, "ok");

for (const selector of [
  ".employee-detail-tabs",
  ".employee-medical-exam-summary",
  ".employee-medical-current-card",
  ".employee-editor-backdrop",
  ".employee-editor-steps",
  "@media (max-width: 760px)"
]) {
  assert.ok(styleSource.includes(selector), `Chybí responzivní styl ${selector}.`);
}
assert.ok(
  styleSource.includes(".employee-editor {\n    width: 100%;"),
  "Mobilní editor musí zabrat celou šířku obrazovky."
);

console.log("Employee detail UI contract: OK");
