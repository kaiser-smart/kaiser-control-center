// Bounded, fenced R2 writer shared by delta, historical import and auxiliary
// readers. Expiry permits reconciliation, never replay of an unknown write.
export const WRITER_BUDGET_MS = 100000;
export const WRITER_QUIET_MS = 120000;
export const LEGACY_QUIET_MS = 600000;
export const SYNC_PREFIX = "protected-sync/vistos-leadhub-profiles";
export const WRITER_LOCK_KEY = `${SYNC_PREFIX}/writer-lock.json`;
export const LAST_ATTEMPT_KEY = `${SYNC_PREFIX}/last-attempt.json`;

export function writerError(code) {
  return Object.assign(new Error(code), { code, status: 409, requestNotDispatched: true });
}

export function recoveryDue(lock, now = Date.now()) {
  if (!lock || lock.phase === "RELEASED") return false;
  if (lock.phase && lock.nextAttemptAt) return now >= Date.parse(lock.nextAttemptAt);
  const lease = Date.parse(lock.expiresAt);
  if (Number.isFinite(lease)) return now >= lease + WRITER_QUIET_MS;
  // Compatibility for old requests and old interrupted reconciliation claims.
  // New requests always have a deadline and cannot dispatch after it.
  const observed = Date.parse(lock.claimedAt || lock.terminalAt || lock.startedAt);
  return Number.isFinite(observed) && now >= observed + LEGACY_QUIET_MS;
}

export function writerContext(storage, lock) {
  const deadline = Date.parse(lock.expiresAt);
  const context = { ...lock, deadline, sideEffectsStarted: false, unsettled: new Set(), halted: false };
  context.checkDeadline = () => {
    if (Date.now() >= deadline) throw writerError("writer_deadline_exceeded");
  };
  context.assertActive = async () => {
    context.checkDeadline();
    const object = await storage.get(WRITER_LOCK_KEY);
    const current = object && await object.json();
    if (current?.owner !== lock.owner || current.claimId !== lock.claimId || current.phase !== lock.phase) {
      throw writerError("writer_fence_lost");
    }
    context.checkDeadline();
  };
  return context;
}

// R2 delete has no conditional ETag. Keep a released tombstone instead:
// delayed cleanup cannot erase a replacement owner, and the next acquisition
// changes this exact version atomically. No timer-based deletion is safe here.
export async function releaseWriter(storage, writer) {
  // Always own this fresh body: callers may already have consumed their read.
  // Recheck its generation and CAS this exact ETag before releasing it.
  const object = await storage.get(WRITER_LOCK_KEY);
  const lock = object && await object.json();
  if (lock?.owner !== writer.owner || lock.claimId !== writer.claimId || lock.phase !== writer.phase) {
    throw writerError("writer_fence_lost");
  }
  writer.checkDeadline();
  const result = await storage.put(WRITER_LOCK_KEY, JSON.stringify({ ...lock,
    phase: "RELEASED", releasedAt: new Date().toISOString(), nextAttemptAt: null }), {
    onlyIf: new Headers({ "If-Match": object.httpEtag }),
    httpMetadata: { contentType: "application/json" }, customMetadata: { protected: "true" }
  });
  if (!result) throw writerError("writer_fence_lost");
}

// The deadline/owner check fences provider dispatch and every storage write.
// Mutable state additionally uses the ETag from the read that produced it:
// a delayed old R2 put cannot overwrite a ledger committed by recovery.
export function fencedWriterEnv(env, writer) {
  const storage = env.R2_ARCHIVE;
  const versions = new Map();
  const shared = new Set(["state.json", "business-state.json", "business-current.json", "import-state.json",
    "api-rate-reservations.json", "last-attempt.json"].map(name => `${SYNC_PREFIX}/${name}`));
  const scoped = new Proxy(storage, { get(target, property) {
    if (property === "get") return async key => {
      const object = await target.get(key);
      if (shared.has(key)) versions.set(key, object?.httpEtag || null);
      return object;
    };
    if (property === "put") return async (key, value, options = {}) => {
      await writer.assertActive();
      let condition;
      if (shared.has(key)) {
        if (!versions.has(key)) {
          const object = await target.get(key);
          versions.set(key, object?.httpEtag || null);
        }
        condition = new Headers(versions.get(key)
          ? { "If-Match": versions.get(key) } : { "If-None-Match": "*" });
      }
      writer.checkDeadline();
      const result = await target.put(key, value, { ...options, ...(condition ? { onlyIf: condition } : {}) });
      if (!result) throw writerError("writer_state_conflict");
      if (shared.has(key)) {
        // Production R2 returns the new ETag. Minimal test adapters may not.
        const next = result.httpEtag ? result : await target.get(key);
        versions.set(key, next?.httpEtag || null);
      }
      return result;
    };
    if (property === "delete") return async key => {
      if (key === WRITER_LOCK_KEY) throw writerError("writer_unconditional_release_forbidden");
      await writer.assertActive(); return target.delete(key);
    };
    const value = Reflect.get(target, property, target);
    return typeof value === "function" ? value.bind(target) : value;
  } });
  return { ...env, R2_ARCHIVE: scoped, syncWriter: writer,
    syncRequestDeadline: writer.deadline };
}

export async function writeAttempt(storage, attempt) {
  const options = { httpMetadata: { contentType: "application/json" }, customMetadata: { protected: "true" } };
  const body = JSON.stringify(attempt);
  await storage.put(`${SYNC_PREFIX}/attempts/${attempt.batchId}.json`, body, options);
  await storage.put(LAST_ATTEMPT_KEY, body, options);
  console.log("vistos_leadhub_profile_sync.attempt", attempt);
}

export function attemptSummary(writer, result = {}, error) {
  return { batchId: writer.owner, kind: writer.kind || "sync", startedAt: writer.startedAt,
    finishedAt: new Date().toISOString(), expiresAt: writer.expiresAt,
    status: error ? "RETRY_WAIT" : result.status || result.syncStatus || "completed",
    found: result.batchSize ?? result.sourceRows ?? null, sourceRows: result.sourceRows ?? null,
    successful: result.readbackConfirmed ?? result.profilesConfirmed ?? 0,
    skipped: result.skipped || 0, failed: result.failed || (error ? 1 : 0),
    pending: result.pending ?? null, retryCount: result.retryCount || 0,
    reason: error?.code || (error?.name === "TimeoutError" ? "api_timeout" : error ? "request_interrupted" : result.failureReasons?.[0] || null),
    upstreamStatus: error?.upstreamStatus || null, retryAfterSeconds: error?.retryAfterSeconds || 0,
    subscriptionsChanged: 0, messagesSent: 0 };
}
