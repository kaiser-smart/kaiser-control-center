const DEFAULT_TARGET_URL = "https://kaiser-control-center.pages.dev/api/collection-routes/vistos/svoz-kaiser-watchdog/run";
const DEFAULT_TIME_ZONE = "Europe/Prague";
const DEFAULT_ACTIVE_START = "04:30";
const DEFAULT_ACTIVE_END = "16:00";
const DEFAULT_ACTIVE_INTERVAL_MINUTES = 15;
const DEFAULT_OFF_HOURS_INTERVAL_MINUTES = 120;

function cleanString(value) {
  return String(value ?? "").trim();
}

function numericValue(value, fallback) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function parseClockMinutes(value, fallback) {
  const match = cleanString(value).match(/^(\d{1,2}):(\d{2})$/);
  if (!match) {
    return fallback;
  }
  const hours = Math.max(0, Math.min(Number(match[1]) || 0, 23));
  const minutes = Math.max(0, Math.min(Number(match[2]) || 0, 59));
  return hours * 60 + minutes;
}

function datePartsInTimeZone(date, timeZone) {
  const formatter = new Intl.DateTimeFormat("en-GB", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23"
  });
  const parts = Object.fromEntries(formatter.formatToParts(date).map((part) => [part.type, part.value]));
  return {
    year: Number(parts.year),
    month: Number(parts.month),
    day: Number(parts.day),
    hour: Number(parts.hour),
    minute: Number(parts.minute),
    second: Number(parts.second)
  };
}

function shouldRunWatchdog(date, env) {
  const timeZone = cleanString(env.COLLECTION_ROUTES_WATCHDOG_TIME_ZONE) || DEFAULT_TIME_ZONE;
  const activeStart = parseClockMinutes(env.COLLECTION_ROUTES_WATCHDOG_ACTIVE_START, parseClockMinutes(DEFAULT_ACTIVE_START, 270));
  const activeEnd = parseClockMinutes(env.COLLECTION_ROUTES_WATCHDOG_ACTIVE_END, parseClockMinutes(DEFAULT_ACTIVE_END, 960));
  const activeInterval = Math.max(1, numericValue(env.COLLECTION_ROUTES_WATCHDOG_ACTIVE_INTERVAL_MINUTES, DEFAULT_ACTIVE_INTERVAL_MINUTES));
  const offHoursInterval = Math.max(activeInterval, numericValue(env.COLLECTION_ROUTES_WATCHDOG_OFF_HOURS_INTERVAL_MINUTES, DEFAULT_OFF_HOURS_INTERVAL_MINUTES));
  const parts = datePartsInTimeZone(date, timeZone);
  const minutesOfDay = parts.hour * 60 + parts.minute;
  const isActiveWindow = minutesOfDay >= activeStart && minutesOfDay < activeEnd;
  const interval = isActiveWindow ? activeInterval : offHoursInterval;
  const shouldRun = minutesOfDay % interval === 0;

  return {
    shouldRun,
    scheduleMode: isActiveWindow ? "working-hours-15m" : "off-hours-2h",
    timeZone,
    localHour: parts.hour,
    localMinute: parts.minute,
    activeStart,
    activeEnd,
    interval
  };
}

async function runWatchdog(controller, env) {
  const scheduledAtDate = new Date(controller.scheduledTime || Date.now());
  const decision = shouldRunWatchdog(scheduledAtDate, env);

  if (!decision.shouldRun) {
    console.log("collection_routes_watchdog.skipped", {
      scheduledAt: scheduledAtDate.toISOString(),
      scheduleMode: decision.scheduleMode,
      localHour: decision.localHour,
      localMinute: decision.localMinute,
      interval: decision.interval
    });
    return {
      status: "skipped",
      scheduledAt: scheduledAtDate.toISOString(),
      decision
    };
  }

  const secret = cleanString(env.COLLECTION_ROUTES_WATCHDOG_SECRET);
  if (!secret) {
    throw new Error("COLLECTION_ROUTES_WATCHDOG_SECRET není nastavený pro collection routes watchdog runner.");
  }

  const targetUrl = cleanString(env.COLLECTION_ROUTES_WATCHDOG_TARGET_URL) || DEFAULT_TARGET_URL;
  const response = await fetch(targetUrl, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${secret}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      triggeredBy: "cloudflare-cron",
      runner: "collection-routes-watchdog-runner",
      scheduledAt: scheduledAtDate.toISOString(),
      cron: controller.cron || "*/15 * * * *",
      scheduleMode: decision.scheduleMode
    })
  });
  const payload = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(payload.error || `Hlídač vrátil HTTP ${response.status}.`);
  }

  console.log("collection_routes_watchdog.completed", {
    scheduledAt: scheduledAtDate.toISOString(),
    scheduleMode: decision.scheduleMode,
    snapshotId: payload.snapshot?.id || "",
    errorCount: payload.watchdog?.summary?.errorCount || 0,
    siteErrorCount: payload.watchdog?.summary?.siteErrorCount || 0,
    apiStatus: payload.apiStatus || "ready",
    createsOperationalRoutes: false,
    sendsEmailOrSms: false
  });

  return {
    status: "completed",
    scheduledAt: scheduledAtDate.toISOString(),
    decision,
    snapshot: payload.snapshot || null,
    apiStatus: payload.apiStatus || "ready"
  };
}

export default {
  async scheduled(controller, env, ctx) {
    ctx.waitUntil(runWatchdog(controller, env));
  },

  async fetch() {
    return Response.json({
      status: "ready",
      mode: "read-only",
      schedule: "15 minut v provozu, 2 hodiny mimo provoz",
      manualRun: "disabled",
      createsOperationalRoutes: false,
      sendsEmailOrSms: false,
      message: "Cloud runner pouze spouští read-only hlídač Vistos Svoz Kaiser a ukládá snapshot přes chráněný Pages endpoint."
    });
  }
};
