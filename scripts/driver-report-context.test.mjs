import assert from "node:assert/strict";

import {
  driverVehicleCandidateMatches,
  fleetPayloadUsesMockData,
  shouldBlockFleetPayloadForDriverReports
} from "../functions/_lib/fleet-vehicles-store.js";
import {
  driverPartRequestNeedsManualVehicleReview,
  driverPartRequestSourceHasManualVehicleReview
} from "../functions/_lib/driver-part-requests-store.js";
import { createElevenLabsClientTools } from "../src/elevenLabsClientTools.js";

const UNVERIFIED_VEHICLE_MESSAGE = "Nevidím bezpečně přiřazené vozidlo. Nadiktuj mi prosím SPZ.";
const NO_VERIFIED_ASSIGNED_VEHICLES_REASON = "NO_VERIFIED_ASSIGNED_VEHICLES";

const radimUser = {
  id: "user-radim",
  name: "Radim Opluštil",
  phone: "731 000 000"
};

const vehicles = [
  {
    id: "vehicle-radim-1",
    licensePlate: "1A1 1111",
    model: "Svoz 1",
    assignedDriverId: "employee-radim",
    assignedDriverName: "Radim Opluštil",
    assignedDriverPhone: "731 000 000",
    status: "active"
  },
  {
    id: "vehicle-radim-2",
    licensePlate: "2A2 2222",
    model: "Svoz 2",
    assignedDriverId: "user-radim",
    assignedDriverName: "Radim Opluštil",
    assignedDriverPhone: "731 000 000",
    status: "active"
  },
  {
    id: "vehicle-other",
    licensePlate: "3A4 1234",
    model: "Cizí vozidlo",
    assignedDriverId: "employee-other",
    assignedDriverName: "Radim Opluštil",
    assignedDriverPhone: "731 000 000",
    status: "active"
  }
];

function safeVoiceVehicle(id, displayName, spz) {
  return {
    id,
    vehicleId: id,
    displayName,
    spz,
    licensePlate: spz,
    assignedToCurrentDriver: true,
    existsInFleet: true,
    active: true,
    source: "fleet_db"
  };
}

function findInFakeDom(nodes, predicate) {
  for (const node of nodes || []) {
    if (predicate(node)) {
      return node;
    }

    const child = findInFakeDom(node.children || [], predicate);
    if (child) {
      return child;
    }
  }

  return null;
}

function createFakeElement(tagName) {
  return {
    tagName,
    id: "",
    type: "",
    className: "",
    textContent: "",
    disabled: false,
    dataset: {},
    attributes: {},
    children: [],
    eventHandlers: {},
    classList: {
      add() {},
      remove() {}
    },
    append(...children) {
      this.children.push(...children);
    },
    appendChild(child) {
      this.children.push(child);
    },
    setAttribute(name, value) {
      this.attributes[name] = value;
    },
    addEventListener(type, handler) {
      this.eventHandlers[type] = handler;
    },
    remove() {
      this.removed = true;
    },
    focus() {
      this.focused = true;
    },
    querySelector(selector) {
      if (selector === "button:not(:disabled)") {
        return findInFakeDom(this.children, (node) => node.tagName === "button" && !node.disabled);
      }

      return null;
    }
  };
}

async function withFakeDriverPickerDom(callback) {
  const previousDocument = globalThis.document;
  const previousWindow = globalThis.window;
  const roots = [];
  const listeners = {};

  globalThis.document = {
    body: {
      append(node) {
        roots.push(node);
      }
    },
    createElement: createFakeElement,
    querySelectorAll(selector) {
      if (selector === "[data-ai-driver-vehicle-picker]") {
        return roots.filter((node) => node.dataset?.aiDriverVehiclePicker === "true");
      }

      return [];
    },
    addEventListener(type, handler) {
      listeners[type] = handler;
    },
    removeEventListener(type) {
      delete listeners[type];
    }
  };
  globalThis.window = {
    location: { pathname: "/hlaseni-ridicu" },
    setTimeout() {
      return 1;
    },
    clearTimeout() {},
    dispatchEvent() {},
    CustomEvent: class CustomEvent {
      constructor(type, init = {}) {
        this.type = type;
        this.detail = init.detail;
      }
    }
  };

  try {
    await callback({
      roots,
      find: (predicate) => findInFakeDom(roots, predicate)
    });
  } finally {
    globalThis.document = previousDocument;
    globalThis.window = previousWindow;
  }
}

