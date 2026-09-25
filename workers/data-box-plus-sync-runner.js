function appBaseUrl(env) {
  return String(env.APP_BASE_URL || "https://smart-odpady.ai").replace(/\/+$/, "");
}

export function isDataBoxDue(scheduledTime) {
  return new Date(scheduledTime).getUTCMinutes() % 30 === 0;
}

export function isArchiveDue(scheduledTime) {
  return new Date(scheduledTime).getUTCMinutes() % 5 === 0;
}

async function postInternal(env, path, token, body = undefined) {
  return fetch(`${appBaseUrl(env)}${path}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json"
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) })
  });
}

async function syncDataBoxPlus(env, token, scheduledAt) {
  const path = "/api/data-box-plus/internal-sync";
  const planResponse = await postInternal(env, path, token, { mode: "plan", scheduledAt });
  const plan = await planResponse.json().catch(() => ({}));
  if (!planResponse.ok || !Array.isArray(plan.mailboxIds)) {
    console.error("data_box_plus_sync.plan_failed", { status: planResponse.status });
    return;
  }
  const results = [];
  // One HTTP request per mailbox keeps independent ISDS/attachment work out of
  // the shared request deadline. A failed box must not block the remaining ones.
  for (const mailboxId of [...new Set(plan.mailboxIds)]) {
    try {
      const batchResponse = await postInternal(env, path, token, { mailboxId, scheduledAt });
      const batch = await batchResponse.json().catch(() => ({}));
      results.push({ mailboxId, syncRunId: batchResponse.ok ? batch.syncRunId : undefined });
    } catch {
      results.push({ mailboxId });
    }
  }
  const response = await postInternal(env, path, token, { mode: "complete", scheduledAt, results });
  const summary = await response.json().catch(() => ({}));
  if (!response.ok) {
    console.error("data_box_plus_sync.failed", {
      status: response.status,
      error: summary.error || "Načtení Datových schránek Plus se nepodařilo."
    });
    return;
  }
  console.log("data_box_plus_sync.completed", {
    status: summary.status,
    syncRunId: summary.syncRunId,
    mailboxCount: summary.mailboxCount,
    messagesFound: summary.messagesFound,
    messagesDownloaded: summary.messagesDownloaded,
    attachmentsDownloaded: summary.attachmentsDownloaded,
    errors: summary.errors?.length || 0
  });
}

async function archiveDataBoxPlus(env, token, scheduledAt) {
  const response = await postInternal(env, "/api/data-box-plus/internal-archive", token, { scheduledAt });
  const summary = await response.json().catch(() => ({}));
  if (!response.ok) {
    console.error("data_box_plus_archive.failed", {
      status: response.status,
      error: summary.error || "Archiv Datových schránek Plus se nepodařilo doplnit."
    });
    return;
  }
  console.log("data_box_plus_archive.completed", {
    jobsCreated: summary.jobsCreated,
    jobsProcessed: summary.jobsProcessed,
    jobsCompleted: summary.jobsCompleted,
    messagesDiscovered: summary.messagesDiscovered,
    messagesArchived: summary.messagesArchived,
    errors: summary.errors?.length || 0
  });
}

export default {
  async scheduled(controller, env, ctx) {
    const token = String(env.DATA_BOX_PLUS_SYNC_TOKEN || "").trim();
    if (!token) {
      console.error("cloud_sync_runner.missing_token");
      return;
    }
    const scheduledAt = new Date(controller.scheduledTime).toISOString();
    if (isDataBoxDue(controller.scheduledTime)) {
      ctx.waitUntil(syncDataBoxPlus(env, token, scheduledAt));
    }
    if (isArchiveDue(controller.scheduledTime)) {
      ctx.waitUntil(archiveDataBoxPlus(env, token, scheduledAt));
    }
  },

  async fetch() {
    return Response.json({
      status: "ready",
      dataBoxPlusIntervalMinutes: 30,
      archiveBatchIntervalMinutes: 5,
      mailboxScope: "all-current-and-future",
      message: "Nové zprávy se načítají každých 30 minut a vlastní archiv KSO doplňuje obnovitelné dávky každých pět minut pro všechny současné i budoucí schránky."
    });
  }
};
