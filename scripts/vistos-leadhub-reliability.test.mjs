import assert from "node:assert/strict";
import { __test, runVistosLeadHubProfileSync, executeVistosLeadHubHistoricalImport,
  withVistosLeadHubWriter, readVistosLeadHubProfileSyncStatus } from "../functions/_lib/vistos-leadhub-profile-sync.js";
import { WRITER_LOCK_KEY, SYNC_PREFIX, WRITER_BUDGET_MS, WRITER_QUIET_MS,
  LAST_ATTEMPT_KEY, recoveryDue, releaseWriter, writerContext } from "../functions/_lib/vistos-leadhub-writer.js";
import { VistosContinuationController } from "../workers/vistos-leadhub-profile-sync-runner.js";

const stateKey = `${SYNC_PREFIX}/state.json`;
class R2 {
  constructor(seed = {}) { this.values = new Map(Object.entries(seed).map(([key, value]) => [key, JSON.stringify(value)])); }
  read(key = stateKey) { const text = this.values.get(key); return text === undefined ? null : JSON.parse(text); }
  etag(key) { return `"${__test.fingerprint(this.values.get(key))}"`; }
  async get(key) {
    if (!this.values.has(key)) return null;
    // R2ObjectBody is a snapshot with a single-use body, like Response.
    // Re-reading a consumed lock must fail here just as it does in production.
    const body = new Response(this.values.get(key));
    return { json: () => body.json(), httpEtag: this.etag(key) };
  }
  async head(key) { return this.values.has(key) ? { key } : null; }
  async put(key, value, options = {}) {
    if (options.onlyIf?.get("If-None-Match") === "*" && this.values.has(key)) return null;
    if (options.onlyIf?.get("If-Match") && options.onlyIf.get("If-Match") !== this.etag(key)) return null;
    this.values.set(key, String(value)); return { key, httpEtag: this.etag(key) };
  }
  async delete(key) { this.values.delete(key); }
  async list({ prefix, limit }) {
    const keys = [...this.values.keys()].filter(key => key.startsWith(prefix));
    return { objects: keys.slice(0, limit).map(key => ({ key })), truncated: keys.length > limit };
  }
}
const nativeFetch = globalThis.fetch, nativeTimeout = globalThis.setTimeout;
const recoveryLimiter = Object.assign(async () => {}, { persist: async () => {} });
const subs = [{ code: "newsletters", state: "unsubscribed" }, { code: "svatky", state: "subscribed" }];
const baseline = "2026-09-11T00:00:00.000Z";
const schedule = minute => `2026-09-11T00:${String(minute).padStart(2, "0")}:00.000Z`;
const rows = [1, 2, 3].map(id => ({ Id: String(id), Email1: `contact-${id}@example.test`, FirstName: "Jan",
  LastName: "Test", DoNotWorkCompany: false, Parent_FK: null, Modified: baseline }));
