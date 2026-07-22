import assert from "node:assert/strict";

import { __test as vistosTest } from "../functions/_lib/fleet-vistos-vehicle-preview.js";
import { extractVistosRecord, getVistosById } from "../functions/_lib/vistos-execute-client.js";
import {
  __test as hereTest,
  buildCollectionRouteHereProblem
} from "../functions/_lib/collection-route-here-optimization.js";

const schema = {
  ok: true,
  source: "GetSchemaEntity",
  columns: vistosTest.FLEET_VISTOS_VEHICLE_TECHNICAL_SPECS.map((spec) => ({
    columnName: spec.field === "fuelType" ? "FuelType_FK" : spec.aliases[0],
    caption: spec.label
  }))
};
const technicalFields = vistosTest.resolveVehicleTechnicalFields(schema);
const detailCalls = [];
const enriched = await vistosTest.enrichVistosVehicleRows(
  {},
  { cookieHeader: "read-only-test" },
  [
    { Id: "vehicle-100", Name: "Kouba", RegistrationPlate: "3BN 3558" },
    { Id: "vehicle-200", Name: "Florian", RegistrationPlate: "3BE 2831" }
  ],
  schema.columns.map((column) => column.columnName),
  {
    detailRegistrationPlates: ["3BN3558"],
    loadDetail: async (_env, _session, entityName, entityId, columns) => {
      detailCalls.push({ entityName, entityId, columns });
      return {
        row: {
          Id: entityId,
          c_EmptyWeightKg: "13 500",
          c_MaxPermittedWeightKg: "19 000",
          c_PayloadKg: "5 500",
          c_LengthMeters: "8,50",
          c_WidthMeters: "2,40",
          c_HeightMeters: "3,50",
          c_VehicleType_FK_RecordId: "18358",
          c_VehicleType_FK_Caption: "Pevný nákladní vůz",
          c_BodyType_FK_RecordId: "18378",
          c_BodyType_FK_Caption: "Popelář"
        },
        status: 200
      };
    }
  }
);
assert.equal(detailCalls.length, 1);
assert.equal(detailCalls[0].entityName, "Vehicle");
assert.equal(detailCalls[0].entityId, "vehicle-100");
assert.equal(enriched.diagnostics.requested, 1);
assert.equal(enriched.diagnostics.succeeded, 1);
assert.equal(enriched.rows[1].c_EmptyWeightKg, undefined);
const screenshotVehicle = vistosTest.mapVehicle(enriched.rows[0], { fields: {} }, technicalFields);
assert.equal(screenshotVehicle.technicalProfile.emptyWeightKg, 13500);
assert.equal(screenshotVehicle.technicalProfile.maxPermittedWeightKg, 19000);
assert.equal(screenshotVehicle.technicalProfile.payloadKg, 5500);
assert.deepEqual(screenshotVehicle.technicalProfile.dimensionsCm, { length: 850, width: 240, height: 350 });
assert.equal(screenshotVehicle.technicalProfile.vehicleType.caption, "Pevný nákladní vůz");
assert.equal(screenshotVehicle.technicalProfile.bodyType.caption, "Popelář");
assert.ok(screenshotVehicle.technicalProfile.blockers.includes("chybí potvrzené zatížení nápravy nebo skupiny náprav"));

assert.deepEqual(extractVistosRecord({
  status: "OK",
  data: { data: { Id: "vehicle-100", c_EmptyWeightKg: "13 500" } }
}), { Id: "vehicle-100", c_EmptyWeightKg: "13 500" });

const originalFetch = globalThis.fetch;
let detailRequest = null;
try {
  globalThis.fetch = async (url, init = {}) => {
    detailRequest = { url: String(url), init, body: JSON.parse(init.body) };
    return new Response(JSON.stringify({
      status: "OK",
      data: { data: { Id: 100, c_EmptyWeightKg: "13 500" } }
    }), { status: 200, headers: { "content-type": "application/json" } });
  };
  const detail = await getVistosById(
    { VISTOS_API_BASE_URL: "https://example.test" },
    { cookieHeader: "VistosAccessToken=read-only-test" },
    "Vehicle",
    "100",
    ["Id", "c_EmptyWeightKg"]
  );
  assert.deepEqual(detail.row, { Id: 100, c_EmptyWeightKg: "13 500" });
  assert.ok(detailRequest.url.endsWith("/API/VistosAPI/Execute?GetByIdParam"));
  assert.equal(detailRequest.init.headers.Cookie, "VistosAccessToken=read-only-test");
  assert.deepEqual(detailRequest.body.GetByIdParam, {
    EntityName: "Vehicle",
    EntityId: 100,
    MethodMode: "HeaderColumns",
    ColNameToRead: ["Id", "c_EmptyWeightKg"]
  });
} finally {
  globalThis.fetch = originalFetch;
}

