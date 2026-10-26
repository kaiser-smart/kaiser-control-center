// Explicit artwork review supplied by the user on 2026-10-26 (42 choices).
// Presentation only: never a fleet/type/GPS source or an authorization source.
// No names, drivers, GPS or user-scoped export IDs are retained here.
export const APPROVED_ICON_ASSIGNMENTS = Object.freeze([
  Object.freeze(["891", "3BN3558", "collection_truck"]),
  Object.freeze(["892", "3BP5305", "box_body"]),
  Object.freeze(["893", "3BN3644", "van"]),
  Object.freeze(["1209", "1BV6295", "truck"]),
  Object.freeze(["1214", "3BF1394", "box_body"]),
  Object.freeze(["1219", "2BD8835", "box_body"]),
  Object.freeze(["1220", "3BI2007", "box_body"]),
  Object.freeze(["1221", "3BH5548", "skip_loader"]),
  Object.freeze(["1222", "1BM1150", "box_body"]),
  Object.freeze(["1224", "5B80857", "skip_loader"]),
  Object.freeze(["1226", "8B43007", "box_body"]),
  Object.freeze(["1228", "1BP8373", "collection_truck"]),
  Object.freeze(["1229", "9C83570", "tanker"]),
  Object.freeze(["1230", "2BE2247", "truck"]),
  Object.freeze(["1231", "2BR0904", "skip_loader"]),
  Object.freeze(["1232", "5B14417", "tanker"]),
  Object.freeze(["1233", "5E73753", "tanker"]),
  Object.freeze(["1234", "1BR6359", "box_body"]),
  Object.freeze(["1240", "3BK4123", "car"]),
  Object.freeze(["1249", "8B42064", "car"]),
  Object.freeze(["1251", "2BI4127", "car"]),
  Object.freeze(["1252", "3BI8675", "van"]),
  Object.freeze(["1253", "7M28101", "car"]),
  Object.freeze(["1254", "1BM3239", "truck"]),
  Object.freeze(["1258", "3BI9901", "car"]),
  Object.freeze(["1259", "2BC1983", "car"]),
  Object.freeze(["1261", "2BC1984", "car"]),
  Object.freeze(["1264", "2BC1027", "van"]),
  Object.freeze(["1265", "2BK7741", "van"]),
  Object.freeze(["1266", "EL419CT", "van"]),
  Object.freeze(["1290", "3BH3767", "truck"]),
  Object.freeze(["1293", "HYUNDAIVZV", "forklift"]),
  Object.freeze(["1294", "VIN:000098", "forklift"]),
  Object.freeze(["1296", "B031719", "excavator"]),
  Object.freeze(["1297", "VIN:000373", "forklift"]),
  Object.freeze(["1302", "3BK6927", "car"]),
  Object.freeze(["1304", "B032892", "excavator"]),
  Object.freeze(["1307", "3BE2831", "collection_truck"]),
  Object.freeze(["1308", "2BS6064", "tanker"]),
  Object.freeze(["1432", "1CK0494", "tanker"]),
  Object.freeze(["1611", "1APK520", "van"]),
  Object.freeze(["1612", "7SK1369", "truck"]),
]);
const byExternalId = new Map(APPROVED_ICON_ASSIGNMENTS.map(([id, plate, icon]) => [id, { plate, icon }]));
const text = value => typeof value === 'string' || typeof value === 'number' ? String(value).trim() : '';
const plateKey = value => text(value).toUpperCase().replace(/\s/g, '');
// The export prefix is the reviewing user's session scope, not fleet identity.
// Resolve only an already-authorized record with matching T-Cars ID AND plate.
// Conflicting fields fail closed; a new car reusing either value cannot inherit it.
export function approvedArtworkKey(record) {
  if (!record.stable) return '';
  const sources = [record.vehicle, record.latest, record.latest?.vehicle].filter(Boolean);
  const providers = sources.flatMap(v => [v.externalProvider, v.gpsProvider]).map(text).filter(Boolean);
  if (providers.some(provider => provider !== 'tcars')) return '';
  const ids = sources.flatMap(v => [v.externalVehicleId, v.tcarsVehicleId]).map(text).filter(Boolean);
  if (!ids.length || ids.some(id => id !== ids[0])) return '';
  const assignment = byExternalId.get(ids[0]);
  const plates = sources.map(v => plateKey(v.licensePlate)).filter(Boolean);
  return assignment && plates.length && plates.every(plate => plate === assignment.plate) ? assignment.icon : '';
}
