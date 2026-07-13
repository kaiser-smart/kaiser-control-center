import {
  COLLECTION_ROUTES_TEST_BRNO_ADDRESSES,
  COLLECTION_ROUTES_TEST_BRNO_ADDRESS_SEED,
  COLLECTION_ROUTES_TEST_BRNO_ADDRESS_SOURCE
} from "../_data/collection-routes-test-brno-addresses.generated.js";

export const COLLECTION_ROUTES_TEST_DATASET_KEY = "brno-500-v2";
export const COLLECTION_ROUTES_TEST_DATASET_NAME = "TEST Brno 501";
export const COLLECTION_ROUTES_TEST_BASE_SITE_COUNT = 500;
export const COLLECTION_ROUTES_TEST_COMPANY_COUNT = 101;
export const COLLECTION_ROUTES_TEST_SITE_COUNT = 501;
export const COLLECTION_ROUTES_TEST_ALLOWED_CONTAINER_VOLUMES = Object.freeze([120, 240, 1100]);

export const COLLECTION_ROUTES_FIELD_TEST_SITE = Object.freeze({
  rowNumber: 501,
  sourceId: "test-field-site-501",
  customerName: "Firma test 501",
  stationName: "Firma test 501 · stanoviště Trnkova",
  addressText: "Trnkova 3052/137, 628 00 Brno",
  latitude: 49.19125931950087,
  longitude: 16.670211574110382
});

const WASTE_DISTRIBUTION = Object.freeze([
  Object.freeze({ wasteType: "SKO", wasteCode: "200301", count: 350 }),
  Object.freeze({ wasteType: "PAPIR", wasteCode: "200101", count: 60 }),
  Object.freeze({ wasteType: "PLAST", wasteCode: "200139", count: 45 }),
  Object.freeze({ wasteType: "BIO", wasteCode: "200201", count: 25 }),
  Object.freeze({ wasteType: "SKLO", wasteCode: "200102", count: 20 })
]);

const FREQUENCY_DISTRIBUTION = Object.freeze([
  Object.freeze({ value: "1x7", count: 175 }),
  Object.freeze({ value: "2x7", count: 100 }),
  Object.freeze({ value: "3x7", count: 75 }),
  Object.freeze({ value: "5x7", count: 50 }),
  Object.freeze({ value: "1x14", count: 75 }),
  Object.freeze({ value: "1x30", count: 25 })
]);

const CONTAINER_DISTRIBUTION = Object.freeze([
  Object.freeze({ value: 120, count: 225 }),
  Object.freeze({ value: 240, count: 175 }),
  Object.freeze({ value: 1100, count: 100 })
]);

const WEEKDAYS = Object.freeze([
  Object.freeze({ code: "PO", label: "pondělí" }),
  Object.freeze({ code: "ÚT", label: "úterý" }),
  Object.freeze({ code: "ST", label: "středa" }),
  Object.freeze({ code: "ČT", label: "čtvrtek" }),
  Object.freeze({ code: "PÁ", label: "pátek" })
]);
const TWO_DAY_PATTERNS = Object.freeze([
  Object.freeze([WEEKDAYS[0], WEEKDAYS[3]]),
  Object.freeze([WEEKDAYS[1], WEEKDAYS[4]]),
  Object.freeze([WEEKDAYS[0], WEEKDAYS[2]]),
  Object.freeze([WEEKDAYS[2], WEEKDAYS[4]])
]);
const THREE_DAY_PATTERNS = Object.freeze([
  Object.freeze([WEEKDAYS[0], WEEKDAYS[2], WEEKDAYS[4]]),
  Object.freeze([WEEKDAYS[1], WEEKDAYS[3], WEEKDAYS[4]]),
  Object.freeze([WEEKDAYS[0], WEEKDAYS[1], WEEKDAYS[3]])
]);

function cleanString(value) {
  return String(value ?? "").trim();
}

function mulberry32(seed) {
  let value = seed >>> 0;
  return () => {
    value += 0x6d2b79f5;
    let next = value;
    next = Math.imul(next ^ (next >>> 15), next | 1);
    next ^= next + Math.imul(next ^ (next >>> 7), next | 61);
    return ((next ^ (next >>> 14)) >>> 0) / 4294967296;
  };
}

function shuffled(values, seed) {
  const result = [...values];
  const random = mulberry32(seed);
  for (let index = result.length - 1; index > 0; index -= 1) {
    const target = Math.floor(random() * (index + 1));
    [result[index], result[target]] = [result[target], result[index]];
  }
  return result;
}

function expandedDistribution(definitions) {
  return definitions.flatMap((definition) => new Array(definition.count).fill(
    definition.wasteType
      ? { wasteType: definition.wasteType, wasteCode: definition.wasteCode }
      : definition.value
  ));
}

function weeklyDays(frequency, index) {
  if (frequency === "1x7") return [WEEKDAYS[index % WEEKDAYS.length]];
  if (frequency === "2x7") return TWO_DAY_PATTERNS[index % TWO_DAY_PATTERNS.length];
  if (frequency === "3x7") return THREE_DAY_PATTERNS[index % THREE_DAY_PATTERNS.length];
  if (frequency === "5x7") return WEEKDAYS;
  return [];
}

