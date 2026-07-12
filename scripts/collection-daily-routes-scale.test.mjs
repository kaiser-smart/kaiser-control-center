import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";

import {
  CollectionDailyRoutesError,
  createCollectionDailyRouteDraft,
  previewCollectionDailyRoute
} from "../functions/_lib/collection-daily-routes-store.js";
import {
  COLLECTION_DAILY_ROUTE_STOP_PAGE_SIZE,
  collectionDailyRouteNextVisibleStopCount,
  collectionDailyRouteVisibleStopCount
} from "../src/data/collectionDailyRoutesScale.js";

class D1Statement {
  constructor(owner, sql, values = []) {
    this.owner = owner;
    this.sql = sql;
    this.values = values;
  }

  bind(...values) {
    assert.ok(values.length <= 100, `D1 statement překročil 100 parametrů: ${values.length}`);
    return new D1Statement(this.owner, this.sql, values);
  }

  async all() {
    this.owner.statementExecutions += 1;
    return { results: this.owner.database.prepare(this.sql).all(...this.values) };
  }

  async first() {
    this.owner.statementExecutions += 1;
    return this.owner.database.prepare(this.sql).get(...this.values) || null;
  }

  async run() {
    this.owner.statementExecutions += 1;
    return { success: true, meta: this.owner.database.prepare(this.sql).run(...this.values) };
  }
}

class D1Database {
  constructor(database) {
    this.database = database;
    this.statementExecutions = 0;
    this.batchSizes = [];
    this.failBatchStatement = 0;
  }

  prepare(sql) {
    return new D1Statement(this, sql);
  }

  resetStats() {
    this.statementExecutions = 0;
    this.batchSizes = [];
  }

  async batch(statements) {
    this.batchSizes.push(statements.length);
    this.database.exec("BEGIN");
    try {
      const results = [];
      for (let index = 0; index < statements.length; index += 1) {
        if (this.failBatchStatement === index + 1) {
          throw new CollectionDailyRoutesError(
            "Vynucená chyba zátěžového testu.",
            500,
            "collection_daily_route_scale_forced_failure"
          );
        }
        const statement = statements[index];
        results.push(await statement.run());
      }
      this.database.exec("COMMIT");
      return results;
    } catch (error) {
      this.database.exec("ROLLBACK");
      throw error;
    }
  }
}

function openDatabase(rowCount) {
  const sqlite = new DatabaseSync(":memory:");
  for (const migration of [
    "../migrations/0001_create_users.sql",
    "../migrations/0002_add_user_manager.sql",
    "../migrations/0017_create_collection_routes_phase1a.sql",
    "../migrations/0038_create_collection_daily_routes.sql"
  ]) {
    sqlite.exec(readFileSync(new URL(migration, import.meta.url), "utf8"));
  }

  sqlite.prepare(`
    INSERT INTO collection_import_batches (
      id, source, source_mode, status, api_status, message, row_count, issue_count,
      created_by_user_id, created_at, finished_at, metadata_json
    ) VALUES (
      'batch-scale', 'vistos', 'vistos-komunal-preview', 'preview', 'ready', 'scale test', ?, 0,
      'dispatcher-scale', '2026-07-12T10:00:00.000Z', '2026-07-12T10:00:00.000Z', '{}'
    )
  `).run(rowCount);

  const insertRow = sqlite.prepare(`
    INSERT INTO collection_import_rows (
      id, batch_id, row_number, source_entity, source_id, status, summary_json, issues_json, created_at
    ) VALUES (?, 'batch-scale', ?, 'ContractRow', ?, 'preview', ?, '[]', '2026-07-12T10:00:00.000Z')
  `);
  const sourceRowIds = [];
  sqlite.exec("BEGIN");
  for (let index = 1; index <= rowCount; index += 1) {
    const id = `row-scale-${String(index).padStart(4, "0")}`;
    sourceRowIds.push(id);
    insertRow.run(id, index, `source-${id}`, JSON.stringify({
      sourceContractId: `contract-scale-${index}`,
      contractId: `contract-scale-${index}`,
      contractNumber: `KS-SCALE-${String(index).padStart(4, "0")}`,
      customerName: `Zátěžový zákazník ${index}`,
      addressRaw: `Testovací ${index}, Brno`,
      addressPlaceRaw: `Testovací ${index}, Brno`,
      stationName: `Stanoviště ${index}`,
      siteName: `Stanoviště ${index}`,
      wasteType: index % 2 ? "SKO" : "PAPÍR",
      wasteCode: index % 2 ? "20 03 01" : "20 01 01",
      frequency: "1x7",
      containerVolume: index % 3 ? 1100 : 240,
      containerCount: 1,
      containerType: "nádoba",
      pickupDaysText: "pondělí lichá, pondělí sudá",
      serviceMode: "regular",
      onDemand: false,
      svozKaiserIncluded: true,
      issueCount: 0,
      note: "Syntetický zátěžový test"
    }));
  }
  sqlite.exec("COMMIT");

  return { sqlite, sourceRowIds };
}

