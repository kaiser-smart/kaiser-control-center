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
import { SARLOTA_DRIVER_REPORT_EL_PROMPT_RULE } from "../src/sarlota/sarlotaSystemPrompt.js";

const UNVERIFIED_VEHICLE_MESSAGE = "Nevidím bezpečně přiřazené vozidlo. Nadiktuj mi prosím SPZ.";
const VEHICLE_QUESTION_PHRASES = [
  "Jaký tam jsou vozidla?",
  "Jaký tam mám?",
  "Ty tam vidíš co?",
  "Který vozidla mám přiřazený?"
];
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
  const result = driverVehicleCandidateMatches([
    {
      id: "vistos-radim-1",
      licensePlate: "2BB 8251",
      model: "Mercedes CLS",
      assignedDriverId: "",
      assignedDriverName: "Radim Opluštil",
      status: "active"
    },
    {
      id: "vistos-radim-2",
      licensePlate: "EL324CD",
      model: "Mercedes EQS",
      assignedDriverId: "",
      assignedDriverName: "Radim Opluštil",
      status: "active"
    },
    {
      id: "conflicting-id",
      licensePlate: "9ZZ 9999",
      model: "Cizí vozidlo",
      assignedDriverId: "employee-other",
      assignedDriverName: "Radim Opluštil",
      status: "active"
    }
  ], {
    strictDriverAssignment: true,
    driverIds: ["radim-oplustil"],
    driverName: "Radim Opluštil",
    verifiedDriverNameAssignment: true
  }, { id: "radim-oplustil", name: "Radim Opluštil" });

  assert.equal(result.lookupReason, "verified_driver_name");
  assert.equal(result.fallbackUsed, false);
  assert.deepEqual(result.matches.map((vehicle) => vehicle.id).sort(), ["vistos-radim-1", "vistos-radim-2"]);
}

{
  const result = driverVehicleCandidateMatches([
    {
      id: "name-only-untrusted",
      licensePlate: "2BB 8251",
      model: "Mercedes CLS",
      assignedDriverId: "",
      assignedDriverName: "Radim Opluštil",
      status: "active"
    }
  ], {
    strictDriverAssignment: true,
    driverIds: ["radim-oplustil"],
    driverName: "Radim Opluštil"
  }, { id: "radim-oplustil", name: "Radim Opluštil" });

  assert.equal(result.lookupReason, "strict_driver_id_no_match");
  assert.deepEqual(result.matches, []);
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
      messageForAssistant: UNVERIFIED_VEHICLE_MESSAGE,
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
      messageForAssistant: "Vidím u tebe Mercedes Atego SPZ 1A1 1111 a Mercedes Sprinter SPZ 2A2 2222. Kterého se závada týká?",
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
  assert.match(result.answerText, /Kterého se závada týká/);
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
      vehicleLookupMode: "verified_vehicle_list",
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
  for (const phrase of VEHICLE_QUESTION_PHRASES) {
    let requestedPath = "";
    const tools = createElevenLabsClientTools({
      requestJson: async (path) => {
        requestedPath = path;
        return {
          ok: true,
          module: "hlaseni-ridicu",
          userName: "Radim",
          userResolved: true,
          employeeResolved: true,
          driverResolved: true,
          vehiclesVerified: true,
          vehiclePickerAvailable: true,
          vehicles: [
            safeVoiceVehicle("vehicle-radim-1", "Avia", "3AB 1234"),
            safeVoiceVehicle("vehicle-radim-2", "MAN", "4BC 5678")
          ],
          vehiclesCount: 2,
          vehicleLookupMode: "verified_vehicle_list",
          apiStatus: "ready"
        };
      }
    });

    const result = await tools.get_driver_report_context({
      sessionId: `vehicle-question-${VEHICLE_QUESTION_PHRASES.indexOf(phrase)}`,
      transcriptIntent: phrase
    });
    const requestedUrl = new URL(requestedPath, "https://kso.test");

    assert.match(requestedPath, /\/api\/ai\/driver-reports\/context/);
    assert.equal(requestedUrl.searchParams.get("transcriptIntent"), phrase);
    assert.equal(result.vehiclesVerified, true);
    assert.equal(result.vehiclesCount, 2);
    assert.match(result.answerText, /Avia/);
    assert.match(result.answerText, /SPZ 3AB 1234/);
    assert.match(result.answerText, /MAN/);
    assert.match(result.answerText, /SPZ 4BC 5678/);
    assert.match(result.answerText, /Kterého se závada týká/);
    assert.equal(result.assistantMessage, result.answerText);
    assert.equal(result.answerText.includes("VIN"), false);
  }
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
    assert.equal(selected.nextTool, "create_driver_part_request");
    assert.equal(selected.nextAction, "call_create_driver_part_request");
    assert.equal(selected.createDriverPartRequestParameters.vehicleId, "vehicle-radim-1");
    assert.deepEqual(selected.vehicles, []);
  });
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

    const opened = await tools.show_driver_vehicle_picker({ sessionId: "picker-session-a" });
    assert.equal(opened.ok, true);
    const option = find((node) => node.className === "ai-driver-vehicle-picker__option" && !node.disabled);
    assert.ok(option);
    option.eventHandlers.click();

    const selectedWithoutSession = await tools.get_driver_vehicle_picker_selection({});
    assert.equal(selectedWithoutSession.ok, true);
    assert.equal(selectedWithoutSession.status, "selected");
    assert.equal(selectedWithoutSession.vehicleId, "vehicle-radim-1");

    const selectedWithDifferentSession = await tools.get_driver_vehicle_picker_selection({ sessionId: "picker-session-b" });
    assert.equal(selectedWithDifferentSession.ok, true);
    assert.equal(selectedWithDifferentSession.status, "selected");
    assert.equal(selectedWithDifferentSession.vehicleId, "vehicle-radim-1");

    const reopened = await tools.show_driver_vehicle_picker({ sessionId: "picker-session-new" });
    assert.equal(reopened.ok, true);
    const stale = await tools.get_driver_vehicle_picker_selection({});
    assert.equal(stale.ok, false);
    assert.equal(stale.status, "needs_input");
    assert.notEqual(stale.vehicleId, "vehicle-radim-1");
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
  let requested = false;
  const tools = createElevenLabsClientTools({
    requestJson: async () => {
      requested = true;
      throw new Error("validate_driver_vehicle_spz must not call backend for partial SPZ fragments");
    }
  });
  const result = await tools.validate_driver_vehicle_spz({ spz: "CCD" });

  assert.equal(requested, false);
  assert.equal(result.ok, false);
  assert.equal(result.errorCode, "SPZ_INCOMPLETE");
  assert.equal(result.spzValidated, false);
  assert.equal(result.existsInFleet, false);
  assert.equal(result.vehiclePickerAvailable, true);
  assert.equal(result.answerText, "Tohle není úplná SPZ. Nadiktuj mi prosím celou SPZ, nebo ti otevřu výběr vozidla v aplikaci.");
}