function fixture(selected = rows) {
  const storage = new R2({ [stateKey]: { checkpoint: baseline, appliedCheckpoint: baseline,
    profiles: {}, modifiedFilterVerification: { testedAt: new Date().toISOString() },
    snapshotKey: "snapshot", dnsKey: "dns", pending: selected.map(row => ({ contactId: row.Id,
      normalizedEmail: row.Email1, firstName: row.FirstName, lastName: row.LastName, desired: "active" })) },
    snapshot: { rows: selected, schemaMetadata: Object.keys(rows[0]).map(field => ({ field, caption: field === "DoNotWorkCompany" ? "Už nepracuje ve firmě" : field,
      datatype: field === "DoNotWorkCompany" ? "Boolean" : "String" })) },
    dns: { results: { "example.test": { status: "VALID_DOMAIN", checkedAt: baseline } } } });
  const env = { R2_ARCHIVE: storage, LEADHUB_API_TOKEN: "synthetic", VISTOS_API_BASE_URL: "https://vistos.example.test",
    VISTOS_API_USERNAME: "synthetic", VISTOS_API_PASSWORD: "synthetic", syncApiLimiter: recoveryLimiter };
  const profiles = new Map(); const writes = []; const requestedFilters = [];
  const faults = {};
  globalThis.fetch = async (url, options = {}) => {
    if (url.includes("vistos.example.test")) {
      const body = JSON.parse(options.body);
      if (faults.vistos) return Response.json({}, { status: 503 });
      if (body.LoginParam) return Response.json({ status: "OK" }, { headers: { "Set-Cookie": "VistosAccessToken=synthetic" } });
      if (body.GetByIdParam) {
        const id = String(body.GetByIdParam.EntityId);
        if (id === faults.contact) return Response.json({}, { status: 500 });
        return Response.json({ status: "OK", data: selected.find(row => row.Id === id) });
      }
      requestedFilters.push(body.GetPageParam.Filter);
      return Response.json({ status: "OK", data: { recordsTotal: selected.length, recordsFiltered: 0, data: [] } });
    }
    if (url.includes("/subscriptions/")) {
      assert.equal(options.method, "GET", "newsletter and nameday subscriptions are strictly READ-only");
      return Response.json(url.endsWith("/suppressed") ? { is_suppressed: true } : { subscriptions: subs });
    }
    if (url.includes("/campaigns")) return Response.json([]);
    if (options.method === "PUT") {
      assert.ok(url.endsWith("/profiles"));
      const body = JSON.parse(options.body);
      assert.ok(Object.keys(body).every(key => ["email_address", "user_id", "first_name", "last_name"].includes(key)));
      assert.equal(profiles.has(body.email_address), false, "retry cannot create an already accepted profile");
      profiles.set(body.email_address, { credentials: body, tags: [] }); writes.push(body);
      if (faults.acceptThenTimeout) throw new DOMException("synthetic accepted request timeout", "TimeoutError");
      return new Response(null, { status: 202 });
    }
    if (options.method === "POST") {
      assert.ok(url.endsWith("/profiles/tags"));
      const body = JSON.parse(options.body);
      const profile = [...profiles.values()].find(row => row.credentials.user_id === body.profile_identification.user_id);
      assert.ok(profile); profile.tags = [body.tag]; writes.push(body);
      return new Response(null, { status: 202 });
    }
    assert.equal(options.method, "GET");
    const email = decodeURIComponent(url.split("/").at(-1));
    if (faults.leadhub || email === faults.badRead) return Response.json({}, { status: 503 });
    const profile = profiles.get(email);
    return profile ? Response.json(profile) : new Response(null, { status: 404 });
  };
  return { storage, env, profiles, writes, faults, requestedFilters };
}
function expire(storage) {
  const lock = storage.read(WRITER_LOCK_KEY);
  lock.expiresAt = "2026-01-01T00:00:00Z"; lock.nextAttemptAt = null;
  storage.values.set(WRITER_LOCK_KEY, JSON.stringify(lock));
}
// Wall waits only are removed; actual request signals, storage CAS and the
// production coordinator execute unchanged. Rate pacing is tested separately.
globalThis.setTimeout = (fn, ms, ...args) => nativeTimeout(fn, ms >= 1000 ? 0 : ms, ...args);
try {
  let f = fixture();
  let result = await runVistosLeadHubProfileSync(f.env, { scheduledAt: schedule(1) });
  assert.equal(result.readbackConfirmed, 3); assert.equal(f.writes.length, 6);
  assert.equal(f.storage.read(WRITER_LOCK_KEY).phase, "RELEASED", "successful single-use R2 readback releases the writer immediately");
  assert.equal(f.storage.read().appliedCheckpoint, schedule(1));
  assert.ok(Object.values(f.storage.read().profiles).every(profile => JSON.stringify(profile.subscriptions) === JSON.stringify(subs) && profile.suppressed));
  await runVistosLeadHubProfileSync(f.env, { scheduledAt: schedule(2) });
  assert.equal(f.writes.length, 6, "worker restart and repeated source capture are idempotent");
  assert.equal(f.storage.read().lastRun.readbackConfirmed, 0, "empty batch completes and schedules further work");
  assert.equal(f.storage.read(WRITER_LOCK_KEY).phase, "RELEASED", "empty successor releases without waiting for recovery");
  assert.equal(f.storage.read().appliedCheckpoint, schedule(2));
  assert.ok(JSON.stringify(f.requestedFilters.at(-1)).includes("2026-09-10T23:51:00Z"), "next capture uses persisted cursor with overlap");

  f = fixture(); f.faults.contact = "1";
  result = await runVistosLeadHubProfileSync(f.env, { scheduledAt: schedule(1) });
  assert.equal(result.status, "partial"); assert.equal(result.failed, 1); assert.equal(result.readbackConfirmed, 2);
  assert.equal(f.storage.read().capturedCheckpoint, schedule(1)); assert.equal(f.storage.read().appliedCheckpoint, baseline);
  assert.equal(f.storage.read().pending.length, 1); assert.equal(f.storage.read().recordRetries["1"].attempts, 1);
  assert.equal(f.storage.read(WRITER_LOCK_KEY).phase, "RELEASED", "one pre-write error cannot retain the global lock");
  f.faults.contact = null;
  const retryState = f.storage.read(); retryState.recordRetries["1"].nextAttemptAt = "invalid legacy timestamp";
  f.storage.values.set(stateKey, JSON.stringify(retryState));
  result = await runVistosLeadHubProfileSync(f.env, { scheduledAt: schedule(2) });
  assert.equal(result.readbackConfirmed, 1); assert.equal(f.writes.length, 6); assert.equal(f.storage.read().pending.length, 0);
  assert.equal(f.storage.read().recordRetries["1"], undefined, "missing/invalid legacy retry time cannot strand a contact");

  f = fixture(); f.faults.vistos = true;
  await assert.rejects(() => runVistosLeadHubProfileSync(f.env, { scheduledAt: schedule(1) }), error => error.code === "vistos_api_execute_failed");
  assert.equal(f.storage.read().checkpoint, baseline); assert.equal(f.writes.length, 0);
  assert.equal(f.storage.read(WRITER_LOCK_KEY).phase, "RELEASED");
  assert.equal(f.storage.read(LAST_ATTEMPT_KEY).status, "RETRY_WAIT");

  f = fixture(); f.faults.leadhub = true;
  result = await runVistosLeadHubProfileSync(f.env, { scheduledAt: schedule(1) });
  assert.equal(result.failed, 3); assert.equal(f.writes.length, 0); assert.equal(f.storage.read().pending.length, 3);
  assert.equal(f.storage.read().appliedCheckpoint, baseline);

  // A lost HTTP response after provider acceptance is NOT a failed mutation.
  f = fixture([rows[0]]); f.faults.acceptThenTimeout = true;
  await assert.rejects(() => runVistosLeadHubProfileSync(f.env, { scheduledAt: schedule(1) }), /synthetic accepted request timeout/);
  assert.equal(f.writes.length, 1); assert.ok(f.storage.read(WRITER_LOCK_KEY));
  expire(f.storage);
  result = await executeVistosLeadHubHistoricalImport(f.env);
  assert.equal(result.profilesQuarantined, 1); assert.equal(f.writes.length, 1);
  assert.equal(f.storage.read(WRITER_LOCK_KEY).phase, "RELEASED");
  await runVistosLeadHubProfileSync(f.env, { scheduledAt: schedule(2) });
  assert.equal(f.writes.length, 1, "unknown accepted request is never replayed");

  // Crash after provider readback, then crash at every recovery persistence
  // boundary. Adoption is monotonic and its counters change exactly once.
  for (const boundary of ["state", "receipt", "cleanup"]) {
    f = fixture(); const put = f.storage.put.bind(f.storage);
    f.storage.put = async (key, ...args) => {
      if (key === stateKey && f.writes.length) throw new Error("synthetic ledger unavailable");
      return put(key, ...args);
    };
    await assert.rejects(() => runVistosLeadHubProfileSync(f.env, { scheduledAt: schedule(1) }), /ledger unavailable/);
    assert.equal(f.writes.length, 6);
    f.storage.put = put; expire(f.storage);
    let fail = true;
    f.storage.put = async (key, ...args) => {
      if (fail && ((boundary === "state" && key === stateKey) || (boundary === "receipt" && key.endsWith("/settled.json")))) {
        fail = false; throw new Error(`synthetic recovery ${boundary}`);
      }
      if (fail && boundary === "cleanup" && key === WRITER_LOCK_KEY && JSON.parse(args[0]).phase === "RELEASED") {
        fail = false; throw new Error("synthetic recovery cleanup");
      }
      return put(key, ...args);
    };
    await assert.rejects(() => executeVistosLeadHubHistoricalImport(f.env), /synthetic recovery/);
    assert.ok(f.storage.read(WRITER_LOCK_KEY)); expire(f.storage);
    result = await executeVistosLeadHubHistoricalImport(f.env);
    assert.equal(result.lockReleased, true); assert.equal(f.writes.length, 6);
    assert.equal(f.storage.read().totals.created, 3); assert.equal(f.storage.read().pending.length, 0);
    assert.equal(f.storage.read(LAST_ATTEMPT_KEY).retryCount, 2);
    await runVistosLeadHubProfileSync(f.env, { scheduledAt: schedule(2) });
    assert.equal(f.writes.length, 6);
  }

  // A recovered writer must not overwrite a newer storage version, even if
  // an old R2 request arrives late. Lease expiry also fences provider dispatch.
  f = fixture();
  const concurrentRuns = await Promise.allSettled([1, 2].map(() => runVistosLeadHubProfileSync(f.env, { scheduledAt: schedule(1) })));
  assert.equal(concurrentRuns.filter(run => run.status === "fulfilled").length, 1);
  assert.equal(concurrentRuns.find(run => run.status === "rejected").reason.code, "vistos_leadhub_writer_locked");
  assert.equal(f.writes.length, 6); assert.equal(f.storage.read().totals.created, 3);
  const nextRuns = await Promise.allSettled([1, 2].map(() => runVistosLeadHubProfileSync(f.env, { scheduledAt: schedule(2) })));
  assert.equal(nextRuns.filter(run => run.status === "fulfilled").length, 1, "released tombstone has exactly one successor");
  assert.equal(f.writes.length, 6);

  const cleanupLock = { owner: "old-cleanup", startedAt: baseline, expiresAt: new Date(Date.now() + 60000).toISOString() };
  const cleanupStorage = new R2({ [WRITER_LOCK_KEY]: cleanupLock });
  const cleanupPut = cleanupStorage.put.bind(cleanupStorage);
  cleanupStorage.delete = async () => assert.fail("writer locks must never use unconditional delete");
  cleanupStorage.put = async (key, value, options) => {
    // The request was dispatched by the old writer, then reached R2 only after
    // recovery/new acquisition had already replaced its generation.
    cleanupStorage.values.set(key, JSON.stringify({ ...cleanupLock, owner: "new-owner" }));
    return cleanupPut(key, value, options);
  };
  await assert.rejects(() => releaseWriter(cleanupStorage, writerContext(cleanupStorage, cleanupLock)),
    error => error.code === "writer_fence_lost");
  assert.equal(cleanupStorage.read(WRITER_LOCK_KEY).owner, "new-owner", "late cleanup cannot erase a newer owner");
  const storage = new R2({ [stateKey]: { checkpoint: baseline, pending: [] } });
  await withVistosLeadHubWriter({ R2_ARCHIVE: storage }, async (writer, scoped) => {
    await scoped.R2_ARCHIVE.get(stateKey);
    storage.values.set(stateKey, JSON.stringify({ marker: "newer-state" }));
    await assert.rejects(() => scoped.R2_ARCHIVE.put(stateKey, "{}"), error => error.code === "writer_state_conflict");
    assert.equal(storage.read().marker, "newer-state");
    const now = Date.now;
    Date.now = () => writer.deadline + WRITER_QUIET_MS + 1;
    try {
      assert.equal(recoveryDue(storage.read(WRITER_LOCK_KEY)), true);
      await assert.rejects(() => scoped.R2_ARCHIVE.put(stateKey, "{}"), error => error.code === "writer_deadline_exceeded");
      await assert.rejects(() => __test.leadHubRequest({ ...scoped, LEADHUB_API_TOKEN: "synthetic" }, "/profiles", { method: "PUT", body: {} }),
        error => error.code === "writer_deadline_exceeded");
    } finally { Date.now = now; }
  });
  assert.equal(WRITER_BUDGET_MS < 120000, true, "server deadline precedes runner transport timeout");

  // Concurrent recovery claims: exactly one can adopt and release the batch.
  const oldLock = { owner: "parallel-recovery", startedAt: baseline };
  const parallelR2 = new R2({ [stateKey]: { checkpoint: baseline, pending: [] }, [WRITER_LOCK_KEY]: oldLock });
  const parallel = await Promise.allSettled([1, 2].map(() => executeVistosLeadHubHistoricalImport({ R2_ARCHIVE: parallelR2, syncApiLimiter: recoveryLimiter })));
  assert.equal(parallel.filter(result => result.status === "fulfilled").length, 1);
  assert.equal(parallelR2.read(WRITER_LOCK_KEY).phase, "RELEASED");

  // A crashed recovery handler (no catch/finally) cannot keep RECONCILING forever.
  const crashedClaim = new R2({ [stateKey]: { checkpoint: baseline, pending: [] },
    [WRITER_LOCK_KEY]: { ...oldLock, phase: "RECONCILING", claimId: "dead-process", claimedAt: baseline, expiresAt: baseline, retryCount: 2 } });
  result = await executeVistosLeadHubHistoricalImport({ R2_ARCHIVE: crashedClaim, syncApiLimiter: recoveryLimiter });
  assert.equal(result.lockReleased, true); assert.equal(result.retryCount, 3);

  // One persistently broken profile read is quarantined after bounded READ
  // retries, while an outage of all endpoints preserves the batch for retry.
  for (const outage of [false, true]) {
    const journal = { contactId: "1", normalizedEmail: rows[0].Email1, desired: "active", status: "WRITE_INTENT",
      beforeSafety: { subscriptions: subs, suppressed: true } };
    const recoveryStorage = new R2({ [stateKey]: { checkpoint: baseline, profiles: {}, pending: [{ contactId: "1", normalizedEmail: rows[0].Email1 }] },
      [WRITER_LOCK_KEY]: oldLock, [`${SYNC_PREFIX}/operations/${oldLock.owner}/1.json`]: journal });
    globalThis.fetch = async (url, options) => {
      assert.equal(options.method, "GET");
      if (!outage && url.includes("/subscriptions/")) return Response.json(url.endsWith("/suppressed") ? { is_suppressed: true } : { subscriptions: subs });
      return Response.json({}, { status: 503 });
    };
    for (let attempt = 1; attempt <= 3; attempt++) {
      expire(recoveryStorage);
      const recover = () => executeVistosLeadHubHistoricalImport({ R2_ARCHIVE: recoveryStorage, LEADHUB_API_TOKEN: "synthetic", syncApiLimiter: recoveryLimiter });
      if (outage || attempt < 3) await assert.rejects(recover);
      else assert.equal((await recover()).profilesQuarantined, 1);
    }
    assert.equal(recoveryStorage.read(WRITER_LOCK_KEY).phase !== "RELEASED", outage);
    if (outage) assert.equal(recoveryStorage.read().quarantinedIdentities, undefined, "global outage cannot mass-quarantine contacts");
  }

  // The READ-only identity export also has a lifecycle, deadline and retry.
  for (const jobState of ["stale", "failed", "processing", "missing"]) {
    const exportState = { checkpoint: baseline, identityPending: { "1": true },
      identityExport: { jobId: "job", requestedAt: jobState === "stale" ? baseline : new Date().toISOString(), contactIds: ["1"] } };
    const exportStorage = new R2({ [stateKey]: exportState });
    globalThis.fetch = async (_, options) => {
      assert.equal(options.method, "GET");
      return jobState === "missing" ? new Response(null, { status: 404 })
        : Response.json({ job_id: "job", state: jobState, errors: null });
    };
    await __test.refreshDeltaIdentities({ R2_ARCHIVE: exportStorage, LEADHUB_API_TOKEN: "synthetic" }, exportState, new Map());
    assert.deepEqual(exportState.identityPending, { "1": true });
    assert.equal(exportState.checkpoint, baseline);
    if (jobState !== "processing") {
      assert.equal(exportState.identityExport, null); assert.equal(exportState.identityExportRetry.attempts, 1);
      globalThis.fetch = async () => assert.fail("export backoff must be honored");
      await __test.refreshDeltaIdentities({ R2_ARCHIVE: exportStorage }, exportState, new Map());
    } else assert.equal(exportState.identityExport.jobId, "job");
  }

  // Actual fetch abort signal, independent of a process error or mock throw.
  const keepAlive = nativeTimeout(() => {}, 1000);
  globalThis.fetch = async (_, { signal }) => new Promise((resolve, reject) => {
    signal.addEventListener("abort", () => reject(signal.reason), { once: true });
  });
  try {
    await assert.rejects(() => __test.leadHubRequest({ LEADHUB_API_TOKEN: "synthetic", syncRequestDeadline: Date.now() + 15 },
      "/profiles/email-address/test"), error => error.name === "TimeoutError");
  } finally { clearTimeout(keepAlive); }

  await assert.rejects(() => __test.leadHubRequest({ LEADHUB_API_TOKEN: "synthetic" }, "/subscriptions/email-address/test", { method: "POST" }),
    error => error.code === "subscription_write_forbidden");
  f = fixture();
  const status = await readVistosLeadHubProfileSyncStatus(f.env);
  assert.equal(status.subscriptionsWriteEnabled, false); assert.equal(status.messagesEnabled, false);
  console.log("Vistos reliability: success/empty/partial/API errors/unknown acceptance/DB crash/recovery restart/CAS/parallel claims/cursors/consents passed");

  // Alarm delivery and cron may overlap. A second delivery shares the same
  // operation; a restarted worker waits until the prior request is bounded.
  const data = new Map(); let alarmAt = null, calls = 0, finish;
  const alarmStorage = { get: async key => structuredClone(data.get(key)), put: async (key, value) => data.set(key, structuredClone(value)),
    getAlarm: async () => alarmAt, setAlarm: async at => { alarmAt = at; } };
  const alarmEnv = { VISTOS_LEADHUB_SYNC_TOKEN: "synthetic" };
  globalThis.fetch = async () => { calls++; await new Promise(resolve => { finish = resolve; }); return Response.json({ status: "completed", pending: 0 }); };
  const controller = new VistosContinuationController(alarmStorage, alarmEnv);
  const first = controller.alarm(); const second = controller.alarm();
  while (!finish) await new Promise(resolve => nativeTimeout(resolve, 1));
  const fallback = alarmAt; await controller.ensureScheduled(); assert.equal(alarmAt, fallback);
  await new VistosContinuationController(alarmStorage, alarmEnv).alarm();
  assert.equal(calls, 1, "restart cannot overlap an unexpired request");
  finish(); await Promise.all([first, second]);
  assert.equal(calls, 1); assert.ok(alarmAt > Date.now()); assert.ok(data.get("continuation").lastSuccessAt);
  globalThis.fetch = async () => { calls++; return Response.json({}, { status: 503 }); };
  await controller.alarm();
  assert.equal(data.get("continuation").failures, 1); assert.ok(alarmAt >= Date.now() + 59000);
  alarmAt = Date.now() - 61000; await controller.ensureScheduled(); assert.ok(alarmAt > Date.now());
  assert.equal(data.get("continuation").needsWriter, true);
  console.log("Vistos scheduler: concurrent alarms/cron, persisted restart, failure backoff and watchdog passed");
} finally { globalThis.fetch = nativeFetch; globalThis.setTimeout = nativeTimeout; }
