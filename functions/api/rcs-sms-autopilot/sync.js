import { json, requireUserPermission } from "../../_lib/auth.js";
import { syncRecentTwilioInboundMessages } from "../../_lib/rcs-sms-autopilot-service.js";

export async function onRequestPost({ request, env }) {
  const { response } = await requireUserPermission(env, request, "rcs-sms-autopilot", "manage");
  if (response) return response;
  try {
    return json(await syncRecentTwilioInboundMessages(env, {
      lookbackHours: 72,
      pageSize: 100
    }));
  } catch (error) {
    console.error("rcs_sms_autopilot.twilio_sync_failed", {
      message: String(error?.message || "").slice(0, 300)
    });
    return json({
      error: "Příchozí zprávy se teď nepodařilo obnovit z Twilia.",
      apiStatus: "waiting"
    }, 502);
  }
}
