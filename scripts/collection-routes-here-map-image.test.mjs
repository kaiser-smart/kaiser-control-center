import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import { buildCollectionRoutesHereMapImageUrl } from "../functions/api/collection-routes/here-map-image.js";

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

assert.ok(envExample.includes("HERE_MAPS_API_KEY="), "Příklad prostředí musí popsat serverový HERE API key.");
assert.ok(!appSource.includes("HERE_MAPS_API_KEY"), "Serverový HERE secret nesmí obsahovat frontendový zdroj.");
assert.ok(appSource.includes("/api/collection-routes/here-map-image"));
assert.ok(appSource.includes("syncCollectionRoutesTestTabletHereMap"));

console.log("Collection routes HERE map image tests passed.");
