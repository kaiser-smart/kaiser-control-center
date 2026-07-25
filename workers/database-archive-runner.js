import {
  archiveCollectionSnapshotChunk,
  archiveReceivableSnapshotChunk
} from "../functions/_lib/collection-snapshot-archive.js";

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
      const commonOptions = {
        scheduledTime: controller.scheduledTime,
        retentionDays: 2
      };
      const [collection, receivables] = await Promise.all([
        archiveCollectionSnapshotChunk(env, {
          ...commonOptions,
          batchSize: accelerated ? 750 : 300
        }),
        archiveReceivableSnapshotChunk(env, {
          ...commonOptions,
          batchSize: accelerated ? 250 : 200
        })
      ]);
      console.log("database_archive_runner.completed", {
        collection,
        receivables,
        accelerated,
        totalSelectedRows: collection.selectedRows + receivables.selectedRows,
        totalDeletedRows: 0
      });
    })());
  },

  async fetch() {
    return Response.json({
      status: "ready",
      mode: "copy-verify-only",
      normalRowsPerRun: 500,
      maximumRowsPerRun: 1000,
      sourceTables: ["collection_import_rows", "receivable_import_rows"],
      sourceDeletion: "disabled",
      automaticOperationalDataDeletion: false
    });
  }
};
