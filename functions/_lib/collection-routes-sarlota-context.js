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

function safeRoute(detail, user) {
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
    driverVerified: Boolean(run && cleanString(run?.driverUserId) === cleanString(user?.id)),
    vehicleCode: cleanString(run?.vehicleCode),
    vehicleRegistration: cleanString(run?.vehicleRegistration),
    vehicleLabel: cleanString(run?.vehicleLabel || run?.vehicleRegistration || run?.vehicleCode),
    totalCount: stops.length,
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

function safeCrew(detail, directory = []) {
  const metadata = detail?.run?.metadata && typeof detail.run.metadata === "object"
    ? detail.run.metadata
    : {};
  const requestedIds = Array.isArray(metadata.crewUserIds)
    ? [...new Set(metadata.crewUserIds.map((value) => cleanString(value).toLowerCase()).filter(Boolean))]
    : [];
  if (!requestedIds.length) {
    return {
      verified: false,
      status: "unconfirmed",
      members: [],
      message: "Dnešní osádka zatím není v denní trase potvrzená."
    };
  }
  const directoryById = new Map(directory.map((item) => [cleanString(item.id).toLowerCase(), item]));
  const members = requestedIds
    .map((id) => directoryById.get(id))
    .filter(Boolean)
    .map((item) => ({
      id: cleanString(item.id),
      name: cleanString(item.name),
      function: cleanString(item.function)
    }));
  const verified = members.length === requestedIds.length;
  return {
    verified,
    status: verified ? "verified" : "incomplete",
    members: verified ? members : [],
    message: verified
      ? `Osádka je potvrzená: ${members.map((item) => item.name).join(", ")}.`
      : "Osádku se nepodařilo jednoznačně ověřit podle pracovních účtů."
  };
}

function normalizedRegistration(value) {
  return cleanString(value).toUpperCase().replace(/[^A-Z0-9]/g, "");
}

function safeVehicleAssignment(route, vehicles) {
  const routeRegistration = normalizedRegistration(route.vehicleRegistration);
  const routeLabel = normalizedRegistration(route.vehicleLabel);
  const matchedVehicle = vehicles.verified
    ? vehicles.items.find((item) => {
      const registration = normalizedRegistration(item.spz);
      return Boolean(registration && (registration === routeRegistration || routeLabel.includes(registration)));
    }) || null
    : null;
  const assigned = Boolean(route.vehicleLabel || route.vehicleRegistration || route.vehicleCode);
  const fleetMatch = vehicles.verified ? Boolean(matchedVehicle) : null;
  return {
    assigned,
    status: !assigned
      ? "missing"
      : vehicles.verified
        ? fleetMatch ? "verified" : "mismatch"
        : "route_assigned",
    label: cleanString(route.vehicleLabel),
    registration: cleanString(route.vehicleRegistration),
    code: cleanString(route.vehicleCode),
    fleetVerified: vehicles.verified,
    fleetMatch,
    fleetVehicle: matchedVehicle
  };
}

function safeSchedule(detail) {
  const metadata = detail?.run?.metadata && typeof detail.run.metadata === "object"
    ? detail.run.metadata
    : {};
  const plannedStartAt = cleanString(metadata.plannedStartAt);
  const plannedEndAt = cleanString(metadata.plannedEndAt);
  return {
    verified: Boolean(plannedStartAt && plannedEndAt),
    plannedStartAt,
    plannedEndAt
  };
}

function startReadiness({ user, route, vehicle, crew, weather, schedule, scope, date }) {
  const blockers = [];
  const warnings = [];
  if (!route.assigned) blockers.push({ code: "route_missing", message: "Dnešní trasa není přidělená." });
  if (route.assigned && !route.driverVerified) blockers.push({ code: "driver_mismatch", message: "Přihlášený řidič se neshoduje s přidělenou trasou." });
  if (route.assigned && scope !== "test" && route.routeDate !== date) blockers.push({ code: "route_date_mismatch", message: "Přidělená trasa není pro dnešní datum." });
  if (route.assigned && !vehicle.assigned) blockers.push({ code: "vehicle_missing", message: "Dnešní trasa nemá přiřazené vozidlo." });
  if (scope !== "test" && vehicle.fleetVerified && vehicle.fleetMatch === false) blockers.push({ code: "vehicle_mismatch", message: "Vozidlo trasy se neshoduje s ověřeným přiřazením řidiče." });
  if (!crew.verified) warnings.push({ code: "crew_unconfirmed", message: crew.message });
  if (!weather?.verified) warnings.push({ code: "weather_unavailable", message: "Aktuální počasí se nepodařilo ověřit." });
  if (!vehicle.fleetVerified) warnings.push({ code: "fleet_unverified", message: "Vozidlo je potvrzené denní trasou; širší přiřazení z Vozového parku teď není ověřené." });
  if (!schedule.verified) warnings.push({ code: "schedule_unconfirmed", message: "Plánovaný konec směny zatím není v trase potvrzený." });
  if (route.problemCount > 0) warnings.push({ code: "route_problems", message: `Trasa už obsahuje ${route.problemCount} problémových stanovišť.` });
  return {
    actorVerified: Boolean(cleanString(user?.id) && route.driverVerified),
    dateVerified: scope === "test" || route.routeDate === date,
    vehicleVerified: vehicle.status === "verified" || vehicle.status === "route_assigned",
    crewVerified: crew.verified,
    canStart: route.status === "confirmed" && blockers.length === 0,
    canOperate: route.status === "active" && blockers.length === 0,
    blockers,
    warnings
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

function weatherLocationForRoute(detail) {
  const points = (Array.isArray(detail?.stops) ? detail.stops : [])
    .map((stop) => ({ latitude: Number(stop?.latitude), longitude: Number(stop?.longitude) }))
    .filter((point) => Number.isFinite(point.latitude) && Number.isFinite(point.longitude));
  if (!points.length) return undefined;
  return {
    name: "Oblast trasy",
    latitude: points.reduce((sum, point) => sum + point.latitude, 0) / points.length,
    longitude: points.reduce((sum, point) => sum + point.longitude, 0) / points.length
  };
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

function deterministicVariant(seed = "") {
  return [...cleanString(seed)].reduce((sum, character) => sum + character.codePointAt(0), 0);
}

function stopCountText(value) {
  const count = Math.max(0, Number(value || 0));
  const lastTwo = count % 100;
  const last = count % 10;
  const noun = lastTwo >= 11 && lastTwo <= 14
    ? "stanovišť"
    : last >= 1 && last <= 4
      ? "stanoviště"
      : "stanovišť";
  return `${count} ${noun}`;
}

function introAnnouncement(user, route, vehicle, crew, weather, memory, readiness) {
  const variables = userDynamicVariablesForAi(user);
  const firstName = cleanString(user?.name).split(/\s+/)[0].toLocaleLowerCase("cs-CZ");
  const vocative = firstName === "miroslav"
    ? "Mirku"
    : cleanString(variables.user_first_name_friendly_vocative) || "řidiči";
  if (readiness.blockers.length) {
    return `Ahoj ${vocative}. Dnešní údaje se neshodují a trasu teď nemůžeme bezpečně zahájit. ${readiness.blockers[0].message}`.slice(0, 520);
  }
  const parts = [`Ahoj ${vocative}${crew.verified && crew.members.length ? ", ahoj posádko" : ""}.`];
  if (route.status === "active") {
    parts.push("Dnešní trasa je potvrzená.");
  } else {
    parts.push(route.assigned ? "Dnešní trasu mám načtenou." : "Dnešní trasu zatím nemám potvrzenou.");
  }
  if (route.title && route.totalCount) {
    parts.push(`${route.title}, ${stopCountText(route.totalCount)}.`);
  } else if (route.totalCount) {
    parts.push(`Čeká nás ${stopCountText(route.totalCount)}.`);
  }
  if (vehicle.assigned && vehicle.label) {
    parts.push(`Vozidlo ${vehicle.label} sedí s denní trasou.`);
  }
  if (weather?.verified && cleanString(weather.summary)) {
    parts.push(cleanString(weather.summary));
  } else {
    parts.push("Aktuální počasí se mi teď nepodařilo ověřit.");
  }
  if (memory?.previouslySpoken && cleanString(memory.summary)) {
    parts.push("Navážu i na naše předchozí pracovní témata.");
  }
  const riskyWeather = Array.isArray(weather?.hazards)
    && weather.hazards.some((hazard) => ["warning", "danger"].includes(cleanString(hazard?.severity)));
  parts.push("Můžeme vyrazit.");
  if (!riskyWeather && crew.verified && crew.members.length) {
    const lightLines = [
      "Jestli jsou svačiny na palubě, dnešek je připravený.",
      "Kafe může zůstat po ruce, trasu budu hlídat já.",
      "Dobrou náladu bereme s sebou, zbytek pohlídám."
    ];
    parts.push(lightLines[deterministicVariant(`${route.id}:${route.routeDate}`) % lightLines.length]);
  }
  parts.push("Budu hlídat trasu, zastávky a důležitá hlášení.");
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
      : safeLoad(
        () => currentSarlotaWeather(env, { location: weatherLocationForRoute(detail) }),
        { ok: false, verified: false, status: "unavailable" }
      ),
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
  const route = safeRoute(detail, user);
  const vehicles = safeVehicles(vehicleResult);
  const directory = sanitizeKaiserDirectoryForSarlota(users, availability);
  const crew = safeCrew(detail, directory);
  const vehicle = safeVehicleAssignment(route, vehicles);
  const schedule = safeSchedule(detail);
  const readiness = startReadiness({ user, route, vehicle, crew, weather, schedule, scope, date });
  return {
    actor: { id: cleanString(user.id), name: cleanString(user.name), role: cleanString(user.role) },
    scope,
    date,
    route,
    vehicle,
    crew,
    schedule,
    readiness,
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
    introAnnouncement: introAnnouncement(user, route, vehicle, crew, weather, memory, readiness),
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
