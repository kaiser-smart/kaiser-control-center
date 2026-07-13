import assert from "node:assert/strict";
import { versionModuleImports } from "./version-module-imports.mjs";

const source = `import { alpha } from "./alpha.js";
import {
  beta
} from "../beta.js";
import "./side-effect.js";
export { gamma } from "./gamma.js";
const lazy = import("./lazy.js");
import { mantra } from "./mantra.js?v=1.9";
import external from "external-package";
const untouched = 'from "./text-only.js"';
`;

const versioned = versionModuleImports(source, "0.1.546");

assert.match(versioned, /from "\.\/alpha\.js\?v=0\.1\.546"/);
assert.match(versioned, /from "\.\.\/beta\.js\?v=0\.1\.546"/);
assert.match(versioned, /import "\.\/side-effect\.js\?v=0\.1\.546"/);
assert.match(versioned, /from "\.\/gamma\.js\?v=0\.1\.546"/);
assert.match(versioned, /import\("\.\/lazy\.js"\)/);
assert.match(versioned, /from "\.\/mantra\.js\?v=1\.9&build=0\.1\.546"/);
assert.match(versioned, /from "external-package"/);
assert.match(versioned, /const untouched = 'from "\.\/text-only\.js"'/);

console.log("Versioned module import tests passed.");
