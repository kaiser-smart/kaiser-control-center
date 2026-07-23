import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const appSource = readFileSync(new URL("../src/app.js", import.meta.url), "utf8");
const saveSource = appSource.slice(
  appSource.indexOf("async function saveDataBoxPlusComposeDraft(options = {})"),
  appSource.indexOf("function scheduleDataBoxPlusComposeDraftSave()")
);

assert.match(saveSource, /if \(dataBoxPlusDraftSavePromise\) return dataBoxPlusDraftSavePromise/);
assert.match(saveSource, /async function flushDataBoxPlusComposeDraftSave/);
assert.match(saveSource, /await dataBoxPlusDraftSavePromise/);

function deferred() {
  let resolve;
  const promise = new Promise((resolvePromise) => {
    resolve = resolvePromise;
  });
  return { promise, resolve };
}

const requests = [];
const pending = [];
const state = {
  composeDraftId: "draft-1",
  composeMailboxId: "mailbox-1",
  composeRecipient: "kr7cdry",
  composeSubject: "Smlouva CA",
  composeBody: "Text zprávy",
  composeSaving: false,
  composeError: "",
  drafts: []
};
const createHarness = new Function("deps", `
  let dataBoxPlusDraftSavePromise = null;
  let dataBoxPlusDraftSaveTimer = null;
  const dataBoxPlusState = deps.state;
  const window = deps.window;
  const render = deps.render;
  const apiJson = deps.apiJson;
  const dataBoxPlusHumanError = (value) => String(value || "");
  const dataBoxPlusComposeDraftPayload = () => ({
    id: dataBoxPlusState.composeDraftId,
    mailboxId: dataBoxPlusState.composeMailboxId,
    recipientBoxId: dataBoxPlusState.composeRecipient,
    subject: dataBoxPlusState.composeSubject,
    body: dataBoxPlusState.composeBody
  });
  const applyDataBoxPlusComposeDraft = (draft) => {
    dataBoxPlusState.composeDraftId = draft.id;
    dataBoxPlusState.composeBody = draft.body;
  };
  ${saveSource}
  return {
    saveDataBoxPlusComposeDraft,
    flushDataBoxPlusComposeDraftSave
  };
`);

const harness = createHarness({
  state,
  window: { clearTimeout() {} },
  render() {},
  apiJson(path, options) {
    requests.push({ path, options });
    const wait = deferred();
    pending.push(wait);
    return wait.promise;
  }
});

const firstSave = harness.saveDataBoxPlusComposeDraft({ quiet: true });
const concurrentSave = harness.saveDataBoxPlusComposeDraft({ quiet: true });
assert.equal(requests.length, 1, "souběžné ukládání musí sdílet jediný PATCH");
pending.shift().resolve({ draft: { id: "draft-1", body: "Text zprávy" } });
await Promise.all([firstSave, concurrentSave]);

const inFlightSave = harness.saveDataBoxPlusComposeDraft({ quiet: true });
const flushedSave = harness.flushDataBoxPlusComposeDraftSave();
assert.equal(requests.length, 2, "flush musí nejprve počkat na rozpracované uložení");
pending.shift().resolve({ draft: { id: "draft-1", body: "Text zprávy" } });
await inFlightSave;
await Promise.resolve();
assert.equal(requests.length, 3, "po čekání musí flush provést závěrečné uložení aktuálního obsahu");
pending.shift().resolve({ draft: { id: "draft-1", body: "Text zprávy" } });
assert.equal((await flushedSave).id, "draft-1");
assert.equal(state.composeSaving, false);

console.log("data-box-plus compose autosave/send race ok");
