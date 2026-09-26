import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import { DEFAULT_THEME_SETTINGS, normalizeThemeSettings, sameThemeSettings } from "../src/data/themeSettings.js";
import { useUnsavedChangesGuard } from "../src/useUnsavedChangesGuard.js";

const saved = normalizeThemeSettings({
  ...DEFAULT_THEME_SETTINGS,
  updatedAt: "2026-07-20T01:22:23.490Z",
  updatedByUserId: "test-admin"
});
const { updatedAt, updatedByUserId, ...editable } = saved;
const appSource = readFileSync(new URL("../src/app.js", import.meta.url), "utf8");
const appearanceFunctions = appSource.slice(appSource.indexOf("function appearanceFormData("), appSource.indexOf("function currentAbsenceSettingsDirtyTarget("));

function formContext() {
  const form = { elements: Object.fromEntries(Object.entries(editable).map(([key, value]) => [key, { value: String(value) }])) };
  const context = vm.createContext({
    normalizeThemeSettings, sameThemeSettings,
    window: { location: { pathname: "/nastaveni" } },
    document: { querySelector: () => form },
    normalizePath: value => value,
    canManageAppearanceSettings: () => true,
    themeState: { settings: { ...saved }, draft: { ...saved } }
  });
  vm.runInContext(appearanceFunctions, context);
  return { form, context };
}

test("loaded appearance form does not become dirty because save metadata is absent", () => {
  const { context } = formContext();
  assert.equal(context.currentAppearanceDirtyTarget().isDirty, false);
  assert.equal(sameThemeSettings(editable, saved), true);
  assert.equal(sameThemeSettings(saved, { ...saved, updatedAt: "2026-09-26", updatedByUserId: "another-admin" }), true);
  assert.equal(saved.updatedAt, updatedAt, "comparison must not mutate saved audit metadata");
  assert.equal(saved.updatedByUserId, updatedByUserId);
});

const changes = {
  paletteMode: "auto", logoUrl: "/test-logo.svg", primaryColor: "#123456",
  secondaryColor: "#123456", accentColor: "#123456", backgroundColor: "#123456",
  cardColor: "#123456", textColor: "#123456", mutedTextColor: "#123456",
  cardRadius: "24", buttonRadius: "999", buttonStyle: "outline",
  backgroundStyle: "neutral", cardShadow: "strong", fontFamily: "Arial"
};
for (const [key, value] of Object.entries(changes)) {
  test(`actual edit of ${key} is protected; restoring its saved value clears the warning`, () => {
    const { form, context } = formContext();
    form.elements[key].value = value;
    assert.equal(context.currentAppearanceDirtyTarget().isDirty, true);
    form.elements[key].value = String(editable[key]);
    assert.equal(context.currentAppearanceDirtyTarget().isDirty, false);
  });
}

test("navigation, reload, stay, failed save, successful save and discard preserve the guard contract", async t => {
  const originalDocument = globalThis.document;
  globalThis.document = { querySelectorAll: () => [], body: { insertAdjacentHTML() {} } };
  t.after(() => { if (originalDocument === undefined) delete globalThis.document; else globalThis.document = originalDocument; });
  const { form, context } = formContext();
  let navigations = 0;
  let saveSucceeds = false;
  const guard = useUnsavedChangesGuard({
    isDirty: () => context.currentAppearanceDirtyTarget().isDirty,
    saveChanges: async () => {
      if (!saveSucceeds) return false;
      context.themeState.settings = normalizeThemeSettings(context.appearanceFormData(form), { updatedAt: "2026-09-26", updatedByUserId: "test-admin" });
      return true;
    },
    discardChanges: () => { form.elements.logoUrl.value = context.themeState.settings.logoUrl; },
    render() {}
  });
  const navigate = () => { navigations++; };
  assert.equal(guard.confirm(navigate), true);
  assert.equal(navigations, 1);
  assert.equal(guard.renderModal(), "");
  let prevented = false;
  const event = { preventDefault() { prevented = true; } };
  guard.beforeUnload(event);
  assert.equal(prevented, false);
  form.elements.logoUrl.value = "/edited-logo.svg";
  guard.beforeUnload(event);
  assert.equal(prevented, true);
  assert.equal(guard.confirm(navigate), false);
  guard.stay();
  assert.equal(navigations, 1);
  assert.equal(guard.isDirty(), true);
  guard.confirm(navigate);
  await guard.saveAndContinue();
  assert.equal(navigations, 1);
  assert.equal(guard.isDirty(), true);
  assert.match(guard.renderModal(), /Zůstáváte na stránce/);
  saveSucceeds = true;
  await guard.saveAndContinue();
  assert.equal(navigations, 2);
  assert.equal(guard.isDirty(), false);
  assert.equal(context.themeState.settings.updatedAt, "2026-09-26");
  form.elements.logoUrl.value = "/another-edit.svg";
  guard.confirm(navigate);
  await guard.discardAndContinue();
  assert.equal(navigations, 3);
  assert.equal(guard.isDirty(), false);
});
