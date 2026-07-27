import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const appSource = readFileSync(new URL("../src/app.js", import.meta.url), "utf8");

function sourceSlice(startMarker, endMarker) {
  const start = appSource.indexOf(startMarker);
  const end = appSource.indexOf(endMarker, start + startMarker.length);
  assert.ok(start >= 0, `Chybí začátek kontrolovaného toku: ${startMarker}`);
  assert.ok(end > start, `Chybí konec kontrolovaného toku: ${endMarker}`);
  return appSource.slice(start, end);
}

const routeActionsSource = sourceSlice(
  "function collectionRoutesVistosRouteActions",
  "function collectionRoutesSitesRefreshSecondsRemaining"
);
const currentRowsSource = sourceSlice(
  "function collectionRoutesCurrentRouteRows",
  "function collectionRoutesCurrentRouteTitle"
);
const printFrameSource = sourceSlice(
  "function printCollectionRoutesHtml",
  "function collectionRoutesSourcePrintStyles"
);
const driverPrintSource = sourceSlice(
  "function printCollectionRoutesSourceDriverPreview",
  "function collectionRoutesSourceOfflinePackageFilename"
);
const offlineHtmlSource = sourceSlice(
  "function collectionRoutesSourceOfflinePackageHtml",
  "function exportCollectionRoutesSourceOfflinePackage"
);
const offlineExportSource = sourceSlice(
  "function exportCollectionRoutesSourceOfflinePackage",
  "async function submitCollectionRoutesRouteOptimizationPreview"
);
const clickHandlerSource = sourceSlice(
  'const collectionRoutesSourcePrintPdf = event.target.closest("[data-collection-routes-source-print-pdf]")',
  'const collectionRoutesSourceView = event.target.closest("[data-collection-routes-source-view]")'
);
const downloadTextSource = sourceSlice(
  "function downloadText",
  "function downloadBlob"
);

for (const marker of [
  "data-collection-routes-source-print-driver",
  "Tisk pro řidiče",
  "data-collection-routes-source-offline-package",
  "Offline balíček",
  'rows.length ? "" : "disabled"',
  "collectionRoutesPilotState.sourceImportMessage",
  "collectionRoutesPilotState.sourceImportError",
  'role="status"',
  'role="alert"'
]) {
  assert.ok(routeActionsSource.includes(marker), `Akce trasy postrádají povinný prvek: ${marker}`);
}

assert.ok(
  currentRowsSource.includes("collectionRoutesVistosRouteDisplayRows()")
    && currentRowsSource.includes("collectionRoutesSourceDisplayRows()")
    && !currentRowsSource.includes(".slice("),
  "Tisk a offline balíček musí převzít úplný aktuální filtrovaný seznam bez skrytého limitu."
);

for (const marker of [
  'document.createElement("iframe")',
  "frameDocument.write(html)",
  "frameWindow.print()",
  "frameWindow.onafterprint = cleanup",
  "removeCollectionRoutesPrintFrame(frame)"
]) {
  assert.ok(printFrameSource.includes(marker), `Interní tiskový tok postrádá krok: ${marker}`);
}

for (const marker of [
  "const rows = collectionRoutesCurrentRouteRows();",
  "Není co tisknout pro řidiče.",
  'collectionRoutesSourcePrintStyles("driver")',
  "Svozové trasy · tisk pro řidiče",
  "Read-only tiskový podklad z aktuálního filtru.",
  "Ostrá trasa: NE",
  "Navigace/GPS: NE",
  "${rows.map((row) => `",
  "printCollectionRoutesHtml("
]) {
  assert.ok(driverPrintSource.includes(marker), `Tisk pro řidiče postrádá kontrakt: ${marker}`);
}

for (const marker of [
  "Samostatný read-only soubor z aktuálního filtru.",
  "Ostrá trasa: NE",
  "Bez navigace, GPS, T-Cars, potvrzování svozu, SMS/e-mailů, automatizací a ostrých tras.",
  "${rows.map((row, index) => collectionRoutesSourceOfflineStop(row, index)).join(\"\")}",
  "${rows.map((row, index) => `"
]) {
  assert.ok(offlineHtmlSource.includes(marker), `Offline balíček postrádá kontrakt: ${marker}`);
}

for (const marker of [
  "const rows = collectionRoutesCurrentRouteRows();",
  "Není co uložit do offline balíčku.",
  "collectionRoutesSourceOfflinePackageHtml(rows)",
  '"text/html;charset=utf-8"',
  "Nevytvořila se ostrá trasa."
]) {
  assert.ok(offlineExportSource.includes(marker), `Export offline balíčku postrádá krok: ${marker}`);
}

for (const marker of [
  "printCollectionRoutesSourceDriverPreview();",
  "exportCollectionRoutesSourceOfflinePackage();"
]) {
  assert.ok(clickHandlerSource.includes(marker), `Tlačítko není napojené na funkční tok: ${marker}`);
}

for (const [name, source] of [
  ["tisk pro řidiče", driverPrintSource],
  ["offline balíček", `${offlineHtmlSource}\n${offlineExportSource}`]
]) {
  for (const forbidden of [
    "apiJson(",
    'method: "POST"',
    'method: "PUT"',
    'method: "DELETE"',
    "sendSms",
    "sendEmail",
    "vistosWrite"
  ]) {
    assert.equal(source.includes(forbidden), false, `${name} nesmí obsahovat zápisový nebo komunikační tok: ${forbidden}`);
  }
}

assert.ok(
  downloadTextSource.includes("link.click()")
    && downloadTextSource.includes("link.remove()")
    && downloadTextSource.includes("window.setTimeout(() => URL.revokeObjectURL(url), 1000)"),
  "Blob URL offline exportu se smí zrušit až po předání downloadu prohlížeči."
);

console.log("Collection routes driver output tests passed.");
