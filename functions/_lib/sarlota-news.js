const NEWS_FEED_URL = "https://www.irozhlas.cz/rss/irozhlas";
const NEWS_SOURCE = "iROZHLAS";
const NEWS_ITEM_LIMIT = 3;
const NEWS_TIMEOUT_MS = 1200;
const NEWS_CACHE_MS = 5 * 60 * 1000;
const NEWS_MAX_RESPONSE_BYTES = 512 * 1024;
const newsCache = new Map();

function cleanString(value) {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

function decodeXml(value) {
  return String(value || "")
    .replace(/^\s*<!\[CDATA\[([\s\S]*?)\]\]>\s*$/i, "$1")
    .replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)))
    .replace(/&#x([0-9a-f]+);/gi, (_, code) => String.fromCodePoint(Number.parseInt(code, 16)))
    .replace(/&quot;/gi, "\"")
    .replace(/&apos;/gi, "'")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&amp;/gi, "&");
}

function tagValue(xml, tagName) {
  const match = String(xml || "").match(new RegExp(`<${tagName}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${tagName}>`, "i"));
  return match ? cleanString(decodeXml(match[1]).replace(/<[^>]+>/g, " ")) : "";
}

function safeArticleUrl(value) {
  try {
    const url = new URL(cleanString(value));
    if (url.protocol !== "https:" || url.hostname !== "www.irozhlas.cz" || url.username || url.password) {
      return "";
    }
    return url.toString();
  } catch {
    return "";
  }
}

function publishedAt(value) {
  const parsed = Date.parse(cleanString(value));
  return Number.isFinite(parsed) ? new Date(parsed).toISOString() : "";
}

export function parseIrozhlasRss(xml, limit = NEWS_ITEM_LIMIT) {
  const items = [];
  const itemPattern = /<item(?:\s[^>]*)?>([\s\S]*?)<\/item>/gi;
  const maxItems = Math.max(0, Math.min(NEWS_ITEM_LIMIT, Number(limit) || NEWS_ITEM_LIMIT));
  let match;

  while (items.length < maxItems && (match = itemPattern.exec(String(xml || "")))) {
    const title = tagValue(match[1], "title").slice(0, 280);
    const url = safeArticleUrl(tagValue(match[1], "link"));
    if (!title || !url) {
      continue;
    }
    items.push({
      title,
      url,
      publishedAt: publishedAt(tagValue(match[1], "pubDate"))
    });
  }

  return items;
}

async function fetchWithTimeout(fetchImpl, timeoutMs) {
  const controller = typeof AbortController !== "undefined" ? new AbortController() : null;
  const timeout = controller ? setTimeout(() => controller.abort(), timeoutMs) : null;
  try {
    return await fetchImpl(NEWS_FEED_URL, {
      method: "GET",
      headers: {
        Accept: "application/rss+xml, application/xml;q=0.9, text/xml;q=0.8",
        "User-Agent": "Kaiser-Smart-Odpady-Sarlota/1.0"
      },
      redirect: "error",
      ...(controller ? { signal: controller.signal } : {})
    });
  } finally {
    if (timeout) clearTimeout(timeout);
  }
}

function unavailableNews(fetchedAt, status = "unavailable") {
  return {
    ok: false,
    status,
    source: NEWS_SOURCE,
    sourceUrl: NEWS_FEED_URL,
    fetchedAt,
    items: [],
    message: "Aktuální přehled zpráv iROZHLAS se teď nepodařilo bezpečně načíst."
  };
}

export async function currentSarlotaNews(options = {}) {
  const now = typeof options.now === "function" ? options.now() : new Date();
  const nowMs = now instanceof Date ? now.getTime() : Number(now);
  const fetchedAt = new Date(Number.isFinite(nowMs) ? nowMs : Date.now()).toISOString();
  const cached = newsCache.get(NEWS_FEED_URL);
  if (cached && (Number.isFinite(nowMs) ? nowMs : Date.now()) - cached.cachedAt < NEWS_CACHE_MS) {
    return cached.value;
  }

  const fetchImpl = options.fetchImpl || globalThis.fetch;
  if (typeof fetchImpl !== "function") {
    return unavailableNews(fetchedAt);
  }

  try {
    const response = await fetchWithTimeout(fetchImpl, Number(options.timeoutMs) || NEWS_TIMEOUT_MS);
    const responseUrl = safeArticleUrl(response?.url || NEWS_FEED_URL);
    const contentType = cleanString(response?.headers?.get?.("content-type")).toLowerCase();
    const contentLength = Number(response?.headers?.get?.("content-length") || 0);
    if (!response?.ok || !responseUrl || !/(rss|xml)/.test(contentType)) {
      return unavailableNews(fetchedAt, "invalid_response");
    }
    if (Number.isFinite(contentLength) && contentLength > NEWS_MAX_RESPONSE_BYTES) {
      return unavailableNews(fetchedAt, "response_too_large");
    }

    const xml = await response.text();
    if (new TextEncoder().encode(xml).byteLength > NEWS_MAX_RESPONSE_BYTES) {
      return unavailableNews(fetchedAt, "response_too_large");
    }
    const items = parseIrozhlasRss(xml);
    if (!items.length) {
      return unavailableNews(fetchedAt, "empty_feed");
    }

    const news = {
      ok: true,
      status: "ready",
      source: NEWS_SOURCE,
      sourceUrl: NEWS_FEED_URL,
      fetchedAt,
      items,
      message: "Nejvýše tři aktuální titulky z oficiálního RSS iROZHLAS."
    };
    newsCache.set(NEWS_FEED_URL, { cachedAt: Number.isFinite(nowMs) ? nowMs : Date.now(), value: news });
    return news;
  } catch (error) {
    if (cleanString(error?.name).toLowerCase() !== "aborterror") {
      console.error("sarlota_news.fetch_failed", { message: cleanString(error?.message || error?.name) });
    }
    return unavailableNews(fetchedAt);
  }
}

export const __test = {
  NEWS_FEED_URL,
  NEWS_SOURCE,
  NEWS_ITEM_LIMIT,
  NEWS_TIMEOUT_MS,
  NEWS_CACHE_MS,
  NEWS_MAX_RESPONSE_BYTES,
  clearCache() {
    newsCache.clear();
  }
};
