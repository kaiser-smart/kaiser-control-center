import assert from "node:assert/strict";

import { currentSarlotaWeather, __test as weatherTest } from "../functions/_lib/sarlota-weather.js";

weatherTest.clearCache();
let requestedUrl = "";
const times = Array.from({ length: 14 }, (_, index) => `2026-07-18T${String(6 + index).padStart(2, "0")}:00`);
const weather = await currentSarlotaWeather({}, {
  now: () => new Date("2026-07-18T04:30:00.000Z"),
  fetchImpl: async (url) => {
    requestedUrl = String(url);
    return new Response(JSON.stringify({
      current: {
        time: "2026-07-18T07:00",
        temperature_2m: 8.4,
        apparent_temperature: 6.1,
        weather_code: 3,
        wind_speed_10m: 22,
        wind_gusts_10m: 41,
        visibility: 8_000
      },
      hourly: {
        time: times,
        temperature_2m: [7, 8, 9, 10, 11, 12, 13, 14, 14, 13, 12, 11, 10, 9],
        precipitation_probability: [10, 20, 35, 65, 80, 75, 50, 20, 10, 5, 5, 5, 5, 5],
        precipitation: [0, 0, 0, 0.4, 1.2, 0.8, 0.2, 0, 0, 0, 0, 0, 0, 0],
        rain: [0, 0, 0, 0.4, 1.2, 0.8, 0.2, 0, 0, 0, 0, 0, 0, 0],
        showers: Array(14).fill(0),
        snowfall: Array(14).fill(0),
        weather_code: [3, 3, 3, 61, 63, 63, 61, 3, 2, 2, 1, 1, 1, 1],
        wind_speed_10m: [20, 22, 25, 30, 34, 36, 35, 31, 28, 25, 22, 20, 18, 16],
        wind_gusts_10m: [35, 41, 45, 52, 58, 61, 55, 48, 42, 38, 34, 30, 28, 25],
        visibility: Array(14).fill(8_000)
      }
    }), { status: 200, headers: { "content-type": "application/json" } });
  }
});

assert.match(requestedUrl, /hourly=/);
assert.match(requestedUrl, /forecast_days=2/);
assert.equal(weather.status, "verified");
assert.equal(weather.forecast.horizonHours, 12);
assert.ok(weather.forecast.precipitationMm > 2);
assert.ok(weather.hazards.some((item) => item.code === "rain"));
assert.ok(weather.hazards.some((item) => item.code === "wind"));
assert.match(weather.summary, /Během směny se může objevit déšť/);
assert.match(weather.summary, /Nárazy větru/);

weatherTest.clearCache();
const calmWeather = await currentSarlotaWeather({}, {
  now: () => new Date("2026-07-18T04:30:00.000Z"),
  fetchImpl: async () => new Response(JSON.stringify({
    current: {
      time: "2026-07-18T07:00",
      temperature_2m: 22,
      apparent_temperature: 22,
      weather_code: 1,
      wind_speed_10m: 5,
      wind_gusts_10m: 8,
      visibility: 20_000
    },
    hourly: {
      time: times,
      temperature_2m: Array(14).fill(22),
      precipitation_probability: Array(14).fill(0),
      precipitation: Array(14).fill(0),
      rain: Array(14).fill(0),
      showers: Array(14).fill(0),
      snowfall: Array(14).fill(0),
      weather_code: Array(14).fill(1),
      wind_speed_10m: Array(14).fill(5),
      wind_gusts_10m: Array(14).fill(8),
      visibility: Array(14).fill(20_000)
    }
  }), { status: 200, headers: { "content-type": "application/json" } })
});
assert.match(calmWeather.summary, /Během směny se neočekává výrazná změna počasí\./);
assert.doesNotMatch(calmWeather.summary, /bez výrazného počasí/);

weatherTest.clearCache();
const unavailable = await currentSarlotaWeather({}, {
  now: () => new Date("2026-07-18T04:31:00.000Z"),
  fetchImpl: async () => {
    throw new Error("offline");
  }
});
assert.equal(unavailable.status, "unavailable");
assert.equal(unavailable.verified, undefined);

console.log("Šarlota shift weather tests passed.");