{
  const result = driverVehicleCandidateMatches(vehicles, {
    strictDriverAssignment: true,
    driverIds: ["employee-radim", "user-radim"]
  }, radimUser);

  assert.equal(result.fallbackUsed, false);
  assert.equal(result.lookupReason, "driver_id");
  assert.deepEqual(result.matches.map((vehicle) => vehicle.id).sort(), ["vehicle-radim-1", "vehicle-radim-2"]);
}

{
  const result = driverVehicleCandidateMatches(vehicles, {
    strictDriverAssignment: true,
    driverIds: ["employee-without-vehicles"]
  }, { id: "user-without-vehicles", name: "Bez Vozidel" });

  assert.equal(result.lookupReason, "strict_driver_id_no_match");
  assert.deepEqual(result.matches, []);
}

{
  const result = driverVehicleCandidateMatches(vehicles, {
    strictDriverAssignment: true,
    driverIds: ["employee-radim"]
  }, { ...radimUser, name: "Radim Opluštil" });

  assert.deepEqual(result.matches.map((vehicle) => vehicle.id).sort(), ["vehicle-radim-1", "vehicle-radim-2"]);
  assert.equal(result.matches.some((vehicle) => vehicle.id === "vehicle-other"), false);
}

{
  const result = driverVehicleCandidateMatches(vehicles, {
    strictDriverAssignment: true
  }, { id: "user-unmapped", name: "Radim Opluštil", phone: "731 000 000" });

  assert.deepEqual(result.matches, []);
  assert.equal(result.fallbackUsed, false);
}

{
  assert.equal(fleetPayloadUsesMockData({ provider: "local_mock", source: "Lokální mock T-Cars" }), true);
  assert.equal(shouldBlockFleetPayloadForDriverReports({ APP_ENV: "production" }, { provider: "local_mock" }), true);
  assert.equal(shouldBlockFleetPayloadForDriverReports({ APP_ENV: "development" }, { provider: "local_mock" }), false);
}

{
  const assignedMatch = {
    candidates: [
      { id: "vehicle-radim-1", licensePlate: "1A1 1111" }
    ]
  };
  const validation = { exact: true };

  assert.equal(driverPartRequestNeedsManualVehicleReview(assignedMatch, "1A1 1111", validation), false);
  assert.equal(driverPartRequestNeedsManualVehicleReview(assignedMatch, "3A4 1234", validation), true);
  assert.equal(driverPartRequestSourceHasManualVehicleReview("voice_manual_vehicle_review"), true);
  assert.equal(driverPartRequestSourceHasManualVehicleReview("voice"), false);
}

{
  const tools = createElevenLabsClientTools({
    requestJson: async () => ({
      ok: true,
      module: "hlaseni-ridicu",
      userName: "Radim",
      userResolved: true,
      employeeResolved: true,
      driverResolved: false,
      vehiclesVerified: false,
      vehicles: [
        { id: "fake", displayName: "Nesmí být řečeno", licensePlate: "5A4 8912" }
      ],
      vehiclesCount: 1,
      vehicleLookupMode: "picker_or_manual",
      messageForAssistant: "Nemám teď bezpečně ověřený seznam tvých vozidel. Otevřu ti výběr v aplikaci.",
      apiStatus: "ready"
    })
  });
  const result = await tools.get_driver_report_context({ sessionId: "voice-radim" });

  assert.equal(result.ok, true);
  assert.equal(result.vehiclesVerified, false);
  assert.deepEqual(result.vehicles, []);
  assert.equal(result.reason, NO_VERIFIED_ASSIGNED_VEHICLES_REASON);
  assert.equal(result.assistantMessage, UNVERIFIED_VEHICLE_MESSAGE);
  assert.equal(result.answerText, UNVERIFIED_VEHICLE_MESSAGE);
  assert.equal(result.answerText.includes("Nesmí být řečeno"), false);
  assert.equal(result.answerText.includes("5A4 8912"), false);
  assert.equal(result.vehicleOrdinalSelectionAllowed, false);
}

for (const [name, payload] of [
  ["empty object", {}],
  ["generic string", "Tool called successfully."],
  ["generic message", { ok: true, message: "Tool called successfully." }],
  ["explicitly unverified", { ok: true, vehiclesVerified: false, vehicles: [] }]
]) {
  const tools = createElevenLabsClientTools({
    requestJson: async () => payload
  });
  const result = await tools.get_driver_report_context({ sessionId: `voice-radim-${name}` });

  assert.equal(result.ok, true, name);
  assert.equal(result.vehiclesVerified, false, name);
  assert.deepEqual(result.vehicles, [], name);
  assert.equal(result.reason, NO_VERIFIED_ASSIGNED_VEHICLES_REASON, name);
  assert.equal(result.assistantMessage, UNVERIFIED_VEHICLE_MESSAGE, name);
  assert.equal(result.answerText, UNVERIFIED_VEHICLE_MESSAGE, name);
  assert.equal(result.answerText.includes("Ford Transit"), false, name);
  assert.equal(result.answerText.includes("5A4 8921"), false, name);
  assert.equal(result.answerText.includes("1A2 3456"), false, name);
}

