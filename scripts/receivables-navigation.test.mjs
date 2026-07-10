import assert from "node:assert/strict";

import {
  receivablesActiveTab,
  receivablesHashTargetId
} from "../src/data/receivablesNavigation.js";

assert.equal(receivablesHashTargetId("#receivables-customers"), "receivables-customers");
assert.equal(receivablesHashTargetId("#receivables-dry-run"), "receivables-dry-run");
assert.equal(receivablesHashTargetId("#unknown"), "");
assert.equal(receivablesHashTargetId("#%E0%A4%A"), "");

assert.equal(receivablesActiveTab("dashboard", "#receivables-customers"), "customers");
assert.equal(receivablesActiveTab("dashboard", "#receivables-dry-run"), "dry-run");
assert.equal(receivablesActiveTab("dashboard", ""), "dashboard");
assert.equal(receivablesActiveTab("import", "#receivables-customers"), "import");

console.log("receivables navigation tests passed");
