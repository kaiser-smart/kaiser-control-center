import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const appSource = readFileSync(new URL("../src/app.js", import.meta.url), "utf8");
const stylesSource = readFileSync(new URL("../src/styles.css", import.meta.url), "utf8");
const listApiSource = readFileSync(new URL("../functions/api/feedback-cases.js", import.meta.url), "utf8");
const detailApiSource = readFileSync(new URL("../functions/api/feedback-cases/[id].js", import.meta.url), "utf8");
const storeSource = readFileSync(new URL("../functions/_lib/feedback-case-store.js", import.meta.url), "utf8");

assert.match(appSource, /title: "Připomínky a chyby"/);
assert.match(appSource, /function feedbackCaseIdFromPath/);
assert.match(appSource, /path === FEEDBACK_ROUTE \|\| path\.startsWith\(`\$\{FEEDBACK_ROUTE\}\//);
assert.match(appSource, /Nové hlášení/);
assert.match(appSource, /Moje hlášení/);
assert.match(appSource, /Správa hlášení/);
assert.match(appSource, /Všechna hlášení/);
assert.match(appSource, />Svoje <span>/);
assert.match(appSource, /Hlášení bylo vytvořeno/);
assert.match(appSource, /Hlášení nyní čeká na kontrolu/);
assert.match(appSource, /Otevřít hlášení/);
assert.match(appSource, /Oprava funguje/);
assert.match(appSource, /Problém stále trvá/);
assert.match(appSource, /Připravit zadání pro Codex/);
assert.match(appSource, /Runner není nastaven/);
assert.doesNotMatch(appSource, /href="\$\{routeHref\(SELF_REPAIR_ROUTE\)\}" data-link>Otevřít Samoopravy/);

assert.match(stylesSource, /\.feedback-workflow-table/);
assert.match(stylesSource, /@media \(max-width: 820px\)/);
assert.match(stylesSource, /\.feedback-workflow-detail\s*\{[\s\S]*grid-template-columns:/);
assert.match(stylesSource, /\.feedback-workflow-manager\s*\{[\s\S]*position: sticky/);
assert.match(stylesSource, /overflow-x: auto/);

assert.match(listApiSource, /requireUserPermission\(env, request, "feedback", "view"\)/);
assert.match(listApiSource, /requireUserPermission\(env, request, "feedback", "create"\)/);
assert.match(detailApiSource, /requireUserPermission\(env, request, "self-repair", "manage"\)/);
assert.match(detailApiSource, /sendFeedbackReadyForVerificationNotification/);
assert.match(storeSource, /function publicCase/);
assert.match(storeSource, /internalNote:/);
assert.match(storeSource, /if \(!canManage\(user\)\) return publicCase/);
assert.match(storeSource, /feedback_codex_runner_not_configured/);

console.log("feedback workflow UI, routes and backend permission contract: ok");
