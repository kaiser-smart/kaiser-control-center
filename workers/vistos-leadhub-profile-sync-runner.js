const CRON = "*/5 * * * *";
const PREPARATION_CRON = "* * * * *";

function csvConfig(env) {
  return [env.CSV_BATCH_ID, env.CSV_SCOPE, env.CSV_ARM_BATCH_ID, env.CSV_SUBMITTED_BATCH_ID,
    env.CSV_IMPORT_RECEIPT, env.CSV_QUARANTINE_BATCH_ID].join("|");
}

function baseUrl(env) {
  return String(env.APP_BASE_URL || "https://smart-odpady.ai").replace(/\/+$/, "");
}

export async function runScheduledSync(env, scheduledTime, requestedMode) {
  const token = String(env.VISTOS_LEADHUB_SYNC_TOKEN || "").trim();
  if (!token) throw new Error("VISTOS_LEADHUB_SYNC_TOKEN není nastavený.");
  const response = await fetch(`${baseUrl(env)}/api/receivables/vistos/leadhub-sync-internal`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      scheduledAt: new Date(scheduledTime).toISOString(),
      mode: requestedMode || (env.BUSINESS_READ_ENABLED === "true" && new Date(scheduledTime).getUTCMinutes() % 5 === 4
        ? "business-read" : env.RUN_MODE || (env.READ_PREFLIGHT_ONLY === "true" ? "read-preflight" : "sync")),
      recoveryOwner: env.RECOVERY_OWNER || undefined,
      ...(requestedMode === "csv-step" ? { batchId: env.CSV_BATCH_ID, batchSize: Number(env.CSV_BATCH_SIZE) || 5,
        scope: env.CSV_SCOPE,
        quarantineBatchId: env.CSV_QUARANTINE_BATCH_ID,
        armBatchId: env.CSV_ARM_BATCH_ID, submittedBatchId: env.CSV_SUBMITTED_BATCH_ID, receipt: env.CSV_IMPORT_RECEIPT } : {}),
      runner: "kaiser-vistos-leadhub-profile-sync"
    })
  });
  const rawBody = await response.text();
  const payload = (() => {
    try { return JSON.parse(rawBody); } catch { return {}; }
  })();
  if (!response.ok) {
    const error = new Error(payload.error || `Sync endpoint odpověděl ${response.status}.`);
    error.code = payload.code || "vistos_leadhub_sync_endpoint_failed";
    error.status = response.status;
    error.upstreamStatus = Number(payload.upstreamStatus) || 0;
    error.responseType = String(response.headers.get("content-type") || "unknown");
    error.responseRay = String(response.headers.get("cf-ray") || "unknown");
    error.retryAfterSeconds = Math.max(0, Number(response.headers.get("retry-after")) || Number(payload.retryAfterSeconds) || 0);
    throw error;
  }
  return payload;
}

