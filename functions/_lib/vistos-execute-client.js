import { exactJsonParse } from './vistos-values.js';
const VISTOS_NOT_CONFIGURED_MESSAGE = "Vistos API není nakonfigurováno";
const VISTOS_EXECUTE_API_SUFFIX = "/API/VistosAPI";
const DEFAULT_PAGE_SIZE = 1000;
const DEFAULT_MAX_PAGES = 20;

export class VistosExecuteError extends Error {
  constructor(message, status = 400, code = "vistos_execute_error", details = {}) {
    super(message);
    this.name = "VistosExecuteError";
    this.status = status;
    this.code = code;
    this.upstreamStatus = Number(details.upstreamStatus) || 0;
    this.upstreamApiStatus = cleanVistosValue(details.upstreamApiStatus);
  }
}

export function cleanVistosValue(value) {
  return String(value ?? "").trim();
}

function numericValue(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function randomId(prefix) {
  const suffix = globalThis.crypto?.randomUUID
    ? globalThis.crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2)}`;

  return `${prefix}-${suffix}`;
}

function vistosExecuteApiBase(env) {
  const rawBase = cleanVistosValue(env?.VISTOS_API_BASE_URL);
  if (!rawBase) {
    return "";
  }

  try {
    const url = new URL(rawBase);
    url.hash = "";
    url.search = "";
    let pathname = url.pathname.replace(/\/+$/, "");
    if (!pathname.toLowerCase().endsWith(VISTOS_EXECUTE_API_SUFFIX.toLowerCase())) {
      pathname = `${pathname}${VISTOS_EXECUTE_API_SUFFIX}`;
    }
    url.pathname = pathname;
    return url.toString().replace(/\/+$/, "");
  } catch {
    const withoutHash = rawBase.split("#")[0].split("?")[0].replace(/\/+$/, "");
    return withoutHash.toLowerCase().endsWith(VISTOS_EXECUTE_API_SUFFIX.toLowerCase())
      ? withoutHash
      : `${withoutHash}${VISTOS_EXECUTE_API_SUFFIX}`;
  }
}

export function isVistosExecuteConfigured(env) {
  return Boolean(
    vistosExecuteApiBase(env) &&
    cleanVistosValue(env?.VISTOS_API_USERNAME) &&
    cleanVistosValue(env?.VISTOS_API_PASSWORD)
  );
}

function executeEnvelope(methodName, payload) {
  return {
    [methodName]: payload,
    RequestGuid: randomId("vistos-request").replace(/^vistos-request-/, ""),
    RequestDatetime: new Date().toISOString(),
    Version: "3.0",
    Device: "Browser",
    Culture: "cs-CZ"
  };
}

function parseCookieHeader(headers) {
  const setCookie = cleanVistosValue(headers.get("set-cookie"));
  const cookies = [];
  const cookiePattern = /(Vistos(?:Access|Refresh)Token[^=;,\s]*)=([^;,]+)/g;
  let match = cookiePattern.exec(setCookie);

  while (match) {
    cookies.push(`${match[1]}=${match[2]}`);
    match = cookiePattern.exec(setCookie);
  }

  return cookies.join("; ");
}

export function extractVistosRows(payload) {
  if (Array.isArray(payload)) {
    return payload.filter((row) => row && typeof row === "object");
  }
  if (!payload || typeof payload !== "object") {
    return [];
  }

  if (Array.isArray(payload.data?.data)) {
    return payload.data.data.filter((row) => row && typeof row === "object");
  }

  const directKeys = ["rows", "data", "items", "value", "result", "contracts", "services", "records"];
  for (const key of directKeys) {
    if (Array.isArray(payload[key])) {
      return payload[key].filter((row) => row && typeof row === "object");
    }
  }

  const nested = [];
  for (const value of Object.values(payload)) {
    if (Array.isArray(value)) {
      nested.push(...value.filter((row) => row && typeof row === "object"));
    }
  }
  return nested;
}

export function extractVistosRecord(payload) {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    return {};
  }

  const nestedData = payload.data;
  if (nestedData && typeof nestedData === "object" && !Array.isArray(nestedData)) {
    if (nestedData.data && typeof nestedData.data === "object" && !Array.isArray(nestedData.data)) {
      return nestedData.data;
    }
    if (!Array.isArray(nestedData.data)) {
      return nestedData;
    }
  }

  for (const key of ["record", "item", "value", "result"]) {
    const value = payload[key];
    if (value && typeof value === "object" && !Array.isArray(value)) {
      return value;
    }
  }

  return {};
}

function vistosValueKind(value) {
  if (Array.isArray(value)) return "array";
  if (value === null) return "null";
  return typeof value === "object" ? "object" : typeof value;
}

function collectVistosKeyPaths(value, path = "", depth = 0, paths = []) {
  if (depth > 4 || paths.length >= 180 || !value || typeof value !== "object") {
    return paths;
  }
  if (Array.isArray(value)) {
    if (path) paths.push(`${path}[]`);
    if (value[0] && typeof value[0] === "object") {
      collectVistosKeyPaths(value[0], path ? `${path}[]` : "[]", depth + 1, paths);
    }
    return paths;
  }

  for (const key of Object.keys(value).sort((left, right) => left.localeCompare(right, "cs")).slice(0, 90)) {
    const nextPath = path ? `${path}.${key}` : key;
    paths.push(nextPath);
    collectVistosKeyPaths(value[key], nextPath, depth + 1, paths);
    if (paths.length >= 180) break;
  }
  return paths;
}

function matchesRequestedColumn(rowKey, columnName) {
  return rowKey === columnName || rowKey.startsWith(`${columnName}_`) || rowKey.startsWith(`${columnName}.`);
}

export function vistosRecordDiagnostics(payload, row = {}, requestedColumns = []) {
  const rowKeys = Object.keys(row || {}).sort((left, right) => left.localeCompare(right, "cs"));
  const requested = Array.from(new Set(requestedColumns.map(cleanVistosValue).filter(Boolean)));
  return {
    responseKind: vistosValueKind(payload),
    responseKeyPaths: collectVistosKeyPaths(payload).slice(0, 180),
    extractedRowKind: vistosValueKind(row),
    extractedRowKeys: rowKeys.slice(0, 180),
    requestedColumnMatches: requested.filter((columnName) => rowKeys.some((rowKey) => matchesRequestedColumn(rowKey, columnName))),
    requestedColumnCount: requested.length
  };
}

function recordsTotal(payload) {
  const data = payload?.data;
  return {
    total: numericValue(data?.recordsTotal),
    filtered: numericValue(data?.recordsFiltered)
  };
}

function explicitlyReportedCount(value) {
  return (typeof value === "number" && Number.isInteger(value) && value >= 0)
    || (typeof value === "string" && /^\d+$/.test(value.trim()));
}

export async function fetchVistosExecute(env, methodName, payload, cookieHeader = "") {
  const apiBase = vistosExecuteApiBase(env);
  if (!apiBase) {
    throw new VistosExecuteError(VISTOS_NOT_CONFIGURED_MESSAGE, 503, "vistos_api_not_configured");
  }

  // All users of the shared connector consume the same server-side budget when configured.
  const budget = Number(env?.VISTOS_SHARED_REQUESTS_PER_MINUTE);
  if (Number.isSafeInteger(budget) && budget > 0) {
    if (!env.DB_CORE) throw new VistosExecuteError('Chybí koordinace požadavků.',503,'vistos_budget_storage_missing');
    const bucket = new Date().toISOString().slice(0,16);
    const resource = new URL(apiBase).origin;
    const result = await env.DB_CORE.prepare(`INSERT INTO vistos_request_budget(resource,bucket,requests) VALUES(?,?,1)
      ON CONFLICT(resource) DO UPDATE SET bucket=excluded.bucket,requests=CASE WHEN bucket=excluded.bucket THEN requests+1 ELSE 1 END
      WHERE bucket<>excluded.bucket OR requests<?`).bind(resource,bucket,budget).run();
    if (!result.meta?.changes) throw new VistosExecuteError('Dosažen sdílený limit požadavků.',429,'vistos_request_budget_exhausted');
  } else if (env?.VISTOS_REQUIRE_SHARED_BUDGET === true) {
    throw new VistosExecuteError('Sdílená kapacita nebyla ověřena.',503,'vistos_request_budget_unverified');
  }
  const controller = typeof AbortController === "function" ? new AbortController() : null;
  if (env?.syncRequestDeadline && Date.now() >= env.syncRequestDeadline) {
    throw new VistosExecuteError("Vypršel čas běhu synchronizace.", 503, "writer_deadline_exceeded");
  }
  const timeoutMs = Math.max(1, Math.min(
    Math.max(5000, Math.min(Number(env?.VISTOS_API_TIMEOUT_MS) || 20000, 45000)),
    (env?.syncRequestDeadline || Infinity) - Date.now()));
  const timeout = controller ? setTimeout(() => controller.abort(), timeoutMs) : null;

  try {
    const headers = {
      Accept: "application/json",
      "Content-Type": "application/json"
    };

    if (cookieHeader) {
      headers.Cookie = cookieHeader;
    }

    const response = await fetch(`${apiBase}/Execute?${methodName}`, {
      method: "POST",
      headers,
      body: JSON.stringify(executeEnvelope(methodName, payload)),
      signal: controller?.signal
    });
    const text = await response.text();
    let body = {};

    try {
      body = text ? (env.VISTOS_EXACT_DECIMALS === true ? exactJsonParse(text) : JSON.parse(text)) : {};
    } catch {
      throw new VistosExecuteError("Vistos API nevrátilo validní JSON.", 502, "vistos_api_invalid_json");
    }

    if (response.status !== 200 || body?.status !== "OK") {
      const upstreamApiStatus = cleanVistosValue(body?.status);
      const permissionDenied = response.status === 401
        || response.status === 403
        || response.status === 215
        || /(?:^|\b)215(?:\b|$)|unauthorized/i.test(upstreamApiStatus);
      throw new VistosExecuteError(
        permissionDenied
          ? "Vistos API odmítlo přístup pro read-only preview."
          : "Vistos API požadavek se nepodařil.",
        502,
        "vistos_api_execute_failed",
        { upstreamStatus: response.status, upstreamApiStatus }
      );
    }

    return {
      status: response.status,
      body,
      setCookies: typeof response.headers.getSetCookie === 'function' ? response.headers.getSetCookie() : (response.headers.get('set-cookie') || '').split(/,(?=\s*[^;,=\s]+=)/),
      cookieHeader: parseCookieHeader(response.headers)
    };
  } catch (error) {
    if (error instanceof VistosExecuteError) {
      throw error;
    }

    throw new VistosExecuteError(
      error?.name === "AbortError"
        ? "Vistos API překročilo časový limit."
        : "Vistos API se nepodařilo načíst.",
      502,
      "vistos_api_unavailable"
    );
  } finally {
    if (timeout) {
      clearTimeout(timeout);
    }
  }
}

export async function loginVistosExecute(env) {
  if (!isVistosExecuteConfigured(env)) {
    throw new VistosExecuteError(VISTOS_NOT_CONFIGURED_MESSAGE, 503, "vistos_api_not_configured");
  }

  const login = await fetchVistosExecute(env, "LoginParam", {
    UserName: cleanVistosValue(env.VISTOS_API_USERNAME),
    Password: cleanVistosValue(env.VISTOS_API_PASSWORD)
  });

  if (!login.cookieHeader) {
    throw new VistosExecuteError(
      "Vistos API login nevrátil bezpečnou session cookie.",
      502,
      "vistos_api_session_missing"
    );
  }

  return {
    cookieHeader: login.cookieHeader,
    cookies: updateVistosCookies([], login.setCookies, `${vistosExecuteApiBase(env)}/Execute`)
  };
}

function updateVistosCookies(previous, lines, requestUrl) {
  const url = new URL(requestUrl), cookies = [...previous];
  for (const line of lines || []) {
    const [pair, ...attrs] = line.split(';').map(v => v.trim());
    const at = pair.indexOf('='); if (at < 1) continue;
    const name = pair.slice(0, at), value = pair.slice(at + 1);
    const options = Object.fromEntries(attrs.map(a => { const i=a.indexOf('='); return [a.slice(0,i<0?undefined:i).toLowerCase(),i<0?true:a.slice(i+1)]; }));
    const domain = String(options.domain || url.hostname).replace(/^\./,'').toLowerCase();
    if (url.hostname !== domain && !url.hostname.endsWith('.'+domain)) continue;
    const path = typeof options.path === 'string' ? options.path : url.pathname.slice(0,url.pathname.lastIndexOf('/')+1);
    const expires = options['max-age'] !== undefined ? Date.now()+Number(options['max-age'])*1000 : options.expires ? Date.parse(options.expires) : Infinity;
    const existing=cookies.findIndex(c=>c.name===name && c.domain===domain && c.path===path);
    if(existing>=0) cookies.splice(existing,1);
    if (value && expires>Date.now()) cookies.push({name,value,domain,path,hostOnly:!options.domain,secure:Boolean(options.secure),expires});
  }
  return cookies;
}
export async function executeVistosSession(env, session, methodName, payload, {readOnly=true}={}) {
  const url=new URL(`${vistosExecuteApiBase(env)}/Execute`);
  const send=async(name,data)=>{
    const cookies=session.cookies ? session.cookies.filter(c=>c.expires>Date.now() && (c.hostOnly?url.hostname===c.domain:url.hostname===c.domain||url.hostname.endsWith('.'+c.domain))
      && (url.pathname===c.path || url.pathname.startsWith(c.path.endsWith('/')?c.path:c.path+'/')) && (!c.secure||url.protocol==='https:')).map(c=>`${c.name}=${c.value}`).join('; ') : session.cookieHeader;
    const result=await fetchVistosExecute(env,name,data,cookies);
    if (session.cookies) session.cookies=updateVistosCookies(session.cookies,result.setCookies,url.href);
    else if(result.cookieHeader) session.cookieHeader=result.cookieHeader;
    return result;
  };
  try { return await send(methodName,payload); }
  catch(error) {
    // Write retry is intentionally stricter: no re-send even after an auth error.
    if (!readOnly || error.upstreamStatus!==214 || error.upstreamApiStatus!=='Unauthenticated') throw error;
    if (!session.refreshPromise) session.refreshPromise=send('RefreshAuthTokenParam',{}).finally(()=>{session.refreshPromise=null;});
    await session.refreshPromise;
    return send(methodName,payload);
  }
}

export function vistosPageSortOrder(order) {
  if (order == null) return undefined;
  const parts = typeof order === 'string' ? /^([A-Za-z][A-Za-z0-9_]*) (asc|desc)$/i.exec(order) : null;
  const normalized = parts ? [{ColumnName: parts[1], Direction: parts[2].toLowerCase()}] : order;
  if (!Array.isArray(normalized) || normalized.length !== 1 || !/^[A-Za-z][A-Za-z0-9_]*$/.test(normalized[0]?.ColumnName || '')
      || !['asc', 'desc'].includes(normalized[0]?.Direction)) throw new TypeError('vistos_invalid_sort_order');
  return normalized.map(({ColumnName, Direction}) => ({ColumnName, Direction}));
}

export async function getVistosPage(env, session, entityName, columns, filter = null, start = 0, length = DEFAULT_PAGE_SIZE, options = {}) {
  const request = {
    EntityName: entityName,
    Start: start,
    Length: length,
    Columns: columns.map((column) => ({ ColumnName: column, Status: 1 }))
  };

  if (filter && Object.keys(filter).length) {
    request.Filter = filter;
  }
  if (options.order) request.SortOrder = vistosPageSortOrder(options.order);

  const result = await executeVistosSession(env, session, "GetPageParam", request);
  const rows = extractVistosRows(result.body);
  return {
    rows,
    countEvidence: {
      totalReported: explicitlyReportedCount(result.body?.data?.recordsTotal),
      filteredReported: explicitlyReportedCount(result.body?.data?.recordsFiltered)
    },
    ...recordsTotal(result.body)
  };
}

export async function getVistosSchemaEntity(env, session, entityName) {
  const result = await executeVistosSession(env, session, "GetSchemaEntity", {
    EntityName: cleanVistosValue(entityName)
  });
  return result.body;
}

export async function getVistosById(env, session, entityName, entityId, columns = []) {
  const numericId = Number(entityId);
  const requestedColumns = Array.from(new Set(columns.map(cleanVistosValue).filter(Boolean)));
  const result = await executeVistosSession(env, session, "GetByIdParam", {
    EntityName: cleanVistosValue(entityName),
    EntityId: Number.isFinite(numericId) ? numericId : entityId,
    MethodMode: "HeaderColumns",
    ColNameToRead: requestedColumns
  });
  const row = extractVistosRecord(result.body);

  return {
    row,
    status: result.status,
    diagnostics: vistosRecordDiagnostics(result.body, row, requestedColumns)
  };
}

export async function getAllVistosPages(env, session, entityName, columns, filter = null, options = {}) {
  const pageSize = Math.max(1, Math.min(Number(options.pageSize) || DEFAULT_PAGE_SIZE, DEFAULT_PAGE_SIZE));
  const maxPages = Math.max(1, Math.min(Number(options.maxPages) || DEFAULT_MAX_PAGES, 100));
  const rows = [];
  let total = 0;
  let filtered = 0;

  for (let page = 0; page < maxPages; page += 1) {
    const start = page * pageSize;
    const result = await getVistosPage(env, session, entityName, columns, filter, start, pageSize);
    rows.push(...result.rows);
    total = result.total;
    filtered = result.filtered;

    if (result.rows.length < pageSize || (filtered && rows.length >= filtered)) {
      break;
    }
  }

  return {
    rows,
    total,
    filtered,
    capped: Boolean(filtered && rows.length < filtered)
  };
}
