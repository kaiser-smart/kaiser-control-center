import assert from "node:assert/strict";
import { buildDataBoxPlusChatContext } from "../functions/_lib/data-box-plus-chat-context.js";

const context = await buildDataBoxPlusChatContext({}, {
  id: "radim-oplustil",
  name: "Radim Opluštil",
  email: "oplustil@kaiserservis.cz",
  role: "admin",
  status: "active",
  active: true,
  department: "Vedení společnosti",
  position: "Jednatel společnosti"
});

assert.equal(context.application.name, "Kaiser Smart");
assert.equal(context.currentUser.name, "Radim Opluštil");
assert.equal(context.currentUser.email, "oplustil@kaiserservis.cz");
assert.equal(context.currentUser.roleLabel, "Admin");
assert.equal(context.knownUsers.filter((user) => user.name === "Radim Opluštil").length, 1);
assert.ok(context.knownUsers.some((user) => user.name === "Petr Lichtenberg"));
assert.ok(context.application.modules.some((module) => module.id === "data-box-plus" && module.route === "/datove-schranky-plus"));
assert.ok(context.application.modules.some((module) => module.id === "fleet" && module.permittedActions.includes("view")));
assert.ok(context.application.modules.every((module) => !Object.hasOwn(module, "icon")));
const forbiddenKeys = new Set(["password", "secret", "token", "apiKey"]);
function assertSafeKeys(value) {
  if (!value || typeof value !== "object") return;
  for (const [key, child] of Object.entries(value)) {
    assert.equal(forbiddenKeys.has(key), false, `forbidden key: ${key}`);
    assertSafeKeys(child);
  }
}
assertSafeKeys(context);

const duplicateDb = {
  prepare() {
    return {
      async all() {
        return { results: [
          { id: "jan-a", name: "Jan Novák", email: "jan.a@example.cz", role: "kancelar", status: "active", active: 1, department: "Kancelář", position: "Referent" },
          { id: "jan-b", name: "Jan Novák", email: "jan.b@example.cz", role: "dispecer", status: "active", active: 1, department: "Dispečink", position: "Dispečer" },
          { id: "eva", name: "Eva Bez kontaktu", email: "", phone: "", role: "kancelar", status: "active", active: 1, department: "Kancelář", position: "Referentka" }
        ] };
      }
    };
  }
};
const duplicateContext = await buildDataBoxPlusChatContext({ SMART_ODPADY_DB: duplicateDb }, context.currentUser);
assert.equal(duplicateContext.knownUsers.filter((user) => user.name === "Jan Novák").length, 2);
assert.ok(duplicateContext.knownUsers.some((user) => user.name === "Eva Bez kontaktu"));

console.log("data-box-plus chat context ok");
