export const COLLECTION_ROUTE_GPS_MIN_SAMPLES = 3;
export const COLLECTION_ROUTE_GPS_MAX_ACCURACY_METERS = 30;
export const COLLECTION_ROUTE_GPS_STATIONARY_SPEED_MPS = 1.5;

function finiteNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

export function normalizeCollectionRouteGpsSample(sample = {}) {
  const latitude = finiteNumber(sample.latitude ?? sample.coords?.latitude);
  const longitude = finiteNumber(sample.longitude ?? sample.coords?.longitude);
  const accuracy = finiteNumber(sample.accuracy ?? sample.coords?.accuracy);
  const speed = finiteNumber(sample.speed ?? sample.coords?.speed);
  const capturedAt = String(sample.capturedAt || sample.timestamp || new Date().toISOString()).trim();
  if (latitude === null || latitude < -90 || latitude > 90) return null;
  if (longitude === null || longitude < -180 || longitude > 180) return null;
  if (accuracy === null || accuracy <= 0) return null;
  return {
    latitude,
    longitude,
    accuracy,
    speed: speed !== null && speed >= 0 ? speed : null,
    capturedAt
  };
}

export function summarizeCollectionRouteGpsSamples(samples = [], options = {}) {
  const minimumSamples = Math.max(1, Number(options.minimumSamples) || COLLECTION_ROUTE_GPS_MIN_SAMPLES);
  const maxAccuracy = Math.max(1, Number(options.maxAccuracy) || COLLECTION_ROUTE_GPS_MAX_ACCURACY_METERS);
  const stationarySpeed = Math.max(0.1, Number(options.stationarySpeed) || COLLECTION_ROUTE_GPS_STATIONARY_SPEED_MPS);
  const normalized = samples.map(normalizeCollectionRouteGpsSample).filter(Boolean);
  if (normalized.length < minimumSamples) {
    return {
      ok: false,
      code: "gps_samples_missing",
      message: `GPS potřebuje alespoň ${minimumSamples} platná měření.`
    };
  }
  const movingSample = normalized.find((sample) => sample.speed !== null && sample.speed > stationarySpeed);
  if (movingSample) {
    return {
      ok: false,
      code: "vehicle_moving",
      message: "Vozidlo se ještě pohybuje. Zastav a měření spusť znovu."
    };
  }
  const best = [...normalized].sort((left, right) => left.accuracy - right.accuracy)[0];
  if (best.accuracy > maxAccuracy) {
    return {
      ok: false,
      code: "gps_accuracy_low",
      message: `GPS je nepřesná (${Math.round(best.accuracy)} m). Počkej na přesnost nejvýše ${maxAccuracy} m a zkus to znovu.`
    };
  }
  return {
    ok: true,
    point: {
      ...best,
      accuracy: Math.round(best.accuracy * 10) / 10,
      sampleCount: normalized.length
    }
  };
}

export function collectionRouteGpsPrompt(addressingName = "") {
  const name = String(addressingName || "").trim();
  const greeting = name ? `${name}, toto stanoviště` : "Toto stanoviště";
  return `${greeting} ještě nemáme fyzicky potvrzené. Až zastavíš přímo u nádob, klepni na Potvrdit GPS stanoviště.`;
}