{
  await withFakeDriverPickerDom(async ({ find }) => {
    const posts = [];
    const tools = createElevenLabsClientTools({
      confirm: async () => true,
      requestJson: async (path, options = {}) => {
        if ((options.method || "GET") === "GET" && path.startsWith("/api/ai/driver-reports/context")) {
          return {
            ok: true,
            module: "hlaseni-ridicu",
            userName: "Radim",
            userResolved: true,
            employeeResolved: true,
            driverResolved: true,
            vehiclesVerified: true,
            vehiclePickerAvailable: true,
            vehicles: [
              safeVoiceVehicle("vehicle-radim-1", "Svoz 1", "1A1 1111")
            ],
            vehiclesCount: 1,
            apiStatus: "ready"
          };
        }

        if ((options.method || "GET") === "POST" && path === "/api/voice/sarlota") {
          const payload = JSON.parse(options.body || "{}");
          posts.push(payload);

          if (posts.length === 1) {
            return {
              ok: true,
              status: "needs_confirmation",
              verified: true,
              message: "Potvrď to prosím v aplikaci.",
              preparedActions: [
                {
                  type: "driver_part_request",
                  confirmationId: "driver-part-confirm-safe",
                  parameters: {
                    vehicleId: "vehicle-radim-1",
                    defectDescription: "poškozené přední sklo",
                    licensePlate: "1A1 1111"
                  }
                }
              ]
            };
          }

          return {
            ok: true,
            status: "created",
            verified: true,
            reply: "Hotovo. Hlášení jsem zapsala a předala k objednání dílu.",
            driverPartRequest: {
              id: "driver-part-1",
              reportId: "ND-TEST-1",
              status: "handed_to_ordering",
              licensePlate: "1A1 1111",
              probablePart: "přední sklo"
            },
            notificationsSent: true
          };
        }

        throw new Error(`Unexpected request ${options.method || "GET"} ${path}`);
      }
    });

    const opened = await tools.show_driver_vehicle_picker({ sessionId: "picker-write-test" });
    assert.equal(opened.ok, true);
    const option = find((node) => node.className === "ai-driver-vehicle-picker__option" && !node.disabled);
    assert.ok(option);
    option.eventHandlers.click();

    const selected = await tools.get_driver_vehicle_picker_selection({ sessionId: "picker-write-test" });
    assert.equal(selected.ok, true);
    assert.equal(selected.vehicleId, "vehicle-radim-1");

    const result = await tools.create_driver_part_request({
      sessionId: "picker-write-test",
      defectDescription: "poškozené přední sklo",
      confirmed: true,
      spokenSummary: "Zapíšu závadu poškozené přední sklo k vybranému vozidlu."
    });

    assert.equal(result.ok, true);
    assert.equal(result.status, "created");
    assert.equal(result.driverPartRequest.reportId, "ND-TEST-1");
    assert.equal(posts.length, 2);
    assert.equal(posts[0].parameters.vehicleId, "vehicle-radim-1");
    assert.equal(posts[0].parameters.licensePlate, "1A1 1111");
    assert.equal(posts[0].parameters.spzValidated, true);
    assert.equal(posts[1].parameters.confirmed, true);
    assert.equal(posts[1].parameters.vehicleId, "vehicle-radim-1");
    assert.equal(posts[1].parameters.licensePlate, "1A1 1111");
    assert.equal(posts[1].parameters.confirmationSource, "kso-ui");
    assert.equal(posts[1].parameters.confirmation_source, "kso-ui");
    assert.equal(posts[1].parameters.confirmationId, "driver-part-confirm-safe");
    assert.equal(posts[1].parameters.confirmation_id, "driver-part-confirm-safe");
    assert.equal(posts[1].context.confirmationSource, "kso-ui");
    assert.equal(posts[1].context.confirmationId, "driver-part-confirm-safe");
  });
}

