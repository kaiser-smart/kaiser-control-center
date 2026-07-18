import { getUsers } from "./auth.js";
import { listEmployeeAvailabilityForSarlota } from "./absence-requests-store.js";
import { getMyCollectionDailyRoute } from "./collection-daily-routes-store.js";
import { driverReportContextForUser } from "./driver-report-context.js";
import { userDynamicVariablesForAi } from "./ai-people-summary.js";
import { currentSarlotaWeather } from "./sarlota-weather.js";
import { currentSarlotaNews } from "./sarlota-news.js";
import { getSarlotaUserMemory } from "./sarlota-user-memory.js";
import { hasPermission, isUserActive, normalizeRole, roleLabel } from "../../src/permissions.js";

export class CollectionRoutesSarlotaContextError extends Error {
  constructor(message, status = 400, code = "collection_routes_sarlota_context_error") {
    super(message);
    this.name = "CollectionRoutesSarlotaContextError";
    this.status = status;
    this.code = code;
  }
}

function cleanString(value) {
  return String(value ?? "").trim();
}

function dateValue(value) {
  const cleaned = cleanString(value);
  return /^\d{4}-\d{2}-\d{2}$/.test(cleaned) ? cleaned : "";
}

function pragueDate() {
  try {
    return new Intl.DateTimeFormat("en-CA", {
      timeZone: "Europe/Prague",
      year: "numeric",
      month: "2-digit",
      day: "2-digit"
    }).format(new Date());
  } catch {
    return new Date().toISOString().slice(0, 10);
  }
}

function safeRoute(detail) {
  const run = detail?.run || null;
  const stops = Array.isArray(detail?.stops) ? detail.stops : [];
  const currentStop = stops.find((stop) => stop.status === "planned") || null;
  const followingStop = currentStop
    ? stops
      .filter((stop) => stop.status === "planned" && Number(stop.routeOrder) > Number(currentStop.routeOrder))
      .sort((left, right) => Number(left.routeOrder) - Number(right.routeOrder))[0] || null
    : null;
  return {
    assigned: Boolean(run),
    id: cleanString(run?.id),
    scope: cleanString(run?.scope || "production"),
    status: cleanString(run?.status || "none"),
    title: cleanString(run?.title),
    routeDate: cleanString(run?.routeDate),
    vehicleLabel: cleanString(run?.vehicleLabel || run?.vehicleRegistration || run?.vehicleCode),
    plannedCount: Number(run?.summary?.plannedCount || 0),
    doneCount: Number(run?.summary?.doneCount || 0),
    problemCount: Number(run?.summary?.problemCount || 0),
    currentStop: currentStop ? {
      id: cleanString(currentStop.id),
      order: Number(currentStop.routeOrder || 0),
      customerName: cleanString(currentStop.customerName),
      stationName: cleanString(currentStop.stationName),
      address: cleanString(currentStop.addressText),
      wasteType: cleanString(currentStop.wasteType)
    } : null,
    followingStop: followingStop ? {
      id: cleanString(followingStop.id),
      order: Number(followingStop.routeOrder || 0),
      customerName: cleanString(followingStop.customerName),
      stationName: cleanString(followingStop.stationName),
      address: cleanString(followingStop.addressText)
    } : null
  };
}

function availabilityByEmployee(items = []) {
  const result = new Map();
  for (const item of items) {
    const key = cleanString(item?.employeeId).toLowerCase();
    if (key && !result.has(key)) result.set(key, item);
  }
  return result;
}

export function sanitizeKaiserDirectoryForSarlota(users = [], availability = []) {
  const activeUsers = users.filter(isUserActive);
  const usersById = new Map(activeUsers.map((user) => [cleanString(user.id).toLowerCase(), user]));
  const absencesById = availabilityByEmployee(availability);
  return activeUsers
    .map((user) => {
      const id = cleanString(user.id);
      const email = cleanString(user.email);
      const manager = usersById.get(cleanString(user.managerId).toLowerCase()) || null;
      const absence = absencesById.get(id.toLowerCase()) || null;
      return {
        id,
        name: cleanString(user.name),
        workEmail: /@kaiser\.local$/i.test(email) ? "" : email,
        workPhone: cleanString(user.phone),
        function: cleanString(user.position) || roleLabel(user.role),
        manager: manager ? { id: cleanString(manager.id), name: cleanString(manager.name) } : null,
        availability: absence ? {
          status: absence.availability,
          label: cleanString(absence.label),
          dateFrom: cleanString(absence.dateFrom),
          dateTo: cleanString(absence.dateTo)
        } : { status: "available", label: "V práci", dateFrom: "", dateTo: "" }
      };
    })
    .filter((item) => item.id && item.name)
    .sort((left, right) => left.name.localeCompare(right.name, "cs"))
    .slice(0, 120);
}

