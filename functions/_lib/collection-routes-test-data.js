import {
  COLLECTION_ROUTES_TEST_BRNO_ADDRESSES,
  COLLECTION_ROUTES_TEST_BRNO_ADDRESS_SEED,
  COLLECTION_ROUTES_TEST_BRNO_ADDRESS_SOURCE
} from "../_data/collection-routes-test-brno-addresses.generated.js";

export const COLLECTION_ROUTES_TEST_DATASET_KEY = "brno-500-v1";
export const COLLECTION_ROUTES_TEST_DATASET_NAME = "TEST Brno 500";
export const COLLECTION_ROUTES_TEST_COMPANY_COUNT = 100;
export const COLLECTION_ROUTES_TEST_SITE_COUNT = 500;
export const COLLECTION_ROUTES_TEST_ALLOWED_CONTAINER_VOLUMES = Object.freeze([120, 240, 1100]);

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

const WEEKDAYS = Object.freeze(["pondělí", "úterý", "středa", "čtvrtek", "pátek"]);
const TWO_DAY_PATTERNS = Object.freeze([
  "pondělí, čtvrtek",
  "úterý, pátek",
  "pondělí, středa",
  "středa, pátek"
]);
const THREE_DAY_PATTERNS = Object.freeze([
  "pondělí, středa, pátek",
  "úterý, čtvrtek, pátek",
  "pondělí, úterý, čtvrtek"
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

function pickupDaysText(frequency, index) {
  if (frequency === "1x7") return WEEKDAYS[index % WEEKDAYS.length];
  if (frequency === "2x7") return TWO_DAY_PATTERNS[index % TWO_DAY_PATTERNS.length];
  if (frequency === "3x7") return THREE_DAY_PATTERNS[index % THREE_DAY_PATTERNS.length];
  if (frequency === "5x7") return WEEKDAYS.join(", ");
  if (frequency === "1x14") {
    return `${WEEKDAYS[index % WEEKDAYS.length]} ${index % 2 === 0 ? "sudá" : "lichá"}`;
  }
  return WEEKDAYS[index % WEEKDAYS.length];
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

export function buildCollectionRoutesTestDataset({
  phone,
  email,
  addresses = COLLECTION_ROUTES_TEST_BRNO_ADDRESSES,
  seed = COLLECTION_ROUTES_TEST_BRNO_ADDRESS_SEED
} = {}) {
  if (!Array.isArray(addresses) || addresses.length !== COLLECTION_ROUTES_TEST_SITE_COUNT) {
    throw new Error(`Testovací sada vyžaduje přesně ${COLLECTION_ROUTES_TEST_SITE_COUNT} adresních bodů.`);
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
      wasteCounts: Object.fromEntries(WASTE_DISTRIBUTION.map((item) => [item.wasteType, item.count])),
      frequencyCounts: Object.fromEntries(FREQUENCY_DISTRIBUTION.map((item) => [item.value, item.count])),
      containerVolumeCounts: Object.fromEntries(CONTAINER_DISTRIBUTION.map((item) => [String(item.value), item.count]))
    }
  };
}

export const __test = {
  WASTE_DISTRIBUTION,
  FREQUENCY_DISTRIBUTION,
  CONTAINER_DISTRIBUTION,
  pickupDaysText,
  validateRecipient
};
