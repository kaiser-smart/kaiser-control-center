export const COLLECTION_ROUTE_VEHICLE_SPECS_VERSION = "1.0";

const confirmedAt = "2026-07-17T02:39:40+02:00";
const confirmedBy = "Radim Opluštil";

function confirmedVehicle({
  code,
  registration,
  operatingName,
  defaultDriver,
  emptyWeightKg,
  maximumPermittedWeightKg,
  payloadCapacityKg,
  lengthCm,
  widthCm,
  heightCm,
  paperCapacityTons,
  plasticCapacityTons
}) {
  return Object.freeze({
    code,
    registration,
    label: `Vůz ${code} · ${registration}`,
    shortLabel: `${code} ${registration}`,
    operatingName,
    defaultDriver,
    capacitiesTons: Object.freeze({
      SKO: payloadCapacityKg / 1000,
      PAPIR: paperCapacityTons,
      PLAST: plasticCapacityTons
    }),
    technical: Object.freeze({
      emptyWeightKg,
      maximumPermittedWeightKg,
      payloadCapacityKg,
      dimensions: Object.freeze({ lengthCm, widthCm, heightCm }),
      maximumAxleWeightKg: null,
      dataQuality: "confirmed",
      confirmedAt,
      confirmedBy
    })
  });
}

export const COLLECTION_ROUTE_VEHICLES = Object.freeze([
  confirmedVehicle({
    code: "A",
    registration: "3BN 3558",
    operatingName: "Kouba",
    defaultDriver: "Jakub Kozlíček",
    emptyWeightKg: 13500,
    maximumPermittedWeightKg: 19000,
    payloadCapacityKg: 5500,
    lengthCm: 850,
    widthCm: 240,
    heightCm: 350,
    paperCapacityTons: 2,
    plasticCapacityTons: 1
  }),
  confirmedVehicle({
    code: "B",
    registration: "1BP 8373",
    operatingName: "Míra",
    defaultDriver: "Miroslav Vašek",
    emptyWeightKg: 13200,
    maximumPermittedWeightKg: 19000,
    payloadCapacityKg: 5800,
    lengthCm: 850,
    widthCm: 240,
    heightCm: 350,
    paperCapacityTons: 2,
    plasticCapacityTons: 1
  }),
  confirmedVehicle({
    code: "C",
    registration: "3BE 2831",
    operatingName: "Florian",
    defaultDriver: "Miroslav Florián",
    emptyWeightKg: 15400,
    maximumPermittedWeightKg: 25000,
    payloadCapacityKg: 9600,
    lengthCm: 940,
    widthCm: 240,
    heightCm: 350,
    paperCapacityTons: 2.5,
    plasticCapacityTons: 1
  })
]);

export function collectionRouteVehicleByCode(value) {
  const code = String(value || "").trim().toUpperCase();
  return COLLECTION_ROUTE_VEHICLES.find((vehicle) => vehicle.code === code) || null;
}

export function collectionRouteVehicleHereConfig(vehicle) {
  const technical = vehicle?.technical || {};
  const dimensions = technical.dimensions || {};
  return {
    code: vehicle?.code || "",
    registration: vehicle?.registration || "",
    capacitiesTons: { ...(vehicle?.capacitiesTons || {}) },
    truck: {
      heightCm: dimensions.heightCm || 0,
      widthCm: dimensions.widthCm || 0,
      lengthCm: dimensions.lengthCm || 0,
      emptyWeightKg: technical.emptyWeightKg || 0,
      grossWeightKg: technical.maximumPermittedWeightKg || 0,
      currentWeightKg: technical.maximumPermittedWeightKg || 0,
      payloadCapacityKg: technical.payloadCapacityKg || 0,
      weightPerAxleKg: technical.maximumAxleWeightKg || null
    },
    technicalDataQuality: technical.dataQuality || "missing",
    technicalDataSource: technical.confirmedBy
      ? `${technical.confirmedBy} · ${technical.confirmedAt || ""}`.replace(/\s+·\s*$/, "")
      : "",
    axleDataQuality: technical.maximumAxleWeightKg ? "confirmed" : "missing"
  };
}
