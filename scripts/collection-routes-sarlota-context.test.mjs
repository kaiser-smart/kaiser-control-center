import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";

import {
  buildCollectionRoutesSarlotaContext,
  sanitizeKaiserDirectoryForSarlota
} from "../functions/_lib/collection-routes-sarlota-context.js";
import {
  classifySarlotaMemoryTopics,
  getSarlotaUserMemory,
  rememberSarlotaExchange,
  setSarlotaMemoryConsent
} from "../functions/_lib/sarlota-user-memory.js";
import { collectionRoutesContextVariables } from "../functions/api/ai/elevenlabs/signed-url.js";
import {
  createElevenLabsClientTools,
  ELEVENLABS_CLIENT_TOOL_SCHEMAS
} from "../src/elevenLabsClientTools.js";
import { currentSarlotaNews, parseIrozhlasRss, __test as newsTest } from "../functions/_lib/sarlota-news.js";

const memoryApiSource = readFileSync(new URL("../functions/api/ai/sarlota/memory.js", import.meta.url), "utf8");
const localServerSource = readFileSync(new URL("./serve.mjs", import.meta.url), "utf8");

assert.match(memoryApiSource, /requireUserPermission\(env, request, "collection-routes", "view"\)/);
assert.doesNotMatch(memoryApiSource, /requireUserPermission\(env, request, "dashboard", "view"\)/);
assert.match(localServerSource, /"\/api\/ai\/collection-routes\/context"/);
assert.match(localServerSource, /"\/api\/ai\/sarlota\/memory"/);
assert.match(localServerSource, /@kaiser\\\.local\$\/i/);

function d1Database(sqlite) {
  return {
    prepare(sql) {
      return {
        bind(...values) {
          const statement = sqlite.prepare(sql);
          return {
            first: async () => statement.get(...values) || null,
            all: async () => ({ results: statement.all(...values) }),
            run: async () => {
              const result = statement.run(...values);
              return { meta: { changes: Number(result.changes || 0) } };
            }
          };
        },
        first: async () => sqlite.prepare(sql).get() || null,
        all: async () => ({ results: sqlite.prepare(sql).all() }),
        run: async () => {
          const result = sqlite.prepare(sql).run();
          return { meta: { changes: Number(result.changes || 0) } };
        }
      };
    }
  };
}

const sqlite = new DatabaseSync(":memory:");
sqlite.exec(readFileSync(new URL("../migrations/0011_create_ai_action_logs.sql", import.meta.url), "utf8"));
sqlite.exec(readFileSync(new URL("../migrations/0045_create_sarlota_user_memory.sql", import.meta.url), "utf8"));
const env = { SMART_ODPADY_DB: d1Database(sqlite), SARLOTA_ORGANIZATION_ID: "kaiser-test" };

const rssFixture = `<?xml version="1.0" encoding="utf-8"?>
<rss version="2.0"><channel>
  <item><title>První &amp; ověřený titulek</title><link>https://www.irozhlas.cz/zpravy-domov/prvni</link><pubDate>Sat, 18 Jul 2026 11:23:00 +0200</pubDate><description>Celý popis se nesmí předat.</description></item>
  <item><title><![CDATA[Druhý titulek]]></title><link>https://www.irozhlas.cz/zpravy-svet/druhy</link><pubDate>Sat, 18 Jul 2026 11:15:00 +0200</pubDate></item>
  <item><title>Nedůvěryhodný odkaz</title><link>https://example.com/podvrh</link><pubDate>Sat, 18 Jul 2026 11:10:00 +0200</pubDate></item>
  <item><title>Třetí titulek</title><link>https://www.irozhlas.cz/ekonomika/treti</link><pubDate>Sat, 18 Jul 2026 11:05:00 +0200</pubDate></item>
</channel></rss>`;

const parsedNews = parseIrozhlasRss(rssFixture);
assert.equal(parsedNews.length, 3);
assert.equal(parsedNews[0].title, "První & ověřený titulek");
assert.equal(parsedNews[0].url, "https://www.irozhlas.cz/zpravy-domov/prvni");
assert.equal(parsedNews[0].publishedAt, "2026-07-18T09:23:00.000Z");
assert.equal(JSON.stringify(parsedNews).includes("Celý popis"), false);
assert.equal(JSON.stringify(parsedNews).includes("example.com"), false);