const vehicle = vistosTest.mapVehicle({
  Id: "vehicle-100",
  Name: "Popelář A",
  RegistrationPlate: "3BN 3558",
  VIN: "WDB12345678901234",
  c_EmptyWeightKg: "13.500",
  c_MaxPermittedWeightKg: "19.000",
  c_PayloadKg: "5.500",
  c_LengthMeters: "8,50",
  c_WidthMeters: "2,40",
  c_HeightMeters: "3,50",
  c_AxleCount_FK_RecordId: "18344",
  c_AxleCount_FK_Caption: "2",
  c_AxleConfiguration_FK_RecordId: "18349",
  c_AxleConfiguration_FK_Caption: "4x2",
  c_MaxSingleAxleLoad: "7,0 t",
  c_SingleAxleGroupLoadT: "7",
  c_TandemAxleGroupLoadT: "11,5",
  c_TridemAxleGroupLoadT: "16",
  c_VehicleType_FK_RecordId: "18358",
  c_VehicleType_FK_Caption: "Pevný nákladní vůz",
  c_TrailerCount_FK_RecordId: "18360",
  c_TrailerCount_FK_Caption: "0",
  FuelType_FK_RecordId: "18363",
  FuelType_FK_Caption: "Nafta",
  c_EuroEmissionStandard_FK_RecordId: "18372",
  c_EuroEmissionStandard_FK_Caption: "Euro 7",
  c_BodyType_FK_RecordId: "18378",
  c_BodyType_FK_Caption: "Popelář",
  c_UsableBodyVolumeM3: "16,50",
  c_AdditionalEquipment_FK_Caption: "Hydraulická ruka; Váha",
  c_SupportedContainerSizes_FK_Caption: "120 l; 240 l; 1100 l",
  DepoAddressRuian: "582786",
  DepoAddressStreet: "Trnkova 3052/137",
  DepoAddressCity: "Brno",
  DepoAddressCountry_FK_Caption: "Česká republika",
  DepoAddressPostalCode: "628 00",
  DepoAddressGps_Lat: "49.191259",
  DepoAddressGps_Long: "16.670212"
}, { fields: {} }, technicalFields);

assert.equal(vehicle.technicalProfile.status, "ready");
assert.equal(vehicle.technicalProfile.emptyWeightKg, 13500);
assert.equal(vehicle.technicalProfile.dimensionsCm.length, 850);
assert.equal(vehicle.technicalProfile.maxSingleAxleLoadKg, 7000);
assert.deepEqual(vehicle.technicalProfile.axleGroupLoadsKg, { single: 7000, tandem: 11500, triple: 16000 });
assert.equal(vehicle.technicalProfile.fuelType.caption, "Nafta");
assert.deepEqual(vehicle.technicalProfile.additionalEquipment.captions, ["Hydraulická ruka", "Váha"]);
assert.deepEqual(vehicle.homeDepot.gps, { lat: 49.191259, lng: 16.670212 });
assert.equal(vehicle.hereNavigation.options.weightPerAxle, undefined);
assert.deepEqual(vehicle.hereNavigation.options.weightPerAxleGroup, { single: 7000, tandem: 11500, triple: 16000 });
assert.equal(vistosTest.parseAxleLoadKg("Přední 7 000 kg, zadní 11 500 kg"), null);

const baseConfig = {
  vehicleTechnicalSource: "vistos-vehicle",
  useVistosHomeDepot: true,
  timezone: "Europe/Prague",
  trafficMode: "liveOrHistorical",
  shift: { start: "06:00", end: "16:00" },
  requiredVehicleCodes: ["A"],
  vehicles: [{
    code: "A",
    registration: "3BN 3558",
    capacitiesTons: { SKO: 5.5 }
  }],
  dumpSites: [{
    id: "sako-test",
    wasteTypes: ["SKO"],
    latitude: 49.1885,
    longitude: 16.6848,
    serviceMinutes: 12
  }]
};
const resolved = hereTest.resolveVistosVehicleTechnicalConfiguration(baseConfig, {
  apiStatus: "ready",
  loadedAt: "2026-07-22T06:00:00.000Z",
  vehicles: [vehicle]
}, "SKO");
assert.equal(resolved.source, "vistos-vehicle");
assert.equal(resolved.blockers.length, 0);
assert.equal(resolved.profiles[0].match, "registration-plate");
assert.equal(resolved.config.vehicles[0].truck.currentWeightKg, 19000);
assert.deepEqual(resolved.config.vehicles[0].truck.weightPerAxleGroup, { single: 7000, tandem: 11500, triple: 16000 });
assert.deepEqual(hereTest.configurationBlockers({ status: "ready", config: resolved.config }, "SKO"), []);

const problem = buildCollectionRouteHereProblem({
  ready: true,
  routeDate: "2026-07-22",
  wasteType: "SKO",
  eligibleCount: 0,
  _settings: { config: resolved.config },
  _stops: []
});
assert.deepEqual(problem.fleet.types[0].shifts[0].start.location, { lat: 49.191259, lng: 16.670212 });
assert.deepEqual(problem.fleet.profiles[0].options.weightPerAxleGroup, { single: 7000, tandem: 11500, triple: 16000 });
assert.equal(problem.fleet.profiles[0].options.weightPerAxle, undefined);

const unmatched = hereTest.resolveVistosVehicleTechnicalConfiguration(baseConfig, {
  apiStatus: "ready",
  vehicles: []
}, "SKO");
assert.ok(unmatched.blockers.some((item) => item.includes("nebyl bezpečně spárován")));

console.log("fleet Vistos HERE profile tests passed");
