import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const appSource = readFileSync(new URL("../src/app.js", import.meta.url), "utf8");
const styles = readFileSync(new URL("../src/styles.css", import.meta.url), "utf8");
const commandCenterSource = appSource.slice(
  appSource.indexOf("function dataBoxPlusCommandCenter()"),
  appSource.indexOf("function dataBoxPlusFilterOptions()")
);
const composeSource = appSource.slice(
  appSource.indexOf("function dataBoxPlusComposeOverlay()"),
  appSource.indexOf("function dataBoxPlusShortAssistantText")
);

assert.match(appSource, /commandCenterPage:\s*1/);
assert.match(commandCenterSource, /const pageSize = 5/);
assert.match(commandCenterSource, /slice\(startIndex, startIndex \+ pageSize\)/);
assert.match(commandCenterSource, /data-ds-plus-command-page=/);
assert.match(commandCenterSource, /Stránka \$\{currentPage\} z \$\{totalPages\}/);
assert.doesNotMatch(commandCenterSource, /\.slice\(0, 5\)/);
assert.match(appSource, /dataBoxPlusCommandPage = event\.target\.closest/);

assert.match(composeSource, /data-ds-plus-compose-recipient/);
assert.match(composeSource, /data-ds-plus-compose-form/);
assert.match(appSource, /Návrh nové datové zprávy je připravený v tomto okně/);
assert.match(styles, /\.ds-plus-command-pagination\s*\{/);
assert.match(styles, /\.ds-plus-compose-footer\s*\{/);

console.log("data-box-plus command center pagination and compose flow ok");