{
  const tools = createElevenLabsClientTools({
    requestJson: async () => ({
      ok: true,
      module: "hlaseni-ridicu",
      userName: "Radim",
      userResolved: true,
      employeeResolved: true,
      driverResolved: true,
      vehiclesVerified: true,
      vehiclePickerAvailable: true,
      vehicles: [
        safeVoiceVehicle("vehicle-radim-1", "Mercedes Atego", "1A1 1111"),
        safeVoiceVehicle("vehicle-radim-2", "Mercedes Sprinter", "2A2 2222")
      ],
      vehiclesCount: 2,
      vehicleLookupMode: "verified_vehicle_list",
      assistantMessage: "Backend věta se nesmí slepě přebírat, pokud by obsahovala VIN WDB12345678901234.",
      messageForAssistant: "Máš pod sebou Mercedes Atego, SPZ 1A1 1111, Mercedes Sprinter, SPZ 2A2 2222. Kterého vozidla se závada týká?",
      apiStatus: "ready"
    })
  });
  const result = await tools.get_driver_report_context({ sessionId: "voice-radim-verified" });

  assert.equal(result.ok, true);
  assert.equal(result.vehiclesVerified, true);
  assert.equal(result.vehiclePickerAvailable, true);
  assert.equal(result.vehiclesCount, 2);
  assert.equal(result.vehicles.length, 2);
  assert.equal(result.vehicleOrdinalSelectionAllowed, true);
  assert.match(result.answerText, /Mercedes Atego/);
  assert.match(result.answerText, /SPZ 1A1 1111/);
  assert.match(result.answerText, /Mercedes Sprinter/);
  assert.match(result.answerText, /SPZ 2A2 2222/);
  assert.match(result.answerText, /Kterého se závada týká/);
  assert.equal(result.assistantMessage, result.answerText);
  assert.equal(result.answerText.includes("WDB12345678901234"), false);
  assert.equal(result.answerText.includes(["Mercedes Sprinter", "SPZ", "5A4 8912"].join(" ")), false);
}

{
  const tools = createElevenLabsClientTools({
    requestJson: async () => ({
      ok: true,
      module: "hlaseni-ridicu",
      userName: "Radim",
      userResolved: true,
      employeeResolved: true,
      driverResolved: true,
      vehiclesVerified: true,
      vehiclePickerAvailable: true,
      vehicles: [
        safeVoiceVehicle("vehicle-radim-1", "Mercedes Atego", "1A1 1111"),
        safeVoiceVehicle("vehicle-radim-2", "Mercedes Sprinter", "2A2 2222"),
        safeVoiceVehicle("vehicle-radim-3", "Mercedes Econic", "3A3 3333"),
        safeVoiceVehicle("vehicle-radim-4", "Mercedes Arocs", "4A4 4444")
      ],
      vehiclesCount: 4,
      vehicleLookupMode: "verified_picker_recommended",
      apiStatus: "ready"
    })
  });
  const result = await tools.get_driver_report_context({ sessionId: "voice-radim-many" });

  assert.equal(result.ok, true);
  assert.equal(result.vehiclesVerified, true);
  assert.equal(result.vehiclesCount, 4);
  assert.equal(result.vehicles.length, 4);
  assert.match(result.answerText, /Mercedes Atego/);
  assert.match(result.answerText, /SPZ 1A1 1111/);
  assert.match(result.answerText, /Mercedes Sprinter/);
  assert.match(result.answerText, /SPZ 2A2 2222/);
  assert.match(result.answerText, /Mercedes Econic/);
  assert.match(result.answerText, /SPZ 3A3 3333/);
  assert.match(result.answerText, /Mercedes Arocs/);
  assert.match(result.answerText, /SPZ 4A4 4444/);
  assert.equal(result.answerText.includes("VIN"), false);
  assert.equal(result.assistantMessage, result.answerText);
  assert.equal(result.vehicleOrdinalSelectionAllowed, true);
}

