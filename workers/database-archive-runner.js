import { archiveCollectionSnapshotChunk } from "../functions/_lib/collection-snapshot-archive.js";

export default {
  async scheduled(controller, env, ctx) {
    ctx.waitUntil((async () => {
      const capacity = await env.DB_AUDIT.prepare(`
        SELECT level
        FROM database_capacity_snapshots
        WHERE database_domain = 'legacy'
        ORDER BY recorded_at DESC
        LIMIT 1
      `).first().catch(() => null);
      const accelerated = ["archive", "critical", "blocked"].includes(String(capacity?.level || ""));
      const result = await archiveCollectionSnapshotChunk(env, {
        scheduledTime: controller.scheduledTime,
        batchSize: accelerated ? 1000 : 500,
        retentionDays: 2
      });
      console.log("database_archive_runner.completed", { ...result, accelerated });
    })());
  },

  async fetch() {
    return Response.json({
      status: "ready",
      mode: "copy-verify-only",
      batchSize: 500,
      sourceDeletion: "disabled",
      automaticOperationalDataDeletion: false
    });
  }
};