newsTest.clearCache();
let rssFetchCount = 0;
const readyNews = await currentSarlotaNews({
  now: () => new Date("2026-07-18T09:30:00.000Z"),
  fetchImpl: async (url, options) => {
    rssFetchCount += 1;
    assert.equal(url, newsTest.NEWS_FEED_URL);
    assert.equal(options.redirect, "error");
    return new Response(rssFixture, {
      status: 200,
      headers: { "content-type": "application/rss+xml; charset=utf-8" }
    });
  }
});
assert.equal(readyNews.status, "ready");
assert.equal(readyNews.source, "iROZHLAS");
assert.equal(readyNews.items.length, 3);
assert.equal(readyNews.fetchedAt, "2026-07-18T09:30:00.000Z");
const cachedNews = await currentSarlotaNews({
  now: () => new Date("2026-07-18T09:31:00.000Z"),
  fetchImpl: async () => {
    rssFetchCount += 1;
    throw new Error("cache_should_prevent_fetch");
  }
});
assert.equal(cachedNews.status, "ready");
assert.equal(rssFetchCount, 1);

newsTest.clearCache();
const unavailableNews = await currentSarlotaNews({
  now: () => new Date("2026-07-18T09:32:00.000Z"),
  timeoutMs: 10,
  fetchImpl: async (_url, options) => new Promise((_, reject) => {
    options.signal.addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError")));
  })
});
assert.equal(unavailableNews.status, "unavailable");
assert.deepEqual(unavailableNews.items, []);

newsTest.clearCache();
const invalidNews = await currentSarlotaNews({
  now: () => new Date("2026-07-18T09:33:00.000Z"),
  fetchImpl: async () => new Response("<html>neplatný obsah</html>", {
    status: 200,
    headers: { "content-type": "text/html" }
  })
});
assert.equal(invalidNews.status, "invalid_response");
const miroslav = {
  id: "pneumatika-miroslav-vasek",
  name: "Miroslav Vašek",
  email: "miroslav@kaiser.example",
  phone: "+420111222333",
  role: "ridic",
  status: "active",
  active: true,
  position: "Řidič",
  managerId: "jan-manager"
};

assert.deepEqual(classifySarlotaMemoryTopics("Jedeme trasu, pak výsyp a bude pršet."), ["trasa", "počasí", "výsyp"]);
assert.equal((await getSarlotaUserMemory(env, miroslav)).consent, false);
let memory = await setSarlotaMemoryConsent(env, miroslav, true);
assert.equal(memory.consent, true);
memory = await rememberSarlotaExchange(env, miroslav, {
  conversationId: "conversation-1",
  userTranscript: "Dnes řešíme trasu, počasí a výsyp.",
  assistantAnswer: "Rozumím."
});
assert.equal(memory.previouslySpoken, true);
assert.equal(memory.conversationCount, 1);
assert.deepEqual(memory.topics, ["trasa", "počasí", "výsyp"]);
const stored = sqlite.prepare("SELECT * FROM sarlota_user_memory WHERE user_id = ?").get(miroslav.id);
assert.doesNotMatch(stored.summary, /Dnes řešíme|Rozumím/);
assert.doesNotMatch(stored.topics_json, /Dnes řešíme|Rozumím/);
const reused = await rememberSarlotaExchange(env, miroslav, {
  conversationId: "conversation-1",
  userTranscript: "Dnes řešíme trasu, počasí a výsyp."
});
assert.equal(reused.reused, true);
assert.equal(reused.conversationCount, 1);
memory = await rememberSarlotaExchange(env, miroslav, {
  conversationId: "conversation-2",
  userTranscript: "Kdo má dovolenou a kdo je nadřízený?"
});
assert.equal(memory.conversationCount, 2);
assert.ok(memory.topics.includes("dovolená"));
assert.ok(memory.topics.includes("nadřízený"));
const otherMemory = await getSarlotaUserMemory(env, { id: "cizi-ridic" });
assert.equal(otherMemory.previouslySpoken, false);
assert.deepEqual(otherMemory.topics, []);

const manager = {
  id: "jan-manager",
  name: "Jan Vedoucí",
  email: "jan@kaiser.example",
  phone: "+420999888777",
  role: "management",
  status: "active",
  active: true,
  position: "Vedoucí dopravy"
};
const localEmailDriver = {
  ...miroslav,
  id: "driver-placeholder-email",
  name: "Řidič Bez Mailu",
  email: "ridic@kaiser.local"
};
const directory = sanitizeKaiserDirectoryForSarlota([miroslav, manager, localEmailDriver], [{
  employeeId: manager.id,
  availability: "vacation",
  label: "Dovolená",
  dateFrom: "2026-07-18",
  dateTo: "2026-07-22",
  note: "citlivý důvod"
}]);
assert.deepEqual(Object.keys(directory[0]).sort(), ["availability", "function", "id", "manager", "name", "workEmail", "workPhone"]);
assert.equal(JSON.stringify(directory).includes("citlivý důvod"), false);
assert.equal(directory.find((item) => item.id === manager.id).availability.label, "Dovolená");
assert.equal(directory.find((item) => item.id === localEmailDriver.id).workEmail, "");