{
  const previousConsoleError = console.error;
  const errors = [];
  console.error = (...args) => errors.push(args);
  try {
    const tools = createElevenLabsClientTools({
      requestJson: async () => ({
        ok: true,
        module: "hlaseni-ridicu",
        userName: "Radim",
        userResolved: true,
        employeeResolved: true,
        driverResolved: true,
        vehiclesVerified: true,
        vehiclePickerAvailable: true,
        vehicles: [
          {
            ...safeVoiceVehicle("demo-vehicle", "Demo Mercedes", "9Z9 9999"),
            source: "local_mock"
          }
        ],
        vehiclesCount: 1,
        apiStatus: "ready"
      })
    });
    const result = await tools.get_driver_report_context({ sessionId: "voice-radim-demo" });

    assert.equal(result.ok, true);
    assert.equal(result.vehiclesVerified, false);
    assert.deepEqual(result.vehicles, []);
    assert.equal(result.assistantMessage, UNVERIFIED_VEHICLE_MESSAGE);
    assert.equal(result.answerText.includes("Demo Mercedes"), false);
    assert.equal(result.answerText.includes("9Z9 9999"), false);
    assert.equal(errors.some((entry) => String(entry[0]).includes("driver_reports.client_unsafe_vehicle_list_blocked")), true);
  } finally {
    console.error = previousConsoleError;
  }
}

{
  let posted = false;
  const tools = createElevenLabsClientTools({
    requestJson: async () => {
      posted = true;
      throw new Error("create_driver_part_request must not post without vehicle selection");
    }
  });
  const result = await tools.create_driver_part_request({
    defectDescription: "upadnuté zrcátko",
    confirmed: true
  });

  assert.equal(posted, false);
  assert.equal(result.ok, false);
  assert.equal(result.status, "needs_input");
  assert.equal(result.code, "VEHICLE_SPZ_REQUIRED");
  assert.equal(result.message, "Potřebuji vybrat vozidlo v aplikaci, nebo mi řekni značku, typ nebo SPZ vozidla.");
}

{
  await withFakeDriverPickerDom(async ({ find }) => {
    const tools = createElevenLabsClientTools({
      requestJson: async () => ({
        ok: true,
        module: "hlaseni-ridicu",
        userName: "Radim",
        userResolved: true,
        employeeResolved: true,
        driverResolved: true,
        vehiclesVerified: true,
        vehiclePickerAvailable: true,
        vehicles: [
          safeVoiceVehicle("vehicle-radim-1", "Utajený vůz", "1A1 1111")
        ],
        vehiclesCount: 1,
        apiStatus: "ready"
      })
    });

    const opened = await tools.show_driver_vehicle_picker({ sessionId: "picker-open-test" });
    assert.equal(opened.ok, true);
    assert.equal(opened.status, "picker_opened");
    assert.equal(opened.pickerOpened, true);
    assert.deepEqual(opened.vehicles, []);
    assert.equal(opened.toolDiagnostics.includes("Tool called: show_driver_vehicle_picker"), true);
    assert.equal(opened.toolDiagnostics.includes("Tool succeeded: show_driver_vehicle_picker"), true);

    const pending = await tools.get_driver_vehicle_picker_selection({ sessionId: "picker-open-test" });
    assert.equal(pending.ok, false);
    assert.equal(pending.status, "needs_input");
    assert.equal(pending.answerText, "Potřebuji vybrat vozidlo v aplikaci, nebo mi řekni značku, typ nebo SPZ vozidla.");

    const option = find((node) => node.className === "ai-driver-vehicle-picker__option" && !node.disabled);
    assert.ok(option);
    option.eventHandlers.click();

    const selected = await tools.get_driver_vehicle_picker_selection({ sessionId: "picker-open-test" });
    assert.equal(selected.ok, true);
    assert.equal(selected.status, "selected");
    assert.equal(selected.vehicleId, "vehicle-radim-1");
    assert.deepEqual(selected.vehicles, []);
  });
}

{
  const tools = createElevenLabsClientTools();
  const result = await tools.get_driver_vehicle_picker_selection({ sessionId: "no-current-picker" });

  assert.equal(result.ok, false);
  assert.equal(result.errorCode, "VEHICLE_SPZ_REQUIRED");
  assert.equal(result.answerText, "Potřebuji vybrat vozidlo v aplikaci, nebo mi řekni značku, typ nebo SPZ vozidla.");
}

{
  const tools = createElevenLabsClientTools();
  const result = await tools.highlight_element({
    selector: "[data-driver-report-vehicle]",
    message: "Toto vozidlo"
  });

  assert.equal(result.ok, false);
  assert.equal(result.errorCode, "DRIVER_VEHICLE_PICKER_REQUIRED");
  assert.deepEqual(result.vehicles, []);
  assert.equal(result.message.includes("značku, typ nebo SPZ"), true);
}

console.log("driver-report-context tests passed");
