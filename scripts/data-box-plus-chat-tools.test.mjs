import assert from "node:assert/strict";
import { executeDataBoxPlusChatReadTool } from "../functions/_lib/data-box-plus-store.js";

const currentUser = {
  id: "radim-oplustil",
  name: "Radim Opluštil",
  email: "oplustil@kaiserservis.cz",
  role: "admin",
  active: true,
  status: "active"
};
const chatContext = {
  currentUser,
  application: {
    name: "Kaiser Smart",
    purpose: "Interní operační aplikace.",
    modules: [{
      id: "fleet",
      title: "Vozidla",
      route: "/vozovy-park",
      permittedActions: ["view"]
    }]
  }
};
const env = {
  APP_ENV: "test",
  SARLOTA_DRIVER_REPORTS_TEST_FLEET_JSON: JSON.stringify({
    provider: "fleet-test",
    source: "Fleet test master",
    apiStatus: "ready",
    driverCandidates: [{ id: "employee-radim", userId: "radim-oplustil", name: "Radim Opluštil" }],
    vehicles: [
      { id: "vehicle-1", internalNumber: "KS 101", licensePlate: "1AB 0101", assignedDriverName: "Radim Opluštil", status: "active" },
      { id: "vehicle-2", internalNumber: "KS 204", licensePlate: "2AB 0204", assignedDriverName: "Radim Opluštil", status: "active" },
      { id: "vehicle-3", internalNumber: "KS 305", licensePlate: "3AB 0305", assignedDriverName: "Petr Lichtenberg", status: "active" }
    ]
  })
};

const profile = await executeDataBoxPlusChatReadTool(env, currentUser, chatContext, {
  name: "get_current_user_profile",
  arguments: {}
});
assert.equal(profile.verified, true);
assert.equal(profile.user.name, "Radim Opluštil");
assert.equal(profile.user.email, "oplustil@kaiserservis.cz");

const vehicles = await executeDataBoxPlusChatReadTool(env, currentUser, chatContext, {
  name: "search_fleet_vehicles_by_driver",
  arguments: { driverName: "Opluštil" }
});
assert.equal(vehicles.ok, true);
assert.equal(vehicles.verified, true);
assert.equal(vehicles.readOnly, true);
assert.equal(vehicles.count, 2);
assert.deepEqual(vehicles.vehicles.map((vehicle) => vehicle.licensePlate), ["1AB 0101", "2AB 0204"]);
assert.ok(vehicles.vehicles.every((vehicle) => vehicle.assignedDriverName === "Radim Opluštil"));

const selfVehicles = await executeDataBoxPlusChatReadTool(env, currentUser, chatContext, {
  name: "search_fleet_vehicles_by_driver",
  arguments: { driverName: "moje" }
});
assert.equal(selfVehicles.driverName, "Radim Opluštil");
assert.equal(selfVehicles.count, 2);

const denied = await executeDataBoxPlusChatReadTool(env, currentUser, {
  ...chatContext,
  application: { ...chatContext.application, modules: [] }
}, {
  name: "search_fleet_vehicles_by_driver",
  arguments: { driverName: "Opluštil" }
});
assert.equal(denied.ok, false);
assert.equal(denied.verified, false);
assert.equal(denied.errorCode, "fleet_permission_denied");

const ambiguousEnv = {
  ...env,
  SARLOTA_DRIVER_REPORTS_TEST_FLEET_JSON: JSON.stringify({
    provider: "fleet-test",
    source: "Fleet test master",
    apiStatus: "ready",
    driverCandidates: [
      { id: "employee-radim", userId: "radim-oplustil", name: "Radim Opluštil", department: "Vedení" },
      { id: "employee-jan", userId: "jan-oplustil", name: "Jan Opluštil", department: "Provoz" }
    ],
    vehicles: [
      { id: "vehicle-1", internalNumber: "KS 101", licensePlate: "1AB 0101", assignedDriverName: "Radim Opluštil", status: "active" },
      { id: "vehicle-2", internalNumber: "KS 204", licensePlate: "2AB 0204", assignedDriverName: "Jan Opluštil", status: "active" }
    ]
  })
};
const ambiguous = await executeDataBoxPlusChatReadTool(ambiguousEnv, currentUser, chatContext, {
  name: "search_fleet_vehicles_by_driver",
  arguments: { driverName: "Opluštil" }
});
assert.equal(ambiguous.ok, true);
assert.equal(ambiguous.verified, true);
assert.equal(ambiguous.ambiguous, true);
assert.equal(ambiguous.candidates.length, 2);
assert.equal(ambiguous.vehicles.length, 0);

console.log("data-box-plus chat read tools ok");
