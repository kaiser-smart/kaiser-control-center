function cleanString(value) {
  return String(value ?? "").trim();
}

function normalizeText(value) {
  return cleanString(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

export function normalizeLicensePlate(value) {
  const compact = cleanString(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .replace(/[^0-9A-Z]/g, "");

  if (!compact) {
    return "";
  }

  if (compact.length === 7) {
    return `${compact.slice(0, 3)} ${compact.slice(3)}`;
  }

  const olderMatch = compact.match(/^([A-Z]{2,3})([0-9]{3,4})$/);
  if (olderMatch) {
    return `${olderMatch[1]} ${olderMatch[2]}`;
  }

  return compact;
}

export function licensePlateKey(value) {
  return normalizeLicensePlate(value).replace(/\s+/g, "");
}

function standardCzechPlateKey(key) {
  return /^[0-9][A-Z0-9]{2}[0-9]{4}$/.test(key);
}

function knownPlateKeys(values = []) {
  return new Set(
    values
      .map((value) => {
        if (!value || typeof value !== "object") {
          return licensePlateKey(value);
        }
        return licensePlateKey(value.licensePlate || value.tcarsLicensePlate || value.registrationPlate || value.spz);
      })
      .filter(Boolean)
  );
}

export function validateLicensePlateFormat(value, knownValues = []) {
  const normalized = normalizeLicensePlate(value);
  const key = licensePlateKey(normalized);
  const known = knownPlateKeys(knownValues);

  if (!key) {
    return {
      valid: false,
      normalized,
      key,
      reason: "empty",
      message: "SPZ je povinná."
    };
  }

  if (standardCzechPlateKey(key)) {
    return {
      valid: true,
      normalized,
      key,
      reason: "standard_czech"
    };
  }

  if (known.has(key)) {
    return {
      valid: true,
      normalized,
      key,
      reason: "known_internal"
    };
  }

  return {
    valid: false,
    normalized,
    key,
    reason: "invalid_format",
    message: "SPZ nemá platný formát. Zkontrolujte ji prosím."
  };
}

export function vehicleLicensePlateValue(vehicle = {}) {
  return cleanString(vehicle.licensePlate || vehicle.tcarsLicensePlate || vehicle.registrationPlate || vehicle.spz);
}

export function findVehicleByLicensePlate(value, vehicles = []) {
  const key = licensePlateKey(value);
  if (!key) {
    return null;
  }

  return vehicles.find((vehicle) => licensePlateKey(vehicleLicensePlateValue(vehicle)) === key) || null;
}

function levenshteinDistance(left, right) {
  if (left === right) {
    return 0;
  }
  if (!left) {
    return right.length;
  }
  if (!right) {
    return left.length;
  }

  const previous = Array.from({ length: right.length + 1 }, (_, index) => index);
  const current = Array.from({ length: right.length + 1 }, () => 0);

  for (let i = 1; i <= left.length; i += 1) {
    current[0] = i;
    for (let j = 1; j <= right.length; j += 1) {
      const cost = left[i - 1] === right[j - 1] ? 0 : 1;
      current[j] = Math.min(
        current[j - 1] + 1,
        previous[j] + 1,
        previous[j - 1] + cost
      );
    }
    for (let j = 0; j <= right.length; j += 1) {
      previous[j] = current[j];
    }
  }

  return previous[right.length];
}

export function findSimilarLicensePlates(value, vehicles = [], limit = 5) {
  const key = licensePlateKey(value);
  if (!key) {
    return [];
  }

  return vehicles
    .map((vehicle) => {
      const plate = vehicleLicensePlateValue(vehicle);
      const plateKey = licensePlateKey(plate);
      if (!plateKey || plateKey === key) {
        return null;
      }

      const distance = levenshteinDistance(key, plateKey);
      const contains = plateKey.includes(key) || key.includes(plateKey);
      const prefix = plateKey.slice(0, 3) === key.slice(0, 3);
      const score = contains ? 0 : prefix ? distance + 0.5 : distance + 2;

      return {
        vehicle,
        licensePlate: normalizeLicensePlate(plate),
        distance,
        score
      };
    })
    .filter(Boolean)
    .filter((item) => item.distance <= 3 || item.score <= 3.5)
    .sort((left, right) => left.score - right.score || left.licensePlate.localeCompare(right.licensePlate, "cs"))
    .slice(0, limit);
}

const SPOKEN_DIGITS = new Map([
  ["nula", "0"],
  ["nul", "0"],
  ["jeden", "1"],
  ["jedna", "1"],
  ["jedno", "1"],
  ["dva", "2"],
  ["dve", "2"],
  ["tri", "3"],
  ["ctyri", "4"],
  ["ctyry", "4"],
  ["pet", "5"],
  ["sest", "6"],
  ["sedm", "7"],
  ["osm", "8"],
  ["devet", "9"]
]);

const SPOKEN_LETTERS = new Map([
  ["a", "A"],
  ["acko", "A"],
  ["be", "B"],
  ["b", "B"],
  ["ce", "C"],
  ["c", "C"],
  ["de", "D"],
  ["d", "D"],
  ["e", "E"],
  ["ef", "F"],
  ["f", "F"],
  ["ge", "G"],
  ["g", "G"],
  ["ha", "H"],
  ["h", "H"],
  ["i", "I"],
  ["j", "J"],
  ["ka", "K"],
  ["k", "K"],
  ["el", "L"],
  ["l", "L"],
  ["em", "M"],
  ["m", "M"],
  ["en", "N"],
  ["n", "N"],
  ["o", "O"],
  ["pe", "P"],
  ["p", "P"],
  ["ku", "Q"],
  ["q", "Q"],
  ["er", "R"],
  ["r", "R"],
  ["es", "S"],
  ["s", "S"],
  ["te", "T"],
  ["t", "T"],
  ["u", "U"],
  ["ve", "V"],
  ["v", "V"],
  ["dvojiteve", "W"],
  ["w", "W"],
  ["iks", "X"],
  ["x", "X"],
  ["ypsilon", "Y"],
  ["y", "Y"],
  ["zet", "Z"],
  ["z", "Z"]
]);

function spokenPlateCharacters(text) {
  const tokens = normalizeText(text)
    .replace(/[^a-z0-9]+/g, " ")
    .split(/\s+/)
    .filter(Boolean);
  const characters = [];

  for (const token of tokens) {
    if (/^[0-9]+$/.test(token)) {
      characters.push(...token.split(""));
      continue;
    }

    const digit = SPOKEN_DIGITS.get(token);
    if (digit) {
      characters.push(digit);
      continue;
    }

    const letter = SPOKEN_LETTERS.get(token);
    if (letter) {
      characters.push(letter);
    }
  }

  return characters;
}

function extractSpokenLicensePlate(text) {
  const chars = spokenPlateCharacters(text);
  if (chars.length < 7) {
    return "";
  }

  for (let index = 0; index <= chars.length - 7; index += 1) {
    const candidate = chars.slice(index, index + 7).join("");
    if (standardCzechPlateKey(candidate)) {
      return normalizeLicensePlate(candidate);
    }
  }

  return "";
}

export function extractLicensePlate(text) {
  const normalized = cleanString(text)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase();
  const match = normalized.match(/\b([0-9][A-Z0-9]{2}\s?[0-9]{4}|[A-Z]{2,3}\s?[0-9]{3,4})\b/);
  return normalizeLicensePlate(match?.[1] || extractSpokenLicensePlate(text));
}
