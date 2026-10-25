import { mkdir, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { iconDefinitions } from "../src/components/icons/definitions.js";
import { SmartIcon } from "../src/components/icons/SmartIcon.js";
const output = new URL("../public/icons/ui/", import.meta.url);
await mkdir(output, { recursive: true });
for (const name of Object.keys(iconDefinitions)) await writeFile(new URL(`${name}.svg`, output), SmartIcon(name) + "\n");
console.log(`Exported ${Object.keys(iconDefinitions).length} SVG icons to ${fileURLToPath(output)}`);

// Keep the existing per-vehicle mapping paths, now with compact SVG assets.
const vehicleAliases = {
  "actros-vlek": "map-trailer",
  "audi-a1-v2": "map-car",
  "daf-abroll": "map-container",
  "daf-naves-jenda-v2": "map-trailer",
  "dodavka": "map-van",
  "ford-transit-v2": "map-van",
  "fuso-v2": "map-truck",
  "hyundai-vzv": "map-special",
  "iveco-rioned-v2": "map-truck",
  "kontejnerove-vozidlo": "map-container",
  "man-abroll": "map-container",
  "man-cisterna-v2": "map-truck",
  "man-popelarske": "map-car",
  "man-ramenac": "map-container",
  "manitou-mlt-630-v2": "map-special",
  "manitou-mlt-v2": "map-special",
  "manitou-mt-625h-v2": "map-special",
  "mercedes-abroll-v2": "map-container",
  "mercedes-cisterna-milanek-v2": "map-truck",
  "mercedes-citan-v2": "map-van",
  "mercedes-popelarske": "map-car",
  "mercedes-ramenac-v2": "map-container",
  "mercedes-skrin": "map-truck",
  "mercedes-sprinter-andrej-v2": "map-van",
  "mercedes-sprinter-el-v2": "map-van",
  "mercedes-vito": "map-van",
  "opel-astra-v2": "map-car",
  "opel-grandland-v2": "map-car",
  "osobni-vozidlo": "map-car",
  "prives-naves": "map-trailer",
  "skoda-citigo-v2": "map-car",
  "skoda-kamiq-v2": "map-car",
  "skoda-karoq-v2": "map-car",
  "specialni-technika": "map-special",
  "svozove-vozidlo": "map-truck",
  "toyota-proace-v2": "map-van"
};
const vehicleOutput = new URL("../public/vehicles/icons/", import.meta.url);
await mkdir(vehicleOutput, {recursive:true});
for (const [name, icon] of Object.entries(vehicleAliases)) await writeFile(new URL(`${name}.svg`, vehicleOutput), SmartIcon(icon) + "\n");