// One coordinator per authorized workspace, not one per contact. Only the
// alarm drives requests; cron repairs a missing alarm and never writes itself.
// The R2 writer/journal remains the authority on accepted provider operations.
export class VistosContinuationController {
  constructor(storage, env) { this.storage = storage; this.env = env; }
  async ensureScheduled() {
    const [alarm, state] = await Promise.all([this.storage.getAlarm(), this.storage.get("continuation")]);
    const deployedConfig = csvConfig(this.env);
    if (alarm === null || state?.scheduledConfig !== deployedConfig) {
      await this.storage.put("continuation", { ...(state || { steps: 0, failures: 0, lastBusinessAt: 0 }),
        scheduledConfig: deployedConfig });
      await this.storage.setAlarm(Date.now() + 1000);
    }
    return { scheduled: true };
  }
  async alarm() {
    const state = await this.storage.get("continuation") || { steps: 0, failures: 0, lastBusinessAt: 0 };
    const startedAt = Date.now();
    // Never two business blocks consecutively: delta reconciliation and its
    // priority queue run between blocks even while the historical backlog grows.
    const currentCsvConfig = csvConfig(this.env);
    const csvPending = this.env.CSV_BATCH_ID && (state.csvConfig !== currentCsvConfig
      || !["READY", "ARMED", "ADOPTED", "EMPTY", "BLOCKED", "QUARANTINED"].includes(state.csvStatus));
    // Every auxiliary step is followed by the ordinary writer. CSV and
    // business take turns, so neither can starve delta or the other queue.
    const auxiliaryAllowed = !state.lastMode || state.lastMode === "execute-import";
    const csv = csvPending && auxiliaryAllowed && state.lastAuxiliary !== "csv-step";
    const business = !csv && this.env.BUSINESS_READ_ENABLED === "true" && auxiliaryAllowed
      && startedAt - state.lastBusinessAt >= 60000;
    let mode = csv || (csvPending && auxiliaryAllowed && !business) ? "csv-step" : business ? "business-read" : "execute-import";
    if (csvPending && this.env.CSV_SCOPE === "remaining") {
      // Consume available READ capacity for the whole reserved remainder, but
      // return to delta at least every five minutes (or four full blocks).
      // Five minutes is the production delta contract; the previous two-minute
      // ceiling caused ordinary business refreshes to interrupt almost every
      // second CSV block and left most of the documented READ quota unused.
      // Business refresh retains a slot at least every five minutes.
      const writerDue = !state.lastWriterAt || startedAt - state.lastWriterAt >= 300000 || (state.csvSinceWriter || 0) >= 4;
      const businessDue = this.env.BUSINESS_READ_ENABLED === "true" && startedAt - state.lastBusinessAt >= 300000;
      mode = writerDue ? "execute-import" : businessDue ? "business-read" : "csv-step";
    }
    state.lastMode = mode;
    if (mode !== "execute-import") state.lastAuxiliary = mode;
    if (mode === "business-read") state.lastBusinessAt = startedAt;
    // Persist wakeup before network I/O. A crash/restart resumes from the R2
    // journal, never from a guessed successful POST response.
    await this.storage.setAlarm(startedAt + 180000);
    await this.storage.put("continuation", { ...state, inFlightAt: startedAt, inFlightMode: mode });
    let nextDelay = 2500;
    try {
      const summary = await runScheduledSync(this.env, startedAt, mode);
      state.failures = 0;
      state.steps++;
      state.lastSuccessAt = new Date().toISOString();
      state.lastSummary = summary;
      if (mode === "execute-import") { state.lastWriterAt = startedAt; state.csvSinceWriter = 0; }
      if (mode === "csv-step") state.csvSinceWriter = (state.csvSinceWriter || 0) + 1;
      if (mode === "csv-step") { state.csvConfig = currentCsvConfig; state.csvStatus = summary.status; }
      if (summary.status === "RECONCILIATION_REQUIRED") nextDelay = 60000;
      else if (mode === "execute-import" && !summary.pending && !summary.historicalImport?.remaining) nextDelay = 60000;
      const reconciliation = Array.isArray(summary.checks) ? {
        total: summary.checks.length,
        noProviderWrite: summary.checks.filter(check => check.stage === "NO_PROVIDER_WRITE").length,
        providerReadbacks: summary.checks.filter(check => !check.stage).length,
        identityMatches: summary.checks.filter(check => check.identityMatches).length,
        tagMatches: summary.checks.filter(check => check.tagMatches).length,
        safetyUnchanged: summary.checks.filter(check => check.safetyUnchanged).length,
        quarantinable: summary.checks.filter(check => check.quarantinable).length
      } : undefined;
      console.log("vistos_leadhub_profile_sync.continuation", { mode, durationMs: Date.now() - startedAt,
        pending: summary.pending ?? summary.historicalImport?.remaining ?? null,
        created: summary.created || 0, updated: summary.updated || 0, status: summary.status || summary.syncStatus,
        ...(reconciliation ? { reconciliation } : {}) });
    } catch (error) {
      state.failures++;
      state.lastError = { code: error.code || "continuation_request_failed", status: error.status || 0,
        upstreamStatus: error.upstreamStatus || 0, at: new Date().toISOString() };
      nextDelay = Math.max(60000, Math.min(900000, 60000 * 2 ** Math.min(state.failures - 1, 4)), (error.retryAfterSeconds || 0) * 1000);
      console.error("vistos_leadhub_profile_sync.continuation_failed", state.lastError);
    }
    state.lastDurationMs = Date.now() - startedAt;
    state.inFlightAt = null;
    state.nextAt = Date.now() + nextDelay;
    await this.storage.put("continuation", state);
    await this.storage.setAlarm(state.nextAt);
  }
}

export default {
  async scheduled(controller, env, ctx) {
    if (env.CONTINUATION && env.RUN_MODE === "execute-import") {
      ctx.waitUntil(env.CONTINUATION.getByName("8d8bf07372ad4244877308cbd94c8e78").ensureScheduled());
      return;
    }
    if (controller.cron !== CRON && !(controller.cron === PREPARATION_CRON && ["prepare-import", "execute-import"].includes(env.RUN_MODE))) return;
    ctx.waitUntil(runScheduledSync(env, controller.scheduledTime).then((summary) => {
      if (summary.mode === "read-preflight") {
        console.log("vistos_leadhub_profile_sync.read_preflight", summary);
        return;
      }
      if (summary.mode === "prepare-import") {
        console.log("vistos_leadhub_profile_sync.prepare_import", summary);
        return;
      }
      if (summary.mode === "execute-import") {
        console.log("vistos_leadhub_profile_sync.import", summary);
        return;
      }
      if (summary.mode === "business-read") {
        console.log("vistos_leadhub_profile_sync.business_read", summary);
        return;
      }
      console.log("vistos_leadhub_profile_sync.completed", {
        checkpoint: summary.checkpoint,
        sourceRows: summary.sourceRows || 0,
        changedContacts: summary.changedContacts || 0,
        created: summary.created || 0,
        updated: summary.updated || 0,
        deactivated: summary.deactivated || 0,
        pending: summary.pending || 0,
        readbackConfirmed: summary.readbackConfirmed || 0,
        subscriptionsChanged: 0,
        messagesSent: 0
      });
    }).catch((error) => {
      console.error("vistos_leadhub_profile_sync.failed", {
        message: String(error?.message || error),
        code: String(error?.code || "vistos_leadhub_sync_failed"),
        status: Number(error?.status) || 0,
        upstreamStatus: Number(error?.upstreamStatus) || 0,
        responseType: String(error?.responseType || "unknown"),
        responseRay: String(error?.responseRay || "unknown"),
        responseSnippet: String(error?.responseSnippet || "")
      });
    }));
  },

  async fetch(request, env = {}) {
    return Response.json({
      status: "ready",
      trigger: env.CONTINUATION ? "durable-alarm-with-cron-watchdog" : "cloudflare-cron",
      cron: ["prepare-import", "execute-import"].includes(env.RUN_MODE) ? PREPARATION_CRON : CRON,
      intervalMinutes: ["prepare-import", "execute-import"].includes(env.RUN_MODE) ? 1 : 5,
      runMode: env.RUN_MODE || "sync",
      historicalBulkImport: env.RUN_MODE === "execute-import",
      subscriptionsWrite: false,
      messages: false
    });
  }
};
