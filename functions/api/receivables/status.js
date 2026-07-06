import { json, requireUserPermission } from "../../_lib/auth.js";
import { receivablesApiStatus } from "../../_lib/receivables-store.js";

export async function onRequestGet({ request, env }) {
  const { response } = await requireUserPermission(env, request, "receivables", "view");
  if (response) return response;

  return json({
    apiStatus: receivablesApiStatus(env),
    mode: "dry_run",
    outboundEnabled: false,
    cloudRunnerEnabled: false,
    message: "Pohledávkový kompas AI je ve Fázi 1B pouze dry-run. Nic neposílá a nespouští cron."
  });
}
