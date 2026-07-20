import assert from "node:assert/strict";

import {
  parseTcarsTripsXml,
  verifiedTcarsFuelState
} from "../functions/_lib/tcars-client.js";

const trips = parseTcarsTripsXml(`<?xml version="1.0"?>
<Envelope><Body><knihaJizd>
  <jizda xsi:type="tns:tJizda"><jizdaId>41</jizdaId><jizdaOd>2026-07-20T07:00:00+02:00</jizdaOd><jizdaDo>2026-07-20T07:35:00+02:00</jizdaDo><jizdaStavPhm>61.5</jizdaStavPhm><jizdaStavPhm2>0</jizdaStavPhm2></jizda>
  <jizda xsi:type="tns:tJizda"><jizdaId>42</jizdaId><jizdaOd>2026-07-20T08:00:00+02:00</jizdaOd><jizdaDo>2026-07-20T08:40:00+02:00</jizdaDo><jizdaStavPhm>57.25</jizdaStavPhm><jizdaStavPhm2>0</jizdaStavPhm2></jizda>
</knihaJizd></Body></Envelope>`);

assert.equal(trips.length, 2);
assert.equal(trips[1].fuelState, 57.25);

const fresh = verifiedTcarsFuelState(trips, { registration: "3BN 3558" }, {
  now: "2026-07-20T09:00:00+02:00"
});
assert.equal(fresh.verified, true);
assert.equal(fresh.value, 57.25);
assert.equal(fresh.unit, "");
assert.equal(fresh.unitStatus, "not_provided_by_api");
assert.equal(fresh.registration, "3BN3558");

const stale = verifiedTcarsFuelState(trips, { registration: "3BN 3558" }, {
  now: "2026-07-21T10:00:00+02:00"
});
assert.equal(stale.verified, false);
assert.equal(stale.status, "fuel_stale");
assert.equal(stale.value, null);

const withoutVehicle = verifiedTcarsFuelState(trips, {}, { now: "2026-07-20T09:00:00+02:00" });
assert.equal(withoutVehicle.verified, false);
assert.equal(withoutVehicle.status, "vehicle_unverified");

console.log("T-Cars verified fuel state tests passed");
