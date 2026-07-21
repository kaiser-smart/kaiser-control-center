const DEFAULT_LOCATION = {
  name: "Brno",
  latitude: 49.1951,
  longitude: 16.6068
};
const WEATHER_CACHE_MS = 15 * 60 * 1000;
const WEATHER_TIMEOUT_MS = 1_800;
const weatherCache = new Map();

function cleanString(value) {
  return String(value ?? "").trim();
}

function numberValue(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function boolValue(value, fallback = false) {
  if (typeof value === "boolean") {
    return value;
  }

  const normalized = cleanString(value).toLowerCase();
  if (["true", "1", "yes", "ano", "enabled", "zapnuto"].includes(normalized)) {
    return true;
  }

  if (["false", "0", "no", "ne", "disabled", "vypnuto"].includes(normalized)) {
    return false;
  }

  return fallback;
}

function parseJson(value, fallback = {}) {
  if (value && typeof value === "object") {
    return value;
  }

  try {
    return JSON.parse(cleanString(value));
  } catch {
    return fallback;
  }
}

function configuredWeather(env = {}) {
  const config = parseJson(env.SARLOTA_HUMAN_TOUCH_JSON, {});
  const weatherConfig = parseJson(env.SARLOTA_WEATHER_JSON, {});
  return {
    ...(config.weatherProvider && typeof config.weatherProvider === "object" ? config.weatherProvider : {}),
    ...(weatherConfig && typeof weatherConfig === "object" ? weatherConfig : {})
  };
}

function weatherLocation(env = {}, override = {}) {
  const config = configuredWeather(env);

  return {
    name: cleanString(override.name || config.locationName || config.name || env.SARLOTA_WEATHER_LOCATION_NAME) || DEFAULT_LOCATION.name,
    latitude: numberValue(override.latitude ?? config.latitude ?? env.SARLOTA_WEATHER_LATITUDE, DEFAULT_LOCATION.latitude),
    longitude: numberValue(override.longitude ?? config.longitude ?? env.SARLOTA_WEATHER_LONGITUDE, DEFAULT_LOCATION.longitude)
  };
}

function weatherCodeLabel(code) {
  const numeric = numberValue(code, -1);
  const labels = {
    0: "jasno",
    1: "skoro jasno",
    2: "polojasno",
    3: "zataženo",
    45: "mlha",
    48: "námraza v mlze",
    51: "slabé mrholení",
    53: "mrholení",
    55: "silné mrholení",
    61: "slabý déšť",
    63: "déšť",
    65: "silný déšť",
    71: "slabé sněžení",
    73: "sněžení",
    75: "silné sněžení",
    80: "slabé přeháňky",
    81: "přeháňky",
    82: "silné přeháňky",
    95: "bouřka",
    96: "bouřka s kroupami",
    99: "silná bouřka s kroupami"
  };

  return labels[numeric] || "";
}

function cacheKey(location) {
  return `${location.latitude.toFixed(4)},${location.longitude.toFixed(4)}`;
}

function finiteValues(values = []) {
  return values.map((value) => Number(value)).filter(Number.isFinite);
}

function maximum(values = [], fallback = 0) {
  const numeric = finiteValues(values);
  return numeric.length ? Math.max(...numeric) : fallback;
}

function minimum(values = [], fallback = 0) {
  const numeric = finiteValues(values);
  return numeric.length ? Math.min(...numeric) : fallback;
}

function nextShiftForecast(payload = {}, currentTime = "") {
  const hourly = payload.hourly && typeof payload.hourly === "object" ? payload.hourly : {};
  const times = Array.isArray(hourly.time) ? hourly.time : [];
  const startIndex = Math.max(0, times.findIndex((value) => !currentTime || cleanString(value) >= currentTime));
  const indexes = times.slice(startIndex, startIndex + 12).map((_, index) => startIndex + index);
  const values = (key) => indexes.map((index) => Array.isArray(hourly[key]) ? hourly[key][index] : null);
  const precipitationMm = values("precipitation");
  const rainMm = values("rain");
  const snowfallCm = values("snowfall");
  const weatherCodes = values("weather_code");
  return {
    horizonHours: indexes.length,
    startsAt: cleanString(times[indexes[0]]),
    endsAt: cleanString(times[indexes[indexes.length - 1]]),
    minTemperatureC: minimum(values("temperature_2m"), NaN),
    maxTemperatureC: maximum(values("temperature_2m"), NaN),
    maxPrecipitationProbability: maximum(values("precipitation_probability"), 0),
    precipitationMm: finiteValues(precipitationMm).reduce((sum, value) => sum + value, 0),
    rainMm: finiteValues(rainMm).reduce((sum, value) => sum + value, 0),
    snowfallCm: finiteValues(snowfallCm).reduce((sum, value) => sum + value, 0),
    maxWindSpeedKph: maximum(values("wind_speed_10m"), 0),
    maxWindGustKph: maximum(values("wind_gusts_10m"), 0),
    minimumVisibilityM: minimum(values("visibility"), Number.POSITIVE_INFINITY),
    thunderstorm: finiteValues(weatherCodes).some((code) => code >= 95)
  };
}

function shiftHazards(current = {}, forecast = {}) {
  const hazards = [];
  const currentTemperature = numberValue(current.temperature_2m, NaN);
  const minTemperature = Number.isFinite(forecast.minTemperatureC) ? forecast.minTemperatureC : currentTemperature;
  const maxTemperature = Number.isFinite(forecast.maxTemperatureC) ? forecast.maxTemperatureC : currentTemperature;
  const currentCode = numberValue(current.weather_code, -1);
  const currentWind = maximum([current.wind_speed_10m, current.wind_gusts_10m], 0);
  const maxWind = maximum([forecast.maxWindSpeedKph, forecast.maxWindGustKph, currentWind], 0);
  const currentVisibility = numberValue(current.visibility, Number.POSITIVE_INFINITY);
  const minVisibility = minimum([forecast.minimumVisibilityM, currentVisibility], Number.POSITIVE_INFINITY);
  const rainExpected = numberValue(forecast.rainMm, 0) > 0.2
    || numberValue(forecast.precipitationMm, 0) > 0.2
    || numberValue(forecast.maxPrecipitationProbability, 0) >= 55;
  const snowExpected = numberValue(forecast.snowfallCm, 0) > 0.05 || (currentCode >= 71 && currentCode <= 77);

  if (forecast.thunderstorm || currentCode >= 95) {
    hazards.push({ code: "thunderstorm", severity: "danger", label: "Během směny hrozí bouřka." });
  }
  if (snowExpected && rainExpected) {
    hazards.push({ code: "sleet", severity: "warning", label: "Během směny se může objevit déšť se sněhem." });
  } else if (snowExpected) {
    hazards.push({ code: "snow", severity: "warning", label: "Během směny se čeká sněžení." });
  } else if (rainExpected) {
    hazards.push({ code: "rain", severity: "notice", label: "Během směny se může objevit déšť." });
  }
  if (Number.isFinite(minTemperature) && minTemperature <= 0.5) {
    hazards.push({ code: "freezing", severity: "warning", label: "Místy může mrznout nebo namrzat povrch." });
  }
  if (maxWind >= 50) {
    hazards.push({ code: "wind", severity: "warning", label: `Nárazy větru mohou dosáhnout ${Math.round(maxWind)} km/h.` });
  }
  if (minVisibility <= 1_000 || currentCode === 45 || currentCode === 48) {
    hazards.push({ code: "fog", severity: "warning", label: "Místy může být mlha a horší viditelnost." });
  }
  if (Number.isFinite(maxTemperature) && maxTemperature >= 30) {
    hazards.push({ code: "heat", severity: "notice", label: `Během směny může být až ${Math.round(maxTemperature)} °C.` });
  }
  return hazards.slice(0, 4);
}

function weatherSummary(location, current, forecast, hazards) {
  const temperatureC = numberValue(current.temperature_2m, NaN);
  const condition = weatherCodeLabel(current.weather_code);
  const base = condition
    ? `${location.name}: ${Math.round(temperatureC)} °C, ${condition}`
    : `${location.name}: ${Math.round(temperatureC)} °C`;
  if (!hazards.length) {
    return `${base}. Během směny se neočekává výrazná změna počasí.`;
  }
  return `${base}. ${hazards.slice(0, 2).map((hazard) => hazard.label).join(" ")}`;
}

async function fetchWithTimeout(url, timeoutMs, fetchImpl = fetch) {
  const controller = typeof AbortController !== "undefined" ? new AbortController() : null;
  const timeout = controller ? setTimeout(() => controller.abort(), timeoutMs) : null;

  try {
    return await fetchImpl(url, controller ? { signal: controller.signal } : {});
  } finally {
    if (timeout) {
      clearTimeout(timeout);
    }
  }
}

export async function currentSarlotaWeather(env = {}, options = {}) {
  const config = configuredWeather(env);
  if (boolValue(config.disabled ?? env.SARLOTA_WEATHER_DISABLED, false)) {
    return { ok: false, status: "disabled", location: weatherLocation(env, options.location) };
  }

  const location = weatherLocation(env, options.location);
  const key = cacheKey(location);
  const cached = weatherCache.get(key);

  const nowMs = typeof options.now === "function" ? Number(options.now().getTime()) : Date.now();
  if (cached && nowMs - cached.cachedAt < WEATHER_CACHE_MS) {
    return cached.value;
  }

  const params = new URLSearchParams({
    latitude: String(location.latitude),
    longitude: String(location.longitude),
    current: "temperature_2m,apparent_temperature,precipitation,rain,showers,snowfall,weather_code,wind_speed_10m,wind_gusts_10m,visibility",
    hourly: "temperature_2m,precipitation_probability,precipitation,rain,showers,snowfall,weather_code,wind_speed_10m,wind_gusts_10m,visibility",
    forecast_days: "2",
    wind_speed_unit: "kmh",
    timezone: "Europe/Prague"
  });
  const timeoutMs = numberValue(config.timeoutMs || env.SARLOTA_WEATHER_TIMEOUT_MS, WEATHER_TIMEOUT_MS);

  try {
    const response = await fetchWithTimeout(
      `https://api.open-meteo.com/v1/forecast?${params.toString()}`,
      timeoutMs,
      options.fetchImpl || fetch
    );
    const payload = await response.json().catch(() => ({}));

    if (!response.ok) {
      return { ok: false, status: "error", location };
    }

    const current = payload.current || {};
    const temperatureC = numberValue(current.temperature_2m, NaN);
    if (!Number.isFinite(temperatureC)) {
      return { ok: false, status: "missing_temperature", location };
    }

    const condition = weatherCodeLabel(current.weather_code);
    const forecast = nextShiftForecast(payload, cleanString(current.time));
    const hazards = shiftHazards(current, forecast);
    const weather = {
      ok: true,
      status: "verified",
      verified: true,
      source: "open_meteo",
      location,
      temperatureC,
      apparentTemperatureC: numberValue(current.apparent_temperature, temperatureC),
      condition,
      observedAt: cleanString(current.time),
      forecast,
      hazards,
      summary: weatherSummary(location, current, forecast, hazards)
    };

    weatherCache.set(key, {
      cachedAt: nowMs,
      value: weather
    });
    return weather;
  } catch (error) {
    console.error("sarlota_weather.fetch_failed", { message: error.message });
    return { ok: false, status: "unavailable", location };
  }
}

export const __test = Object.freeze({
  clearCache() {
    weatherCache.clear();
  },
  nextShiftForecast,
  shiftHazards,
  weatherSummary
});
