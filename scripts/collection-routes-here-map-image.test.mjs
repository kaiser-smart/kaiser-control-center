import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import { createSessionCookie } from "../functions/_lib/auth.js";
import {
  buildCollectionRoutesHereMapImageUrl,
  onRequestGet as hereMapImageApi
} from "../functions/api/collection-routes/here-map-image.js";

const appSource = readFileSync(new URL("../src/app.js", import.meta.url), "utf8");
const envExample = readFileSync(new URL("../.env.example", import.meta.url), "utf8");

assert.throws(() => buildCollectionRoutesHereMapImageUrl({}, {
  addressLatitude: 49.1912,
  addressLongitude: 16.6701
}), /here_map_key_missing/);

assert.throws(() => buildCollectionRoutesHereMapImageUrl({ HERE_MAPS_API_KEY: "test-key" }, {}), /here_map_coordinates_missing/);

const url = buildCollectionRoutesHereMapImageUrl({ HERE_MAPS_API_KEY: "test-key" }, {
  addressLatitude: 49.19125931950087,
  addressLongitude: 16.670211574110382,
  measuredLatitude: 49.19131,
  measuredLongitude: 16.67027
});
assert.equal(url.origin, "https://image.maps.hereapi.com");
assert.equal(url.searchParams.get("apiKey"), "test-key");
assert.equal(url.searchParams.get("style"), "logistics.day");
assert.equal(url.searchParams.getAll("overlay").length, 2);
assert.ok(url.searchParams.getAll("overlay")[0].includes("label=A"));
assert.ok(url.searchParams.getAll("overlay")[1].includes("label=F"));
assert.ok(decodeURIComponent(url.pathname).includes("center:"));
assert.ok(decodeURIComponent(url.pathname).includes(";zoom=18"));
assert.ok(!decodeURIComponent(url.pathname).includes("overlay:padding=64"));

const farPointsUrl = buildCollectionRoutesHereMapImageUrl({ HERE_MAPS_API_KEY: "test-key" }, {
  addressLatitude: 49.19125931950087,
  addressLongitude: 16.670211574110382,
  measuredLatitude: 49.194,
  measuredLongitude: 16.674
});
assert.ok(decodeURIComponent(farPointsUrl.pathname).includes("overlay:padding=64"));

assert.ok(envExample.includes("HERE_MAPS_API_KEY="), "Příklad prostředí musí popsat serverový HERE API key.");
assert.ok(!appSource.includes("HERE_MAPS_API_KEY"), "Serverový HERE secret nesmí obsahovat frontendový zdroj.");
assert.ok(appSource.includes("/api/collection-routes/here-map-image"));
assert.ok(appSource.includes("syncCollectionRoutesTestTabletHereMap"));

const driver = {
  id: "driver-here-map",
  name: "Řidič HERE test",
  role: "ridic",
  status: "active",
  active: true,
  modules: ["tyres", "absence"]
};
const endpointEnv = {
  AUTH_USERS_JSON: JSON.stringify([driver]),
  AUTH_SESSION_SECRET: "collection-routes-here-map-test-secret",
  HERE_MAPS_API_KEY: "test-key"
};
const cookie = (await createSessionCookie(endpointEnv, driver)).split(";")[0];
const originalFetch = globalThis.fetch;
globalThis.fetch = async () => new Response(new Uint8Array([137, 80, 78, 71]), {
  status: 200,
  headers: { "Content-Type": "image/png" }
});
try {
  const endpointResponse = await hereMapImageApi({
    request: new Request("https://smart-odpady.ai/api/collection-routes/here-map-image?addressLatitude=49.1912&addressLongitude=16.6701", {
      headers: { Cookie: cookie }
    }),
    env: endpointEnv
  });
  assert.equal(endpointResponse.status, 200, "Přihlášený řidič musí načíst read-only HERE mapu.");
  assert.equal(endpointResponse.headers.get("Content-Type"), "image/png");

  const anonymousResponse = await hereMapImageApi({
    request: new Request("https://smart-odpady.ai/api/collection-routes/here-map-image?addressLatitude=49.1912&addressLongitude=16.6701"),
    env: endpointEnv
  });
  assert.equal(anonymousResponse.status, 401);
} finally {
  globalThis.fetch = originalFetch;
}

console.log("Collection routes HERE map image tests passed.");
