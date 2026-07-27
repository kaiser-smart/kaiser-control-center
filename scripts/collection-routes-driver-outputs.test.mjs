import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";

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
const detailPrintSource = sourceSlice(
  "function printCollectionRoutesSourcePdf",
  "function printCollectionRoutesSourceDriverPreview"
);
const offlineFactSource = sourceSlice(
  "function collectionRoutesSourceOfflineFact",
  "function collectionRoutesSourceOfflineStop"
);
const offlineStopSource = sourceSlice(
  "function collectionRoutesSourceOfflineStop",
  "function collectionRoutesSourceOfflinePackageHtml"
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
  "collectionRoutesPilotState.sourceImportError = \"\";",
  "collectionRoutesPilotState.sourceImportMessage = \"\";",
  "Detailní PDF s ${rows.length} řádky je připravené v systémovém tisku.",
  "Nevytvořila se ostrá trasa."
]) {
  assert.ok(detailPrintSource.includes(marker), `Detailní PDF postrádá pravdivou odezvu: ${marker}`);
}

for (const marker of [
  "Samostatný read-only soubor z aktuálního filtru.",
  "Ostrá trasa: NE",
  "Bez navigace, GPS, T-Cars, potvrzování svozu, SMS/e-mailů, automatizací a ostrých tras.",
  "data-collection-routes-offline-row-count",
  "data-collection-routes-offline-source-row",
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
  "Prohlížeč převzal offline balíček ${filename} s ${rows.length} řádky.",
  "Offline balíček se nepodařilo předat prohlížeči ke stažení.",
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

const runtimeRows = [
  {
    routeOrder: 1,
    customerName: "První zákazník",
    addressText: "První 1, Brno",
    wasteName: "SKO",
    containerLabel: "1× 240 l",
    frequency: "1x7",
    sourceKind: "vistos"
  },
  {
    routeOrder: 2,
    customerName: "Druhý zákazník",
    addressText: "Druhá 2, Brno",
    wasteName: "PAPÍR",
    containerLabel: "2× 1100 l",
    frequency: "1x14",
    sourceKind: "vistos"
  },
  {
    routeOrder: 3,
    customerName: "Třetí zákazník",
    addressText: "Třetí 3, Brno",
    wasteName: "PLAST",
    containerLabel: "1× 120 l",
    frequency: "1x30",
    sourceKind: "vistos"
  }
];
let capturedBlob = null;
let clickedDownload = false;
let removedDownloadLink = false;
let revokedDownloadUrl = "";
const scheduledTimeouts = [];
const runtimeContext = {
  Blob,
  __rows: runtimeRows,
  collectionRoutesPilotState: {
    vistosRouteFilters: { day: "all", week: "all", waste: "all" },
    sourceFilters: {},
    kommunalPairingLoadedAt: "2026-07-27T19:08:00+02:00"
  },
  document: {
    body: {
      append() {}
    },
    createElement(tagName) {
      assert.equal(tagName, "a");
      return {
        href: "",
        download: "",
        click() {
          clickedDownload = true;
        },
        remove() {
          removedDownloadLink = true;
        }
      };
    }
  },
  URL: {
    createObjectURL(blob) {
      capturedBlob = blob;
      return "blob:collection-routes-offline-test";
    },
    revokeObjectURL(url) {
      revokedDownloadUrl = url;
    }
  },
  window: {
    setTimeout(callback, delay) {
      scheduledTimeouts.push({ callback, delay });
      return scheduledTimeouts.length;
    }
  },
  escapeHtml(value) {
    return String(value ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll("\"", "&quot;");
  },
  collectionRoutesSourceRowsMetrics(rows) {
    return {
      rowCount: rows.length,
      containerCount: rows.reduce((total, row) => total + Number.parseInt(row.containerLabel, 10), 0),
      estimatedMinutes: rows.length * 3
    };
  },
  collectionRoutesSourceSelectedBatch() {
    return null;
  },
  collectionRoutesCurrentRouteSourceLabel() {
    return "Vistos API";
  },
  collectionRoutesCurrentRouteTitle() {
    return "Vistos Svoz Kaiser";
  },
  formatDateTime(value) {
    return String(value || "");
  },
  collectionRoutesSourceWasteFilterLabel() {
    return "vše";
  },
  collectionRoutesSourceBatchSourceLabel() {
    return "Vistos API";
  },
  collectionRoutesSourcePrintSummaryCard(label, value) {
    return `<article><span>${label}</span><strong>${value}</strong></article>`;
  },
  collectionRoutesMetricValue(value) {
    return String(value ?? 0);
  },
  collectionRoutesSourceDayLabel() {
    return "vše";
  },
  collectionRoutesSourceWeekLabel() {
    return "vše";
  },
  collectionRoutesSourceOfflinePackageStyles() {
    return "";
  },
  collectionRoutesSourceDriverStopTitle(row) {
    return row.customerName;
  },
  collectionRoutesSourceDriverWasteLabel(row) {
    return row.wasteName;
  },
  collectionRoutesSourceDriverContainerLabel(row) {
    return row.containerLabel;
  },
  collectionRoutesSourceVistosStatus() {
    return "OK";
  },
  collectionRoutesSourceDriverProblemLabel() {
    return "";
  },
  collectionRoutesSourceSourceLabel() {
    return "Vistos API";
  },
  collectionRoutesSourceVistosDetail() {
    return "read-only";
  }
};
vm.createContext(runtimeContext);
vm.runInContext(
  `${offlineFactSource}\n${offlineStopSource}\n${offlineHtmlSource}\n${downloadTextSource}`,
  runtimeContext
);
const runtimeHtml = vm.runInContext("collectionRoutesSourceOfflinePackageHtml(__rows)", runtimeContext);
runtimeContext.__html = runtimeHtml;
const downloadResult = vm.runInContext(
  'downloadText("offline-test.html", __html, "text/html;charset=utf-8")',
  runtimeContext
);
assert.equal(downloadResult.filename, "offline-test.html");
assert.equal(downloadResult.type, "text/html;charset=utf-8");
assert.equal(downloadResult.started, true);
assert.equal(clickedDownload, true);
assert.equal(removedDownloadLink, true);
assert.equal(capturedBlob?.type, "text/html;charset=utf-8");
assert.equal(await capturedBlob.text(), runtimeHtml);
assert.equal((runtimeHtml.match(/data-collection-routes-offline-stop/g) || []).length, runtimeRows.length);
assert.equal((runtimeHtml.match(/data-collection-routes-offline-source-row/g) || []).length, runtimeRows.length);
assert.match(runtimeHtml, new RegExp(`data-collection-routes-offline-row-count="${runtimeRows.length}"`));
assert.equal(scheduledTimeouts.length, 1);
assert.equal(scheduledTimeouts[0].delay, 1000);
scheduledTimeouts[0].callback();
assert.equal(revokedDownloadUrl, "blob:collection-routes-offline-test");

console.log("Collection routes driver output tests passed.");