const routeDetail = {
  run: {
    id: "route-miroslav",
    scope: "test",
    status: "active",
    title: "TEST trasa",
    routeDate: "2026-07-18",
    vehicleLabel: "Míra · 1BP 8373",
    summary: { plannedCount: 2, doneCount: 1, problemCount: 0 },
    metadata: { physicalTesterName: "Tomáš Gaží" }
  },
  stops: [
    { id: "stop-1", routeOrder: 1, status: "planned", customerName: "Firma 1", addressText: "Trnkova 1", wasteType: "SKO" },
    { id: "stop-2", routeOrder: 2, status: "planned", customerName: "Firma 2", addressText: "Trnkova 2", wasteType: "SKO" }
  ]
};
const context = await buildCollectionRoutesSarlotaContext({}, miroslav, {
  scope: "test",
  detailOverride: routeDetail,
  usersOverride: [miroslav, manager],
  vehiclesOverride: {
    payload: {
      vehiclesVerified: true,
      vehiclesCount: 1,
      vehicles: [{ vehicleId: "v-1", displayName: "Míra", spz: "1BP 8373", type: "svoz" }]
    }
  },
  weatherOverride: { verified: true, summary: "Brno: 24 °C, jasno" },
  newsOverride: readyNews,
  availabilityOverride: [],
  memoryOverride: memory
});
assert.equal(context.route.id, "route-miroslav");
assert.equal(context.route.currentStop.customerName, "Firma 1");
assert.equal(context.route.followingStop.customerName, "Firma 2");
assert.equal(context.vehicles.verified, true);
assert.equal(context.news.status, "ready");
assert.equal(context.news.source, "iROZHLAS");
assert.equal(context.news.items.length, 3);
assert.match(context.introAnnouncement, /Ahoj Mirku\./);
assert.match(context.introAnnouncement, /Svačinu máš/);
assert.equal(JSON.stringify(context).includes("Tomáš Gaží"), false, "Fyzický TESTER nesmí vstoupit do hlasového kontextu řidiče.");
assert.deepEqual(context.safety, {
  readOnlyContext: true,
  requiresPhysicalConfirmationForWrites: true,
  sendsNotifications: false,
  changesVistos: false,
  changesProductionRoute: false
});

await assert.rejects(
  () => buildCollectionRoutesSarlotaContext({}, { ...miroslav, id: "cizi", role: "readonly" }, {
    detailOverride: routeDetail,
    usersOverride: [],
    vehiclesOverride: {},
    weatherOverride: {},
    availabilityOverride: [],
    memoryOverride: {}
  }),
  (error) => error.status === 403
);

const variables = await collectionRoutesContextVariables({}, miroslav, "/trasy-svozu/test", routeDetail);
assert.equal(variables.collection_route_scope, "test");
assert.equal(variables.collection_route_news_status, "test_override");
assert.match(variables.current_module_context, /HERE truck navigation/);
assert.doesNotMatch(variables.current_module_context, /Tomáš Gaží|physicalTesterName/);

const toolSchema = ELEVENLABS_CLIENT_TOOL_SCHEMAS.find((item) => item.name === "get_collection_routes_context");
assert.ok(toolSchema);
assert.match(toolSchema.description, /oficiálního RSS iROZHLAS/);
assert.match(toolSchema.description, /unavailable/);
let requestedPath = "";
const tools = createElevenLabsClientTools({
  requestJson: async (path) => {
    requestedPath = path;
    return { context };
  }
});
const toolContext = await tools.get_collection_routes_context({ date: "2026-07-18" });
assert.equal(toolContext.ok, true);
assert.match(requestedPath, /^\/api\/ai\/collection-routes\/context\?/);
assert.equal(toolContext.news.status, "ready");

memory = await setSarlotaMemoryConsent(env, miroslav, false);
assert.equal(memory.consent, false);
assert.equal(memory.conversationCount, 0);
assert.deepEqual(memory.topics, []);

console.log("collection routes Šarlota context and memory tests passed");