function safeVehicles(result = {}) {
  const payload = result?.payload || result || {};
  const verified = payload.vehiclesVerified === true;
  return {
    verified,
    count: verified ? Number(payload.vehiclesCount || 0) : 0,
    items: verified && Array.isArray(payload.vehicles)
      ? payload.vehicles.map((vehicle) => ({
        id: cleanString(vehicle.vehicleId || vehicle.id),
        name: cleanString(vehicle.displayName || vehicle.name),
        spz: cleanString(vehicle.spz || vehicle.licensePlate),
        type: cleanString(vehicle.type || vehicle.vehicleType)
      }))
      : [],
    fallbackQuestion: verified ? "" : cleanString(payload.fallbackQuestion || payload.messageForAssistant)
  };
}

function introAnnouncement(user, route, weather, memory) {
  const variables = userDynamicVariablesForAi(user);
  const firstName = cleanString(user?.name).split(/\s+/)[0].toLocaleLowerCase("cs-CZ");
  const vocative = firstName === "miroslav"
    ? "Mirku"
    : cleanString(variables.user_first_name_friendly_vocative) || "řidiči";
  const parts = [`Ahoj ${vocative}.`];
  parts.push(route.assigned ? "Dnešní trasu mám načtenou." : "Dnešní trasu zatím nemám potvrzenou.");
  parts.push("Svačinu máš?");
  if (weather?.verified && cleanString(weather.summary)) {
    parts.push(`${cleanString(weather.summary)}.`);
  }
  if (memory?.previouslySpoken && cleanString(memory.summary)) {
    parts.push("Navážu i na naše předchozí pracovní témata.");
  }
  parts.push("Budu hlídat trasu, počasí a hlášení.");
  return parts.join(" ").replace(/\.\./g, ".").slice(0, 520);
}

async function safeLoad(loader, fallback) {
  try {
    return await loader();
  } catch (error) {
    console.error("collection_routes_sarlota.context_part_failed", { message: error.message });
    return fallback;
  }
}

export async function buildCollectionRoutesSarlotaContext(env, user, options = {}) {
  if (!user) {
    throw new CollectionRoutesSarlotaContextError("Nejsi přihlášený.", 401, "unauthenticated");
  }
  if (!isUserActive(user) || normalizeRole(user.role) !== "ridic" || !hasPermission(user, "collection-routes", "view")) {
    throw new CollectionRoutesSarlotaContextError(
      "Kontext řidičského tabletu je dostupný pouze aktivní roli Řidič.",
      403,
      "collection_routes_sarlota_forbidden"
    );
  }
  const scope = cleanString(options.scope) === "test" ? "test" : "production";
  const date = dateValue(options.date) || pragueDate();
  const detail = options.detailOverride !== undefined
    ? options.detailOverride
    : await getMyCollectionDailyRoute(env, user, { scope });
  const users = options.usersOverride !== undefined ? options.usersOverride : await getUsers(env);
  const userIds = users.map((item) => cleanString(item.id)).filter(Boolean);
  const [vehicleResult, weather, availability, memory, news] = await Promise.all([
    options.vehiclesOverride !== undefined
      ? options.vehiclesOverride
      : safeLoad(() => driverReportContextForUser(env, user, { currentModule: "collection-routes" }), {}),
    options.weatherOverride !== undefined
      ? options.weatherOverride
      : safeLoad(() => currentSarlotaWeather(env), { ok: false, verified: false, status: "unavailable" }),
    options.availabilityOverride !== undefined
      ? options.availabilityOverride
      : safeLoad(() => listEmployeeAvailabilityForSarlota(env, { date, userIds }), []),
    options.memoryOverride !== undefined
      ? options.memoryOverride
      : getSarlotaUserMemory(env, user),
    options.newsOverride !== undefined
      ? options.newsOverride
      : safeLoad(() => currentSarlotaNews(), {
        ok: false,
        status: "unavailable",
        source: "iROZHLAS",
        sourceUrl: "https://www.irozhlas.cz/rss/irozhlas",
        fetchedAt: "",
        items: []
      })
  ]);
  const route = safeRoute(detail);
  const vehicles = safeVehicles(vehicleResult);
  const directory = sanitizeKaiserDirectoryForSarlota(users, availability);
  return {
    actor: { id: cleanString(user.id), name: cleanString(user.name), role: cleanString(user.role) },
    scope,
    date,
    route,
    vehicles,
    weather: weather?.verified ? weather : {
      verified: false,
      status: cleanString(weather?.status || "unavailable"),
      summary: ""
    },
    directory,
    directoryPolicy: "Pouze jméno, pracovní kontakt, funkce, nadřízený a bezpečný stav dostupnosti bez soukromého nebo zdravotního důvodu.",
    news: news?.status === "ready" ? news : {
      ok: false,
      status: cleanString(news?.status || "unavailable"),
      source: "iROZHLAS",
      sourceUrl: "https://www.irozhlas.cz/rss/irozhlas",
      fetchedAt: cleanString(news?.fetchedAt),
      items: [],
      message: "Aktuální přehled zpráv iROZHLAS se teď nepodařilo bezpečně načíst."
    },
    memory,
    introAnnouncement: introAnnouncement(user, route, weather, memory),
    safety: {
      readOnlyContext: true,
      requiresPhysicalConfirmationForWrites: true,
      sendsNotifications: false,
      changesVistos: false,
      changesProductionRoute: false
    },
    apiStatus: "ready"
  };
}