function pickupSchedule(frequency, index) {
  const days = weeklyDays(frequency, index);
  if (days.length) {
    return {
      mode: "weekly",
      dayCodes: days.map((day) => day.code),
      parities: ["odd", "even"]
    };
  }
  if (frequency === "1x14") {
    return {
      mode: "fortnightly",
      dayCodes: [WEEKDAYS[index % WEEKDAYS.length].code],
      parities: [index % 2 === 0 ? "even" : "odd"]
    };
  }
  return {
    mode: "monthly-weekday",
    dayCodes: [WEEKDAYS[index % WEEKDAYS.length].code],
    parities: ["all"],
    weekOfMonth: (index % 4) + 1
  };
}

function pickupDaysText(frequency, index) {
  const schedule = pickupSchedule(frequency, index);
  const days = schedule.dayCodes.map((dayCode) => WEEKDAYS.find((day) => day.code === dayCode));
  if (schedule.mode === "weekly") {
    return days.flatMap((day) => [`${day.label} lichá`, `${day.label} sudá`]).join(", ");
  }
  if (schedule.mode === "fortnightly") {
    return `${days[0].label} ${schedule.parities[0] === "even" ? "sudá" : "lichá"}`;
  }
  return `${schedule.weekOfMonth}. ${days[0].label} v měsíci`;
}

function validateRecipient({ phone, email }) {
  const normalizedPhone = cleanString(phone).replace(/[\s().-]+/g, "");
  const normalizedEmail = cleanString(email).toLowerCase();
  if (!/^\+\d{8,15}$/.test(normalizedPhone)) {
    throw new Error("Testovací sada vyžaduje platný serverový SMS cíl v mezinárodním formátu.");
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)) {
    throw new Error("Testovací sada vyžaduje platný serverový e-mailový cíl.");
  }
  return { phone: normalizedPhone, email: normalizedEmail };
}

function fieldTestSiteRow(recipient) {
  const site = COLLECTION_ROUTES_FIELD_TEST_SITE;
  const contactName = "Radim · TEST 501";
  return {
    rowNumber: site.rowNumber,
    sourceEntity: "synthetic-field-test-site",
    sourceId: site.sourceId,
    sourceContractId: "test-contract-field-501",
    sourceCustomerId: "test-company-field-501",
    sourceSiteId: "test-site-field-501",
    contractId: "test-contract-field-501",
    contractRowId: "test-contract-row-501",
    contractNumber: "TEST-501",
    customerName: site.customerName,
    branchName: site.customerName,
    addressRaw: site.addressText,
    addressPlaceRaw: site.addressText,
    addressStreet: "Trnkova 3052/137",
    addressCity: "Brno",
    addressRegion: "Líšeň",
    addressCountry: "Česko",
    addressPostalCode: "62800",
    stationName: site.stationName,
    siteName: site.stationName,
    productId: "test-product-200301",
    productName: "SKO 120 l",
    rowName: "SKO · 120 l · 1x7",
    wasteType: "SKO",
    wasteCode: "200301",
    frequency: "1x7",
    pickupDaysText: "středa lichá, středa sudá",
    pickupSchedule: {
      mode: "weekly",
      dayCodes: ["ST"],
      parities: ["odd", "even"]
    },
    containerVolume: 120,
    containerCount: 1,
    containerType: "nádoba",
    serviceMode: "regular",
    onDemand: false,
    mappingStatus: "test-ready",
    note: "TESTOVACÍ DATA · výchozí stanoviště pro fyzický GPS test tabletu · bez vazby na skutečného zákazníka.",
    contact: contactName,
    phone: recipient.phone,
    email: recipient.email,
    customerManagerName: contactName,
    customerManagerMobile: recipient.phone,
    customerManagerEmail: recipient.email,
    rowKey: `${COLLECTION_ROUTES_TEST_DATASET_KEY}|row|501`,
    siteKey: `${COLLECTION_ROUTES_TEST_DATASET_KEY}|site|field-501`,
    locationQuality: "confirmed-test-open-data",
    latitude: site.latitude,
    longitude: site.longitude,
    svozKaiserValue: "TEST",
    svozKaiserIncluded: true,
    issueCount: 0,
    issues: [],
    dataScope: "test",
    testDatasetKey: COLLECTION_ROUTES_TEST_DATASET_KEY,
    addressSourceId: "gis-brno-trnkova-3052-137",
    addressSource: COLLECTION_ROUTES_TEST_BRNO_ADDRESS_SOURCE,
    fieldTestPriority: true
  };
}

function countBy(rows, field) {
  return rows.reduce((counts, row) => {
    const key = String(row[field]);
    counts[key] = (counts[key] || 0) + 1;
    return counts;
  }, {});
}

