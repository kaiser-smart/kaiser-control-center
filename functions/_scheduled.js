import { runDataBoxPlusSync } from "./_lib/data-box-plus-store.js";

function enabledFlag(value) {
  return !["0", "false", "no", "off", "disabled"].includes(String(value ?? "true").trim().toLowerCase());
}

export async function onScheduled(event, env, ctx) {
  if (!enabledFlag(env.DATA_BOX_PLUS_BACKGROUND_ENABLED)) {
    return;
  }

  ctx.waitUntil(runDataBoxPlusSync(env, { id: "cloudflare-scheduled", name: "Autopilot" }, {
    triggerType: "cloud-scheduler"
  }).catch((error) => {
    console.error("data_box_plus.scheduled_failed", {
      message: error?.message,
      code: error?.code
    });
  }));
}