{
  const tools = createElevenLabsClientTools({
    confirm: async () => true,
    requestJson: async (path, options = {}) => {
      assert.equal(path, "/api/voice/sarlota");
      const payload = JSON.parse(options.body || "{}");

      if (payload.parameters.confirmed !== true) {
        return {
          ok: true,
          status: "needs_confirmation",
          verified: true,
          message: "Potvrď to prosím v aplikaci.",
          preparedActions: [
            {
              type: "driver_part_request",
              confirmationId: "driver-part-confirm-no-report-id",
              parameters: {
                vehicleId: "vehicle-radim-1",
                defectDescription: "poškozené přední sklo"
              }
            }
          ]
        };
      }

      return {
        ok: true,
        status: "created",
        verified: true,
        message: "Hotovo.",
        driverPartRequest: {
          id: "driver-part-missing-report-id",
          status: "handed_to_ordering"
        },
        notificationsSent: true
      };
    }
  });

  const result = await tools.create_driver_part_request({
    vehicleId: "vehicle-radim-1",
    defectDescription: "poškozené přední sklo",
    confirmed: true
  });

  assert.equal(result.ok, false);
  assert.equal(result.status, "write_unverified");
  assert.equal(result.code, "driver_part_report_id_missing");
  assert.equal(result.answerText, "Backend nepotvrdil číslo hlášení. Nic nepotvrzuju jako zapsané.");
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

{
  for (const phrase of VEHICLE_QUESTION_PHRASES) {
    assert.equal(SARLOTA_DRIVER_REPORT_EL_PROMPT_RULE.includes(phrase), true);
  }
  assert.match(SARLOTA_DRIVER_REPORT_EL_PROMPT_RULE, /vždy nejdřív zavolej get_driver_report_context/);
  assert.match(SARLOTA_DRIVER_REPORT_EL_PROMPT_RULE, /show_driver_vehicle_picker nesmí být první krok/);
  assert.match(SARLOTA_DRIVER_REPORT_EL_PROMPT_RULE, /Pokud get_driver_report_context selže/);
  assert.match(SARLOTA_DRIVER_REPORT_EL_PROMPT_RULE, /hned zavolej show_driver_vehicle_picker/);
  assert.match(SARLOTA_DRIVER_REPORT_EL_PROMPT_RULE, /Pokud řekne jen fragment SPZ/);
  assert.match(SARLOTA_DRIVER_REPORT_EL_PROMPT_RULE, /Nikdy neříkej VIN/);
  assert.match(SARLOTA_DRIVER_REPORT_EL_PROMPT_RULE, /Nevidím bezpečně přiřazené vozidlo\. Nadiktuj mi prosím SPZ\./);
}

console.log("driver-report-context tests passed");