export function buildCollectionRoutesTestDataset({
  phone,
  email,
  addresses = COLLECTION_ROUTES_TEST_BRNO_ADDRESSES,
  seed = COLLECTION_ROUTES_TEST_BRNO_ADDRESS_SEED
} = {}) {
  if (!Array.isArray(addresses) || addresses.length !== COLLECTION_ROUTES_TEST_BASE_SITE_COUNT) {
    throw new Error(`Testovací sada vyžaduje přesně ${COLLECTION_ROUTES_TEST_BASE_SITE_COUNT} výchozích adresních bodů.`);
  }
  const recipient = validateRecipient({ phone, email });
  const wastes = shuffled(expandedDistribution(WASTE_DISTRIBUTION), seed + 11);
  const frequencies = shuffled(expandedDistribution(FREQUENCY_DISTRIBUTION), seed + 23);
  const volumes = shuffled(expandedDistribution(CONTAINER_DISTRIBUTION), seed + 37);
  const quantityRandom = mulberry32(seed + 51);
  const rows = addresses.map((address, index) => {
    const companyNumber = Math.floor(index / 5) + 1;
    const companySiteNumber = (index % 5) + 1;
    const companyName = `Test ${companyNumber} s.r.o.`;
    const contactName = `Radim${companyNumber} Test${companyNumber}`;
    const waste = wastes[index];
    const frequency = frequencies[index];
    const containerVolume = volumes[index];
    const contractNumber = `TEST-${String(companyNumber).padStart(3, "0")}`;
    const stationName = `TEST ${companyNumber} · stanoviště ${companySiteNumber}`;
    return {
      rowNumber: index + 1,
      sourceEntity: "synthetic-brno-address",
      sourceId: `test-brno-address-${address.sourceAddressId}`,
      sourceContractId: `test-contract-${companyNumber}`,
      sourceCustomerId: `test-company-${companyNumber}`,
      sourceSiteId: `test-site-${address.sourceAddressId}`,
      contractId: `test-contract-${companyNumber}`,
      contractRowId: `test-contract-row-${index + 1}`,
      contractNumber,
      customerName: companyName,
      branchName: companyName,
      addressRaw: address.addressText,
      addressPlaceRaw: address.addressText,
      addressStreet: `${address.street} ${address.number}`,
      addressCity: address.city,
      addressRegion: address.cityPart,
      addressCountry: "Česko",
      addressPostalCode: address.postalCode,
      stationName,
      siteName: stationName,
      productId: `test-product-${waste.wasteCode}`,
      productName: `${waste.wasteType} ${containerVolume} l`,
      rowName: `${waste.wasteType} · ${containerVolume} l · ${frequency}`,
      wasteType: waste.wasteType,
      wasteCode: waste.wasteCode,
      frequency,
      pickupDaysText: pickupDaysText(frequency, index),
      pickupSchedule: pickupSchedule(frequency, index),
      containerVolume,
      containerCount: quantityRandom() < 0.82 ? 1 : (quantityRandom() < 0.9 ? 2 : 3),
      containerType: "nádoba",
      serviceMode: "regular",
      onDemand: false,
      mappingStatus: "test-ready",
      note: "TESTOVACÍ DATA · veřejný adresní bod Brno · bez vazby na skutečného zákazníka.",
      contact: contactName,
      phone: recipient.phone,
      email: recipient.email,
      customerManagerName: contactName,
      customerManagerMobile: recipient.phone,
      customerManagerEmail: recipient.email,
      rowKey: `${COLLECTION_ROUTES_TEST_DATASET_KEY}|row|${index + 1}`,
      siteKey: `${COLLECTION_ROUTES_TEST_DATASET_KEY}|site|${address.sourceAddressId}`,
      locationQuality: "confirmed-test-open-data",
      latitude: Number(address.latitude),
      longitude: Number(address.longitude),
      svozKaiserValue: "TEST",
      svozKaiserIncluded: true,
      issueCount: 0,
      issues: [],
      dataScope: "test",
      testDatasetKey: COLLECTION_ROUTES_TEST_DATASET_KEY,
      addressSourceId: address.sourceAddressId,
      addressSource: COLLECTION_ROUTES_TEST_BRNO_ADDRESS_SOURCE
    };
  });
  rows.push(fieldTestSiteRow(recipient));

  return {
    key: COLLECTION_ROUTES_TEST_DATASET_KEY,
    name: COLLECTION_ROUTES_TEST_DATASET_NAME,
    seed,
    source: COLLECTION_ROUTES_TEST_BRNO_ADDRESS_SOURCE,
    companyCount: COLLECTION_ROUTES_TEST_COMPANY_COUNT,
    siteCount: COLLECTION_ROUTES_TEST_SITE_COUNT,
    recipient,
    rows,
    summary: {
      companyCount: COLLECTION_ROUTES_TEST_COMPANY_COUNT,
      siteCount: rows.length,
      wasteCounts: countBy(rows, "wasteType"),
      frequencyCounts: countBy(rows, "frequency"),
      containerVolumeCounts: countBy(rows, "containerVolume")
    }
  };
}

export const __test = {
  WASTE_DISTRIBUTION,
  FREQUENCY_DISTRIBUTION,
  CONTAINER_DISTRIBUTION,
  pickupSchedule,
  pickupDaysText,
  validateRecipient,
  fieldTestSiteRow
};