async function runScaleScenario(rowCount) {
  const { sqlite, sourceRowIds } = openDatabase(rowCount);
  const d1 = new D1Database(sqlite);
  const env = { SMART_ODPADY_DB: d1 };
  const dispatcher = {
    id: "dispatcher-scale",
    name: "Zátěžový dispečer",
    role: "dispecer",
    status: "active",
    active: true
  };

  const previewStart = performance.now();
  const preview = await previewCollectionDailyRoute(env, {
    routeDate: "2026-07-13",
    vehicleCode: "A",
    sourceBatchId: "batch-scale",
    sourceRowIds
  });
  const previewMs = performance.now() - previewStart;
  assert.equal(preview.selectedCount, rowCount);
  assert.equal(preview.eligibleCount, rowCount);
  assert.equal(preview.excludedCount, 0);
  assert.equal(preview.createsOperationalRoute, false);

  d1.resetStats();
  const createStart = performance.now();
  const created = await createCollectionDailyRouteDraft(env, dispatcher, {
    routeDate: "2026-07-13",
    vehicleCode: "A",
    sourceBatchId: "batch-scale",
    sourceRowIds
  });
  const createMs = performance.now() - createStart;

  assert.equal(created.run.stopCount, rowCount);
  assert.equal(created.stops.length, rowCount);
  assert.equal(created.stops[0].routeOrder, 1);
  assert.equal(created.stops.at(-1).routeOrder, rowCount);
  assert.equal(sqlite.prepare("SELECT COUNT(*) AS count FROM collection_daily_route_stops").get().count, rowCount);
  assert.equal(sqlite.prepare("SELECT COUNT(*) AS count FROM collection_daily_route_events").get().count, 1);

  const expectedStopInsertStatements = Math.ceil(rowCount / 4);
  assert.equal(d1.batchSizes.at(-1), expectedStopInsertStatements + 2);
  assert.ok(
    d1.statementExecutions <= expectedStopInsertStatements + 15,
    `${rowCount} zastávek použilo příliš mnoho D1 operací: ${d1.statementExecutions}`
  );
  assert.ok(d1.statementExecutions < 300, `${rowCount} zastávek překročilo bezpečný limit 300 D1 operací.`);

  const result = {
    rowCount,
    previewMs: Math.round(previewMs),
    createMs: Math.round(createMs),
    d1Statements: d1.statementExecutions,
    insertStatements: expectedStopInsertStatements,
    responseBytes: Buffer.byteLength(JSON.stringify(created))
  };
  sqlite.close();
  return result;
}

async function assertScaleBatchRollback() {
  const { sqlite, sourceRowIds } = openDatabase(60);
  const d1 = new D1Database(sqlite);
  d1.failBatchStatement = 5;
  const env = { SMART_ODPADY_DB: d1 };
  const dispatcher = {
    id: "dispatcher-scale",
    name: "Zátěžový dispečer",
    role: "dispecer",
    status: "active",
    active: true
  };
  await assert.rejects(
    createCollectionDailyRouteDraft(env, dispatcher, {
      routeDate: "2026-07-13",
      vehicleCode: "A",
      sourceBatchId: "batch-scale",
      sourceRowIds
    }),
    (error) => error.code === "collection_daily_route_scale_forced_failure"
  );
  assert.equal(sqlite.prepare("SELECT COUNT(*) AS count FROM collection_daily_route_runs").get().count, 0);
  assert.equal(sqlite.prepare("SELECT COUNT(*) AS count FROM collection_daily_route_stops").get().count, 0);
  assert.equal(sqlite.prepare("SELECT COUNT(*) AS count FROM collection_daily_route_events").get().count, 0);
  sqlite.close();
}

const results = [];
for (const rowCount of [60, 300, 900, 1000]) {
  results.push(await runScaleScenario(rowCount));
}
await assertScaleBatchRollback();

assert.equal(COLLECTION_DAILY_ROUTE_STOP_PAGE_SIZE, 100);
assert.equal(collectionDailyRouteVisibleStopCount(60), 60);
assert.equal(collectionDailyRouteVisibleStopCount(900), 100);
assert.equal(collectionDailyRouteNextVisibleStopCount(900, 100), 200);
assert.equal(collectionDailyRouteNextVisibleStopCount(900, 850), 900);
assert.equal(collectionDailyRouteNextVisibleStopCount(900, 900), 900);

const appSource = readFileSync(new URL("../src/app.js", import.meta.url), "utf8");
const styleSource = readFileSync(new URL("../src/styles.css", import.meta.url), "utf8");
assert.match(appSource, /data-collection-daily-route-show-more/);
assert.match(appSource, /data-collection-daily-driver-show-more/);
assert.match(appSource, /Zobrazeno \$\{escapeHtml\(visibleStopCount\)\} z/);
assert.match(styleSource, /\.collection-daily-route-pagination/);

console.log("collection daily routes scale tests: ok");
console.log(JSON.stringify(results, null, 2));
