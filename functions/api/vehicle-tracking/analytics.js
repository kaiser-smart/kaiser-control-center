import { json, requireUserPermission, currentUser } from "../../_lib/auth.js";
import { getModuleDatabase } from "../../_lib/databases.js";
import { loadVehicleTrackingAnalytics, validAnalyticsDay } from "../../_lib/vehicle-tracking-analytics.js";

import { normalizeRole, hasPermission } from "../../../src/permissions.js";

export async function onRequestGet({ request, env }) {
  const { response } = await requireUserPermission(env, request, "vehicle-tracking", "view");
  if (response) return response;
  const url = new URL(request.url), day = url.searchParams.get("day");
  if (day !== null) {
    const activeUser = await currentUser(env, request, { strict: true });
    if (!activeUser) return json({ error: "Nepřihlášeno." }, 401);
    if (!hasPermission(activeUser, "vehicle-tracking", "view")) return json({ error: "Nemáte oprávnění." }, 403);
    if (!["admin", "management", "dispecer"].includes(normalizeRole(activeUser.role))) return json({ error: "Nemáte oprávnění k provoznímu přehledu flotily." }, 403);
    if (!validAnalyticsDay(day)) return json({ error: "Neplatný den." }, 400);
  }
  const db = getModuleDatabase(env, {
    moduleName: "vehicle-tracking-analytics-read",
    allowedDomains: ["archive", "audit"],
    defaultDomain: "archive",
    required: false
  });
  if (!db) return json({ error: "Analytika jízd vyžaduje DB_ARCHIVE i DB_AUDIT." }, 503);

  try {
    return json(await loadVehicleTrackingAnalytics(db, {
      period: url.searchParams.get("period") || "30d",
      ...(day !== null ? { day } : {}),
      vehicleKey: url.searchParams.get("vehicleKey") || ""
    }));
  } catch (error) {
    console.error("vehicle_tracking.analytics_read_failed", { message: error?.message || "unknown" });
    return json({ error: "Statistiky jízd se teď nepodařilo načíst." }, 503);
  }
}
