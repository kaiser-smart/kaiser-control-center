import assert from "node:assert/strict";
import { dataBoxPlusInstructionPlanForTest } from "../functions/_lib/data-box-plus-store.js";

const message = {
  id: "dbp-test-message",
  mailbox_id: "dbp-kaiser-servis",
  sender_name: "Test odesílatel",
  subject: "Testovací datová zpráva"
};

function plan(instruction, overrides = {}) {
  return dataBoxPlusInstructionPlanForTest(instruction, { ...message, ...overrides }, []);
}

const cases = [
  ["předej na faktury", { status: "Předáno fakturám", text: "Hotovo. Předáno fakturám." }],
  ["archivuj", { status: "Archivováno", text: "Hotovo. Archivováno." }],
  ["ulož k evidenci", { status: "Vyřešeno", text: "Hotovo. Uloženo k evidenci." }],
  ["označ jako vyřešené", { status: "Vyřešeno", text: "Hotovo. Označeno jako vyřešené." }],
  ["nechat nevyřízené", { status: "Nevyřízené", text: "Hotovo. Necháno nevyřízené." }],
  ["předej mzdové účetní", { status: "Předáno mzdové účetní", text: "Hotovo. Předáno mzdové účetní." }],
  ["předej garážmistrovi", { status: "Předáno garážmistrovi", text: "Hotovo. Předáno garážmistrovi." }],
  ["pošli na faktury email", { status: "Odesláno e-mailem", text: "Hotovo. Odesláno na faktury@kaiserservis.cz." }],
  ["pošli na vyz email", { status: "Potřebuje adresáta", text: "Nevím, který e-mail je", needsInput: true }],
  ["zapiš do vozidel", { status: "Chybí vozidlo", text: "Chybí vozidlo.", needsInput: true }]
];

for (const [instruction, expected] of cases) {
  const result = plan(instruction);
  assert.equal(result.messageStatus, expected.status, instruction);
  assert.ok(result.assistantText.includes(expected.text), instruction);
  assert.equal(result.requiresInput, Boolean(expected.needsInput), instruction);
}

const directEmail = plan("pošli email na radim@example.cz");
assert.equal(directEmail.messageStatus, "Odesláno e-mailem");
assert.equal(directEmail.recipientEmail, "radim@example.cz");
assert.equal(directEmail.emailSent, true);

const unclearVehicleMessage = plan("???", {
  subject: "Informace o konci platnosti technické prohlídky u vozidla 3BE2831"
});
assert.equal(unclearVehicleMessage.messageStatus, "Potřebuje upřesnit");
assert.equal(unclearVehicleMessage.assistantText, "Nevím přesně, co mám udělat. Upřesni pokyn.");

const archiveVehicleMessage = plan("archivuj", {
  subject: "Informace o konci platnosti technické prohlídky u vozidla 3BE2831"
});
assert.equal(archiveVehicleMessage.messageStatus, "Archivováno");

const vehicleRecordFromMessage = plan("zapiš do vozidel", {
  subject: "Informace o konci platnosti technické prohlídky u vozidla 3BE2831"
});
assert.equal(vehicleRecordFromMessage.messageStatus, "Předáno garážmistrovi");
assert.match(vehicleRecordFromMessage.resultLabel, /3BE2831/);

console.log("data-box-plus instruction flow ok");
